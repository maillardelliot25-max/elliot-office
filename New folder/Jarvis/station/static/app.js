/* Jarvis Station — phone app. Talks to the God Station running on the PC. */
"use strict";

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let token = "";
try { token = localStorage.getItem("station_token") || ""; } catch {}
let activeTab = "screen";
let info = {};

// ── API ────────────────────────────────────────────────────────────────────

async function api(path, { method = "GET", body, form, raw = false } = {}) {
  const headers = { Authorization: `Bearer ${token}` };
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  const r = await fetch(path, { method, headers, body: payload });
  if (r.status === 401) { logout(); throw new Error("This device isn't paired"); }
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).detail || msg; } catch {}
    throw new Error(msg);
  }
  return raw ? r : r.json();
}

function toast(msg, bad = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast show" + (bad ? " bad" : "");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.className = "toast"), 2600);
}

async function act(fn, okMsg) {
  try {
    const res = await fn();
    if (okMsg || res?.message) toast(res?.message || okMsg);
    return res;
  } catch (e) { toast(e.message, true); }
}

// ── Pairing ────────────────────────────────────────────────────────────────

function showPair() { $("#app").classList.add("hidden"); $("#pair").classList.remove("hidden"); }

function logout() {
  token = "";
  try { localStorage.removeItem("station_token"); } catch {}
  showPair();
}

const UA = navigator.userAgent;
$("#deviceName").value = /iPad|Tablet/i.test(UA) || (/Android/i.test(UA) && !/Mobile/i.test(UA)) ? "Tablet"
  : /Android|iPhone/i.test(UA) ? "Phone" : "PC browser";

$("#pairForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#pairError").textContent = "";
  try {
    const r = await fetch("/api/pair", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: $("#pinInput").value.trim(), device: $("#deviceName").value.trim() || "Device" }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || "Pairing failed");
    token = data.token;
    try { localStorage.setItem("station_token", token); } catch {}
    $("#pinInput").value = "";
    start();
  } catch (err) { $("#pairError").textContent = err.message; }
});

// ── Tabs ───────────────────────────────────────────────────────────────────

function go(tab) {
  activeTab = tab;
  $$(".tab").forEach((s) => s.classList.toggle("on", s.dataset.tab === tab));
  $$(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.go === tab));
  if (tab === "screen") screenLoop();
  if (tab === "jarvis") { loadHistory(); setTimeout(() => $("#chatInput").focus(), 50); }
  if (tab === "files" && !files.loaded) openDir("");
  if (tab === "clip") { loadClips(); loadOutbox(); }
  if (tab === "pc") { loadStats(); loadSwitches(); loadProcs(); loadDevices(); loadProfile(); loadSignature(); }
  if (tab === "recall") loadRecall();
}
$$(".tabs button").forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));

// ── Start ──────────────────────────────────────────────────────────────────

async function start() {
  if (!token) return showPair();
  try {
    info = await api("/api/ping");
  } catch (e) {
    if (token) { $("#screenMsg").textContent = "Can't reach your PC: " + e.message; }
    if (!token) return;
  }
  $("#pair").classList.add("hidden");
  $("#app").classList.remove("hidden");
  $("#hostName").textContent = info.host || "God Station";
  $("#connDot").className = "dot " + (info.ok ? "ok" : "bad");
  $("#shellBox").classList.toggle("hidden", !info.allow_shell);
  checkBrain();
  if (new URLSearchParams(location.search).has("share")) { activeTab = "clip"; handleShared(); }
  go(activeTab);
}

async function checkBrain() {
  const pill = $("#brainPill");
  try {
    const b = await api("/api/brain");
    if (b.online && b.installed) { pill.textContent = `brain: ${b.model}`; pill.className = "pill ok"; }
    else if (b.online) { pill.textContent = "model not installed"; pill.className = "pill bad"; }
    else { pill.textContent = "brain offline"; pill.className = "pill bad"; }
  } catch { pill.textContent = "offline"; pill.className = "pill bad"; }
}

// ── Screen ─────────────────────────────────────────────────────────────────

const img = $("#screenImg");
const wrap = $("#screenWrap");
let screenRunning = false;
let hd = false;
let mode = "click";
try { hd = localStorage.getItem("station_hd") === "1"; } catch {}
$("#hdBtn").classList.toggle("on", hd);

async function screenLoop() {
  if (screenRunning) return;
  screenRunning = true;
  let failures = 0;
  while (activeTab === "screen" && !document.hidden && token) {
    try {
      const w = hd ? 1600 : Math.min(1280, Math.round(wrap.clientWidth * (window.devicePixelRatio || 1)) || 1024);
      const r = await api(`/api/screen?w=${Math.max(320, w)}&q=${hd ? 75 : 50}`, { raw: true });
      const url = URL.createObjectURL(await r.blob());
      const old = img.src;
      img.src = url;
      if (old.startsWith("blob:")) setTimeout(() => URL.revokeObjectURL(old), 1000);
      wrap.classList.add("live");
      $("#connDot").className = "dot ok";
      failures = 0;
      await sleep(60);
    } catch (e) {
      failures++;
      wrap.classList.remove("live");
      $("#screenMsg").textContent = "Can't see the screen: " + e.message;
      $("#connDot").className = "dot bad";
      await sleep(Math.min(5000, 800 * failures));
    }
  }
  screenRunning = false;
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && activeTab === "screen") screenLoop(); });

// Where on the PC screen a finger is, as 0..1 — correct even when the image is letterboxed
function pos(touch) {
  const r = img.getBoundingClientRect();
  const nw = img.naturalWidth || r.width, nh = img.naturalHeight || r.height;
  const scale = Math.min(r.width / nw, r.height / nh);
  const w = nw * scale, h = nh * scale;
  return { x: (touch.clientX - r.left - (r.width - w) / 2) / w, y: (touch.clientY - r.top - (r.height - h) / 2) / h };
}
const mouse = (body) => api("/api/mouse", { method: "POST", body }).catch((e) => toast(e.message, true));

$$("#modeSeg button").forEach((b) => b.addEventListener("click", () => {
  mode = b.dataset.mode;
  $$("#modeSeg button").forEach((x) => x.classList.toggle("on", x === b));
  wrap.classList.toggle("view", mode === "view");
}));

// Tap = click · hold = right-click · swipe up/down = scroll   (Tap mode)
// Finger down = press, move = drag, lift = release             (Drag mode)
let touch0 = null, longTimer = null, lastMove = 0, scrollAcc = 0;

wrap.addEventListener("touchstart", (e) => {
  if (mode === "view" || e.touches.length !== 1) return;
  e.preventDefault();
  const t = e.touches[0];
  touch0 = { x: t.clientX, y: t.clientY, lastY: t.clientY, moved: false, long: false, p: pos(t) };
  if (mode === "click") {
    longTimer = setTimeout(() => {
      touch0.long = true;
      navigator.vibrate?.(30);
      mouse({ action: "right", ...touch0.p });
    }, 550);
  } else {
    mouse({ action: "down", ...touch0.p });
  }
}, { passive: false });

wrap.addEventListener("touchmove", (e) => {
  if (!touch0 || mode === "view") return;
  e.preventDefault();
  const t = e.touches[0];
  if (Math.hypot(t.clientX - touch0.x, t.clientY - touch0.y) > 10) { touch0.moved = true; clearTimeout(longTimer); }
  if (mode === "click" && touch0.moved) {
    scrollAcc += t.clientY - touch0.lastY;
    touch0.lastY = t.clientY;
    const notches = Math.trunc(scrollAcc / 30);
    if (notches) { scrollAcc -= notches * 30; mouse({ action: "scroll", dy: notches, ...touch0.p }); }
  } else if (mode === "drag" && Date.now() - lastMove > 40) {
    lastMove = Date.now();
    touch0.p = pos(t);
    mouse({ action: "move", ...touch0.p });
  }
}, { passive: false });

wrap.addEventListener("touchend", (e) => {
  if (!touch0 || mode === "view") return;
  e.preventDefault();
  clearTimeout(longTimer);
  if (mode === "click" && !touch0.moved && !touch0.long) mouse({ action: "click", ...touch0.p });
  if (mode === "drag") mouse({ action: "up", ...touch0.p });
  touch0 = null; scrollAcc = 0;
}, { passive: false });

// Mouse support, for using the app from another PC/tablet with a mouse
wrap.addEventListener("mousedown", (e) => { if (mode !== "view" && e.button === 0) mouse({ action: "click", ...pos(e) }); });
wrap.addEventListener("contextmenu", (e) => { e.preventDefault(); if (mode !== "view") mouse({ action: "right", ...pos(e) }); });
wrap.addEventListener("wheel", (e) => { if (mode !== "view") { e.preventDefault(); mouse({ action: "scroll", dy: e.deltaY > 0 ? -3 : 3, ...pos(e) }); } }, { passive: false });

$$("[data-scroll]").forEach((b) => b.addEventListener("click", () => mouse({ action: "scroll", dy: +b.dataset.scroll })));
$("#hdBtn").addEventListener("click", () => {
  hd = !hd;
  $("#hdBtn").classList.toggle("on", hd);
  try { localStorage.setItem("station_hd", hd ? "1" : "0"); } catch {}
});
$("#fsBtn").addEventListener("click", async () => {
  if (document.fullscreenElement) return document.exitFullscreen();
  try { await wrap.requestFullscreen(); await screen.orientation?.lock?.("landscape"); } catch {}
});

$("#typeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("#typeInput").value;
  if (!text) return;
  await act(() => api("/api/keyboard", { method: "POST", body: { text } }));
  $("#typeInput").value = "";
});
$$("[data-keys]").forEach((b) => b.addEventListener("click", () =>
  act(() => api("/api/keyboard", { method: "POST", body: { keys: b.dataset.keys.split(",") } }))));

// ── Jarvis chat ────────────────────────────────────────────────────────────

const chatLog = $("#chatLog");
let historyLoaded = false;

function fmtTime(ts) {
  const d = new Date(ts);
  return isNaN(d) ? "" : d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function addMsg(role, text, meta = "") {
  const el = document.createElement("div");
  el.className = "msg " + role;
  if (meta) { const m = document.createElement("span"); m.className = "meta"; m.textContent = meta; el.append(m); }
  el.append(document.createTextNode(text));
  chatLog.append(el);
  chatLog.scrollTop = chatLog.scrollHeight;
  return el;
}

function renderActions(el, actions) {
  if (!actions?.length) return;
  const box = document.createElement("div");
  box.className = "acts";
  actions.forEach((a) => box.append(actionChip(a)));
  el.append(box);
}

function actionChip(a) {
  const chip = document.createElement("span");
  chip.className = "act " + a.status;
  const icon = { done: "✓", error: "✕", confirm: "⚠" }[a.status] || "";
  chip.textContent = `${icon} ${a.label}${a.status === "error" ? " — " + a.error : ""}`;
  if (a.status === "done" && a.result?.stdout !== undefined) chip.title = a.result.stdout || a.result.stderr;
  if (a.status === "confirm") {
    const run = document.createElement("button");
    run.textContent = "Run";
    run.onclick = async () => {
      run.disabled = true;
      try {
        const res = await api("/api/actions/run", { method: "POST", body: { action: a.action } });
        chip.replaceWith(actionChip(res));
        if (res.result?.stdout || res.result?.stderr) addMsg("jarvis", (res.result.stdout || res.result.stderr).trim().slice(0, 4000), "output");
      } catch (e) { toast(e.message, true); run.disabled = false; }
    };
    chip.append(run);
  }
  return chip;
}

async function loadHistory() {
  if (historyLoaded) return;
  try {
    const items = await api("/api/memory/recent?limit=40");
    chatLog.innerHTML = "";
    if (!items.length) addMsg("jarvis", `Hey ${info.owner || ""}. I'm running on your PC. Ask me anything, or tell me what to do — "open youtube", "lock my pc", "volume up".`);
    items.forEach((m) => addMsg(m.role === "you" ? "you" : "jarvis", m.text, m.role === "you" && m.device ? `${m.device} · ${fmtTime(m.ts)}` : fmtTime(m.ts)));
    historyLoaded = true;
  } catch (e) { toast(e.message, true); }
}

async function sendChat(text) {
  text = text.trim();
  if (!text) return;
  addMsg("you", text);
  const thinking = addMsg("jarvis thinking", "Thinking…");
  try {
    const res = await api("/api/chat", { method: "POST", body: { message: text, device: $("#deviceName").value || "phone" } });
    thinking.remove();
    const el = addMsg("jarvis", res.reply, res.brain === "instant" ? "instant" : res.brain === "offline" ? "brain offline" : "");
    renderActions(el, res.actions);
    if (res.brain === "offline") checkBrain();
  } catch (e) {
    thinking.remove();
    addMsg("jarvis", "⚠ " + e.message);
  }
}

$("#chatForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("#chatInput").value;
  $("#chatInput").value = "";
  sendChat(v);
});

$("#searchForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("#searchInput").value.trim();
  if (!q) return;
  try {
    const hits = await api(`/api/memory/search?q=${encodeURIComponent(q)}`);
    addMsg("memory", hits.length ? `Found ${hits.length} memories for “${q}”:` : `Nothing in memory about “${q}” yet.`);
    hits.forEach((h) => addMsg("memory", h.text, `${h.role === "you" ? "You" : "Jarvis"} · ${fmtTime(h.ts)}${h.device ? " · " + h.device : ""}`));
  } catch (err) { toast(err.message, true); }
});

// Voice: talk to Jarvis (Chrome on Android; needs HTTPS — see README)
const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!Speech) $("#micBtn").classList.add("hidden");
else {
  const rec = new Speech();
  rec.lang = navigator.language || "en-US";
  rec.interimResults = true;
  let listening = false;
  rec.onresult = (e) => {
    const text = [...e.results].map((r) => r[0].transcript).join("");
    $("#chatInput").value = text;
    if (e.results[e.results.length - 1].isFinal) { rec.stop(); $("#chatInput").value = ""; sendChat(text); }
  };
  rec.onend = () => { listening = false; $("#micBtn").classList.remove("listening"); };
  rec.onerror = (e) => toast("Mic: " + e.error, true);
  $("#micBtn").addEventListener("click", () => {
    if (listening) return rec.stop();
    try { rec.start(); listening = true; $("#micBtn").classList.add("listening"); } catch (e) { toast(e.message, true); }
  });
}

// ── Files ──────────────────────────────────────────────────────────────────

const files = { path: "", parent: null, loaded: false };

function fmtSize(n) {
  if (n == null) return "";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
}

async function openDir(path) {
  try {
    const d = await api(`/api/files?path=${encodeURIComponent(path)}`);
    Object.assign(files, { path: d.path, parent: d.parent, loaded: true });
    $("#pathLabel").textContent = d.path || "This PC";
    $("#upBtn").disabled = d.parent === null;
    const list = $("#fileList");
    list.innerHTML = "";
    if (!d.entries.length) list.innerHTML = '<li class="muted">Empty folder</li>';
    d.entries.forEach((f) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${f.is_dir ? "📁" : "📄"}</span><span class="name"></span><span class="size"></span>`;
      li.querySelector(".name").textContent = f.name;
      li.querySelector(".size").textContent = fmtSize(f.size);
      if (/\.pdf$/i.test(f.name)) {
        [["✍ Sign", "sign"], ["✎ Fill", "fill"]].forEach(([label, what]) => {
          const b = document.createElement("button");
          b.className = "doc-btn"; b.textContent = label;
          b.onclick = async (e) => {
            e.stopPropagation();
            toast(what === "sign" ? "Signing, sir…" : "Filling, sir…");
            const r = await act(() => api(`/api/docs/${what}`, { method: "POST", body: { path: f.path } }));
            if (r) openDir(files.path);
          };
          li.append(b);
        });
      }
      li.onclick = () => (f.is_dir ? openDir(f.path) : download(f));
      list.append(li);
    });
  } catch (e) { toast(e.message, true); }
}

async function download(f) {
  if (f.size > 500 * 1024 * 1024 && !confirm(`${f.name} is ${fmtSize(f.size)}. Download to this device?`)) return;
  toast(`Downloading ${f.name}…`);
  try {
    const r = await api(`/api/files/download?path=${encodeURIComponent(f.path)}`, { raw: true });
    const url = URL.createObjectURL(await r.blob());
    const a = Object.assign(document.createElement("a"), { href: url, download: f.name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch (e) { toast(e.message, true); }
}

$("#upBtn").addEventListener("click", () => files.parent !== null && openDir(files.parent));
$("#uploadInput").addEventListener("change", async (e) => {
  for (const file of e.target.files) {
    const form = new FormData();
    form.append("file", file);
    form.append("folder", files.path);
    toast(`Uploading ${file.name}…`);
    const res = await act(() => api("/api/files/upload", { method: "POST", form }));
    if (res?.path) toast(`Saved to ${res.path}`);
  }
  e.target.value = "";
  if (files.path) openDir(files.path);
});

// ── Clip: shared clipboard between PC, phone and tablet ───────────────────

async function copyToDevice(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  // Fallback that also works over plain http
  const ta = Object.assign(document.createElement("textarea"), { value: text });
  ta.style.cssText = "position:fixed;opacity:0";
  document.body.append(ta);
  ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  return ok;
}

async function sendToPcClipboard(text) {
  if (!text.trim()) return toast("Nothing to send", true);
  const r = await act(() => api("/api/clipboard", { method: "POST", body: { text } }), "On the PC clipboard — Ctrl+V to paste");
  if (r) loadClips();
  return r;
}

async function uploadFiles(list, folder = "") {
  for (const file of list) {
    const form = new FormData();
    form.append("file", file, file.name);
    form.append("folder", folder);
    toast(`Sending ${file.name}…`);
    const res = await act(() => api("/api/files/upload", { method: "POST", form }));
    if (res?.path) toast(`Saved on PC: ${res.path}`);
  }
}

let clipsShown = "";
async function loadClips() {
  try {
    const clips = await api("/api/clips?limit=60");
    const key = clips.map((c) => c.id).join(",");
    if (key === clipsShown) return;  // nothing new
    clipsShown = key;
    const list = $("#clipList");
    list.innerHTML = clips.length ? "" : '<li class="muted">Nothing yet — copy something on the PC.</li>';
    clips.forEach((c) => {
      const li = document.createElement("li");
      li.innerHTML = '<div class="text"></div><div class="meta"><span></span><button>→ PC</button></div>';
      li.querySelector(".text").textContent = c.text;
      li.querySelector(".meta span").textContent = `${c.source} · ${fmtTime(c.ts)}`;
      li.onclick = async () => toast((await copyToDevice(c.text)) ? "Copied to this device" : "Couldn't copy", false);
      li.querySelector("button").onclick = (e) => { e.stopPropagation(); sendToPcClipboard(c.text); };
      list.append(li);
    });
  } catch (e) { toast(e.message, true); }
}
setInterval(() => activeTab === "clip" && !document.hidden && loadClips(), 3000);

async function loadOutbox() {
  try {
    const box = await api("/api/outbox");
    const list = $("#outboxList");
    list.innerHTML = box.files.length ? "" : '<li class="muted">Nothing sent yet.</li>';
    box.files.forEach((f) => {
      const li = document.createElement("li");
      li.innerHTML = '<span>📄</span><span class="name"></span><span class="size"></span><span class="dl">⬇</span>';
      li.querySelector(".name").textContent = f.name;
      li.querySelector(".size").textContent = fmtSize(f.size);
      li.onclick = () => download(f);
      list.append(li);
    });
  } catch (e) { toast(e.message, true); }
}

$("#clipPaste").addEventListener("click", async () => {
  try { $("#clipText").value = await navigator.clipboard.readText(); }
  catch { $("#clipText").focus(); toast("Long-press the box and tap Paste", true); }
});
$("#clipSet").addEventListener("click", async () => { if (await sendToPcClipboard($("#clipText").value)) $("#clipText").value = ""; });
$("#clipFiles").addEventListener("change", async (e) => { await uploadFiles(e.target.files); e.target.value = ""; });
$("#clipClear").addEventListener("click", async () => {
  if (!confirm("Clear the clipboard history?")) return;
  await act(() => api("/api/clips", { method: "DELETE" }), "Cleared");
  clipsShown = ""; loadClips();
});
$("#outboxRefresh").addEventListener("click", loadOutbox);

// Things shared from other apps (Android Share menu → Jarvis). The service worker parks them in a cache.
async function handleShared() {
  history.replaceState(null, "", "/");
  if (!("caches" in window)) return;
  const cache = await caches.open("share-inbox");
  const meta = await cache.match("/share-inbox/meta");
  if (!meta) return;
  const { title, text, url, files: count } = await meta.json();
  const words = [title, text, url].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join("\n");
  if (words) await sendToPcClipboard(words);
  const shared = [];
  for (let i = 0; i < count; i++) {
    const r = await cache.match(`/share-inbox/file/${i}`);
    if (r) shared.push(new File([await r.blob()], decodeURIComponent(r.headers.get("X-Name") || `shared-${i}`), { type: r.headers.get("Content-Type") || "" }));
  }
  if (shared.length) await uploadFiles(shared);
  await caches.delete("share-inbox");
}

// ── PC ─────────────────────────────────────────────────────────────────────

function stat(k, v, pct) {
  return `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div>${pct != null ? `<div class="bar"><i style="width:${Math.min(100, pct)}%"></i></div>` : ""}</div>`;
}

async function loadStats() {
  try {
    const s = await api("/api/system");
    let html = stat("CPU", `${Math.round(s.cpu_percent)}%`, s.cpu_percent) + stat("RAM", `${Math.round(s.ram_percent)}%`, s.ram_percent);
    if (s.battery) html += stat("Battery", `${s.battery.percent}%${s.battery.plugged ? " ⚡" : ""}`, s.battery.percent);
    s.disks.slice(0, 3).forEach((d) => (html += stat(`Disk ${d.mount}`, `${d.free_gb} GB free`, d.percent)));
    html += stat("Up for", `${s.uptime_hours} h`) + stat("Memories", s.memory_messages);
    $("#stats").innerHTML = html;
  } catch (e) { $("#stats").innerHTML = `<p class="error">${e.message}</p>`; }
}
setInterval(() => activeTab === "pc" && !document.hidden && loadStats(), 5000);

$$("[data-power]").forEach((b) => b.addEventListener("click", () => {
  const a = b.dataset.power;
  if (["sleep", "restart", "shutdown"].includes(a) && !confirm(`${b.textContent.trim()} your PC?`)) return;
  act(() => api("/api/power", { method: "POST", body: { action: a } }), "Done");
}));
$$("[data-volume]").forEach((b) => b.addEventListener("click", () => act(() => api("/api/volume", { method: "POST", body: { action: b.dataset.volume } }))));
$$("[data-media]").forEach((b) => b.addEventListener("click", () => act(() => api("/api/media", { method: "POST", body: { key: b.dataset.media } }))));

const openTarget = (target) => act(() => api("/api/open", { method: "POST", body: { target } }));
$("#openForm").addEventListener("submit", (e) => { e.preventDefault(); const v = $("#openInput").value.trim(); if (v) { openTarget(v); $("#openInput").value = ""; } });
$$("[data-open]").forEach((b) => b.addEventListener("click", () => openTarget(b.dataset.open)));


$("#shellForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const command = $("#shellInput").value.trim();
  if (!command) return;
  const out = $("#shellOut");
  out.textContent = `> ${command}\nrunning…`;
  try {
    const r = await api("/api/shell", { method: "POST", body: { command } });
    out.textContent = `> ${command}\n${r.stdout}${r.stderr ? "\n" + r.stderr : ""}\n[exit ${r.code}]`;
  } catch (err) { out.textContent = `> ${command}\n${err.message}`; }
});

async function loadProcs() {
  try {
    const procs = await api("/api/processes");
    const list = $("#procList");
    list.innerHTML = "";
    procs.forEach((p) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="name"></span><span class="size">${p.mem_mb} MB</span><button>Close</button>`;
      li.querySelector(".name").textContent = p.name;
      li.querySelector("button").onclick = async () => {
        if (!confirm(`Close ${p.name}? Unsaved work in it will be lost.`)) return;
        await act(() => api("/api/processes/kill", { method: "POST", body: { pid: p.pid } }));
        loadProcs();
      };
      list.append(li);
    });
  } catch (e) { toast(e.message, true); }
}
$("#procRefresh").addEventListener("click", loadProcs);

async function loadDevices() {
  try {
    const devs = await api("/api/devices");
    const list = $("#deviceList");
    list.innerHTML = "";
    devs.forEach((d) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="name"></span><span class="size"></span><button>Remove</button>`;
      li.querySelector(".name").textContent = d.name + (d.id === info.device_id ? " (this one)" : "");
      li.querySelector(".size").textContent = d.paired_at.slice(0, 10);
      li.querySelector("button").onclick = async () => {
        if (!confirm(`Remove ${d.name}? It will need the PIN again.`)) return;
        await act(() => api(`/api/devices/${d.id}`, { method: "DELETE" }), "Removed");
        if (d.id === info.device_id) logout(); else loadDevices();
      };
      list.append(li);
    });
  } catch (e) { toast(e.message, true); }
}

$("#unpairBtn").addEventListener("click", async () => {
  if (!confirm("Unpair this device?")) return;
  try { await api(`/api/devices/${info.device_id}`, { method: "DELETE" }); } catch {}
  logout();
});

// ── Switches ───────────────────────────────────────────────────────────────

const SWITCHES = [
  ["clipboard", "Clipboard sync", "Copies on the PC reach your phone & tablet"],
  ["recall", "Screen memory", "Jarvis remembers what was on screen (8-hour segments, on this PC only)"],
  ["assist", "Form helper", "Chrome highlights forms and offers to fill them"],
  ["telegram", "Telegram", "Talk to Jarvis from Telegram"],
];
const localGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const localSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

function switchRow(title, desc, on, onChange) {
  const li = document.createElement("li");
  li.innerHTML = `<div class="what"><b></b><small></small></div><label class="toggle"><input type="checkbox"><span></span></label>`;
  li.querySelector("b").textContent = title;
  li.querySelector("small").textContent = desc;
  const input = li.querySelector("input");
  input.checked = on;
  input.onchange = async () => { input.disabled = true; try { await onChange(input.checked); } catch (e) { input.checked = !input.checked; toast(e.message, true); } input.disabled = false; };
  return li;
}

async function loadSwitches() {
  const list = $("#switchList");
  try {
    const s = await api("/api/settings");
    list.innerHTML = "";
    SWITCHES.forEach(([key, title, desc]) => {
      const extra = key === "telegram" ? ` — ${s.telegram_status}` : "";
      list.append(switchRow(title, desc + extra, s[key], async (on) => {
        await api("/api/settings", { method: "PATCH", body: { [key]: on } });
        toast(`${title} ${on ? "on" : "off"}`);
        if (key === "recall") loadRecallStatus();
      }));
    });
    list.append(await notifyRow());
    list.append(switchRow("Auto-copy on this device", "When the app is open, new copies from other devices go straight to this device's clipboard",
      localGet("station_autocopy", "1") === "1", async (on) => localSet("station_autocopy", on ? "1" : "0")));
    loadSync(s);
  } catch (e) { list.innerHTML = `<li class="error">${e.message}</li>`; }
}

async function loadSync(s) {
  const box = $("#syncBox");
  const r = await api("/api/sync/folders").catch((e) => ({ connected: false, error: e.message, folders: [] }));
  box.innerHTML = "";
  if (!r.connected) {
    box.innerHTML = `<div class="card"><p class="hint" style="margin:0 0 8px">Photos, music and files sync on their own with <b>Syncthing</b> (free).
      Install it on the PC and on your phone/tablet, share your Camera, Music and Documents folders, then paste the PC's
      Syncthing API key here (Syncthing → Actions → Settings → API Key). Each folder then gets an on/off switch.</p>
      <p class="error" style="margin:0 0 8px"></p>
      <form class="row" id="stForm"><input id="stKey" placeholder="Syncthing API key" autocomplete="off"><button class="btn primary">Connect</button></form></div>`;
    box.querySelector(".error").textContent = s.syncthing_configured ? r.error : "";
    box.querySelector("#stForm").onsubmit = async (e) => {
      e.preventDefault();
      await act(() => api("/api/settings", { method: "PATCH", body: { syncthing_api_key: $("#stKey").value.trim() } }), "Saved");
      loadSwitches();
    };
    return;
  }
  const ul = document.createElement("ul");
  ul.className = "switches";
  if (!r.folders.length) ul.innerHTML = '<li class="muted">No folders shared in Syncthing yet.</li>';
  r.folders.forEach((f) => ul.append(switchRow(f.label, `${f.path} · with ${f.devices.join(", ") || "no devices"}`, !f.paused,
    async (on) => { await api(`/api/sync/folders/${encodeURIComponent(f.id)}`, { method: "POST", body: { paused: !on } }); toast(`${f.label} sync ${on ? "on" : "paused"}`); })));
  box.append(ul);
}

// Notifications on this device (Web Push — works with the app closed; needs HTTPS)
function b64ToBytes(b64) {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function notifyRow() {
  const supported = window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  let on = false;
  if (supported) {
    try { on = (await api("/api/push/key")).subscribed && Notification.permission === "granted"; } catch {}
  }
  const desc = supported ? "Jarvis tells you here when it finishes a job — even with the app closed"
    : "Needs the secure https:// address (Tailscale step in the README)";
  const row = switchRow("Notifications on this device", desc, on, async (want) => {
    const reg = await navigator.serviceWorker.ready;
    if (!want) {
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      await api("/api/push/subscribe", { method: "DELETE" });
      return toast("Notifications off");
    }
    if ((await Notification.requestPermission()) !== "granted") throw new Error("Notifications are blocked — allow them in Chrome's site settings");
    const { key } = await api("/api/push/key");
    let sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();  // re-subscribe with this PC's key
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
    await api("/api/push/subscribe", { method: "POST", body: { subscription: sub.toJSON() } });
    await api("/api/notify", { method: "POST", body: { title: "Jarvis", body: "Notifications are on, sir. I'll keep you posted." } });
    toast("Notifications on");
  });
  if (!supported) row.querySelector("input").disabled = true;
  return row;
}

// Auto-copy: newest clip from another device goes to this device's clipboard while the app is open
let lastClipSeen = +localGet("station_lastclip", "0");
async function autoCopyCheck() {
  if (!token || document.hidden || localGet("station_autocopy", "1") !== "1") return;
  try {
    const [c] = await api("/api/clips?limit=1");
    if (!c || c.id <= lastClipSeen) return;
    const fresh = lastClipSeen > 0;
    lastClipSeen = c.id; localSet("station_lastclip", String(c.id));
    if (fresh && c.source !== $("#deviceName").value && document.hasFocus()) {
      if (await copyToDevice(c.text)) toast(`📋 Copied from ${c.source}`);
    }
  } catch {}
}
setInterval(autoCopyCheck, 3000);

// ── My details & signature ─────────────────────────────────────────────────

async function loadProfile() {
  try {
    const p = await api("/api/profile");
    const form = $("#profileForm");
    form.innerHTML = "";
    p.fields.forEach(({ key, label }) => {
      const l = document.createElement("label");
      if (["address_line1", "address_line2", "notes", "full_name"].includes(key)) l.className = "wide";
      l.textContent = label;
      const input = document.createElement(key === "notes" ? "textarea" : "input");
      input.name = key; input.value = p.values[key] || "";
      if (key === "notes") input.rows = 3;
      l.append(input);
      form.append(l);
    });
    const save = document.createElement("button");
    save.className = "btn primary"; save.textContent = "Save my details";
    form.append(save);
  } catch (e) { toast(e.message, true); }
}
$("#profileForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target).entries());
  await act(() => api("/api/profile", { method: "PUT", body }), "Saved, sir");
});

const pad = $("#sigPad");
const pctx = pad.getContext("2d");
let drawing = false, inked = false;
function padPoint(e) {
  const r = pad.getBoundingClientRect(), t = e.touches ? e.touches[0] : e;
  return [(t.clientX - r.left) * pad.width / r.width, (t.clientY - r.top) * pad.height / r.height];
}
function padStart(e) { e.preventDefault(); drawing = true; inked = true; const [x, y] = padPoint(e); pctx.beginPath(); pctx.moveTo(x, y); }
function padMove(e) { if (!drawing) return; e.preventDefault(); const [x, y] = padPoint(e); pctx.lineTo(x, y); pctx.stroke(); }
function padEnd() { drawing = false; }
pctx.lineWidth = 4; pctx.lineCap = "round"; pctx.lineJoin = "round"; pctx.strokeStyle = "#0b1a3a";
pad.addEventListener("touchstart", padStart, { passive: false }); pad.addEventListener("touchmove", padMove, { passive: false });
pad.addEventListener("touchend", padEnd); pad.addEventListener("mousedown", padStart);
pad.addEventListener("mousemove", padMove); window.addEventListener("mouseup", padEnd);
$("#sigClear").addEventListener("click", () => { pctx.clearRect(0, 0, pad.width, pad.height); inked = false; });
$("#sigSave").addEventListener("click", async () => {
  if (!inked) return toast("Draw your signature first", true);
  const blob = await new Promise((r) => pad.toBlob(r, "image/png"));
  const form = new FormData();
  form.append("file", blob, "signature.png");
  if (await act(() => api("/api/signature", { method: "POST", form }), "Signature saved, sir")) loadSignature();
});
async function loadSignature() {
  try {
    const r = await api("/api/signature", { raw: true });
    const img = new Image();
    img.onload = () => {
      pctx.clearRect(0, 0, pad.width, pad.height);
      const s = Math.min(pad.width / img.width, pad.height / img.height) * 0.9;
      pctx.drawImage(img, (pad.width - img.width * s) / 2, (pad.height - img.height * s) / 2, img.width * s, img.height * s);
      inked = true;
      $("#sigInfo").textContent = "Saved. In Files, tap ✍ next to a PDF to sign it. Draw again to replace it.";
    };
    img.src = URL.createObjectURL(await r.blob());
  } catch {}
}

// ── Recall ─────────────────────────────────────────────────────────────────

const recall = { segment: "", lastId: null, query: "" };

async function loadRecallStatus() {
  try {
    const s = await api("/api/recall/status");
    $("#recDot").className = "dot " + (s.enabled && !s.status.startsWith("error") ? "ok" : "bad");
    $("#recState").textContent = s.enabled ? `Screen memory: ${s.status}` : "Screen memory is off (PC → Switches)";
    $("#recInfo").textContent = `${fmtSize(s.total_bytes)} used of ${fmtSize(s.max_bytes)} limit · ${s.segments} segment${s.segments === 1 ? "" : "s"} of 8 h · ` +
      `${fmtSize(s.disk_free_bytes)} free on disk${s.ocr ? " · reading text" : ""}${s.last_saved ? ` · last saved ${fmtTime(s.last_saved)}` : ""}`;
    $("#recBar").style.width = `${Math.min(100, (100 * s.total_bytes) / s.max_bytes)}%`;
  } catch (e) { $("#recState").textContent = e.message; }
}

async function loadRecall() {
  loadRecallStatus();
  try {
    const segs = await api("/api/recall/segments");
    const list = $("#segList");
    list.innerHTML = "";
    const all = document.createElement("button");
    all.innerHTML = "Latest<small>all segments</small>";
    all.className = recall.segment ? "" : "on";
    all.onclick = () => { recall.segment = ""; recall.query = ""; loadRecall(); };
    list.append(all);
    segs.forEach((s) => {
      const b = document.createElement("button");
      b.innerHTML = `<span></span><small>${s.frames} shots · ${fmtSize(s.bytes)}</small>`;
      b.querySelector("span").textContent = s.label;
      b.className = recall.segment === s.segment ? "on" : "";
      b.onclick = () => { recall.segment = s.segment; recall.query = ""; loadRecall(); };
      b.oncontextmenu = async (e) => {
        e.preventDefault();
        if (!confirm(`Delete ${s.label} (${fmtSize(s.bytes)})?`)) return;
        await act(() => api(`/api/recall/segments/${s.segment}`, { method: "DELETE" }), "Deleted");
        recall.segment = ""; loadRecall();
      };
      list.append(b);
    });
  } catch (e) { toast(e.message, true); }
  recall.lastId = null;
  $("#frameGrid").innerHTML = "";
  loadFrames();
}

async function loadFrames() {
  const url = recall.query
    ? `/api/recall/search?q=${encodeURIComponent(recall.query)}`
    : `/api/recall/frames?limit=24&segment=${recall.segment}${recall.lastId ? `&before_id=${recall.lastId}` : ""}`;
  try {
    const frames = await api(url);
    const grid = $("#frameGrid");
    if (!frames.length && !grid.children.length) grid.innerHTML = `<p class="hint">${recall.query ? "Nothing on screen matched that, sir." : "Nothing saved yet — screen memory saves a shot whenever your screen changes."}</p>`;
    frames.forEach((f) => {
      const card = document.createElement("div");
      card.className = "frame";
      card.innerHTML = `<img alt="" loading="lazy"><div><b></b> · <span></span></div>${f.snippet ? "<p></p>" : ""}`;
      card.querySelector("b").textContent = fmtTime(f.ts);
      card.querySelector("span").textContent = f.window || "—";
      if (f.snippet) card.querySelector("p").textContent = f.snippet;
      loadThumb(card.querySelector("img"), f.id);
      card.onclick = () => openViewer(f);
      grid.append(card);
    });
    recall.lastId = frames.length ? frames[frames.length - 1].id : recall.lastId;
    $("#moreFrames").classList.toggle("hidden", !!recall.query || frames.length < 24);
  } catch (e) { toast(e.message, true); }
}

const thumbObserver = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
  entries.forEach(async (en) => {
    if (!en.isIntersecting) return;
    thumbObserver.unobserve(en.target);
    try {
      const r = await api(`/api/recall/frame/${en.target.dataset.id}?w=480`, { raw: true });
      en.target.src = URL.createObjectURL(await r.blob());
    } catch {}
  });
}, { rootMargin: "200px" }) : null;
function loadThumb(img, id) { img.dataset.id = id; thumbObserver?.observe(img); }

async function openViewer(f) {
  $("#viewer").classList.remove("hidden");
  $("#viewerCap").textContent = `${fmtTime(f.ts)} · ${f.window || ""}`;
  $("#viewerImg").removeAttribute("src");
  try {
    const r = await api(`/api/recall/frame/${f.id}`, { raw: true });
    $("#viewerImg").src = URL.createObjectURL(await r.blob());
  } catch (e) { $("#viewerCap").textContent = e.message; }
}
$("#viewerClose").addEventListener("click", () => $("#viewer").classList.add("hidden"));
$("#viewer").addEventListener("click", (e) => { if (e.target.id === "viewer") $("#viewer").classList.add("hidden"); });
$("#moreFrames").addEventListener("click", loadFrames);
$("#recSearch").addEventListener("submit", (e) => {
  e.preventDefault();
  recall.query = $("#recQ").value.trim();
  recall.lastId = null;
  $("#frameGrid").innerHTML = "";
  loadFrames();
});

// ── Boot ───────────────────────────────────────────────────────────────────

if ("serviceWorker" in navigator && window.isSecureContext) navigator.serviceWorker.register("sw.js").catch(() => {});
start();
