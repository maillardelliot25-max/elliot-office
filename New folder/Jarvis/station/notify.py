"""
God Station — Notifications
============================
When Jarvis does a job for you (fills a form, signs a PDF…) it tells you
with a real notification on your phone and tablet, even when the app is
closed, and on Telegram if you use it.

Phone/tablet notifications use Web Push, which is free and built into Chrome.
The app must be opened over HTTPS (the Tailscale address, see README),
then: app → PC → Switches → "Notifications on this device".

Keys: station_data/vapid_private.pem (made on first run, stays on the PC).
"""

import json
import logging
import threading
from pathlib import Path

from fastapi.concurrency import run_in_threadpool

logger = logging.getLogger("jarvis.station.notify")


def _webpush(subscription: dict, payload: str, key_file: str):
    from pywebpush import webpush
    webpush(subscription, data=payload, vapid_private_key=key_file,
            vapid_claims={"sub": "mailto:jarvis@god-station.local"}, ttl=3600, timeout=10)


class Notifier:
    def __init__(self, data_dir: Path, settings, sender=None):
        self.settings = settings
        self.key_file = Path(data_dir) / "vapid_private.pem"
        self.subs_file = Path(data_dir) / "push.json"
        self.sender = sender or _webpush
        self.telegram = None  # set by the server when Telegram is configured
        self._lock = threading.Lock()
        self.subs: dict[str, dict] = {}
        if self.subs_file.exists():
            try:
                self.subs = json.loads(self.subs_file.read_text())
            except (OSError, json.JSONDecodeError):
                pass
        self._public_key = ""

    def public_key(self) -> str:
        """The key phones need to subscribe (made once, then reused)."""
        if self._public_key:
            return self._public_key
        from cryptography.hazmat.primitives import serialization
        from py_vapid import Vapid01, b64urlencode
        if self.key_file.exists():
            vapid = Vapid01.from_file(str(self.key_file))
        else:
            vapid = Vapid01()
            vapid.generate_keys()
            vapid.save_key(str(self.key_file))
        raw = vapid.public_key.public_bytes(serialization.Encoding.X962,
                                            serialization.PublicFormat.UncompressedPoint)
        self._public_key = b64urlencode(raw)
        return self._public_key

    def _save(self):
        self.subs_file.write_text(json.dumps(self.subs, indent=2))

    def subscribe(self, device_id: str, subscription: dict):
        if not isinstance(subscription.get("endpoint"), str) or not subscription.get("keys"):
            raise ValueError("Not a push subscription")
        with self._lock:
            self.subs[device_id] = subscription
            self._save()

    def unsubscribe(self, device_id: str):
        with self._lock:
            if self.subs.pop(device_id, None) is not None:
                self._save()

    def is_subscribed(self, device_id: str) -> bool:
        return device_id in self.subs

    async def notify(self, title: str, body: str, url: str = "/", tag: str = "jarvis",
                     telegram: bool = True) -> dict:
        """Send to every subscribed phone/tablet (+ Telegram). Never raises."""
        if not self.settings["notify"]:
            return {"sent": 0, "muted": True}
        self.public_key()  # make sure keys exist
        payload = json.dumps({"title": title, "body": body, "url": url, "tag": tag})
        sent = 0
        for device_id, sub in list(self.subs.items()):
            try:
                await run_in_threadpool(self.sender, sub, payload, str(self.key_file))
                sent += 1
            except Exception as e:
                status = getattr(getattr(e, "response", None), "status_code", None)
                if status in (404, 410):  # phone unsubscribed / app removed
                    logger.info(f"[NOTIFY] {device_id} is gone, removing its subscription")
                    self.unsubscribe(device_id)
                else:
                    logger.warning(f"[NOTIFY] push to {device_id} failed: {e}")
        if telegram and self.telegram and self.settings["telegram"] and self.telegram.chat_id:
            try:
                await self.telegram.send(f"🔔 {title}\n{body}")
                sent += 1
            except Exception as e:
                logger.warning(f"[NOTIFY] Telegram failed: {e}")
        return {"sent": sent}
