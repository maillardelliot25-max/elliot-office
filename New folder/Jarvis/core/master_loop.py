"""
JARVIS — Master Loop (LangGraph State Machine)
================================================
This is the brain's heartbeat. It runs 24/7, monitors all channels,
reasons using the ReAct pattern, and dispatches actions autonomously.
"""

import asyncio
import logging
from datetime import datetime
from typing import TypedDict, Annotated, Sequence, Any
from enum import Enum

from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage
from langchain_anthropic import ChatAnthropic

from core.memory import JarvisMemory
from core.react_agent import ReActEngine
from integrations.voice import VapiHandler
from integrations.whatsapp import WhatsAppHandler
from integrations.gmail import GmailHandler
from integrations.linkedin import LinkedInHandler
from integrations.bookkeeping import BookkeepingHandler
from integrations.github_deployer import DeploymentEngine
from autopilot.self_healer import SelfHealer
from config.settings import settings

logger = logging.getLogger("jarvis.master_loop")

# ─────────────────────────────────────────────
# STATE SCHEMA
# ─────────────────────────────────────────────

class TaskStatus(str, Enum):
    PENDING    = "pending"
    REASONING  = "reasoning"
    ACTING     = "acting"
    VERIFYING  = "verifying"
    COMPLETE   = "complete"
    FAILED     = "failed"
    HEALING    = "healing"

class JarvisState(TypedDict):
    messages:        Annotated[Sequence[BaseMessage], add_messages]
    task:            str
    task_status:     TaskStatus
    channel:         str          # voice | whatsapp | gmail | internal
    context:         dict         # retrieved from vector DB
    plan:            list[str]    # ReAct reasoning steps
    actions_taken:   list[dict]   # log of every action executed
    tool_result:     Any          # last tool output
    error:           str | None
    iteration:       int
    final_response:  str | None


# ─────────────────────────────────────────────
# MASTER LOOP GRAPH NODES
# ─────────────────────────────────────────────

class JarvisMasterLoop:
    """
    The always-alive orchestration graph.
    Flow: LISTEN → RECALL → REASON → ACT → VERIFY → RESPOND → LEARN
    """

    def __init__(self):
        self.llm         = ChatAnthropic(model="claude-opus-4-5", api_key=settings.ANTHROPIC_API_KEY)
        self.memory      = JarvisMemory()
        self.react       = ReActEngine(self.llm)
        self.voice       = VapiHandler()
        self.whatsapp    = WhatsAppHandler()
        self.gmail       = GmailHandler()
        self.linkedin    = LinkedInHandler()
        self.bookkeeping = BookkeepingHandler()
        self.deployer    = DeploymentEngine()
        self.healer      = SelfHealer()
        self.graph       = self._build_graph()

    # ── NODE 1: LISTEN ──────────────────────────────────────────────────────
    async def node_listen(self, state: JarvisState) -> JarvisState:
        """
        Polls all active channels for new input.
        Priority: Voice > WhatsApp > Gmail > LinkedIn > Internal Scheduler
        """
        logger.info("[LISTEN] Scanning all channels...")
        state["task_status"] = TaskStatus.PENDING

        # Inbound voice is handled via Vapi webhook (non-blocking)
        # Here we check async queues
        new_task = await self._poll_channels()

        if new_task:
            state["task"]    = new_task["content"]
            state["channel"] = new_task["channel"]
            state["messages"].append(HumanMessage(content=new_task["content"]))
            logger.info(f"[LISTEN] New task from {new_task['channel']}: {new_task['content'][:80]}...")
        else:
            state["task"]    = "__IDLE__"
            state["channel"] = "internal"

        return state

    # ── NODE 2: RECALL ──────────────────────────────────────────────────────
    async def node_recall(self, state: JarvisState) -> JarvisState:
        """
        Queries the vector DB for relevant memory:
        past preferences, similar tasks, work style patterns.
        """
        if state["task"] == "__IDLE__":
            return state

        logger.info("[RECALL] Fetching relevant memory...")
        context = await self.memory.recall(
            query=state["task"],
            top_k=5,
            filters={"user": settings.OWNER_NAME}
        )
        state["context"] = context
        logger.info(f"[RECALL] Retrieved {len(context.get('results', []))} memory chunks.")
        return state

    # ── NODE 3: REASON (ReAct) ───────────────────────────────────────────────
    async def node_reason(self, state: JarvisState) -> JarvisState:
        """
        Applies the ReAct pattern:
        Thought → Action → Observation → Thought → ...
        Produces a concrete action plan before touching any API.
        """
        if state["task"] == "__IDLE__":
            return state

        logger.info("[REASON] Running ReAct reasoning cycle...")
        state["task_status"] = TaskStatus.REASONING

        system_prompt = f"""
You are Jarvis, the personal autonomous AI for {settings.OWNER_NAME}.
Today is {datetime.now().strftime('%A, %B %d, %Y %H:%M')}.

LONG-TERM MEMORY CONTEXT:
{state['context']}

OPERATING PRINCIPLES:
1. Think before you act. Use the ReAct pattern.
2. Break any task into the smallest possible action steps.
3. Never guess — if a required credential is missing, ask once, clearly.
4. Minimize the user's to-do list at all costs.
5. If you can act autonomously, act. If not, ask a single concise question.
"""

        plan = await self.react.generate_plan(
            system=system_prompt,
            task=state["task"],
            context=state["context"],
            available_tools=self._get_available_tools()
        )

        state["plan"] = plan
        state["messages"].append(AIMessage(content=f"Plan generated: {plan}"))
        logger.info(f"[REASON] Plan has {len(plan)} steps.")
        return state

    # ── NODE 4: ACT ─────────────────────────────────────────────────────────
    async def node_act(self, state: JarvisState) -> JarvisState:
        """
        Executes each step in the plan.
        Dispatches to the correct integration handler.
        Logs every action for audit trail.
        """
        if state["task"] == "__IDLE__" or not state.get("plan"):
            return state

        logger.info(f"[ACT] Executing {len(state['plan'])} plan steps...")
        state["task_status"] = TaskStatus.ACTING
        state["actions_taken"] = []
        state["error"] = None

        for i, step in enumerate(state["plan"]):
            try:
                logger.info(f"[ACT] Step {i+1}: {step}")
                result = await self._dispatch_action(step, state["context"])
                state["actions_taken"].append({"step": step, "result": result, "status": "ok"})
                state["tool_result"] = result
            except Exception as e:
                logger.error(f"[ACT] Step {i+1} FAILED: {e}")
                state["actions_taken"].append({"step": step, "error": str(e), "status": "failed"})
                state["error"] = str(e)
                break   # hand off to VERIFY → HEAL if needed

        return state

    # ── NODE 5: VERIFY ──────────────────────────────────────────────────────
    async def node_verify(self, state: JarvisState) -> JarvisState:
        """
        Self-checks the results. If something failed,
        flags it for the self-healer.
        """
        logger.info("[VERIFY] Checking execution results...")
        state["task_status"] = TaskStatus.VERIFYING

        failed_steps = [a for a in state.get("actions_taken", []) if a["status"] == "failed"]

        if failed_steps:
            logger.warning(f"[VERIFY] {len(failed_steps)} step(s) failed. Routing to HEAL.")
            state["task_status"] = TaskStatus.FAILED
        else:
            state["task_status"] = TaskStatus.COMPLETE
            logger.info("[VERIFY] All steps completed successfully.")

        return state

    # ── NODE 6: HEAL ────────────────────────────────────────────────────────
    async def node_heal(self, state: JarvisState) -> JarvisState:
        """
        The self-repair node. Attempts to diagnose and fix failures
        without human involvement. Escalates only if unresolvable.
        """
        logger.info("[HEAL] Initiating self-healing sequence...")
        state["task_status"] = TaskStatus.HEALING

        failed = [a for a in state["actions_taken"] if a["status"] == "failed"]
        healed = await self.healer.attempt_repair(failed_actions=failed, state=state)

        if healed:
            logger.info("[HEAL] Recovery successful. Resuming task.")
            state["task_status"] = TaskStatus.COMPLETE
            state["error"] = None
        else:
            logger.error("[HEAL] Recovery failed. Escalating to user.")
            state["final_response"] = (
                f"⚠️ I encountered an issue I couldn't resolve automatically.\n"
                f"Error: {state['error']}\n"
                f"Please advise on: {failed[0]['step']}"
            )
            await self._notify_user(state["final_response"], channel=state["channel"])

        return state

    # ── NODE 7: RESPOND ─────────────────────────────────────────────────────
    async def node_respond(self, state: JarvisState) -> JarvisState:
        """
        Generates and delivers the final response through the
        correct channel (voice, WhatsApp, email, etc.)
        """
        if state["task"] == "__IDLE__":
            return state

        logger.info(f"[RESPOND] Delivering response via {state['channel']}...")

        if not state.get("final_response"):
            summary = await self.react.summarize_execution(
                task=state["task"],
                actions=state["actions_taken"]
            )
            state["final_response"] = summary

        await self._deliver_response(state["final_response"], state["channel"])
        state["messages"].append(AIMessage(content=state["final_response"]))
        return state

    # ── NODE 8: LEARN ───────────────────────────────────────────────────────
    async def node_learn(self, state: JarvisState) -> JarvisState:
        """
        Writes the completed interaction to the vector DB.
        Extracts preferences, patterns, and business rules.
        This is the continuous learning loop.
        """
        if state["task"] == "__IDLE__":
            return state

        logger.info("[LEARN] Writing experience to long-term memory...")

        await self.memory.store(
            interaction={
                "task":         state["task"],
                "channel":      state["channel"],
                "plan":         state["plan"],
                "actions":      state["actions_taken"],
                "response":     state["final_response"],
                "timestamp":    datetime.now().isoformat(),
                "status":       state["task_status"]
            },
            extract_preferences=True   # LLM pass to extract user style/rules
        )

        logger.info("[LEARN] Memory updated. Cycle complete.")
        return state

    # ─────────────────────────────────────────────
    # ROUTING LOGIC
    # ─────────────────────────────────────────────

    def _route_after_verify(self, state: JarvisState) -> str:
        if state["task_status"] == TaskStatus.FAILED:
            return "heal"
        return "respond"

    def _route_after_listen(self, state: JarvisState) -> str:
        if state["task"] == "__IDLE__":
            return END  # sleep briefly, re-enter loop
        return "recall"

    # ─────────────────────────────────────────────
    # GRAPH ASSEMBLY
    # ─────────────────────────────────────────────

    def _build_graph(self) -> StateGraph:
        graph = StateGraph(JarvisState)

        # Register nodes
        graph.add_node("listen",  self.node_listen)
        graph.add_node("recall",  self.node_recall)
        graph.add_node("reason",  self.node_reason)
        graph.add_node("act",     self.node_act)
        graph.add_node("verify",  self.node_verify)
        graph.add_node("heal",    self.node_heal)
        graph.add_node("respond", self.node_respond)
        graph.add_node("learn",   self.node_learn)

        # Entry point
        graph.set_entry_point("listen")

        # Edges
        graph.add_conditional_edges("listen", self._route_after_listen,
                                    {"recall": "recall", END: END})
        graph.add_edge("recall",  "reason")
        graph.add_edge("reason",  "act")
        graph.add_edge("act",     "verify")
        graph.add_conditional_edges("verify", self._route_after_verify,
                                    {"heal": "heal", "respond": "respond"})
        graph.add_edge("heal",    "respond")
        graph.add_edge("respond", "learn")
        graph.add_edge("learn",   END)

        return graph.compile()

    # ─────────────────────────────────────────────
    # RUN — the eternal loop
    # ─────────────────────────────────────────────

    async def run_forever(self):
        """
        The always-alive master loop.
        Re-enters after each completed cycle with a short sleep on idle.
        """
        logger.info("🟢 JARVIS MASTER LOOP ONLINE")
        initial_state: JarvisState = {
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

        while True:
            try:
                state = await self.graph.ainvoke(initial_state)
                state["iteration"] += 1
                state["messages"]       = []   # clear per-cycle messages
                state["plan"]           = []
                state["actions_taken"]  = []
                state["final_response"] = None
                state["error"]          = None

                if state["task"] == "__IDLE__":
                    await asyncio.sleep(settings.IDLE_POLL_SECONDS)  # default: 15s

            except Exception as e:
                logger.critical(f"[MASTER LOOP] Unhandled crash: {e}")
                await asyncio.sleep(30)   # back off, then restart

    # ─────────────────────────────────────────────
    # HELPERS
    # ─────────────────────────────────────────────

    async def _poll_channels(self) -> dict | None:
        """Checks all inbound queues in priority order."""
        handlers = [
            ("whatsapp", self.whatsapp.poll_inbox),
            ("gmail",    self.gmail.poll_unread),
            ("linkedin", self.linkedin.poll_messages),
        ]
        for channel, fn in handlers:
            msg = await fn()
            if msg:
                return {"channel": channel, "content": msg}
        return None

    async def _dispatch_action(self, step: str, context: dict) -> Any:
        """Routes an action step to the correct integration handler."""
        step_lower = step.lower()
        if "deploy"  in step_lower: return await self.deployer.execute(step, context)
        if "email"   in step_lower: return await self.gmail.execute(step, context)
        if "linkedin"in step_lower: return await self.linkedin.execute(step, context)
        if "whatsapp"in step_lower: return await self.whatsapp.execute(step, context)
        if "expense" in step_lower or "transaction" in step_lower:
            return await self.bookkeeping.execute(step, context)
        # Default: LLM-driven generic tool call
        return await self.react.execute_generic(step, context)

    async def _deliver_response(self, response: str, channel: str):
        """Sends response to the appropriate channel."""
        if channel == "voice":
            await self.voice.speak(response)
        elif channel == "whatsapp":
            await self.whatsapp.send(response)
        elif channel == "gmail":
            await self.gmail.send_reply(response)
        elif channel == "linkedin":
            await self.linkedin.send_message(response)
        else:
            logger.info(f"[RESPOND/internal] {response}")

    async def _notify_user(self, message: str, channel: str):
        """Emergency escalation — always sends to WhatsApp as primary."""
        await self.whatsapp.send(f"🚨 JARVIS ALERT:\n{message}")

    def _get_available_tools(self) -> list[str]:
        return [
            "deploy_code", "send_email", "read_email",
            "linkedin_post", "linkedin_message",
            "whatsapp_send", "log_expense", "read_transactions",
            "create_github_repo", "run_tests", "search_memory"
        ]
