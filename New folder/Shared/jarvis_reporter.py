"""
Jarvis's reporter: keeps the shared file (shared_state.py) up to date for Friday's home-station dashboard.

  python jarvis_reporter.py                 # metrics, processes and service states only
  python jarvis_reporter.py --run-jarvis    # also starts Jarvis Station and records its log output
  python jarvis_reporter.py --no-sync       # without the network daemon (offline outbox sync)

Every few seconds it records CPU, memory, disk, battery and network use, the busiest processes, and whether
Jarvis, Friday and Ollama are running (by checking their ports on this PC). With --run-jarvis it starts
Jarvis exactly as start_station.bat does, unchanged, copies each line Jarvis logs into the activity log,
and restarts Jarvis if it stops unexpectedly.

Fully offline: it only reads this PC and talks to 127.0.0.1. Uses psutil when available (Jarvis's
.venv has it); without it, CPU/memory/process details are left blank.
"""

import argparse
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import shared_state as state  # noqa: E402
from net_daemon import NetDaemon  # noqa: E402

try:
    import psutil
except ImportError:
    psutil = None

JARVIS_DIR = Path(__file__).resolve().parent.parent / "Jarvis"
PORTS = {"jarvis": int(os.getenv("STATION_PORT", 8780)), "friday": int(os.getenv("FRIDAY_PORT", 8765)), "ollama": 11434}
LOG_LINE = re.compile(r"^\d{4}-\d\d-\d\d[ T][\d:,.]+\s+\[(?P<name>[^\]]+)\]\s+(?P<msg>.*)$")


def port_open(port):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.4):
            return True
    except OSError:
        return False


class Sampler:
    def __init__(self):
        self.procs = {}
        self.net = None
        self.cores = (psutil.cpu_count() or 1) if psutil else 1
        if psutil:
            psutil.cpu_percent(None)   # the first reading is always 0; prime it

    def metrics(self):
        now = time.time()
        m = {"ts": now}
        root = os.path.abspath(os.sep) if os.name != "nt" else os.environ.get("SystemDrive", "C:") + "\\"
        du = shutil.disk_usage(root)
        m.update(disk=round(du.used / du.total * 100, 1), disk_free=round(du.free / 1e9, 1))
        if not psutil:
            return m
        vm = psutil.virtual_memory()
        m.update(cpu=psutil.cpu_percent(None), mem=vm.percent, mem_used=round((vm.total - vm.available) / 1e9, 2),
                 mem_total=round(vm.total / 1e9, 2))
        try:
            b = psutil.sensors_battery()
            if b:
                m.update(battery=round(b.percent, 1), plugged=int(bool(b.power_plugged)))
        except (AttributeError, OSError):
            pass
        io = psutil.net_io_counters()
        if self.net:
            dt = max(0.1, now - self.net[0])
            m.update(net_up=round((io.bytes_sent - self.net[1]) / dt / 1024, 1),
                     net_down=round((io.bytes_recv - self.net[2]) / dt / 1024, 1))
        self.net = (now, io.bytes_sent, io.bytes_recv)
        return m

    def processes(self, limit=25):
        if not psutil:
            return []
        out, seen = [], set()
        for p in psutil.process_iter(["pid", "name", "memory_info", "status"]):
            pid = p.info["pid"]
            if pid == 0:
                continue
            seen.add(pid)
            proc = self.procs.setdefault(pid, p)
            try:
                cpu = proc.cpu_percent(None) / self.cores
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
            mem = p.info["memory_info"]
            out.append({"pid": pid, "name": p.info["name"] or str(pid), "cpu": round(cpu, 1),
                        "mem_mb": round(mem.rss / 1e6, 1) if mem else 0.0, "status": p.info["status"] or ""})
        for gone in set(self.procs) - seen:
            self.procs.pop(gone, None)
        out.sort(key=lambda r: (r["cpu"], r["mem_mb"]), reverse=True)
        return out[:limit]


class JarvisRunner:
    """Runs Jarvis Station as a child process and pipes its log into the shared activity log."""

    def __init__(self):
        self.proc = None
        self.stopping = False
        self.restarts = 0
        self.restart_at = None

    def command(self):
        for py in (JARVIS_DIR / ".venv" / "Scripts" / "python.exe", JARVIS_DIR / ".venv" / "bin" / "python"):
            if py.exists():
                return [str(py), "-u", "-m", "station"]
        return [sys.executable, "-u", "-m", "station"]

    def start(self):
        if not (JARVIS_DIR / "station").is_dir():
            state.log(f"Jarvis Station isn't in {JARVIS_DIR}; not starting it.", "error", "reporter")
            return
        if port_open(PORTS["jarvis"]):
            state.log("Jarvis is already running; recording metrics only.", "warning", "reporter")
            return
        env = {**os.environ, "PYTHONUNBUFFERED": "1", "PYTHONIOENCODING": "utf-8"}
        self.proc = subprocess.Popen(self.command(), cwd=str(JARVIS_DIR), env=env, stdout=subprocess.PIPE,
                                     stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace", bufsize=1,
                                     creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        state.log(f"Started Jarvis (pid {self.proc.pid}).", source="reporter")
        threading.Thread(target=self.pump, args=(self.proc,), daemon=True).start()

    def pump(self, proc):
        traceback = []
        for raw in proc.stdout:
            line = raw.rstrip()
            if not line.strip() or set(line.strip()) <= {"=", "-"}:
                continue
            if line.startswith("Traceback") or (traceback and (line.startswith(" ") or not LOG_LINE.match(line))):
                traceback.append(line)
                if not line.startswith((" ", "Traceback")):   # the last line names the error
                    state.log("\n".join(traceback[-12:]), "error", "jarvis")
                    traceback = []
                continue
            m = LOG_LINE.match(line)
            source, msg = ("jarvis." + m["name"].split(".")[-1], m["msg"]) if m else ("jarvis", line.strip())
            low = msg.lower()
            level = "error" if ("error" in low or "exception" in low or "failed" in low) else \
                "warning" if ("warn" in low or "could not" in low or "offline" in low) else "info"
            state.log(msg, level, source)

    def check(self):
        """Called every cycle: report Jarvis's state; restart it if it stopped by itself."""
        if not self.proc:
            return
        code = self.proc.poll()
        if code is None:
            state.put_service("jarvis", "running", self.proc.pid, f"started by the reporter; restarts: {self.restarts}")
            return
        if self.stopping:
            return
        if self.restart_at is None:   # it just stopped: wait a little longer after each crash, then restart
            self.restarts += 1
            wait = min(60, 5 * self.restarts)
            self.restart_at = time.time() + wait
            state.log(f"Jarvis stopped (exit code {code}). Restarting in {wait} s.", "error", "reporter")
        state.put_service("jarvis", "restarting", None, f"exit code {code}")
        if time.time() >= self.restart_at:
            self.restart_at = None
            self.proc = None
            self.start()

    def stop(self):
        self.stopping = True
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(10)
            except subprocess.TimeoutExpired:
                self.proc.kill()
            state.log("Stopped Jarvis.", source="reporter")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--run-jarvis", action="store_true", help="start Jarvis Station and record its log")
    ap.add_argument("--every", type=float, default=5, help="seconds between samples (default 5)")
    ap.add_argument("--no-sync", action="store_true", help="don't run the network daemon that syncs the outbox")
    args = ap.parse_args()
    daemon = None
    if not args.no_sync:   # watches the connection and sends the outbox in its own thread; never blocks this loop
        daemon = NetDaemon()
        daemon.start()

    sampler = Sampler()
    runner = JarvisRunner() if args.run_jarvis else None
    state.log(f"Reporter started (every {args.every:g} s{', psutil missing: limited metrics' if not psutil else ''}).",
              "warning" if not psutil else "info", "reporter")
    if runner:
        runner.start()
    print(f"Writing to {state.DB_FILE}. Ctrl+C to stop.", flush=True)
    cycle = 0
    try:
        while True:
            started = time.time()
            state.put_service("reporter", "running", os.getpid(), "psutil" if psutil else "no psutil")
            state.put_metrics(sampler.metrics())
            state.put_processes(sampler.processes())
            if runner and runner.proc:
                runner.check()
            for name, port in PORTS.items():
                if name == "jarvis" and runner and runner.proc:
                    continue
                state.put_service(name, "running" if port_open(port) else "stopped", None, f"port {port}")
            cycle += 1
            if cycle % 60 == 0:
                state.prune()
            time.sleep(max(0.5, args.every - (time.time() - started)))
    except KeyboardInterrupt:
        pass
    finally:
        if daemon:
            daemon.stop()
        if runner:
            runner.stop()
        state.put_service("reporter", "stopped", None, "")
        state.log("Reporter stopped.", source="reporter")


if __name__ == "__main__":
    main()
