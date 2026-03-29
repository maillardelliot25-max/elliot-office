"""
JARVIS — Free Edition Core (Fully Open Source)
===============================================
Zero costs. Works locally or on free tier hosting.
"""

import asyncio
import logging
from datetime import datetime
from typing import TypedDict, Annotated, Sequence, Any
from enum import Enum

from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from langchain_community.llms import Ollama  # FREE — self-hosted

from core.memory_free import JarvisMemoryFree
from core.react_agent import ReActEngine
from integrations.whatsapp import WhatsAppHandler
from integrations.gmail import GmailHandler
from integrations.github_deployer import DeploymentEngine
from autopilot.self_healer import SelfHealer
from config.settings import settings

logger = logging.getLogger("jarvis.master_loop")

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
    channel:         str
    context:         dict
    plan:            list[str]
    actions_taken:   list[dict]
    tool_result:     Any
    error:           str | None
    iteration:       int
    final_response:  str | None


class JarvisMasterLoopFree:
    """
    Free Edition Master Loop
    Uses: Ollama (free LLM) + Chroma (free vector DB) + free APIs only
    """

    def __init__(self):
        # Use Ollama for LLM (runs locally, FREE)
        # Mistral 7B is fastest/cheapest open model
        self.llm         = Ollama(model="mistral:latest", base_url="http://localhost:11434")
        self.memory      = JarvisMemoryFree()  # Chroma (embedded, free)
        self.react       = ReActEngine(self.llm)
        self.whatsapp    = WhatsAppHandler()
        self.gmail       = GmailHandler()
        self.deployer    = DeploymentEngine()
        self.healer      = SelfHealer()
        self.graph       = self._build_graph()

    async def node_listen(self, state: JarvisState) -> JarvisState:
        """Polls WhatsApp, Gmail. No paid APIs."""
        logger.info("[LISTEN] Scanning channels...")
        state["task_status"] = TaskStatus.PENDING

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

    async def node_recall(self, state: JarvisState) -> JarvisState:
        """Local vector DB (Chroma — FREE)"""
        if state["task"] == "__IDLE__":
            return state

        logger.info("[RECALL] Querying local memory...")
        context = await self.memory.recall(
            query=state["task"],
            top_k=5
        )
        state["context"] = context
        return state

    async def node_reason(self, state: JarvisState) -> JarvisState:
        """ReAct with Ollama (runs locally, FREE)"""
        if state["task"] == "__IDLE__":
            return state

        logger.info("[REASON] Generating plan (local Ollama)...")
        state["task_status"] = TaskStatus.REASONING

        system_prompt = f"""
You are Jarvis, the personal autonomous AI.
Today: {datetime.now().strftime('%A, %B %d, %Y %H:%M')}

Memory context:
{state.get('context', {})}

Break this task into simple steps before executing.
Think first. Then act.
"""

        plan = await self.react.generate_plan(
            system=system_prompt,
            task=state["task"],
            context=state["context"],
            available_tools=self._get_available_tools()
        )

        state["plan"] = plan
        logger.info(f"[REASON] Plan: {len(plan)} steps")
        return state

    async def node_act(self, state: JarvisState) -> JarvisState:
        """Execute plan steps"""
        if state["task"] == "__IDLE__" or not state.get("plan"):
            return state

        logger.info(f"[ACT] Executing {len(state['plan'])} steps...")
        state["task_status"] = TaskStatus.ACTING
        state["actions_taken"] = []
        state["error"] = None

        for i, step in enumerate(state["plan"]):
            try:
                logger.info(f"[ACT] Step {i+1}: {step}")
                result = await self._dispatch_action(step, state["context"])
                state["actions_taken"].append({"step": step, "result": result, "status": "ok"})
            except Exception as e:
                logger.error(f"[ACT] Step {i+1} FAILED: {e}")
                state["actions_taken"].append({"step": step, "error": str(e), "status": "failed"})
                state["error"] = str(e)
                break

        return state

    async def node_verify(self, state: JarvisState) -> JarvisState:
        """Check results"""
        logger.info("[VERIFY] Checking results...")
        state["task_status"] = TaskStatus.VERIFYING

        failed_steps = [a for a in state.get("actions_taken", []) if a["status"] == "failed"]

        if failed_steps:
            logger.warning(f"[VERIFY] {len(failed_steps)} step(s) failed")
            state["task_status"] = TaskStatus.FAILED
        else:
            state["task_status"] = TaskStatus.COMPLETE
            logger.info("[VERIFY] All steps passed")

        return state

    async def node_heal(self, state: JarvisState) -> JarvisState:
        """Self-repair"""
        logger.info("[HEAL] Attempting repair...")
        state["task_status"] = TaskStatus.HEALING

        failed = [a for a in state["actions_taken"] if a["status"] == "failed"]
        healed = await self.healer.attempt_repair(failed_actions=failed, state=state)

        if healed:
            logger.info("[HEAL] Recovery successful")
            state["task_status"] = TaskStatus.COMPLETE
            state["error"] = None
        else:
            logger.error("[HEAL] Recovery failed")
            state["final_response"] = f"⚠️ Issue: {state['error']}\nStep: {failed[0]['step']}"
            await self.whatsapp.send(state["final_response"])

        return state

    async def node_respond(self, state: JarvisState) -> JarvisState:
        """Deliver result"""
        if state["task"] == "__IDLE__":
            return state

        logger.info(f"[RESPOND] Sending result via {state['channel']}...")

        if not state.get("final_response"):
            summary = f"Completed: {state['task'][:100]}"
            state["final_response"] = summary

        if state["channel"] == "whatsapp":
            await self.whatsapp.send(state["final_response"])
        elif state["channel"] == "gmail":
            await self.gmail.send_reply(state["final_response"])
        else:
            logger.info(f"[RESPOND] {state['final_response']}")

        return state

    async def node_learn(self, state: JarvisState) -> JarvisState:
        """Store interaction in local DB"""
        if state["task"] == "__IDLE__":
            return state

        logger.info("[LEARN] Storing interaction...")

        await self.memory.store(
            interaction={
                "task":         state["task"],
                "channel":      state["channel"],
                "plan":         state["plan"],
                "actions":      state["actions_taken"],
                "response":     state["final_response"],
                "timestamp":    datetime.now().isoformat(),
                "status":       state["task_status"]
            }
        )

        logger.info("[LEARN] Memory updated")
        return state

    def _route_after_verify(self, state: JarvisState) -> str:
        if state["task_status"] == TaskStatus.FAILED:
            return "heal"
        return "respond"

    def _route_after_listen(self, state: JarvisState) -> str:
        if state["task"] == "__IDLE__":
            return END
        return "recall"

    def _build_graph(self) -> StateGraph:
        graph = StateGraph(JarvisState)

        graph.add_node("listen",  self.node_listen)
        graph.add_node("recall",  self.node_recall)
        graph.add_node("reason",  self.node_reason)
        graph.add_node("act",     self.node_act)
        graph.add_node("verify",  self.node_verify)
        graph.add_node("heal",    self.node_heal)
        graph.add_node("respond", self.node_respond)
        graph.add_node("learn",   self.node_learn)

        graph.set_entry_point("listen")

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

    async def run_forever(self):
        """Eternal loop"""
        logger.info("🟢 JARVIS FREE EDITION ONLINE")
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
                state["messages"]       = []
                state["plan"]           = []
                state["actions_taken"]  = []
                state["final_response"] = None
                state["error"]          = None

                if state["task"] == "__IDLE__":
                    await asyncio.sleep(settings.IDLE_POLL_SECONDS)

            except Exception as e:
                logger.error(f"[ERROR] {e}")
                await asyncio.sleep(30)

    async def _poll_channels(self) -> dict | None:
        """WhatsApp + Gmail only (free channels)"""
        msg = await self.whatsapp.poll_inbox()
        if msg:
            return {"channel": "whatsapp", "content": msg}

        msg = await self.gmail.poll_unread()
        if msg:
            return {"channel": "gmail", "content": msg}

        return None

    async def _dispatch_action(self, step: str, context: dict) -> Any:
        """Route to free integrations only"""
        step_lower = step.lower()
        if "deploy" in step_lower:
            return await self.deployer.execute(step, context)
        if "email" in step_lower:
            return await self.gmail.execute(step, context)
        if "whatsapp" in step_lower:
            return await self.whatsapp.execute(step, context)
        return {"status": "generic_step", "step": step}

    def _get_available_tools(self) -> list[str]:
        return [
            "deploy_code", "send_email", "read_email",
            "whatsapp_send", "create_github_repo", "run_tests"
        ]
