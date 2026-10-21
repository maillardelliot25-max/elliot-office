"""
Elliot AI: a local, offline Claude-style app on top of Ollama.

Chats with history, image understanding, file/PDF reading, live artifact
previews, memory, thinking, and an agent mode that can read/write files,
run commands and search the web (asking permission first, like Claude Code).

Python standard library only. Run:  python server.py   then open http://localhost:8765
"""

import base64
import html
import io
import json
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
PORT = int(os.getenv("PORT", 8765))
APP_DIR = Path(__file__).resolve().parent
DATA = Path(os.getenv("ELLIOT_AI_DATA", APP_DIR / "data"))
CHATS = DATA / "chats"
SETTINGS_FILE = DATA / "settings.json"
CHATS.mkdir(parents=True, exist_ok=True)

DEFAULT_SETTINGS = {
    "name": "Elliot",
    "instructions": "",
    "workspace": str(Path.home() / "ElliotAI-Workspace"),
    "auto_approve": False,
    "default_model": "",
    "memory": [],
}

MAX_TOOL_ROUNDS = 25
NEEDS_APPROVAL = {"write_file", "edit_file", "run_command"}

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


def chat_path(cid):
    if not re.fullmatch(r"[a-f0-9]{32}", cid or ""):
        raise ValueError("bad chat id")
    return CHATS / f"{cid}.json"


def load_chat(cid):
    return json.loads(chat_path(cid).read_text("utf-8"))


def save_chat(chat):
    chat["updated"] = time.time()
    with _lock:
        chat_path(chat["id"]).write_text(json.dumps(chat), "utf-8")


def list_chats():
    out = []
    for p in CHATS.glob("*.json"):
        try:
            c = json.loads(p.read_text("utf-8"))
            out.append({"id": c["id"], "title": c.get("title", "Untitled"), "updated": c.get("updated", 0)})
        except (OSError, ValueError, KeyError):
            pass
    return sorted(out, key=lambda c: -c["updated"])


# ── Ollama ───────────────────────────────────────────────────────────────

def ollama(path, body=None, stream=False, timeout=600):
    req = urllib.request.Request(
        OLLAMA + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json"},
    )
    resp = urllib.request.urlopen(req, timeout=timeout)
    if stream:
        return resp
    with resp:
        return json.loads(resp.read())


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
    {"name": "run_command", "description": "Run a shell command in the workspace folder (e.g. run code, install packages, git). Returns output.",
     "params": {"command": "The shell command"}, "required": ["command"]},
    {"name": "web_search", "description": "Search the web (needs internet). Returns titles, links and snippets.",
     "params": {"query": "Search query"}, "required": ["query"]},
    {"name": "fetch_url", "description": "Download a web page and return its readable text (needs internet).",
     "params": {"url": "Full URL"}, "required": ["url"]},
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


def run_tool(name, args):
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
    if name.lower().endswith(".docx"):
        import zipfile
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            xml = z.read("word/document.xml").decode("utf-8", "replace")
        return strip_html(xml.replace("</w:p>", "\n</w:p>"))
    return data.decode("utf-8", "replace")


# ── The conversation loop ────────────────────────────────────────────────

def system_prompt(tools_on):
    s = load_settings()
    parts = [
        f"You are {s['name']} AI, a helpful, capable assistant running privately and offline on the user's own computer.",
        f"Today is {datetime.now():%A, %B %d, %Y}.",
        "Format answers in Markdown. When you write a web page, app, SVG or document the user may want to "
        "view, put it in ONE complete fenced code block (```html, ```svg, etc.) so it opens as a live preview.",
    ]
    if tools_on:
        parts.append(
            f"You can use tools. The workspace folder is {workspace()}. To build software, write real files with "
            "write_file, then run and test them with run_command, and fix any errors you see. Use web_search for "
            "current information. Use remember when the user tells you something worth keeping long-term. "
            "Do not ask for permission; the app asks the user for you.")
    if s["memory"]:
        parts.append("Things you remember about the user:\n" + "\n".join(f"- {m}" for m in s["memory"]))
    if s["instructions"].strip():
        parts.append("The user's custom instructions:\n" + s["instructions"].strip())
    return "\n\n".join(parts)


def to_ollama(messages):
    out = []
    for m in messages:
        msg = {"role": m["role"], "content": m.get("content", "")}
        for k in ("images", "tool_calls", "tool_name"):
            if m.get(k):
                msg[k] = m[k]
        out.append(msg)
    return out


def converse(chat, model, tools_on, think, emit):
    caps = model_caps(model)
    tools_on = tools_on and "tools" in caps
    stop = _stops.setdefault(chat["id"], threading.Event())
    stop.clear()

    for _ in range(MAX_TOOL_ROUNDS):
        body = {
            "model": model,
            "messages": [{"role": "system", "content": system_prompt(tools_on)}] + to_ollama(chat["messages"]),
            "stream": True,
        }
        if tools_on:
            body["tools"] = OLLAMA_TOOLS
        if "thinking" in caps:
            body["think"] = bool(think)

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
        save_chat(chat)

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
                    output = run_tool(name, args)
                except Exception as e:
                    output = f"Error: {e}"
            emit({"type": "tool_result", "id": cid, "output": output})
            chat["messages"].append({"role": "tool", "tool_name": name, "content": output})
            save_chat(chat)
            if stop.is_set():
                return


# ── HTTP ─────────────────────────────────────────────────────────────────

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send_json(self, obj, code=200):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        try:
            if url.path in ("/", "/index.html"):
                data = (APP_DIR / "index.html").read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            elif url.path == "/api/models":
                self.send_json(list_models())
            elif url.path == "/api/chats":
                self.send_json(list_chats())
            elif url.path.startswith("/api/chats/"):
                self.send_json(load_chat(url.path.rsplit("/", 1)[1]))
            elif url.path == "/api/settings":
                self.send_json(load_settings())
            else:
                self.send_json({"error": "not found"}, 404)
        except urllib.error.URLError:
            self.send_json({"error": f"Can't reach Ollama at {OLLAMA}. Is it running?"}, 502)
        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def do_DELETE(self):
        try:
            chat_path(self.path.rsplit("/", 1)[1]).unlink(missing_ok=True)
            self.send_json({"ok": True})
        except Exception as e:
            self.send_json({"error": str(e)}, 400)

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        try:
            b = self.body()
            if path == "/api/chat":
                return self.stream_chat(b)
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
                s.update({k: v for k, v in b.items() if k in DEFAULT_SETTINGS})
                save_settings(s)
                return self.send_json(s)
            if path.startswith("/api/chats/") and path.endswith("/rename"):
                chat = load_chat(path.split("/")[3])
                chat["title"] = b.get("title", chat["title"])[:100]
                save_chat(chat)
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

    def stream_chat(self, b):
        if b.get("chat_id"):
            chat = load_chat(b["chat_id"])
        else:
            text = b.get("message", {}).get("content", "").strip() or "Image"
            chat = {"id": uuid.uuid4().hex, "title": text[:60], "created": time.time(), "messages": []}

        if b.get("retry"):
            while chat["messages"] and chat["messages"][-1]["role"] != "user":
                chat["messages"].pop()
        m = b.get("message")
        if m:
            content = m.get("content", "")
            for f in m.get("files", []):
                content += f"\n\n<file name=\"{f['name']}\">\n{f['text']}\n</file>"
            user = {"role": "user", "content": content, "display": m.get("content", ""),
                    "files": [f["name"] for f in m.get("files", [])]}
            if m.get("images"):
                user["images"] = m["images"]
            chat["messages"].append(user)
        save_chat(chat)

        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()

        def emit(ev):
            self.wfile.write((json.dumps(ev) + "\n").encode())
            self.wfile.flush()

        try:
            emit({"type": "chat", "id": chat["id"], "title": chat["title"]})
            converse(chat, b["model"], b.get("tools", False), b.get("think", False), emit)
            emit({"type": "done"})
        except (BrokenPipeError, ConnectionResetError):
            _stops.setdefault(chat["id"], threading.Event()).set()
        except urllib.error.URLError:
            emit({"type": "error", "message": f"Can't reach Ollama at {OLLAMA}. Is it running?"})
        except Exception as e:
            emit({"type": "error", "message": str(e)})


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
