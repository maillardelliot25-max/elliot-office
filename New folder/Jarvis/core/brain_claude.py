"""
JARVIS — Claude Brain (Vision + Text + Tool Use)
=================================================
Powers Jarvis with Claude claude-sonnet-4-6:
- Reads text
- Sees screens (screenshots you share)
- Plans multi-step tasks
- Self-repairs code
"""

import base64
import logging
from pathlib import Path
import anthropic
from config.settings import settings

logger = logging.getLogger("jarvis.brain")

SYSTEM_PROMPT = """You are Jarvis — a fully autonomous personal AI assistant.

You belong to {owner}. You have their full trust and permission to act on their behalf.

Your capabilities:
- See and analyze screens, images, documents
- Create images and videos (via nanobanana API)
- Deploy code, manage GitHub repos
- Send/read messages via Telegram and WhatsApp
- Read/reply to email
- Fix your own code when you encounter bugs
- Learn and remember everything

Your personality:
- Direct. No filler. Get to the point.
- Proactive — if you spot something wrong, fix it without being asked
- Honest — if you can't do something, say so clearly
- Confident — you execute, you don't hedge

Rules:
1. Always complete the task unless it's impossible
2. If something breaks, fix it yourself before reporting
3. Never ask for permission for routine tasks (deploy, send message, search)
4. Always report results, not plans
5. Keep responses under 150 words unless asked for detail

Today: {date}
"""


class ClaudeBrain:
    """
    Claude claude-sonnet-4-6 as Jarvis's brain.
    Supports: text, images, screenshots, multi-turn.
    """

    def __init__(self):
        self.client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        self.model  = "claude-sonnet-4-6"
        logger.info(f"[BRAIN] Claude {self.model} initialized")

    async def think(
        self,
        task: str,
        context: dict = None,
        images: list[str] = None,  # list of base64-encoded images
        history: list[dict] = None
    ) -> str:
        """
        Send a task to Claude. Supports text + images.
        Returns Claude's response as a string.
        """
        from datetime import datetime
        system = SYSTEM_PROMPT.format(
            owner=settings.OWNER_NAME or "Boss",
            date=datetime.now().strftime("%A, %B %d, %Y %H:%M")
        )

        # Build user message content
        content = []

        # Add images first (vision)
        if images:
            for img_b64 in images:
                content.append({
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": img_b64
                    }
                })

        # Add context if any
        ctx_text = ""
        if context:
            ctx_text = f"\n\nContext from memory:\n{context}\n\n"

        content.append({
            "type": "text",
            "text": ctx_text + task
        })

        messages = []

        # Add conversation history if provided
        if history:
            messages.extend(history)

        messages.append({"role": "user", "content": content})

        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=2048,
                system=system,
                messages=messages
            )
            result = response.content[0].text
            logger.info(f"[BRAIN] Response: {result[:100]}...")
            return result

        except anthropic.APIError as e:
            logger.error(f"[BRAIN] Claude API error: {e}")
            raise

    async def plan(self, task: str, context: dict = None) -> list[str]:
        """
        Break a task into concrete steps.
        Returns list of action strings.
        """
        prompt = f"""Break this task into numbered steps. Each step must be a single concrete action.
Max 6 steps. Be specific.

Task: {task}

Reply with ONLY a numbered list. No explanations.
Example:
1. Search GitHub for repo named 'mysite'
2. Pull latest code
3. Run tests
4. Deploy to Vercel
"""
        result = await self.think(prompt, context=context)
        steps = []
        for line in result.strip().split("\n"):
            line = line.strip()
            if line and line[0].isdigit():
                # Remove "1. " prefix
                step = line.split(".", 1)[-1].strip()
                if step:
                    steps.append(step)
        return steps or [task]

    async def analyze_screen(self, screenshot_b64: str, question: str = "What do you see?") -> str:
        """
        Look at a screenshot and describe what's there.
        """
        return await self.think(
            task=question,
            images=[screenshot_b64]
        )

    async def fix_code(self, code: str, error: str, filename: str) -> str:
        """
        Read code + error, return fixed code.
        Used for self-repair.
        """
        prompt = f"""Fix this Python code. Return ONLY the corrected code, no explanation.

File: {filename}
Error: {error}

Code:
```python
{code}
```

Return ONLY the fixed code inside ```python ``` blocks.
"""
        result = await self.think(task=prompt)

        # Extract code block
        if "```python" in result:
            code_block = result.split("```python")[1].split("```")[0].strip()
            return code_block
        elif "```" in result:
            code_block = result.split("```")[1].split("```")[0].strip()
            return code_block
        return result
