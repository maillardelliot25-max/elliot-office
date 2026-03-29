"""
JARVIS — Configuration & Settings
===================================
Single source of truth for all environment variables.
All secrets are loaded from .env — NEVER hardcoded.
"""

import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    # ── Owner Identity ───────────────────────────────────────────
    OWNER_NAME:             str = os.getenv("OWNER_NAME", "Boss")
    OWNER_EMAIL:            str = os.getenv("OWNER_EMAIL", "")
    OWNER_PHONE:            str = os.getenv("OWNER_PHONE", "")          # E.164: +12345678901
    OWNER_WHATSAPP_NUMBER:  str = os.getenv("OWNER_WHATSAPP_NUMBER", "")

    # ── Server ────────────────────────────────────────────────────
    PORT:                   int = int(os.getenv("PORT", 8000))
    JARVIS_PUBLIC_URL:      str = os.getenv("JARVIS_PUBLIC_URL", "https://your-jarvis.up.railway.app")
    IDLE_POLL_SECONDS:      int = int(os.getenv("IDLE_POLL_SECONDS", 15))

    # ── AI Models ────────────────────────────────────────────────
    ANTHROPIC_API_KEY:      str = os.getenv("ANTHROPIC_API_KEY", "")   # Claude brain
    GOOGLE_API_KEY:         str = os.getenv("GOOGLE_API_KEY", "")      # Nanobanana + Veo (images/video)

    # ── Memory (local Chroma — free) ─────────────────────────────
    CHROMA_PERSIST_DIR:     str = os.getenv("CHROMA_PERSIST_DIR", "./jarvis_memory")

    # ── Voice (Vapi) ─────────────────────────────────────────────
    VAPI_API_KEY:           str = os.getenv("VAPI_API_KEY", "")
    VAPI_PHONE_NUMBER_ID:   str = os.getenv("VAPI_PHONE_NUMBER_ID", "")
    VAPI_ASSISTANT_ID:      str = os.getenv("VAPI_ASSISTANT_ID", "")

    # ── Telegram (Primary channel — zero restrictions) ───────────
    TELEGRAM_BOT_TOKEN:       str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    TELEGRAM_CHAT_ID:         str = os.getenv("TELEGRAM_CHAT_ID", "")

    # ── WhatsApp (Meta Cloud API) ────────────────────────────────
    WHATSAPP_PHONE_NUMBER_ID: str = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "880684635006473")
    WHATSAPP_ACCESS_TOKEN:    str = os.getenv("WHATSAPP_ACCESS_TOKEN", "")
    WHATSAPP_VERIFY_TOKEN:    str = os.getenv("WHATSAPP_VERIFY_TOKEN", "jarvis-verify-2026")

    # ── Gmail (Google OAuth2) ────────────────────────────────────
    GMAIL_CLIENT_ID:        str = os.getenv("GMAIL_CLIENT_ID", "")
    GMAIL_CLIENT_SECRET:    str = os.getenv("GMAIL_CLIENT_SECRET", "")
    GMAIL_ACCESS_TOKEN:     str = os.getenv("GMAIL_ACCESS_TOKEN", "")
    GMAIL_REFRESH_TOKEN:    str = os.getenv("GMAIL_REFRESH_TOKEN", "")

    # ── LinkedIn ─────────────────────────────────────────────────
    LINKEDIN_CLIENT_ID:     str = os.getenv("LINKEDIN_CLIENT_ID", "")
    LINKEDIN_CLIENT_SECRET: str = os.getenv("LINKEDIN_CLIENT_SECRET", "")
    LINKEDIN_ACCESS_TOKEN:  str = os.getenv("LINKEDIN_ACCESS_TOKEN", "")

    # ── Image & Video Generation (Nanobanana = Google Gemini) ────
    # GOOGLE_API_KEY above covers this — same key for brain + images + video

    # ── Screen Vision ────────────────────────────────────────────
    SCREEN_CAPTURE_ENABLED: bool = os.getenv("SCREEN_CAPTURE_ENABLED", "true").lower() == "true"

    # ── GitHub (Autonomous Deployment) ───────────────────────────
    GITHUB_TOKEN:           str = os.getenv("GITHUB_TOKEN", "")
    GITHUB_USERNAME:        str = os.getenv("GITHUB_USERNAME", "")

    # ── Vercel ───────────────────────────────────────────────────
    VERCEL_TOKEN:           str = os.getenv("VERCEL_TOKEN", "")

    # ── Bookkeeping (Plaid) ──────────────────────────────────────
    PLAID_CLIENT_ID:        str = os.getenv("PLAID_CLIENT_ID", "")
    PLAID_SECRET:           str = os.getenv("PLAID_SECRET", "")
    PLAID_ACCESS_TOKEN:     str = os.getenv("PLAID_ACCESS_TOKEN", "")   # from Plaid Link

    def validate(self) -> list[str]:
        """Returns a list of missing critical credentials."""
        # Free edition: only Telegram OR WhatsApp required (not both)
        has_telegram  = bool(self.TELEGRAM_BOT_TOKEN and self.TELEGRAM_CHAT_ID)
        has_whatsapp  = bool(self.WHATSAPP_ACCESS_TOKEN)
        missing = []
        if not has_telegram and not has_whatsapp:
            missing.append("TELEGRAM_BOT_TOKEN or WHATSAPP_ACCESS_TOKEN (need at least one)")
        return missing


settings = Settings()
