"""
God Station — Configuration
============================
Everything is read from environment variables (or Jarvis/.env).
All defaults are free and local.
"""

import os
from dataclasses import dataclass, field
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


def _bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


@dataclass
class StationConfig:
    host:         str  = "0.0.0.0"
    port:         int  = 8780
    data_dir:     Path = Path("station_data")
    allow_shell:  bool = True                       # God mode terminal from your phone
    ollama_url:   str  = "http://localhost:11434"   # Free local brain
    ollama_model: str  = "llama3.2:3b"              # Small enough for a CPU-only laptop
    owner_name:   str  = "Boss"
    upload_dir:   Path = field(default_factory=lambda: Path.home() / "Downloads" / "Jarvis")
    clipboard_history: bool = True                  # remember what you copy on the PC
    telegram_token:   str = ""                      # same .env names as the original Jarvis
    telegram_chat_id: str = ""

    @property
    def outbox_dir(self) -> Path:
        """Files sent to your phone with right-click → Send to → Jarvis phone."""
        return self.upload_dir / "To phone"

    @classmethod
    def from_env(cls) -> "StationConfig":
        return cls(
            host=os.getenv("STATION_HOST", "0.0.0.0"),
            port=int(os.getenv("STATION_PORT", 8780)),
            data_dir=Path(os.getenv("STATION_DATA_DIR", "station_data")),
            allow_shell=_bool("STATION_ALLOW_SHELL", True),
            ollama_url=os.getenv("OLLAMA_URL", "http://localhost:11434").rstrip("/"),
            ollama_model=os.getenv("OLLAMA_MODEL", "llama3.2:3b"),
            owner_name=os.getenv("OWNER_NAME", "Boss"),
            upload_dir=Path(os.getenv("STATION_UPLOAD_DIR", str(Path.home() / "Downloads" / "Jarvis"))),
            clipboard_history=_bool("STATION_CLIPBOARD_HISTORY", True),
            telegram_token=os.getenv("TELEGRAM_BOT_TOKEN", "").strip(),
            telegram_chat_id=os.getenv("TELEGRAM_CHAT_ID", "").strip(),
        )
