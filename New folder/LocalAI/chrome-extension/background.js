// Clicking the toolbar icon (or Alt+J) opens Jarvis in the side panel.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "jarvis-ask", title: "Ask Jarvis about “%s”", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "jarvis-summary", title: "Summarise this page with Jarvis", contexts: ["page"] });
  chrome.contextMenus.create({ id: "jarvis-image", title: "Ask Jarvis about this image", contexts: ["image"] });
});

// Right-click actions hand their request to the side panel through session storage.
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const pending = info.menuItemId === "jarvis-ask"
    ? { kind: "selection", text: info.selectionText }
    : info.menuItemId === "jarvis-image"
      ? { kind: "image", url: info.srcUrl }
      : { kind: "summary" };
  await chrome.sidePanel.open({ tabId: tab.id });
  await chrome.storage.session.set({ pending: { ...pending, at: Date.now() } });
});

// Messages from the form helper on web pages (content.js)
async function jarvisFetch(path, body) {
  const { server = "http://localhost:8765", token = "" } = await chrome.storage.local.get(["server", "token"]);
  const r = await fetch(server + path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", "X-Jarvis-Token": token },
    body: body && JSON.stringify(body),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j;
}
let personaCache = null;
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    if (msg.type === "jarvis-settings") {
      const { token, proactive = true, muted = [] } = await chrome.storage.local.get(["token", "proactive", "muted"]);
      if (!token) return reply({ paired: false });
      try { personaCache = personaCache || (await jarvisFetch("/api/settings")).persona; } catch { return reply({ paired: false }); }
      reply({ paired: true, proactive, muted, butler: personaCache === "butler" });
    } else if (msg.type === "jarvis-mute") {
      const { muted = [] } = await chrome.storage.local.get("muted");
      await chrome.storage.local.set({ muted: [...new Set([...muted, msg.host])] });
      reply({ ok: true });
    } else if (msg.type === "jarvis-autofill") {
      const { model = "auto" } = await chrome.storage.local.get("model");
      try { reply(await jarvisFetch("/api/autofill", { fields: msg.fields, title: msg.title, url: msg.url, model })); }
      catch (e) { reply({ error: e.message }); }
    }
  })();
  return true;   // answer asynchronously
});
chrome.storage.onChanged.addListener(() => { personaCache = null; });
