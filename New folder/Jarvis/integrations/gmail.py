"""
JARVIS — Gmail Integration (Google OAuth2)
==========================================
Full read/write access to Gmail.
Jarvis can: read unread emails, draft & send, reply, label, search, and archive.
"""

import base64
import logging
import re
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from config.settings import settings

logger = logging.getLogger("jarvis.gmail")

SCOPES = [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly"
]


class GmailHandler:
    def __init__(self):
        self.creds   = self._load_credentials()
        self.service = build("gmail", "v1", credentials=self.creds)

    def _load_credentials(self) -> Credentials:
        """Loads OAuth2 credentials from stored token."""
        creds = Credentials(
            token=settings.GMAIL_ACCESS_TOKEN,
            refresh_token=settings.GMAIL_REFRESH_TOKEN,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=settings.GMAIL_CLIENT_ID,
            client_secret=settings.GMAIL_CLIENT_SECRET,
            scopes=SCOPES
        )
        # Auto-refresh if expired
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            logger.info("[GMAIL] Token refreshed.")
        return creds

    # ─── READ ────────────────────────────────────────────────────────────────
    async def poll_unread(self, max_results: int = 5) -> str | None:
        """
        Checks for unread emails matching priority criteria.
        Returns the most important one as a task string.
        """
        try:
            result = self.service.users().messages().list(
                userId="me",
                q="is:unread category:primary",
                maxResults=max_results
            ).execute()

            messages = result.get("messages", [])
            if not messages:
                return None

            # Get the first unread message
            msg_id = messages[0]["id"]
            return await self._parse_message(msg_id)

        except HttpError as e:
            logger.error(f"[GMAIL] Poll error: {e}")
            return None

    async def _parse_message(self, msg_id: str) -> str:
        """Parses a Gmail message into a clean task string."""
        msg = self.service.users().messages().get(
            userId="me", id=msg_id, format="full"
        ).execute()

        headers = {h["name"]: h["value"] for h in msg["payload"]["headers"]}
        subject = headers.get("Subject", "(No Subject)")
        sender  = headers.get("From", "Unknown")
        body    = self._extract_body(msg["payload"])

        # Mark as read
        self.service.users().messages().modify(
            userId="me", id=msg_id,
            body={"removeLabelIds": ["UNREAD"]}
        ).execute()

        return f"EMAIL from {sender} | Subject: {subject} | Body: {body[:500]}"

    def _extract_body(self, payload: dict) -> str:
        """Extracts plain text from the email payload."""
        if "body" in payload and payload["body"].get("data"):
            return base64.urlsafe_b64decode(payload["body"]["data"]).decode("utf-8", errors="ignore")
        if "parts" in payload:
            for part in payload["parts"]:
                if part["mimeType"] == "text/plain":
                    data = part["body"].get("data", "")
                    if data:
                        return base64.urlsafe_b64decode(data).decode("utf-8", errors="ignore")
        return "(No body)"

    async def search(self, query: str, max_results: int = 10) -> list[dict]:
        """Searches Gmail with a query string."""
        result = self.service.users().messages().list(
            userId="me", q=query, maxResults=max_results
        ).execute()

        emails = []
        for msg_ref in result.get("messages", []):
            msg = self.service.users().messages().get(
                userId="me", id=msg_ref["id"], format="metadata",
                metadataHeaders=["Subject", "From", "Date"]
            ).execute()
            headers = {h["name"]: h["value"] for h in msg["payload"]["headers"]}
            emails.append({
                "id":      msg["id"],
                "subject": headers.get("Subject"),
                "from":    headers.get("From"),
                "date":    headers.get("Date"),
                "snippet": msg.get("snippet", "")
            })
        return emails

    # ─── WRITE ───────────────────────────────────────────────────────────────
    async def send(
        self,
        to: str,
        subject: str,
        body: str,
        html_body: str = None,
        reply_to_id: str = None
    ) -> dict:
        """Composes and sends an email."""
        msg = MIMEMultipart("alternative") if html_body else MIMEText(body)
        msg["to"]      = to
        msg["subject"] = subject
        msg["from"]    = settings.OWNER_EMAIL

        if html_body:
            msg.attach(MIMEText(body,      "plain"))
            msg.attach(MIMEText(html_body, "html"))

        raw     = base64.urlsafe_b64encode(msg.as_bytes()).decode()
        payload = {"raw": raw}

        if reply_to_id:
            payload["threadId"] = reply_to_id

        result = self.service.users().messages().send(
            userId="me", body=payload
        ).execute()

        logger.info(f"[GMAIL] Sent email to {to}: {subject}")
        return result

    async def send_reply(self, response: str, thread_id: str = None):
        """Sends a reply — used by the RESPOND node."""
        if thread_id:
            await self.send(
                to=settings.OWNER_EMAIL,
                subject="Jarvis Update",
                body=response,
                reply_to_id=thread_id
            )
        else:
            logger.info(f"[GMAIL] Response logged (no thread): {response[:100]}")

    async def execute(self, step: str, context: dict) -> dict:
        """Parses and executes an email action step from the plan."""
        step_lower = step.lower()
        if "send" in step_lower or "reply" in step_lower:
            # Extract recipient and content from step (LLM-parsed in production)
            to      = context.get("email_recipient", settings.OWNER_EMAIL)
            subject = context.get("email_subject", "Jarvis Update")
            body    = step
            return await self.send(to=to, subject=subject, body=body)
        elif "read" in step_lower or "check" in step_lower:
            return await self.poll_unread()
        elif "search" in step_lower:
            query = re.sub(r"search email[s]?[:\s]*", "", step, flags=re.I).strip()
            return await self.search(query)
        return {"status": "unknown_action", "step": step}

    async def label_email(self, msg_id: str, label: str):
        """Applies a label to an email."""
        # Create label if it doesn't exist
        labels = self.service.users().labels().list(userId="me").execute()
        label_id = next(
            (l["id"] for l in labels.get("labels", []) if l["name"] == label), None
        )
        if not label_id:
            new_label = self.service.users().labels().create(
                userId="me", body={"name": label, "labelListVisibility": "labelShow"}
            ).execute()
            label_id = new_label["id"]

        self.service.users().messages().modify(
            userId="me", id=msg_id, body={"addLabelIds": [label_id]}
        ).execute()
        logger.info(f"[GMAIL] Labeled {msg_id} as '{label}'")
