"""
JARVIS — Voice Engine (Vapi.ai)
================================
Low-latency, high-fidelity voice via Vapi.
Supports: inbound calls (you call Jarvis) + outbound calls (Jarvis calls you).
Webhook-driven — Vapi handles ASR/TTS; Jarvis handles the logic.
"""

import logging
import httpx
from fastapi import APIRouter, Request
from config.settings import settings

logger = logging.getLogger("jarvis.voice")

router = APIRouter(prefix="/voice", tags=["voice"])


class VapiHandler:
    """
    Manages all voice interactions via the Vapi.ai platform.

    Architecture:
    ┌──────────┐  call   ┌──────────┐  webhook  ┌──────────────┐
    │   User   │ ──────► │  Vapi    │ ────────► │  Jarvis API  │
    │  Phone   │ ◄────── │  (ASR +  │ ◄──────── │  /voice/     │
    └──────────┘  voice  │   TTS)   │  JSON     │  webhook     │
                         └──────────┘           └──────────────┘
    """

    BASE_URL = "https://api.vapi.ai"

    def __init__(self):
        self.api_key     = settings.VAPI_API_KEY
        self.phone_number_id = settings.VAPI_PHONE_NUMBER_ID
        self.assistant_id    = settings.VAPI_ASSISTANT_ID
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type":  "application/json"
        }

    # ─── OUTBOUND: Jarvis calls you ─────────────────────────────────────────
    async def call_user(self, message: str, reason: str = "Update"):
        """
        Initiates an outbound call to the user.
        Used for urgent alerts, deal confirmations, or requested callbacks.
        """
        logger.info(f"[VOICE] Initiating outbound call. Reason: {reason}")
        payload = {
            "phoneNumberId":  self.phone_number_id,
            "customer": {
                "number": settings.OWNER_PHONE
            },
            "assistantId": self.assistant_id,
            "assistantOverrides": {
                "firstMessage": message,
                "model": {
                    "provider": "anthropic",
                    "model":    "claude-opus-4-5",
                    "messages": [{
                        "role":    "system",
                        "content": f"You are Jarvis. This call is regarding: {reason}. "
                                   f"Be concise. Deliver the update, then ask if action is needed."
                    }]
                }
            }
        }

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.BASE_URL}/call/phone",
                json=payload,
                headers=self.headers,
                timeout=15
            )
            resp.raise_for_status()
            call_data = resp.json()
            logger.info(f"[VOICE] Outbound call initiated: {call_data.get('id')}")
            return call_data

    # ─── SPEAK: TTS response injection ─────────────────────────────────────
    async def speak(self, text: str, call_id: str = None):
        """
        Sends a message to an active Vapi call session.
        Used to inject Jarvis responses mid-conversation.
        """
        if not call_id:
            logger.info(f"[VOICE] TTS queued (no active call): {text[:80]}")
            return {"status": "queued", "text": text}

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.BASE_URL}/call/{call_id}/message",
                json={"type": "add-message", "message": {"role": "assistant", "content": text}},
                headers=self.headers
            )
            resp.raise_for_status()
        return resp.json()

    # ─── CREATE / UPDATE ASSISTANT ──────────────────────────────────────────
    async def create_assistant(self) -> dict:
        """
        Creates the Jarvis voice assistant on Vapi.
        Run once during initial setup.
        """
        payload = {
            "name": "Jarvis",
            "model": {
                "provider": "anthropic",
                "model":    "claude-opus-4-5",
                "temperature": 0.3,
                "messages": [{
                    "role":    "system",
                    "content": (
                        f"You are Jarvis, the personal AI for {settings.OWNER_NAME}. "
                        "You are concise, professional, and action-oriented. "
                        "When given a task, confirm receipt, act on it, and report back. "
                        "Never say you cannot do something — find a way or ask one clarifying question."
                    )
                }]
            },
            "voice": {
                "provider": "11labs",
                "voiceId":  "pNInz6obpgDQGcFmaJgB",  # Adam — deep, authoritative
                "stability": 0.5,
                "similarityBoost": 0.75
            },
            "transcriber": {
                "provider": "deepgram",
                "model":    "nova-2",
                "language": "en-US"
            },
            "firstMessage": f"Jarvis online. What do you need, {settings.OWNER_NAME}?",
            "endCallFunctionEnabled": True,
            "recordingEnabled":       True,
            "serverUrl": f"{settings.JARVIS_PUBLIC_URL}/voice/webhook"
        }

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.BASE_URL}/assistant",
                json=payload,
                headers=self.headers
            )
            resp.raise_for_status()
            data = resp.json()
            logger.info(f"[VOICE] Assistant created: {data.get('id')}")
            return data


# ─── VAPI WEBHOOK ENDPOINT ──────────────────────────────────────────────────

@router.post("/webhook")
async def vapi_webhook(request: Request):
    """
    Receives all Vapi events: call-start, transcript, function-call, call-end.
    Routes speech input into the Jarvis master loop via internal task queue.
    """
    from main import task_queue   # avoid circular import
    body = await request.json()
    event_type = body.get("message", {}).get("type")

    logger.info(f"[VOICE WEBHOOK] Event: {event_type}")

    if event_type == "function-call":
        fn   = body["message"]["functionCall"]
        name = fn.get("name")
        args = fn.get("parameters", {})
        logger.info(f"[VOICE] Function call: {name}({args})")
        # Push to task queue for the master loop to pick up
        await task_queue.put({"channel": "voice", "content": f"{name}: {args}"})
        return {"result": f"Task queued: {name}"}

    if event_type == "transcript":
        transcript = body["message"].get("transcript", "")
        if body["message"].get("transcriptType") == "final" and transcript.strip():
            logger.info(f"[VOICE] Transcript: {transcript[:100]}")
            await task_queue.put({"channel": "voice", "content": transcript})

    return {"status": "ok"}
