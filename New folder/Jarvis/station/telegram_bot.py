"""
God Station — Telegram
=======================
Talk to Jarvis from Telegram (free), on any device, anywhere — no Tailscale
needed. Same brain, same memory, same PC control as the app.

Only YOUR chat (TELEGRAM_CHAT_ID) is obeyed. Anyone else who finds the bot
is ignored. Risky actions (shut down, terminal…) come with a Run button.

Setup (same as the original Jarvis):
  1. Telegram → @BotFather → /newbot → copy the token
  2. In Jarvis/.env:  TELEGRAM_BOT_TOKEN=...
  3. Start the station, send your bot any message — the station window
     shows your chat id. Put it in .env:  TELEGRAM_CHAT_ID=...  and restart.

Commands:  /screen  /clip  /recall <words>  /status  /help
Send a photo or file → it's saved on the PC.
"""

import asyncio
import logging
import secrets
from pathlib import Path

import httpx
from fastapi.concurrency import run_in_threadpool

logger = logging.getLogger("jarvis.station.telegram")

HELP = """At your service, sir. Talk to me normally, or:
/screen — see the PC screen now
/clip — what's on the PC clipboard
/recall <words> — search what was on screen
/status — PC health
Send me a photo or file and I'll save it on the PC."""


class TelegramBot:
    def __init__(self, token: str, chat_id: str, *, converse, execute, control, recall, settings,
                 save_dir: Path, transport: httpx.AsyncBaseTransport | None = None):
        self.base = f"https://api.telegram.org/bot{token}"
        self.file_base = f"https://api.telegram.org/file/bot{token}"
        self.chat_id = str(chat_id or "")
        self.converse, self.execute = converse, execute
        self.control, self.recall, self.settings = control, recall, settings
        self.save_dir = Path(save_dir)
        self.transport = transport
        self.offset = 0
        self.pending: dict[str, dict] = {}  # Run-button id → action
        self.status = "starting"
        self._told_strangers: set[str] = set()

    def _client(self, timeout=40) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=timeout, transport=self.transport)

    async def api(self, method: str, **kwargs) -> dict:
        async with self._client() as c:
            r = await c.post(f"{self.base}/{method}", **kwargs)
        data = r.json()
        if not data.get("ok"):
            raise RuntimeError(data.get("description", f"Telegram error on {method}"))
        return data.get("result")

    # ── Sending ──────────────────────────────────────────────────────────────

    async def send(self, text: str, buttons: list[list[dict]] | None = None):
        body = {"chat_id": self.chat_id, "text": text[:4000]}
        if buttons:
            body["reply_markup"] = {"inline_keyboard": buttons}
        return await self.api("sendMessage", json=body)

    async def send_photo(self, jpeg: bytes, caption: str = ""):
        return await self.api("sendPhoto", data={"chat_id": self.chat_id, "caption": caption[:1000]},
                              files={"photo": ("screen.jpg", jpeg, "image/jpeg")})

    # ── Receiving ────────────────────────────────────────────────────────────

    async def poll_once(self, wait: int = 25) -> int:
        updates = await self.api("getUpdates", json={"offset": self.offset, "timeout": wait,
                                                     "allowed_updates": ["message", "callback_query"]})
        for u in updates or []:
            self.offset = max(self.offset, u["update_id"] + 1)
            try:
                await self.handle(u)
            except Exception as e:
                logger.exception("[TELEGRAM] couldn't handle an update")
                try:
                    await self.send(f"I'm sorry, sir — something went wrong: {e}")
                except Exception:
                    pass
        return len(updates or [])

    async def run(self):
        failures = 0
        announced = False
        while True:
            if not self.settings["telegram"]:
                self.status = "switched off"
                await asyncio.sleep(5)
                continue
            try:
                if not announced and self.chat_id:
                    await self.send("🟢 Jarvis online, sir. The God Station is at your command.")
                    announced = True
                self.status = "connected" if self.chat_id else "waiting for your first message"
                await self.poll_once()
                failures = 0
            except asyncio.CancelledError:
                raise
            except Exception as e:
                failures += 1
                self.status = f"error: {e}"
                if failures in (1, 10):
                    logger.warning(f"[TELEGRAM] {e}")
                await asyncio.sleep(min(60, 2 * failures))

    async def handle(self, u: dict):
        if cq := u.get("callback_query"):
            return await self.handle_button(cq)
        msg = u.get("message")
        if not msg:
            return
        chat = str(msg["chat"]["id"])
        if not self.chat_id:
            print(f"\n  📨 Telegram message from chat id {chat}. If that's you, add "
                  f"TELEGRAM_CHAT_ID={chat} to Jarvis/.env and restart.\n", flush=True)
            return
        if chat != self.chat_id:
            if chat not in self._told_strangers:
                logger.warning(f"[TELEGRAM] Ignoring a message from a stranger (chat {chat})")
                self._told_strangers.add(chat)
            return

        if msg.get("photo") or msg.get("document"):
            return await self.save_attachment(msg)

        text = (msg.get("text") or "").strip()
        if not text:
            return
        cmd, _, arg = text.partition(" ")
        cmd = cmd.split("@")[0].lower()
        if cmd in ("/start", "/help"):
            return await self.send(HELP)
        if cmd == "/screen":
            jpeg, _, _ = await run_in_threadpool(self.control.screenshot, 1600, 70)
            return await self.send_photo(jpeg, "Your screen, sir.")
        if cmd == "/clip":
            clip = await run_in_threadpool(self.control.get_clipboard)
            return await self.send(clip or "The clipboard is empty, sir.")
        if cmd == "/recall":
            if not arg.strip():
                return await self.send("Tell me what to look for, sir: /recall invoice")
            hits = self.recall.search(arg, limit=8)
            if not hits:
                return await self.send("I didn't see that on your screen, sir.")
            return await self.send("\n\n".join(f"🕑 {h['ts'][:16].replace('T', ' ')} — {h['window']}\n{h['snippet']}"
                                               for h in hits))
        if cmd == "/status":
            s = await run_in_threadpool(self.control.system_info)
            batt = f", battery {s['battery']['percent']}%" if s.get("battery") else ""
            return await self.send(f"{s['hostname']}: CPU {s['cpu_percent']:.0f}%, RAM {s['ram_percent']:.0f}%{batt}, "
                                   f"up {s['uptime_hours']} h.")

        out = await self.converse(text, "Telegram", "Telegram")
        lines, buttons = [out["reply"]], []
        for a in out["actions"]:
            if a["status"] == "confirm":
                key = secrets.token_hex(4)
                self.pending[key] = a["action"]
                buttons.append([{"text": f"▶ Run: {a['label'][:40]}", "callback_data": f"run:{key}"}])
            elif a["status"] == "error":
                lines.append(f"⚠ {a['label']}: {a.get('error')}")
        await self.send("\n".join(lines), buttons or None)

    async def handle_button(self, cq: dict):
        if str(cq.get("from", {}).get("id")) != self.chat_id and str(cq.get("message", {}).get("chat", {}).get("id")) != self.chat_id:
            return
        key = (cq.get("data") or "").removeprefix("run:")
        action = self.pending.pop(key, None)
        await self.api("answerCallbackQuery", json={"callback_query_id": cq["id"],
                                                     "text": "Right away, sir." if action else "That button has expired."})
        if not action:
            return
        res = await run_in_threadpool(self.execute, action, True)
        if res["status"] == "done":
            out = res.get("result") or {}
            text = out.get("message") or f"{res['label']} — done, sir."
            if "stdout" in out:
                text = f"{res['label']}\n{(out['stdout'] or out['stderr'] or '(no output)')[:3500]}"
            await self.send(text)
        else:
            await self.send(f"⚠ {res['label']}: {res.get('error')}")

    async def save_attachment(self, msg: dict):
        if msg.get("photo"):
            file_id, name = msg["photo"][-1]["file_id"], f"telegram_photo_{msg['message_id']}.jpg"
        else:
            doc = msg["document"]
            file_id, name = doc["file_id"], Path(doc.get("file_name") or f"telegram_file_{msg['message_id']}").name
        info = await self.api("getFile", json={"file_id": file_id})
        async with self._client(timeout=120) as c:
            r = await c.get(f"{self.file_base}/{info['file_path']}")
            r.raise_for_status()
        self.save_dir.mkdir(parents=True, exist_ok=True)
        target, n = self.save_dir / name, 1
        while target.exists():
            target = self.save_dir / f"{Path(name).stem} ({n}){Path(name).suffix}"
            n += 1
        target.write_bytes(r.content)
        await self.send(f"Saved on the PC, sir: {target}")
