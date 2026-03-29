"""
JARVIS — FastAPI Entry Point
=============================
The HTTP server that coordinates all integrations.
Webhooks, health checks, and management endpoints.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config.settings import settings
from core.master_loop import JarvisMasterLoop
from autopilot.self_healer import run_health_checks
from integrations.voice import router as voice_router
from integrations.whatsapp import router as whatsapp_router

# ─── LOGGING ─────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("logs/jarvis.log")
    ]
)
logger = logging.getLogger("jarvis.main")

# ─── GLOBAL STATE ────────────────────────────────────────────────────────────
master_loop: JarvisMasterLoop | None = None
loop_task: asyncio.Task | None = None
health_task: asyncio.Task | None = None


# ─── STARTUP / SHUTDOWN ──────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan context manager."""
    global master_loop, loop_task, health_task

    logger.info("🟢 JARVIS STARTUP SEQUENCE")

    # Validate credentials
    from config.settings import settings
    missing = settings.validate()
    if missing:
        logger.error(f"❌ Missing required credentials: {missing}")
        raise RuntimeError(f"Missing credentials: {missing}")

    # Initialize core
    master_loop = JarvisMasterLoop()
    logger.info("✓ Master loop instantiated")

    # Start the eternal loops
    loop_task = asyncio.create_task(master_loop.run_forever())
    health_task = asyncio.create_task(run_health_checks())
    logger.info("✓ Master loop and health checks started")

    yield   # Server is running

    # Cleanup
    logger.info("🔴 JARVIS SHUTDOWN")
    if loop_task:
        loop_task.cancel()
    if health_task:
        health_task.cancel()


# ─── APP INITIALIZATION ──────────────────────────────────────────────────────

app = FastAPI(
    title="Jarvis — Autonomous Personal AI",
    description="Self-evolving operating system with voice, messaging, and deployment capabilities",
    version="1.0.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(voice_router)
app.include_router(whatsapp_router)


# ─── MANAGEMENT ENDPOINTS ───────────────────────────────────────────────────

@app.get("/health")
async def health():
    """Jarvis health check endpoint."""
    return {
        "status": "online",
        "master_loop": "running" if loop_task and not loop_task.done() else "stopped"
    }


@app.get("/status")
async def status():
    """Detailed system status."""
    if not master_loop:
        raise HTTPException(status_code=503, detail="Master loop not initialized")

    memory_stats = await master_loop.memory.stats()
    return {
        "jarvis": "online",
        "memory": memory_stats,
        "uptime_seconds": 0  # Would track actual uptime in production
    }


@app.post("/task/manual")
async def submit_manual_task(task: dict):
    """
    Manually submit a task to Jarvis.
    POST: {"channel": "internal", "content": "your task here"}
    """
    if not master_loop:
        raise HTTPException(status_code=503, detail="Master loop not initialized")

    content = task.get("content", "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Task content is empty")

    # Push to the master loop's task queue
    from core.master_loop import JarvisState
    state: JarvisState = {
        "messages":       [],
        "task":           content,
        "task_status":    "pending",
        "channel":        "internal",
        "context":        {},
        "plan":           [],
        "actions_taken":  [],
        "tool_result":    None,
        "error":          None,
        "iteration":      0,
        "final_response": None,
    }

    # The master loop will pick this up in its next cycle
    logger.info(f"[API] Manual task submitted: {content[:80]}")
    return {"status": "queued", "task": content}


@app.get("/memory/search")
async def search_memory(q: str, top_k: int = 5):
    """Search Jarvis long-term memory."""
    if not master_loop:
        raise HTTPException(status_code=503, detail="Master loop not initialized")

    results = await master_loop.memory.recall(query=q, top_k=top_k)
    return results


@app.get("/memory/stats")
async def memory_stats():
    """View memory database statistics."""
    if not master_loop:
        raise HTTPException(status_code=503, detail="Master loop not initialized")

    return await master_loop.memory.stats()


@app.get("/healer/log")
async def healer_log():
    """View self-healing repair history."""
    if not master_loop:
        raise HTTPException(status_code=503, detail="Master loop not initialized")

    return master_loop.healer.get_repair_log()


@app.post("/vapi/setup")
async def vapi_setup():
    """
    One-time setup: creates the Jarvis voice assistant on Vapi.
    Call this once after deploying.
    """
    if not master_loop:
        raise HTTPException(status_code=503, detail="Master loop not initialized")

    assistant = await master_loop.voice.create_assistant()
    return {
        "status": "ok",
        "assistant_id": assistant.get("id"),
        "save_this_in_env": f"VAPI_ASSISTANT_ID={assistant.get('id')}"
    }


@app.post("/vapi/call-me")
async def vapi_call_me(reason: str = "Update from Jarvis"):
    """Triggers an immediate inbound call from Jarvis."""
    if not master_loop:
        raise HTTPException(status_code=503, detail="Master loop not initialized")

    call = await master_loop.voice.call_user(
        message=f"Hello, I have a {reason}. Listen in.",
        reason=reason
    )
    return {"status": "calling", "call_id": call.get("id")}


@app.post("/whatsapp/send")
async def whatsapp_send(text: str):
    """Manually send a WhatsApp message."""
    if not master_loop:
        raise HTTPException(status_code=503, detail="Master loop not initialized")

    result = await master_loop.whatsapp.send(text)
    return result


@app.post("/deploy/github")
async def deploy_github(repo_name: str, files: dict):
    """
    Deploy a project to GitHub and Vercel.
    files: {"path/filename.ext": "file content", ...}
    """
    if not master_loop:
        raise HTTPException(status_code=503, detail="Master loop not initialized")

    result = await master_loop.deployer.full_deploy_pipeline(
        project_name=repo_name,
        files=files,
        description=f"Deployed by Jarvis {repo_name}"
    )
    return result


# ─── ROOT ───────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "name": "Jarvis",
        "status": "online",
        "docs": "/docs",
        "endpoints": {
            "health": "/health",
            "manual_task": "POST /task/manual",
            "memory_search": "GET /memory/search?q=...",
            "call_me": "POST /vapi/call-me",
            "send_whatsapp": "POST /whatsapp/send"
        }
    }


# ─── ERROR HANDLERS ──────────────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_error_handler(request, exc):
    logger.error(f"[ERROR] {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": str(exc), "detail": "Internal server error"}
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=settings.PORT,
        log_level="info"
    )
