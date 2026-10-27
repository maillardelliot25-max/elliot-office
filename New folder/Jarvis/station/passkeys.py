"""
Fingerprint unlock (passkeys / WebAuthn)
========================================
Instead of a PIN, the phone unlocks Jarvis with its own fingerprint (Samsung biometrics). Each unlock
gives the phone a session that lasts SESSION_HOURS; after that (or after Jarvis restarts) it asks
for the fingerprint again. Passkeys sync through Google Password Manager, so a tablet signed in to the
same Google account can unlock with no PIN at all.

Browsers only allow passkeys on secure pages, so this works on Jarvis's https Tailscale address
(https://<pc>.<tailnet>.ts.net) or on the PC itself (localhost).
"""

import base64
import json
import logging
import secrets
import threading
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

logger = logging.getLogger("jarvis.station.passkeys")

SESSION_HOURS = 12
CHALLENGE_TTL = 300


def b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def secure_origin(origin: str | None) -> tuple[str, str] | None:
    """(origin, rp_id) if the page is one passkeys may be used on, else None."""
    if not origin:
        return None
    u = urlparse(origin)
    host = (u.hostname or "").lower()
    if u.scheme == "https" and host.endswith(".ts.net"):
        return origin, host
    if host in ("localhost", "127.0.0.1"):
        return origin, "localhost"
    return None


class Passkeys:
    def __init__(self, data_dir: Path, owner: str = "Elliot"):
        self.path = Path(data_dir) / "passkeys.json"
        self.owner = owner
        self._lock = threading.Lock()
        self.keys: list[dict] = self._load()
        self.challenges: dict[str, float] = {}
        self.sessions: dict[str, dict] = {}          # token -> {"exp", "name", "id"}

    @staticmethod
    def available() -> bool:
        try:
            import webauthn  # noqa: F401
            return True
        except ImportError:
            return False

    def _load(self) -> list[dict]:
        try:
            return json.loads(self.path.read_text())
        except (OSError, json.JSONDecodeError):
            return []

    def _save(self):
        self.path.write_text(json.dumps(self.keys, indent=2))

    def _new_challenge(self) -> bytes:
        now = time.time()
        self.challenges = {c: t for c, t in self.challenges.items() if now - t < CHALLENGE_TTL}
        ch = secrets.token_bytes(32)
        self.challenges[b64(ch)] = now
        return ch

    def _take_challenge(self, client_data_b64: str) -> bytes:
        cd = json.loads(unb64(client_data_b64))
        ch = cd.get("challenge", "")
        if ch not in self.challenges:
            raise ValueError("This request expired. Try again.")
        del self.challenges[ch]
        return unb64(ch)

    # ── register (from a device that's already unlocked) ──
    def register_options(self, rp_id: str) -> str:
        from webauthn import generate_registration_options, options_to_json
        from webauthn.helpers.structs import (AuthenticatorSelectionCriteria, PublicKeyCredentialDescriptor,
                                              ResidentKeyRequirement, UserVerificationRequirement)
        opts = generate_registration_options(
            rp_id=rp_id, rp_name="Jarvis Station", user_id=b"jarvis-owner", user_name=self.owner,
            user_display_name=self.owner, challenge=self._new_challenge(),
            authenticator_selection=AuthenticatorSelectionCriteria(
                resident_key=ResidentKeyRequirement.REQUIRED,
                user_verification=UserVerificationRequirement.REQUIRED),
            exclude_credentials=[PublicKeyCredentialDescriptor(id=unb64(k["id"])) for k in self.keys
                                 if k.get("rp_id") == rp_id])
        return options_to_json(opts)

    def register_verify(self, credential: dict, origin: str, rp_id: str, name: str) -> dict:
        from webauthn import verify_registration_response
        challenge = self._take_challenge(credential["response"]["clientDataJSON"])
        v = verify_registration_response(credential=credential, expected_challenge=challenge,
                                         expected_origin=origin, expected_rp_id=rp_id,
                                         require_user_verification=True)
        with self._lock:
            self.keys.append({"id": b64(v.credential_id), "public_key": b64(v.credential_public_key),
                              "sign_count": v.sign_count, "rp_id": rp_id, "name": (name or "Phone")[:60],
                              "created": datetime.now().isoformat(timespec="seconds")})
            self._save()
        logger.info(f"[PASSKEY] Fingerprint unlock added for {name}")
        return self.issue_session(name)

    # ── unlock ──
    def login_options(self, rp_id: str) -> str:
        from webauthn import generate_authentication_options, options_to_json
        from webauthn.helpers.structs import UserVerificationRequirement
        opts = generate_authentication_options(rp_id=rp_id, challenge=self._new_challenge(),
                                               user_verification=UserVerificationRequirement.REQUIRED)
        return options_to_json(opts)

    def login_verify(self, credential: dict, origin: str, rp_id: str) -> dict:
        from webauthn import verify_authentication_response
        key = next((k for k in self.keys if k["id"] == credential.get("id") and k.get("rp_id") == rp_id), None)
        if not key:
            raise ValueError("This fingerprint key isn't set up for Jarvis. Pair with the PIN once, then turn on fingerprint unlock.")
        challenge = self._take_challenge(credential["response"]["clientDataJSON"])
        v = verify_authentication_response(credential=credential, expected_challenge=challenge,
                                           expected_rp_id=rp_id, expected_origin=origin,
                                           credential_public_key=unb64(key["public_key"]),
                                           credential_current_sign_count=key.get("sign_count", 0),
                                           require_user_verification=True)
        with self._lock:
            key["sign_count"] = v.new_sign_count
            key["last_used"] = datetime.now().isoformat(timespec="seconds")
            self._save()
        return self.issue_session(key["name"])

    # ── sessions ──
    def issue_session(self, name: str) -> dict:
        token = secrets.token_urlsafe(32)
        self.sessions[token] = {"exp": time.time() + SESSION_HOURS * 3600, "name": name,
                                "id": "fp-" + secrets.token_hex(3)}
        return {"token": token, "hours": SESSION_HOURS}

    def check(self, token: str | None) -> str | None:
        s = self.sessions.get(token or "")
        if not s:
            return None
        if s["exp"] < time.time():
            self.sessions.pop(token, None)
            return None
        return s["id"]

    def list(self) -> list[dict]:
        return [{"id": k["id"][:12], "name": k["name"], "created": k["created"], "address": k.get("rp_id")}
                for k in self.keys]
