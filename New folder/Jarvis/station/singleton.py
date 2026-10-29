"""
One Jarvis at a time, and a clean hand-over of port 8780 on updates.

Several things may start Jarvis (the Jarvis and Friday desktop apps' watchdogs, start_station.bat).
Before this, a second copy could start while the old one still held the port and die with
"port 8780 already in use". Now each copy records itself in station_data/jarvis.pid with the
version of the code it runs:

- a copy running the CURRENT code already holds the port  -> the new one exits quietly (code 0);
- a copy running OLDER code holds it (mid-update)          -> wait for it to let go, then stop it;
- anything else on the port                                  -> wait a little for it to be released.
"""

import json
import os
import socket
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent


def code_version() -> float:
    """Newest modification time of Jarvis's code: changes whenever an update is copied in."""
    try:
        return max(p.stat().st_mtime for p in HERE.glob("*.py"))
    except ValueError:
        return 0.0


def port_free(host: str, port: int) -> bool:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        if os.name == "nt":   # never steal a port another process is using
            s.setsockopt(socket.SOL_SOCKET, getattr(socket, "SO_EXCLUSIVEADDRUSE", -5), 1)
        s.bind(("0.0.0.0" if host in ("", "0.0.0.0") else host, port))
        return True
    except OSError:
        return False
    finally:
        s.close()


def _alive(pid: int) -> bool:
    try:
        import psutil
        return psutil.pid_exists(pid) and psutil.Process(pid).status() != psutil.STATUS_ZOMBIE
    except Exception:
        return False


def _is_jarvis(pid: int) -> bool:
    try:
        import psutil
        cmd = " ".join(psutil.Process(pid).cmdline()).lower()
        return "station" in cmd and "python" in cmd
    except Exception:
        return False


def _owner_of(port: int) -> int | None:
    try:
        import psutil
        for c in psutil.net_connections(kind="tcp"):
            if c.laddr and c.laddr.port == port and c.status == psutil.CONN_LISTEN and c.pid:
                return c.pid
    except Exception:
        pass
    return None


def _stop(pid: int):
    try:
        import psutil
        p = psutil.Process(pid)
        for child in p.children(recursive=True):   # e.g. the venv launcher's real python
            try:
                child.kill()
            except Exception:
                pass
        p.kill()
        p.wait(10)
    except Exception:
        pass


def read_pidfile(path: Path) -> dict:
    try:
        return json.loads(path.read_text("utf-8"))
    except (OSError, ValueError):
        return {}


def claim(data_dir: Path, host: str, port: int, wait: float = 25.0, log=print) -> bool:
    """True when this copy should run (the port is ours to take); False when a current copy
    is already serving, so this one should exit quietly."""
    pidfile = Path(data_dir) / "jarvis.pid"
    me, version = os.getpid(), code_version()
    deadline = time.time() + wait
    while True:
        if port_free(host, port):
            break
        info = read_pidfile(pidfile)
        holder = _owner_of(port) or info.get("pid")
        if holder and holder != me and _is_jarvis(holder):
            if info.get("pid") == holder and info.get("version", 0) >= version and _alive(holder):
                log("  Jarvis is already running the latest version: not starting a second copy.")
                return False
            if time.time() >= deadline:      # old copy didn't let go in time: stop it
                log(f"  An older Jarvis (pid {holder}) is still holding port {port}: stopping it.")
                _stop(holder)
                deadline = time.time() + 10
        elif time.time() >= deadline:
            log(f"  Port {port} is still busy after {wait:.0f}s; starting anyway.")
            break
        time.sleep(0.5)
    try:
        pidfile.parent.mkdir(parents=True, exist_ok=True)
        pidfile.write_text(json.dumps({"pid": me, "version": version, "started": time.time()}), "utf-8")
    except OSError:
        pass
    return True


def release(data_dir: Path):
    pidfile = Path(data_dir) / "jarvis.pid"
    if read_pidfile(pidfile).get("pid") == os.getpid():
        try:
            pidfile.unlink()
        except OSError:
            pass
