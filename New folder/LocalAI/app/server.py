"""
Elliot AI: a local, Claude-style app on top of Ollama.

Chats and Projects with history, image understanding, file/PDF reading, live
artifact previews (HTML, React, SVG, Mermaid), memory, thinking, research mode,
an agent mode that can read/write files, run commands and search the web
(asking permission first, like Claude Code), plus image and video generation
with Google Gemini (Nano Banana / Veo) or a local Stable Diffusion server.

Python standard library only. Run:  python server.py   then open http://localhost:8765
"""

import base64
import html
import io
import json
import mimetypes
import os
import re
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

OLLAMA = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
GEMINI = os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta").rstrip("/")
PORT = int(os.getenv("PORT", 8765))
APP_DIR = Path(__file__).resolve().parent
DATA = Path(os.getenv("ELLIOT_AI_DATA", APP_DIR / "data"))
CHATS = DATA / "chats"
PROJECTS = DATA / "projects"
MEDIA = DATA / "media"
SETTINGS_FILE = DATA / "settings.json"
for d in (CHATS, PROJECTS, MEDIA):
    d.mkdir(parents=True, exist_ok=True)

DEFAULT_SETTINGS = {
    "name": "Elliot",
    "instructions": "",
    "workspace": str(Path.home() / "ElliotAI-Workspace"),
    "auto_approve": False,
    "default_model": "",
    "memory": [],
    "google_api_key": os.getenv("GOOGLE_API_KEY", ""),
    "image_provider": "gemini",              # "gemini" or "local"
    "image_model": "gemini-3.1-flash-image",  # Nano Banana 2; "gemini-3-pro-image" = Nano Banana Pro
    "video_model": "veo-3.1-generate-preview",
    "local_image_url": "http://127.0.0.1:7860",  # AUTOMATIC1111 / Forge / SD.Next with --api
}
SECRET_KEYS = {"google_api_key"}

MAX_TOOL_ROUNDS = 30
NEEDS_APPROVAL = {"write_file", "edit_file", "run_command", "generate_video"}

_lock = threading.Lock()
_approvals = {}   # approval id -> {"event": Event, "allow": bool}
_stops = {}       # chat id -> Event
_caps = {}        # model name -> capabilities list


# ── Storage ──────────────────────────────────────────────────────────────

def load_settings():
    try:
        return {**DEFAULT_SETTINGS, **json.loads(SETTINGS_FILE.read_text("utf-8"))}
    except (OSError, ValueError):
        return dict(DEFAULT_SETTINGS)


def save_settings(s):
    with _lock:
        SETTINGS_FILE.write_text(json.dumps(s, indent=2), "utf-8")


def public_settings():
    s = load_settings()
    for k in SECRET_KEYS:
        s[k] = ("••••" + s[k][-4:]) if s[k] else ""
    return s


def check_id(i):
    if not re.fullmatch(r"[a-f0-9]{32}", i or ""):
        raise ValueError("bad id")
    return i


def load_json(folder, i):
    return json.loads((folder / f"{check_id(i)}.json").read_text("utf-8"))


def save_json(folder, obj):
    obj["updated"] = time.time()
    with _lock:
        (folder / f"{check_id(obj['id'])}.json").write_text(json.dumps(obj), "utf-8")


def list_json(folder, fields):
    out = []
    for p in folder.glob("*.json"):
        try:
            c = json.loads(p.read_text("utf-8"))
            out.append({k: c.get(k) for k in fields})
        except (OSError, ValueError):
            pass
    return sorted(out, key=lambda c: -(c.get("updated") or 0))


def save_media(data, ext):
    name = f"{datetime.now():%Y%m%d-%H%M%S}-{uuid.uuid4().hex[:6]}.{ext}"
    (MEDIA / name).write_bytes(data)
    # Also drop a copy in the workspace so the agent (and you) can use it in projects
    try:
        out = workspace() / "generated"
        out.mkdir(exist_ok=True)
        (out / name).write_bytes(data)
    except OSError:
        pass
    return f"/media/{name}"


# ── Ollama ───────────────────────────────────────────────────────────────

def http_json(url, body=None, headers=None, timeout=600, method=None):
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json", **(headers or {})},
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")
        try:
            detail = json.loads(detail)["error"]["message"]
        except (ValueError, KeyError, TypeError):
            pass
        raise RuntimeError(f"{e.code}: {detail[:500]}") from None


def ollama(path, body=None, stream=False, timeout=600):
    if not stream:
        return http_json(OLLAMA + path, body, timeout=timeout)
    req = urllib.request.Request(OLLAMA + path, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    return urllib.request.urlopen(req, timeout=timeout)


def model_caps(name):
    if name not in _caps:
        try:
            _caps[name] = ollama("/api/show", {"model": name}, timeout=30).get("capabilities", ["completion"])
        except Exception:
            return ["completion"]
    return _caps[name]


def list_models():
    models = ollama("/api/tags", timeout=10).get("models", [])
    return [{"name": m["name"], "size": m.get("size", 0), "caps": model_caps(m["name"])} for m in models]


# ── Image & video generation ─────────────────────────────────────────────

def sniff_mime(b64):
    for prefix, mime in (("iVBOR", "image/png"), ("/9j/", "image/jpeg"), ("UklGR", "image/webp"), ("R0lG", "image/gif")):
        if b64.startswith(prefix):
            return mime
    return "image/png"


def gemini_key():
    key = load_settings()["google_api_key"]
    if not key:
        raise RuntimeError("Add your free Google AI Studio key in Settings (https://aistudio.google.com/apikey) "
                           "to generate images and videos with Gemini.")
    return key


def gemini_image(prompt, images=(), aspect_ratio="", size=""):
    s = load_settings()
    parts = [{"text": prompt}] + [{"inlineData": {"mimeType": sniff_mime(b), "data": b}} for b in images]
    config = {"responseModalities": ["TEXT", "IMAGE"]}
    image_config = {k: v for k, v in (("aspectRatio", aspect_ratio), ("imageSize", size)) if v}
    if image_config:
        config["imageConfig"] = image_config
    r = http_json(f"{GEMINI}/models/{s['image_model']}:generateContent",
                  {"contents": [{"role": "user", "parts": parts}], "generationConfig": config},
                  headers={"x-goog-api-key": gemini_key()}, timeout=300)
    urls, notes = [], []
    for c in r.get("candidates", []):
        for p in (c.get("content") or {}).get("parts", []):
            data = p.get("inlineData") or p.get("inline_data")
            if data:
                ext = (mimetypes.guess_extension(data.get("mimeType", "image/png")) or ".png").lstrip(".")
                urls.append(save_media(base64.b64decode(data["data"]), ext))
            elif p.get("text") and not p.get("thought"):
                notes.append(p["text"])
    if not urls:
        reason = (r.get("promptFeedback") or {}).get("blockReason") or " ".join(notes) or "no image returned"
        raise RuntimeError(f"Gemini didn't make an image: {reason}")
    return urls, " ".join(notes).strip()


def local_image(prompt, images=(), aspect_ratio=""):
    base = load_settings()["local_image_url"].rstrip("/")
    w, h = {"16:9": (1344, 768), "9:16": (768, 1344), "4:3": (1152, 896), "3:4": (896, 1152),
            "3:2": (1216, 832), "2:3": (832, 1216)}.get(aspect_ratio, (1024, 1024))
    body = {"prompt": prompt, "steps": 25, "width": w, "height": h, "cfg_scale": 6}
    if images:
        body.update(init_images=[images[0]], denoising_strength=0.6)
    try:
        r = http_json(f"{base}/sdapi/v1/{'img2img' if images else 'txt2img'}", body, timeout=900)
    except urllib.error.URLError:
        raise RuntimeError(f"No local image server at {base}. Start Stable Diffusion Forge/AUTOMATIC1111 with --api, "
                           "or switch the image provider to Gemini in Settings.") from None
    return [save_media(base64.b64decode(b), "png") for b in r.get("images", [])], ""


def generate_image(prompt, images=(), aspect_ratio="", size=""):
    if load_settings()["image_provider"] == "local":
        return local_image(prompt, images, aspect_ratio)
    return gemini_image(prompt, images, aspect_ratio, size)


def generate_video(prompt, image=None, aspect_ratio="16:9", progress=lambda msg: None):
    s, key = load_settings(), gemini_key()
    instance = {"prompt": prompt}
    if image:
        instance["image"] = {"bytesBase64Encoded": image, "mimeType": sniff_mime(image)}
    op = http_json(f"{GEMINI}/models/{s['video_model']}:predictLongRunning",
                   {"instances": [instance], "parameters": {"aspectRatio": aspect_ratio or "16:9"}},
                   headers={"x-goog-api-key": key}, timeout=120)
    started = time.time()
    while not op.get("done"):
        if time.time() - started > 900:
            raise RuntimeError("Video generation timed out after 15 minutes.")
        progress(f"Rendering video… {int(time.time() - started)}s")
        time.sleep(8)
        op = http_json(f"{GEMINI}/{op['name']}", headers={"x-goog-api-key": key}, timeout=60)
    if op.get("error"):
        raise RuntimeError(op["error"].get("message", "video generation failed"))
    resp = (op.get("response") or {}).get("generateVideoResponse") or {}
    samples = resp.get("generatedSamples") or []
    if not samples:
        raise RuntimeError("Veo returned no video: " + ", ".join(resp.get("raiMediaFilteredReasons") or ["unknown reason"]))
    video = samples[0].get("video", {})
    if video.get("encodedVideo"):
        data = base64.b64decode(video["encodedVideo"])
    else:
        req = urllib.request.Request(video["uri"], headers={"x-goog-api-key": key})
        with urllib.request.urlopen(req, timeout=300) as r:
            data = r.read()
    return save_media(data, "mp4")


# ── Tools ────────────────────────────────────────────────────────────────

TOOLS = [
    {"name": "list_files", "description": "List files and folders in the workspace (recursive, up to 300 entries).",
     "params": {"path": "Folder relative to the workspace, default '.'"}, "required": []},
    {"name": "read_file", "description": "Read a text file from the workspace.",
     "params": {"path": "File path relative to the workspace"}, "required": ["path"]},
    {"name": "write_file", "description": "Create or overwrite a file in the workspace with the given content.",
     "params": {"path": "File path relative to the workspace", "content": "Full file content"}, "required": ["path", "content"]},
    {"name": "edit_file", "description": "Replace an exact snippet of text in a workspace file. old_text must appear exactly once.",
     "params": {"path": "File path", "old_text": "Exact text to find", "new_text": "Replacement text"}, "required": ["path", "old_text", "new_text"]},
    {"name": "run_command", "description": "Run a shell command in the workspace folder (run code, analyse data, install packages, git). Returns output.",
     "params": {"command": "The shell command"}, "required": ["command"]},
    {"name": "web_search", "description": "Search the web (needs internet). Returns titles, links and snippets.",
     "params": {"query": "Search query"}, "required": ["query"]},
    {"name": "fetch_url", "description": "Download a web page and return its readable text (needs internet).",
     "params": {"url": "Full URL"}, "required": ["url"]},
    {"name": "generate_image", "description": "Create a new image from a detailed text description, or edit the image the user attached "
     "(set edit_attached to 'yes'). Write a rich prompt: subject, style, lighting, composition, colours, any text to render.",
     "params": {"prompt": "Detailed image description or edit instruction",
                "aspect_ratio": "One of 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 21:9 (default 1:1)",
                "edit_attached": "'yes' to edit/use the user's most recently attached image"}, "required": ["prompt"]},
    {"name": "generate_video", "description": "Create a short video clip (about 8 seconds, with sound) from a text description, "
     "optionally animating the user's attached image (set from_attached to 'yes'). Slow and paid, so only when asked.",
     "params": {"prompt": "Detailed description of the scene, motion, camera and sound",
                "aspect_ratio": "16:9 or 9:16", "from_attached": "'yes' to animate the attached image"}, "required": ["prompt"]},
    {"name": "remember", "description": "Save a lasting fact about the user or their preferences to long-term memory.",
     "params": {"fact": "The fact to remember"}, "required": ["fact"]},
]

OLLAMA_TOOLS = [{
    "type": "function",
    "function": {
        "name": t["name"],
        "description": t["description"],
        "parameters": {
            "type": "object",
            "properties": {k: {"type": "string", "description": v} for k, v in t["params"].items()},
            "required": t["required"],
        },
    },
} for t in TOOLS]


def workspace():
    ws = Path(load_settings()["workspace"]).expanduser()
    ws.mkdir(parents=True, exist_ok=True)
    return ws.resolve()


def safe_path(rel):
    ws = workspace()
    p = (ws / (rel or ".")).resolve()
    if p != ws and ws not in p.parents:
        raise ValueError(f"'{rel}' is outside the workspace")
    return p


def clip(text, n=12000):
    return text if len(text) <= n else text[:n] + f"\n… [truncated, {len(text) - n} more characters]"


def strip_html(page):
    page = re.sub(r"(?is)<(script|style|noscript|svg).*?</\1>", " ", page)
    page = re.sub(r"(?s)<[^>]+>", " ", page)
    return re.sub(r"\s+", " ", html.unescape(page)).strip()


def http_get(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (ElliotAI)"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(3_000_000).decode(r.headers.get_content_charset() or "utf-8", "replace")


def last_image(chat):
    """Most recent image in the chat: one the user attached, or one we generated."""
    for m in reversed(chat["messages"]):
        if m.get("images"):
            return m["images"][-1]
        found = re.findall(r"/media/([\w.-]+\.(?:png|jpe?g|webp))", m.get("content", ""))
        if found and (MEDIA / found[-1]).is_file():
            return base64.b64encode((MEDIA / found[-1]).read_bytes()).decode()
    return None


def run_tool(name, args, chat=None, progress=lambda msg: None):
    a = args or {}
    if name == "list_files":
        root = safe_path(a.get("path", "."))
        items = []
        for p in sorted(root.rglob("*")):
            if any(part in {".git", "node_modules", "__pycache__", ".venv"} for part in p.parts):
                continue
            items.append(str(p.relative_to(root)) + ("/" if p.is_dir() else ""))
            if len(items) >= 300:
                items.append("…")
                break
        return "\n".join(items) or "(empty)"
    if name == "read_file":
        return clip(safe_path(a["path"]).read_text("utf-8", "replace"), 30000)
    if name == "write_file":
        p = safe_path(a["path"])
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(a.get("content", ""), "utf-8")
        return f"Wrote {len(a.get('content', ''))} characters to {a['path']}"
    if name == "edit_file":
        p = safe_path(a["path"])
        text = p.read_text("utf-8")
        n = text.count(a["old_text"])
        if n != 1:
            return f"Error: old_text found {n} times; it must appear exactly once."
        p.write_text(text.replace(a["old_text"], a.get("new_text", "")), "utf-8")
        return f"Edited {a['path']}"
    if name == "run_command":
        r = subprocess.run(a["command"], shell=True, cwd=workspace(), capture_output=True,
                           text=True, timeout=180, encoding="utf-8", errors="replace")
        return clip(f"exit code {r.returncode}\n{r.stdout}{r.stderr}")
    if name == "web_search":
        page = http_get("https://html.duckduckgo.com/html/?q=" + urllib.parse.quote(a["query"]))
        results = []
        for m in re.finditer(r'(?s)class="result__a" href="([^"]+)"[^>]*>(.*?)</a>.*?class="result__snippet"[^>]*>(.*?)</a>', page):
            link = m.group(1)
            q = urllib.parse.parse_qs(urllib.parse.urlparse(link).query).get("uddg")
            results.append(f"{strip_html(m.group(2))}\n{q[0] if q else link}\n{strip_html(m.group(3))}")
            if len(results) == 8:
                break
        return "\n\n".join(results) or "No results."
    if name == "fetch_url":
        return clip(strip_html(http_get(a["url"])), 15000)
    if name == "generate_image":
        img = last_image(chat) if chat and str(a.get("edit_attached", "")).lower().startswith("y") else None
        urls, note = generate_image(a["prompt"], [img] if img else [], a.get("aspect_ratio", ""))
        return "Image created and already shown to the user: " + " ".join(f"![image]({u})" for u in urls) + (f"\n{note}" if note else "")
    if name == "generate_video":
        img = last_image(chat) if chat and str(a.get("from_attached", "")).lower().startswith("y") else None
        url = generate_video(a["prompt"], img, a.get("aspect_ratio", "16:9"), progress)
        return f"Video created and already shown to the user: ![video]({url})"
    if name == "remember":
        s = load_settings()
        s["memory"].append(a["fact"])
        save_settings(s)
        return "Saved to memory."
    return f"Unknown tool {name}"


# ── Documents ────────────────────────────────────────────────────────────

def extract_text(name, data):
    if name.lower().endswith(".pdf"):
        try:
            from pypdf import PdfReader
        except ImportError:
            return "[PDF support needs: pip install pypdf]"
        return "\n\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(data)).pages)
    if name.lower().endswith((".docx", ".pptx", ".xlsx")):
        import zipfile
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            xml = "".join(z.read(n).decode("utf-8", "replace") for n in sorted(z.namelist())
                          if re.match(r"(word/document|ppt/slides/slide\d+|xl/sharedStrings)\.xml$", n))
        return strip_html(re.sub(r"</(w:p|a:p|si)>", "\n", xml))
    return data.decode("utf-8", "replace")


# ── The conversation loop ────────────────────────────────────────────────

def system_prompt(tools_on, chat, research=False):
    s = load_settings()
    parts = [
        f"You are {s['name']} AI, a helpful, capable assistant running privately on the user's own computer.",
        f"Today is {datetime.now():%A, %B %d, %Y}.",
        "Format answers in Markdown. When you write a web page, React component, SVG, Mermaid diagram or long "
        "document the user may want to view, put it in ONE complete fenced code block (```html, ```jsx, ```svg, "
        "```mermaid, ```markdown) so it opens as a live preview. React components must `export default` the main "
        "component, may import from 'react' and can use Tailwind classes.",
    ]
    if tools_on:
        parts.append(
            f"You can use tools. The workspace folder is {workspace()}. To build software, write real files with "
            "write_file, then run and test them with run_command, and fix any errors you see. Use web_search for "
            "current information and cite sources. Use generate_image when the user wants a picture, logo, design or "
            "photo (or to edit an attached image), and generate_video when they ask for a video. Use remember when the "
            "user tells you something worth keeping long-term. Do not ask for permission; the app asks the user for you.")
    if research:
        parts.append(
            "RESEARCH MODE: investigate thoroughly before answering. Run at least 5 different web_search queries from "
            "different angles, fetch_url the most relevant 3-6 sources, and cross-check facts. Then write a structured "
            "report with headings, a short summary first, numbered citations like [1] in the text, and a Sources list "
            "with the URLs at the end.")
    if s["memory"]:
        parts.append("Things you remember about the user:\n" + "\n".join(f"- {m}" for m in s["memory"]))
    if s["instructions"].strip():
        parts.append("The user's custom instructions:\n" + s["instructions"].strip())
    if chat.get("project_id"):
        try:
            proj = load_json(PROJECTS, chat["project_id"])
            parts.append(f"This chat is part of the project \"{proj['name']}\".")
            if proj.get("instructions", "").strip():
                parts.append("Project instructions:\n" + proj["instructions"].strip())
            budget = 60000
            for f in proj.get("files", []):
                text = clip(f["text"], min(budget, 30000))
                budget -= len(text)
                parts.append(f"<project_file name=\"{f['name']}\">\n{text}\n</project_file>")
                if budget <= 0:
                    break
        except (OSError, ValueError):
            pass
    return "\n\n".join(parts)


def to_ollama(messages):
    out = []
    for m in messages:
        if m.get("error"):
            continue
        msg = {"role": m["role"], "content": m.get("content", "")}
        for k in ("images", "tool_calls", "tool_name"):
            if m.get(k):
                msg[k] = m[k]
        out.append(msg)
    return out


def converse(chat, model, tools_on, think, research, emit):
    caps = model_caps(model)
    tools_on = (tools_on or research) and "tools" in caps
    stop = _stops.setdefault(chat["id"], threading.Event())
    stop.clear()

    for _ in range(MAX_TOOL_ROUNDS):
        body = {
            "model": model,
            "messages": [{"role": "system", "content": system_prompt(tools_on, chat, research)}] + to_ollama(chat["messages"]),
            "stream": True,
        }
        if tools_on:
            body["tools"] = OLLAMA_TOOLS
        if "thinking" in caps:
            body["think"] = bool(think or research)

        msg = {"role": "assistant", "content": "", "model": model}
        thinking, calls = "", []
        with ollama("/api/chat", body, stream=True) as resp:
            for line in resp:
                if stop.is_set():
                    break
                if not line.strip():
                    continue
                j = json.loads(line)
                if j.get("error"):
                    raise RuntimeError(j["error"])
                m = j.get("message", {})
                if m.get("thinking"):
                    thinking += m["thinking"]
                    emit({"type": "thinking", "delta": m["thinking"]})
                if m.get("content"):
                    msg["content"] += m["content"]
                    emit({"type": "text", "delta": m["content"]})
                calls += m.get("tool_calls") or []
        if thinking:
            msg["thinking"] = thinking
        if calls:
            msg["tool_calls"] = calls
        chat["messages"].append(msg)
        save_json(CHATS, chat)

        if not calls or stop.is_set():
            return

        for call in calls:
            fn = call.get("function", {})
            name, args = fn.get("name", ""), fn.get("arguments") or {}
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except ValueError:
                    args = {}
            cid = uuid.uuid4().hex
            emit({"type": "tool_call", "id": cid, "name": name, "args": args})

            allowed = True
            if name in NEEDS_APPROVAL and not load_settings()["auto_approve"]:
                ev = threading.Event()
                _approvals[cid] = {"event": ev, "allow": False}
                emit({"type": "approval", "id": cid})
                while not ev.wait(0.5):
                    if stop.is_set():
                        break
                allowed = _approvals.pop(cid)["allow"]

            if not allowed:
                output = "The user denied this action. Ask them what they would like instead."
            else:
                try:
                    output = run_tool(name, args, chat, lambda s: emit({"type": "status", "id": cid, "text": s}))
                except Exception as e:
                    output = f"Error: {e}"
            emit({"type": "tool_result", "id": cid, "output": output})
            chat["messages"].append({"role": "tool", "tool_name": name, "content": output})
            save_json(CHATS, chat)
            if stop.is_set():
                return


# ── HTTP ─────────────────────────────────────────────────────────────────

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send_bytes(self, data, ctype, code=200):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def send_json(self, obj, code=200):
        self.send_bytes(json.dumps(obj).encode(), "application/json", code)

    def guard(self):
        """Only answer our own page: blocks other websites (CSRF) and DNS-rebinding tricks."""
        host = (self.headers.get("Host") or "").split(":")[0]
        origin = self.headers.get("Origin")
        ok_host = host in ("localhost", "127.0.0.1")
        ok_origin = origin is None or origin in (f"http://localhost:{PORT}", f"http://127.0.0.1:{PORT}")
        ok_type = self.command == "GET" or self.command == "DELETE" or \
            (self.headers.get("Content-Type") or "").startswith("application/json")
        if ok_host and ok_origin and ok_type:
            return True
        self.send_json({"error": "forbidden"}, 403)
        return False

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def do_GET(self):
        if not self.guard():
            return
        url = urllib.parse.urlparse(self.path)
        try:
            if url.path in ("/", "/index.html"):
                self.send_bytes((APP_DIR / "index.html").read_bytes(), "text/html; charset=utf-8")
            elif url.path.startswith("/media/"):
                name = Path(urllib.parse.unquote(url.path[7:])).name
                p = MEDIA / name
                if not p.is_file():
                    return self.send_json({"error": "not found"}, 404)
                self.send_bytes(p.read_bytes(), mimetypes.guess_type(name)[0] or "application/octet-stream")
            elif url.path == "/api/models":
                self.send_json(list_models())
            elif url.path == "/api/chats":
                self.send_json(list_json(CHATS, ("id", "title", "updated", "project_id")))
            elif url.path.startswith("/api/chats/"):
                self.send_json(load_json(CHATS, url.path.rsplit("/", 1)[1]))
            elif url.path == "/api/projects":
                self.send_json(list_json(PROJECTS, ("id", "name", "updated")))
            elif url.path.startswith("/api/projects/"):
                self.send_json(load_json(PROJECTS, url.path.rsplit("/", 1)[1]))
            elif url.path == "/api/settings":
                self.send_json(public_settings())
            else:
                self.send_json({"error": "not found"}, 404)
        except urllib.error.URLError:
            self.send_json({"error": f"Can't reach Ollama at {OLLAMA}. Is it running?"}, 502)
        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def do_DELETE(self):
        if not self.guard():
            return
        try:
            kind, i = self.path.strip("/").split("/")[1:3]
            folder = {"chats": CHATS, "projects": PROJECTS}[kind]
            (folder / f"{check_id(i)}.json").unlink(missing_ok=True)
            if kind == "projects":  # keep the chats, just detach them
                for c in list_json(CHATS, ("id", "project_id")):
                    if c["project_id"] == i:
                        chat = load_json(CHATS, c["id"])
                        chat.pop("project_id", None)
                        save_json(CHATS, chat)
            self.send_json({"ok": True})
        except Exception as e:
            self.send_json({"error": str(e)}, 400)

    def do_POST(self):
        if not self.guard():
            return
        path = urllib.parse.urlparse(self.path).path
        try:
            b = self.body()
            if path == "/api/chat":
                return self.stream(b, self.run_chat)
            if path == "/api/generate":
                return self.stream(b, self.run_generate)
            if path == "/api/approve":
                if b.get("id") in _approvals:
                    _approvals[b["id"]]["allow"] = bool(b.get("allow"))
                    _approvals[b["id"]]["event"].set()
                if b.get("always"):
                    s = load_settings()
                    s["auto_approve"] = True
                    save_settings(s)
                return self.send_json({"ok": True})
            if path == "/api/stop":
                _stops.setdefault(b.get("chat_id"), threading.Event()).set()
                return self.send_json({"ok": True})
            if path == "/api/settings":
                s = load_settings()
                for k, v in b.items():
                    if k in DEFAULT_SETTINGS and not (k in SECRET_KEYS and str(v).startswith("••••")):
                        s[k] = v
                save_settings(s)
                return self.send_json(public_settings())
            if path == "/api/projects":
                proj = load_json(PROJECTS, b["id"]) if b.get("id") else {"id": uuid.uuid4().hex, "files": []}
                proj.update({k: b[k] for k in ("name", "instructions", "files") if k in b})
                proj["name"] = (proj.get("name") or "Untitled project")[:80]
                save_json(PROJECTS, proj)
                return self.send_json(proj)
            if path.startswith("/api/chats/") and path.endswith("/rename"):
                chat = load_json(CHATS, path.split("/")[3])
                chat["title"] = b.get("title", chat["title"])[:100]
                save_json(CHATS, chat)
                return self.send_json({"ok": True})
            if path == "/api/extract":
                return self.send_json({"text": clip(extract_text(b["name"], base64.b64decode(b["data"])), 100000)})
            if path == "/api/save":
                p = safe_path(b["path"])
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(b["content"], "utf-8")
                return self.send_json({"path": str(p)})
            self.send_json({"error": "not found"}, 404)
        except Exception as e:
            self.send_json({"error": str(e)}, 400)

    # Streaming endpoints share the chat bookkeeping and NDJSON event stream
    def stream(self, b, worker):
        if b.get("chat_id"):
            chat = load_json(CHATS, b["chat_id"])
        else:
            text = (b.get("message") or {}).get("content", "").strip() or "Image"
            chat = {"id": uuid.uuid4().hex, "title": text[:60], "created": time.time(), "messages": []}
            if b.get("project_id"):
                chat["project_id"] = check_id(b["project_id"])

        if b.get("edit_index") is not None:   # editing an earlier message drops everything after it
            del chat["messages"][int(b["edit_index"]):]
        if b.get("retry"):
            while chat["messages"] and chat["messages"][-1]["role"] != "user":
                chat["messages"].pop()
        m = b.get("message")
        if m:
            content = m.get("content", "")
            for f in m.get("files", []):
                content += f"\n\n<file name=\"{f['name']}\">\n{f['text']}\n</file>"
            user = {"role": "user", "content": content, "display": m.get("content", ""),
                    "files": [f["name"] for f in m.get("files", [])], "file_data": m.get("files", [])}
            if m.get("images"):
                user["images"] = m["images"]
            chat["messages"].append(user)
        save_json(CHATS, chat)

        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()

        def emit(ev):
            self.wfile.write((json.dumps(ev) + "\n").encode())
            self.wfile.flush()

        try:
            emit({"type": "chat", "id": chat["id"], "title": chat["title"]})
            worker(chat, b, emit)
            emit({"type": "done"})
        except (BrokenPipeError, ConnectionResetError):
            _stops.setdefault(chat["id"], threading.Event()).set()
        except Exception as e:
            msg = (f"Connection problem: {e.reason}. Is Ollama running?" if isinstance(e, urllib.error.URLError)
                   else str(e))
            chat["messages"].append({"role": "assistant", "content": "", "error": msg,
                                     "model": "generator" if b.get("kind") else b.get("model")})
            save_json(CHATS, chat)
            emit({"type": "error", "message": msg})

    def run_chat(self, chat, b, emit):
        converse(chat, b["model"], b.get("tools", False), b.get("think", False), b.get("research", False), emit)

    def run_generate(self, chat, b, emit):
        """Image/Video mode: straight to the generator, no chat model in between."""
        user = next(m for m in reversed(chat["messages"]) if m["role"] == "user")
        prompt = user.get("display") or user["content"]
        images = user.get("images") or []
        previous = None if images else last_image(chat)
        if previous and b.get("kind") == "image" and load_settings()["image_provider"] == "gemini":
            images = [previous]
            prompt += ("\n\n(The image provided is the previous result in this conversation. If this request is a "
                       "change to it, edit it; if it asks for something new, create a fresh image.)")
        aspect = b.get("aspect_ratio", "")
        if b.get("kind") == "video":
            if not images and previous and re.search(r"\banimate|\bthis\b|\bit\b", prompt, re.I):
                images = [previous]   # "animate it" → bring the last image to life
            url = generate_video(prompt, images[0] if images else None, aspect or "16:9",
                                 lambda s: emit({"type": "status", "text": s}))
            content = f"![video]({url})"
        else:
            emit({"type": "status", "text": "Creating image…"})
            urls, note = generate_image(prompt, images, aspect, b.get("size", ""))
            content = " ".join(f"![image]({u})" for u in urls) + (f"\n\n{note}" if note else "")
        msg = {"role": "assistant", "content": content, "model": "generator"}
        chat["messages"].append(msg)
        save_json(CHATS, chat)
        emit({"type": "text", "delta": content})


def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://localhost:{PORT}"
    print(f"Elliot AI running at {url}  (Ollama: {OLLAMA})  Ctrl+C to quit")
    if "--no-browser" not in sys.argv:
        threading.Timer(1, webbrowser.open, [url]).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
