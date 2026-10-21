// Jarvis Assist — talks to the God Station on this PC for the pages you visit.
const DEFAULT_STATION = "http://localhost:8765";

async function getConf() {
  const { station = DEFAULT_STATION, token = "" } = await chrome.storage.local.get(["station", "token"]);
  return { station, token };
}

async function call(path, { method = "GET", body } = {}) {
  const { station, token } = await getConf();
  if (!token) throw new Error("not-paired");
  const r = await fetch(station + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) { await chrome.storage.local.remove("token"); throw new Error("not-paired"); }
  if (!r.ok) throw new Error(data.detail || `Jarvis error ${r.status}`);
  return data;
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  (async () => {
    try {
      if (msg.type === "status") return reply({ ok: true, ...(await call("/api/assist/status")) });
      if (msg.type === "fill") return reply({ ok: true, ...(await call("/api/assist/fill", { method: "POST", body: msg.form })) });
      if (msg.type === "pair") {
        const station = (msg.station || DEFAULT_STATION).replace(/\/+$/, "");
        const r = await fetch(station + "/api/pair", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: msg.pin, device: "Chrome — Jarvis Assist" }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.detail || "Pairing failed");
        await chrome.storage.local.set({ station, token: data.token });
        return reply({ ok: true });
      }
      if (msg.type === "setAssist") {
        return reply({ ok: true, ...(await call("/api/settings", { method: "PATCH", body: { assist: msg.on } })) });
      }
      reply({ ok: false, error: "unknown message" });
    } catch (e) {
      reply({ ok: false, error: e.message });
    }
  })();
  return true; // async reply
});
