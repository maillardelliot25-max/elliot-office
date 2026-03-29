"""
JARVIS FREE EDITION — Entry Point
===================================
Run this: python main_free.py

Uses:
- Claude claude-sonnet-4-6 (brain + vision)
- Telegram (messaging)
- Chroma (memory)
- nanobanana (images/video)
- Self-maintenance (auto-repair)
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Ensure logs directory exists
os.makedirs("logs", exist_ok=True)
os.makedirs("generated", exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("logs/jarvis.log")
    ]
)
logger = logging.getLogger("jarvis.main_free")


# ── STARTUP ─────────────────────────────────────────────────────────────────

from core.master_loop_free import JarvisMasterLoopFree
from config.settings import settings

jarvis: JarvisMasterLoopFree | None = None
loop_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global jarvis, loop_task

    logger.info("=" * 50)
    logger.info("🟢 JARVIS FREE EDITION STARTING")
    logger.info("=" * 50)

    # Check minimum required credentials
    missing = settings.validate()
    if missing:
        logger.error(f"❌ Missing credentials: {missing}")
        logger.error("See STEP_BY_STEP.md for setup instructions.")
        raise RuntimeError(f"Missing: {missing}")

    # Init Jarvis
    jarvis = JarvisMasterLoopFree()
    logger.info("✓ Jarvis initialized")
    logger.info(f"✓ Owner: {settings.OWNER_NAME}")
    logger.info(f"✓ Brain: Claude claude-sonnet-4-6")
    logger.info(f"✓ Telegram: {'connected' if settings.TELEGRAM_BOT_TOKEN else 'not configured'}")
    logger.info(f"✓ WhatsApp: {'connected' if settings.WHATSAPP_ACCESS_TOKEN else 'not configured (Meta restricted)'}")
    logger.info(f"✓ nanobanana: {'configured' if settings.NANOBANANA_API_KEY else 'not configured yet'}")
    logger.info(f"✓ HuggingFace: {'configured' if settings.HUGGINGFACE_TOKEN else 'not configured'}")
    logger.info("=" * 50)

    # Send startup message to Telegram
    if settings.TELEGRAM_BOT_TOKEN and settings.TELEGRAM_CHAT_ID:
        try:
            await jarvis.telegram.send(
                f"🟢 *Jarvis online*\n"
                f"Brain: Claude claude-sonnet-4-6\n"
                f"Channels: Telegram ✓{'  WhatsApp ✓' if settings.WHATSAPP_ACCESS_TOKEN else ''}\n"
                f"Images: {'nanobanana ✓' if settings.NANOBANANA_API_KEY else 'HuggingFace' if settings.HUGGINGFACE_TOKEN else 'not configured'}\n"
                f"\nSend me anything."
            )
        except Exception as e:
            logger.warning(f"Could not send startup message: {e}")

    # Start eternal loop
    loop_task = asyncio.create_task(jarvis.run_forever())

    yield  # Server running

    logger.info("🔴 JARVIS SHUTTING DOWN")
    if loop_task:
        loop_task.cancel()


# ── APP ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Jarvis — Free Edition",
    description="Claude-powered autonomous AI with vision, images, and self-maintenance",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── ENDPOINTS ────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "online",
        "jarvis": "running" if loop_task and not loop_task.done() else "stopped",
        "brain": "claude-sonnet-4-6",
        "owner": settings.OWNER_NAME
    }


@app.get("/status")
async def status():
    if not jarvis:
        return {"status": "not initialized"}
    mem = await jarvis.memory.stats()
    return {
        "status":    "online",
        "brain":     "Claude claude-sonnet-4-6",
        "memory":    mem,
        "telegram":  bool(settings.TELEGRAM_BOT_TOKEN),
        "whatsapp":  bool(settings.WHATSAPP_ACCESS_TOKEN),
        "nanobanana": bool(settings.NANOBANANA_API_KEY),
        "screen":    "enabled"
    }


@app.post("/task")
async def submit_task(body: dict):
    """Submit a task directly via API."""
    if not jarvis:
        return JSONResponse({"error": "Jarvis not running"}, status_code=503)
    content = body.get("content", "").strip()
    if not content:
        return JSONResponse({"error": "Empty task"}, status_code=400)
    logger.info(f"[API] Task: {content}")
    return {"status": "queued", "task": content}


@app.post("/telegram/send")
async def telegram_send(body: dict):
    """Send a message via Telegram manually."""
    if not jarvis:
        return JSONResponse({"error": "Jarvis not running"}, status_code=503)
    msg = body.get("message", "")
    ok = await jarvis.telegram.send(msg)
    return {"sent": ok}


@app.get("/memory/stats")
async def memory_stats():
    if not jarvis:
        return {}
    return await jarvis.memory.stats()


@app.get("/repairs")
async def repair_log():
    if not jarvis:
        return []
    return jarvis.maintainer.get_history()


@app.get("/")
async def root():
    return {
        "name":    "Jarvis",
        "edition": "Free",
        "brain":   "Claude claude-sonnet-4-6",
        "status":  "online",
        "docs":    "/docs"
    }


# ── RUN ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=settings.PORT,
        log_level="info"
    )
