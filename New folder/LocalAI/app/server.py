"""
Elliot AI: a local, Claude-style app on top of Ollama.

Chats and Projects with history, image understanding, file/PDF reading, live
artifact previews (HTML, React, SVG, Mermaid), memory, thinking, research and
math modes, an agent mode that can read/write files, run code and commands and
search the web (asking permission first, like Claude Code), an app builder,
a file organizer, and image/video generation with Google Gemini (Nano Banana /
Veo) or a local Stable Diffusion server.

The brain is a free local model by default, or Claude / ChatGPT / Gemini when
you add their API keys in Settings (see providers.py).

Run:  python server.py   then open http://localhost:8765
"""

import base64
import hmac
import html
import io
import json
import zipfile
import mimetypes
import os
import re
import socket
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
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import jarvis_link  # noqa: E402
import station_dashboard  # noqa: E402
import memory as memory_store  # noqa: E402

# Windows can map these to odd types in its registry; the browser needs the real ones for offline libraries
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("font/woff2", ".woff2")
import organizer  # noqa: E402
import providers  # noqa: E402

OLLAMA = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
GEMINI = os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta").rstrip("/")
PORT = int(os.getenv("PORT", 8765))
APP_DIR = Path(__file__).resolve().parent
DATA = Path(os.getenv("ELLIOT_AI_DATA", APP_DIR / "data"))
CHATS = DATA / "chats"
PROJECTS = DATA / "projects"
MEDIA = DATA / "media"
PLANS = DATA / "organize"
SETTINGS_FILE = DATA / "settings.json"
MEMORY = memory_store.Memory(DATA / "memory.json")
for d in (CHATS, PROJECTS, MEDIA, PLANS):
    d.mkdir(parents=True, exist_ok=True)

DEFAULT_SETTINGS = {
    "name": "Elliot",
    "assistant_name": "Friday",
    "auto_memory": True,      # learn what you like from every conversation
    "appearance": {},         # colours, fonts, background video… (edited in Settings → Edit appearance)
    "lens_swipe": True,       # Friday Lens: swipe up from the bottom of the screen to ask about it
    "lens_hotkey": "<ctrl>+<alt>+<space>",
    "lens_model": "auto",     # "auto" = best model you have that can see images
    "phone_access": False,    # let the Friday Android app (and phone browsers) on your Wi-Fi connect
    "offline_only": False,    # nothing leaves this PC: internet brains, web search and Gemini are switched off
    "brains": [],             # AI services you added: OpenRouter, Groq, LM Studio… (🧠 AI brains)
    "persona": "butler",      # "butler": a friendly digital servant who calls you "sir"; "standard": plain assistant
    "screen_memory": False,   # Friday Lens saves a screenshot when your screen changes, in 8-hour blocks
    "screen_every": 60,       # seconds between screen-memory checks
    "screen_keep_blocks": 3,  # how many 8-hour blocks to keep (3 = the last 24 hours)
    "screen_watch": False,    # Lens watches the screen and offers help (forms, errors, being stuck)
    "screen_watch_every": 20, # seconds between checks (only when the screen changed)
    "screen_watch_model": "auto",  # "auto" = an offline model that can see images, so nothing leaves the PC
    "instructions": "",
    "workspace": str(Path.home() / "ElliotAI-Workspace"),
    "auto_approve": False,
    "default_model": "",
    "memory": [],
    "google_api_key": os.getenv("GOOGLE_API_KEY", ""),
    "anthropic_api_key": os.getenv("ANTHROPIC_API_KEY", ""),
    "openai_api_key": os.getenv("OPENAI_API_KEY", ""),
    "math_model": "auto",     # "auto" = the strongest cloud model you have a key for
    "auto_python": False,     # run the Python calculator without asking each time
    "image_provider": "gemini",              # "gemini" or "local"
    "image_model": "gemini-3.1-flash-image",  # Nano Banana 2; "gemini-3-pro-image" = Nano Banana Pro
    "video_model": "veo-3.1-generate-preview",
    "local_image_url": "http://127.0.0.1:7860",  # AUTOMATIC1111 / Forge / SD.Next with --api
    "jarvis_link": True,      # use Jarvis (the home base on this PC) for screen history, PC files and its memory
    "jarvis_url": "http://localhost:8780",
    "jarvis_token": "",       # blank = read Jarvis/station_data/friday.token automatically
}
SECRET_KEYS = {"google_api_key", "anthropic_api_key", "openai_api_key", "jarvis_token"}

MAX_TOOL_ROUNDS = 30
NEEDS_APPROVAL = {"write_file", "edit_file", "run_command", "run_python", "generate_video"}

_lock = threading.Lock()
_approvals = {}   # approval id -> {"event": Event, "allow": bool}
_browser = {}     # browser action id -> {"event": Event, "output": str}  (answered by the Chrome extension)
_stops = {}       # chat id -> Event
_caps = {}        # model name -> capabilities list


# ── Storage ──────────────────────────────────────────────────────────────

def load_settings():
    try:
        s = {**DEFAULT_SETTINGS, **json.loads(SETTINGS_FILE.read_text("utf-8"))}
    except (OSError, ValueError):
        s = dict(DEFAULT_SETTINGS)
    if not s.get("renamed_friday"):   # the assistant used to be called Jarvis
        if s.get("assistant_name") in (None, "", "Jarvis"):
            s["assistant_name"] = "Friday"
        s["renamed_friday"] = True
        if SETTINGS_FILE.exists():
            save_settings(s)
    if not s.get("chrome_token") or s.get("memory"):
        # first run: make the Chrome pairing code; older versions kept memory here as plain strings
        MEMORY.migrate(s.get("memory"))
        s["memory"] = []
        s["chrome_token"] = s.get("chrome_token") or uuid.uuid4().hex[:12]
        save_settings(s)
    return s


def save_settings(s):
    with _lock:
        SETTINGS_FILE.write_text(json.dumps(s, indent=2), "utf-8")


def public_settings():
    s = load_settings()
    for k in SECRET_KEYS:
        s[k] = ("••••" + s[k][-4:]) if s[k] else ""
    s["brains"] = [mask_brain(b) for b in s.get("brains") or []]
    return s


def mask_brain(b):
    return {**b, "api_key": ("••••" + b["api_key"][-4:]) if b.get("api_key") else ""}


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


def save_media(data, ext, to_workspace=True):
    name = f"{datetime.now():%Y%m%d-%H%M%S}-{uuid.uuid4().hex[:6]}.{ext}"
    (MEDIA / name).write_bytes(data)
    if not to_workspace:
        return f"/media/{name}"
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
    if name.startswith("cloud:"):
        return providers.CLOUD_CAPS
    if name not in _caps:
        try:
            _caps[name] = ollama("/api/show", {"model": name}, timeout=30).get("capabilities", ["completion"])
        except Exception:
            return ["completion"]
    return _caps[name]


def list_models():
    notes = []
    try:
        local = []
        for m in ollama("/api/tags", timeout=10).get("models", []):
            caps = model_caps(m["name"])
            local.append({"name": m["name"], "label": m["name"], "provider": "ollama", "provider_label": "On this PC",
                          "caps": caps, "offline": True, "size": m.get("size", 0),
                          "summary": providers.describe(m["name"], caps, True)})
    except (urllib.error.URLError, OSError):
        local = []
        notes.append(f"Local models unavailable: can't reach Ollama at {OLLAMA}. Is it running?")
    cloud, cloud_notes = providers.cloud_models(load_settings())
    return {"models": local + cloud, "notes": notes + cloud_notes}


SCREENS = DATA / "screen_memory"


def screen_memory_stats():
    blocks = []
    for d in sorted(SCREENS.glob("*"), reverse=True) if SCREENS.is_dir() else []:
        files = list(d.glob("*.jpg"))
        blocks.append({"name": d.name, "count": len(files), "mb": round(sum(f.stat().st_size for f in files) / 1e6, 1)})
    return {"blocks": blocks, "total_mb": round(sum(b["mb"] for b in blocks), 1), "folder": str(SCREENS)}


def watch_model():
    """The model that watches the screen: your choice, else an offline one that can see images (private)."""
    choice = load_settings()["screen_watch_model"]
    if choice and choice != "auto":
        return choice
    return next((m["name"] for m in list_models()["models"] if m["offline"] and "vision" in m["caps"]), "")


def screen_check(image):
    """Look at a screenshot and decide whether to offer help right now."""
    s = load_settings()
    model = watch_model()
    if not model:
        return {"help": False, "error": "No offline model that can see images. Download qwen3-vl:8b in 🧠 AI brains, "
                                        "or pick a watching model in Settings."}
    sir = "Address them as \"sir\". " if s.get("persona") == "butler" else ""
    prompt = f"""You are {s['assistant_name']}, {s['name']}'s helpful digital assistant, glancing at their screen (with their permission).

Decide whether they would welcome help RIGHT NOW. Offer help only when you clearly see one of these:
- "form": they are filling in a form, application, sign-up, survey or document with empty fields
- "error": an error, warning or failure message is on screen
- "stuck": an obvious problem they seem stuck on (e.g. a failed install, a confusing settings page)
Do NOT offer help for normal reading, browsing, videos, music, games, chatting, writing or coding without a visible error.

If you offer help, write ONE short, friendly sentence to them saying what you noticed and offering to take care of it. {sir}

Reply with JSON only: {{"help": true or false, "kind": "form" | "error" | "stuck" | "none", "message": "..."}}"""
    reply = providers.complete(model, prompt, [image] if image else (), s)
    m = re.search(r"\{.*\}", reply or "", re.S)
    try:
        data = json.loads(m.group(0)) if m else {}
    except ValueError:
        data = {}
    helpful = data.get("help") is True and data.get("kind") in ("form", "error", "stuck")
    return {"help": helpful, "kind": data.get("kind", "none"), "message": str(data.get("message", ""))[:300], "model": model}


def autofill(b):
    """Fill a web form from what Friday remembers about you. Never invents ID/financial details."""
    s = load_settings()
    model = b.get("model") or "auto"
    if model == "auto":
        model = s["default_model"] or next((m["name"] for m in list_models()["models"]), "")
    if not model:
        raise ValueError("No AI brain is set up yet.")
    fields = b.get("fields") or []
    known = MEMORY.for_prompt(" ".join(f.get("label", "") for f in fields)) or "(nothing remembered yet)"
    prompt = f"""You fill in web forms for {s['name']}, using ONLY facts you know about them.

What you know about {s['name']}:
{known}
Their custom instructions: {s['instructions'] or '(none)'}

The page: {b.get('title', '')} ({b.get('url', '')})
The form fields (id, label, type, options for dropdowns):
{json.dumps(fields, ensure_ascii=False)[:12000]}

Rules:
- Fill a field only when what you know clearly answers it. Otherwise leave it out. Never guess or invent
  dates of birth, addresses, ID numbers, bank details or anything else personal.
- For dropdowns use one of the listed options exactly. For checkboxes/radio use "yes" only if clearly true.
- For open questions (e.g. "Tell us about yourself", "Why do you want to join?") you may write a short,
  natural answer in their voice, based on what you know.
- For a "signature" or "type your full name to sign" field, use their full name only if you know it.

Reply with JSON only: {{"values": {{"<field id>": "<value>"}}}}"""
    reply = providers.complete(model, prompt, (), s)
    m = re.search(r"\{.*\}", reply or "", re.S)
    try:
        values = json.loads(m.group(0)).get("values", {}) if m else {}
    except ValueError:
        values = {}
    return {"values": {str(k): v for k, v in values.items() if isinstance(v, (str, int, float, bool))}}


def brains_info():
    s = load_settings()
    try:
        tags = ollama("/api/tags", timeout=5).get("models", [])
        local = {"running": True, "models": [{"name": m["name"], "size": m.get("size", 0)} for m in tags]}
    except (urllib.error.URLError, OSError):
        local = {"running": False, "models": []}
    return {"brains": [mask_brain(b) for b in s["brains"]], "presets": providers.BRAIN_PRESETS, "ollama": local,
            "builtin": {"anthropic": bool(s["anthropic_api_key"]), "openai": bool(s["openai_api_key"]),
                        "google": bool(s["google_api_key"])}}


def add_brain(b):
    """Add any OpenAI-compatible AI service. Checks it works (by listing its models) before saving."""
    base = (b.get("base_url") or "").strip().rstrip("/")
    if not re.match(r"https?://", base):
        raise ValueError("Enter the service's API address, starting with http:// or https://")
    brain = {"id": "x-" + uuid.uuid4().hex[:8], "name": (b.get("name") or "My AI").strip()[:40], "base_url": base,
             "api_key": (b.get("api_key") or "").strip(), "vision": bool(b.get("vision")), "tools": b.get("tools", True) is not False,
             "offline": bool(b.get("offline")) or bool(re.match(r"https?://(localhost|127\.|192\.168\.|10\.)", base)),
             "models": [m.strip() for m in re.split(r"[,\n]", b.get("models") or "") if m.strip()]}
    s = load_settings()
    if not brain["models"]:
        try:
            brain["models"] = providers._list_custom({**s, "brains": [brain]}, brain)
        except Exception as e:
            raise ValueError(f"Couldn't connect to {brain['name']}: {providers.short_error(e)}. "
                             "Check the address and key, or type the model names yourself.")
        if not brain["models"]:
            raise ValueError(f"{brain['name']} has no models. Type the model names yourself.")
    s["brains"].append(brain)
    save_settings(s)
    return {"brain": mask_brain(brain), "models": len(brain["models"])}


def lens_model():
    """The model Friday Lens uses to look at your screen: your choice, else the best one that can see images."""
    choice = load_settings()["lens_model"]
    if choice and choice != "auto":
        return choice
    models = list_models()["models"]
    for provider in ("anthropic", "google", "openai", "ollama"):
        found = [m["name"] for m in models if m["provider"] == provider and "vision" in m["caps"]]
        if found:
            return found[0]
    return ""


def math_model(fallback):
    choice = load_settings()["math_model"]
    if choice and choice != "auto":
        return choice
    cloud, _ = providers.cloud_models(load_settings())
    for provider in ("openai", "anthropic", "google"):   # ChatGPT's reasoning models first, as asked
        found = [m["name"] for m in cloud if m["provider"] == provider]
        if found:
            return found[0]
    return fallback


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


INTERNET_TOOLS = {"web_search", "fetch_url", "generate_video"}


def offline_only_block(what):
    if load_settings().get("offline_only"):
        raise RuntimeError(f"Offline only is on, so {what} (it needs the internet) is switched off. "
                           "Turn Offline only off in Settings to use it.")


def generate_image(prompt, images=(), aspect_ratio="", size=""):
    if load_settings()["image_provider"] == "local":
        return local_image(prompt, images, aspect_ratio)
    offline_only_block("Gemini image generation")
    return gemini_image(prompt, images, aspect_ratio, size)


def generate_video(prompt, image=None, aspect_ratio="16:9", progress=lambda msg: None):
    offline_only_block("video generation")
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
    {"name": "run_python", "description": "Run Python 3 code and return what it prints. Use it for exact maths, "
     "statistics, unit conversions, data analysis of workspace files and charts (save charts with matplotlib to a "
     "PNG file in the workspace). sympy/numpy may be installed; print() the results you need.",
     "params": {"code": "Complete Python program"}, "required": ["code"]},
    {"name": "preview_app", "description": "Open a web app you built in the workspace in the user's live preview panel. "
     "Call it after writing the app's files.",
     "params": {"path": "The app's folder or its HTML entry file, relative to the workspace (e.g. apps/todo)"}, "required": ["path"]},
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
    {"name": "remember", "description": "Save a lasting fact about the user (something they like, dislike, prefer, their "
     "people, work, projects or goals) to long-term memory. Use it whenever they share one, or say 'remember…'.",
     "params": {"fact": "The fact, as one short sentence about the user",
                "category": "One of: " + ", ".join(memory_store.CATEGORIES)}, "required": ["fact"]},
    {"name": "forget", "description": "Delete something from long-term memory when the user asks you to forget it or it is wrong.",
     "params": {"fact": "What to forget"}, "required": ["fact"]},
    {"name": "recall", "description": "Search long-term memory and all past conversations, e.g. 'what did we decide about "
     "the logo last week', 'that recipe I liked'.",
     "params": {"query": "Keywords to look for"}, "required": ["query"]},
]

TOOL_SCHEMAS = {t["name"]: t for t in TOOLS + jarvis_link.TOOLS}


def valid_args(name, args):
    t = TOOL_SCHEMAS.get(name) or next((b for b in BROWSER_TOOLS if b["name"] == name), None)
    return bool(t) and isinstance(args, dict) and "__invalid__" not in args and \
        all(isinstance(args.get(k), str) for k in t["required"])


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


def run_tool(name, args, chat=None, progress=lambda msg: None, model=""):
    a = args or {}
    if name in INTERNET_TOOLS:
        offline_only_block(name.replace("_", " "))
    if name in ("pc_screen_history", "pc_files", "pc_status"):
        progress("Asking Jarvis…")
        return jarvis_link.run(name, a, load_settings(), lambda img: describe_screenshot(img, model))
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
    if name == "run_python":
        script = workspace() / ".elliot" / "run.py"
        script.parent.mkdir(exist_ok=True)
        script.write_text(a["code"], "utf-8")
        r = subprocess.run([sys.executable, str(script)], cwd=workspace(), capture_output=True,
                           text=True, timeout=180, encoding="utf-8", errors="replace")
        out = (r.stdout + r.stderr).strip() or "(no output: print() what you need)"
        images = [p for p in workspace().glob("*.png") if p.stat().st_mtime > time.time() - 200]
        shown = " ".join(f"![chart]({save_media(p.read_bytes(), 'png')})" for p in images[:4])
        return clip(f"exit code {r.returncode}\n{out}") + (f"\nCharts shown to the user: {shown}" if shown else "")
    if name == "preview_app":
        p = safe_path(a["path"])
        if p.is_dir():
            p = next((p / n for n in ("index.html", "dist/index.html", "public/index.html") if (p / n).is_file()), p)
        if not p.is_file() or p.suffix.lower() not in (".html", ".htm"):
            return f"Error: no index.html found at {a['path']}. Write the app's index.html first."
        rel = p.relative_to(workspace()).as_posix()
        return f"App is open in the preview panel: [Open app](/ws/{urllib.parse.quote(rel)})"
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
        entry = MEMORY.add(a["fact"], a.get("category", "Other"), "chat")
        return "Saved to memory." if entry else "Already known (or not something to store)."
    if name == "forget":
        hit = MEMORY.forget(a["fact"])
        return f"Forgot: {hit['text']}" if hit else "Nothing like that was in memory."
    if name == "recall":
        return recall(a["query"], chat)
    return f"Unknown tool {name}"


def describe_screenshot(image, model=""):
    """Describe an old screenshot: with the chat's own model if it can see, else an offline one (stays on the PC)."""
    seer = model if model and "vision" in model_caps(model) else watch_model()
    if not seer:
        return ""
    return providers.complete(seer, "This is a screenshot of my PC from earlier. Describe briefly what I was doing: "
                              "the app or website, what was on screen, and any important details (names, numbers, "
                              "prices, dates).", [image], load_settings(), json_mode=False)


def recall(query, current=None):
    words = [w for w in re.findall(r"\w+", query.lower()) if len(w) > 2]
    found = [f"Memory: {m['text']}" for m in MEMORY.search(query, 8)]
    s = load_settings()
    if jarvis_link.status(s)["linked"]:
        try:
            found += jarvis_link.search_memory(s, query)
        except jarvis_link.JarvisError:
            pass
    for c in list_json(CHATS, ("id", "title", "updated")):
        if current and c["id"] == current.get("id"):
            continue
        try:
            msgs = load_json(CHATS, c["id"])["messages"]
        except (OSError, ValueError):
            continue
        for m in msgs:
            text = m.get("display") or m.get("content") or ""
            low = text.lower()
            if m.get("role") in ("user", "assistant") and words and all(w in low for w in words):
                i = low.find(words[0])
                when = datetime.fromtimestamp(c["updated"] or 0).strftime("%d %b %Y")
                found.append(f"Chat \"{c['title']}\" ({when}), {m['role']}: …{text[max(0, i - 150):i + 350]}…")
                break
        if len(found) >= 12:
            break
    return "\n\n".join(found) or "Nothing found in memory or past chats."


BROWSER_TOOLS = [
    {"name": "browser_read_page", "description": "Read the web page open in the user's Chrome: title, URL, visible text "
     "and a numbered list of the links, buttons and form fields you can use.",
     "params": {}, "required": []},
    {"name": "browser_click", "description": "Click a link or button on the current page.",
     "params": {"target": "Its number from browser_read_page (e.g. '12'), or its visible text"}, "required": ["target"]},
    {"name": "browser_type", "description": "Type into a text box or search field on the current page.",
     "params": {"target": "The field's number from browser_read_page, or its label/placeholder",
                "text": "What to type", "press_enter": "'yes' to press Enter afterwards (e.g. to search)"},
     "required": ["target", "text"]},
    {"name": "browser_navigate", "description": "Open a URL in the current tab.",
     "params": {"url": "Full URL"}, "required": ["url"]},
    {"name": "browser_scroll", "description": "Scroll the current page.",
     "params": {"direction": "'down' or 'up'"}, "required": []},
    {"name": "browser_back", "description": "Go back to the previous page.", "params": {}, "required": []},
]
BROWSER_NEEDS_OK = {"browser_click", "browser_type", "browser_navigate"}


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

def system_prompt(tools_on, chat, opts):
    research = opts.get("research")
    s = load_settings()
    parts = [
        f"You are {s['assistant_name']}, {s['name']}'s personal AI assistant, running on their own computer. You know "
        "them well and remember what they like; use that to personalise every answer without making a show of it.",
        f"Today is {datetime.now():%A, %B %d, %Y}.",
        "Format answers in Markdown. When you write a web page, React component, SVG, Mermaid diagram or long "
        "document the user may want to view, put it in ONE complete fenced code block (```html, ```jsx, ```svg, "
        "```mermaid, ```markdown) so it opens as a live preview. React components must `export default` the main "
        "component, may import from 'react' and can use Tailwind classes.",
    ]
    if s.get("persona") == "butler":
        parts.append(
            f"Your manner: you are {s['name']}'s warm, loyal, impeccably polite digital butler, like a trusted personal "
            "assistant. Address them as \"sir\". Before doing a job, say briefly what you'll do (\"Right away, sir. I'll…\"); "
            "after, report back modestly. Be attentive and helpful, never grovelling, and keep answers concise.")
    if tools_on:
        parts.append(
            f"You can use tools. The workspace folder is {workspace()}. To build software, write real files with "
            "write_file, then run and test them with run_command, and fix any errors you see. Use web_search for "
            "current information and cite sources. Use generate_image when the user wants a picture, logo, design or "
            "photo (or to edit an attached image), and generate_video when they ask for a video. Use remember when the "
            "user tells you something worth keeping long-term, forget when they ask, and recall to look up past "
            "conversations. Do not ask for permission; the app asks the user for you.")
        if jarvis_link.status(s)["linked"]:
            parts.append(
                "Jarvis, the home base on this PC, is connected: recall also searches Jarvis's memory of every "
                "device's conversations. Use pc_screen_history for anything the user saw or did on the PC earlier "
                "(\"what was that price I looked at\", \"what was I doing at 3pm\"), pc_files to find files anywhere "
                "on the PC, and pc_status for the PC's health.")
    if opts.get("browser"):
        parts.append(
            "You are inside the user's Chrome browser (the Friday extension) and can operate it with the browser_* "
            "tools: read the page first, then click, type, scroll or navigate step by step, reading the page again "
            "after each action to check the result. Never enter passwords or payment details and never submit "
            "purchases; ask the user to do those parts themselves.")
    if opts.get("math"):
        parts.append(
            "MATH MODE: solve step by step and explain each step clearly. Write maths in LaTeX: \\( ... \\) inline "
            "and $$ ... $$ on their own lines for displayed equations (never single $ signs). Check every calculation with run_python when you have tools (exact "
            "arithmetic, sympy for algebra/calculus, numpy for numerics). End with the final answer in its own line as "
            "$$\\boxed{...}$$. For graphs, plot with matplotlib and save a PNG.")
    if opts.get("build"):
        parts.append(
            "APP BUILDER MODE: build the complete, working app the user describes. Unless they ask for another "
            "technology, make a polished single-page web app in its own folder apps/<short-name>/ with index.html "
            "(plus style.css / app.js if useful). It must run by opening index.html: no build step; you may load "
            "React, Tailwind, Chart.js etc. from a CDN. Make it look professional and modern, responsive on phones, "
            "and save data in localStorage when it helps. Write every file in full with write_file, then call "
            "preview_app. Then summarise what you built in 3-5 bullet points and suggest next improvements. If the "
            "user asks for changes, edit the files and call preview_app again.")
    if research:
        parts.append(
            "RESEARCH MODE: investigate thoroughly before answering. Run at least 5 different web_search queries from "
            "different angles, fetch_url the most relevant 3-6 sources, and cross-check facts. Then write a structured "
            "report with headings, a short summary first, numbered citations like [1] in the text, and a Sources list "
            "with the URLs at the end.")
    last_user = next((m.get("display") or m.get("content", "") for m in reversed(chat["messages"]) if m["role"] == "user"), "")
    known = MEMORY.for_prompt(last_user)
    if known:
        parts.append(f"What you remember about {s['name']} (long-term memory):\n{known}")
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


def converse(chat, model, opts, emit):
    settings = load_settings()
    caps = model_caps(model)
    wants_tools = opts.get("tools") or opts.get("research") or opts.get("math") or opts.get("build")
    tools = TOOLS if wants_tools and "tools" in caps else []
    if tools and settings.get("offline_only"):   # don't even offer the model tools that need the internet
        tools = [t for t in tools if t["name"] not in INTERNET_TOOLS
                 and not (t["name"] == "generate_image" and settings["image_provider"] != "local")]
    if tools and jarvis_link.status(settings)["linked"]:
        tools = tools + jarvis_link.TOOLS
    if opts.get("browser") and "tools" in caps:
        tools = tools + BROWSER_TOOLS
    opts = {**opts, "caps": caps}
    if opts.get("think") or opts.get("research") or opts.get("math") or opts.get("build"):
        opts["effort"] = "high"
    stop = _stops.setdefault(chat["id"], threading.Event())
    stop.clear()

    for _ in range(MAX_TOOL_ROUNDS):
        msg, calls, again = providers.run_round(model, system_prompt(bool(tools), chat, opts), chat["messages"],
                                                tools, opts, settings, emit, stop)
        chat["messages"].append(msg)
        save_json(CHATS, chat)
        if again and not stop.is_set():
            continue
        if not calls:
            return

        for call in calls:
            name, args = call["name"], call["args"]
            emit({"type": "tool_call", "id": call["id"], "name": name, "args": args if isinstance(args, dict) else {}})
            if stop.is_set():
                output, is_error = "Stopped by the user.", True
            elif not valid_args(name, args):
                output, is_error = json.dumps({"INVALID_JSON": json.dumps(args)[:2000]}), True
            elif needs_ok(name, opts) and not ask_user(call["id"], emit, stop):
                output, is_error = "The user denied this action. Ask them what they would like instead.", True
            else:
                try:
                    if name.startswith("browser_"):
                        output, is_error = browser_action(call["id"], name, args, emit, stop), False
                    else:
                        output, is_error = run_tool(name, args, chat, lambda t: emit({"type": "status", "id": call["id"], "text": t}), model), False
                except Exception as e:
                    output, is_error = f"Error: {e}", True
            emit({"type": "tool_result", "id": call["id"], "output": output})
            # every tool call gets a result, even after Stop, so the conversation stays valid
            chat["messages"].append({"role": "tool", "tool_name": name, "tool_call_id": call["id"],
                                     "content": output, **({"is_error": True} if is_error else {})})
        save_json(CHATS, chat)
        if stop.is_set():
            return


def browser_action(cid, name, args, emit, stop):
    """Browser tools run inside the Chrome extension: send it the action, wait for its answer."""
    ev = threading.Event()
    _browser[cid] = {"event": ev, "output": "The browser didn't answer (is the Friday side panel still open?)."}
    emit({"type": "browser_action", "id": cid, "name": name, "args": args})
    started = time.time()
    while not ev.wait(0.5):
        if stop.is_set() or time.time() - started > 90:
            break
    return clip(_browser.pop(cid)["output"], 20000)


def needs_ok(name, opts=None):
    s = load_settings()
    if name in BROWSER_NEEDS_OK:
        return not (s["auto_approve"] or (opts or {}).get("autopilot"))
    if name == "run_python" and s["auto_python"]:
        return False
    return name in NEEDS_APPROVAL and not s["auto_approve"]


def ask_user(cid, emit, stop):
    ev = threading.Event()
    _approvals[cid] = {"event": ev, "allow": False}
    emit({"type": "approval", "id": cid})
    while not ev.wait(0.5):
        if stop.is_set():
            break
    return _approvals.pop(cid)["allow"]


# ── HTTP ─────────────────────────────────────────────────────────────────

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def end_headers(self):
        if getattr(self, "cors", None):
            self.send_header("Access-Control-Allow-Origin", self.cors)
        if getattr(self, "set_cookie", False):
            token = load_settings()["chrome_token"]
            secure = "; Secure" if (self.headers.get("Host") or "").split(":")[0].endswith(".ts.net") else ""
            self.send_header("Set-Cookie", f"friday_key={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000{secure}")
        super().end_headers()

    def do_OPTIONS(self):
        origin = self.headers.get("Origin") or ""
        self.send_response(204)
        if origin.startswith("chrome-extension://"):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Friday-Token, X-Jarvis-Token")
        self.end_headers()

    def send_bytes(self, data, ctype, code=200):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def send_file(self, p):
        """Serve a file, honouring Range requests so background videos stream and loop smoothly."""
        size = p.stat().st_size
        ctype = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
        m = re.match(r"bytes=(\d*)-(\d*)", self.headers.get("Range") or "")
        start, end = 0, size - 1
        if m and (m.group(1) or m.group(2)):
            if m.group(1):
                start = int(m.group(1))
                end = min(int(m.group(2)), size - 1) if m.group(2) else size - 1
            else:
                start = max(0, size - int(m.group(2)))
            if start >= size:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.end_headers()
                return
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        else:
            self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Cache-Control", "max-age=86400")
        self.end_headers()
        with open(p, "rb") as f:
            f.seek(start)
            left = end - start + 1
            while left > 0:
                chunk = f.read(min(1 << 20, left))
                if not chunk:
                    break
                self.wfile.write(chunk)
                left -= len(chunk)

    def send_json(self, obj, code=200):
        self.send_bytes(json.dumps(obj).encode(), "application/json", code)

    def guard(self):
        """Only answer our own page: blocks other websites (CSRF) and DNS-rebinding tricks."""
        self.cors, self.set_cookie = None, False
        ip = self.client_address[0]
        if not (ip.startswith("127.") or ip in ("::1", "::ffff:127.0.0.1")):
            return self.guard_remote()
        host = (self.headers.get("Host") or "").split(":")[0]
        if host.endswith(".ts.net") or self.headers.get("Tailscale-User-Login") or self.headers.get("X-Forwarded-For"):
            # `tailscale serve` hands Friday requests from your other devices as if they came from this PC:
            # treat them exactly like the phone (phone access on + pairing code)
            return self.guard_remote()
        origin = self.headers.get("Origin")
        ok_host = host in ("localhost", "127.0.0.1")
        # Every API call carries the pairing code: the app page has it built in, the Chrome extension
        # gets it when you paste it. Other websites and other extensions can't read it, so can't use the API.
        if self.path.startswith(("/api/", "/v1/")) and not hmac.compare_digest(self.presented_code(), load_settings()["chrome_token"]):
            self.send_json({"error": "Friday isn't paired: paste the pairing code from Elliot AI → Settings."}, 401)
            return False
        if origin and origin.startswith("chrome-extension://"):
            self.cors = origin
            origin = None
        ok_origin = origin is None or origin in (f"http://localhost:{PORT}", f"http://127.0.0.1:{PORT}") or \
            (origin == "null" and self.command == "GET" and self.path.startswith("/ws/"))
        ok_type = self.command == "GET" or self.command == "DELETE" or \
            (self.headers.get("Content-Type") or "").startswith("application/json")
        if ok_host and ok_origin and ok_type:
            return True
        self.send_json({"error": "forbidden"}, 403)
        return False

    def presented_code(self):
        """The pairing code: X-Friday-Token header (or the old X-Jarvis-Token), or "Authorization: Bearer <code>" for OpenAI-style clients."""
        auth = self.headers.get("Authorization") or ""
        return self.headers.get("X-Friday-Token") or self.headers.get("X-Jarvis-Token") or (auth[7:].strip() if auth.lower().startswith("bearer ") else "")

    def guard_remote(self):
        """Another device on your Wi-Fi (the Friday phone app, or a phone browser): only with phone
        access switched on, and only with the pairing code (header, ?key= on the start page, or the
        cookie that page sets so its pictures and previews load)."""
        s = load_settings()
        if not s["phone_access"]:
            self.send_json({"error": "Phone access is off. Turn it on in Friday → Settings on the PC."}, 403)
            return False
        url = urllib.parse.urlparse(self.path)
        if url.path.startswith("/vendor/") and self.command == "GET":
            return True   # public open-source libraries; previews in sandboxed frames can't send the cookie
        key = urllib.parse.parse_qs(url.query).get("key", [""])[0] if url.path in ("/", "/index.html", "/station") else ""
        cookie = SimpleCookie(self.headers.get("Cookie") or "")
        presented = self.presented_code() or key or next((cookie[k].value for k in ("friday_key", "jarvis_key") if k in cookie), "")
        if not hmac.compare_digest(presented, s["chrome_token"]):
            self.send_json({"error": "Friday isn't paired: use the pairing code from Settings on the PC."}, 401)
            return False
        self.set_cookie = bool(key)
        return True

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def do_GET(self):
        if not self.guard():
            return
        url = urllib.parse.urlparse(self.path)
        try:
            if url.path in ("/", "/index.html", "/station"):
                name = "station.html" if url.path == "/station" else "index.html"   # /station: the home-station dashboard
                page = (APP_DIR / name).read_text("utf-8").replace("__FRIDAY_TOKEN__", load_settings()["chrome_token"])
                self.send_bytes(page.encode(), "text/html; charset=utf-8")
            elif url.path.startswith("/vendor/"):   # page libraries shipped with Friday (math, diagrams, previews)
                base = (APP_DIR / "vendor").resolve()
                p = (base / urllib.parse.unquote(url.path[8:])).resolve()
                if not p.is_file() or base not in p.parents:
                    return self.send_json({"error": "not found"}, 404)
                self.send_file(p)
            elif url.path.startswith("/media/"):
                name = Path(urllib.parse.unquote(url.path[7:])).name
                p = MEDIA / name
                if not p.is_file():
                    return self.send_json({"error": "not found"}, 404)
                self.send_file(p)
            elif url.path.startswith("/ws/"):     # files in the workspace, for live app previews
                p = safe_path(urllib.parse.unquote(url.path[4:]))
                if p.is_dir():
                    p = p / "index.html"
                if not p.is_file():
                    return self.send_json({"error": "not found"}, 404)
                ctype = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
                if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
                    ctype += "; charset=utf-8"
                self.send_bytes(p.read_bytes(), ctype)
            elif url.path == "/api/zip":
                root = safe_path(urllib.parse.parse_qs(url.query).get("path", [""])[0])
                if root.is_file():
                    root = root.parent
                if root == workspace():
                    raise ValueError("Pick an app folder to download")
                buf = io.BytesIO()
                with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
                    for f in root.rglob("*"):
                        if f.is_file() and "node_modules" not in f.parts:
                            z.write(f, f"{root.name}/{f.relative_to(root).as_posix()}")
                self.send_response(200)
                self.send_header("Content-Type", "application/zip")
                self.send_header("Content-Disposition", f'attachment; filename="{root.name}.zip"')
                self.send_header("Content-Length", str(buf.tell()))
                self.end_headers()
                self.wfile.write(buf.getvalue())
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
            elif url.path == "/api/screen_memory":
                self.send_json(screen_memory_stats())
            elif url.path == "/api/brains":
                self.send_json(brains_info())
            elif url.path == "/v1/models":   # OpenAI-style: every brain, for your other systems
                self.send_json({"object": "list", "data": [{"id": m["name"], "object": "model", "owned_by": m["provider_label"],
                                                            "description": m["summary"]} for m in list_models()["models"]]})
            elif url.path == "/api/lan_info":
                self.send_json({"addresses": [f"{a}:{PORT}" for a in lan_addresses()], "tailscale": tailscale_info(),
                                "phone_access": load_settings()["phone_access"], "listening_on_wifi": LISTEN != "127.0.0.1"})
            elif url.path == "/api/station/state":
                self.send_json(station_dashboard.state())
            elif url.path == "/api/jarvis":
                st = jarvis_link.status(load_settings(), fresh=True)
                self.send_json({"linked": st["linked"], "message": st["message"],
                                "token_file": str(jarvis_link.TOKEN_FILE), "token_file_found": jarvis_link.TOKEN_FILE.exists()})
            elif url.path == "/api/lens_model":
                self.send_json({"model": lens_model()})
            elif url.path == "/api/memory":
                self.send_json({"memories": MEMORY.all(), "categories": memory_store.CATEGORIES})
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
            if kind == "memory":
                MEMORY.delete(i)
                return self.send_json({"ok": True})
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
            if path == "/api/organize/scan":
                return self.stream_organize(b)
            if path in ("/api/organize/apply", "/api/organize/undo"):
                plan = load_json(PLANS, b["plan_id"])
                if path.endswith("apply"):
                    n = organizer.apply(plan, b.get("renames") or {}, set(b.get("exclude") or []))
                else:
                    n = organizer.undo(plan)
                save_json(PLANS, plan)
                return self.send_json({"moved": n, "folder": plan["folder"]})
            if path == "/v1/chat/completions":
                return self.gateway_chat(b)
            if path == "/api/screen_check":
                return self.send_json(screen_check(b.get("image", "")))
            if path == "/api/autofill":
                return self.send_json(autofill(b))
            if path == "/api/station/task":
                return self.send_json(station_dashboard.act(b))
            if path == "/api/sync/queue":   # save an action for when its destination is reachable (works offline)
                item = station_dashboard.sync_outbox.enqueue(b.get("kind", ""), b.get("payload") or {}, b.get("label", ""))
                return self.send_json({"item": item})
            if path == "/api/sync/item":
                return self.send_json(station_dashboard.sync_act(b))
            if path == "/api/tailscale_serve":
                if not self.client_address[0].startswith("127.") or self.headers.get("X-Forwarded-For") \
                        or (self.headers.get("Host") or "").split(":")[0].endswith(".ts.net"):
                    return self.send_json({"error": "Only from Friday on the PC itself."}, 403)
                return self.send_json(tailscale_serve())
            if path == "/api/screen_memory/clear":
                import shutil
                shutil.rmtree(SCREENS, ignore_errors=True)
                return self.send_json(screen_memory_stats())
            if path == "/api/brains/add":
                return self.send_json(add_brain(b))
            if path == "/api/brains/remove":
                s = load_settings()
                s["brains"] = [x for x in s["brains"] if x.get("id") != b.get("id")]
                save_settings(s)
                return self.send_json({"ok": True})
            if path == "/api/ollama/pull":
                return self.ollama_pull(b.get("name", "").strip())
            if path == "/api/ollama/delete":
                http_json(OLLAMA + "/api/delete", {"model": b["name"]}, method="DELETE", timeout=60)
                _caps.pop(b["name"], None)
                return self.send_json({"ok": True})
            if path == "/api/upload":     # background videos/images for the appearance editor
                ext = Path(b.get("name", "")).suffix.lower().lstrip(".")
                if ext not in {"mp4", "webm", "mov", "m4v", "jpg", "jpeg", "png", "webp", "gif"}:
                    raise ValueError("Use an MP4/WebM video or a JPG/PNG/WebP/GIF image.")
                return self.send_json({"url": save_media(base64.b64decode(b["data"]), ext, to_workspace=False)})
            if path == "/api/browser_result":
                if b.get("id") in _browser:
                    _browser[b["id"]]["output"] = str(b.get("output", ""))[:50000]
                    _browser[b["id"]]["event"].set()
                return self.send_json({"ok": True})
            if path == "/api/memory":
                if b.get("id"):
                    MEMORY.update(b["id"], b.get("text"), b.get("category"))
                    return self.send_json({"ok": True})
                entry = MEMORY.add(b.get("text", ""), b.get("category", "Other"), "you")
                return self.send_json({"entry": entry})
            if path == "/api/memory/learn":
                return self.send_json({"learned": learn(b.get("chat_id"), b.get("model"))})
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
                    if k in DEFAULT_SETTINGS and k != "brains" and not (k in SECRET_KEYS and str(v).startswith("••••")):
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
        opts = {k: bool(b.get(k)) for k in ("tools", "think", "research", "math", "build", "browser", "autopilot")}
        model = b["model"]
        if opts["math"]:
            model = math_model(model)
            if model != b["model"]:
                emit({"type": "notice", "text": f"Math mode is using {providers.model_id(model)}"})
        if providers.provider_of(model) in ("anthropic", "openai", "google") and station_dashboard.offline() \
                and not load_settings().get("offline_only"):
            return self.save_for_later(chat, model, emit)
        converse(chat, model, opts, emit)

    def save_for_later(self, chat, model, emit):
        """Offline with a cloud brain: put the question in the sync outbox instead of waiting on timeouts."""
        question = next((m.get("display") or m.get("content", "") for m in reversed(chat["messages"]) if m["role"] == "user"), "")
        name = providers.model_id(model)
        station_dashboard.sync_outbox.enqueue("friday_ask", {"model": model, "prompt": question},
                                              label=f"Ask {name}: {question[:60]}")
        sir = ", sir" if load_settings().get("persona") == "butler" else ""
        text = (f"You're offline at the moment{sir}, so I've saved your question for {name} and will ask it as soon as "
                "the connection is back. The answer will appear on the Home Station dashboard (Activity → Outbox). "
                "For an answer right now, switch to an offline brain.")
        emit({"type": "text", "delta": text})
        chat["messages"].append({"role": "assistant", "content": text})
        save_json(CHATS, chat)

    def ollama_pull(self, name):
        """Download an offline model through Ollama, streaming progress to the page."""
        if not re.fullmatch(r"[\w.\-/:]+", name or ""):
            return self.send_json({"error": "Type a model name like qwen3:8b or llama3.3"}, 400)
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson")
        self.end_headers()
        try:
            with ollama("/api/pull", {"model": name, "stream": True}, stream=True, timeout=7200) as resp:
                for line in resp:
                    if line.strip():
                        self.wfile.write(line if line.endswith(b"\n") else line + b"\n")
                        self.wfile.flush()
            _caps.pop(name, None)
        except urllib.error.URLError:
            self.wfile.write((json.dumps({"error": f"Can't reach Ollama at {OLLAMA}. Is it running?"}) + "\n").encode())

    def gateway_chat(self, b):
        """OpenAI-style chat for your other systems (device manager, scripts, Friday…): any brain, plus
        Friday's memory of you when they don't send their own system prompt."""
        model = b.get("model") or ""
        if model in ("", "auto", "default", "friday", "jarvis"):
            model = load_settings()["default_model"] or next((m["name"] for m in list_models()["models"]), "")
        system, msgs = [], []
        for m in b.get("messages") or []:
            content = m.get("content")
            text, images = content if isinstance(content, str) else "", []
            if isinstance(content, list):
                for part in content:
                    if part.get("type") == "text":
                        text += part.get("text", "")
                    elif part.get("type") == "image_url":
                        url = (part.get("image_url") or {}).get("url", "")
                        if url.startswith("data:") and "," in url:
                            images.append(url.split(",", 1)[1])
            if m.get("role") == "system":
                system.append(text)
            elif m.get("role") in ("user", "assistant"):
                msgs.append({"role": m["role"], "content": text, **({"images": images} if images else {})})
        prompt = "\n\n".join(system) or system_prompt(False, {"messages": msgs}, {})
        stream, cid, created = bool(b.get("stream")), "chatcmpl-" + uuid.uuid4().hex[:24], int(time.time())
        chunk = lambda delta, finish=None: {"id": cid, "object": "chat.completion.chunk", "created": created, "model": model,
                                            "choices": [{"index": 0, "delta": delta, "finish_reason": finish}]}
        if stream:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()

        def emit(ev):
            if stream and ev.get("type") == "text":
                self.wfile.write(f"data: {json.dumps(chunk({'content': ev['delta']}))}\n\n".encode())
                self.wfile.flush()

        try:
            msg, _, _ = providers.run_round(model, prompt, msgs, [], {"caps": model_caps(model)}, load_settings(),
                                            emit, threading.Event())
        except Exception as e:
            if stream:
                self.wfile.write(f"data: {json.dumps({'error': {'message': str(e)}})}\n\n".encode())
                return
            return self.send_json({"error": {"message": str(e), "type": "brain_error"}}, 502)
        if stream:
            self.wfile.write(f"data: {json.dumps(chunk({}, 'stop'))}\n\ndata: [DONE]\n\n".encode())
            return
        self.send_json({"id": cid, "object": "chat.completion", "created": created, "model": model,
                        "choices": [{"index": 0, "message": {"role": "assistant", "content": msg.get("content", "")},
                                     "finish_reason": "stop"}],
                        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}})

    def stream_organize(self, b):
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson")
        self.end_headers()

        def emit(ev):
            self.wfile.write((json.dumps(ev) + "\n").encode())
            self.wfile.flush()

        stop = _stops.setdefault("organize", threading.Event())
        stop.clear()
        settings = load_settings()
        model = b.get("model", "")
        try:
            plan = organizer.scan(
                b["folder"], b.get("method", "ai"), b.get("categories") or [], model,
                lambda m, prompt, images: providers.complete(m, prompt, images, settings),
                extract_text, emit, stop, parallel=4 if model.startswith("cloud:") else 1)
            save_json(PLANS, plan)
            emit({"type": "done", "plan_id": plan["id"]})
        except (BrokenPipeError, ConnectionResetError):
            stop.set()
        except Exception as e:
            emit({"type": "error", "message": str(e)})

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


def learn(chat_id, model):
    """After a reply: ask the model what lasting things it just learned about the user."""
    s = load_settings()
    if not s["auto_memory"] or not chat_id or not model:
        return []
    chat = load_json(CHATS, chat_id)
    msgs = chat["messages"]
    user = next((m for m in reversed(msgs) if m["role"] == "user"), None)
    reply = next((m for m in reversed(msgs) if m["role"] == "assistant" and m.get("content") and not m.get("error")), None)
    text = (user or {}).get("display") or (user or {}).get("content", "")
    if not user or len(text.strip()) < 8:
        return []
    if model == "generator":
        return []
    known = "\n".join(f"- {m['text']}" for m in MEMORY.all()[-150:])
    try:
        answer = providers.complete(model, memory_store.learn_prompt(s["name"], text, (reply or {}).get("content", ""), known),
                                    (), s)
    except Exception:
        return []
    learned = [e for e in (MEMORY.add(t, c, chat_id) for t, c in memory_store.parse_learned(answer)) if e]
    if learned:
        chat["messages"].append({"role": "memory", "content": "", "items": [e["text"] for e in learned]})
        save_json(CHATS, chat)
    return learned


def tailscale_cli():
    for exe in ("tailscale", r"C:\Program Files\Tailscale\tailscale.exe", "/Applications/Tailscale.app/Contents/MacOS/Tailscale"):
        try:
            subprocess.run([exe, "version"], capture_output=True, timeout=5, check=True)
            return exe
        except (OSError, subprocess.SubprocessError):
            continue
    return ""


def tailscale_info():
    """This PC on your Tailscale network: its 100.x address and its https://<pc>.<tailnet>.ts.net name."""
    exe = tailscale_cli()
    if not exe:
        return {"installed": False}
    try:
        st = json.loads(subprocess.run([exe, "status", "--json"], capture_output=True, text=True, timeout=8).stdout or "{}")
    except (OSError, subprocess.SubprocessError, ValueError):
        return {"installed": True, "running": False}
    me = st.get("Self") or {}
    ip = next((a for a in me.get("TailscaleIPs") or [] if "." in a), "")
    name = (me.get("DNSName") or "").rstrip(".")
    try:
        serve = subprocess.run([exe, "serve", "status"], capture_output=True, text=True, timeout=8).stdout
    except (OSError, subprocess.SubprocessError):
        serve = ""
    return {"installed": True, "running": st.get("BackendState") == "Running", "ip": ip,
            "https": f"https://{name}" if name else "", "serving": bool(name) and f":{PORT}" in serve}


def tailscale_serve():
    """Publish Friday at https://<pc>.<tailnet>.ts.net to your own Tailscale devices only (not the internet)."""
    exe = tailscale_cli()
    if not exe:
        raise ValueError("Tailscale isn't installed on this PC. Get it at tailscale.com/download.")
    r = subprocess.run([exe, "serve", "--bg", str(PORT)], capture_output=True, text=True, timeout=60)
    out = (r.stdout + r.stderr).strip()
    if r.returncode != 0:
        raise ValueError(out[-600:] or "tailscale serve failed")
    return {"ok": True, "output": out[-600:], **tailscale_info()}


def lan_addresses():
    """This PC's addresses on the local network, for typing into the phone app."""
    found = set()
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))   # no packet is sent; this just picks the Wi-Fi/LAN interface
            found.add(s.getsockname()[0])
    except OSError:
        pass
    try:
        found.update(socket.gethostbyname_ex(socket.gethostname())[2])
    except OSError:
        pass
    return sorted(a for a in found if not a.startswith("127."))


LISTEN = "127.0.0.1"
DISCOVERY_PORT = 8765   # UDP, same number as the web port


def discovery_responder():
    """Lets the phone app find this PC on any local link (USB tethering, the phone's hotspot, home Wi-Fi) without
    knowing its address: it broadcasts "FRIDAY?" and we answer "FRIDAY <port>". Only runs with phone access on,
    and reveals nothing but that Friday is here; everything else still needs the pairing code."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("0.0.0.0", DISCOVERY_PORT))
    except OSError as e:
        print(f"Phone auto-discovery is off (UDP port {DISCOVERY_PORT} busy: {e}). Type the PC address in the phone app instead.")
        return
    while True:
        try:
            data, addr = sock.recvfrom(64)
            if data.strip() == b"FRIDAY?" and load_settings()["phone_access"]:
                sock.sendto(f"FRIDAY {PORT}".encode(), addr)
        except OSError:
            time.sleep(1)


def main():
    global LISTEN
    LISTEN = "0.0.0.0" if load_settings()["phone_access"] else "127.0.0.1"
    try:
        server = ThreadingHTTPServer((LISTEN, PORT), Handler)
    except OSError:
        sys.exit(f"Port {PORT} is already in use. Is Friday already running, or is another app "
                 f"(e.g. Jarvis Station) using it? Close that app, or start Friday with PORT=<other port>.")
    if LISTEN != "127.0.0.1":
        threading.Thread(target=discovery_responder, daemon=True).start()
        print("Phone access is ON: devices on your Wi-Fi can connect with the pairing code at",
              ", ".join(f"http://{a}:{PORT}" for a in lan_addresses()) or "this PC's address")
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
