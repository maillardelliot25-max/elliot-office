"""
JARVIS — LinkedIn Integration
==============================
Outreach automation, message monitoring, and profile management.
"""

import logging
from typing import Any
import httpx
from config.settings import settings

logger = logging.getLogger("jarvis.linkedin")

INBOX_QUEUE = []


class LinkedInHandler:
    """
    LinkedIn API integration.
    Handles: outreach messaging, connection requests, profile updates.
    """

    BASE_URL = "https://api.linkedin.com/rest"

    def __init__(self):
        self.access_token = settings.LINKEDIN_ACCESS_TOKEN
        self.headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type":  "application/json",
            "LinkedIn-Version": "202401"
        }

    async def send_message(self, recipient_id: str, subject: str, message: str) -> dict:
        """Sends an InMail or connection message."""
        payload = {
            "recipients": [recipient_id],
            "subject":    subject,
            "body":       message
        }
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.BASE_URL}/messaging/conversations",
                json=payload,
                headers=self.headers,
                timeout=15
            )
            resp.raise_for_status()
        logger.info(f"[LINKEDIN] Message sent to {recipient_id}")
        return resp.json()

    async def post_update(self, text: str, media_url: str = None) -> dict:
        """Posts a status update or article."""
        payload = {"commentary": text}
        if media_url:
            payload["media"] = {"url": media_url}

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.BASE_URL}/posts",
                json=payload,
                headers=self.headers
            )
            resp.raise_for_status()
        logger.info(f"[LINKEDIN] Post published: {text[:60]}")
        return resp.json()

    async def poll_messages(self) -> str | None:
        """Checks for new LinkedIn messages."""
        if INBOX_QUEUE:
            return INBOX_QUEUE.pop(0)
        return None

    async def execute(self, step: str, context: dict) -> Any:
        """Routes LinkedIn action steps from the master loop plan."""
        step_lower = step.lower()
        if "message" in step_lower or "send" in step_lower:
            to = context.get("recipient_id", "")
            await self.send_message(to, "Jarvis", step)
            return {"status": "sent"}
        if "post" in step_lower or "publish" in step_lower:
            return await self.post_update(step)
        return {"status": "unknown_action"}
