import json

from station.passkeys import Passkeys, secure_origin


def test_secure_origin_only_https_tailnet_or_localhost():
    assert secure_origin("https://desktop-qt6q9r2.tail1234.ts.net") == ("https://desktop-qt6q9r2.tail1234.ts.net", "desktop-qt6q9r2.tail1234.ts.net")
    assert secure_origin("http://localhost:8780")[1] == "localhost"
    assert secure_origin("http://100.91.246.65:8780") is None
    assert secure_origin("https://evil.example.com") is None
    assert secure_origin(None) is None


def test_options_and_sessions(tmp_path):
    pk = Passkeys(tmp_path)
    reg = json.loads(pk.register_options("pc.tail1234.ts.net"))
    assert reg["rp"]["id"] == "pc.tail1234.ts.net"
    assert reg["authenticatorSelection"]["userVerification"] == "required"
    login = json.loads(pk.login_options("pc.tail1234.ts.net"))
    assert login["userVerification"] == "required" and login["challenge"]
    s = pk.issue_session("Phone")
    assert pk.check(s["token"]).startswith("fp-")
    assert pk.check("nope") is None


def test_server_endpoints(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    from station.config import StationConfig
    from station.server import create_app
    monkeypatch.setenv("STATION_DATA_DIR", str(tmp_path))
    cfg = StationConfig.from_env()
    cfg.data_dir = tmp_path
    c = TestClient(create_app(cfg))
    assert c.get("/api/passkey/status").json()["available"] is True
    r = c.post("/api/passkey/login/options", headers={"Origin": "http://100.91.246.65:8780"})
    assert r.status_code == 400                      # not a secure page
    r = c.post("/api/passkey/login/options", headers={"Origin": "https://pc.tail1234.ts.net"})
    assert r.status_code == 200 and json.loads(r.text)["rpId"] == "pc.tail1234.ts.net"
    assert c.post("/api/passkey/register/options", headers={"Origin": "https://pc.tail1234.ts.net"}).status_code == 401
