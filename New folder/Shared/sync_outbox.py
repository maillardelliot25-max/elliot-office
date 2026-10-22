"""
The offline outbox: anything that needs another device or the internet is written to a local file first.

  state/sync_queue.json   waiting to be sent (the outbox)
  state/sync_inbox.json   what came back (responses), newest first, last 300 kept

Writing to the outbox never touches the network, so it works offline and returns at once. net_daemon.py
sends the items when their destination is reachable and puts the replies in the inbox and the activity log.
Several programs may use these files at once: every change happens under a lock file and is written
atomically (temp file + rename), so a crash can never leave half a file.

An item:
  {"id", "kind": "http" | "friday_ask", "payload": {...}, "label", "task_id"?, "created",
   "status": "pending" | "sending" | "failed", "attempts", "next_try", "last_error"}
  kind "http":       payload {"method", "url", "headers"?, "body"?}           send a request to any endpoint
  kind "friday_ask": payload {"model", "prompt"}                               ask one of Friday's (cloud) brains
"""

import json
import os
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

import shared_state

QUEUE = shared_state.DIR / "sync_queue.json"
INBOX = shared_state.DIR / "sync_inbox.json"
LOCK = shared_state.DIR / "sync_queue.lock"
KINDS = ("http", "friday_ask")
MAX_ATTEMPTS = 8
LEASE_S = 120            # an item being sent is retried if its sender vanished for this long
KEEP_INBOX = 300


@contextmanager
def _locked(wait_s=10):
    """A lock file shared by every process using the outbox. A lock older than 30 s is a crashed holder's."""
    shared_state.DIR.mkdir(parents=True, exist_ok=True)
    deadline = time.time() + wait_s
    while True:
        try:
            fd = os.open(str(LOCK), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, str(os.getpid()).encode())
            os.close(fd)
            break
        except FileExistsError:
            try:
                if time.time() - LOCK.stat().st_mtime > 30:
                    LOCK.unlink(missing_ok=True)
                    continue
            except OSError:
                pass
            if time.time() > deadline:
                raise TimeoutError("The sync queue is busy; try again in a moment.")
            time.sleep(0.05)
    try:
        yield
    finally:
        LOCK.unlink(missing_ok=True)


def _read(path):
    try:
        data = json.loads(path.read_text("utf-8"))
        return data.get("items", []) if isinstance(data, dict) else []
    except (OSError, ValueError):
        return []


def _write(path, items):
    tmp = path.with_suffix(f".{os.getpid()}.tmp")
    tmp.write_text(json.dumps({"version": 1, "items": items}, ensure_ascii=False, indent=1), "utf-8")
    os.replace(tmp, path)


def enqueue(kind, payload, label="", task_id=None):
    """Save an action for later. Instant and offline; returns the item."""
    if kind not in KINDS:
        raise ValueError(f"Unknown sync kind {kind!r} (use one of {', '.join(KINDS)}).")
    if kind == "http" and not str(payload.get("url", "")).startswith(("http://", "https://")):
        raise ValueError("An http item needs a full http:// or https:// url.")
    if kind == "friday_ask" and not (payload.get("prompt") or "").strip():
        raise ValueError("A friday_ask item needs a prompt.")
    item = {"id": uuid.uuid4().hex[:12], "kind": kind, "payload": payload, "label": str(label)[:200],
            "task_id": task_id, "created": time.time(), "status": "pending", "attempts": 0, "next_try": 0,
            "last_error": ""}
    with _locked():
        items = _read(QUEUE)
        items.append(item)
        _write(QUEUE, items)
    shared_state.log(f"Saved for sync: {item['label'] or kind}", source="sync")
    return item


def pending():
    return _read(QUEUE)


def inbox(limit=50):
    return _read(INBOX)[:limit]


def take_due(can_send):
    """Lease the next item that is due and whose destination `can_send(item)` says is reachable."""
    now = time.time()
    with _locked():
        items = _read(QUEUE)
        for it in items:
            stale = it["status"] == "sending" and now - it.get("leased", 0) > LEASE_S
            if (it["status"] == "pending" or stale) and it["next_try"] <= now and can_send(it):
                it.update(status="sending", leased=now)
                _write(QUEUE, items)
                return dict(it)
    return None


def finish(item_id, ok, response=None, error="", permanent=False):
    """Record how sending went: success moves the item to the inbox; failure backs off and retries
    (or stops at once when `permanent`, e.g. the endpoint answered 404)."""
    with _locked():
        items = _read(QUEUE)
        it = next((i for i in items if i["id"] == item_id), None)
        if not it:
            return None
        if ok:
            items.remove(it)
            done = {**it, "status": "done", "sent": time.time(), "response": response}
            done.pop("leased", None)
            _write(INBOX, ([done] + _read(INBOX))[:KEEP_INBOX])
        else:
            it["attempts"] += 1
            it["last_error"] = str(error)[:500]
            it.pop("leased", None)
            if permanent or it["attempts"] >= MAX_ATTEMPTS:
                it["status"] = "failed"
            else:
                it["status"] = "pending"
                it["next_try"] = time.time() + min(3600, 30 * 2 ** (it["attempts"] - 1))
        _write(QUEUE, items)
        return it if not ok else done


def retry(item_id):
    with _locked():
        items = _read(QUEUE)
        for it in items:
            if it["id"] == item_id:
                it.update(status="pending", next_try=0, attempts=0, last_error="")
        _write(QUEUE, items)


def remove(item_id):
    with _locked():
        _write(QUEUE, [i for i in _read(QUEUE) if i["id"] != item_id])


def summary():
    items = pending()
    return {"waiting": sum(1 for i in items if i["status"] in ("pending", "sending")),
            "failed": sum(1 for i in items if i["status"] == "failed"),
            "items": items[:50], "recent": inbox(10)}
