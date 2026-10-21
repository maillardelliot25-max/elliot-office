"""
God Station — Recall (screen memory)
=====================================
Jarvis looks at your screen every few seconds and keeps what it saw, so you
(and Claude) can ask "what was that site I had open this morning?" later.

Storage on the PC only, in 8-hour segments (00–08, 08–16, 16–24):

    station_data/recall/2026-10-21_08-16/093015.jpg
    station_data/recall/recall.db   ← window titles + text read off the screen

To keep it small:
- a frame is only saved when the screen actually changed
- nothing is saved while the PC is locked/blank
- windows whose title matches the exclude list (password managers,
  incognito…) are never recorded
- old segments are deleted automatically (keep N segments / max GB)
"""

import io
import logging
import re
import shutil
import sqlite3
import threading
from datetime import datetime
from pathlib import Path

logger = logging.getLogger("jarvis.station.recall")

SEGMENT_HOURS = 8
SAVE_WIDTH = 1366          # frames are stored at most this wide
JPEG_QUALITY = 55
CHANGE_THRESHOLD = 1.5     # average pixel change (0-255) needed to count as "changed"

STOPWORDS = {"the", "and", "was", "how", "much", "what", "when", "where", "who", "why", "which", "did",
             "does", "you", "your", "for", "that", "this", "with", "from", "have", "had", "are", "were",
             "about", "can", "could", "would", "should", "there", "then", "than", "into", "my", "me"}

SCHEMA = """
CREATE TABLE IF NOT EXISTS frames (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    ts      TEXT NOT NULL,
    segment TEXT NOT NULL,
    file    TEXT NOT NULL,
    bytes   INTEGER NOT NULL,
    window  TEXT NOT NULL DEFAULT '',
    text    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS frames_segment ON frames(segment);
CREATE VIRTUAL TABLE IF NOT EXISTS frames_fts USING fts5(
    window, text, content='frames', content_rowid='id'
);
CREATE TRIGGER IF NOT EXISTS frames_ai AFTER INSERT ON frames BEGIN
    INSERT INTO frames_fts(rowid, window, text) VALUES (new.id, new.window, new.text);
END;
CREATE TRIGGER IF NOT EXISTS frames_ad AFTER DELETE ON frames BEGIN
    INSERT INTO frames_fts(frames_fts, rowid, window, text) VALUES ('delete', old.id, old.window, old.text);
END;
"""


def segment_of(dt: datetime) -> str:
    start = (dt.hour // SEGMENT_HOURS) * SEGMENT_HOURS
    return f"{dt:%Y-%m-%d}_{start:02d}-{start + SEGMENT_HOURS:02d}"


def segment_label(segment: str) -> str:
    """'2026-10-21_08-16' → 'Tue 21 Oct, 08:00–16:00'"""
    try:
        day, hours = segment.split("_")
        a, b = hours.split("-")
        return f"{datetime.strptime(day, '%Y-%m-%d'):%a %d %b}, {a}:00–{b}:00"
    except ValueError:
        return segment


class RecallStore:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(str(self.root / "recall.db"), check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        with self._lock:
            self.db.executescript(SCHEMA)
            self.db.commit()

    def add_frame(self, when: datetime, jpeg: bytes, window: str, text: str = "") -> int:
        segment = segment_of(when)
        folder = self.root / segment
        folder.mkdir(exist_ok=True)
        name = f"{when:%H%M%S}.jpg"
        n = 1
        while (folder / name).exists():
            name = f"{when:%H%M%S}_{n}.jpg"
            n += 1
        (folder / name).write_bytes(jpeg)
        with self._lock:
            cur = self.db.execute(
                "INSERT INTO frames (ts, segment, file, bytes, window, text) VALUES (?, ?, ?, ?, ?, ?)",
                (when.isoformat(timespec="seconds"), segment, f"{segment}/{name}", len(jpeg), window, text),
            )
            self.db.commit()
            return cur.lastrowid

    def frame_path(self, frame_id: int) -> Path | None:
        with self._lock:
            row = self.db.execute("SELECT file FROM frames WHERE id = ?", (frame_id,)).fetchone()
        return self.root / row["file"] if row else None

    def frames(self, segment: str | None = None, limit: int = 60, before_id: int | None = None) -> list[dict]:
        q, args = "SELECT id, ts, segment, window, substr(text, 1, 200) AS snippet FROM frames WHERE 1=1", []
        if segment:
            q += " AND segment = ?"
            args.append(segment)
        if before_id:
            q += " AND id < ?"
            args.append(before_id)
        q += " ORDER BY id DESC LIMIT ?"
        args.append(limit)
        with self._lock:
            return [dict(r) for r in self.db.execute(q, args).fetchall()]

    def search(self, query: str, limit: int = 30, any_word: bool = False) -> list[dict]:
        """all words, newest first (search box) — or any_word, best match first (Jarvis's context)."""
        words = [w for w in re.findall(r"\w+", query.lower()) if len(w) > 1]
        if any_word:
            words = [w for w in words if len(w) > 2 and w not in STOPWORDS]
        if not words:
            return []
        match = (" OR " if any_word else " AND ").join(f'"{w}"' for w in words)
        order = "bm25(frames_fts)" if any_word else "f.id DESC"
        with self._lock:
            rows = self.db.execute(
                f"""SELECT f.id, f.ts, f.segment, f.window,
                          snippet(frames_fts, 1, '[', ']', '…', 12) AS snippet
                   FROM frames_fts JOIN frames f ON f.id = frames_fts.rowid
                   WHERE frames_fts MATCH ? ORDER BY {order} LIMIT ?""",
                (match, limit),
            ).fetchall()
        return [dict(r) for r in rows]

    def segments(self) -> list[dict]:
        with self._lock:
            rows = self.db.execute(
                """SELECT segment, COUNT(*) AS frames, SUM(bytes) AS bytes, MIN(ts) AS first, MAX(ts) AS last
                   FROM frames GROUP BY segment ORDER BY segment DESC"""
            ).fetchall()
        return [{**dict(r), "label": segment_label(r["segment"])} for r in rows]

    def total_bytes(self) -> int:
        with self._lock:
            return self.db.execute("SELECT COALESCE(SUM(bytes), 0) FROM frames").fetchone()[0]

    def delete_segment(self, segment: str) -> bool:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}_\d{2}-\d{2}", segment):
            return False
        with self._lock:
            n = self.db.execute("DELETE FROM frames WHERE segment = ?", (segment,)).rowcount
            self.db.commit()
        shutil.rmtree(self.root / segment, ignore_errors=True)
        return n > 0

    def enforce_limits(self, keep_segments: int, max_bytes: int) -> list[str]:
        """Delete the oldest segments until both limits are met. Never deletes the current one."""
        removed = []
        segs = self.segments()  # newest first
        current = segment_of(datetime.now())
        total = sum(s["bytes"] for s in segs)
        for s in reversed(segs):
            too_many = len(segs) - len(removed) > keep_segments
            too_big = total > max_bytes
            if not (too_many or too_big) or s["segment"] == current:
                break
            self.delete_segment(s["segment"])
            removed.append(s["segment"])
            total -= s["bytes"]
        return removed


def load_ocr():
    """Free Windows OCR (built into Windows 10/11). Returns a function img → text, or None."""
    try:
        import winocr
    except Exception:
        return None

    def ocr(img) -> str:
        result = winocr.recognize_pil_sync(img.convert("RGBA"), "en")
        return (result or {}).get("text", "") if isinstance(result, dict) else ""
    return ocr


class Recorder:
    """Call tick() every few seconds; it decides whether there's anything worth saving."""

    def __init__(self, store: RecallStore, control, settings, ocr=None):
        self.store = store
        self.control = control
        self.settings = settings
        self.ocr = ocr
        self._last = None
        self._ticks = 0
        self.last_status = "starting"
        self.last_saved: str | None = None

    def tick(self) -> str:
        self.last_status = self._tick()
        return self.last_status

    def _tick(self) -> str:
        from PIL import Image, ImageChops, ImageStat
        if not self.settings["recall"]:
            self._last = None
            return "off"

        window = self.control.active_window()
        lowered = window.lower()
        if any(word in lowered for word in self.settings["recall_exclude"]):
            return "private window — not recording"

        img = self.control.grab_image()
        small = img.convert("L").resize((96, 54))
        if ImageStat.Stat(small).mean[0] < 6:
            return "screen is blank or locked"
        if self._last is not None:
            diff = ImageStat.Stat(ImageChops.difference(small, self._last)).mean[0]
            if diff < CHANGE_THRESHOLD:
                return "no change"
        self._last = small

        if img.width > SAVE_WIDTH:
            img = img.resize((SAVE_WIDTH, round(img.height * SAVE_WIDTH / img.width)), Image.BILINEAR)
        buf = io.BytesIO()
        img.convert("RGB").save(buf, "JPEG", quality=JPEG_QUALITY, optimize=True)

        text = ""
        if self.ocr and self.settings["recall_ocr"]:
            try:
                text = self.ocr(img)
            except Exception as e:
                logger.warning(f"[RECALL] OCR failed, turning it off for this run: {e}")
                self.ocr = None

        now = datetime.now()
        self.store.add_frame(now, buf.getvalue(), window, text)
        self.last_saved = now.isoformat(timespec="seconds")

        self._ticks += 1
        if self._ticks % 50 == 1:
            removed = self.store.enforce_limits(self.settings["recall_keep_segments"],
                                                int(self.settings["recall_max_gb"] * 2**30))
            if removed:
                logger.info(f"[RECALL] Freed space: deleted {removed}")
        return "saved"
