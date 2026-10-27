"""
God Station — Switches
=======================
Everything you can turn on and off from the phone/tablet app, saved in
station_data/settings.json so it survives restarts.
"""

import json
import logging
import threading
from pathlib import Path

logger = logging.getLogger("jarvis.station.settings")

DEFAULT_EXCLUDE = ["password", "bitwarden", "1password", "lastpass", "keepass",
                   "inprivate", "incognito", "private browsing"]

DEFAULTS = {
    "clipboard": True,             # share copies between PC, phone and tablet
    "recall": True,                # screen memory
    "recall_every_s": 5,           # how often to look at the screen
    "recall_keep_segments": 9,     # 8-hour segments to keep (9 = 3 days)
    "recall_max_gb": 10.0,         # never use more disk than this
    "recall_ocr": True,            # read the text on screen (Windows OCR)
    "recall_exclude": DEFAULT_EXCLUDE,  # never record windows whose title contains these
    "assist": True,                # Chrome form helper
    "telegram": True,              # answer you on Telegram
    "notify": True,                # notifications on phone/tablet/Telegram when Jarvis does a job
    "voice": False,                # "Hey Jarvis" on the PC (uses the microphone, so off until you turn it on)
    "voice_wake": "jarvis",        # the name he answers to
    "syncthing_url": "http://127.0.0.1:8384",
    "syncthing_api_key": "",
    # Friday — the everywhere AI that works side by side with Jarvis
    "friday": True,                # link to Friday when it's running on this PC
    "friday_url": "http://localhost:8765",
    "friday_code": "",             # Friday → Settings → Chrome pairing code
    "friday_share_memory": True,   # read Friday's memory of you; send Jarvis's notes to it
    "friday_brain": False,         # think with Friday's brain gateway instead of Ollama directly
    "friday_model": "auto",
    "claude_brain": False,         # use your own Anthropic key (ANTHROPIC_API_KEY in .env); OFF = 100% free/local        # which of Friday's brains ("auto" = Friday's default)
}
SECRETS = ("syncthing_api_key", "friday_code")

LIMITS = {
    "recall_every_s": (2, 600),
    "recall_keep_segments": (1, 90),
    "recall_max_gb": (0.5, 2000.0),
}


class Settings:
    def __init__(self, data_dir: Path, overrides: dict | None = None):
        self.path = Path(data_dir) / "settings.json"
        self._lock = threading.Lock()
        self.values = dict(DEFAULTS)
        self.values.update(overrides or {})
        if self.path.exists():
            try:
                saved = json.loads(self.path.read_text())
                self.values.update({k: v for k, v in saved.items() if k in DEFAULTS})
            except (OSError, json.JSONDecodeError):
                logger.warning("[SETTINGS] settings.json unreadable, using defaults")

    def __getitem__(self, key):
        return self.values[key]

    def update(self, changes: dict) -> dict:
        clean = {}
        for k, v in changes.items():
            if k not in DEFAULTS:
                raise ValueError(f"Unknown setting: {k}")
            default = DEFAULTS[k]
            if isinstance(default, bool):
                if not isinstance(v, bool):
                    raise ValueError(f"{k} must be on or off")
            elif isinstance(default, (int, float)):
                if isinstance(v, bool) or not isinstance(v, (int, float)):
                    raise ValueError(f"{k} must be a number")
                lo, hi = LIMITS[k]
                v = type(default)(min(max(v, lo), hi))
            elif isinstance(default, list):
                if not isinstance(v, list):
                    raise ValueError(f"{k} must be a list")
                v = [str(x).strip().lower() for x in v if str(x).strip()][:100]
            else:
                v = str(v).strip()
            clean[k] = v
        with self._lock:
            self.values.update(clean)
            self.path.write_text(json.dumps(self.values, indent=2))
        return self.public()

    def public(self) -> dict:
        """Settings safe to show in the app (the Syncthing key is never sent back)."""
        out = {k: v for k, v in self.values.items() if k not in SECRETS}
        out["syncthing_configured"] = bool(self.values["syncthing_api_key"])
        out["friday_linked"] = bool(self.values["friday_code"])
        return out
