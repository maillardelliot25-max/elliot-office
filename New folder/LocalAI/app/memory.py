"""
Long-term memory: what Jarvis knows about the user (likes, dislikes, preferences,
people, projects, goals…). Facts come from three places:

  - the user adding them on the Memory screen
  - the AI calling its `remember` tool mid-conversation
  - automatic learning after each reply (see `learn_prompt` / `parse_learned`)

Stored as a JSON list in data/memory.json. Near-duplicates are skipped.
"""

import difflib
import json
import re
import threading
import time
import uuid

CATEGORIES = ["About me", "Likes", "Dislikes", "Preferences", "Work & projects", "People", "Goals", "Other"]
PROMPT_BUDGET = 6000   # characters of memory put in front of the model every turn
SECRET = re.compile(r"(password|passcode|api[ _-]?key|sk-[a-z0-9]|\b\d{12,19}\b|\bcvv\b|social security|\bpin\b)", re.I)


def _norm(text):
    return re.sub(r"\W+", " ", text.lower()).strip()


def _words(text):
    return {w for w in _norm(text).split() if len(w) > 2}


class Memory:
    def __init__(self, path):
        self.path = path
        self.lock = threading.Lock()

    def all(self):
        try:
            return json.loads(self.path.read_text("utf-8"))
        except (OSError, ValueError):
            return []

    def _save(self, items):
        self.path.write_text(json.dumps(items, indent=1), "utf-8")

    def _similar(self, items, text, threshold):
        n = _norm(text)
        best, score = None, 0.0
        for m in items:
            r = difflib.SequenceMatcher(None, n, _norm(m["text"])).ratio()
            if r > score:
                best, score = m, r
        return best if score >= threshold else None

    def add(self, text, category="Other", source=""):
        text = " ".join(str(text).split())[:300]
        if len(text) < 3 or SECRET.search(text):
            return None
        category = next((c for c in CATEGORIES if c.lower() == str(category).lower()), "Other")
        with self.lock:
            items = self.all()
            if self._similar(items, text, 0.85):
                return None
            entry = {"id": uuid.uuid4().hex, "text": text, "category": category, "added": time.time(), "source": source}
            items.append(entry)
            self._save(items)
            return entry

    def update(self, mid, text=None, category=None):
        with self.lock:
            items = self.all()
            for m in items:
                if m["id"] == mid:
                    if text:
                        m["text"] = " ".join(text.split())[:300]
                    if category in CATEGORIES:
                        m["category"] = category
            self._save(items)

    def delete(self, mid):
        with self.lock:
            self._save([m for m in self.all() if m["id"] != mid])

    def forget(self, text):
        """Remove the memory that best matches `text` (used by the AI's forget tool)."""
        with self.lock:
            items = self.all()
            hit = self._similar(items, text, 0.55) or next(
                (m for m in items if _words(text) and _words(text) <= _words(m["text"])), None)
            if hit:
                self._save([m for m in items if m["id"] != hit["id"]])
            return hit

    def migrate(self, old_strings):
        for s in old_strings or []:
            self.add(s, "Other", "settings")

    def search(self, query, limit=10):
        q = _words(query)
        scored = [(len(q & _words(m["text"])), m) for m in self.all()]
        return [m for s, m in sorted(scored, key=lambda x: -x[0]) if s][:limit]

    def for_prompt(self, query=""):
        """Everything if it fits; otherwise the most relevant memories plus the newest ones."""
        items = self.all()
        if sum(len(m["text"]) + 4 for m in items) > PROMPT_BUDGET:
            q = _words(query)
            relevant = sorted(items, key=lambda m: (len(q & _words(m["text"])), m["added"]), reverse=True)
            picked, used = [], 0
            for m in relevant:
                if used + len(m["text"]) > PROMPT_BUDGET:
                    break
                picked.append(m)
                used += len(m["text"]) + 4
            items = picked
        groups = {}
        for m in items:
            groups.setdefault(m["category"], []).append(m["text"])
        return "\n".join(f"{c}:\n" + "\n".join(f"- {t}" for t in groups[c]) for c in CATEGORIES if c in groups)


def learn_prompt(user_name, user_text, reply_text, known):
    return f"""You keep a long-term memory about {user_name or 'the user'} so their personal assistant remembers everything they like.

Read this exchange and pull out NEW lasting facts about the USER: what they like or love, what they dislike, preferences (style, tone, food, music, brands, tools, colours…), personal details they chose to share, people in their life, their work, business and projects, and their goals and plans.

Rules:
- Only facts about the user that will still be true and useful in future conversations.
- Ignore one-off questions, general knowledge, and anything about the assistant.
- Skip anything already known (listed below), and NEVER store passwords, API keys, card, bank or ID numbers.
- Each fact is one short sentence about the user, like "Likes minimalist terracotta-and-cream designs".
- Category must be one of: {", ".join(CATEGORIES)}.

Already known:
{known or "(nothing yet)"}

The exchange:
<user>{user_text[:4000]}</user>
<assistant>{reply_text[:2000]}</assistant>

Reply with JSON only: {{"memories": [{{"text": "...", "category": "..."}}]}}  (an empty list when there is nothing new)"""


def parse_learned(reply):
    m = re.search(r"\{.*\}", reply or "", re.S)
    try:
        data = json.loads(m.group(0)) if m else {}
    except ValueError:
        return []
    out = []
    for item in data.get("memories") or []:
        if isinstance(item, dict) and isinstance(item.get("text"), str):
            out.append((item["text"], item.get("category", "Other")))
        elif isinstance(item, str):
            out.append((item, "Other"))
    return out[:8]
