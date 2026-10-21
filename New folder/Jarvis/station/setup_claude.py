"""
Connect Jarvis to the Claude desktop app (one time).
Adds a "jarvis" entry to Claude's config so Claude can use Jarvis's tools.
Run:  setup_claude_link.bat   (then fully quit and reopen Claude)
"""

import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def config_path() -> Path:
    if sys.platform == "win32":
        return Path(os.environ["APPDATA"]) / "Claude" / "claude_desktop_config.json"
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "Claude" / "claude_desktop_config.json"
    return Path.home() / ".config" / "Claude" / "claude_desktop_config.json"


def main():
    path = config_path()
    config = {}
    if path.exists():
        try:
            config = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            backup = path.with_suffix(".json.bak")
            path.rename(backup)
            print(f"Your old Claude config was unreadable; saved a copy as {backup}")
    config.setdefault("mcpServers", {})["jarvis"] = {
        "command": sys.executable,
        "args": [str(HERE / "mcp_server.py")],
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(config, indent=2), encoding="utf-8")
    print(f"Done. Jarvis is connected to Claude ({path}).")
    print("Fully quit Claude (tray icon -> Quit) and open it again.")
    print()
    print("Using Claude Code too? Run this once:")
    print(f'  claude mcp add jarvis -- "{sys.executable}" "{HERE / "mcp_server.py"}"')


if __name__ == "__main__":
    main()
