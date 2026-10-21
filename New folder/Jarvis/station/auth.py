"""
God Station — Device Pairing
=============================
Only devices you pair can control the PC.

1. The station prints a 6-digit PIN in its window on the PC.
2. You type the PIN into the app on your phone.
3. The phone gets a long secret token and keeps it. The PIN is then
   replaced, so it can only be used once.

Only a hash of each token is stored on disk. Five wrong PINs in a row
replace the PIN, so it can't be guessed.
"""

import hashlib
import json
import logging
import secrets
import threading
from datetime import datetime
from pathlib import Path

logger = logging.getLogger("jarvis.station.auth")

MAX_FAILED_ATTEMPTS = 5


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class DeviceAuth:
    def __init__(self, data_dir: Path):
        self.path = Path(data_dir) / "devices.json"
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self.devices: dict[str, dict] = self._load()
        self.failed = 0
        self.pin = ""
        self.new_pin()

    def _load(self) -> dict:
        if self.path.exists():
            try:
                return json.loads(self.path.read_text())
            except (OSError, json.JSONDecodeError):
                logger.warning("[AUTH] devices.json unreadable, starting fresh")
        return {}

    def _save(self):
        self.path.write_text(json.dumps(self.devices, indent=2))

    def new_pin(self) -> str:
        self.pin = f"{secrets.randbelow(1_000_000):06d}"
        self.failed = 0
        print(f"\n  🔑  PAIRING PIN: {self.pin}   (type this into the app on your phone)\n", flush=True)
        return self.pin

    def pair(self, pin: str, device_name: str) -> str | None:
        """Returns a token on success, None on a wrong PIN."""
        with self._lock:
            if not secrets.compare_digest(str(pin).strip(), self.pin):
                self.failed += 1
                logger.warning(f"[AUTH] Wrong PIN ({self.failed}/{MAX_FAILED_ATTEMPTS})")
                if self.failed >= MAX_FAILED_ATTEMPTS:
                    logger.warning("[AUTH] Too many wrong PINs — issuing a new one")
                    self.new_pin()
                return None

            token = secrets.token_urlsafe(32)
            device_id = secrets.token_hex(4)
            self.devices[device_id] = {
                "name": (device_name or "Device")[:60],
                "token_hash": _hash(token),
                "paired_at": datetime.now().isoformat(timespec="seconds"),
            }
            self._save()
            logger.info(f"[AUTH] Paired device '{device_name}' ({device_id})")
            self.new_pin()  # one-time PIN
            return token

    def check(self, token: str | None) -> str | None:
        """Returns the device id for a valid token, else None."""
        if not token:
            return None
        h = _hash(token)
        for device_id, d in self.devices.items():
            if secrets.compare_digest(d["token_hash"], h):
                return device_id
        return None

    def list(self) -> list[dict]:
        return [{"id": i, "name": d["name"], "paired_at": d["paired_at"]} for i, d in self.devices.items()]

    def revoke(self, device_id: str) -> bool:
        with self._lock:
            if self.devices.pop(device_id, None) is None:
                return False
            self._save()
            return True
