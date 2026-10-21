"""
God Station tests — run from the Jarvis folder:   python -m pytest station/tests -q
Uses a fake PC, so nothing on your real computer is clicked or shut down.
"""

import io

import pytest
from fastapi.testclient import TestClient

from station.brain import BrainOffline, parse_reply
from station.config import StationConfig
from station.controls import ControlError
from station.intents import quick_intent
from station.memory import StationMemory
from station.server import create_app


class FakeControl:
    def __init__(self, tmp):
        self.calls = []
        self.tmp = tmp

    def _log(self, *args):
        self.calls.append(args)
        return {"ok": True}

    def screenshot(self, w, q):
        return b"\xff\xd8fakejpeg", 1920, 1080

    def mouse(self, *a): return self._log("mouse", *a)
    def type_text(self, t): return self._log("type", t)
    def hotkey(self, keys):
        if keys == ["nope"]:
            raise ControlError("Unknown key(s): ['nope']")
        return self._log("hotkey", *keys)
    def volume(self, a): return self._log("volume", a)
    def media(self, k): return self._log("media", k)
    def power(self, a):
        self._log("power", a)
        return {"ok": True, "message": f"{a} ok"}
    def open(self, t):
        self._log("open", t)
        return {"ok": True, "message": f"Opened {t}"}
    def get_clipboard(self): return "clip"
    def set_clipboard(self, t): return self._log("clip", t)
    def shell(self, c):
        self._log("shell", c)
        return {"code": 0, "stdout": "hi", "stderr": ""}
    def system_info(self): return {"cpu_percent": 5, "disks": []}
    def processes(self): return [{"pid": 1, "name": "x", "mem_mb": 1}]
    def kill(self, pid): return self._log("kill", pid)

    def list_dir(self, path):
        from station.controls import PCControl
        return PCControl.list_dir(self, path or str(self.tmp))

    def resolve_file(self, path):
        from station.controls import PCControl
        return PCControl.resolve_file(self, path)

    def save_upload(self, name, data, folder):
        from station.controls import PCControl
        pc = PCControl(upload_dir=self.tmp / "uploads")
        return pc.save_upload(name, data, folder)


class FakeBrain:
    model = "fake"

    def __init__(self):
        self.offline = False
        self.next = {"reply": "Sure.", "actions": []}
        self.seen = None

    async def status(self):
        return {"online": not self.offline, "model": "fake", "installed": True}

    async def reply(self, message, history, memories, device="phone"):
        if self.offline:
            raise BrainOffline("connection refused")
        self.seen = {"message": message, "history": history, "memories": memories}
        return self.next


@pytest.fixture
def station(tmp_path, capsys):
    cfg = StationConfig(data_dir=tmp_path / "data", upload_dir=tmp_path / "up")
    control, brain = FakeControl(tmp_path), FakeBrain()
    app = create_app(cfg, control=control, brain=brain)
    client = TestClient(app)
    pin = app.state.auth.pin
    token = client.post("/api/pair", json={"pin": pin, "device": "Test phone"}).json()["token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client, app, control, brain, tmp_path


# ── Pairing & auth ──────────────────────────────────────────────────────────

def test_api_needs_pairing(tmp_path):
    client = TestClient(create_app(StationConfig(data_dir=tmp_path), control=FakeControl(tmp_path), brain=FakeBrain()))
    assert client.get("/api/ping").status_code == 401
    assert client.get("/api/ping", headers={"Authorization": "Bearer junk"}).status_code == 401
    assert client.get("/").status_code == 200  # the app page itself is public


def test_pin_is_one_time_and_locks_out(tmp_path):
    app = create_app(StationConfig(data_dir=tmp_path), control=FakeControl(tmp_path), brain=FakeBrain())
    client = TestClient(app)
    pin = app.state.auth.pin
    assert client.post("/api/pair", json={"pin": pin}).status_code == 200
    assert client.post("/api/pair", json={"pin": pin}).status_code == 401  # used up

    new_pin = app.state.auth.pin
    wrong = "000000" if new_pin != "000000" else "111111"
    for _ in range(5):
        assert client.post("/api/pair", json={"pin": wrong}).status_code == 401
    assert app.state.auth.pin != new_pin  # rotated after 5 misses


def test_tokens_survive_restart_and_can_be_revoked(station):
    client, app, *_ , tmp = station
    app2 = create_app(StationConfig(data_dir=tmp / "data"), control=FakeControl(tmp), brain=FakeBrain())
    c2 = TestClient(app2)
    c2.headers.update(client.headers)
    me = c2.get("/api/ping").json()
    assert me["ok"]
    assert c2.delete(f"/api/devices/{me['device_id']}").json()["ok"]
    assert c2.get("/api/ping").status_code == 401


# ── Controls ────────────────────────────────────────────────────────────────

def test_screen_and_controls(station):
    client, _, control, *_ = station
    r = client.get("/api/screen?w=800&q=40")
    assert r.headers["content-type"] == "image/jpeg" and r.headers["x-screen-size"] == "1920x1080"
    client.post("/api/mouse", json={"action": "click", "x": 0.5, "y": 0.5})
    client.post("/api/keyboard", json={"text": "hello"})
    client.post("/api/volume", json={"action": "up"})
    client.post("/api/open", json={"target": "youtube"})
    assert ("type", "hello") in control.calls
    assert ("open", "https://youtube.com") in control.calls
    assert client.post("/api/keyboard", json={"keys": ["nope"]}).status_code == 400


def test_shell_can_be_disabled(tmp_path):
    cfg = StationConfig(data_dir=tmp_path, allow_shell=False)
    app = create_app(cfg, control=FakeControl(tmp_path), brain=FakeBrain())
    client = TestClient(app)
    token = client.post("/api/pair", json={"pin": app.state.auth.pin}).json()["token"]
    client.headers["Authorization"] = f"Bearer {token}"
    assert client.post("/api/shell", json={"command": "dir"}).status_code == 403


def test_files_list_upload_download(station):
    client, *_, tmp = station
    (tmp / "notes.txt").write_text("remember this")
    listing = client.get("/api/files", params={"path": str(tmp)}).json()
    assert "notes.txt" in [e["name"] for e in listing["entries"]]

    r = client.post("/api/files/upload", data={"folder": str(tmp)},
                    files={"file": ("photo.jpg", io.BytesIO(b"img"), "image/jpeg")})
    assert r.json()["path"].endswith("photo.jpg")
    r = client.post("/api/files/upload", data={"folder": str(tmp)},
                    files={"file": ("photo.jpg", io.BytesIO(b"img2"), "image/jpeg")})
    assert r.json()["path"].endswith("photo (1).jpg")  # never overwrites

    d = client.get("/api/files/download", params={"path": str(tmp / "notes.txt")})
    assert d.content == b"remember this"
    assert client.get("/api/files/download", params={"path": str(tmp / "missing")}).status_code == 400


# ── Jarvis chat & memory ────────────────────────────────────────────────────

def test_instant_commands_skip_the_brain(station):
    client, _, control, brain, _ = station
    res = client.post("/api/chat", json={"message": "Jarvis, open youtube"}).json()
    assert res["brain"] == "instant"
    assert res["actions"][0]["status"] == "done"
    assert ("open", "https://youtube.com") in control.calls
    assert brain.seen is None


def test_dangerous_actions_wait_for_confirmation(station):
    client, _, control, *_ = station
    res = client.post("/api/chat", json={"message": "shut down my pc"}).json()
    a = res["actions"][0]
    assert a["status"] == "confirm" and ("power", "shutdown") not in control.calls
    run = client.post("/api/actions/run", json={"action": a["action"]}).json()
    assert run["status"] == "done" and ("power", "shutdown") in control.calls


def test_brain_actions_and_memory(station):
    client, _, control, brain, _ = station
    client.post("/api/chat", json={"message": "my favourite artist is Usher"})
    brain.next = {"reply": "Opening it.", "actions": [
        {"type": "open", "target": "https://youtube.com/results?search_query=usher"},
        {"type": "shell", "command": "Remove-Item C:/stuff"},
    ]}
    res = client.post("/api/chat", json={"message": "play something by my favourite artist"}).json()
    assert res["reply"] == "Opening it."
    assert [a["status"] for a in res["actions"]] == ["done", "confirm"]
    assert not any(c[0] == "shell" for c in control.calls)

    hits = client.get("/api/memory/search", params={"q": "usher"}).json()
    assert any("Usher" in h["text"] for h in hits)
    recent = client.get("/api/memory/recent").json()
    assert recent[-1]["text"] == "Opening it." and recent[0]["device"] == "Test phone"


def test_brain_offline_still_answers(station):
    client, _, _, brain, _ = station
    brain.offline = True
    res = client.post("/api/chat", json={"message": "what's the meaning of life"}).json()
    assert res["brain"] == "offline" and "offline" in res["reply"]


def test_memory_recalls_old_conversations(tmp_path):
    m = StationMemory(tmp_path / "m.db")
    m.add("you", "I'm researching solar panels for the roof")
    for i in range(30):
        m.add("you", f"filler message {i}")
    hits = m.search("what did I say about solar?")
    assert hits and "solar" in hits[0]["text"]
    assert m.search("??") == []


# ── Parsing helpers ─────────────────────────────────────────────────────────

@pytest.mark.parametrize("text,expected", [
    ("open youtube", {"type": "open", "target": "https://youtube.com"}),
    ("Open C:\\Users\\Elliot\\Music", {"type": "open", "target": "C:\\Users\\Elliot\\Music"}),
    ("go to reddit.com", {"type": "open", "target": "https://reddit.com"}),
    ("please lock my pc", {"type": "power", "action": "lock"}),
    ("volume up", {"type": "volume", "action": "up"}),
    ("next song", {"type": "media", "key": "next"}),
    ("Type Hello World", {"type": "type", "text": "Hello World"}),
    ("show desktop", {"type": "hotkey", "keys": ["win", "d"]}),
])
def test_quick_intents(text, expected):
    assert quick_intent(text) == [expected]


def test_questions_go_to_the_brain():
    assert quick_intent("what's the weather like?") is None
    assert quick_intent("summarise what we talked about yesterday") is None


def test_parse_reply_is_forgiving():
    assert parse_reply('{"reply": "hi", "actions": [{"type": "open", "target": "x"}, {"type": "rm"}]}') == \
        {"reply": "hi", "actions": [{"type": "open", "target": "x"}]}
    assert parse_reply("plain text answer") == {"reply": "plain text answer", "actions": []}
