"""
God Station — Instant Commands
===============================
Common commands are understood without the AI brain, so they run
instantly and still work when Ollama is off:

  "open youtube"  "lock my pc"  "volume up"  "pause"  "next song"
  "show desktop"  "shut down"   "type hello world"

Each command becomes one or more actions (the same format the brain uses).
"""

import re

APP_ALIASES = {
    "youtube": "https://youtube.com",
    "google": "https://google.com",
    "gmail": "https://mail.google.com",
    "github": "https://github.com",
    "claude": "https://claude.ai",
    "chatgpt": "https://chatgpt.com",
    "whatsapp": "https://web.whatsapp.com",
    "instagram": "https://instagram.com",
    "chrome": "chrome",
    "edge": "msedge",
    "browser": "https://google.com",
    "notepad": "notepad",
    "calculator": "calc",
    "calc": "calc",
    "paint": "mspaint",
    "explorer": "explorer",
    "file explorer": "explorer",
    "files": "explorer",
    "my files": "explorer",
    "settings": "ms-settings:",
    "task manager": "taskmgr",
    "terminal": "wt",
    "cmd": "cmd",
    "command prompt": "cmd",
    "powershell": "powershell",
    "spotify": "spotify:",
    "camera": "microsoft.windows.camera:",
    "word": "winword",
    "excel": "excel",
    "vs code": "code",
    "vscode": "code",
}

POLITE = r"^(?:hey |ok |okay )?(?:jarvis[, ]+)?(?:please |can you |could you )?"


def _open_target(name: str) -> str:
    name = name.strip().rstrip(".!").strip()
    key = name.lower()
    if key in APP_ALIASES:
        return APP_ALIASES[key]
    if re.match(r"^https?://", key):
        return name
    if " " not in key and "." in key:  # looks like a website: "reddit.com"
        return f"https://{name}"
    return name


def quick_intent(text: str) -> list[dict] | None:
    """Returns actions for a recognised instant command, else None."""
    original = re.sub(POLITE, "", text.strip(), flags=re.IGNORECASE)  # keeps casing for paths/URLs/text
    t = original.lower().strip(" .!?")
    if not t:
        return None

    if m := re.match(r"^(?:start|launch|open|run)\s+(aider|opencode|open code|goose|cline)(?:\s+(?:in|on)\s+(.+?))?[.!?]*$", original, re.IGNORECASE):
        tool = m.group(1).lower().replace(" ", "")          # local coding agents, each in its own terminal tab
        where = (m.group(2) or "").strip()
        from pathlib import Path
        folder = where if re.match(r"^[A-Za-z]:\\", where) else str(Path.home() / "Projects" / where)
        cmd = (f'New-Item -ItemType Directory -Force "{folder}" | Out-Null; '
               f'Start-Process wt -ArgumentList \'new-tab --title {tool} powershell -NoExit -ExecutionPolicy Bypass -File C:\\Tools\\safe.ps1 {tool} "{folder}"\'')
        return [{"type": "shell", "command": cmd}]
    if m := re.match(r"^(?:find|search for|look for|pull up|where is|where's|get)\s+(?:me\s+)?(?:my|the)\s+(.+?)[.!?]*$", original, re.IGNORECASE):
        return [{"type": "find", "target": m.group(1)}]       # "find my HSE resume" → search the PC for it
    if m := re.match(r"^(?:open|launch|start|go to)\s+(.+?)[.!?]*$", original, re.IGNORECASE):
        return [{"type": "open", "target": _open_target(m.group(1))}]

    if m := re.match(r"^type\s+(.+)$", original, re.IGNORECASE):
        return [{"type": "type", "text": m.group(1)}]

    if re.match(r"^lock(?: (?:my |the )?(?:pc|computer|laptop|screen))?$", t):
        return [{"type": "power", "action": "lock"}]
    if re.match(r"^(?:go to sleep|sleep(?: (?:my |the )?(?:pc|computer|laptop))?)$", t):
        return [{"type": "power", "action": "sleep"}]
    if re.match(r"^(?:shut ?down|turn off|power off)(?: (?:my |the )?(?:pc|computer|laptop))?$", t):
        return [{"type": "power", "action": "shutdown"}]
    if re.match(r"^(?:restart|reboot)(?: (?:my |the )?(?:pc|computer|laptop))?$", t):
        return [{"type": "power", "action": "restart"}]
    if re.match(r"^cancel (?:the )?(?:shut ?down|restart)$", t):
        return [{"type": "power", "action": "cancel"}]

    if re.match(r"^(?:volume up|turn (?:it )?up|louder)$", t):
        return [{"type": "volume", "action": "up"}]
    if re.match(r"^(?:volume down|turn (?:it )?down|quieter|lower (?:the )?volume)$", t):
        return [{"type": "volume", "action": "down"}]
    if re.match(r"^(?:mute|unmute)$", t):
        return [{"type": "volume", "action": "mute"}]

    if re.match(r"^(?:pause|play|resume|play/pause)(?: (?:the )?(?:music|song|video))?$", t):
        return [{"type": "media", "key": "playpause"}]
    if re.match(r"^(?:next|skip)(?: (?:song|track|video))?$", t):
        return [{"type": "media", "key": "next"}]
    if re.match(r"^(?:previous|prev|back)(?: (?:song|track|video))?$", t):
        return [{"type": "media", "key": "prev"}]

    if re.match(r"^(?:show desktop|minimi[sz]e (?:all|everything))$", t):
        return [{"type": "hotkey", "keys": ["win", "d"]}]
    if re.match(r"^close (?:this|the)? ?(?:window|app)$", t):
        return [{"type": "hotkey", "keys": ["alt", "f4"]}]
    if re.match(r"^(?:switch (?:window|app)|alt tab)$", t):
        return [{"type": "hotkey", "keys": ["alt", "tab"]}]
    if re.match(r"^(?:take a )?screenshot$", t):
        return [{"type": "hotkey", "keys": ["win", "printscreen"]}]

    return None


def describe(action: dict) -> str:
    """Short human label for an action chip in the app."""
    t = action.get("type")
    if t == "open":
        return f"Open {action.get('target', '')}"
    if t == "find":
        return f"Find {action.get('target', '')}"
    if t == "type":
        return f"Type “{action.get('text', '')[:40]}”"
    if t == "hotkey":
        return "Press " + "+".join(action.get("keys", []))
    if t == "volume":
        return f"Volume {action.get('action', '')}"
    if t == "media":
        return {"playpause": "Play/Pause", "next": "Next track", "prev": "Previous track"}.get(
            action.get("key", ""), "Media")
    if t == "power":
        return f"{action.get('action', '').capitalize()} PC"
    if t == "shell":
        return f"Run: {action.get('command', '')[:60]}"
    if t == "kill":
        return f"Close process {action.get('pid')}"
    return t or "action"
