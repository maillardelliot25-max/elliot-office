"""
The local file both assistants share: one SQLite file, no network.

Jarvis's side (jarvis_reporter.py, and later Jarvis's own task runner) writes system metrics, process and
service states, its log output and task progress. Friday reads it all for the home-station dashboard, and
writes when you act on a task (add, pause, cancel, retry, reprioritise). SQLite's locking keeps the two
writers safe; WAL mode lets the dashboard read while Jarvis writes.

Location: <this folder>/state/shared.db, or the folder in the FJ_SHARED_DIR environment variable.
Standard library only, so both apps can import it without installing anything.
"""

import json
import os
import sqlite3
import threading
import time
from pathlib import Path

DIR = Path(os.getenv("FJ_SHARED_DIR") or Path(__file__).resolve().parent / "state")
DB_FILE = DIR / "shared.db"

TASK_STATES = ("queued", "running", "paused", "done", "failed", "cancelled")
ACTIVE = ("running", "paused")
FINISHED = ("done", "failed", "cancelled")
KEEP_METRICS_S = 24 * 3600
KEEP_EVENTS = 5000

SCHEMA = """
CREATE TABLE IF NOT EXISTS tasks (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    title    TEXT NOT NULL,
    detail   TEXT NOT NULL DEFAULT '',
    status   TEXT NOT NULL DEFAULT 'queued',
    priority INTEGER NOT NULL DEFAULT 2,          -- 1 high, 2 normal, 3 low
    source   TEXT NOT NULL DEFAULT 'friday',      -- who asked: friday, jarvis, schedule…
    progress REAL,                                -- 0..1 while running, if the runner knows
    result   TEXT NOT NULL DEFAULT '',
    created  REAL NOT NULL,
    updated  REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS tasks_status ON tasks(status);
CREATE TABLE IF NOT EXISTS events (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    ts      REAL NOT NULL,
    level   TEXT NOT NULL DEFAULT 'info',         -- info, warning, error
    source  TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS metrics (
    ts       REAL PRIMARY KEY,
    cpu      REAL,                                -- percent
    mem      REAL,                                -- percent
    mem_used REAL,                                -- GB
    mem_total REAL,                               -- GB
    disk     REAL,                                -- percent (system drive)
    disk_free REAL,                               -- GB
    battery  REAL,                                -- percent, NULL on desktops
    plugged  INTEGER,
    net_up   REAL,                                -- KB/s
    net_down REAL                                 -- KB/s
);
CREATE TABLE IF NOT EXISTS processes (            -- the latest snapshot only
    pid    INTEGER PRIMARY KEY,
    name   TEXT NOT NULL,
    cpu    REAL NOT NULL,
    mem_mb REAL NOT NULL,
    status TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS services (
    name      TEXT PRIMARY KEY,                   -- jarvis, friday, ollama, reporter
    status    TEXT NOT NULL,                      -- running, stopped, restarting
    pid       INTEGER,
    detail    TEXT NOT NULL DEFAULT '',
    heartbeat REAL NOT NULL
);
"""

_local = threading.local()


def connect():
    """One connection per thread; creates the file and tables on first use."""
    con = getattr(_local, "con", None)
    if con is None:
        DIR.mkdir(parents=True, exist_ok=True)
        con = sqlite3.connect(str(DB_FILE), timeout=10, isolation_level=None)
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA journal_mode=WAL")
        con.execute("PRAGMA busy_timeout=10000")
        con.executescript(SCHEMA)
        _local.con = con
    return con


def rows(sql, args=()):
    return [dict(r) for r in connect().execute(sql, args).fetchall()]


# ── Events (the activity log) ────────────────────────────────────────────

def log(message, level="info", source="jarvis"):
    con = connect()
    con.execute("INSERT INTO events (ts, level, source, message) VALUES (?, ?, ?, ?)",
                (time.time(), level if level in ("info", "warning", "error") else "info", source, str(message)[:2000]))


def events(limit=200, level=None):
    if level == "warning":
        return rows("SELECT * FROM events WHERE level IN ('warning','error') ORDER BY id DESC LIMIT ?", (limit,))
    if level == "error":
        return rows("SELECT * FROM events WHERE level = 'error' ORDER BY id DESC LIMIT ?", (limit,))
    return rows("SELECT * FROM events ORDER BY id DESC LIMIT ?", (limit,))


# ── Metrics, processes, services ─────────────────────────────────────────

def put_metrics(m):
    cols = ("cpu", "mem", "mem_used", "mem_total", "disk", "disk_free", "battery", "plugged", "net_up", "net_down")
    connect().execute(f"INSERT OR REPLACE INTO metrics (ts, {', '.join(cols)}) VALUES (?{', ?' * len(cols)})",
                      (m.get("ts", time.time()), *[m.get(c) for c in cols]))


def metrics_since(seconds):
    return rows("SELECT * FROM metrics WHERE ts >= ? ORDER BY ts", (time.time() - seconds,))


def put_processes(procs):
    con = connect()
    with con:
        con.execute("BEGIN")
        con.execute("DELETE FROM processes")
        con.executemany("INSERT OR REPLACE INTO processes (pid, name, cpu, mem_mb, status) VALUES (?, ?, ?, ?, ?)",
                        [(p["pid"], p["name"], p["cpu"], p["mem_mb"], p.get("status", "")) for p in procs])


def processes(limit=15):
    return rows("SELECT * FROM processes ORDER BY cpu DESC, mem_mb DESC LIMIT ?", (limit,))


def put_service(name, status, pid=None, detail=""):
    connect().execute("INSERT OR REPLACE INTO services (name, status, pid, detail, heartbeat) VALUES (?, ?, ?, ?, ?)",
                      (name, status, pid, detail, time.time()))


def services():
    return {r["name"]: r for r in rows("SELECT * FROM services")}


def prune():
    con = connect()
    con.execute("DELETE FROM metrics WHERE ts < ?", (time.time() - KEEP_METRICS_S,))
    con.execute("DELETE FROM events WHERE id <= (SELECT MAX(id) FROM events) - ?", (KEEP_EVENTS,))


# ── Tasks ────────────────────────────────────────────────────────────────

def add_task(title, detail="", priority=2, source="friday"):
    title = str(title).strip()[:300]
    if not title:
        raise ValueError("A task needs a title.")
    now = time.time()
    cur = connect().execute(
        "INSERT INTO tasks (title, detail, status, priority, source, created, updated) VALUES (?, ?, 'queued', ?, ?, ?, ?)",
        (title, str(detail)[:4000], min(3, max(1, int(priority))), source, now, now))
    log(f"Task added: {title}", source=source)
    return cur.lastrowid


def tasks(limit=200):
    return rows("""SELECT * FROM tasks ORDER BY
                     CASE status WHEN 'running' THEN 0 WHEN 'paused' THEN 1 WHEN 'queued' THEN 2 ELSE 3 END,
                     CASE WHEN status IN ('done','failed','cancelled') THEN -updated ELSE priority END,
                     created LIMIT ?""", (limit,))


# What each action does: allowed starting states → new state
ACTIONS = {
    "pause":  (("queued", "running"), "paused"),
    "resume": (("paused",), "queued"),
    "cancel": (("queued", "running", "paused"), "cancelled"),
    "retry":  (("failed", "cancelled"), "queued"),
}


def act_on_task(task_id, action, source="friday"):
    """A user action from the dashboard. Returns the task as it is afterwards."""
    con = connect()
    t = con.execute("SELECT * FROM tasks WHERE id = ?", (int(task_id),)).fetchone()
    if not t:
        raise ValueError("That task no longer exists.")
    now = time.time()
    if action in ACTIONS:
        allowed, new = ACTIONS[action]
        cur = con.execute(f"UPDATE tasks SET status = ?, updated = ? WHERE id = ? AND status IN ({','.join('?' * len(allowed))})",
                          (new, now, t["id"], *allowed))
        if not cur.rowcount:
            raise ValueError(f"Can't {action} a task that is {t['status']}.")
    elif action in ("raise", "lower"):
        step = -1 if action == "raise" else 1
        con.execute("UPDATE tasks SET priority = MIN(3, MAX(1, priority + ?)), updated = ? WHERE id = ?", (step, now, t["id"]))
    elif action == "remove":
        if t["status"] not in FINISHED:
            raise ValueError("Cancel the task before removing it.")
        con.execute("DELETE FROM tasks WHERE id = ?", (t["id"],))
        log(f"Task removed: {t['title']}", source=source)
        return None
    else:
        raise ValueError(f"Unknown action {action}.")
    log(f"Task {action}: {t['title']}", source=source)
    return dict(con.execute("SELECT * FROM tasks WHERE id = ?", (t["id"],)).fetchone())


def clear_finished(source="friday"):
    n = connect().execute("DELETE FROM tasks WHERE status IN ('done','failed','cancelled')").rowcount
    if n:
        log(f"Cleared {n} finished task{'s' if n != 1 else ''}", source=source)
    return n


# For a task runner (Jarvis): claim the next queued task, report progress, finish it.

def claim_next(runner="jarvis"):
    con = connect()
    with con:
        con.execute("BEGIN IMMEDIATE")
        t = con.execute("SELECT * FROM tasks WHERE status = 'queued' ORDER BY priority, created LIMIT 1").fetchone()
        if not t:
            return None
        con.execute("UPDATE tasks SET status = 'running', progress = 0, updated = ? WHERE id = ?", (time.time(), t["id"]))
    log(f"Started: {t['title']}", source=runner)
    return {**dict(t), "status": "running"}


def still_wanted(task_id):
    """False once you paused or cancelled it from the dashboard: the runner should stop."""
    r = connect().execute("SELECT status FROM tasks WHERE id = ?", (int(task_id),)).fetchone()
    return bool(r) and r["status"] == "running"


def report(task_id, progress=None, status=None, result=None, runner="jarvis"):
    sets, args = ["updated = ?"], [time.time()]
    if progress is not None:
        sets.append("progress = ?")
        args.append(max(0.0, min(1.0, float(progress))))
    if status in ("done", "failed"):
        sets.append("status = ?")
        args.append(status)
    if result is not None:
        sets.append("result = ?")
        args.append(str(result)[:4000])
    connect().execute(f"UPDATE tasks SET {', '.join(sets)} WHERE id = ? AND status = 'running'", (*args, int(task_id)))
    if status in ("done", "failed"):
        log(f"Task {status}: #{task_id}" + (f" ({str(result)[:200]})" if result else ""),
            level="error" if status == "failed" else "info", source=runner)


def snapshot():
    """Everything the dashboard shows, in one read."""
    return {
        "metrics": metrics_since(30 * 60),
        "processes": processes(),
        "services": services(),
        "tasks": tasks(),
        "events": events(150),
        "now": time.time(),
    }


if __name__ == "__main__":   # quick look from a terminal: python shared_state.py
    print(json.dumps({k: (v if k != "metrics" else v[-1:]) for k, v in snapshot().items()}, indent=1, default=str))
