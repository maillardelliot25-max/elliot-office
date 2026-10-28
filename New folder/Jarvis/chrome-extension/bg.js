const J = "http://localhost:8780";
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "ask", title: "Ask Jarvis about “%s”", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "page", title: "Send this page to Jarvis", contexts: ["page", "link", "image"] });
});
async function chat(message) {
  try {
    const r = await fetch(J + "/api/chat", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, device: "chrome" }) });
    const d = await r.json();
    chrome.notifications.create({ type: "basic", iconUrl: "icon.png", title: "Jarvis", message: (d.reply || d.detail || "Done.").slice(0, 300) });
  } catch (e) {
    chrome.notifications.create({ type: "basic", iconUrl: "icon.png", title: "Jarvis", message: "Can't reach Jarvis on this PC." });
  }
}
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "ask") chat(`About this text: "${info.selectionText}" — explain it briefly, sir-style.`);
  else chat(`Save this for me and categorise it: ${info.linkUrl || info.srcUrl || tab.url} (${tab.title})`);
});
