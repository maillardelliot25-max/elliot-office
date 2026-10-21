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

// ── Windows notifications ("Sir, I've got this") ─────────────────────────────
// Notification ids look like "offer:<tabId>:<time>" so a button press finds its tab.
function notify(id, options) {
  return new Promise((resolve) => {
    chrome.notifications.create(id, { type: "basic", iconUrl: "icon-128.png", title: "Jarvis", priority: 2, ...options }, () =>
      resolve(!chrome.runtime.lastError));
  });
}

async function focusTab(tabId) {
  try {
    const tab = await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } catch {}
}

chrome.notifications.onButtonClicked.addListener(async (id, button) => {
  const [kind, tabId] = id.split(":");
  chrome.notifications.clear(id);
  if (kind !== "offer") return;
  const tab = Number(tabId);
  if (button === 0) { await focusTab(tab); chrome.tabs.sendMessage(tab, { type: "doFill" }).catch(() => {}); }
  else chrome.tabs.sendMessage(tab, { type: "mute" }).catch(() => {});
});

// Closing the notification = "Not now"
chrome.notifications.onClosed.addListener((id, byUser) => {
  const [kind, tabId] = id.split(":");
  if (kind === "offer" && byUser) chrome.tabs.sendMessage(Number(tabId), { type: "dismiss" }).catch(() => {});
});

chrome.notifications.onClicked.addListener((id) => {
  const [, tabId] = id.split(":");
  chrome.notifications.clear(id);
  if (tabId) focusTab(Number(tabId));
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    try {
      if (msg.type === "offer") {
        const ok = await notify(`offer:${sender.tab.id}:${Date.now()}`, {
          message: msg.text, contextMessage: msg.site, requireInteraction: true,
          buttons: [{ title: "Fill it" }, { title: "Never on this site" }],
        });
        return reply({ ok });
      }
      if (msg.type === "toast") {
        return reply({ ok: await notify(`info:${sender.tab?.id ?? ""}:${Date.now()}`, { message: msg.text, contextMessage: msg.site || "" }) });
      }
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
