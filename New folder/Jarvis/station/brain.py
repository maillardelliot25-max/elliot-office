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
                models = r.json().get("models", [])
                names = [m.get("name", "") for m in models]
                sizes = {m.get("name", ""): m.get("size", 0) for m in models}
        except Exception:
            return {"online": False, "model": self.model, "installed": False}
        installed = any(n == self.model or n.split(":")[0] == self.model for n in names)
        if not installed:
            # Share whatever brain is already on the PC (e.g. Friday's qwen3) instead of downloading another
            # Smallest first: a 30B model on a 16 GB PC freezes it. Skip anything over ~9 GB.
            chat = sorted((n for n in names if "embed" not in n and "-vl" not in n and sizes.get(n, 0) < 9e9),
                          key=lambda n: sizes.get(n, 0))
            prefer = [n for n in chat if n.startswith(("qwen3:8b", "qwen3:4b", "llama3"))]
            chat = prefer + [n for n in chat if n not in prefer]
            if chat:
                self.model, installed = chat[0], True
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
        if r.status_code == 404 and (await self.status()).get("installed"):
            payload["model"] = self.model
            async with httpx.AsyncClient(timeout=180) as client:
                r = await client.post(f"{self.url}/api/chat", json=payload)
        if r.status_code == 404:
            raise BrainOffline(f"Model '{self.model}' is not installed. On the PC run: ollama pull {self.model}")
        r.raise_for_status()
        return parse_reply(r.json().get("message", {}).get("content", ""))


    async def fill_form(self, url: str, title: str, fields: list[dict], profile: dict,
                        memories: list[dict]) -> list[dict]:
        return await fill_form(self, url, title, fields, profile, memories)


class ClaudeBrain:
    """Optional paid brain (bring your own Anthropic key). Only used when the
    'claude_brain' switch is ON and ANTHROPIC_API_KEY is set; any error falls back to Ollama."""

    def __init__(self, api_key: str, model: str, owner: str):
        self.api_key = api_key
        self.model = model
        self.owner = owner

    async def reply(self, message: str, history: list[dict], memories: list[dict],
                    device: str = "phone") -> dict:
        if not self.api_key:
            raise BrainOffline("No ANTHROPIC_API_KEY in .env")
        mem_text = ""
        if memories:
            mem_text = "\nThings from past conversations that may be relevant:\n" + "\n".join(
                f"- [{m['ts'][:10]}] {m['role']}: {m['text'][:300]}" for m in memories) + "\n"
        system = SYSTEM_PROMPT.format(owner=self.owner, device=device or "phone", memories=mem_text,
                                      now=datetime.now().strftime("%A %d %B %Y, %H:%M"))
        msgs = [{"role": "assistant" if h["role"] == "jarvis" else "user", "content": h["text"]} for h in history]
        msgs.append({"role": "user", "content": message})
        # The API needs strictly alternating roles starting with "user"
        merged: list[dict] = []
        for m in msgs:
            if merged and merged[-1]["role"] == m["role"]:
                merged[-1]["content"] += "\n" + m["content"]
            elif merged or m["role"] == "user":
                merged.append(dict(m))
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                r = await client.post("https://api.anthropic.com/v1/messages", json={
                    "model": self.model, "max_tokens": 1024, "system": system, "messages": merged,
                }, headers={"x-api-key": self.api_key, "anthropic-version": "2023-06-01"})
            r.raise_for_status()
            text = "".join(b.get("text", "") for b in r.json().get("content", []) if b.get("type") == "text")
        except (httpx.HTTPError, ValueError) as e:
            raise BrainOffline(f"Claude unavailable: {e}")
        start, end = text.find("{"), text.rfind("}")
        return parse_reply(text[start:end + 1] if start >= 0 < end else text)


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


FILL_SCHEMA = {
    "type": "object",
    "properties": {
        "values": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"i": {"type": "integer"}, "value": {"type": "string"}},
                "required": ["i", "value"],
            },
        },
    },
    "required": ["values"],
}

FILL_PROMPT = """You fill in web forms for {owner}. Page: "{title}" ({url}).

What you know about {owner}:
{profile}
{memories}
Form fields that still need answers (i = field number):
{fields}

Answer ONLY with JSON: {{"values": [{{"i": <field number>, "value": "<text>"}}]}}
Only include fields you are confident about from the information above. Never invent facts,
passwords, card numbers or ID numbers. For a field with options, use one of the options exactly."""


async def fill_form(brain: "LocalBrain", url: str, title: str, fields: list[dict],
                    profile: dict, memories: list[dict]) -> list[dict]:
    """Ask the local brain for the fields the profile couldn't answer."""
    if not fields:
        return []
    lines = []
    for f in fields[:40]:
        desc = f"{f['i']}: {(f.get('label') or f.get('placeholder') or f.get('name') or '?')[:120]}"
        if f.get("options"):
            desc += f"  (options: {', '.join(o[:40] for o in f['options'][:25])})"
        lines.append(desc)
    prof = "\n".join(f"- {k}: {v}" for k, v in profile.items() if v) or "- (nothing saved yet)"
    mem = ""
    if memories:
        mem = "\nFrom past conversations:\n" + "\n".join(f"- {m['text'][:200]}" for m in memories) + "\n"
    prompt = FILL_PROMPT.format(owner=brain.owner, title=title[:120], url=url[:200],
                                profile=prof, memories=mem, fields="\n".join(lines))
    payload = {"model": brain.model, "messages": [{"role": "user", "content": prompt}],
               "stream": False, "format": FILL_SCHEMA, "options": {"temperature": 0.1}}
    try:
        async with httpx.AsyncClient(timeout=180) as client:
            r = await client.post(f"{brain.url}/api/chat", json=payload)
        r.raise_for_status()
        data = json.loads(r.json().get("message", {}).get("content", "") or "{}")
    except (httpx.HTTPError, json.JSONDecodeError, ValueError):
        return []
    valid = {f["i"] for f in fields}
    return [{"i": v["i"], "value": str(v["value"]), "source": "jarvis"}
            for v in data.get("values", [])
            if isinstance(v, dict) and v.get("i") in valid and str(v.get("value", "")).strip()]
