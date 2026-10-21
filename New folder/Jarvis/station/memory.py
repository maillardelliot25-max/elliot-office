"""
God Station — Memory
=====================
Every message between you and Jarvis, from any device, saved on the PC
in one SQLite file (station_data/memory.db). Full-text search lets
Jarvis (and you) find what you said weeks ago.

Free, offline, no extra installs. Size is limited only by your disk.
"""

import re
import sqlite3
import threading
from datetime import datetime
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS messages (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    ts     TEXT NOT NULL,
    device TEXT NOT NULL DEFAULT '',
    role   TEXT NOT NULL,
    text   TEXT NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    text, content='messages', content_rowid='id'
);
CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts(rowid, text) VALUES (new.id, new.text);
END;
CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, text) VALUES ('delete', old.id, old.text);
END;
CREATE TABLE IF NOT EXISTS clips (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    ts     TEXT NOT NULL,
    source TEXT NOT NULL,
    text   TEXT NOT NULL
);
"""

MAX_CLIPS = 500
MAX_CLIP_CHARS = 20000


class StationMemory:
    def __init__(self, db_path: Path):
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(str(db_path), check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        with self._lock:
            self.db.executescript(SCHEMA)
            self.db.commit()

    def add(self, role: str, text: str, device: str = "") -> int:
        with self._lock:
            cur = self.db.execute(
                "INSERT INTO messages (ts, device, role, text) VALUES (?, ?, ?, ?)",
                (datetime.now().isoformat(timespec="seconds"), device, role, text),
            )
            self.db.commit()
            return cur.lastrowid

    def recent(self, limit: int = 20) -> list[dict]:
        """Most recent messages, oldest first."""
        with self._lock:
            rows = self.db.execute(
                "SELECT id, ts, device, role, text FROM messages ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
        return [dict(r) for r in reversed(rows)]

    def search(self, query: str, limit: int = 10, exclude_ids: set[int] | None = None) -> list[dict]:
        words = [w for w in re.findall(r"\w+", query.lower()) if len(w) > 2]
        if not words:
            return []
        match = " OR ".join(f'"{w}"' for w in words)
        with self._lock:
            rows = self.db.execute(
                """SELECT m.id, m.ts, m.device, m.role, m.text
                   FROM messages_fts JOIN messages m ON m.id = messages_fts.rowid
                   WHERE messages_fts MATCH ?
                   ORDER BY bm25(messages_fts) LIMIT ?""",
                (match, limit + len(exclude_ids or ())),
            ).fetchall()
        results = [dict(r) for r in rows if r["id"] not in (exclude_ids or set())]
        return results[:limit]

    # ── Shared clipboard history ─────────────────────────────────────────────

    def add_clip(self, text: str, source: str) -> bool:
        """Saves a copied text. Skips blanks and repeats of the latest clip."""
        text = (text or "")[:MAX_CLIP_CHARS]
        if not text.strip():
            return False
        with self._lock:
            last = self.db.execute("SELECT text FROM clips ORDER BY id DESC LIMIT 1").fetchone()
            if last and last["text"] == text:
                return False
            self.db.execute("INSERT INTO clips (ts, source, text) VALUES (?, ?, ?)",
                            (datetime.now().isoformat(timespec="seconds"), source, text))
            self.db.execute("DELETE FROM clips WHERE id <= (SELECT MAX(id) FROM clips) - ?", (MAX_CLIPS,))
            self.db.commit()
            return True

    def clips(self, limit: int = 50) -> list[dict]:
        """Newest first."""
        with self._lock:
            rows = self.db.execute(
                "SELECT id, ts, source, text FROM clips ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
        return [dict(r) for r in rows]

    def clear_clips(self):
        with self._lock:
            self.db.execute("DELETE FROM clips")
            self.db.commit()

    def count(self) -> int:
        with self._lock:
            return self.db.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
