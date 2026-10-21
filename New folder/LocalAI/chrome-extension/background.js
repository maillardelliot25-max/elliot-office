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
