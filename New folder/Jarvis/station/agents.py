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
    "ava": {"name": "Ava", "role": "Marketing & events brain · social media manager",
            "knowledge": ["Knowledge/Elliot - Marketing & Events.md", "Clients"],
            "prompt": """You are Ava, Elliot's head of marketing, events and social media. You run social media for his
clients like a top agency social media manager: content calendars, creative concepts, hooks, captions, reels/TikTok
ideas, carousel outlines, hashtags, posting times for Trinidad & Tobago/Caribbean audiences, community replies,
influencer and activation ideas, campaign reports. You also plan live events and brand activations.
Be bold and creative but on-brand for each client. Write captions ready to post. Use British English.
Never use the word "fete" (say festival, cooler experience, live event). Call Elliot "sir".
Know Elliot's background and his clients from the notes below and use them."""},
    "tom": {"name": "Tom", "role": "Top-tier developer · IT · all tech",
            "knowledge": ["Knowledge/Elliot - IT & Tech.md"],
            "prompt": """You are Tom, a world-class principal engineer and IT expert: full-stack web and mobile
(React, Next.js, Tailwind, Node, Python/FastAPI, Supabase, Vercel, Android/Kotlin/Java, Electron), UI/UX that looks
premium, DevOps, networking (TCP/IP, LAN/Wi-Fi), Windows/M365/Azure/AWS admin, cybersecurity, data (SQL, Power BI).
You help Elliot (1) build top-level websites and apps: give complete, working, production-quality code, file by
file, plus exact run/deploy commands; (2) land and succeed in IT analyst / support / network / security roles:
interview prep, technical answers, labs to practise, certification paths, tailored resume bullets from his real
experience only; (3) proactively suggest better architecture, tools and ideas. Be direct, expert and practical.
Call Elliot "sir". Know Elliot's real background from the notes below."""},
    "max": {"name": "Max", "role": "Chief of staff · reports on every agent",
            "knowledge": [],
            "prompt": """You are Max, Elliot's chief of staff. You oversee every AI agent he has (Jarvis, Friday, Tom,
Ava, Chrome, routines). When asked for a report, summarise what each agent did, what's finished, what failed,
what's waiting on Elliot, and the next best actions, from the activity log below. Short, clear, numbered.
Call Elliot "sir"."""},
    "chrome": {"name": "Chrome", "role": "Browser (via Friday in Chrome)", "knowledge": [],
               "prompt": "You plan browser tasks step by step for Friday's Chrome side panel to carry out."},
}

KNOWLEDGE_SEED = {
    "Knowledge/Elliot - Marketing & Events.md": """# Elliot Maillard: marketing, brand & events
Edit this note: Ava reads it before every job.

- Based in Arouca, Trinidad and Tobago. Founder of CaribOps AI and NetOps.
- Diplomas: Event Management, Marketing, Digital Marketing, Graphic Design.
- R.O.A.D. Concepts and Events Management: Event Coordinator, Project Manager & Brand Manager; 2 years Brand Manager
  for R.O.A.D.'s Carnival supply shop / merchandise line.
- Blue Mojito (ready-to-drink cocktail brand): Brand Manager & Head Mixologist; bar stock and operations,
  activations, event and positioning decisions.
- Own private bar & mixology business for events and catering (since 2021).
- Marketing project for a Carnival band (Tribe-style).
- Real productions: Great Race National Parade, Rise Sunrise Cooler Experience, Squid Game themed entrance,
  ANSA McAL campaigns.
- Interests: live events and festival production, projection mapping for clubs/outdoor/brand activations,
  Caribbean-market entrepreneurship.
- Background in graphic design, brand management, marketing consulting, event coordination, social media management.
- Rules: never use the word "fete"; British English.
""",
    "Knowledge/Elliot - IT & Tech.md": """# Elliot Maillard: IT & tech
Edit this note: Tom reads it before every job.

- Systems and Network Technician, Club Royal Caribbean Casino.
- Security Systems Analyst, SWAT (private security company).
- Founder of CaribOps AI and NetOps: AI, automation and app development (Friday & Jarvis, MAILLARD AI,
  Pink.TT, SafetyLingo, Rundown news site, Caribbean-market platforms).
- Certifications: Certificate in Information Technology (IT Support), Basic Networking (LAN/Wi-Fi, TCP/IP),
  Microsoft Azure Fundamentals (AZ-900), Microsoft 365 Fundamentals (MS-900), AWS Cloud Foundations,
  Cisco Introduction to Cybersecurity, Fortinet Certified Fundamentals (FCF), Power BI Data Analyst training,
  CCTV Surveillance Operator.
- No degree (Certificate in IT). Prefers single-file HTML builds, Supabase backend, Vercel hosting,
  autonomous systems that need little manual input.
- Job hunting: IT analyst / support / network / cybersecurity roles; IT resumes list only IT/tech roles.
""",
    "Clients/README.md": """# Clients
One note per client (e.g. "Blue Mojito.md"): brand voice, audience, platforms, goals, do's and don'ts,
posting schedule. Ava reads every note in this folder before social media and marketing jobs.
""",
}

DEFAULT_ROUTINES = [
    {"id": "brief", "name": "Morning brief", "time": "07:30", "agent": "ava", "enabled": True,
     "task": "Give Elliot (call him sir) a short morning brief: today's date, three priorities for his "
             "ventures (CaribOps AI, Friday/Jarvis, job applications), one idea worth trying today, "
             "and a motivating closing line. Under 120 words."},
    {"id": "evening", "name": "Evening wrap-up", "time": "19:30", "agent": "max", "enabled": True,
     "task": "Give Elliot (call him sir) his evening report on every agent: what got done today, what's "
             "waiting on him, and the single most important thing to start tomorrow with."},
]


def vault_dir() -> Path:
    """Obsidian vault (plain Markdown files): briefs and agent reports land here as notes you can search,
    link and read on any device. Set JARVIS_VAULT to use an existing vault."""
    import os
    d = Path(os.getenv("JARVIS_VAULT") or Path.home() / "Documents" / "Jarvis Vault")
    (d / "Daily").mkdir(parents=True, exist_ok=True)
    (d / "Agents").mkdir(parents=True, exist_ok=True)
    return d


def seed_vault():
    v = vault_dir()
    for rel, text in KNOWLEDGE_SEED.items():
        p = v / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        if not p.exists():
            p.write_text(text, "utf-8")


def knowledge(agent: dict, limit: int = 12000) -> str:
    """The agent's notes from the Obsidian vault (files or whole folders), so you can teach it by editing notes."""
    v, parts = vault_dir(), []
    for rel in agent.get("knowledge", []):
        p = v / rel
        files = sorted(p.glob("*.md")) if p.is_dir() else [p]
        for f in files:
            try:
                parts.append(f"### {f.relative_to(v)}\n{f.read_text('utf-8')}")
            except OSError:
                pass
    text = "\n\n".join(parts)
    return ("\n\nNOTES FROM ELLIOT'S VAULT:\n" + text[:limit]) if text else ""


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
        try:
            seed_vault()
        except OSError:
            pass

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
            prompt = agent["prompt"] + f"\nToday is {datetime.now():%A %d %B %Y, %H:%M}." + knowledge(agent)
            if agent_id == "max":
                log = [f"- {r['started'][:16]} {r['name']} [{r['status']}] {r['task'][:120]} => {(r.get('result') or '')[:200]}"
                       for r in self.runs[-40:] if r is not run]
                prompt += "\n\nACTIVITY LOG (newest last):\n" + ("\n".join(log) or "No agent activity yet.")
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
