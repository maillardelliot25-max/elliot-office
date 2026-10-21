// Jarvis side panel: talks to the Elliot AI app running on this computer.
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
let cfg = { server: "http://localhost:8765", token: "" };
let chatId = null, busy = false, usePage = true, browse = false, controller = null;
let lastPage = "";   // the page already attached to this chat, so it isn't sent again every message

// ── Connection ────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const r = await fetch(cfg.server + path, {
    ...opts,
    headers: { "Content-Type": "application/json", "X-Jarvis-Token": cfg.token },
    body: opts.body && JSON.stringify(opts.body),
  });
  const j = await r.json();
  if (j && j.error) throw Object.assign(new Error(j.error), { status: r.status });
  return j;
}

async function start() {
  Object.assign(cfg, await chrome.storage.local.get(["server", "token"]));
  ({ chatId = null, usePage = true } = await chrome.storage.local.get(["chatId", "usePage"]));
  try {
    const s = await api("/api/settings");
    $("name").textContent = s.assistant_name || "Jarvis";
    applyLook(s.appearance || {});
    showApp(true);
    await loadModels();
    if (chatId) await openChat(chatId); else welcome(s);
    drawToggles();
    takePending();
  } catch (e) {
    showApp(false);
    $("pMsg").textContent = !cfg.token ? "" : e.status === 401 ? "That pairing code didn't work. Copy it again from Settings."
      : `Can't reach Elliot AI at ${cfg.server}. Is it running?`;
  }
}
function applyLook(a) {   // use the colours chosen in the app's Edit appearance
  const map = { accent: "--accent", bg: "--bg", panel: "--panel", text: "--text", user: "--user" };
  for (const [k, v] of Object.entries(map)) if (a[k]) document.documentElement.style.setProperty(v, a[k]);
  if (a.bg || a.text) {
    document.documentElement.style.setProperty("--line", "color-mix(in srgb, var(--text) 14%, var(--bg))");
    document.documentElement.style.setProperty("--dim", "color-mix(in srgb, var(--text) 58%, var(--bg))");
    document.documentElement.style.setProperty("--code", "color-mix(in srgb, var(--text) 5%, var(--bg))");
  }
}
function showApp(on) { $("app").style.display = on ? "contents" : "none"; $("pair").hidden = on; }
$("pSave").onclick = async () => {
  await chrome.storage.local.set({ token: $("pToken").value.trim(), server: $("pServer").value.trim().replace(/\/$/, "") || cfg.server });
  start();
};

async function loadModels() {
  const { models } = await api("/api/models");
  const order = ["ollama", "anthropic", "openai", "google"], groups = {};
  models.forEach(m => (groups[m.provider] ||= []).push(m));
  $("model").innerHTML = Object.keys(groups).sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99)).map(p =>
    `<optgroup label="${esc(p === "ollama" ? "💻 On this PC" : groups[p][0].provider_label || p)}">` +
    groups[p].map(m => `<option value="${esc(m.name)}" title="${esc(m.summary || "")}">${esc(m.label)}${m.offline ? " 🔒" : ""}</option>`).join("") + "</optgroup>").join("");
  const { model } = await chrome.storage.local.get("model");
  if (model && models.some(m => m.name === model)) $("model").value = model;
}
$("model").onchange = () => chrome.storage.local.set({ model: $("model").value });
$("openApp").onclick = () => chrome.tabs.create({ url: cfg.server });
$("newChat").onclick = async () => { if (busy) return; chatId = null; lastPage = ""; await chrome.storage.local.set({ chatId: null }); welcome(); };

// ── Rendering ─────────────────────────────────────────────────────────
const log = $("log");
function md(text) {
  const parts = text.split(/^```/m);
  return parts.map((part, i) => {
    if (i % 2) return `<pre>${esc(part.replace(/^[^\n]*\n/, ""))}</pre>`;
    return esc(part).split(/\n{2,}/).map(block => {
      const inline = t => t.replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
        .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank">$1</a>');
      const lines = block.split("\n");
      if (lines.every(l => /^\s*([-*]|\d+[.)])\s/.test(l)))
        return `<ul>${lines.map(l => `<li>${inline(l.replace(/^\s*([-*]|\d+[.)])\s/, ""))}</li>`).join("")}</ul>`;
      const h = block.match(/^(#{1,4})\s+(.*)/);
      if (h) return `<h4>${inline(h[2])}</h4>`;
      return block.trim() ? `<p>${inline(lines.join("<br>"))}</p>` : "";
    }).join("");
  }).join("");
}
function scroll() { log.scrollTop = log.scrollHeight; }
function add(cls, html) { const d = document.createElement("div"); d.className = cls; d.innerHTML = html; log.append(d); scroll(); return d; }
function welcome(s) {
  log.innerHTML = `<div class="welcome"><h2>Hi${s?.name ? ", " + esc(s.name) : ""} 👋</h2>Ask about this page, select text and right-click → <i>Ask Jarvis</i>, or turn on 🖱 to let me browse for you.</div>`;
}
function userBubble(text, ctx) {
  const d = add("user", "");
  if (ctx) d.innerHTML = `<span class="ctx">${esc(ctx)}</span>`;
  d.append(text);
}
function memLine(items) { if (items.length) add("line mem", `🧠 <b>Remembered:</b> ${items.map(esc).join(" · ")}`); }
async function openChat(id) {
  try {
    const chat = await api(`/api/chats/${id}`);
    log.innerHTML = "";
    for (const m of chat.messages) {
      if (m.role === "user") userBubble(m.display ?? m.content, (m.files || []).join(", "));
      else if (m.role === "assistant" && m.content) add("ai", md(m.content));
      else if (m.error) add("line err", "⚠ " + esc(m.error));
      else if (m.role === "memory") memLine(m.items || []);
    }
  } catch { chatId = null; welcome(); }
}

// ── The page the user is looking at ───────────────────────────────────
async function targetTab() {
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (active && /^https?:|^file:/.test(active.url || "")) return active;
  const tabs = (await chrome.tabs.query({})).filter(t => /^https?:|^file:/.test(t.url || ""));
  return tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
}
async function inPage(func, ...args) {
  const tab = await targetTab();
  if (!tab) throw new Error("No web page is open.");
  try {
    const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func, args });
    return r.result;
  } catch (e) {
    throw new Error(`Chrome doesn't let extensions use this page (${new URL(tab.url).hostname || tab.url}).`);
  }
}

// These run inside the web page.
function pageRead() {
  const visible = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  document.querySelectorAll("[data-jarvis]").forEach(e => e.removeAttribute("data-jarvis"));
  const els = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), textarea, select, [role=button], [role=link], [role=tab], [contenteditable=true]')].filter(visible).slice(0, 200);
  const list = els.map((el, i) => {
    el.setAttribute("data-jarvis", i + 1);
    const tag = el.tagName.toLowerCase();
    const label = (el.innerText || el.value || el.placeholder || el.getAttribute("aria-label") || el.title || el.name || "").trim().replace(/\s+/g, " ").slice(0, 80);
    return `[${i + 1}] ${tag === "input" ? `input(${el.type})` : tag} "${label}"${tag === "a" ? " → " + el.href.slice(0, 90) : ""}`;
  });
  return { title: document.title, url: location.href, selection: String(getSelection()).slice(0, 5000),
           text: document.body.innerText.replace(/\n{3,}/g, "\n\n").slice(0, 20000), elements: list.join("\n") };
}
function pageAct(action, target, text, enter) {
  const find = t => {
    if (/^\d+$/.test(String(t).trim())) return document.querySelector(`[data-jarvis="${String(t).trim()}"]`);
    const want = String(t).toLowerCase().trim();
    const all = [...document.querySelectorAll('a, button, input, textarea, select, [role=button], [role=link], [role=tab], [contenteditable=true], label')];
    const label = el => (el.innerText || el.value || el.placeholder || el.getAttribute("aria-label") || el.title || el.name || "").toLowerCase().trim();
    let el = all.find(e => label(e) === want) || all.find(e => label(e).includes(want));
    if (el && el.tagName === "LABEL") el = el.control || el.querySelector("input, textarea, select") || el;
    return el;
  };
  if (action === "scroll") { window.scrollBy({ top: (target === "up" ? -1 : 1) * innerHeight * 0.8, behavior: "smooth" }); return `Scrolled ${target || "down"}.`; }
  const el = find(target);
  if (!el) return `Couldn't find "${target}" on the page. Read the page again to get fresh numbers.`;
  el.scrollIntoView({ block: "center" });
  const name = (el.innerText || el.placeholder || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 60);
  if (action === "click") { el.click(); return `Clicked "${name}".`; }
  if (el.type === "password" || /cc-|card/.test(el.autocomplete || "") || /card|cvv|cvc/i.test(el.name || ""))
    return "I don't type passwords or card details. Ask the user to fill that field in themselves.";
  el.focus();
  if (el.isContentEditable) el.innerText = text;
  else {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
    setter ? setter.call(el, text) : (el.value = text);
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  if (enter) {
    const opts = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true };
    const go = el.dispatchEvent(new KeyboardEvent("keydown", opts));
    el.dispatchEvent(new KeyboardEvent("keyup", opts));
    if (go && el.form) el.form.requestSubmit ? el.form.requestSubmit() : el.form.submit();
  }
  return `Typed into "${name}"${enter ? " and pressed Enter" : ""}.`;
}

function waitForLoad(tabId) {
  return new Promise(ok => {
    const done = () => { chrome.tabs.onUpdated.removeListener(listen); clearTimeout(timer); setTimeout(ok, 600); };
    const listen = (id, info) => { if (id === tabId && info.status === "complete") done(); };
    const timer = setTimeout(done, 20000);
    chrome.tabs.onUpdated.addListener(listen);
  });
}

async function runBrowserAction(name, args) {
  try {
    if (name === "browser_read_page") {
      const p = await inPage(pageRead);
      return `Title: ${p.title}\nURL: ${p.url}\n${p.selection ? `Selected text: ${p.selection}\n` : ""}\nPage text:\n${p.text}\n\nThings you can click or type into:\n${p.elements}`;
    }
    if (name === "browser_navigate" || name === "browser_back") {
      const tab = await targetTab();
      const loaded = waitForLoad(tab.id);
      if (name === "browser_back") await chrome.tabs.goBack(tab.id);
      else await chrome.tabs.update(tab.id, { url: /^https?:/.test(args.url) ? args.url : "https://" + args.url });
      await loaded;
      const t = await chrome.tabs.get(tab.id);
      return `Now on: ${t.title} (${t.url})`;
    }
    const tab = await targetTab();
    const before = tab.url;
    const result = await inPage(pageAct, { browser_click: "click", browser_type: "type", browser_scroll: "scroll" }[name],
      name === "browser_scroll" ? args.direction || "down" : args.target, args.text || "", /^y/i.test(args.press_enter || ""));
    await new Promise(r => setTimeout(r, 1200));   // give the page a moment to react
    const after = await chrome.tabs.get(tab.id);
    if (after.status === "loading") await waitForLoad(tab.id);
    const now = await chrome.tabs.get(tab.id);
    return result + (now.url !== before ? ` The page changed to: ${now.title} (${now.url})` : "");
  } catch (e) {
    return "Error: " + e.message;
  }
}

// ── Sending ───────────────────────────────────────────────────────────
async function imageB64(url) {
  const blob = await (await fetch(url)).blob();
  return await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.readAsDataURL(blob); });
}

async function send(text, { image } = {}) {
  if (busy || !text.trim()) return;
  busy = true; $("send").textContent = "■ Stop";
  if (!chatId) log.innerHTML = "";
  const files = [], images = [];
  let ctx = "";
  if (usePage || /this page|selection|selected/i.test(text)) {
    try {
      const p = await inPage(pageRead);
      if (p.url !== lastPage || !chatId) {
        files.push({ name: `Web page: ${p.title}`.slice(0, 120), text: `URL: ${p.url}\n\n${p.text}` });
        lastPage = p.url;
      }
      if (p.selection) text += `\n\nSelected text:\n"""${p.selection}"""`;
      ctx = "📄 " + p.title;
    } catch (e) { ctx = "(couldn't read this page)"; }
  }
  if (image) {
    try { images.push(image.startsWith("data:") ? image.split(",")[1] : await imageB64(image)); ctx = image.startsWith("data:") ? "📸 what I see" : "🖼 image"; }
    catch { add("line err", "Couldn't load that image."); }
  }
  userBubble(text, ctx);
  const status = add("line typing", "Thinking ");
  let seg = null, segText = "";
  controller = new AbortController();
  let model = $("model").value;
  try {
    const r = await fetch(cfg.server + "/api/chat", {
      method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json", "X-Jarvis-Token": cfg.token },
      body: JSON.stringify({ chat_id: chatId, model, message: { content: text, files, images }, tools: true, browser: browse }),
    });
    if (!r.ok) throw new Error((await r.json()).error || r.statusText);
    const reader = r.body.getReader(), dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        const ev = JSON.parse(line);
        if (ev.type === "chat") { chatId = ev.id; chrome.storage.local.set({ chatId }); continue; }
        if (ev.type === "thinking") continue;
        status.remove();
        if (ev.type === "text") {
          if (!seg) { seg = add("ai typing", ""); segText = ""; }
          segText += ev.delta; seg.innerHTML = md(segText); scroll();
        } else {
          if (seg) { seg.classList.remove("typing"); seg = null; }
          if (ev.type === "tool_call") add("line", `🛠 ${esc(ev.name.replace("browser_", "").replace(/_/g, " "))} ${esc(ev.args.target || ev.args.url || ev.args.query || ev.args.fact || ev.args.text || "")}`);
          else if (ev.type === "server_tool") add("line", `🔎 ${esc(ev.input?.query || ev.input?.url || ev.name)}`);
          else if (ev.type === "approval") approval(ev.id);
          else if (ev.type === "browser_action") {
            const output = await runBrowserAction(ev.name, ev.args || {});
            await api("/api/browser_result", { method: "POST", body: { id: ev.id, output } });
          } else if (ev.type === "notice") add("line", esc(ev.text));
          else if (ev.type === "error") add("line err", "⚠ " + esc(ev.message));
        }
      }
    }
  } catch (e) {
    if (e.name !== "AbortError") add("line err", "⚠ " + esc(e.message));
  }
  status.remove();
  if (seg) seg.classList.remove("typing");
  busy = false; $("send").textContent = "Send";
  try {
    const { learned } = await api("/api/memory/learn", { method: "POST", body: { chat_id: chatId, model } });
    memLine(learned.map(m => m.text));
  } catch {}
}
function approval(id) {
  const d = add("approve", `<div>Allow Jarvis to do this?</div><button class="primary">Allow</button> <button>Always allow</button> <button>Deny</button>`);
  const [allow, always, deny] = d.querySelectorAll("button");
  const answer = (ok, all) => { d.innerHTML = ok ? "✔ Allowed" : "✖ Denied"; api("/api/approve", { method: "POST", body: { id, allow: ok, always: all } }); };
  allow.onclick = () => answer(true, false); always.onclick = () => answer(true, true); deny.onclick = () => answer(false, false);
}

// ── Controls ──────────────────────────────────────────────────────────
function drawToggles() { $("pageBtn").classList.toggle("on", usePage); $("browseBtn").classList.toggle("on", browse); }
$("pageBtn").onclick = () => { usePage = !usePage; chrome.storage.local.set({ usePage }); drawToggles(); };
$("browseBtn").onclick = () => { browse = !browse; drawToggles(); };
const input = $("input");
input.oninput = () => { input.style.height = "auto"; input.style.height = input.scrollHeight + "px"; };
input.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("send").click(); } };
$("send").onclick = async () => {
  if (busy) {
    if (chatId) api("/api/stop", { method: "POST", body: { chat_id: chatId } }).catch(() => {});
    controller?.abort();
    return;
  }
  const t = input.value; input.value = ""; input.oninput(); send(t);
};
document.querySelectorAll("#quick button[data-q]").forEach(b => b.onclick = () => send(b.dataset.q));
$("seeBtn").onclick = async () => {   // screenshot of the visible part of the current tab
  try {
    const tab = await targetTab();
    const shot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 80 });
    send(input.value.trim() || "What's on my screen? Explain what I'm looking at.", { image: shot });
    input.value = "";
  } catch (e) { add("line err", "Couldn't capture this tab: " + esc(e.message)); }
};

// Requests from the right-click menu
async function takePending() {
  const { pending } = await chrome.storage.session.get("pending");
  if (!pending || Date.now() - pending.at > 60000) return;
  await chrome.storage.session.remove("pending");
  if (pending.kind === "selection") send(`Explain this, and tell me anything useful about it:\n"""${pending.text}"""`);
  else if (pending.kind === "image") send("What's in this image?", { image: pending.url });
  else send("Summarise this page in a few bullet points.");
}
chrome.storage.session.onChanged.addListener(c => { if (c.pending?.newValue) takePending(); });

start();
