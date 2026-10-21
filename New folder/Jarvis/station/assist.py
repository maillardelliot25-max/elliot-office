"""
God Station — Assist (form filling)
====================================
Your details live in station_data/profile.json (on the PC only). When the
Chrome helper or a PDF asks "what goes in this box?", Jarvis answers from
your profile first (instant, exact), then asks the brain for the rest.
"""

import json
import random
import re
import threading
from pathlib import Path

PROFILE_FIELDS = [
    ("full_name", "Full name"), ("first_name", "First name"), ("last_name", "Last name"),
    ("email", "Email"), ("phone", "Phone"),
    ("address_line1", "Address line 1"), ("address_line2", "Address line 2"),
    ("city", "City / town"), ("state", "State / parish / province"), ("zip", "ZIP / postal code"),
    ("country", "Country"), ("birthday", "Birthday (YYYY-MM-DD)"),
    ("company", "Company"), ("job_title", "Job title"), ("website", "Website"),
    ("notes", "Anything else Jarvis may use for forms"),
]

# HTML autocomplete tokens → profile keys (the most reliable signal)
AUTOCOMPLETE = {
    "name": "full_name", "given-name": "first_name", "family-name": "last_name",
    "email": "email", "tel": "phone", "tel-national": "phone",
    "street-address": "address_line1", "address-line1": "address_line1", "address-line2": "address_line2",
    "address-level2": "city", "address-level1": "state", "postal-code": "zip",
    "country": "country", "country-name": "country", "bday": "birthday",
    "organization": "company", "organization-title": "job_title", "url": "website",
}

# Words in a field's label/name/placeholder → profile keys. Order matters: specific first.
RULES = [
    (r"e[\s-]?mail", "email"),
    (r"phone|mobile|cell|tel\b|telephone|whatsapp", "phone"),
    (r"first.?name|given.?name|fore.?name|\bfname\b|\bfirst\b", "first_name"),
    (r"last.?name|sur.?name|family.?name|\blname\b|\blast\b", "last_name"),
    (r"full.?name|your.?name|^name$|^name\b|\bname\s*\*?$|applicant.?name", "full_name"),
    (r"address.?(line)?.?2|apt|apartment|suite|unit\b", "address_line2"),
    (r"address|street|addr\b|line.?1", "address_line1"),
    (r"city|town", "city"),
    (r"state|province|region|parish|county", "state"),
    (r"zip|postal|post.?code", "zip"),
    (r"country|nation", "country"),
    (r"birth|dob\b|bday", "birthday"),
    (r"company|organi[sz]ation|employer|business.?name", "company"),
    (r"job.?title|position|occupation", "job_title"),
    (r"website|web.?site|homepage|portfolio|\burl\b", "website"),
]

# Never filled automatically: logins, payment and ID numbers
NEVER = re.compile(r"user.?name|login|password|passcode|otp|one.?time|captcha|card|cvv|cvc|security.?code|"
                   r"expir|iban|routing|account.?number|ssn|social.?security|trn|passport|licen[cs]e.?n", re.I)

SKIP_TYPES = {"password", "hidden", "file", "submit", "button", "checkbox", "radio", "image", "reset"}

GREETINGS = ["Sir, I've got this.", "Allow me, sir.", "Right away, sir.", "At your service, sir.",
             "Leave it to me, sir."]


def greeting() -> str:
    return random.choice(GREETINGS)


class Profile:
    def __init__(self, data_dir: Path):
        self.path = Path(data_dir) / "profile.json"
        self._lock = threading.Lock()
        self.data = {k: "" for k, _ in PROFILE_FIELDS}
        if self.path.exists():
            try:
                self.data.update({k: str(v) for k, v in json.loads(self.path.read_text()).items()
                                  if k in self.data})
            except (OSError, json.JSONDecodeError):
                pass

    def update(self, changes: dict) -> dict:
        with self._lock:
            for k, v in changes.items():
                if k in self.data:
                    self.data[k] = str(v or "").strip()[:2000]
            self.path.write_text(json.dumps(self.data, indent=2))
        return self.values()

    def values(self) -> dict:
        """Profile with derived values filled in (e.g. full name from first + last)."""
        d = dict(self.data)
        if not d["full_name"] and (d["first_name"] or d["last_name"]):
            d["full_name"] = f"{d['first_name']} {d['last_name']}".strip()
        if d["full_name"] and not (d["first_name"] or d["last_name"]):
            parts = d["full_name"].split()
            d["first_name"], d["last_name"] = parts[0], " ".join(parts[1:])
        return d


def describe_field(f: dict) -> str:
    return " ".join(str(f.get(k) or "") for k in ("label", "name", "id", "placeholder")).strip()


def match_field(f: dict) -> str | None:
    """Which profile key fits this form field, or None."""
    if NEVER.search(describe_field(f)):
        return None
    ac = str(f.get("autocomplete") or "").lower().split()
    for token in reversed(ac):  # e.g. "shipping postal-code"
        if token in AUTOCOMPLETE:
            return AUTOCOMPLETE[token]
    t = str(f.get("type") or "").lower()
    if t == "email":
        return "email"
    if t == "tel":
        return "phone"
    # Label is the best signal; fall back to name/id/placeholder
    for text in (f.get("label"), f.get("placeholder"), f.get("name"), f.get("id")):
        text = re.sub(r"[_\-\[\]]+", " ", str(text or "")).strip().lower()
        if not text:
            continue
        for pattern, key in RULES:
            if re.search(pattern, text):
                return key
    return None


def fill_from_profile(fields: list[dict], profile: dict) -> tuple[list[dict], list[dict]]:
    """Returns (values we filled, fields still unknown)."""
    filled, unknown = [], []
    for f in fields:
        if str(f.get("type") or "").lower() in SKIP_TYPES or NEVER.search(describe_field(f)):
            continue
        key = match_field(f)
        value = profile.get(key, "") if key else ""
        if value:
            filled.append({"i": f["i"], "value": value, "source": "profile", "key": key})
        else:
            unknown.append(f)
    return filled, unknown
