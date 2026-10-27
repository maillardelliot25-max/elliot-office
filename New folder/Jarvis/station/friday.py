"""
God Station — Friday link
==========================
Two brains, side by side:
  Friday  — the everywhere AI (Chrome, Android, on the go), on port 8765
  Jarvis  — the home base: this PC, files, screen memory, management and data

What the link does (each part has a switch in the app, PC → Friday):
- Shared memory: Jarvis reads what Friday knows about you when he answers,
  and notes saved to Jarvis also go to Friday's memory.
- One brain: optionally, Jarvis thinks with Friday's brain gateway, so every
  model and API key you set up in Friday works for Jarvis too.
- Ask Friday: "ask friday …" in Jarvis's chat.
- Friday can call Jarvis on this PC with station_data/friday.token.

Friday needs its pairing code: Friday → ⚙ Settings → Chrome pairing code.
"""

import json
import logging
import re
import time

import httpx

from station.brain import SYSTEM_PROMPT, BrainOffline, parse_reply

logger = logging.getLogger("jarvis.station.friday")

ASK_FRIDAY = re.compile(r"^(?:hey |ok )?(?:ask|tell) friday[,:]?\s+(.+)$", re.I | re.S)
MEMORY_CACHE_SECONDS = 60


class FridayError(Exception):
    pass


def local_friday_code() -> str:
    """Friday on this PC keeps its pairing code in LocalAI/app/data/settings.json; find it so no pasting is needed."""
    from pathlib import Path
    home = Path.home()
    found = []
    for base in ("Downloads", "Documents", "Desktop", "ElliotAI-Workspace"):
        for pat in ("*/New folder/LocalAI/app/data/settings.json", "*/*/New folder/LocalAI/app/data/settings.json",
                    "*/LocalAI/app/data/settings.json"):
            found += (home / base).glob(pat)
    appdata = Path(__import__("os").getenv("APPDATA", "")) / "Friday" / "data" / "settings.json"
    if appdata.exists():
        found.append(appdata)
    for f in sorted(found, key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            code = json.loads(f.read_text("utf-8")).get("chrome_token", "")
        except (OSError, ValueError):
            continue
        if code:
            return code
    return ""


class FridayLink:
    def __init__(self, settings, transport: httpx.AsyncBaseTransport | None = None):
        self.settings = settings
        self.transport = transport
        self._memories: list[dict] = []
        self._memories_at: float | None = None  # None = never fetched (not 0: uptime can be < 60 s after boot)

    @property
    def url(self) -> str:
        return self.settings["friday_url"].rstrip("/")

    @property
    def code(self) -> str:
        """Friday's pairing code: the one pasted in Jarvis, else read from Friday's own settings on this PC."""
        return self.settings["friday_code"] or local_friday_code()

    @property
    def enabled(self) -> bool:
        return bool(self.settings["friday"] and self.code)

    async def _request(self, method: str, path: str, timeout: float = 10, **kwargs):
        if not self.code:
            raise FridayError("Friday isn't linked yet: paste Friday's pairing code under PC → Friday.")
        try:
            async with httpx.AsyncClient(timeout=timeout, transport=self.transport) as c:
                r = await c.request(method, f"{self.url}{path}",
                                    headers={"X-Jarvis-Token": self.code}, **kwargs)
        except httpx.HTTPError:
            raise FridayError("Friday isn't running on this PC (or is on another port).")
        if r.status_code == 401:
            raise FridayError("Friday rejected the pairing code. Copy it again from Friday → Settings.")
        if r.status_code >= 400:
            try:
                detail = r.json().get("error")
                detail = detail.get("message") if isinstance(detail, dict) else detail
            except (json.JSONDecodeError, AttributeError):
                detail = r.text[:200]
            raise FridayError(f"Friday said: {detail}")
        return r.json()

    # ── Status ───────────────────────────────────────────────────────────────

    async def status(self) -> dict:
        if not self.code:
            return {"linked": False, "online": False, "detail": "not linked"}
        try:
            models = (await self._request("GET", "/v1/models", timeout=4)).get("data", [])
        except FridayError as e:
            return {"linked": True, "online": False, "detail": str(e)}
        return {"linked": True, "online": True, "models": [m["id"] for m in models],
                "detail": f"online · {len(models)} brain{'s' if len(models) != 1 else ''}"}

    # ── Shared memory ────────────────────────────────────────────────────────

    async def memories(self) -> list[dict]:
        if self._memories_at is not None and time.monotonic() - self._memories_at < MEMORY_CACHE_SECONDS:
            return self._memories
        self._memories = (await self._request("GET", "/api/memory")).get("memories", [])
        self._memories_at = time.monotonic()
        return self._memories

    async def relevant_memories(self, query: str, limit: int = 5) -> list[dict]:
        """Friday's facts about you that share words with the question (never raises)."""
        if not (self.enabled and self.settings["friday_share_memory"]):
            return []
        try:
            items = await self.memories()
        except FridayError as e:
            logger.info(f"[FRIDAY] memory skipped: {e}")
            return []
        words = {w for w in re.findall(r"\w+", query.lower()) if len(w) > 2}
        scored = []
        for m in items:
            overlap = len(words & set(re.findall(r"\w+", m.get("text", "").lower())))
            if overlap:
                scored.append((overlap, m))
        scored.sort(key=lambda x: -x[0])
        return [{"ts": time.strftime("%Y-%m-%d", time.localtime(m.get("added", 0))), "role": "friday",
                 "text": f"({m.get('category', 'Other')}) {m['text']}"} for _, m in scored[:limit]]

    async def remember(self, text: str, category: str = "Other") -> bool:
        """Save a fact to Friday's memory too (Friday skips secrets and near-duplicates)."""
        if not (self.enabled and self.settings["friday_share_memory"]):
            return False
        try:
            await self._request("POST", "/api/memory", json={"text": text, "category": category})
            self._memories_at = None  # fetch fresh next time
            return True
        except FridayError as e:
            logger.info(f"[FRIDAY] couldn't share memory: {e}")
            return False

    # ── Friday's brains ──────────────────────────────────────────────────────

    async def chat(self, messages: list[dict], model: str = "") -> str:
        out = await self._request("POST", "/v1/chat/completions", timeout=300,
                                  json={"model": model or self.settings["friday_model"] or "auto",
                                        "messages": messages, "stream": False})
        try:
            return out["choices"][0]["message"]["content"]
        except (KeyError, IndexError):
            raise FridayError("Friday sent back an answer I couldn't read")

    async def ask(self, question: str) -> str:
        """Ask Friday directly (Friday answers with its own memory of you)."""
        return await self.chat([{"role": "user", "content": question}])


class FridayBrain:
    """Jarvis's brain, but thinking through Friday's gateway (any model Friday has)."""

    def __init__(self, link: FridayLink, owner: str):
        self.link, self.owner = link, owner

    @property
    def model(self) -> str:
        return f"Friday ({self.link.settings['friday_model'] or 'auto'})"

    async def reply(self, message: str, history: list[dict], memories: list[dict], device: str = "phone") -> dict:
        from datetime import datetime
        mem_text = ""
        if memories:
            lines = [f"- [{m['ts'][:10]}] {m['role']}: {m['text'][:300]}" for m in memories]
            mem_text = "\nThings from past conversations that may be relevant:\n" + "\n".join(lines) + "\n"
        system = SYSTEM_PROMPT.format(owner=self.owner, device=device or "phone", memories=mem_text,
                                      now=datetime.now().strftime("%A %d %B %Y, %H:%M"))
        messages = [{"role": "system", "content": system}]
        for h in history:
            messages.append({"role": "assistant" if h["role"] == "jarvis" else "user", "content": h["text"]})
        messages.append({"role": "user", "content": message})
        try:
            content = await self.link.chat(messages)
        except FridayError as e:
            raise BrainOffline(str(e))
        # Models without a JSON mode may wrap it in ```json … ```
        content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content.strip())
        return parse_reply(content)
