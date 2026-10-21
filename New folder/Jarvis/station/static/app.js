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

$("#deviceName").value = /Android/i.test(navigator.userAgent) ? "Android phone" : /iPad|Tablet/i.test(navigator.userAgent) ? "Tablet" : "PC browser";

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
  if (tab === "pc") { loadStats(); loadProcs(); loadDevices(); }
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

function pos(touch) {
  const r = img.getBoundingClientRect();
  return { x: (touch.clientX - r.left) / r.width, y: (touch.clientY - r.top) / r.height };
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

$("#clipGet").addEventListener("click", async () => {
  const r = await act(() => api("/api/clipboard"));
  if (r) { $("#clipText").value = r.text; try { await navigator.clipboard.writeText(r.text); toast("Copied to this phone too"); } catch {} }
});
$("#clipSet").addEventListener("click", () => act(() => api("/api/clipboard", { method: "POST", body: { text: $("#clipText").value } }), "Sent to PC clipboard"));

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

// ── Boot ───────────────────────────────────────────────────────────────────

if ("serviceWorker" in navigator && window.isSecureContext) navigator.serviceWorker.register("sw.js").catch(() => {});
start();
