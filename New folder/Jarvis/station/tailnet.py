"""
Jarvis's secure Tailscale address.

Runs `tailscale serve` so Jarvis is also at https://<this-pc>.<tailnet>.ts.net (a real certificate,
reachable from the phone at home, away, and through any router). The https address is what lets the
phone unlock Jarvis with its fingerprint. Does nothing if Tailscale isn't installed.
"""

import json
import logging
import os
import shutil
import subprocess
from pathlib import Path

logger = logging.getLogger("jarvis.station.tailnet")
NO_WINDOW = 0x08000000 if os.name == "nt" else 0


def tailscale_exe() -> str | None:
    found = shutil.which("tailscale")
    if found:
        return found
    for base in (os.getenv("ProgramFiles"), os.getenv("ProgramFiles(x86)")):
        if base and (Path(base) / "Tailscale" / "tailscale.exe").exists():
            return str(Path(base) / "Tailscale" / "tailscale.exe")
    return None


def _run(args, timeout=25) -> subprocess.CompletedProcess | None:
    exe = tailscale_exe()
    if not exe:
        return None
    try:
        return subprocess.run([exe, *args], capture_output=True, text=True, timeout=timeout, creationflags=NO_WINDOW)
    except (OSError, subprocess.TimeoutExpired) as e:
        logger.info(f"[TAILNET] tailscale {' '.join(args)}: {e}")
        return None


def status() -> dict:
    r = _run(["status", "--json"], timeout=10)
    try:
        return json.loads(r.stdout) if r and r.returncode == 0 else {}
    except json.JSONDecodeError:
        return {}


def https_address() -> str | None:
    name = (status().get("Self") or {}).get("DNSName", "").rstrip(".")
    return f"https://{name}" if name.endswith(".ts.net") else None


def serve(port: int) -> str | None:
    """Publish http://127.0.0.1:<port> on the tailnet over https. Returns the https address or None."""
    if not tailscale_exe():
        return None
    r = _run(["serve", "--bg", str(port)])
    if r is None or r.returncode != 0:
        msg = ((r.stdout if r else "") + (r.stderr if r else "")).strip()
        logger.warning(f"[TAILNET] Couldn't publish the https address: {msg[:300]}")
        return None
    return https_address()
