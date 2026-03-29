"""
JARVIS — Self-Maintenance Engine
=================================
Jarvis reads, repairs, updates, and improves its own code.
No human needed unless the fix requires a secret key.

Capabilities:
- Read its own source files
- Detect bugs from error logs
- Write fixes using Claude
- Restart affected modules
- Track all changes in a repair log
"""

import asyncio
import importlib
import logging
import os
import sys
import traceback
from datetime import datetime
from pathlib import Path

logger = logging.getLogger("jarvis.self_maintainer")

JARVIS_ROOT = Path(__file__).parent.parent  # Jarvis/ directory


class SelfMaintainer:
    """
    Jarvis can fix itself.

    How it works:
    1. Error is detected (by healer or master loop)
    2. Self-maintainer reads the broken file
    3. Sends code + error to Claude
    4. Applies the fix to the file
    5. Hot-reloads the module
    6. Logs the change
    """

    def __init__(self):
        self.repair_history: list[dict] = []

    async def fix_file(self, filepath: str, error: str) -> bool:
        """
        Read a file, fix it with Claude, write it back.
        Returns True if fix was applied successfully.
        """
        from core.brain_claude import ClaudeBrain
        brain = ClaudeBrain()

        logger.info(f"[SELF] Reading {filepath}...")
        path = Path(filepath)

        if not path.exists():
            logger.error(f"[SELF] File not found: {filepath}")
            return False

        original_code = path.read_text(encoding="utf-8")

        logger.info(f"[SELF] Asking Claude to fix {path.name}...")
        try:
            fixed_code = await brain.fix_code(
                code=original_code,
                error=error,
                filename=path.name
            )
        except Exception as e:
            logger.error(f"[SELF] Claude could not fix: {e}")
            return False

        if not fixed_code or fixed_code == original_code:
            logger.warning("[SELF] No change generated.")
            return False

        # Backup original
        backup = path.with_suffix(f".backup_{datetime.now().strftime('%Y%m%d%H%M%S')}.py")
        backup.write_text(original_code, encoding="utf-8")
        logger.info(f"[SELF] Backed up to {backup.name}")

        # Write fixed code
        path.write_text(fixed_code, encoding="utf-8")
        logger.info(f"[SELF] Fix applied to {path.name}")

        # Log repair
        self.repair_history.append({
            "timestamp": datetime.now().isoformat(),
            "file":      str(filepath),
            "error":     error[:300],
            "backup":    str(backup),
            "applied":   True
        })

        # Attempt hot reload
        self._hot_reload(path)

        return True

    async def update_self(self, instructions: str) -> dict:
        """
        Elliot says: "Update yourself to do X."
        Claude writes the new code. Jarvis applies it.
        """
        from core.brain_claude import ClaudeBrain
        brain = ClaudeBrain()

        logger.info(f"[SELF] Self-update requested: {instructions[:100]}")

        # Ask Claude which file to change and what to change
        prompt = f"""You are modifying Jarvis's own source code.

Update request: {instructions}

Available files:
{self._list_source_files()}

Respond in this EXACT format:
FILE: path/to/file.py
CHANGE: description of what to change
CODE:
```python
[complete new file content]
```
"""
        response = await brain.think(task=prompt)

        # Parse response
        result = self._parse_update_response(response)
        if not result:
            return {"success": False, "error": "Could not parse update instructions"}

        filepath = JARVIS_ROOT / result["file"]
        if not filepath.exists():
            return {"success": False, "error": f"File not found: {result['file']}"}

        # Backup and write
        original = filepath.read_text(encoding="utf-8")
        backup = filepath.with_suffix(f".pre_update_{datetime.now().strftime('%Y%m%d%H%M%S')}.py")
        backup.write_text(original, encoding="utf-8")
        filepath.write_text(result["code"], encoding="utf-8")

        self.repair_history.append({
            "timestamp":   datetime.now().isoformat(),
            "type":        "self_update",
            "file":        result["file"],
            "description": result["change"],
            "backup":      str(backup)
        })

        logger.info(f"[SELF] Updated {result['file']}: {result['change']}")
        self._hot_reload(filepath)

        return {
            "success":  True,
            "file":     result["file"],
            "change":   result["change"],
            "backup":   str(backup)
        }

    async def scan_for_bugs(self) -> list[dict]:
        """
        Scan logs for recent errors and pre-emptively fix them.
        """
        log_path = JARVIS_ROOT / "logs" / "jarvis.log"
        if not log_path.exists():
            return []

        # Read last 200 lines
        lines = log_path.read_text(encoding="utf-8", errors="ignore").split("\n")
        recent = lines[-200:]

        errors = []
        for i, line in enumerate(recent):
            if "ERROR" in line or "Traceback" in line:
                context_lines = recent[max(0, i-2): i+5]
                context = "\n".join(context_lines)
                errors.append({"line": line, "context": context})

        if errors:
            logger.info(f"[SELF] Found {len(errors)} recent errors in logs")

        return errors

    def _hot_reload(self, filepath: Path):
        """
        Attempt to reload a Python module without restarting.
        Works for most modules. Main entrypoints need restart.
        """
        try:
            # Convert filepath to module name
            rel = filepath.relative_to(JARVIS_ROOT)
            module_name = str(rel).replace(os.sep, ".").removesuffix(".py")

            if module_name in sys.modules:
                importlib.reload(sys.modules[module_name])
                logger.info(f"[SELF] Hot-reloaded: {module_name}")
            else:
                logger.info(f"[SELF] Module not loaded yet, no reload needed: {module_name}")
        except Exception as e:
            logger.warning(f"[SELF] Hot reload skipped (restart may be needed): {e}")

    def _list_source_files(self) -> str:
        """List all .py source files for Claude to reference."""
        files = []
        for path in JARVIS_ROOT.rglob("*.py"):
            rel = path.relative_to(JARVIS_ROOT)
            if ".backup_" not in str(rel) and "__pycache__" not in str(rel):
                files.append(str(rel))
        return "\n".join(sorted(files))

    def _parse_update_response(self, response: str) -> dict | None:
        """Parse Claude's FILE/CHANGE/CODE response."""
        try:
            lines = response.strip().split("\n")
            file_line   = next((l for l in lines if l.startswith("FILE:")), None)
            change_line = next((l for l in lines if l.startswith("CHANGE:")), None)

            if not file_line:
                return None

            file   = file_line.replace("FILE:", "").strip()
            change = change_line.replace("CHANGE:", "").strip() if change_line else ""

            # Extract code block
            if "```python" in response:
                code = response.split("```python")[1].split("```")[0].strip()
            elif "```" in response:
                code = response.split("```")[1].split("```")[0].strip()
            else:
                return None

            return {"file": file, "change": change, "code": code}
        except Exception:
            return None

    def get_history(self) -> list[dict]:
        return self.repair_history
