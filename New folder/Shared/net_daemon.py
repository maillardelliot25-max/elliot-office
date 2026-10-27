"""
Network daemon: watches the connection in the background and syncs the outbox when it can.

  python net_daemon.py        # on its own (jarvis_reporter.py also runs it as a background thread)

- Every 15 s while offline (60 s while online) it checks for internet with quick probes (1 s timeouts,
  run off the main thread), and writes the result to state/network.json and the services table.
- Whenever something in the outbox (sync_outbox.py) can be delivered, it sends it: internet
  destinations only while online; this PC, home-network and Tailscale devices whenever they answer.
- Replies go to state/sync_inbox.json, the activity log and, if the item came from a task, that task.
- Nothing ever blocks or crashes the rest of the system: offline simply means "keep working locally".
"""

import ipaddress
import json
import os
import socket
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import shared_state  # noqa: E402
import sync_outbox as outbox  # noqa: E402

NETWORK_FILE = shared_state.DIR / "network.json"
PROBES = [("1.1.1.1", 443), ("8.8.8.8", 53), ("9.9.9.9", 443)]
FRIDAY_PORT = int(os.getenv("FRIDAY_PORT", 8765))
FRIDAY_DATA = Path(os.getenv("ELLIOT_AI_DATA") or Path(__file__).resolve().parent.parent / "LocalAI" / "app" / "data")
SEND_TIMEOUT = 30
_DIRECT = urllib.request.build_opener(urllib.request.ProxyHandler({}))   # home devices: never via a proxy


def internet_up(timeout=1.0):
    """True if any well-known address answers. All probes run at once, so this takes at most ~timeout."""
    found = threading.Event()

    def probe(host, port):
        try:
            with socket.create_connection((host, port), timeout=timeout):
                found.set()
        except OSError:
            pass

    threads = [threading.Thread(target=probe, args=p, daemon=True) for p in PROBES]
    for t in threads:
        t.start()
    found.wait(timeout + 0.3)
    return found.is_set()


def is_local(host):
    """This PC, the home network, or a Tailscale device: reachable without the internet."""
    host = (host or "").strip("[]").lower()
    if host in ("localhost", "") or host.endswith((".local", ".lan", ".home", ".ts.net")):
        return True
    try:
        ip = ipaddress.ip_address(host)
        return ip.is_private or ip.is_loopback or ip.is_link_local or ip in ipaddress.ip_network("100.64.0.0/10")
    except ValueError:
        return False


def reachable(host, port, timeout=1.0):
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def network_status():
    """What the daemon last saw: {"online", "since", "checked"}; online is None if unknown or stale."""
    try:
        st = json.loads(NETWORK_FILE.read_text("utf-8"))
    except (OSError, ValueError):
        return {"online": None, "since": None, "checked": None}
    if time.time() - st.get("checked", 0) > 180:   # the daemon isn't running: don't guess
        st["online"] = None
    return st


def friday_settings():
    try:
        return json.loads((FRIDAY_DATA / "settings.json").read_text("utf-8"))
    except (OSError, ValueError):
        return {}


def friday_code():
    return friday_settings().get("chrome_token", "")


def offline_only():
    """Friday's "Offline only" switch: then nothing goes to the internet, not even the connection probes."""
    return bool(friday_settings().get("offline_only"))


# ── Sending ──────────────────────────────────────────────────────────────

class Permanent(Exception):
    """Retrying won't help (e.g. the endpoint said 400/401/404)."""


def _request(method, url, headers=None, body=None, timeout=SEND_TIMEOUT):
    data = None
    headers = dict(headers or {})
    if body is not None:
        data = body.encode() if isinstance(body, str) else json.dumps(body).encode()
        headers.setdefault("Content-Type", "application/json" if not isinstance(body, str) else "text/plain; charset=utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method or ("POST" if data else "GET"))
    opener = _DIRECT if is_local(urllib.parse.urlparse(url).hostname) else urllib.request.build_opener()
    try:
        with opener.open(req, timeout=timeout) as r:
            return r.status, r.read(200000).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        text = e.read(4000).decode("utf-8", "replace")
        if 400 <= e.code < 500 and e.code not in (408, 425, 429):
            raise Permanent(f"{e.code}: {text[:300]}") from None
        raise RuntimeError(f"{e.code}: {text[:300]}") from None


def send(item):
    p = item["payload"]
    if item["kind"] == "http":
        status, text = _request(p.get("method"), p["url"], p.get("headers"), p.get("body"))
        return {"status": status, "body": text[:20000]}
    if item["kind"] == "friday_ask":
        body = {"model": p.get("model") or "auto", "stream": False,
                "messages": [{"role": "user", "content": p["prompt"]}]}
        _, text = _request("POST", f"http://127.0.0.1:{FRIDAY_PORT}/v1/chat/completions",
                           {"Authorization": f"Bearer {friday_code()}"}, body, timeout=300)
        reply = json.loads(text)["choices"][0]["message"]["content"]
        return {"model": body["model"], "reply": reply}
    raise Permanent(f"Unknown kind {item['kind']}")


class NetDaemon(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True, name="net-daemon")
        self.online = None
        self.locked = False   # Friday's Offline only switch
        self.since = time.time()
        self.stop_event = threading.Event()
        self._reach = {}

    def can_send(self, item):
        p = item["payload"]
        if self.locked and item["kind"] == "friday_ask":
            return False   # Friday would only refuse it: internet brains are switched off
        if item["kind"] == "friday_ask":
            friday_up = self._reachable("127.0.0.1", FRIDAY_PORT)
            return friday_up and (self.online or not str(p.get("model", "")).startswith("cloud:"))
        u = urllib.parse.urlparse(p.get("url", ""))
        port = u.port or (443 if u.scheme == "https" else 80)
        if is_local(u.hostname):
            return self._reachable(u.hostname, port)
        return bool(self.online) and not self.locked

    def _reachable(self, host, port):
        key = (host, port)
        if key not in self._reach:   # remembered for one pass, so a dead device costs one 1 s check
            self._reach[key] = reachable(host, port)
        return self._reach[key]

    def check(self):
        locked = offline_only()
        if locked != self.locked:
            shared_state.log("Offline only is on: nothing is sent to the internet; your own devices still sync." if locked
                             else "Offline only is off: internet sync allowed again.", source="network")
            self.locked = locked
        online = False if locked else internet_up()
        now = time.time()
        if online != self.online:
            if self.online is not None or not online:
                shared_state.log("Back online: syncing what was saved." if online else
                                 "Offline: everything keeps working locally; sync waits.",
                                 "info" if online else "warning", "network")
            self.since = now
            self.online = online
        try:
            shared_state.DIR.mkdir(parents=True, exist_ok=True)
            tmp = NETWORK_FILE.with_suffix(".tmp")
            tmp.write_text(json.dumps({"online": online, "since": self.since, "checked": now, "offline_only": locked}), "utf-8")
            os.replace(tmp, NETWORK_FILE)
        except OSError:
            pass
        shared_state.put_service("internet", "running" if online else "stopped", None,
                                 "offline only" if locked else "online" if online else "offline")

    def sync(self, limit=20):
        self._reach = {}
        for _ in range(limit):
            item = outbox.take_due(self.can_send)
            if not item:
                return
            label = item["label"] or item["kind"]
            try:
                response = send(item)
            except Permanent as e:
                outbox.finish(item["id"], False, error=e, permanent=True)
                shared_state.log(f"Sync failed for good: {label} ({e})", "error", "sync")
                continue
            except Exception as e:   # offline mid-way, timeout, bad reply: back off and retry later
                left = outbox.finish(item["id"], False, error=e)
                gave_up = left and left["status"] == "failed"
                shared_state.log(f"Sync {'gave up on' if gave_up else 'will retry'}: {label} ({e})",
                                 "error" if gave_up else "warning", "sync")
                continue
            outbox.finish(item["id"], True, response)
            summary = response.get("reply") or f"HTTP {response.get('status')}"
            shared_state.log(f"Synced: {label}: {str(summary)[:300]}", source="sync")
            if item.get("task_id"):
                shared_state.set_result(item["task_id"], "done", str(summary)[:4000], source="sync")

    def run(self):
        last_check, last_queue = 0, None
        while not self.stop_event.is_set():
            try:
                every = 60 if self.online else 15
                try:
                    stamp = outbox.QUEUE.stat().st_mtime
                except OSError:
                    stamp = None
                if time.time() - last_check >= every:
                    self.check()
                    last_check = time.time()
                    self.sync()
                elif stamp != last_queue:   # something new was saved: try it straight away
                    self.sync()
                last_queue = stamp
            except Exception as e:   # never let the daemon die
                try:
                    shared_state.log(f"Network daemon error: {e}", "error", "network")
                except Exception:
                    pass
            self.stop_event.wait(5)

    def stop(self):
        self.stop_event.set()


if __name__ == "__main__":
    d = NetDaemon()
    d.start()
    print(f"Watching the network; outbox {outbox.QUEUE}. Ctrl+C to stop.", flush=True)
    try:
        while d.is_alive():
            d.join(1)
    except KeyboardInterrupt:
        d.stop()
