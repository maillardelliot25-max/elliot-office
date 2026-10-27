"""
Friday → Jarvis, the home base on this PC (repo folder `New folder/Jarvis`, port 8780).

Jarvis keeps the PC's screen memory (Recall, with on-screen text), its own memory of every device's
conversations, and can list files and report the PC's health. Friday reads those here, read-only.
Jarvis writes a token for Friday to `Jarvis/station_data/friday.token` when it starts; Friday uses it
automatically, or the token pasted in Settings.
"""

import base64
import json
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

TOKEN_FILE = Path(__file__).resolve().parent.parent.parent / "Jarvis" / "station_data" / "friday.token"
SEGMENT_HOURS = 8          # Jarvis stores screen memory in 8-hour segments: 00-08, 08-16, 16-24
STATUS_TTL = 30            # seconds to trust a "linked / not linked" answer

_status = {"at": 0.0, "key": None, "value": None}
_lock = threading.Lock()


class JarvisError(RuntimeError):
    pass


def token_files():
    """Jarvis's token file: next to Friday, or wherever Jarvis was unzipped (Downloads, Documents, Desktop)."""
    yield TOKEN_FILE
    home = Path.home()
    for base in ("Downloads", "Documents", "Desktop"):
        for pattern in ("*/New folder/Jarvis/station_data/friday.token", "*/*/New folder/Jarvis/station_data/friday.token",
                        "*/Jarvis/station_data/friday.token", "Jarvis/station_data/friday.token"):
            yield from sorted((home / base).glob(pattern), key=lambda p: p.stat().st_mtime, reverse=True)


def token(settings):
    t = (settings.get("jarvis_token") or "").strip()
    if t:
        return t
    for f in token_files():
        try:
            found = f.read_text().strip()
        except OSError:
            continue
        if found:
            return found
    return ""


def _get(settings, path, params=None, raw=False, timeout=15):
    base = (settings.get("jarvis_url") or "http://localhost:8780").rstrip("/")
    url = base + path + ("?" + urllib.parse.urlencode(params) if params else "")
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token(settings)}"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = r.read()
    except urllib.error.HTTPError as e:
        if e.code == 401:
            raise JarvisError("Jarvis didn't accept Friday's link token. Restart Jarvis, or paste the token from "
                              "Jarvis/station_data/friday.token in Friday's Settings.") from None
        detail = e.read().decode("utf-8", "replace")
        try:
            detail = json.loads(detail).get("detail", detail)
        except (ValueError, AttributeError):
            pass
        raise JarvisError(f"Jarvis: {e.code} {str(detail)[:300]}") from None
    except (urllib.error.URLError, OSError):
        raise JarvisError("Jarvis isn't running on this PC (start it with start_station.bat).") from None
    return data if raw else json.loads(data)


def status(settings, fresh=False):
    """{"linked": bool, "message": str}, cached for a few seconds so every chat doesn't ping Jarvis."""
    if not settings.get("jarvis_link", True):
        return {"linked": False, "message": "Link to Jarvis is turned off."}
    if not token(settings):
        return {"linked": False, "message": "No link token yet. Start Jarvis once (it creates one), or paste it below."}
    key = (settings.get("jarvis_url"), token(settings))
    with _lock:
        if not fresh and _status["key"] == key and time.time() - _status["at"] < STATUS_TTL:
            return _status["value"]
    try:
        info = _get(settings, "/api/system", timeout=2)
        value = {"linked": True, "message": "Connected to Jarvis.", "system": info}
    except JarvisError as e:
        value = {"linked": False, "message": str(e)}
    with _lock:
        _status.update(at=time.time(), key=key, value=value)
    return value


def _when(ts):
    try:
        return datetime.fromisoformat(ts).strftime("%a %d %b %H:%M")
    except (TypeError, ValueError):
        return str(ts)


def _parse_time(text):
    text = str(text).strip().replace("T", " ")
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d %H", "%Y-%m-%d"):
        try:
            return datetime.strptime(text[:19], fmt)
        except ValueError:
            continue
    for fmt in ("%H:%M", "%H"):   # a time today
        try:
            t = datetime.strptime(text, fmt)
            return datetime.now().replace(hour=t.hour, minute=t.minute, second=0, microsecond=0)
        except ValueError:
            continue
    raise JarvisError(f"I couldn't read the time '{text}'. Use 'YYYY-MM-DD HH:MM'.")


def _segment_of(t):
    start = (t.hour // SEGMENT_HOURS) * SEGMENT_HOURS
    return f"{t:%Y-%m-%d}_{start:02d}-{start + SEGMENT_HOURS:02d}"


def search_screen(settings, query, limit=15):
    hits = _get(settings, "/api/recall/search", {"q": query, "limit": limit})
    if not hits:
        return f"Nothing matching '{query}' in Jarvis's screen memory."
    lines = [f"- {_when(h.get('ts'))} · {h.get('window') or 'unknown window'}: {(h.get('snippet') or '').strip()}"
             for h in hits]
    return f"Screen memory matches for '{query}' (newest first):\n" + "\n".join(lines)


def screen_at(settings, when, describe=None):
    """What was on screen nearest to `when`. `describe(jpeg_b64)` returns a vision model's description, or ''."""
    t = _parse_time(when)
    best, before = None, None
    for _ in range(20):   # page back through that segment until we pass the moment
        params = {"segment": _segment_of(t), "limit": 200}
        if before:
            params["before_id"] = before
        frames = _get(settings, "/api/recall/frames", params)
        for f in frames:
            try:
                gap = abs((datetime.fromisoformat(f["ts"]) - t).total_seconds())
            except (KeyError, TypeError, ValueError):
                continue
            if best is None or gap < best[0]:
                best = (gap, f)
        if len(frames) < 200 or datetime.fromisoformat(frames[-1]["ts"]) <= t:
            break
        before = frames[-1]["id"]
    if not best:
        return f"Jarvis has no screen memory from around {t:%a %d %b %H:%M} (it may have been off, the PC locked, or the memory cleaned up)."
    gap, f = best
    out = [f"Closest screenshot: {_when(f['ts'])} ({round(gap / 60)} min from {t:%H:%M}), window: {f.get('window') or 'unknown'}.",
           f"Text on screen (start): {(f.get('snippet') or '').strip() or '(none read)'}"]
    if describe:
        try:
            jpeg = _get(settings, f"/api/recall/frame/{int(f['id'])}", {"w": 1280}, raw=True, timeout=30)
            seen = describe(base64.b64encode(jpeg).decode())
            if seen:
                out.append("What the screenshot shows: " + seen.strip())
        except Exception as e:   # the vision model is optional; the text above still answers
            out.append(f"(Couldn't look at the screenshot: {e})")
    return "\n".join(out)


def search_memory(settings, query, limit=8):
    """Jarvis's memory of conversations from every device, as lines for Friday's recall tool."""
    hits = _get(settings, "/api/memory/search", {"q": query, "limit": limit}, timeout=5)
    return [f"Jarvis ({h.get('device') or h.get('role') or 'note'}, {_when(h.get('ts'))}): {(h.get('text') or '')[:400]}"
            for h in hits]


def list_files(settings, path=""):
    d = _get(settings, "/api/files", {"path": path})
    entries = d.get("entries") or []
    folders = sorted((e for e in entries if e.get("is_dir")), key=lambda e: e["name"].lower())
    files = sorted((e for e in entries if not e.get("is_dir")), key=lambda e: e.get("modified") or "", reverse=True)
    size = lambda n: "" if n is None else f", {n / 1e6:.1f} MB" if n >= 1e5 else f", {n / 1e3:.0f} KB"
    lines = [f"📁 {e['path']}" for e in folders[:150]] + \
            [f"📄 {e['path']} ({e.get('modified', '')}{size(e.get('size'))})" for e in files[:150]]
    more = len(entries) - len(lines)
    return (f"{d.get('path') or 'This PC'}:\n" + "\n".join(lines) + (f"\n… and {more} more" if more > 0 else "")) \
        if lines else f"{path or 'This PC'} is empty."


def pc_status(settings):
    return json.dumps(_get(settings, "/api/system"), indent=1)[:4000]


TOOLS = [
    {"name": "pc_screen_history", "description": "Look through the PC's screen memory, kept by Jarvis (the home base) "
     "for the last few days. Give `query` to search the text and window titles that were on screen ('invoice', "
     "'flight to Rome'), and/or `when` to see what was on screen at a moment, e.g. 'what was I doing at 3pm'.",
     "params": {"query": "Words that were on screen (optional)",
                "when": "A moment as 'YYYY-MM-DD HH:MM' in the user's local time (optional)"}, "required": []},
    {"name": "pc_files", "description": "List a folder anywhere on the user's PC via Jarvis (read-only). "
     "Empty path lists the drives and the home folder.",
     "params": {"path": "Full folder path, e.g. C:\\Users\\Elliot\\Documents (optional)"}, "required": []},
    {"name": "pc_status", "description": "The PC's health from Jarvis: CPU, memory, battery, disks, uptime.",
     "params": {}, "required": []},
]


def run(name, args, settings, describe=None):
    if name == "pc_screen_history":
        q, when = (args.get("query") or "").strip(), (args.get("when") or "").strip()
        if not q and not when:
            return "Give a query, a time, or both."
        parts = []
        if when:
            parts.append(screen_at(settings, when, describe))
        if q:
            parts.append(search_screen(settings, q))
        return "\n\n".join(parts)
    if name == "pc_files":
        return list_files(settings, args.get("path") or "")
    if name == "pc_status":
        return pc_status(settings)
    return f"Unknown tool {name}"
