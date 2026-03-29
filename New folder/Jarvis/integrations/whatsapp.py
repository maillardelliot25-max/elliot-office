"""
JARVIS — WhatsApp Integration (Twilio / Meta Cloud API)
=======================================================
Bidirectional messaging. You can command Jarvis via WhatsApp.
Jarvis sends you updates, alerts, and task completions here.
"""

import logging
import httpx
from fastapi import APIRouter, Request
from config.settings import settings

logger = logging.getLogger("jarvis.whatsapp")
router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])

INBOX_QUEUE = []   # in-memory queue; swap for Redis in production


class WhatsAppHandler:
    """
    WhatsApp via Meta Cloud API (free, 1000 msgs/month free tier).
    Fallback: Twilio WhatsApp sandbox for testing.
    """

    META_API_URL = "https://graph.facebook.com/v20.0"

    def __init__(self):
        self.phone_number_id = settings.WHATSAPP_PHONE_NUMBER_ID
        self.access_token    = settings.WHATSAPP_ACCESS_TOKEN
        self.owner_number    = settings.OWNER_WHATSAPP_NUMBER  # e.g. "12345678901"

    async def send(self, message: str, to: str = None):
        """Sends a text message to the user (or a specified number)."""
        recipient = to or self.owner_number
        payload = {
            "messaging_product": "whatsapp",
            "to": recipient,
            "type": "text",
            "text": {"body": message[:4096]}
        }
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.META_API_URL}/{self.phone_number_id}/messages",
                json=payload,
                headers={
                    "Authorization": f"Bearer {self.access_token}",
                    "Content-Type":  "application/json"
                },
                timeout=10
            )
            resp.raise_for_status()
        logger.info(f"[WHATSAPP] Sent to {recipient}: {message[:60]}...")
        return resp.json()

    async def send_template(self, template_name: str, variables: list[str], to: str = None):
        """Sends a pre-approved WhatsApp template message."""
        recipient = to or self.owner_number
        components = []
        if variables:
            components.append({
                "type": "body",
                "parameters": [{"type": "text", "text": v} for v in variables]
            })
        payload = {
            "messaging_product": "whatsapp",
            "to": recipient,
            "type": "template",
            "template": {
                "name":       template_name,
                "language":   {"code": "en_US"},
                "components": components
            }
        }
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.META_API_URL}/{self.phone_number_id}/messages",
                json=payload,
                headers={"Authorization": f"Bearer {self.access_token}"},
                timeout=10
            )
            resp.raise_for_status()
        return resp.json()

    async def poll_inbox(self) -> str | None:
        """
        Returns the oldest unread message from the queue.
        The queue is populated by the /whatsapp/webhook endpoint.
        """
        if INBOX_QUEUE:
            return INBOX_QUEUE.pop(0)
        return None

    async def execute(self, step: str, context: dict) -> dict:
        """Executes a WhatsApp action step from the master loop plan."""
        # step example: "Send WhatsApp to +1234 about deal closure"
        # In production, parse intent and recipient from step
        await self.send(f"[Jarvis Action] {step}")
        return {"status": "sent", "step": step}


# ─── WEBHOOK ────────────────────────────────────────────────────────────────

@router.get("/webhook")
async def verify_webhook(request: Request):
    """Meta webhook verification handshake."""
    params = request.query_params
    if (params.get("hub.mode") == "subscribe" and
            params.get("hub.verify_token") == settings.WHATSAPP_VERIFY_TOKEN):
        return int(params.get("hub.challenge", 0))
    return {"error": "Forbidden"}, 403


@router.post("/webhook")
async def receive_message(request: Request):
    """
    Receives inbound WhatsApp messages.
    Pushes them to the master loop task queue.
    """
    body = await request.json()
    try:
        entry   = body["entry"][0]
        changes = entry["changes"][0]
        value   = changes["value"]
        messages = value.get("messages", [])

        for msg in messages:
            if msg.get("type") == "text":
                text   = msg["text"]["body"]
                sender = msg["from"]
                logger.info(f"[WHATSAPP] Inbound from {sender}: {text[:80]}")

                # Only process messages from the owner
                if sender == settings.OWNER_WHATSAPP_NUMBER:
                    INBOX_QUEUE.append(text)
                else:
                    logger.warning(f"[WHATSAPP] Ignored message from unknown number: {sender}")

    except (KeyError, IndexError) as e:
        logger.warning(f"[WHATSAPP] Webhook parse error: {e}")

    return {"status": "ok"}
