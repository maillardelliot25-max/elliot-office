"""
Jarvis ↔ Claude link (MCP)
===========================
Gives Claude (the Claude desktop app, Claude Code…) Jarvis's tools, so the
two work together: Claude does the heavy thinking and the work; Jarvis
supplies the memory, the eyes on your screen, your files and your details.

Claude starts this file itself. Set it up once with  setup_claude_link.bat
(it needs the God Station running on this PC).
"""

import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
# Claude runs this file directly; don't let station/*.py shadow library modules
sys.path = [p for p in sys.path if Path(p or ".").resolve() != HERE]

import httpx  # noqa: E402
from mcp.server.fastmcp import FastMCP, Image  # noqa: E402
STATION = os.getenv("STATION_URL", "http://127.0.0.1:8765").rstrip("/")
TOKEN_FILE = Path(os.getenv("STATION_DATA_DIR", HERE.parent / "station_data")) / "claude.token"

mcp = FastMCP(
    "jarvis",
    instructions=(
        "Jarvis is the user's personal AI running on their PC (the God Station). "
        "Use these tools to remember past conversations, see what is or was on their screen, "
        "read their clipboard and files, and look up their personal details for forms. "
        "Save anything worth remembering with remember(). Address the user as 'sir'."
    ),
)


def _client() -> httpx.Client:
    try:
        token = TOKEN_FILE.read_text().strip()
    except OSError:
        raise RuntimeError("Jarvis isn't set up on this PC yet — start the God Station (start_station.bat) once.")
    return httpx.Client(base_url=STATION, headers={"Authorization": f"Bearer {token}"}, timeout=120)


def _get(path: str, **params):
    with _client() as c:
        r = c.get(path, params=params)
        _check(r)
        return r


def _post(path: str, body: dict):
    with _client() as c:
        r = c.post(path, json=body)
        _check(r)
        return r.json()


def _check(r: httpx.Response):
    if r.status_code >= 400:
        try:
            detail = r.json().get("detail")
        except Exception:
            detail = r.text
        raise RuntimeError(f"Jarvis said: {detail}")


@mcp.tool()
def search_memory(query: str, limit: int = 15) -> str:
    """Search every past conversation the user had with Jarvis, from any device."""
    hits = _get("/api/memory/search", q=query, limit=limit).json()
    if not hits:
        return "Nothing in Jarvis's memory about that."
    return "\n".join(f"[{h['ts']}] {h['role']} ({h['device']}): {h['text']}" for h in hits)


@mcp.tool()
def remember(note: str) -> str:
    """Save a note to Jarvis's long-term memory (facts about the user, decisions, results of work)."""
    _post("/api/memory/note", {"text": note})
    return "Saved to Jarvis's memory."


@mcp.tool()
def search_screen_history(query: str, limit: int = 15) -> str:
    """Search what was on the user's screen in the past (Recall). Returns times, windows and matching text.
    Use view_screen_moment(id) to look at one."""
    hits = _get("/api/recall/search", q=query, limit=limit).json()
    if not hits:
        return "Nothing on screen matched that (or screen memory is off)."
    return "\n".join(f"id={h['id']} [{h['ts']}] {h['window']}: {h['snippet']}" for h in hits)


@mcp.tool()
def recent_screen_activity(limit: int = 30) -> str:
    """What the user has been doing on the PC recently: a timeline of windows from screen memory."""
    frames = _get("/api/recall/frames", limit=limit).json()
    if not frames:
        return "No screen memory yet."
    return "\n".join(f"id={f['id']} [{f['ts']}] {f['window']}" for f in frames)


@mcp.tool()
def view_screen_moment(frame_id: int) -> Image:
    """Look at a saved screen moment from screen memory (an id from search_screen_history)."""
    return Image(data=_get(f"/api/recall/frame/{frame_id}", w=1366).content, format="jpeg")


@mcp.tool()
def look_at_screen() -> Image:
    """See the user's PC screen right now."""
    return Image(data=_get("/api/screen", w=1366, q=70).content, format="jpeg")


@mcp.tool()
def get_clipboard() -> str:
    """What the user last copied on the PC."""
    return _get("/api/clipboard").json()["text"]


@mcp.tool()
def set_clipboard(text: str) -> str:
    """Put text on the PC clipboard (it also reaches the user's phone and tablet)."""
    _post("/api/clipboard", {"text": text})
    return "Copied, sir."


@mcp.tool()
def clipboard_history(limit: int = 20) -> str:
    """Recent things copied on the PC, phone or tablet."""
    clips = _get("/api/clips", limit=limit).json()
    return "\n".join(f"[{c['ts']}] from {c['source']}: {c['text'][:500]}" for c in clips) or "Empty."


@mcp.tool()
def list_folder(path: str = "") -> str:
    """List a folder on the PC. Empty path lists the drives and home folder."""
    d = _get("/api/files", path=path).json()
    rows = [f"{'[dir] ' if e['is_dir'] else ''}{e['path']}" + (f"  ({e['size']} bytes)" if e.get("size") else "")
            for e in d["entries"]]
    return "\n".join(rows) or "(empty)"


@mcp.tool()
def read_text_file(path: str, max_chars: int = 20000) -> str:
    """Read a text file on the PC (notes, code, csv…)."""
    data = _get("/api/files/download", path=path).content
    return data.decode("utf-8", errors="replace")[:max_chars]


@mcp.tool()
def my_details() -> str:
    """The user's saved personal details (name, email, phone, address…) for filling forms."""
    values = _get("/api/profile").json()["values"]
    return "\n".join(f"{k}: {v}" for k, v in values.items() if v) or "No details saved yet."


@mcp.tool()
def sign_pdf(path: str) -> str:
    """Put the user's saved signature on a PDF (saved as a new '-signed.pdf' next to it)."""
    return _post("/api/docs/sign", {"path": path})["message"]


@mcp.tool()
def fill_pdf_form(path: str) -> str:
    """Fill a fillable PDF form from the user's details (saved as '-filled.pdf')."""
    r = _post("/api/docs/fill", {"path": path})
    left = r.get("left_for_you") or []
    return r["message"] + (f"\nNot filled: {', '.join(left)}" if left else "")


@mcp.tool()
def notify_me(message: str, title: str = "Jarvis") -> str:
    """Send the user a notification on their phone/tablet (and Telegram), e.g. when a job is done."""
    r = _post("/api/notify", {"title": title, "body": message})
    return "Notified, sir." if r.get("sent") else "Nobody to notify yet (turn on notifications in the Jarvis app)."


@mcp.tool()
def open_on_pc(target: str) -> str:
    """Open an app, file or website on the user's PC."""
    return _post("/api/open", {"target": target}).get("message", "Opened.")


def main():
    if not TOKEN_FILE.exists():
        print(f"Start the God Station first — {TOKEN_FILE} not found.", file=sys.stderr)
    mcp.run()


if __name__ == "__main__":
    main()
