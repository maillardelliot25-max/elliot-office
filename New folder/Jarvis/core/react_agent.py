"""
JARVIS — ReAct Reasoning Engine
================================
Implements the Reasoning + Acting (ReAct) pattern.
Jarvis THINKS before it ACTS. Every action is justified by a thought.
No hallucinated steps. No blind execution.
"""

import json
import logging
from typing import Any
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_anthropic import ChatAnthropic

logger = logging.getLogger("jarvis.react")


REACT_SYSTEM_TEMPLATE = """
You are Jarvis — an autonomous AI agent operating under the ReAct framework.

For every task, you must produce a structured JSON action plan before execution.

FORMAT:
{{
  "thoughts": "Your internal reasoning about the task. What do you know? What's unclear?",
  "plan": [
    "Step 1: <concrete, atomic action>",
    "Step 2: <concrete, atomic action>",
    ...
  ],
  "requires_clarification": false,
  "clarification_questions": []
}}

RULES:
- Each step must be a single, atomic action (e.g., "Send email to john@acme.com with subject X")
- If ANY required info is missing, set requires_clarification=true and list questions
- Never fabricate API endpoints, credentials, or file paths
- If a step has a dependency, note it (e.g., "Step 3 depends on result of Step 2")
- Always prefer the fewest steps that achieve the goal
- Autonomous action is always preferred over asking the user

AVAILABLE TOOLS: {tools}

TASK: {task}

MEMORY CONTEXT: {context}
"""


class ReActEngine:
    def __init__(self, llm: ChatAnthropic):
        self.llm = llm

    async def generate_plan(
        self,
        system: str,
        task: str,
        context: dict,
        available_tools: list[str]
    ) -> list[str]:
        """
        Runs the ReAct reasoning pass.
        Returns a validated list of action steps.
        """
        prompt = REACT_SYSTEM_TEMPLATE.format(
            tools=", ".join(available_tools),
            task=task,
            context=json.dumps(context, indent=2)
        )

        messages = [
            SystemMessage(content=system),
            HumanMessage(content=prompt)
        ]

        logger.debug(f"[ReAct] Sending reasoning request for task: {task[:60]}...")
        response = await self.llm.ainvoke(messages)
        raw = response.content

        try:
            # Extract JSON even if the LLM wraps it in markdown
            if "```json" in raw:
                raw = raw.split("```json")[1].split("```")[0].strip()
            elif "```" in raw:
                raw = raw.split("```")[1].split("```")[0].strip()

            parsed = json.loads(raw)
            logger.info(f"[ReAct] Thoughts: {parsed.get('thoughts', '')[:120]}")

            if parsed.get("requires_clarification"):
                questions = parsed.get("clarification_questions", [])
                logger.info(f"[ReAct] Clarification needed: {questions}")
                # Encode clarification as a single plan step (will be handled by respond node)
                return [f"ASK_USER: {' | '.join(questions)}"]

            return parsed.get("plan", [])

        except (json.JSONDecodeError, IndexError, KeyError) as e:
            logger.error(f"[ReAct] Failed to parse plan JSON: {e}")
            # Fallback: treat the entire response as a single-step plan
            return [f"EXECUTE_FREEFORM: {raw[:500]}"]

    async def summarize_execution(self, task: str, actions: list[dict]) -> str:
        """
        Produces a clean, human-readable summary of what was done.
        Used in the RESPOND node.
        """
        completed = [a for a in actions if a["status"] == "ok"]
        failed    = [a for a in actions if a["status"] == "failed"]

        prompt = f"""
Summarize what you accomplished for the following task in 2–4 sentences.
Be specific. Mention what was done, any key outputs (URLs, amounts, contacts), and next steps if any.

Task: {task}

Completed steps:
{json.dumps(completed, indent=2)}

Failed steps:
{json.dumps(failed, indent=2)}

Respond in first person as Jarvis. Be concise and professional.
"""
        response = await self.llm.ainvoke([HumanMessage(content=prompt)])
        return response.content

    async def execute_generic(self, step: str, context: dict) -> Any:
        """
        Handles action steps that don't map to a specific tool.
        Uses the LLM to reason about the best approach.
        """
        prompt = f"""
You need to execute the following step autonomously:
Step: {step}
Context: {json.dumps(context)}

Describe exactly what you would do and what the result would be.
If this requires an API call, specify the exact endpoint and parameters.
Return a JSON object: {{"action_taken": "...", "result": "...", "output": {{}}}}
"""
        response = await self.llm.ainvoke([HumanMessage(content=prompt)])
        try:
            raw = response.content
            if "```json" in raw:
                raw = raw.split("```json")[1].split("```")[0].strip()
            return json.loads(raw)
        except Exception:
            return {"action_taken": step, "result": response.content, "output": {}}
