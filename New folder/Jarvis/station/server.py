"""
God Station — API Server
=========================
The phone app talks to these endpoints. Every /api route except
/api/pair needs the device token from pairing.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from station import __version__
from station.auth import DeviceAuth
from station.brain import BrainOffline, LocalBrain
from station.config import StationConfig
from station.controls import ControlError, PCControl
from station.intents import describe, quick_intent
from station.memory import StationMemory

logger = logging.getLogger("jarvis.station")

STATIC_DIR = Path(__file__).parent / "static"

# Actions that can't be undone wait for you to tap "Run" in the app
CONFIRM_POWER = {"sleep", "shutdown", "restart"}


def needs_confirm(action: dict) -> bool:
    t = action.get("type")
    return t in ("shell", "kill") or (t == "power" and action.get("action") in CONFIRM_POWER)


# ── Request bodies ───────────────────────────────────────────────────────────

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


# ── App ──────────────────────────────────────────────────────────────────────

def create_app(config: StationConfig, control: PCControl | None = None,
               brain: LocalBrain | None = None) -> FastAPI:
    config.data_dir.mkdir(parents=True, exist_ok=True)
    auth = DeviceAuth(config.data_dir)
    memory = StationMemory(config.data_dir / "memory.db")
    control = control or PCControl(upload_dir=config.upload_dir)
    brain = brain or LocalBrain(config.ollama_url, config.ollama_model, config.owner_name)

    async def watch_clipboard():
        """Every copy on the PC lands in the shared clipboard history."""
        failures = 0
        while True:
            try:
                memory.add_clip(await run_in_threadpool(control.get_clipboard), "PC")
                failures = 0
            except Exception as e:
                failures += 1
                if failures == 1:
                    logger.warning(f"[CLIP] Can't read the PC clipboard: {e}")
            await asyncio.sleep(1 if failures < 5 else 15)

    @asynccontextmanager
    async def lifespan(_app):
        task = asyncio.create_task(watch_clipboard()) if config.clipboard_history else None
        yield
        if task:
            task.cancel()

    app = FastAPI(title="Jarvis — God Station", version=__version__, docs_url=None, redoc_url=None,
                  lifespan=lifespan)
    app.state.auth = auth
    app.state.memory = memory

    def device(authorization: str = Header(default="")) -> str:
        token = authorization.removeprefix("Bearer ").strip()
        device_id = auth.check(token)
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

    @app.get("/api/ping")
    def ping(device_id: str = Depends(device)):
        import socket
        return {"ok": True, "owner": config.owner_name, "host": socket.gethostname(),
                "allow_shell": config.allow_shell, "version": __version__, "device_id": device_id}

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

    @app.get("/api/brain")
    async def brain_status(_: str = Depends(device)):
        return await brain.status()

    @app.post("/api/chat")
    async def chat(body: ChatBody, device_id: str = Depends(device)):
        message = body.message.strip()
        if not message:
            raise HTTPException(400, "Empty message")
        device_name = auth.devices.get(device_id, {}).get("name", body.device)

        history = memory.recent(8)
        memories = memory.search(message, limit=5, exclude_ids={h["id"] for h in history})
        memory.add("you", message, device_name)

        # 1. Instant commands — no AI needed
        actions = quick_intent(message)
        if actions is not None:
            results = [await run_in_threadpool(execute, a, False) for a in actions]
            reply = _summarise(results)
            memory.add("jarvis", reply, device_name)
            return {"reply": reply, "actions": results, "brain": "instant"}

        # 2. The local brain
        try:
            out = await brain.reply(message, history, memories, device=body.device)
        except BrainOffline as e:
            reply = ("My brain is offline, so I can only do instant commands right now "
                     "(open …, lock, volume up, pause, next, show desktop, type …). "
                     f"To wake my brain, on the PC run Ollama. ({e})")
            return {"reply": reply, "actions": [], "brain": "offline"}

        results = [await run_in_threadpool(execute, a, False) for a in out["actions"]]
        memory.add("jarvis", out["reply"], device_name)
        return {"reply": out["reply"], "actions": results, "brain": brain.model}

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
