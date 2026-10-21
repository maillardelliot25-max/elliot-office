"""
God Station — Local Brain (FREE)
=================================
Jarvis thinks with a model running on your own PC through Ollama.
No API keys, no bills, works offline.

Default model: llama3.2:3b. It fits a CPU-only laptop (Intel i7, no
graphics card). Install once:   ollama pull llama3.2:3b

The brain answers in JSON: a reply for you, plus any PC actions it
wants to take ("open youtube", "lock the PC", ...).
"""

import json
import logging
from datetime import datetime

import httpx

logger = logging.getLogger("jarvis.station.brain")

ACTION_TYPES = ["open", "type", "hotkey", "volume", "media", "power", "shell"]

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "reply": {"type": "string"},
        "actions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "type":    {"type": "string", "enum": ACTION_TYPES},
                    "target":  {"type": "string"},
                    "text":    {"type": "string"},
                    "keys":    {"type": "array", "items": {"type": "string"}},
                    "action":  {"type": "string"},
                    "key":     {"type": "string"},
                    "command": {"type": "string"},
                },
                "required": ["type"],
            },
        },
    },
    "required": ["reply", "actions"],
}

SYSTEM_PROMPT = """You are Jarvis, {owner}'s personal AI. You live on {owner}'s PC (the God Station) \
and {owner} is talking to you from their {device}. You can control the PC.

Answer ONLY with JSON: {{"reply": "...", "actions": [...]}}
- "reply": what you say back. Direct, short, no filler.
- "actions": PC actions to take. Use [] when no action is needed.

Actions you can use:
- {{"type": "open", "target": "<app name, file path or https:// URL>"}}
- {{"type": "type", "text": "<text to type>"}}
- {{"type": "hotkey", "keys": ["ctrl", "c"]}}
- {{"type": "volume", "action": "up|down|mute"}}
- {{"type": "media", "key": "playpause|next|prev"}}
- {{"type": "power", "action": "lock|sleep|shutdown|restart|cancel"}}
- {{"type": "shell", "command": "<PowerShell command>"}}

Only take actions {owner} asked for. Never invent facts — if you don't know, say so.
{memories}
Now: {now}"""


class LocalBrain:
    def __init__(self, url: str, model: str, owner: str):
        self.url = url.rstrip("/")
        self.model = model
        self.owner = owner

    async def status(self) -> dict:
        try:
            async with httpx.AsyncClient(timeout=3) as client:
                r = await client.get(f"{self.url}/api/tags")
                r.raise_for_status()
                names = [m.get("name", "") for m in r.json().get("models", [])]
        except Exception:
            return {"online": False, "model": self.model, "installed": False}
        installed = any(n == self.model or n.split(":")[0] == self.model for n in names)
        return {"online": True, "model": self.model, "installed": installed, "available": names}

    async def reply(self, message: str, history: list[dict], memories: list[dict],
                    device: str = "phone") -> dict:
        """Returns {"reply": str, "actions": list}. Raises BrainOffline if Ollama can't be reached."""
        mem_text = ""
        if memories:
            lines = [f"- [{m['ts'][:10]}] {m['role']}: {m['text'][:300]}" for m in memories]
            mem_text = "\nThings from past conversations that may be relevant:\n" + "\n".join(lines) + "\n"

        system = SYSTEM_PROMPT.format(
            owner=self.owner, device=device or "phone", memories=mem_text,
            now=datetime.now().strftime("%A %d %B %Y, %H:%M"),
        )
        messages = [{"role": "system", "content": system}]
        for h in history:
            messages.append({"role": "assistant" if h["role"] == "jarvis" else "user", "content": h["text"]})
        messages.append({"role": "user", "content": message})

        payload = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "format": RESPONSE_SCHEMA,
            "options": {"temperature": 0.3},
        }
        try:
            async with httpx.AsyncClient(timeout=180) as client:
                r = await client.post(f"{self.url}/api/chat", json=payload)
        except httpx.HTTPError as e:
            raise BrainOffline(str(e))
        if r.status_code == 404:
            raise BrainOffline(f"Model '{self.model}' is not installed. On the PC run: ollama pull {self.model}")
        r.raise_for_status()
        return parse_reply(r.json().get("message", {}).get("content", ""))


class BrainOffline(Exception):
    """Ollama isn't running or the model isn't installed."""


def parse_reply(content: str) -> dict:
    """Turn the model's output into {"reply", "actions"}, tolerating sloppy JSON."""
    try:
        data = json.loads(content)
    except (json.JSONDecodeError, TypeError):
        return {"reply": (content or "").strip() or "…", "actions": []}
    if not isinstance(data, dict):
        return {"reply": str(data), "actions": []}
    actions = [a for a in data.get("actions") or [] if isinstance(a, dict) and a.get("type") in ACTION_TYPES]
    return {"reply": str(data.get("reply") or "Done."), "actions": actions}
