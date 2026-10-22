"""
Friday's home-station dashboard: the data behind /station.

Reads the shared file Jarvis's reporter writes (../../Shared/shared_state.py: metrics, processes, services,
tasks, activity log) and, read-only, the files Jarvis Station already keeps in Jarvis/station_data
(screen memory, conversation memory, switches, paired devices). Nothing here touches the network, and
Jarvis's own files are opened read-only so they can never be changed from Friday.
"""

import json
import sqlite3
from contextlib import closing
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "Shared"))
import net_daemon  # noqa: E402
import shared_state  # noqa: E402
import sync_outbox  # noqa: E402

import jarvis_link  # noqa: E402  (knows where Jarvis keeps its data)

JARVIS_DATA = jarvis_link.TOKEN_FILE.parent
REPORTER_STALE_S = 30
SWITCHES = [("recall", "Screen memory"), ("clipboard", "Clipboard sync"), ("assist", "Form helper"),
            ("notify", "Notifications"), ("telegram", "Telegram"), ("friday", "Friday link")]


def _read_only(db):
    """Open one of Jarvis's databases without any chance of writing to it."""
    return sqlite3.connect(f"file:{db.as_posix()}?mode=ro", uri=True, timeout=2)


def _one(con, sql, args=()):
    try:
        return con.execute(sql, args).fetchone()
    except sqlite3.Error:
        return None


def jarvis_data():
    out = {"found": JARVIS_DATA.is_dir(), "folder": str(JARVIS_DATA)}
    if not out["found"]:
        return out
    today = datetime.now().strftime("%Y-%m-%d")
    recall_db = JARVIS_DATA / "recall" / "recall.db"
    if recall_db.exists():
        try:
            with closing(_read_only(recall_db)) as con:
                total = _one(con, "SELECT COUNT(*), COALESCE(SUM(bytes), 0) FROM frames") or (0, 0)
                todays = _one(con, "SELECT COUNT(*) FROM frames WHERE ts >= ?", (today,)) or (0,)
                last = _one(con, "SELECT ts, window FROM frames ORDER BY id DESC LIMIT 1")
                segs = _one(con, "SELECT COUNT(DISTINCT segment) FROM frames") or (0,)
            out["recall"] = {"frames": total[0], "mb": round(total[1] / 1e6, 1), "today": todays[0], "segments": segs[0],
                             "last_ts": last[0] if last else None, "last_window": last[1] if last else ""}
        except sqlite3.Error as e:
            out["recall"] = {"error": str(e)}
    memory_db = JARVIS_DATA / "memory.db"
    if memory_db.exists():
        try:
            with closing(_read_only(memory_db)) as con:
                msgs = _one(con, "SELECT COUNT(*) FROM messages") or (0,)
                todays = _one(con, "SELECT COUNT(*) FROM messages WHERE ts >= ?", (today,)) or (0,)
                last = _one(con, "SELECT ts, device FROM messages ORDER BY id DESC LIMIT 1")
                clips = _one(con, "SELECT COUNT(*) FROM clips") or (0,)
            out["memory"] = {"messages": msgs[0], "today": todays[0], "clips": clips[0],
                             "last_ts": last[0] if last else None, "last_device": last[1] if last else ""}
        except sqlite3.Error as e:
            out["memory"] = {"error": str(e)}
    try:
        settings = json.loads((JARVIS_DATA / "settings.json").read_text("utf-8"))
        out["switches"] = [{"label": label, "on": bool(settings.get(key, True))} for key, label in SWITCHES]
    except (OSError, ValueError):
        out["switches"] = []
    try:
        devices = json.loads((JARVIS_DATA / "devices.json").read_text("utf-8"))
        out["devices"] = sorted(({"name": d.get("name", "Device"), "paired_at": d.get("paired_at", "")}
                                 for d in devices.values() if isinstance(d, dict)), key=lambda d: d["paired_at"])
    except (OSError, ValueError, AttributeError):
        out["devices"] = []
    return out


def state():
    snap = shared_state.snapshot()
    reporter = snap["services"].get("reporter")
    snap["reporter_ok"] = bool(reporter and reporter["status"] == "running"
                               and time.time() - reporter["heartbeat"] < REPORTER_STALE_S)
    for svc in snap["services"].values():   # a service not refreshed lately is unknown, not "running"
        if svc["name"] != "reporter" and not snap["reporter_ok"]:
            svc["status"] = "unknown"
    snap["services"]["friday"] = {"name": "friday", "status": "running", "pid": None, "detail": "serving this page",
                                  "heartbeat": time.time()}
    snap["jarvis"] = jarvis_data()
    snap["sync"] = {**sync_outbox.summary(), "network": net_daemon.network_status()}
    snap["shared_file"] = str(shared_state.DB_FILE)
    return snap


def offline():
    """True only when the network daemon has recently seen no internet (unknown counts as online)."""
    return net_daemon.network_status()["online"] is False


def sync_act(body):
    """Outbox buttons: retry / remove one item."""
    if body.get("action") == "retry":
        sync_outbox.retry(body.get("id", ""))
    elif body.get("action") == "remove":
        sync_outbox.remove(body.get("id", ""))
    else:
        raise ValueError("Unknown outbox action.")
    return sync_outbox.summary()


def act(body):
    """A button on the dashboard: add / pause / resume / cancel / retry / raise / lower / remove / clear."""
    action = body.get("action", "")
    if action == "add":
        return {"id": shared_state.add_task(body.get("title", ""), body.get("detail", ""), body.get("priority", 2))}
    if action == "clear":
        return {"cleared": shared_state.clear_finished()}
    return {"task": shared_state.act_on_task(body.get("id", 0), action)}
