"""
JARVIS — Telegram Integration (Primary Channel)
================================================
Fully free. Zero restrictions. Works instantly.

Features:
- Text commands
- Photo/screenshot analysis (Claude Vision)
- File/document handling
- Inline commands (/screen, /update, /status, /fix)
- Two-way conversation
"""

import asyncio
import logging
import httpx
from config.settings import settings

logger = logging.getLogger("jarvis.telegram")

TELEGRAM_API = "https://api.telegram.org/bot"

# Commands Jarvis understands via Telegram
COMMANDS = {
    "/screen":  "Analyze the current screen",
    "/status":  "Show Jarvis status",
    "/fix":     "Fix the last error",
    "/update":  "Update Jarvis (provide instructions)",
    "/memory":  "Search memory",
    "/deploy":  "Deploy latest code",
    "/help":    "Show all commands",
}


class TelegramHandler:
    """
    Telegram Bot API — zero setup friction, instant, free.
    Supports text, images, commands, and file uploads.
    """

    def __init__(self):
        self.token   = settings.TELEGRAM_BOT_TOKEN
        self.chat_id = settings.TELEGRAM_CHAT_ID
        self.base    = f"{TELEGRAM_API}{self.token}"
        self._offset = 0
        self._last_photo: bytes | None = None  # stores last received photo bytes
        logger.info("[TELEGRAM] Handler initialized")

    async def send(self, message: str) -> bool:
        """Send a text message."""
        if not self.token:
            logger.warning("[TELEGRAM] No bot token configured")
            return False

        # Split long messages (Telegram 4096 char limit)
        chunks = [message[i:i+4000] for i in range(0, len(message), 4000)]

        async with httpx.AsyncClient() as client:
            for chunk in chunks:
                try:
                    resp = await client.post(
                        f"{self.base}/sendMessage",
                        json={
                            "chat_id":    self.chat_id,
                            "text":       chunk,
                            "parse_mode": "Markdown"
                        },
                        timeout=10
                    )
                    if resp.status_code != 200:
                        logger.error(f"[TELEGRAM] Send failed: {resp.text}")
                        return False
                except Exception as e:
                    logger.error(f"[TELEGRAM] Error: {e}")
                    return False

        logger.info(f"[TELEGRAM] Sent: {message[:60]}...")
        return True

    async def send_image(self, image_path: str, caption: str = "") -> bool:
        """Send an image file."""
        if not self.token:
            return False

        async with httpx.AsyncClient() as client:
            try:
                with open(image_path, "rb") as f:
                    resp = await client.post(
                        f"{self.base}/sendPhoto",
                        data={"chat_id": self.chat_id, "caption": caption},
                        files={"photo": f},
                        timeout=30
                    )
                return resp.status_code == 200
            except Exception as e:
                logger.error(f"[TELEGRAM] Image send error: {e}")
                return False

    async def send_file(self, file_path: str, caption: str = "") -> bool:
        """Send a document/file."""
        if not self.token:
            return False

        async with httpx.AsyncClient() as client:
            try:
                with open(file_path, "rb") as f:
                    resp = await client.post(
                        f"{self.base}/sendDocument",
                        data={"chat_id": self.chat_id, "caption": caption},
                        files={"document": f},
                        timeout=30
                    )
                return resp.status_code == 200
            except Exception as e:
                logger.error(f"[TELEGRAM] File send error: {e}")
                return False

    async def poll_inbox(self) -> dict | None:
        """
        Poll for new messages.
        Returns dict with 'text', 'photo_bytes', 'type'.
        """
        if not self.token:
            return None

        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get(
                    f"{self.base}/getUpdates",
                    params={
                        "offset":  self._offset,
                        "timeout": 5,
                        "limit":   1,
                        "allowed_updates": ["message"]
                    },
                    timeout=10
                )

                if resp.status_code != 200:
                    return None

                data    = resp.json()
                updates = data.get("result", [])

                if not updates:
                    return None

                update = updates[0]
                self._offset = update["update_id"] + 1

                message = update.get("message", {})
                from_id = message.get("from", {}).get("id")

                # Only accept messages from you
                if str(from_id) != str(self.chat_id):
                    return None

                # Text message
                text = message.get("text", "")
                if text:
                    logger.info(f"[TELEGRAM] Text: {text[:80]}")
                    return {"type": "text", "content": text}

                # Photo message (user sent a screenshot)
                photos = message.get("photo", [])
                if photos:
                    # Get highest resolution
                    best_photo = max(photos, key=lambda p: p.get("file_size", 0))
                    file_id    = best_photo["file_id"]
                    photo_bytes = await self._download_file(file_id)
                    caption    = message.get("caption", "What do you see in this image?")

                    logger.info(f"[TELEGRAM] Photo received ({len(photo_bytes)//1024}KB)")
                    return {
                        "type":        "photo",
                        "content":     caption or "What do you see in this image?",
                        "photo_bytes": photo_bytes
                    }

                # Document/file
                document = message.get("document")
                if document:
                    file_id    = document["file_id"]
                    file_name  = document.get("file_name", "document")
                    file_bytes = await self._download_file(file_id)
                    caption    = message.get("caption", f"Process this file: {file_name}")
                    logger.info(f"[TELEGRAM] Document: {file_name}")
                    return {
                        "type":       "document",
                        "content":    caption,
                        "file_bytes": file_bytes,
                        "file_name":  file_name
                    }

                return None

            except Exception as e:
                logger.error(f"[TELEGRAM] Poll error: {e}")
                return None

    async def _download_file(self, file_id: str) -> bytes:
        """Download a file from Telegram servers."""
        async with httpx.AsyncClient() as client:
            # Get file path
            resp  = await client.get(f"{self.base}/getFile", params={"file_id": file_id})
            fpath = resp.json()["result"]["file_path"]

            # Download
            token = self.token
            url   = f"https://api.telegram.org/file/bot{token}/{fpath}"
            dl    = await client.get(url, timeout=30)
            return dl.content

    async def get_my_chat_id(self) -> str | None:
        """
        Auto-detect your chat ID.
        Call this after sending /start to your bot.
        """
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get(f"{self.base}/getUpdates", timeout=10)
                data = resp.json()
                updates = data.get("result", [])
                if updates:
                    chat_id = updates[-1]["message"]["from"]["id"]
                    logger.info(f"[TELEGRAM] Your chat ID: {chat_id}")
                    return str(chat_id)
            except Exception as e:
                logger.error(f"[TELEGRAM] Could not get chat ID: {e}")
        return None

    async def execute(self, step: str, context: dict) -> dict:
        result = await self.send(f"Jarvis executing: {step}")
        return {"status": "sent", "step": step}
