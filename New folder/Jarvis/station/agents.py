"""
Jarvis's team: specialist agents he hands work to, plus routines that run on a schedule.

- Agents ("Tom the developer", …) each have a role. Jarvis gives one a task; it thinks with Friday's
  brains (any model you've set up there, incl. Claude) or the local Ollama model, and reports back.
- Browser jobs go to "Chrome", which hands them to Friday's Chrome side panel ("Browse for me") —
  the same Claude-in-Chrome style agent that asks before each action.
- Routines: e.g. a morning brief at 07:30 that lands on your phone as a notification and is read out
  by the HUD ("Good morning, sir…").
Everything is kept in station_data/agents.json and station_data/routines.json.
"""

import asyncio
import json
import logging
import secrets
import threading
from datetime import datetime
from pathlib import Path

import httpx

logger = logging.getLogger("jarvis.station.agents")

AGENTS = {
    "tom": {"name": "Tom", "role": "Developer",
            "prompt": "You are Tom, Elliot's senior developer agent. Plan and write working code, name files, "
                      "give exact commands. Be concise and practical."},
    "ava": {"name": "Ava", "role": "Research & marketing",
            "prompt": "You are Ava, Elliot's research and marketing agent (Caribbean market, CaribOps AI). Find "
                      "angles, summarise trends, draft posts and outreach. Bullet points, no fluff."},
    "max": {"name": "Max", "role": "Operations",
            "prompt": "You are Max, Elliot's operations agent. Turn goals into checklists with owners and dates, "
                      "spot risks, keep things moving. Short and direct."},
    "chrome": {"name": "Chrome", "role": "Browser (via Friday in Chrome)",
               "prompt": "You plan browser tasks step by step for Friday's Chrome side panel to carry out."},
}

DEFAULT_ROUTINES = [
    {"id": "brief", "name": "Morning brief", "time": "07:30", "agent": "ava", "enabled": True,
     "task": "Give Elliot (call him sir) a short morning brief: today's date, three priorities for his "
             "ventures (CaribOps AI, Friday/Jarvis, job applications), one idea worth trying today, "
             "and a motivating closing line. Under 120 words."},
    {"id": "evening", "name": "Evening wrap-up", "time": "19:30", "agent": "max", "enabled": True,
     "task": "Give Elliot (call him sir) a two-line evening wrap-up and the single most important thing "
             "to start tomorrow with."},
]


def vault_dir() -> Path:
    """Obsidian vault (plain Markdown files): briefs and agent reports land here as notes you can search,
    link and read on any device. Set JARVIS_VAULT to use an existing vault."""
    import os
    d = Path(os.getenv("JARVIS_VAULT") or Path.home() / "Documents" / "Jarvis Vault")
    (d / "Daily").mkdir(parents=True, exist_ok=True)
    (d / "Agents").mkdir(parents=True, exist_ok=True)
    return d


def write_note(run: dict):
    try:
        v = vault_dir()
        day = run["started"][:10]
        block = (f"\n## {run['started'][11:16]} · {run['name']} — {run['source']}\n"
                 f"**Task:** {run['task']}\n\n{run.get('result', '')}\n")
        daily = v / "Daily" / f"{day}.md"
        if not daily.exists():
            daily.write_text(f"# {day}\n\nLinks: [[Agents/Tom]] · [[Agents/Ava]] · [[Agents/Max]]\n", "utf-8")
        with open(daily, "a", encoding="utf-8") as f:
            f.write(block)
        with open(v / "Agents" / f"{run['name']}.md", "a", encoding="utf-8") as f:
            f.write(f"\n## [[Daily/{day}]] {run['started'][11:16]}\n**Task:** {run['task']}\n\n{run.get('result', '')}\n")
    except OSError as e:
        logger.info(f"[VAULT] couldn't write note: {e}")


class Team:
    def __init__(self, data_dir: Path, friday, brain, notifier):
        self.dir = Path(data_dir)
        self.friday, self.brain, self.notifier = friday, brain, notifier
        self.runs_path = self.dir / "agents.json"
        self.routines_path = self.dir / "routines.json"
        self.runs: list[dict] = self._load(self.runs_path, [])
        self.routines: list[dict] = self._load(self.routines_path, DEFAULT_ROUTINES)
        self._lock = threading.Lock()

    @staticmethod
    def _load(path, default):
        try:
            return json.loads(path.read_text("utf-8"))
        except (OSError, ValueError):
            return json.loads(json.dumps(default))

    def _save(self):
        with self._lock:
            self.runs_path.write_text(json.dumps(self.runs[-200:], indent=2), "utf-8")
            self.routines_path.write_text(json.dumps(self.routines, indent=2), "utf-8")

    async def think(self, system: str, task: str) -> tuple[str, str]:
        """(answer, brain used). Friday's brains first, then Jarvis's own Ollama model."""
        msgs = [{"role": "system", "content": system}, {"role": "user", "content": task}]
        if self.friday.enabled:
            try:
                return (await self.friday.chat(msgs)).strip(), "friday"
            except Exception as e:
                logger.info(f"[AGENTS] Friday unavailable, using Ollama: {e}")
        async with httpx.AsyncClient(timeout=600) as c:
            url = getattr(self.brain, "url", "http://localhost:11434").rstrip("/")
            model = getattr(self.brain, "model", "") or "qwen3:8b"
            r = await c.post(url + "/api/chat", json={"model": model, "messages": msgs, "stream": False})
            r.raise_for_status()
            text = r.json()["message"]["content"]
            if "</think>" in text:
                text = text.split("</think>", 1)[1]
            return text.strip(), f"ollama:{model}"

    async def run(self, agent_id: str, task: str, source: str = "you") -> dict:
        agent = AGENTS.get(agent_id) or AGENTS["max"]
        run = {"id": secrets.token_hex(4), "agent": agent_id, "name": agent["name"], "task": task[:2000],
               "source": source, "status": "working", "started": datetime.now().isoformat(timespec="seconds")}
        self.runs.append(run)
        self._save()
        try:
            prompt = agent["prompt"] + f"\nToday is {datetime.now():%A %d %B %Y, %H:%M}."
            run["result"], run["brain"] = await self.think(prompt, task)
            run["status"] = "done"
        except Exception as e:
            run["status"], run["result"] = "error", f"{agent['name']} couldn't finish: {e}"
        run["finished"] = datetime.now().isoformat(timespec="seconds")
        self._save()
        if run["status"] == "done":
            write_note(run)
        try:
            await self.notifier.notify(f"{agent['name']} · {run['status']}", run["result"][:300])
        except Exception:
            pass
        return run

    def start_run(self, agent_id: str, task: str, source: str = "you") -> str:
        loop = asyncio.get_running_loop()
        fut = loop.create_task(self.run(agent_id, task, source))
        fut.add_done_callback(lambda f: f.exception())
        return "started"

    async def scheduler(self):
        """Runs each enabled routine once a day at its time (HH:MM, PC clock)."""
        done_today: set[str] = set()
        while True:
            now = datetime.now()
            key_day = now.strftime("%Y-%m-%d")
            for r in self.routines:
                key = f"{key_day}:{r['id']}"
                if r.get("enabled") and r.get("time") == now.strftime("%H:%M") and key not in done_today:
                    done_today.add(key)
                    asyncio.get_running_loop().create_task(self.run(r["agent"], r["task"], source=r["name"]))
            await asyncio.sleep(20)

    def latest(self, source: str | None = None) -> dict | None:
        for r in reversed(self.runs):
            if r.get("status") == "done" and (source is None or r.get("source") == source):
                return r
        return None
