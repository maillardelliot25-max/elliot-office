"""
JARVIS — Master Loop (Free Edition)
=====================================
Brain: Claude claude-sonnet-4-6 (vision + text)
Memory: Chroma (local, free)
Channels: Telegram (primary), WhatsApp (secondary)
Images/Video: Nanobanana (Google Gemini) + Veo 3.1
Self-repair: reads/writes its own code
"""

import asyncio
import logging
from datetime import datetime
from typing import TypedDict, Annotated, Sequence, Any
from enum import Enum

from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage, HumanMessage

from core.brain_claude import ClaudeBrain
from core.memory_free import JarvisMemoryFree
from integrations.telegram import TelegramHandler
from integrations.whatsapp import WhatsAppHandler
from integrations.gmail import GmailHandler
from integrations.github_deployer import DeploymentEngine
from integrations.screen import ScreenVision
from integrations.image_gen import NanobananaGenerator
from autopilot.self_healer import SelfHealer
from autopilot.self_maintainer import SelfMaintainer
from config.settings import settings

logger = logging.getLogger("jarvis.master_loop")


class TaskStatus(str, Enum):
    PENDING   = "pending"
    REASONING = "reasoning"
    ACTING    = "acting"
    VERIFYING = "verifying"
    COMPLETE  = "complete"
    FAILED    = "failed"
    HEALING   = "healing"


class JarvisState(TypedDict):
    messages:       Annotated[Sequence[BaseMessage], add_messages]
    task:           str
    task_status:    TaskStatus
    channel:        str
    context:        dict
    plan:           list[str]
    actions_taken:  list[dict]
    tool_result:    Any
    error:          str | None
    iteration:      int
    final_response: str | None


class JarvisMasterLoopFree:
    """
    Fully autonomous Jarvis.
    Claude brain + vision + nanobanana + self-repair.
    """

    def __init__(self):
        self.brain      = ClaudeBrain()              # Claude claude-sonnet-4-6
        self.memory     = JarvisMemoryFree()         # Chroma (local)
        self.telegram   = TelegramHandler()          # Primary channel
        self.whatsapp   = WhatsAppHandler()          # Secondary channel
        self.gmail      = GmailHandler()
        self.deployer   = DeploymentEngine()
        self.screen     = ScreenVision()             # Screen capture
        self.nanobanana = NanobananaGenerator()      # Image + video
        self.healer     = SelfHealer()
        self.maintainer = SelfMaintainer()           # Self-repair code
        self.graph      = self._build_graph()

    # ── NODES ────────────────────────────────────────────────────────────────

    async def node_listen(self, state: JarvisState) -> JarvisState:
        """Poll all channels for new messages."""
        state["task_status"] = TaskStatus.PENDING

        msg = await self._poll_channels()
        if msg:
            state["task"]    = msg["content"]
            state["channel"] = msg["channel"]
            state["context"] = {**state.get("context", {})}
            if msg.get("photo_bytes"):
                state["context"]["photo_bytes"] = msg["photo_bytes"]
            state["messages"] = list(state["messages"]) + [HumanMessage(content=msg["content"])]
            logger.info(f"[LISTEN] {msg['channel']}: {msg['content'][:80]}")
        else:
            state["task"]    = "__IDLE__"
            state["channel"] = "internal"

        return state

    async def node_recall(self, state: JarvisState) -> JarvisState:
        """Load relevant memory for this task."""
        if state["task"] == "__IDLE__":
            return state
        ctx = await self.memory.recall(query=state["task"], top_k=5)
        state["context"] = {**state.get("context", {}), **ctx}
        return state

    async def node_reason(self, state: JarvisState) -> JarvisState:
        """Plan using Claude claude-sonnet-4-6 (vision when needed)."""
        if state["task"] == "__IDLE__":
            return state

        state["task_status"] = TaskStatus.REASONING
        task = state["task"]
        task_l = task.lower().strip()

        # Inline commands — route directly
        if task_l in ("/screen", "show screen", "see my screen", "look at my screen"):
            state["plan"] = ["capture_and_analyze_screen"]
            return state

        if task_l in ("/status", "/help"):
            state["plan"] = ["report_status"]
            return state

        if task_l.startswith("/update ") or "update yourself" in task_l:
            state["plan"] = [f"self_update:{task}"]
            return state

        if task_l.startswith("/fix") or "fix yourself" in task_l or "repair yourself" in task_l:
            state["plan"] = ["auto_scan_and_fix"]
            return state

        # Image generation
        image_keywords = ["create image", "generate image", "make image", "draw", "make a picture",
                          "create a picture", "design image", "create photo", "make photo"]
        if any(kw in task_l for kw in image_keywords):
            state["plan"] = [f"generate_image:{task}"]
            return state

        # Video generation
        video_keywords = ["create video", "generate video", "make video", "make a video",
                          "create a clip", "make a clip"]
        if any(kw in task_l for kw in video_keywords):
            state["plan"] = [f"generate_video:{task}"]
            return state

        # Photo received — analyze it
        if state["context"].get("photo_bytes"):
            state["plan"] = [f"analyze_image:{task}"]
            return state

        # Default: Claude generates the plan
        images = []
        if state["context"].get("photo_bytes"):
            b64 = self.screen.capture_from_bytes(state["context"]["photo_bytes"])
            images = [b64]

        plan = await self.brain.plan(task=task, context=state.get("context"))
        state["plan"] = plan
        logger.info(f"[REASON] {len(plan)}-step plan")
        return state

    async def node_act(self, state: JarvisState) -> JarvisState:
        """Execute each step of the plan."""
        if state["task"] == "__IDLE__" or not state.get("plan"):
            return state

        state["task_status"]  = TaskStatus.ACTING
        state["actions_taken"] = []
        state["error"]         = None

        for i, step in enumerate(state["plan"]):
            try:
                logger.info(f"[ACT] Step {i+1}/{len(state['plan'])}: {step[:80]}")
                result = await self._dispatch(step, state["context"])
                state["actions_taken"].append({"step": step, "result": result, "status": "ok"})
            except Exception as e:
                logger.error(f"[ACT] Step {i+1} failed: {e}")
                state["actions_taken"].append({"step": step, "error": str(e), "status": "failed"})
                state["error"] = str(e)
                break

        return state

    async def node_verify(self, state: JarvisState) -> JarvisState:
        """Check if all steps succeeded."""
        if state["task"] == "__IDLE__":
            return state
        failed = [a for a in state.get("actions_taken", []) if a["status"] == "failed"]
        state["task_status"] = TaskStatus.FAILED if failed else TaskStatus.COMPLETE
        return state

    async def node_heal(self, state: JarvisState) -> JarvisState:
        """Auto-repair on failure."""
        state["task_status"] = TaskStatus.HEALING
        failed = [a for a in state["actions_taken"] if a["status"] == "failed"]
        healed = await self.healer.attempt_repair(failed_actions=failed, state=state)
        if healed:
            state["task_status"] = TaskStatus.COMPLETE
            state["error"]       = None
        else:
            state["final_response"] = f"⚠️ Failed: {state['error']}\nStep: {failed[0]['step'] if failed else 'unknown'}"
        return state

    async def node_respond(self, state: JarvisState) -> JarvisState:
        """Send result back to user."""
        if state["task"] == "__IDLE__":
            return state

        channel = state["channel"]

        # Build response text if not set
        if not state.get("final_response"):
            actions = state.get("actions_taken", [])
            results_text = "\n".join(
                str(a.get("result", a.get("error", "")))[:300]
                for a in actions
            )
            state["final_response"] = await self.brain.think(
                task=f"Summarize these results in 1-3 sentences for the user:\n{results_text}"
            )

        async def send_text(msg: str):
            if channel == "telegram":
                await self.telegram.send(msg)
            elif channel == "whatsapp":
                await self.whatsapp.send(msg)
            elif channel == "gmail":
                await self.gmail.send_reply(msg)
            else:
                logger.info(f"[RESPOND] {msg}")

        # Check for image/video files to send
        for action in state.get("actions_taken", []):
            result = action.get("result", {})
            if not isinstance(result, dict):
                continue

            if result.get("image_path") and channel == "telegram":
                await self.telegram.send_image(result["image_path"], caption=state["task"][:100])
                await send_text("✅ Image generated with Nano Banana 2 ↑")
                return state

            if result.get("video_path") and channel == "telegram":
                await self.telegram.send_file(result["video_path"], caption=state["task"][:100])
                await send_text("✅ Video generated with Veo 3.1 ↑")
                return state

            if result.get("analysis"):
                state["final_response"] = result["analysis"]

        await send_text(state["final_response"])
        return state

    async def node_learn(self, state: JarvisState) -> JarvisState:
        """Store interaction in memory."""
        if state["task"] == "__IDLE__":
            return state
        await self.memory.store({
            "task":      state["task"],
            "channel":   state["channel"],
            "plan":      state["plan"],
            "actions":   state["actions_taken"],
            "response":  state["final_response"],
            "timestamp": datetime.now().isoformat(),
            "status":    state["task_status"]
        })
        return state

    # ── ROUTING ──────────────────────────────────────────────────────────────

    def _route_after_listen(self, state: JarvisState) -> str:
        return END if state["task"] == "__IDLE__" else "recall"

    def _route_after_verify(self, state: JarvisState) -> str:
        return "heal" if state["task_status"] == TaskStatus.FAILED else "respond"

    # ── GRAPH ────────────────────────────────────────────────────────────────

    def _build_graph(self) -> StateGraph:
        g = StateGraph(JarvisState)
        g.add_node("listen",  self.node_listen)
        g.add_node("recall",  self.node_recall)
        g.add_node("reason",  self.node_reason)
        g.add_node("act",     self.node_act)
        g.add_node("verify",  self.node_verify)
        g.add_node("heal",    self.node_heal)
        g.add_node("respond", self.node_respond)
        g.add_node("learn",   self.node_learn)

        g.set_entry_point("listen")
        g.add_conditional_edges("listen", self._route_after_listen, {"recall": "recall", END: END})
        g.add_edge("recall",  "reason")
        g.add_edge("reason",  "act")
        g.add_edge("act",     "verify")
        g.add_conditional_edges("verify", self._route_after_verify, {"heal": "heal", "respond": "respond"})
        g.add_edge("heal",    "respond")
        g.add_edge("respond", "learn")
        g.add_edge("learn",   END)
        return g.compile()

    # ── MAIN LOOP ────────────────────────────────────────────────────────────

    async def run_forever(self):
        logger.info("🟢 JARVIS ETERNAL LOOP STARTED")
        blank: JarvisState = {
            "messages":       [],
            "task":           "",
            "task_status":    TaskStatus.PENDING,
            "channel":        "internal",
            "context":        {},
            "plan":           [],
            "actions_taken":  [],
            "tool_result":    None,
            "error":          None,
            "iteration":      0,
            "final_response": None,
        }
        state = blank.copy()

        while True:
            try:
                state = await self.graph.ainvoke(state)
                # Reset per-task fields, keep iteration counter
                it = state.get("iteration", 0) + 1
                state = {**blank, "iteration": it}
                if state["task"] == "__IDLE__":
                    await asyncio.sleep(settings.IDLE_POLL_SECONDS)
            except Exception as e:
                logger.error(f"[LOOP] Error: {e}", exc_info=True)
                await asyncio.sleep(30)

    # ── DISPATCH ─────────────────────────────────────────────────────────────

    async def _dispatch(self, step: str, context: dict) -> Any:
        """Route a plan step to the right integration."""
        s = step.lower()

        # Screen capture + Claude Vision
        if step == "capture_and_analyze_screen":
            b64      = self.screen.capture()
            analysis = await self.brain.analyze_screen(b64, "Describe everything you see on this screen in detail.")
            return {"analysis": analysis, "screen_captured": True}

        # Image generation (nanobanana)
        if step.startswith("generate_image:"):
            prompt  = step.split(":", 1)[1].strip()
            quality = "pro" if "pro" in prompt.lower() or "high quality" in prompt.lower() else "fast"
            return await self.nanobanana.generate_image(prompt, quality=quality)

        # Video generation (Veo 3.1)
        if step.startswith("generate_video:"):
            prompt = step.split(":", 1)[1].strip()
            return await self.nanobanana.generate_video(prompt)

        # Image analysis (photo sent by user)
        if step.startswith("analyze_image:"):
            question = step.split(":", 1)[1].strip()
            photo    = context.get("photo_bytes")
            if photo:
                b64      = self.screen.capture_from_bytes(photo)
                analysis = await self.brain.analyze_screen(b64, question)
                return {"analysis": analysis}
            return {"error": "No image found in context"}

        # Self-update
        if step.startswith("self_update:"):
            instructions = step.split(":", 1)[1].strip()
            return await self.maintainer.update_self(instructions)

        # Auto scan + fix
        if step == "auto_scan_and_fix":
            errors = await self.maintainer.scan_for_bugs()
            if errors:
                fixed = 0
                for err in errors[:3]:  # fix up to 3 at once
                    ok = await self.maintainer.fix_file(
                        filepath=err.get("file", ""),
                        error=err.get("error", err.get("line", ""))
                    )
                    if ok:
                        fixed += 1
                return {"fixed": fixed, "total_errors": len(errors)}
            return {"message": "No bugs found. Jarvis is clean."}

        # Status report
        if step == "report_status":
            mem = await self.memory.stats()
            return {
                "status":     "online",
                "brain":      "Claude claude-sonnet-4-6",
                "image_gen":  "Nano Banana 2" if self.nanobanana.client else "not configured",
                "video_gen":  "Veo 3.1" if self.nanobanana.client else "not configured",
                "telegram":   bool(self.telegram.token),
                "whatsapp":   bool(settings.WHATSAPP_ACCESS_TOKEN),
                "memory":     mem,
            }

        # GitHub deploy
        if "deploy" in s:
            return await self.deployer.execute(step, context)

        # Email
        if "email" in s or "gmail" in s:
            return await self.gmail.execute(step, context)

        # WhatsApp
        if "whatsapp" in s:
            return await self.whatsapp.execute(step, context)

        # Generic — ask Claude
        response = await self.brain.think(task=step, context=context)
        return {"response": response}

    # ── CHANNEL POLLING ──────────────────────────────────────────────────────

    async def _poll_channels(self) -> dict | None:
        """Telegram first, then WhatsApp, then Gmail."""
        msg = await self.telegram.poll_inbox()
        if msg:
            return {
                "channel":     "telegram",
                "content":     msg["content"],
                "photo_bytes": msg.get("photo_bytes")
            }

        msg = await self.whatsapp.poll_inbox()
        if msg:
            return {"channel": "whatsapp", "content": msg}

        msg = await self.gmail.poll_unread()
        if msg:
            return {"channel": "gmail", "content": msg}

        return None
