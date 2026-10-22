"""
Tests for switches, screen memory, form helper, PDFs, Telegram and the Claude link.
Run from the Jarvis folder:   python -m pytest station/tests -q
"""

import asyncio
import json
from datetime import datetime
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from station import docs
from station.assist import fill_from_profile, match_field
from station.config import StationConfig
from station.recall import RecallStore, Recorder, segment_of
from station.server import create_app
from station.settings import Settings
from station.telegram_bot import TelegramBot
from station.tests.test_station import FakeBrain, FakeControl


def paired(app):
    client = TestClient(app)
    token = client.post("/api/pair", json={"pin": app.state.auth.pin, "device": "Tablet"}).json()["token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client


@pytest.fixture
def station(tmp_path):
    app = create_app(StationConfig(data_dir=tmp_path / "data", upload_dir=tmp_path / "up"),
                     control=FakeControl(tmp_path), brain=FakeBrain())
    return paired(app), app, tmp_path


# ── Switches ────────────────────────────────────────────────────────────────

def test_switches_persist_and_validate(station):
    client, _, tmp = station
    s = client.get("/api/settings").json()
    assert s["recall"] and s["clipboard"] and s["assist"] and "syncthing_api_key" not in s
    out = client.patch("/api/settings", json={"recall": False, "recall_every_s": 1, "syncthing_api_key": "k"}).json()
    assert out["recall"] is False and out["recall_every_s"] == 2 and out["syncthing_configured"]
    assert client.patch("/api/settings", json={"recall": "yes"}).status_code == 400
    assert client.patch("/api/settings", json={"hack": 1}).status_code == 400
    assert Settings(tmp / "data")["recall"] is False  # survives a restart


def test_syncthing_not_connected_explains_itself(station):
    client, *_ = station
    r = client.get("/api/sync/folders").json()
    assert r["connected"] is False and "API key" in r["error"]


# ── Screen memory ───────────────────────────────────────────────────────────

class ScreenControl:
    def __init__(self):
        self.window = "Invoice 42 — chrome"
        self.colour = (200, 30, 30)

    def active_window(self):
        return self.window

    def grab_image(self):
        img = Image.new("RGB", (1920, 1080), self.colour)
        if self.colour != (0, 0, 0):  # black = locked screen
            ImageDraw.Draw(img).rectangle((100, 100, 600, 400), fill=(255, 255, 255))
        return img


def test_segments_are_8_hours():
    assert segment_of(datetime(2026, 10, 21, 7, 59)) == "2026-10-21_00-08"
    assert segment_of(datetime(2026, 10, 21, 8, 0)) == "2026-10-21_08-16"
    assert segment_of(datetime(2026, 10, 21, 23, 30)) == "2026-10-21_16-24"


def test_recorder_saves_only_changes_and_respects_privacy(tmp_path):
    store, control = RecallStore(tmp_path / "recall"), ScreenControl()
    settings = Settings(tmp_path)
    rec = Recorder(store, control, settings, ocr=lambda img: "Total due 1,250 USD")
    assert rec.tick() == "saved"
    assert rec.tick() == "no change"
    control.colour = (20, 120, 220)
    assert rec.tick() == "saved"
    control.window = "Bitwarden — Password vault"
    control.colour = (0, 200, 0)
    assert rec.tick().startswith("private window")
    control.window, control.colour = "Desktop", (0, 0, 0)
    assert rec.tick() == "screen is blank or locked"
    settings.update({"recall": False})
    assert rec.tick() == "off"

    assert len(store.frames()) == 2
    hits = store.search("total due")
    assert hits and "[total]" in hits[0]["snippet"].lower() and hits[0]["window"].startswith("Invoice")
    saved = store.frame_path(hits[0]["id"])
    assert saved.exists() and Image.open(saved).width == 1366  # stored smaller than the screen


def test_old_segments_are_cleaned_up(tmp_path):
    store = RecallStore(tmp_path)
    for day in range(1, 6):
        store.add_frame(datetime(2026, 1, day, 9), b"x" * 1000, "w")
    assert len(store.segments()) == 5
    removed = store.enforce_limits(keep_segments=2, max_bytes=10**9)
    assert removed == ["2026-01-01_08-16", "2026-01-02_08-16", "2026-01-03_08-16"]
    assert not (tmp_path / "2026-01-01_08-16").exists()
    store.enforce_limits(keep_segments=99, max_bytes=1500)
    assert [s["segment"] for s in store.segments()] == ["2026-01-05_08-16"]
    assert store.delete_segment("../../etc") is False


def test_recall_api(station):
    client, app, _ = station
    store = app.state.recall
    img = Image.new("RGB", (64, 36), "white")
    import io
    buf = io.BytesIO()
    img.save(buf, "JPEG")
    fid = store.add_frame(datetime.now(), buf.getvalue(), "Bank — chrome", "balance statement")
    status = client.get("/api/recall/status").json()
    assert status["enabled"] and status["segments"] == 1 and status["max_bytes"] == 10 * 2**30
    assert client.get("/api/recall/search", params={"q": "statement"}).json()[0]["id"] == fid
    assert client.get(f"/api/recall/frame/{fid}", params={"w": 32}).headers["content-type"] == "image/jpeg"
    seg = client.get("/api/recall/segments").json()[0]["segment"]
    assert client.delete(f"/api/recall/segments/{seg}").json()["ok"]
    assert client.get(f"/api/recall/frame/{fid}").status_code == 404


def test_chat_uses_screen_memory(tmp_path):
    brain = FakeBrain()
    app = create_app(StationConfig(data_dir=tmp_path), control=FakeControl(tmp_path), brain=brain)
    app.state.recall.add_frame(datetime.now(), b"j", "Flights — chrome", "Kingston to Miami 14 Nov $320")
    paired(app).post("/api/chat", json={"message": "how much was the Miami flight?"})
    screen = [m for m in brain.seen["memories"] if m["role"] == "screen"]
    assert screen and "Miami" in screen[0]["text"] and "Flights" in screen[0]["text"]


# ── Form helper ─────────────────────────────────────────────────────────────

@pytest.mark.parametrize("field,key", [
    ({"label": "Email address"}, "email"),
    ({"name": "fname"}, "first_name"),
    ({"label": "Surname"}, "last_name"),
    ({"autocomplete": "shipping postal-code"}, "zip"),
    ({"type": "tel", "label": "Contact"}, "phone"),
    ({"label": "Parish"}, "state"),
    ({"label": "Your name"}, "full_name"),
    ({"label": "Username"}, None),
    ({"label": "Card number"}, None),
    ({"label": "CVV"}, None),
])
def test_field_matching(field, key):
    assert match_field(field) == key


def test_profile_fills_and_skips_sensitive():
    profile = {"first_name": "Elliot", "last_name": "Maillard", "full_name": "Elliot Maillard",
               "email": "e@example.com", "phone": ""}
    fields = [{"i": 0, "label": "First name"}, {"i": 1, "label": "Email"}, {"i": 2, "label": "Password", "type": "password"},
              {"i": 3, "label": "Phone"}, {"i": 4, "label": "Why do you want this job?"}]
    filled, unknown = fill_from_profile(fields, profile)
    assert {f["i"]: f["value"] for f in filled} == {0: "Elliot", 1: "e@example.com"}
    assert [f["i"] for f in unknown] == [3, 4]


def test_assist_endpoint(station):
    client, app, _ = station
    client.put("/api/profile", json={"full_name": "Elliot Maillard", "email": "e@example.com", "city": "Kingston"})
    form = {"url": "https://jobs.example.com/apply", "title": "Apply", "fields": [
        {"i": 0, "label": "First name"}, {"i": 1, "label": "Last name"}, {"i": 2, "label": "E-mail"},
        {"i": 3, "label": "Town/City"}, {"i": 4, "label": "Card number"}]}
    r = client.post("/api/assist/fill", json=form).json()
    got = {v["i"]: v["value"] for v in r["values"]}
    assert got == {0: "Elliot", 1: "Maillard", 2: "e@example.com", 3: "Kingston"}
    assert r["message"].startswith("Done, sir")
    assert "Apply" in client.get("/api/memory/recent").json()[-1]["text"]  # remembered
    client.patch("/api/settings", json={"assist": False})
    assert client.post("/api/assist/fill", json=form).status_code == 403


# ── PDFs ────────────────────────────────────────────────────────────────────

def _signature_png() -> bytes:
    import io
    img = Image.new("RGBA", (600, 200), (0, 0, 0, 0))
    ImageDraw.Draw(img).line((40, 150, 200, 60, 380, 140, 560, 50), fill=(10, 20, 60, 255), width=6)
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def test_sign_pdf(tmp_path):
    from pypdf import PdfReader
    from reportlab.pdfgen import canvas
    src = tmp_path / "contract.pdf"
    c = canvas.Canvas(str(src))
    c.drawString(72, 700, "Agreement between Elliot and Example Ltd.")
    c.showPage()
    c.drawString(72, 150, "Signature: ______________________")
    c.save()
    sig = docs.save_signature(_signature_png(), tmp_path / "signature.png")
    assert Image.open(sig).size[0] < 600  # cropped to the ink

    out = docs.sign_pdf(str(src), sig)
    assert "page 2" in out["message"] and Path(out["path"]).name == "contract-signed.pdf"
    signed = PdfReader(out["path"])
    assert len(signed.pages) == 2 and "Agreement" in signed.pages[0].extract_text()
    assert "/XObject" in signed.pages[1]["/Resources"]  # the signature image is on page 2
    assert src.read_bytes() != Path(out["path"]).read_bytes()  # original untouched, copy made
    assert docs.sign_pdf(str(src), sig)["path"].endswith("contract-signed (2).pdf")
    with pytest.raises(docs.DocError):
        docs.sign_pdf(str(tmp_path / "nope.pdf"), sig)


def test_fill_pdf_form(tmp_path):
    from pypdf import PdfReader
    from reportlab.pdfgen import canvas
    src = tmp_path / "form.pdf"
    c = canvas.Canvas(str(src))
    for i, (name, tip) in enumerate([("first_name", "First name"), ("email", "Email"), ("favourite", "Favourite colour")]):
        c.drawString(72, 700 - i * 40, tip)
        c.acroForm.textfield(name=name, tooltip=tip, x=200, y=690 - i * 40, width=200, height=20)
    c.save()
    out = docs.fill_pdf(str(src), {"first_name": "Elliot", "email": "e@example.com"})
    assert out["filled"] == 2 and out["left_for_you"] == ["Favourite colour"]
    fields = PdfReader(out["path"]).get_fields()
    assert fields["first_name"]["/V"] == "Elliot" and fields["email"]["/V"] == "e@example.com"


def test_docs_endpoints(station):
    client, _, tmp = station
    assert client.post("/api/docs/sign", json={"path": str(tmp / "x.pdf")}).status_code == 400
    r = client.post("/api/signature", files={"file": ("s.png", _signature_png(), "image/png")})
    assert r.json()["ok"]
    assert client.get("/api/signature").headers["content-type"] == "image/png"
    blank = Image.new("RGBA", (50, 50), (0, 0, 0, 0))
    import io
    buf = io.BytesIO()
    blank.save(buf, "PNG")
    assert client.post("/api/signature", files={"file": ("s.png", buf.getvalue(), "image/png")}).status_code == 400


# ── Telegram ────────────────────────────────────────────────────────────────

class FakeTelegram:
    """Pretends to be api.telegram.org."""

    def __init__(self, updates):
        self.updates = updates
        self.sent = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        method = request.url.path.rsplit("/", 1)[-1]
        if method == "getUpdates":
            ups, self.updates = self.updates, []
            return httpx.Response(200, json={"ok": True, "result": ups})
        if method == "getFile":
            return httpx.Response(200, json={"ok": True, "result": {"file_path": "photos/p.jpg"}})
        if request.url.path.endswith("photos/p.jpg"):
            return httpx.Response(200, content=b"jpegbytes")
        body = json.loads(request.content) if request.headers.get("content-type", "").startswith("application/json") else {}
        self.sent.append((method, body))
        return httpx.Response(200, json={"ok": True, "result": {}})


def _msg(uid, chat, text=None, **extra):
    return {"update_id": uid, "message": {"message_id": uid, "chat": {"id": chat}, "text": text, **extra}}


def test_telegram_obeys_only_the_owner(tmp_path):
    tg = FakeTelegram([_msg(1, 999, "shut down my pc"), _msg(2, 42, "volume up"), _msg(3, 42, "shut down my pc")])
    app = create_app(StationConfig(data_dir=tmp_path, upload_dir=tmp_path / "up", telegram_token="T",
                                   telegram_chat_id="42"), control=FakeControl(tmp_path), brain=FakeBrain(),
                     telegram_transport=httpx.MockTransport(tg))
    bot = app.state.telegram
    control = bot.control
    asyncio.run(bot.poll_once(wait=0))

    texts = [b.get("text", "") for m, b in tg.sent if m == "sendMessage"]
    assert len(texts) == 2  # the stranger (999) got nothing
    assert ("volume", "up") in control.calls
    assert not any(c == ("power", "shutdown") for c in control.calls)  # waits for the Run button
    button = [b for m, b in tg.sent if m == "sendMessage" and "reply_markup" in b][0]
    data = button["reply_markup"]["inline_keyboard"][0][0]["callback_data"]

    tg.updates = [{"update_id": 4, "callback_query": {"id": "q", "from": {"id": 42}, "data": data,
                                                       "message": {"chat": {"id": 42}}}}]
    asyncio.run(bot.poll_once(wait=0))
    assert ("power", "shutdown") in control.calls
    # Telegram messages land in the shared memory
    assert any(m["device"] == "Telegram" for m in app.state.memory.recent(20))


def test_telegram_commands_and_photos(tmp_path):
    tg = FakeTelegram([_msg(1, 42, "/clip"), _msg(2, 42, "/screen"),
                       _msg(3, 42, None, photo=[{"file_id": "a"}, {"file_id": "big"}])])
    app = create_app(StationConfig(data_dir=tmp_path, upload_dir=tmp_path / "up", telegram_token="T",
                                   telegram_chat_id="42"), control=FakeControl(tmp_path), brain=FakeBrain(),
                     telegram_transport=httpx.MockTransport(tg))
    asyncio.run(app.state.telegram.poll_once(wait=0))
    methods = [m for m, _ in tg.sent]
    assert "sendPhoto" in methods
    assert [b["text"] for m, b in tg.sent if m == "sendMessage"][0] == "clip"
    saved = list((tmp_path / "up").glob("telegram_photo_*.jpg"))
    assert saved and saved[0].read_bytes() == b"jpegbytes"


def test_telegram_switch_and_status(tmp_path):
    app = create_app(StationConfig(data_dir=tmp_path), control=FakeControl(tmp_path), brain=FakeBrain())
    assert app.state.telegram is None
    assert "not set up" in paired(app).get("/api/settings").json()["telegram_status"]


# ── Claude link (MCP) ───────────────────────────────────────────────────────

def test_claude_token_is_created_and_works(station):
    client, app, tmp = station
    token = (tmp / "data" / "claude.token").read_text()
    c = TestClient(app)
    c.headers["Authorization"] = f"Bearer {token}"
    assert c.get("/api/ping").json()["ok"]
    assert c.post("/api/memory/note", json={"text": "Elliot prefers aisle seats"}).json()["id"]
    assert "aisle" in c.get("/api/memory/search", params={"q": "aisle seats"}).json()[0]["text"]


def test_mcp_tools_talk_to_the_station(station, monkeypatch):
    client, app, tmp = station
    from station import mcp_server
    monkeypatch.setattr(mcp_server, "TOKEN_FILE", tmp / "data" / "claude.token")
    token = (tmp / "data" / "claude.token").read_text()

    # Route the MCP server's HTTP calls into the test app
    def fake_client():
        tc = TestClient(app)
        tc.headers["Authorization"] = f"Bearer {token}"
        return tc
    monkeypatch.setattr(mcp_server, "_client", fake_client)

    assert "Saved" in mcp_server.remember("Elliot's tablet is a Samsung Tab A9")
    assert "Samsung" in mcp_server.search_memory("tablet samsung")
    client.put("/api/profile", json={"email": "e@example.com"})
    assert "email: e@example.com" in mcp_server.my_details()
    assert mcp_server.get_clipboard() == "clip"
    img = mcp_server.look_at_screen()
    assert img.data.startswith(b"\xff\xd8")
    tools = asyncio.run(mcp_server.mcp.list_tools())
    assert {"search_memory", "look_at_screen", "search_screen_history", "sign_pdf"} <= {t.name for t in tools}


# ── Notifications ───────────────────────────────────────────────────────────

SUB = {"endpoint": "https://fcm.googleapis.com/fcm/send/abc", "keys": {"p256dh": "x", "auth": "y"}}


def notifying_app(tmp_path, pushes, fail_with=None):
    def sender(sub, payload, key_file):
        if fail_with:
            err = Exception("gone")
            err.response = type("R", (), {"status_code": fail_with})()
            raise err
        assert Path(key_file).exists()
        pushes.append((sub["endpoint"], json.loads(payload)))
    app = create_app(StationConfig(data_dir=tmp_path), control=FakeControl(tmp_path), brain=FakeBrain(),
                     push_sender=sender)
    return paired(app), app


def test_phone_subscribes_and_gets_notified(tmp_path):
    pushes = []
    client, app = notifying_app(tmp_path, pushes)
    key = client.get("/api/push/key").json()
    assert len(key["key"]) == 87 and key["subscribed"] is False  # 65-byte P-256 key, base64url
    assert client.post("/api/push/subscribe", json={"subscription": {"nope": 1}}).status_code == 400
    assert client.post("/api/push/subscribe", json={"subscription": SUB}).json()["ok"]
    assert client.get("/api/push/key").json()["subscribed"]
    assert client.post("/api/notify", json={"body": "Hello, sir"}).json()["sent"] == 1
    assert pushes[-1] == (SUB["endpoint"], {"title": "Jarvis", "body": "Hello, sir", "url": "/", "tag": "jarvis"})

    # Jobs Jarvis does are announced
    client.put("/api/profile", json={"email": "e@example.com"})
    client.post("/api/assist/fill", json={"title": "Sign up", "fields": [{"i": 0, "label": "Email"}]})
    assert "filled 1 field" in pushes[-1][1]["body"] and "Sign up" in pushes[-1][1]["body"]

    # Muted with the switch
    client.patch("/api/settings", json={"notify": False})
    assert client.post("/api/notify", json={"body": "quiet"}).json() == {"sent": 0, "muted": True}

    # Same keys after a restart, so phones stay subscribed
    app2 = create_app(StationConfig(data_dir=tmp_path), control=FakeControl(tmp_path), brain=FakeBrain())
    assert app2.state.notifier.public_key() == key["key"]


def test_dead_subscriptions_are_removed(tmp_path):
    client, app = notifying_app(tmp_path, [], fail_with=410)
    client.post("/api/push/subscribe", json={"subscription": SUB})
    assert client.post("/api/notify", json={"body": "hi"}).json()["sent"] == 0
    assert app.state.notifier.subs == {}


def test_notifications_also_go_to_telegram(tmp_path):
    tg = FakeTelegram([])
    app = create_app(StationConfig(data_dir=tmp_path, telegram_token="T", telegram_chat_id="42"),
                     control=FakeControl(tmp_path), brain=FakeBrain(), telegram_transport=httpx.MockTransport(tg),
                     push_sender=lambda *a: None)
    assert paired(app).post("/api/notify", json={"body": "Form filled, sir"}).json()["sent"] == 1
    assert tg.sent[-1][1]["text"] == "🔔 Jarvis\nForm filled, sir"


# ── Setup checklist ─────────────────────────────────────────────────────────

def test_setup_checklist_tracks_progress(station):
    client, app, _ = station
    s = client.get("/api/setup").json()
    items = {i["key"]: i for i in s["items"]}
    assert items["devices"]["ok"]                     # the test client is a paired tablet
    assert not items["details"]["ok"] and "My details" in items["details"]["fix"]
    assert not items["signature"]["ok"] and not items["telegram"]["ok"] and not items["notify"]["ok"]
    before = s["ready"]

    client.put("/api/profile", json={"full_name": "Elliot Maillard", "email": "e@example.com"})
    client.post("/api/signature", files={"file": ("s.png", _signature_png(), "image/png")})
    client.post("/api/push/subscribe", json={"subscription": SUB})
    after = client.get("/api/setup").json()
    assert after["ready"] == before + 3 and after["total"] == s["total"]


# ── Friday link (two brains side by side) ───────────────────────────────────

class FakeFriday:
    """Behaves like Friday's API: pairing code on every call, memory, OpenAI-style gateway."""

    def __init__(self, code="PAIR-123"):
        self.code = code
        self.memories = [{"id": "1", "text": "Elliot's favourite artist is Usher", "category": "Likes", "added": 0}]
        self.chats = []
        self.reply = '{"reply": "Friday-brain answer, sir.", "actions": []}'

    def __call__(self, request: httpx.Request) -> httpx.Response:
        if request.headers.get("X-Jarvis-Token") != self.code:
            return httpx.Response(401, json={"error": "Friday isn't paired"})
        path = request.url.path
        if path == "/v1/models":
            return httpx.Response(200, json={"object": "list", "data": [{"id": "llama3.2:3b"}, {"id": "claude-opus-5-5"}]})
        if path == "/api/memory" and request.method == "GET":
            return httpx.Response(200, json={"memories": self.memories, "categories": []})
        if path == "/api/memory":
            body = json.loads(request.content)
            self.memories.append({"id": str(len(self.memories) + 1), "text": body["text"], "category": body["category"], "added": 0})
            return httpx.Response(200, json={"entry": self.memories[-1]})
        if path == "/v1/chat/completions":
            body = json.loads(request.content)
            self.chats.append(body)
            content = "Friday here: on it." if body["messages"][0]["role"] == "user" else self.reply
            return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": content}}]})
        return httpx.Response(404, json={"error": "not found"})


def friday_app(tmp_path, friday, brain=None):
    app = create_app(StationConfig(data_dir=tmp_path), control=FakeControl(tmp_path), brain=brain or FakeBrain(),
                     friday_transport=httpx.MockTransport(friday))
    return paired(app), app


def test_jarvis_is_on_8780_so_friday_keeps_8765():
    assert StationConfig().port == 8780 and StationConfig.from_env().port == 8780


def test_friday_link_status_and_secret_code(tmp_path):
    friday = FakeFriday()
    client, app = friday_app(tmp_path, friday)
    assert client.get("/api/friday").json()["linked"] is False
    client.patch("/api/settings", json={"friday_code": "wrong"})
    assert "rejected" in client.get("/api/friday").json()["detail"]
    s = client.patch("/api/settings", json={"friday_code": "PAIR-123"}).json()
    assert s["friday_linked"] and "friday_code" not in s  # the code never goes back to devices
    st = client.get("/api/friday").json()
    assert st["online"] and st["models"] == ["llama3.2:3b", "claude-opus-5-5"]
    assert (tmp_path / "friday.token").exists()  # Friday's key to call Jarvis


def test_shared_memory_both_ways(tmp_path):
    friday, brain = FakeFriday(), FakeBrain()
    client, app = friday_app(tmp_path, friday, brain)
    client.patch("/api/settings", json={"friday_code": "PAIR-123"})
    client.post("/api/chat", json={"message": "play something by my favourite artist"})
    assert any(m["role"] == "friday" and "Usher" in m["text"] for m in brain.seen["memories"])

    r = client.post("/api/memory/note", json={"text": "Elliot's tablet is a Samsung Tab A9"}).json()
    assert r["shared_with_friday"] and friday.memories[-1]["text"] == "Elliot's tablet is a Samsung Tab A9"

    client.patch("/api/settings", json={"friday_share_memory": False})
    before = len(friday.memories)
    client.post("/api/memory/note", json={"text": "private note"})
    assert len(friday.memories) == before


def test_friday_notes_are_not_echoed_back(tmp_path):
    friday = FakeFriday()
    client, app = friday_app(tmp_path, friday)
    client.patch("/api/settings", json={"friday_code": "PAIR-123"})
    c = TestClient(app)
    c.headers["Authorization"] = f"Bearer {(tmp_path / 'friday.token').read_text()}"
    before = len(friday.memories)
    assert c.post("/api/memory/note", json={"text": "From Friday: Elliot is flying Tuesday"}).json()["shared_with_friday"] is False
    assert len(friday.memories) == before


def test_think_with_fridays_brain_and_fall_back(tmp_path):
    friday, brain = FakeFriday(), FakeBrain()
    client, app = friday_app(tmp_path, friday, brain)
    client.patch("/api/settings", json={"friday_code": "PAIR-123", "friday_brain": True, "friday_model": "claude-opus-5-5"})
    r = client.post("/api/chat", json={"message": "what's on my plate today?"}).json()
    assert r["reply"] == "Friday-brain answer, sir." and r["brain"] == "Friday (claude-opus-5-5)"
    assert friday.chats[-1]["model"] == "claude-opus-5-5" and friday.chats[-1]["messages"][0]["role"] == "system"
    assert brain.seen is None  # the local brain wasn't needed

    friday.reply = "```json\n{\"reply\": \"wrapped\", \"actions\": []}\n```"
    assert client.post("/api/chat", json={"message": "again"}).json()["reply"] == "wrapped"

    client.patch("/api/settings", json={"friday_code": "stale"})  # Friday unreachable → Ollama
    r = client.post("/api/chat", json={"message": "and now?"}).json()
    assert r["reply"] == "Sure." and brain.seen is not None


def test_ask_friday_from_jarvis_chat(tmp_path):
    friday = FakeFriday()
    client, app = friday_app(tmp_path, friday)
    assert "couldn't reach Friday" in client.post("/api/chat", json={"message": "ask Friday what's trending"}).json()["reply"]
    client.patch("/api/settings", json={"friday_code": "PAIR-123"})
    r = client.post("/api/chat", json={"message": "Ask Friday, what's trending on my phone?"}).json()
    assert r["reply"] == "Friday says: Friday here: on it." and r["brain"] == "friday"
    assert friday.chats[-1]["messages"] == [{"role": "user", "content": "what's trending on my phone?"}]


def test_setup_checklist_shows_friday(tmp_path):
    client, app = friday_app(tmp_path, FakeFriday())
    item = {i["key"]: i for i in client.get("/api/setup").json()["items"]}["friday"]
    assert not item["ok"] and "pairing code" in item["fix"]
    client.patch("/api/settings", json={"friday_code": "PAIR-123"})
    assert {i["key"]: i for i in client.get("/api/setup").json()["items"]}["friday"]["ok"]


def test_contract_friday_relies_on(tmp_path):
    """Friday (LocalAI/app/jarvis_link.py) calls these with friday.token. Keep their shapes stable."""
    import io as _io
    app = create_app(StationConfig(data_dir=tmp_path), control=FakeControl(tmp_path), brain=FakeBrain())
    c = TestClient(app)
    c.headers["Authorization"] = f"Bearer {(tmp_path / 'friday.token').read_text()}"
    buf = _io.BytesIO()
    Image.new("RGB", (64, 36), "white").save(buf, "JPEG")
    fid = app.state.recall.add_frame(datetime(2026, 10, 22, 9, 30), buf.getvalue(), "Invoice — chrome", "Total due 1,250")
    app.state.memory.add("you", "the invoice is due Friday", "Phone")

    assert c.get("/api/system").status_code == 200
    hit = c.get("/api/recall/search", params={"q": "total due", "limit": 5}).json()[0]
    assert {"id", "ts", "window", "snippet"} <= set(hit) and hit["ts"] == "2026-10-22T09:30:00"
    frames = c.get("/api/recall/frames", params={"segment": "2026-10-22_08-16", "limit": 200}).json()
    assert frames[0]["id"] == fid and {"id", "ts", "window"} <= set(frames[0])
    assert c.get("/api/recall/frames", params={"segment": "2026-10-22_08-16", "before_id": fid}).json() == []
    assert c.get(f"/api/recall/frame/{fid}", params={"w": 1280}).headers["content-type"] == "image/jpeg"
    mem = c.get("/api/memory/search", params={"q": "invoice", "limit": 5}).json()[0]
    assert {"ts", "device", "role", "text"} <= set(mem)
    listing = c.get("/api/files", params={"path": str(tmp_path)}).json()
    assert {"path", "entries"} <= set(listing)
    assert {"name", "path", "is_dir", "size", "modified"} <= set(listing["entries"][0])


def test_friday_memory_right_after_boot(monkeypatch):
    """A freshly started PC has a small uptime clock; the empty cache must not count as fresh."""
    import station.friday as fr
    monkeypatch.setattr(fr.time, "monotonic", lambda: 5.0)
    settings = {"friday": True, "friday_code": "PAIR-123", "friday_url": "http://localhost:8765", "friday_share_memory": True}
    link = fr.FridayLink(settings, transport=httpx.MockTransport(FakeFriday()))
    assert "Usher" in asyncio.run(link.relevant_memories("my favourite artist"))[0]["text"]


# ── "Hey Jarvis" voice ──────────────────────────────────────────────────────

from station.voice import speakable, split_wake


@pytest.mark.parametrize("heard,command", [
    ("hey jarvis open youtube", "open youtube"),
    ("ok jarvis, what's the time", "what's the time"),
    ("jarvis", ""),
    ("so jarvis lock my pc", "lock my pc"),
    ("turn the music up", None),
])
def test_wake_word(heard, command):
    assert split_wake(heard) == command


def test_speakable_reads_naturally():
    assert speakable("✅ **Done**, sir — see https://example.com/x") == "Done, sir see a link"
    assert speakable("word " * 200).endswith("The rest is in the app, sir.")


def test_hey_jarvis_end_to_end(tmp_path):
    import threading
    import time as _t
    heard = ["what a nice day",              # not for Jarvis: ignored
             "hey jarvis volume up",         # instant command
             "jarvis", "next song",          # name first, then the request
             "hey jarvis shut down my pc",   # risky → asks
             "yes",
             "hey jarvis restart my pc",
             "no"]
    spoken, done = [], threading.Event()

    def listen(model_dir, is_paused, should_stop):
        for sentence in heard:
            assert not is_paused()
            yield sentence
        done.set()
        while not should_stop():
            _t.sleep(0.05)

    def speak(text):
        spoken.append(text)

    control = FakeControl(tmp_path)
    app = create_app(StationConfig(data_dir=tmp_path), control=control, brain=FakeBrain(),
                     voice_parts={"listen": listen, "speak": speak, "model": lambda folder: folder})
    with TestClient(app) as client:
        token = client.post("/api/pair", json={"pin": app.state.auth.pin}).json()["token"]
        client.headers["Authorization"] = f"Bearer {token}"
        assert client.get("/api/voice").json()["state"] == "off"  # off until switched on
        client.patch("/api/settings", json={"voice": True})
        assert done.wait(10)
        _t.sleep(0.5)
        status = client.get("/api/voice").json()
    assert spoken[0].startswith("Volume up")
    assert spoken[1] == "Yes, sir?"
    assert spoken[2].lower().startswith("next track")
    assert spoken[3] == "Shutdown PC. Shall I go ahead? Say yes or no."
    assert spoken[4] == "shutdown ok" and ("power", "shutdown") in control.calls
    assert spoken[5].endswith("Say yes or no.") and spoken[6] == "Cancelled, sir."
    assert ("power", "restart") not in control.calls
    assert status["last_heard"] == "restart my pc"
    assert any(m["device"] == "Voice (PC)" for m in app.state.memory.recent(30))  # remembered like a chat


def test_voice_say_endpoint(tmp_path):
    spoken = []
    app = create_app(StationConfig(data_dir=tmp_path), control=FakeControl(tmp_path), brain=FakeBrain(),
                     voice_parts={"speak": spoken.append})
    assert paired(app).post("/api/voice/say", json={"text": "Good morning, sir."}).json()["ok"]
    assert spoken == ["Good morning, sir."]


# ── Where your time went ────────────────────────────────────────────────────

def test_activity_insights(tmp_path, monkeypatch):
    from datetime import date, timedelta as td
    from station.recall import app_of
    assert app_of("Inbox - Gmail — chrome") == "chrome" and app_of("Untitled") == "Untitled"

    store = RecallStore(tmp_path / "recall")
    t0 = datetime(2026, 10, 22, 9, 0, 0)
    shots = [(0, "Apply — chrome"), (120, "Apply — chrome"), (240, "budget.xlsx — EXCEL"),
             (360, "budget.xlsx — EXCEL"), (5000, "YouTube — chrome")]  # 5000 s: a long idle gap
    for secs, window in shots:
        store.add_frame(t0 + td(seconds=secs), b"j", window)
    store.add_frame(datetime(2026, 10, 21, 20, 0), b"j", "Netflix — chrome")

    a = store.activity(date(2026, 10, 22))
    apps = {x["app"]: x["minutes"] for x in a["apps"]}
    assert apps == {"chrome": 4.5, "EXCEL": 7.0}  # 2+2 min + last 30 s; 2 min + idle gap capped at 5 min
    assert a["total_minutes"] == 11.5 and a["first"].endswith("09:00:00")
    assert a["hours"][9] == 11.0 and a["hours"][10] == 0.5 and sum(a["hours"]) == 11.5
    assert a["windows"][0] == {"title": "budget.xlsx", "app": "EXCEL", "minutes": 7.0}

    week = store.week(date(2026, 10, 22))
    assert [w["day"] for w in week][-2:] == ["2026-10-21", "2026-10-22"]
    assert week[-2]["total_minutes"] == 0.5 and week[-1]["total_minutes"] == 11.5
    assert store.activity(date(2026, 10, 1))["total_minutes"] == 0


def test_insights_api_and_claude_tool(station, monkeypatch):
    client, app, tmp = station
    app.state.recall.add_frame(datetime(2026, 10, 22, 14, 5), b"j", "Report — WINWORD")
    app.state.recall.add_frame(datetime(2026, 10, 22, 14, 7), b"j", "Report — WINWORD")
    r = client.get("/api/insights", params={"day": "2026-10-22"}).json()
    assert r["apps"][0]["app"] == "WINWORD" and len(r["hours"]) == 24 and len(r["week"]) == 7
    assert client.get("/api/insights", params={"day": "yesterday"}).status_code == 400

    from station import mcp_server
    token = (tmp / "data" / "claude.token").read_text()

    def fake_client():
        tc = TestClient(app)
        tc.headers["Authorization"] = f"Bearer {token}"
        return tc
    monkeypatch.setattr(mcp_server, "_client", fake_client)
    text = mcp_server.my_activity("2026-10-22")
    assert "WINWORD 2 min" in text and "Busiest hour: 14:00" in text
    assert "No screen activity" in mcp_server.my_activity("2026-01-01")
