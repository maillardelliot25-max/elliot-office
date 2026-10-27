"""
God Station — API Server
=========================
The phone app talks to these endpoints. Every /api route except
/api/pair needs the device token from pairing.
"""

import asyncio
import os
import logging
from datetime import datetime
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from station import __version__, docs
from station.assist import PROFILE_FIELDS, Profile, fill_from_profile, greeting
from station.auth import DeviceAuth
from station.passkeys import Passkeys, secure_origin
from station.hotspot import HotspotKeeper
from station.brain import BrainOffline, ClaudeBrain, LocalBrain
from station.config import StationConfig
from station.friday import ASK_FRIDAY, FridayBrain, FridayError, FridayLink
from station.controls import ControlError, PCControl
from station.intents import describe, quick_intent
from station.memory import StationMemory
from station.notify import Notifier
from station.recall import RecallStore, Recorder, load_ocr, segment_of
from station.settings import Settings
from station.syncthing import Syncthing, SyncthingError
from station.telegram_bot import TelegramBot
from station.voice import VoiceAssistant

logger = logging.getLogger("jarvis.station")

STATIC_DIR = Path(__file__).parent / "static"

# Actions that can't be undone wait for you to tap "Run" in the app
CONFIRM_POWER = {"sleep", "shutdown", "restart"}


def needs_confirm(action: dict) -> bool:
    t = action.get("type")
    return t in ("shell", "kill") or (t == "power" and action.get("action") in CONFIRM_POWER)


# ── Request bodies ───────────────────────────────────────────────────────────

class PasskeyBody(BaseModel):
    credential: dict
    device: str = "Phone"
    retire_pin_pairing: bool = True

class PairBody(BaseModel):
    pin: str
    device: str = "Phone"

class MouseBody(BaseModel):
    action: str
    x: float | None = None
    y: float | None = None
    dx: float = 0
    dy: float = 0
    button: str = "left"

class KeyboardBody(BaseModel):
    text: str | None = None
    keys: list[str] | None = None

class KeyBody(BaseModel):
    key: str

class ActionBody(BaseModel):
    action: str

class TargetBody(BaseModel):
    target: str

class TextBody(BaseModel):
    text: str

class CommandBody(BaseModel):
    command: str

class PidBody(BaseModel):
    pid: int

class ChatBody(BaseModel):
    message: str
    device: str = "phone"

class RunActionBody(BaseModel):
    action: dict

class PausedBody(BaseModel):
    paused: bool

class PathBody(BaseModel):
    path: str

class NotifyBody(BaseModel):
    title: str = "Jarvis"
    body: str

class SubscribeBody(BaseModel):
    subscription: dict

class FormBody(BaseModel):
    url: str = ""
    title: str = ""
    fields: list[dict]


# ── App ──────────────────────────────────────────────────────────────────────

def create_app(config: StationConfig, control: PCControl | None = None,
               brain: LocalBrain | None = None, telegram_transport=None, push_sender=None,
               friday_transport=None, voice_parts: dict | None = None) -> FastAPI:
    config.data_dir.mkdir(parents=True, exist_ok=True)
    auth = DeviceAuth(config.data_dir)
    passkeys = Passkeys(config.data_dir, config.owner_name)
    hotspot = HotspotKeeper(config.port)
    app_secure_url = {"url": None}   # set by __main__ once Tailscale's https address is up
    memory = StationMemory(config.data_dir / "memory.db")
    control = control or PCControl(upload_dir=config.upload_dir)
    brain = brain or LocalBrain(config.ollama_url, config.ollama_model, config.owner_name)
    settings = Settings(config.data_dir, overrides=None if config.clipboard_history else {"clipboard": False})
    profile = Profile(config.data_dir)
    recall = RecallStore(config.data_dir / "recall")
    recorder = Recorder(recall, control, settings, ocr=load_ocr())
    signature_path = config.data_dir / "signature.png"
    notifier = Notifier(config.data_dir, settings, sender=push_sender)
    auth.ensure_local_token(config.data_dir / "claude.token", "Claude (this PC)")
    auth.ensure_local_token(config.data_dir / "friday.token", "Friday (this PC)")
    friday = FridayLink(settings, transport=friday_transport)
    friday_brain = FridayBrain(friday, config.owner_name)
    claude_brain = ClaudeBrain(config.anthropic_key, config.claude_model, config.owner_name)

    async def watch_clipboard():
        """Every copy on the PC lands in the shared clipboard history."""
        failures = 0
        while True:
            if not settings["clipboard"]:
                await asyncio.sleep(2)
                continue
            try:
                memory.add_clip(await run_in_threadpool(control.get_clipboard), "PC")
                failures = 0
            except Exception as e:
                failures += 1
                if failures == 1:
                    logger.warning(f"[CLIP] Can't read the PC clipboard: {e}")
            await asyncio.sleep(1 if failures < 5 else 15)

    async def watch_screen():
        """Recall: look at the screen every few seconds (only saves when something changed)."""
        last_error = ""
        while True:
            try:
                await run_in_threadpool(recorder.tick)
                last_error = ""
            except Exception as e:
                recorder.last_status = f"error: {e}"
                if str(e) != last_error:
                    logger.warning(f"[RECALL] {e}")
                    last_error = str(e)
            await asyncio.sleep(settings["recall_every_s"])

    @asynccontextmanager
    async def lifespan(_app):
        tasks = [asyncio.create_task(watch_clipboard()), asyncio.create_task(watch_screen())]
        if telegram:
            tasks.append(asyncio.create_task(telegram.run()))
        voice.start(asyncio.get_running_loop())
        if os.name == "nt" and os.getenv("JARVIS_HOTSPOT", "1") != "0":
            hotspot.start()
        yield
        voice.stop()
        for task in tasks:
            task.cancel()

    app = FastAPI(title="Jarvis — God Station", version=__version__, docs_url=None, redoc_url=None,
                  lifespan=lifespan)
    app.state.auth = auth
    app.state.memory = memory
    app.state.settings = settings
    app.state.recall = recall
    app.state.recorder = recorder
    app.state.notifier = notifier
    app.state.friday = friday
    app.state.secure_url = app_secure_url
    telegram = None  # set below, once converse/execute exist

    def device(authorization: str = Header(default="")) -> str:
        token = authorization.removeprefix("Bearer ").strip()
        device_id = auth.check(token) or passkeys.check(token)
        if not device_id:
            raise HTTPException(401, "Not paired. Enter the PIN shown on your PC.")
        return device_id

    async def call(fn, *args, **kwargs):
        """Run a (blocking) control call off the event loop; turn failures into clean errors."""
        try:
            return await run_in_threadpool(fn, *args, **kwargs)
        except ControlError as e:
            raise HTTPException(400, str(e))

    def run_action_sync(action: dict) -> dict:
        t = action.get("type")
        if t == "open":
            return control.open(action.get("target", ""))
        if t == "type":
            return control.type_text(action.get("text", ""))
        if t == "hotkey":
            return control.hotkey(action.get("keys") or [])
        if t == "volume":
            return control.volume(action.get("action", ""))
        if t == "media":
            return control.media(action.get("key", ""))
        if t == "power":
            return control.power(action.get("action", ""))
        if t == "shell":
            if not config.allow_shell:
                raise ControlError("Terminal is turned off on this PC (STATION_ALLOW_SHELL=false)")
            return control.shell(action.get("command", ""))
        if t == "kill":
            return control.kill(int(action.get("pid", 0)))
        raise ControlError(f"Unknown action: {t}")

    def execute(action: dict, confirmed: bool) -> dict:
        out = {"action": action, "label": describe(action)}
        if needs_confirm(action) and not confirmed:
            return {**out, "status": "confirm"}
        try:
            return {**out, "status": "done", "result": run_action_sync(action)}
        except ControlError as e:
            return {**out, "status": "error", "error": str(e)}
        except Exception as e:  # never let one action crash the chat
            logger.exception("[ACTION] failed")
            return {**out, "status": "error", "error": str(e)}

    # ── Pairing ──────────────────────────────────────────────────────────────

    @app.post("/api/pair")
    def pair(body: PairBody):
        token = auth.pair(body.pin, body.device)
        if not token:
            raise HTTPException(401, "Wrong PIN. Check the God Station window on your PC.")
        return {"token": token, "owner": config.owner_name}

    # ── Fingerprint unlock (passkeys) ───────────────────────────────────────
    def passkey_page(request: Request) -> tuple[str, str]:
        if not passkeys.available():
            raise HTTPException(503, "Fingerprint unlock needs an update on the PC: run install_station.bat.")
        page = secure_origin(request.headers.get("origin"))
        if not page:
            raise HTTPException(400, "Fingerprint unlock only works on Jarvis's secure address: "
                                     + (app_secure_url["url"] or "https://<your-pc>.ts.net (turn on Tailscale)"))
        return page

    @app.get("/api/passkey/status")
    def passkey_status():
        return {"available": passkeys.available(), "registered": bool(passkeys.keys),
                "secure_url": app_secure_url["url"]}

    @app.post("/api/passkey/register/options")
    def passkey_register_options(request: Request, _: str = Depends(device)):
        _, rp_id = passkey_page(request)
        return Response(passkeys.register_options(rp_id), media_type="application/json")

    @app.post("/api/passkey/register")
    def passkey_register(body: PasskeyBody, request: Request, device_id: str = Depends(device)):
        origin, rp_id = passkey_page(request)
        try:
            session = passkeys.register_verify(body.credential, origin, rp_id, body.device)
        except Exception as e:
            raise HTTPException(400, f"Fingerprint setup failed: {e}")
        if body.retire_pin_pairing and device_id in auth.devices and not device_id.startswith("local-"):
            auth.revoke(device_id)   # from now on this phone gets in with its fingerprint only
        return session

    @app.post("/api/passkey/login/options")
    def passkey_login_options(request: Request):
        _, rp_id = passkey_page(request)
        return Response(passkeys.login_options(rp_id), media_type="application/json")

    @app.post("/api/passkey/login")
    def passkey_login(body: PasskeyBody, request: Request):
        origin, rp_id = passkey_page(request)
        try:
            return passkeys.login_verify(body.credential, origin, rp_id)
        except Exception as e:
            raise HTTPException(401, str(e))

    @app.get("/api/hotspot")
    def hotspot_info(_: str = Depends(device)):
        """The PC's hotspot (name + password), so the phone apps can join it on their own."""
        return hotspot.state if hotspot.state.get("ssid") else hotspot.check()

    @app.get("/api/ping")
    def ping(device_id: str = Depends(device)):
        import socket
        return {"ok": True, "owner": config.owner_name, "host": socket.gethostname(),
                "allow_shell": config.allow_shell, "version": __version__, "device_id": device_id,
                "secure_url": app_secure_url["url"], "fingerprint": device_id.startswith("fp-")}

    @app.get("/api/devices")
    def devices(_: str = Depends(device)):
        return auth.list()

    @app.delete("/api/devices/{device_id}")
    def revoke(device_id: str, _: str = Depends(device)):
        if not auth.revoke(device_id):
            raise HTTPException(404, "No such device")
        return {"ok": True}

    # ── Screen, mouse, keyboard ──────────────────────────────────────────────

    @app.get("/api/screen")
    async def screen(w: int = Query(1280, ge=320, le=3840), q: int = Query(60, ge=10, le=95),
                     _: str = Depends(device)):
        jpeg, sw, sh = await call(control.screenshot, w, q)
        return Response(jpeg, media_type="image/jpeg",
                        headers={"Cache-Control": "no-store", "X-Screen-Size": f"{sw}x{sh}"})

    @app.post("/api/mouse")
    async def mouse(body: MouseBody, _: str = Depends(device)):
        return await call(control.mouse, body.action, body.x, body.y, body.dx, body.dy, body.button)

    @app.post("/api/keyboard")
    async def keyboard(body: KeyboardBody, _: str = Depends(device)):
        if body.text:
            return await call(control.type_text, body.text)
        if body.keys:
            return await call(control.hotkey, body.keys)
        raise HTTPException(400, "Send text or keys")

    @app.post("/api/volume")
    async def volume(body: ActionBody, _: str = Depends(device)):
        return await call(control.volume, body.action)

    @app.post("/api/media")
    async def media(body: KeyBody, _: str = Depends(device)):
        return await call(control.media, body.key)

    @app.post("/api/power")
    async def power(body: ActionBody, _: str = Depends(device)):
        return await call(control.power, body.action)

    @app.post("/api/open")
    async def open_target(body: TargetBody, _: str = Depends(device)):
        actions = quick_intent(f"open {body.target}") or [{"type": "open", "target": body.target}]
        return await call(control.open, actions[0]["target"])

    # ── Clipboard ────────────────────────────────────────────────────────────

    @app.get("/api/clipboard")
    async def get_clipboard(_: str = Depends(device)):
        return {"text": await call(control.get_clipboard)}

    @app.post("/api/clipboard")
    async def set_clipboard(body: TextBody, device_id: str = Depends(device)):
        result = await call(control.set_clipboard, body.text)
        memory.add_clip(body.text, auth.devices.get(device_id, {}).get("name", "Phone"))
        return result

    @app.get("/api/clips")
    def clips(limit: int = Query(50, ge=1, le=500), _: str = Depends(device)):
        return memory.clips(limit)

    @app.delete("/api/clips")
    def clear_clips(_: str = Depends(device)):
        memory.clear_clips()
        return {"ok": True}

    # ── Outbox: PC → phone (right-click a file → Send to → Jarvis phone) ────

    @app.get("/api/outbox")
    async def outbox(_: str = Depends(device)):
        config.outbox_dir.mkdir(parents=True, exist_ok=True)
        listing = await call(control.list_dir, str(config.outbox_dir))
        files = [e for e in listing["entries"] if not e["is_dir"]]
        files.sort(key=lambda e: e["modified"], reverse=True)
        return {"folder": str(config.outbox_dir), "files": files}

    @app.delete("/api/outbox")
    def outbox_remove(name: str, _: str = Depends(device)):
        target = config.outbox_dir / Path(name).name  # only files inside the outbox
        if not target.is_file():
            raise HTTPException(404, "Not in the outbox")
        target.unlink()
        return {"ok": True}

    # ── System, processes, terminal ──────────────────────────────────────────

    @app.get("/api/system")
    async def system(_: str = Depends(device)):
        info = await call(control.system_info)
        info["memory_messages"] = memory.count()
        return info

    @app.get("/api/processes")
    async def processes(_: str = Depends(device)):
        return await call(control.processes)

    @app.post("/api/processes/kill")
    async def kill(body: PidBody, _: str = Depends(device)):
        return await call(control.kill, body.pid)

    @app.post("/api/shell")
    async def shell(body: CommandBody, device_id: str = Depends(device)):
        if not config.allow_shell:
            raise HTTPException(403, "Terminal is turned off on this PC (STATION_ALLOW_SHELL=false)")
        logger.info(f"[SHELL] {device_id}: {body.command}")
        return await call(control.shell, body.command)

    # ── Files ────────────────────────────────────────────────────────────────

    @app.get("/api/files")
    async def files(path: str = "", _: str = Depends(device)):
        return await call(control.list_dir, path)

    @app.get("/api/files/download")
    async def download(path: str, _: str = Depends(device)):
        p = await call(control.resolve_file, path)
        return FileResponse(p, filename=p.name)

    @app.post("/api/files/upload")
    async def upload(file: UploadFile = File(...), folder: str = Form(""), _: str = Depends(device)):
        return await call(control.save_upload, file.filename or "upload.bin", file.file, folder)

    # ── Jarvis chat + memory ─────────────────────────────────────────────────

    @app.post("/api/brain/pull")
    async def brain_pull(_: str = Depends(device)):
        """Download the local model through Ollama (one tap from the phone)."""
        import asyncio, httpx as _hx

        async def _pull():
            try:
                async with _hx.AsyncClient(timeout=None) as c:
                    await c.post(f"{config.ollama_url}/api/pull", json={"model": config.ollama_model, "stream": False})
                logger.info(f"[BRAIN] pulled {config.ollama_model}")
            except Exception as e:
                logger.warning(f"[BRAIN] pull failed: {e}")
        asyncio.create_task(_pull())
        return {"ok": True, "model": config.ollama_model}

    @app.get("/api/brain")
    async def brain_status(_: str = Depends(device)):
        return await brain.status()

    async def converse(message: str, device_name: str, device_kind: str = "phone") -> dict:
        """One conversation turn — shared by the app and Telegram."""
        history = memory.recent(8)
        memories = memory.search(message, limit=5, exclude_ids={h["id"] for h in history})
        memories += await friday.relevant_memories(message)  # what Friday knows about you
        for hit in recall.search(message, limit=3, any_word=True):  # what was on screen
            memories.append({"ts": hit["ts"], "role": "screen",
                             "text": f"in '{hit['window']}': {hit['snippet']}"})
        memory.add("you", message, device_name)

        # 0. "ask friday …" → straight to Friday, the everywhere AI
        if m := ASK_FRIDAY.match(message):
            try:
                reply = "Friday says: " + (await friday.ask(m.group(1).strip())).strip()
            except FridayError as e:
                reply = f"I couldn't reach Friday, sir. {e}"
            memory.add("jarvis", reply, device_name)
            return {"reply": reply, "actions": [], "brain": "friday"}

        # 1. Instant commands — no AI needed
        actions = quick_intent(message)
        if actions is not None:
            results = [await run_in_threadpool(execute, a, False) for a in actions]
            reply = _summarise(results)
            memory.add("jarvis", reply, device_name)
            return {"reply": reply, "actions": results, "brain": "instant"}

        # 2. The brain: Friday's gateway if chosen (falls back to Ollama), else Ollama
        thinker = brain
        try:
            if settings["claude_brain"] and config.anthropic_key:
                try:
                    out = await claude_brain.reply(message, history, memories, device=device_kind)
                    thinker = claude_brain
                except BrainOffline as e:
                    logger.info(f"[CLAUDE] unavailable, using local: {e}")
                    out = await brain.reply(message, history, memories, device=device_kind)
            elif settings["friday_brain"] and friday.enabled:
                try:
                    out = await friday_brain.reply(message, history, memories, device=device_kind)
                    thinker = friday_brain
                except BrainOffline as e:
                    logger.info(f"[FRIDAY] brain unavailable, using local: {e}")
                    out = await brain.reply(message, history, memories, device=device_kind)
            else:
                out = await brain.reply(message, history, memories, device=device_kind)
        except BrainOffline as e:
            reply = ("My brain is offline, so I can only do instant commands right now "
                     "(open …, lock, volume up, pause, next, show desktop, type …). "
                     f"To wake my brain, on the PC run Ollama. ({e})")
            return {"reply": reply, "actions": [], "brain": "offline"}

        results = [await run_in_threadpool(execute, a, False) for a in out["actions"]]
        memory.add("jarvis", out["reply"], device_name)
        return {"reply": out["reply"], "actions": results, "brain": thinker.model}

    if config.telegram_token:
        telegram = TelegramBot(config.telegram_token, config.telegram_chat_id, converse=converse,
                               execute=execute, control=control, recall=recall, settings=settings,
                               save_dir=config.upload_dir, transport=telegram_transport)
    app.state.telegram = telegram
    notifier.telegram = telegram

    # ── "Hey Jarvis" voice on the PC ─────────────────────────────────────────
    voice = VoiceAssistant(lambda command: converse(command, "Voice (PC)", "voice"),
                           lambda action: execute(action, True), settings, config.data_dir, **(voice_parts or {}))
    app.state.voice = voice

    @app.get("/api/voice")
    def voice_status(_: str = Depends(device)):
        return voice.status()

    @app.post("/api/voice/say")
    async def voice_say(body: TextBody, _: str = Depends(device)):
        """Jarvis says something out loud on the PC (from the app, Friday or Claude)."""
        await run_in_threadpool(voice.say, body.text[:1000])
        return {"ok": True}

    # ── Setup checklist ──────────────────────────────────────────────────────

    @app.get("/api/setup")
    async def setup(_: str = Depends(device)):
        """What's ready and what's missing, with the fix for each."""
        import json as _json
        import os
        import platform
        from station.__main__ import local_addresses
        from station.setup_claude import config_path

        names = [d["name"] for d in auth.list()]
        b = await brain.status()
        vals = profile.values()
        try:
            claude_ok = "jarvis" in _json.loads(config_path().read_text(encoding="utf-8")).get("mcpServers", {})
        except Exception:
            claude_ok = False
        sync_ok, sync_detail = False, "not connected"
        if settings["syncthing_api_key"]:
            try:
                n = len(await syncthing().folders())
                sync_ok, sync_detail = True, f"{n} folder{'s' if n != 1 else ''}"
            except SyncthingError as e:
                sync_detail = str(e)
        windows = platform.system() == "Windows"
        autostart = None
        if windows:
            autostart = (Path(os.environ.get("APPDATA", "")) / "Microsoft" / "Windows" / "Start Menu" / "Programs"
                         / "Startup" / "Jarvis God Station.lnk").exists()
        tailscale = [ip for label, ip in local_addresses() if ip.startswith("100.")]
        fstat = await friday.status()
        has_tg = bool(config.telegram_token and config.telegram_chat_id)

        checks = [
            ("devices", "Phone / tablet paired", any(not n.startswith(("Claude", "Chrome")) for n in names),
             f"{len(names)} paired", "Open the app on the device and enter the PIN from the station window."),
            ("brain", "Jarvis's brain (Ollama)", b["online"] and b.get("installed", False),
             f"{b['model']} ready" if b["online"] and b.get("installed") else ("Ollama running, model missing" if b["online"] else "Ollama not running"),
             f"Run install_extras.bat, or install Ollama from ollama.com and run: ollama pull {b['model']}"),
            ("remote", "Reach the PC from anywhere (Tailscale)", bool(tailscale),
             f"Tailscale {tailscale[0]}" if tailscale else "only on home Wi-Fi",
             "Install Tailscale on the PC and phone (install_extras.bat), sign in with the same account."),
            ("notify", "Notifications on phone/tablet", bool(notifier.subs),
             f"{len(notifier.subs)} device(s)", "Open the app via the https:// Tailscale address → PC → Switches → Notifications on this device."),
            ("details", "My details (for forms)", bool(vals["full_name"] and vals["email"]),
             vals["full_name"] or "empty", "PC → My details → fill in at least your name and email."),
            ("signature", "Signature (for PDFs)", signature_path.exists(), "saved" if signature_path.exists() else "none",
             "PC → Signature → draw it → Save signature."),
            ("extension", "Chrome form helper", any(n.startswith("Chrome") for n in names),
             "paired" if any(n.startswith("Chrome") for n in names) else "not paired",
             "chrome://extensions → Developer mode → Load unpacked → Jarvis/extension → click its icon → enter the PIN."),
            ("claude", "Claude link", claude_ok, "connected" if claude_ok else "not set up",
             "Install the Claude desktop app, then double-click setup_claude_link.bat and restart Claude."),
            ("telegram", "Telegram", has_tg, telegram.status if telegram else "not set up",
             "@BotFather → /newbot → put TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Jarvis/.env (README §10)."),
            ("voice", "“Hey Jarvis” voice on the PC", settings["voice"] and voice.state.startswith("listening"),
             voice.state, "PC → Switches → “Hey Jarvis” voice. (If it says voice isn't installed, run install_station.bat again.)"),
            ("friday", "Friday link (the everywhere AI)", fstat["online"], fstat["detail"],
             "Start Friday, then paste its pairing code (Friday → Settings) under PC → Friday."),
            ("sync", "Photo / music / file sync (Syncthing)", sync_ok, sync_detail,
             "Install Syncthing (install_extras.bat), share folders, paste its API key under PC → Photos, music & files sync."),
        ]
        if windows:
            checks += [
                ("ocr", "Screen text reading (OCR)", recorder.ocr is not None, "on" if recorder.ocr else "not installed",
                 "In the Jarvis folder run: .venv\\Scripts\\python -m pip install winocr  — then restart the station."),
                ("autostart", "Starts with Windows", bool(autostart), "yes" if autostart else "no",
                 "Double-click install_autostart.bat."),
            ]
        items = [{"key": k, "label": l, "ok": bool(ok), "detail": d, "fix": f} for k, l, ok, d, f in checks]
        return {"ready": sum(i["ok"] for i in items), "total": len(items), "items": items}

    # ── Notifications ────────────────────────────────────────────────────────

    @app.get("/api/push/key")
    def push_key(device_id: str = Depends(device)):
        return {"key": notifier.public_key(), "subscribed": notifier.is_subscribed(device_id)}

    @app.post("/api/push/subscribe")
    def push_subscribe(body: SubscribeBody, device_id: str = Depends(device)):
        try:
            notifier.subscribe(device_id, body.subscription)
        except ValueError as e:
            raise HTTPException(400, str(e))
        return {"ok": True}

    @app.delete("/api/push/subscribe")
    def push_unsubscribe(device_id: str = Depends(device)):
        notifier.unsubscribe(device_id)
        return {"ok": True}

    @app.post("/api/notify")
    async def notify(body: NotifyBody, _: str = Depends(device)):
        """Send a notification to your phone/tablet (+ Telegram). Used by Chrome, Claude and the test button."""
        return await notifier.notify(body.title[:100], body.body[:1000])

    @app.post("/api/chat")
    async def chat(body: ChatBody, device_id: str = Depends(device)):
        message = body.message.strip()
        if not message:
            raise HTTPException(400, "Empty message")
        device_name = auth.devices.get(device_id, {}).get("name", body.device)
        return await converse(message, device_name, body.device)

    @app.post("/api/actions/run")
    async def run_action(body: RunActionBody, device_id: str = Depends(device)):
        logger.info(f"[ACTION] {device_id} confirmed: {body.action}")
        return await run_in_threadpool(execute, body.action, True)

    @app.get("/api/memory/search")
    def memory_search(q: str, limit: int = Query(20, ge=1, le=100), _: str = Depends(device)):
        return memory.search(q, limit=limit)

    @app.get("/api/memory/recent")
    def memory_recent(limit: int = Query(50, ge=1, le=500), _: str = Depends(device)):
        return memory.recent(limit)

    @app.post("/api/memory/note")
    async def memory_note(body: TextBody, device_id: str = Depends(device)):
        """Lets Claude, Friday (or you) save something for Jarvis to remember."""
        name = auth.devices.get(device_id, {}).get("name", "note")
        text = body.text.strip()[:5000]
        shared = False
        if not name.startswith("Friday"):  # don't echo Friday's own notes back to it
            shared = await friday.remember(text[:300])
        return {"id": memory.add("note", text, name), "shared_with_friday": shared}

    @app.get("/api/friday")
    async def friday_status(_: str = Depends(device)):
        return {**(await friday.status()), "enabled": settings["friday"], "brain": settings["friday_brain"], "claude_brain": settings["claude_brain"],
                "share_memory": settings["friday_share_memory"], "model": settings["friday_model"],
                "url": settings["friday_url"]}

    # ── Switches ─────────────────────────────────────────────────────────────

    def settings_view() -> dict:
        out = settings.public()
        out["telegram_status"] = telegram.status if telegram else "not set up (add TELEGRAM_BOT_TOKEN to .env)"
        return out

    @app.get("/api/settings")
    def get_settings(_: str = Depends(device)):
        return settings_view()

    @app.patch("/api/settings")
    def patch_settings(body: dict, device_id: str = Depends(device)):
        try:
            out = settings.update(body)
        except ValueError as e:
            raise HTTPException(400, str(e))
        logger.info(f"[SETTINGS] {device_id} changed {[k for k in body if k != 'syncthing_api_key']}")
        return {**out, "telegram_status": settings_view()["telegram_status"]}

    # ── Photo / music / file sync (Syncthing) ────────────────────────────────

    def syncthing() -> Syncthing:
        return Syncthing(settings["syncthing_url"], settings["syncthing_api_key"])

    @app.get("/api/sync/folders")
    async def sync_folders(_: str = Depends(device)):
        try:
            return {"connected": True, "folders": await syncthing().folders()}
        except SyncthingError as e:
            return {"connected": False, "error": str(e), "folders": []}

    @app.post("/api/sync/folders/{folder_id}")
    async def sync_toggle(folder_id: str, body: PausedBody, _: str = Depends(device)):
        try:
            return await syncthing().set_paused(folder_id, body.paused)
        except SyncthingError as e:
            raise HTTPException(400, str(e))

    # ── Recall: screen memory ────────────────────────────────────────────────

    @app.get("/api/recall/status")
    def recall_status(_: str = Depends(device)):
        import shutil
        segs = recall.segments()
        free = shutil.disk_usage(recall.root).free
        return {"enabled": settings["recall"], "status": recorder.last_status,
                "last_saved": recorder.last_saved, "current_segment": segment_of(datetime.now()),
                "segments": len(segs), "total_bytes": sum(s["bytes"] for s in segs),
                "max_bytes": int(settings["recall_max_gb"] * 2**30), "disk_free_bytes": free,
                "ocr": recorder.ocr is not None}

    @app.get("/api/insights")
    def insights(day: str = "", _: str = Depends(device)):
        """Where your time went: minutes per app, per hour, and the week, from screen memory."""
        from datetime import date as _date
        try:
            d = _date.fromisoformat(day) if day else datetime.now().date()
        except ValueError:
            raise HTTPException(400, "day must look like 2026-10-22")
        return {**recall.activity(d), "week": recall.week(d)}

    @app.get("/api/recall/segments")
    def recall_segments(_: str = Depends(device)):
        return recall.segments()

    @app.delete("/api/recall/segments/{segment}")
    def recall_delete(segment: str, _: str = Depends(device)):
        if not recall.delete_segment(segment):
            raise HTTPException(404, "No such segment")
        return {"ok": True}

    @app.get("/api/recall/frames")
    def recall_frames(segment: str = "", before_id: int | None = None,
                      limit: int = Query(48, ge=1, le=200), _: str = Depends(device)):
        return recall.frames(segment or None, limit, before_id)

    @app.get("/api/recall/search")
    def recall_search(q: str, limit: int = Query(40, ge=1, le=200), _: str = Depends(device)):
        return recall.search(q, limit)

    @app.get("/api/recall/frame/{frame_id}")
    def recall_frame(frame_id: int, w: int = Query(0, ge=0, le=4000), _: str = Depends(device)):
        path = recall.frame_path(frame_id)
        if not path or not path.exists():
            raise HTTPException(404, "Frame not found (it may have been cleaned up)")
        if not w:
            return FileResponse(path, media_type="image/jpeg")
        import io
        from PIL import Image
        img = Image.open(path)
        img.thumbnail((w, w))
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=60)
        return Response(buf.getvalue(), media_type="image/jpeg", headers={"Cache-Control": "max-age=86400"})

    # ── Your details + Assist (form helper) ──────────────────────────────────

    @app.get("/api/profile")
    def get_profile(_: str = Depends(device)):
        return {"fields": [{"key": k, "label": label} for k, label in PROFILE_FIELDS],
                "values": profile.data}

    @app.put("/api/profile")
    def put_profile(body: dict, _: str = Depends(device)):
        return {"values": profile.update(body)}

    @app.get("/api/assist/status")
    def assist_status(_: str = Depends(device)):
        return {"enabled": settings["assist"], "greeting": greeting(), "owner": config.owner_name}

    @app.post("/api/assist/fill")
    async def assist_fill(body: FormBody, device_id: str = Depends(device)):
        if not settings["assist"]:
            raise HTTPException(403, "The form helper is switched off (turn it on in the app: PC → Switches).")
        fields = [f for f in body.fields if isinstance(f.get("i"), int)][:200]
        values = profile.values()
        filled, unknown = fill_from_profile(fields, values)
        if unknown:
            hints = " ".join(f.get("label") or f.get("name") or "" for f in unknown)
            mems = memory.search(f"{body.title} {hints}", limit=5)
            try:
                filled += await brain.fill_form(body.url, body.title, unknown, values, mems)
            except Exception as e:
                logger.warning(f"[ASSIST] brain couldn't help: {e}")
        n = len(filled)
        page = body.title or body.url
        memory.add("jarvis", f"Filled {n} field(s) on “{page}” ({body.url})", "Chrome")
        if n:
            msg = f"Done, sir. I filled {n} field{'s' if n != 1 else ''}. Please check them before you submit."
            await notifier.notify("Jarvis", f"Done, sir — I filled {n} field{'s' if n != 1 else ''} on “{page[:80]}”. "
                                  "Check them before you submit.", tag="assist")
        else:
            msg = "I'm sorry, sir — I don't know what goes in these. Add your details in the app (PC → My details)."
        return {"values": filled, "message": msg}

    # ── Signature + PDFs ─────────────────────────────────────────────────────

    @app.post("/api/signature")
    async def put_signature(file: UploadFile = File(...), _: str = Depends(device)):
        try:
            docs.save_signature(await file.read(), signature_path)
        except docs.DocError as e:
            raise HTTPException(400, str(e))
        return {"ok": True}

    @app.get("/api/signature")
    def get_signature(_: str = Depends(device)):
        if not signature_path.exists():
            raise HTTPException(404, "No signature saved yet")
        return FileResponse(signature_path, media_type="image/png", headers={"Cache-Control": "no-store"})

    @app.post("/api/docs/sign")
    async def doc_sign(body: PathBody, _: str = Depends(device)):
        try:
            out = await run_in_threadpool(docs.sign_pdf, body.path, signature_path)
        except docs.DocError as e:
            raise HTTPException(400, str(e))
        await notifier.notify("Jarvis", f"Signed, sir. {out['message']}", tag="docs")
        return out

    @app.post("/api/docs/fill")
    async def doc_fill(body: PathBody, _: str = Depends(device)):
        try:
            out = await run_in_threadpool(docs.fill_pdf, body.path, profile.values())
        except docs.DocError as e:
            raise HTTPException(400, str(e))
        await notifier.notify("Jarvis", f"Done, sir. {out['message']}", tag="docs")
        return out

    # ── The app itself ───────────────────────────────────────────────────────

    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="app")
    return app


def _summarise(results: list[dict]) -> str:
    parts = []
    for r in results:
        if r["status"] == "done":
            parts.append((r.get("result") or {}).get("message") or f"{r['label']} ✓")
        elif r["status"] == "confirm":
            parts.append(f"{r['label']} — tap Run to confirm.")
        else:
            parts.append(f"{r['label']} failed: {r.get('error')}")
    return " ".join(parts)
