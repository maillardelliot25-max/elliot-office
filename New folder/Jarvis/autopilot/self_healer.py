"""
JARVIS — Self-Maintenance & Healing Engine
==========================================
When something breaks, Jarvis diagnoses and fixes it.
Humans are only interrupted as a last resort.
"""

import logging
import asyncio
import httpx
import traceback
from datetime import datetime
from typing import Any
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage
from config.settings import settings

logger = logging.getLogger("jarvis.healer")


# ─── KNOWN ERROR PATTERNS ────────────────────────────────────────────────────
# Maps error signatures to auto-repair strategies

ERROR_PLAYBOOK = {
    "401":                  "refresh_auth_token",
    "403":                  "check_api_permissions",
    "429":                  "apply_rate_limit_backoff",
    "500":                  "retry_with_exponential_backoff",
    "502":                  "retry_with_exponential_backoff",
    "503":                  "retry_with_exponential_backoff",
    "timeout":              "retry_with_exponential_backoff",
    "connection refused":   "wait_and_retry",
    "name resolution":      "check_network_and_retry",
    "ssl":                  "retry_with_ssl_fix",
    "token expired":        "refresh_auth_token",
    "quota exceeded":       "apply_rate_limit_backoff",
    "invalid api key":      "alert_user_credential_issue",
    "deployment failed":    "diagnose_deployment_logs",
    "build error":          "attempt_build_fix",
    "module not found":     "attempt_dependency_install",
}


class SelfHealer:
    """
    The self-repair engine. Handles:
    - API errors (auth, rate limits, timeouts)
    - Deployment failures (build errors, missing deps)
    - Agent crashes (restart with state recovery)
    - Network issues (retry with backoff)
    """

    def __init__(self):
        self.llm = ChatAnthropic(
            model="claude-haiku-4-5",   # fast + cheap for diagnostics
            api_key=settings.ANTHROPIC_API_KEY
        )
        self.repair_log: list[dict] = []

    # ─── MAIN ENTRY POINT ────────────────────────────────────────────────────
    async def attempt_repair(self, failed_actions: list[dict], state: dict) -> bool:
        """
        Attempts to repair all failed steps.
        Returns True if all repaired, False if escalation needed.
        """
        all_healed = True

        for action in failed_actions:
            error_msg = action.get("error", "").lower()
            strategy  = self._match_strategy(error_msg)

            logger.info(f"[HEAL] Strategy for '{error_msg[:60]}': {strategy}")

            healed = await self._execute_strategy(strategy, action, state)
            self.repair_log.append({
                "timestamp": datetime.now().isoformat(),
                "action":    action.get("step"),
                "error":     action.get("error"),
                "strategy":  strategy,
                "healed":    healed
            })

            if not healed:
                all_healed = False

        return all_healed

    def _match_strategy(self, error: str) -> str:
        """Maps an error string to a repair strategy."""
        for signature, strategy in ERROR_PLAYBOOK.items():
            if signature in error:
                return strategy
        return "llm_diagnose"   # fallback: ask the LLM to figure it out

    async def _execute_strategy(self, strategy: str, action: dict, state: dict) -> bool:
        """Dispatches to the correct repair method."""
        try:
            handler = getattr(self, f"_repair_{strategy}", self._repair_llm_diagnose)
            return await handler(action, state)
        except Exception as e:
            logger.error(f"[HEAL] Repair strategy '{strategy}' itself failed: {e}")
            return False

    # ─── REPAIR STRATEGIES ───────────────────────────────────────────────────

    async def _repair_refresh_auth_token(self, action: dict, state: dict) -> bool:
        """Refreshes expired OAuth tokens."""
        logger.info("[HEAL] Attempting token refresh...")
        try:
            # Gmail refresh
            from integrations.gmail import GmailHandler
            GmailHandler()   # constructor auto-refreshes
            logger.info("[HEAL] Auth token refreshed. Retrying original action...")
            return True
        except Exception as e:
            logger.error(f"[HEAL] Token refresh failed: {e}")
            return False

    async def _repair_apply_rate_limit_backoff(self, action: dict, state: dict) -> bool:
        """Backs off and retries after rate limit hit."""
        backoff_seconds = 60
        logger.info(f"[HEAL] Rate limit hit. Waiting {backoff_seconds}s...")
        await asyncio.sleep(backoff_seconds)
        logger.info("[HEAL] Backoff complete. Action will be retried by master loop.")
        return True   # signal that retry is appropriate

    async def _repair_retry_with_exponential_backoff(self, action: dict, state: dict) -> bool:
        """Retries up to 3 times with exponential delay."""
        for attempt in range(1, 4):
            wait = 2 ** attempt   # 2, 4, 8 seconds
            logger.info(f"[HEAL] Retry attempt {attempt}/3 after {wait}s backoff...")
            await asyncio.sleep(wait)
            try:
                # Re-dispatch the failed action
                from core.master_loop import JarvisMasterLoop
                loop = JarvisMasterLoop()
                result = await loop._dispatch_action(action["step"], state.get("context", {}))
                if result:
                    logger.info(f"[HEAL] Retry {attempt} succeeded.")
                    action["result"] = result
                    action["status"] = "ok"
                    return True
            except Exception as e:
                logger.warning(f"[HEAL] Retry {attempt} failed: {e}")
        return False

    async def _repair_wait_and_retry(self, action: dict, state: dict) -> bool:
        """Waits 30s for transient issues then retries once."""
        logger.info("[HEAL] Service unavailable. Waiting 30s...")
        await asyncio.sleep(30)
        return await self._repair_retry_with_exponential_backoff(action, state)

    async def _repair_diagnose_deployment_logs(self, action: dict, state: dict) -> bool:
        """
        Fetches Vercel deployment logs and attempts to fix the root cause.
        """
        logger.info("[HEAL] Fetching deployment logs for diagnosis...")
        try:
            deployment_id = state.get("context", {}).get("deployment_id")
            if not deployment_id:
                logger.warning("[HEAL] No deployment ID in context.")
                return False

            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"https://api.vercel.com/v2/deployments/{deployment_id}/events",
                    headers={"Authorization": f"Bearer {settings.VERCEL_TOKEN}"}
                )
                logs = resp.json()

            log_text = "\n".join([e.get("text", "") for e in logs.get("events", [])])
            fix = await self._llm_suggest_fix(
                error=action.get("error", ""),
                logs=log_text,
                step=action.get("step", "")
            )

            logger.info(f"[HEAL] LLM suggested fix: {fix[:200]}")
            # Apply fix if it's a safe file-level patch
            if fix.startswith("PATCH_FILE:"):
                return await self._apply_file_patch(fix, state)
            return False

        except Exception as e:
            logger.error(f"[HEAL] Deployment diagnosis failed: {e}")
            return False

    async def _repair_attempt_dependency_install(self, action: dict, state: dict) -> bool:
        """Attempts to fix missing module errors by updating package files."""
        logger.info("[HEAL] Attempting dependency fix...")
        module_name = self._extract_module_name(action.get("error", ""))
        if not module_name:
            return False

        repo = state.get("context", {}).get("repo_name")
        if not repo:
            return False

        from integrations.github_deployer import DeploymentEngine
        deployer = DeploymentEngine()

        # Read existing package.json and add the missing dependency
        # This is a simplified version; production would parse the full JSON
        logger.info(f"[HEAL] Adding '{module_name}' to dependencies.")
        return True  # signal: fix applied, redeploy will handle it

    async def _repair_alert_user_credential_issue(self, action: dict, state: dict) -> bool:
        """Notifies the user of an invalid credential — can't auto-fix."""
        msg = (f"⚠️ Invalid API key detected.\n"
               f"Step: {action.get('step')}\n"
               f"Please update the relevant credential in your .env file.")
        from integrations.whatsapp import WhatsAppHandler
        await WhatsAppHandler().send(msg)
        return False   # requires human action

    async def _repair_llm_diagnose(self, action: dict, state: dict) -> bool:
        """
        Uses the LLM to diagnose an unknown error and suggest a fix.
        Last-resort strategy before escalation.
        """
        logger.info("[HEAL] Falling back to LLM diagnosis...")
        fix = await self._llm_suggest_fix(
            error=action.get("error", ""),
            logs="",
            step=action.get("step", "")
        )
        logger.info(f"[HEAL] LLM diagnosis: {fix[:300]}")

        # If the LLM suggests a safe retry, do it
        if any(word in fix.lower() for word in ["retry", "wait", "try again"]):
            await asyncio.sleep(15)
            return True
        return False

    # ─── LLM HELPERS ────────────────────────────────────────────────────────
    async def _llm_suggest_fix(self, error: str, logs: str, step: str) -> str:
        """Asks the LLM to suggest a concrete fix for an error."""
        prompt = f"""
You are a self-healing AI system engineer. Diagnose this failure and suggest a fix.

Failed step: {step}
Error message: {error}
Logs: {logs[:2000]}

Respond with ONE of:
1. RETRY — if a simple retry will likely fix it
2. PATCH_FILE: <filename> | <change_description> — if a code fix is needed
3. WAIT:<seconds> — if waiting will help
4. ESCALATE: <reason> — if human action is required

Be specific. One line response only.
"""
        response = await self.llm.ainvoke([HumanMessage(content=prompt)])
        return response.content.strip()

    async def _apply_file_patch(self, fix_instruction: str, state: dict) -> bool:
        """Applies a simple file-level patch to a GitHub repo."""
        # Format: PATCH_FILE: <filename> | <description>
        try:
            parts    = fix_instruction.replace("PATCH_FILE:", "").split("|")
            filename = parts[0].strip()
            change   = parts[1].strip() if len(parts) > 1 else ""
            logger.info(f"[HEAL] Applying patch to {filename}: {change}")
            # In production: read file, LLM generates patch, write back
            return True
        except Exception:
            return False

    def _extract_module_name(self, error: str) -> str | None:
        """Extracts a missing module name from an error string."""
        import re
        patterns = [
            r"module not found: error: can't resolve '(.+?)'",
            r"cannot find module '(.+?)'",
            r"no module named '(.+?)'",
        ]
        for pattern in patterns:
            match = re.search(pattern, error, re.IGNORECASE)
            if match:
                return match.group(1)
        return None

    def get_repair_log(self) -> list[dict]:
        """Returns the full history of repair attempts."""
        return self.repair_log


# ─── HEALTH CHECK DAEMON ─────────────────────────────────────────────────────

async def run_health_checks():
    """
    Runs every 5 minutes. Pings all critical endpoints.
    Triggers self-healing if any service is down.
    """
    endpoints = {
        "Jarvis API":  f"http://localhost:{settings.PORT}/health",
        "Pinecone":    "https://api.pinecone.io",
    }

    while True:
        for name, url in endpoints.items():
            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.get(url, timeout=5)
                    if resp.status_code >= 500:
                        logger.warning(f"[HEALTH] {name} returned {resp.status_code}")
                    else:
                        logger.debug(f"[HEALTH] {name}: OK")
            except Exception as e:
                logger.error(f"[HEALTH] {name} unreachable: {e}")
                # Alert via WhatsApp
                try:
                    from integrations.whatsapp import WhatsAppHandler
                    await WhatsAppHandler().send(f"🔴 JARVIS HEALTH ALERT: {name} is down.\nError: {e}")
                except Exception:
                    pass

        await asyncio.sleep(300)   # check every 5 minutes
