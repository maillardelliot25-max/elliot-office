"""
Ruflo hive with Friday as the queen.

    py -3 friday_hive.py "research three venues for a beach cooler experience and draft the pitch"

- Ruflo (C:\\Tools\\ruflo) keeps the hive: queen, workers, the task queue and a shared memory
  database stored in the Jarvis Vault (Ruflo\\memory.db). Its cloud/telemetry parts are switched off.
- Friday is the queen: she splits the job into worker tasks and merges the results.
- Every worker thinks through Friday's "Smart" brain (local Ollama, or Groq's free tier once you
  add its key in Friday). Nothing goes to Claude Code or any paid cloud.
- The finished run is written to the Jarvis Vault (Ruflo\\...) and Max files a report on it.
"""

import base64
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
from datetime import datetime
from pathlib import Path

HOME = Path(os.environ.get("USERPROFILE") or Path.home())
RUFLO_DIR = Path(os.environ.get("RUFLO_HOME", r"C:\Tools\ruflo"))
HIVE_DIR = RUFLO_DIR / "hive"
LOG_DIR = RUFLO_DIR / "logs"
VAULT = Path(os.environ.get("JARVIS_VAULT") or HOME / "Documents" / "Jarvis Vault")
FRIDAY = os.environ.get("FRIDAY_URL", "http://127.0.0.1:8765")
JARVIS = os.environ.get("JARVIS_URL", "http://127.0.0.1:8780")
FRIDAY_SETTINGS = Path(os.environ.get("FRIDAY_SETTINGS", HOME / r"Downloads\elliot-office-ccr-67243f97-slvh7v (1)"
                                      r"\elliot-office-ccr-67243f97-slvh7v\New folder\LocalAI\app\data\settings.json"))
MAX_WORKERS = int(os.environ.get("RUFLO_MAX_WORKERS", "4"))

# Ruflo: local only — no funnel/telemetry, no auto-update, no OpenTelemetry export, no skills.sh fetch
SAFE_ENV = {"RUFLO_FUNNEL": "0", "CLAUDE_FLOW_AUTO_UPDATE": "false",
            "RUFLO_FUNNEL_EVENTS_ENDPOINT": "http://127.0.0.1:9/", "RUFLO_FUNNEL_MESSAGES_ENDPOINT": "http://127.0.0.1:9/",
            "OTEL_SDK_DISABLED": "true", "RUFLO_NO_SKILLS_SH": "1", "CLAUDE_FLOW_DISABLE_BRIDGE": "1",
            "RUFLO_ENTERPRISE_POLICY": str(RUFLO_DIR / "policy.json"), "DO_NOT_TRACK": "1",
            "CLAUDE_FLOW_DB_PATH": str(VAULT / "Ruflo" / "memory.db")}

LOG = None


def say(msg: str):
    line = f"[{datetime.now():%H:%M:%S}] {msg}"
    print(line, flush=True)
    if LOG:
        LOG.write(line + "\n")
        LOG.flush()


def ruflo(*args, check=False, timeout=180) -> str:
    cmd = ["node", str(RUFLO_DIR / "node_modules" / "ruflo" / "bin" / "ruflo.js"), *args, "--no-color"]
    env = {**os.environ, **SAFE_ENV}
    p = subprocess.run(cmd, cwd=HIVE_DIR, env=env, capture_output=True, text=True, encoding="utf-8",
                       errors="replace", timeout=timeout)
    if check and p.returncode:
        raise RuntimeError(f"ruflo {' '.join(args[:2])} failed: {(p.stderr or p.stdout)[-400:]}")
    return p.stdout + p.stderr


def friday_token() -> str:
    try:
        return json.loads(FRIDAY_SETTINGS.read_text("utf-8-sig")).get("chrome_token", "")
    except (OSError, ValueError):
        return ""


def think(system: str, user: str, timeout=900) -> str:
    """One answer from Friday's Smart brain (her /v1 gateway)."""
    body = {"model": "smart", "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
    req = urllib.request.Request(FRIDAY + "/v1/chat/completions", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {friday_token()}"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        j = json.loads(r.read())
    if j.get("error"):
        raise RuntimeError(j["error"].get("message", "brain error"))
    text = j["choices"][0]["message"].get("content") or ""
    return text.split("</think>", 1)[-1].strip()


def plan(task: str) -> list[dict]:
    system = ("You are Friday, queen of Elliot's Ruflo hive. Split the job into 1-%d independent worker tasks. "
              "Roles: researcher, coder, analyst, writer, tester. Reply with JSON only: "
              '{"subtasks":[{"role":"researcher","task":"..."}]}. Small jobs get 1 subtask.') % MAX_WORKERS
    raw = think(system, task)
    m = re.search(r"\{.*\}", raw, re.S)
    try:
        subs = json.loads(m.group(0))["subtasks"] if m else []
    except (ValueError, KeyError, TypeError):
        subs = []
    subs = [s for s in subs if isinstance(s, dict) and str(s.get("task", "")).strip()][:MAX_WORKERS]
    return subs or [{"role": "analyst", "task": task}]


def remember(key: str, value: str):
    ruflo("memory", "store", "-k", key, "-n", "hive", "--value", value[:6000], "--no-embedding",
          "--provenance", "agent_output", "--path", SAFE_ENV["CLAUDE_FLOW_DB_PATH"])


def set_task(task_id: str, **fields):
    """Keep Ruflo's own task list accurate (ruflo task list / status)."""
    store = HIVE_DIR / ".claude-flow" / "tasks" / "store.json"
    try:
        data = json.loads(store.read_text("utf-8"))
        data["tasks"][task_id].update(fields)
        store.write_text(json.dumps(data, indent=2), "utf-8")
    except (OSError, ValueError, KeyError):
        pass


def tell_jarvis(path: str, body: dict):
    req = urllib.request.Request(JARVIS + path, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=20).read()
    except Exception as e:
        say(f"(Jarvis didn't answer: {e})")


def main(task: str) -> int:
    global LOG
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    HIVE_DIR.mkdir(parents=True, exist_ok=True)
    (VAULT / "Ruflo").mkdir(parents=True, exist_ok=True)
    stamp = datetime.now()
    LOG = open(LOG_DIR / f"run-{stamp:%Y%m%d-%H%M%S}.log", "a", encoding="utf-8")
    say(f"Ruflo hive · queen: Friday · task: {task}")

    if not (HIVE_DIR / ".claude-flow" / "hive-mind" / "state.json").exists():
        ruflo("hive-mind", "init", "-t", "hierarchical", check=True)
    out = ruflo("hive-mind", "task", "-d", task[:500], check=True)
    m = re.search(r"task-\d+-\w+", out)
    task_id = m.group(0) if m else f"task-{int(time.time())}"
    set_task(task_id, status="in_progress", startedAt=stamp.isoformat(), assignedTo=["friday-queen"])
    say(f"Hive task {task_id}")

    try:
        subs = plan(task)
        say("Queen's plan: " + " | ".join(f"{s.get('role', 'worker')}: {s['task'][:80]}" for s in subs))
        remember(f"{task_id}/plan", json.dumps(subs))
        results = []
        for i, s in enumerate(subs, 1):
            role = re.sub(r"[^a-z]", "", str(s.get("role", "worker")).lower()) or "worker"
            ruflo("hive-mind", "spawn", "-n", "1", "-t", role, "-p", f"friday-{role}")
            shared = "\n\n".join(f"[{r['role']}] {r['task']}\n{r['result'][:1500]}" for r in results)
            system = (f"You are a {role} worker in Elliot's Ruflo hive, run by Friday. Do your part fully and "
                      "concretely. British English. Overall job: " + task +
                      ("\n\nSHARED HIVE MEMORY (other workers' results):\n" + shared if shared else ""))
            say(f"Worker {i}/{len(subs)} ({role}) working…")
            t0 = time.time()
            result = think(system, s["task"])
            results.append({"role": role, "task": s["task"], "result": result})
            remember(f"{task_id}/worker-{i}-{role}", result)
            say(f"Worker {i} done in {time.time() - t0:.0f}s")
            set_task(task_id, progress=round(100 * i / (len(subs) + 1)))

        if len(results) > 1:
            say("Queen merging the results…")
            final = think("You are Friday, queen of Elliot's Ruflo hive. Merge the workers' results into one clear, "
                          "complete answer for Elliot (call him sir). British English.",
                          f"Job: {task}\n\n" + "\n\n".join(f"## {r['role']}: {r['task']}\n{r['result']}" for r in results))
        else:
            final = results[0]["result"]
        remember(f"{task_id}/final", final)
        set_task(task_id, status="completed", progress=100, completedAt=datetime.now().isoformat())
    except Exception as e:
        set_task(task_id, status="failed", error=str(e)[:300])
        say(f"Hive failed: {e}")
        tell_jarvis("/api/agents/run", {"agent": "max", "task": f"Report to Elliot: the Ruflo hive run '{task[:200]}' "
                                        f"({task_id}) failed: {str(e)[:300]}. Say what to check."})
        return 1

    slug = re.sub(r"[^\w\- ]", "", task)[:50].strip() or "run"
    note = VAULT / "Ruflo" / f"{stamp:%Y-%m-%d %H%M} {slug}.md"
    body = [f"# Ruflo hive: {task}", "", f"- Hive task: `{task_id}`", f"- Queen: Friday · workers via Friday's Smart brain",
            f"- Started {stamp:%Y-%m-%d %H:%M}, finished {datetime.now():%H:%M}", "", "## Result", "", final, "", "## Workers"]
    for r in results:
        body += ["", f"### {r['role']}: {r['task']}", "", r["result"]]
    note.write_text("\n".join(body) + "\n", "utf-8")
    say(f"Saved to the Jarvis Vault: {note}")

    tell_jarvis("/api/agents/run", {"agent": "max", "task": (
        f"Report to Elliot on the Ruflo hive run that just finished. Task: {task[:300]}. Hive task {task_id}, "
        f"{len(results)} worker(s): {', '.join(r['role'] for r in results)}. Full notes: Jarvis Vault/Ruflo/{note.name}. "
        f"Result:\n{final[:2500]}\n\nSummarise what was done, anything weak or unfinished, and the next step.")})
    say("Max is writing his report. Done.")
    print("\n" + final)
    return 0


if __name__ == "__main__":
    args = sys.argv[1:]
    if args[:1] == ["--b64"]:
        task = base64.b64decode(args[1]).decode("utf-8")
    else:
        task = " ".join(args)
    if not task.strip():
        print("Usage: friday_hive.py <task>")
        sys.exit(2)
    sys.exit(main(task.strip()))
