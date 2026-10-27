/* Jarvis Station — phone app. Talks to the God Station running on the PC. */
"use strict";

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let token = "";
try { token = localStorage.getItem("station_token") || sessionStorage.getItem("station_session") || ""; } catch {}
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

const fpLock = () => { try { return localStorage.getItem("station_lock") === "passkey"; } catch { return false; } };
const fpSupported = () => window.isSecureContext && !!window.PublicKeyCredential;

function showPair() {
  $("#app").classList.add("hidden"); $("#pair").classList.remove("hidden");
  // Fingerprint is set up on the PC: never ask for a PIN. On a plain http address, jump to the secure one.
  fetch("/api/passkey/status").then((r) => r.json()).then((st) => {
    if (!st.registered) return;
    if (!fpSupported() && st.secure_url) { location.href = st.secure_url; return; }
    if (fpSupported() && !fpLock()) { try { localStorage.setItem("station_lock", "passkey"); } catch {} showPair(); }
  }).catch(() => {});
  const fp = fpLock() && fpSupported();
  $("#fpUnlock").classList.toggle("hidden", !fp);
  $("#pairForm").classList.toggle("hidden", fp);
  $("#pinHint").classList.toggle("hidden", fp);
  if (fp && !showPair.tried) { showPair.tried = true; fpUnlock(); }
}

function logout() {
  token = "";
  try { localStorage.removeItem("station_token"); sessionStorage.removeItem("station_session"); } catch {}
  showPair();
}

// ── Fingerprint unlock (passkeys) ──────────────────────────────────────────
const b64u = {
  dec: (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0)),
  enc: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
};
function credJSON(c) {
  const r = c.response, out = { id: c.id, rawId: b64u.enc(c.rawId), type: c.type,
    response: { clientDataJSON: b64u.enc(r.clientDataJSON) }, clientExtensionResults: c.getClientExtensionResults() };
  if (r.attestationObject) { out.response.attestationObject = b64u.enc(r.attestationObject); out.response.transports = r.getTransports ? r.getTransports() : []; }
  if (r.authenticatorData) {
    out.response.authenticatorData = b64u.enc(r.authenticatorData);
    out.response.signature = b64u.enc(r.signature);
    if (r.userHandle) out.response.userHandle = b64u.enc(r.userHandle);
  }
  out.authenticatorAttachment = c.authenticatorAttachment || undefined;
  return out;
}
async function postJSON(path, body, auth = false) {
  const headers = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(path, { method: "POST", headers, body: JSON.stringify(body || {}) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail || r.statusText);
  return data;
}
function useSession(t) {
  token = t;
  try { sessionStorage.setItem("station_session", t); localStorage.removeItem("station_token"); } catch {}
}
async function fpUnlock() {
  $("#fpError").textContent = "";
  try {
    const o = await postJSON("/api/passkey/login/options");
    const cred = await navigator.credentials.get({ publicKey: {
      ...o, challenge: b64u.dec(o.challenge),
      allowCredentials: (o.allowCredentials || []).map((c) => ({ ...c, id: b64u.dec(c.id) })) } });
    useSession((await postJSON("/api/passkey/login", { credential: credJSON(cred) })).token);
    start();
  } catch (e) { $("#fpError").textContent = e.name === "NotAllowedError" ? "Cancelled. Tap the button to try again." : e.message; }
}
async function fpSetup() {
  if (!fpSupported()) {
    const st = await fetch("/api/passkey/status").then((r) => r.json()).catch(() => ({}));
    return toast(st.secure_url ? `Open Jarvis at ${st.secure_url} to use your fingerprint.` : "Fingerprint needs Jarvis's secure Tailscale address. Turn on Tailscale on the PC.", true);
  }
  try {
    const o = await postJSON("/api/passkey/register/options", {}, true);
    const cred = await navigator.credentials.create({ publicKey: {
      ...o, challenge: b64u.dec(o.challenge), user: { ...o.user, id: b64u.dec(o.user.id) },
      excludeCredentials: (o.excludeCredentials || []).map((c) => ({ ...c, id: b64u.dec(c.id) })) } });
    const data = await postJSON("/api/passkey/register", { credential: credJSON(cred), device: $("#deviceName").value || "Phone" }, true);
    try { localStorage.setItem("station_lock", "passkey"); } catch {}
    useSession(data.token);
    toast("Fingerprint unlock is on. No more PIN on this device.");
    loadDevices();
  } catch (e) { toast(e.name === "NotAllowedError" ? "Cancelled" : e.message, true); }
}
$("#fpBtn").addEventListener("click", fpUnlock);
$("#fpSetup").addEventListener("click", fpSetup);
$("#usePin").addEventListener("click", (e) => {
  e.preventDefault(); $("#fpUnlock").classList.add("hidden"); $("#pairForm").classList.remove("hidden"); $("#pinHint").classList.remove("hidden");
});

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
  if (tab === "pc") { loadSetup(); loadStats(); loadSwitches(); loadProcs(); loadDevices(); loadProfile(); loadSignature(); }
  if (tab === "recall") loadRecall();
}
$$(".tabs button").forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));

// ── Start ──────────────────────────────────────────────────────────────────

async function start() {
  if (!token) return showPair();
  try {
    info = await api("/api/ping");
    if (info.secure_url) { try { localStorage.setItem("station_secure", info.secure_url); } catch {} }
  } catch (e) {
    // Home Wi-Fi can't reach the PC (router blocking, or you're out): switch to Jarvis's Tailscale address
    let secure = ""; try { secure = localStorage.getItem("station_secure") || ""; } catch {}
    if (secure && !location.href.startsWith(secure) && !(e.message || "").includes("paired")) {
      $("#screenMsg").textContent = "Home Wi-Fi can't reach your PC. Switching to the Tailscale address…";
      setTimeout(() => { location.href = secure; }, 1500);
      return;
    }
    if (token) { $("#screenMsg").textContent = "Can't reach your PC: " + e.message; }
    if (!token) return;
  }
  $("#pair").classList.add("hidden");
  $("#app").classList.remove("hidden");
  $("#hostName").textContent = info.host || "God Station";
  $("#connDot").className = "dot " + (info.ok ? "ok" : "bad");
  $("#shellBox").classList.toggle("hidden", !info.allow_shell);
  $("#fpSetup").classList.toggle("hidden", !!info.fingerprint);
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

// Say Jarvis's answer out loud on this phone/tablet (when you asked with the mic)
function speakReply(text) {
  if (!("speechSynthesis" in window) || localGet("station_speak", "1") !== "1") return;
  const clean = text.replace(/https?:\/\/\S+/g, "a link").replace(/[*_`#>|~]/g, "").slice(0, 450);
  const u = new SpeechSynthesisUtterance(clean);
  const voices = speechSynthesis.getVoices();
  u.voice = voices.find((v) => /en-GB/i.test(v.lang) && /male|daniel|george|arthur/i.test(v.name))
    || voices.find((v) => /en-GB/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang)) || null;
  u.rate = 1.05;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

// ---- Store-and-forward: messages typed while the PC is unreachable wait here and send on reconnect
const OUTQ = "jarvis-outq";
const qGet = () => { try { return JSON.parse(localStorage.getItem(OUTQ) || "[]"); } catch { return []; } };
const qSet = (q) => { try { localStorage.setItem(OUTQ, JSON.stringify(q)); } catch {} };
let qDelay = 2000, qTimer = null, qBusy = false;
async function flushQueue() {
  clearTimeout(qTimer);
  const q = qGet();
  if (!q.length || qBusy) return;
  qBusy = true;
  try {
    while (q.length) {
      const res = await api("/api/chat", { method: "POST", body: q[0] });
      q.shift(); qSet(q);
      const el = addMsg("jarvis", res.reply, "sent from queue");
      renderActions(el, res.actions);
    }
    qDelay = 2000;
    toast("Queued messages delivered");
  } catch {
    qDelay = Math.min(qDelay * 2, 60000);          // exponential backoff, max 1 min
    qTimer = setTimeout(flushQueue, qDelay);
  } finally { qBusy = false; }
}
window.addEventListener("online", flushQueue);
document.addEventListener("visibilitychange", () => { if (!document.hidden) flushQueue(); });
setTimeout(flushQueue, 1500);

async function sendChat(text, spoken = false) {
  text = text.trim();
  if (!text) return;
  addMsg("you", text);
  const thinking = addMsg("jarvis thinking", "Thinking…");
  try {
    const res = await api("/api/chat", { method: "POST", body: { message: text, device: $("#deviceName").value || "phone" } });
    thinking.remove();
    const el = addMsg("jarvis", res.reply, res.brain === "instant" ? "instant" : res.brain === "offline" ? "brain offline" : "");
    renderActions(el, res.actions);
    if (spoken) speakReply(res.reply);
    if (res.brain === "offline") checkBrain();
  } catch (e) {
    thinking.remove();
    if (e instanceof TypeError) {               // network down → keep it and send later
      const q = qGet(); q.push({ message: text, device: $("#deviceName").value || "phone" }); qSet(q);
      addMsg("jarvis", `📥 PC unreachable — queued (${q.length}). It sends itself when the link is back.`);
      qTimer = setTimeout(flushQueue, qDelay);
    } else addMsg("jarvis", "⚠ " + e.message);
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
    if (e.results[e.results.length - 1].isFinal) { rec.stop(); $("#chatInput").value = ""; sendChat(text, true); }
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

// ── Setup checklist ────────────────────────────────────────────────────────

let setupShowAll = false;
async function loadSetup() {
  const card = $("#setupCard");
  try {
    const s = await api("/api/setup");
    const todo = s.items.filter((i) => !i.ok);
    card.className = "card setup" + (todo.length ? "" : " done");
    card.innerHTML = `<div class="top"><b></b><button class="link"></button></div><div class="meter"><i></i></div><ul></ul>`;
    card.querySelector("b").textContent = todo.length ? `Setup: ${s.ready} of ${s.total} ready` : "All set, sir. Everything is ready.";
    card.querySelector(".meter i").style.width = `${(100 * s.ready) / s.total}%`;
    const btn = card.querySelector("button");
    btn.textContent = setupShowAll ? "show what's left" : "show all";
    btn.onclick = () => { setupShowAll = !setupShowAll; loadSetup(); };
    (setupShowAll ? s.items : todo).forEach((i) => {
      const li = document.createElement("li");
      li.className = i.ok ? "ok" : "todo";
      li.innerHTML = `<span class="mark">${i.ok ? "✓" : "○"}</span><span></span><small></small>`;
      li.children[1].textContent = `${i.label} — ${i.detail}`;
      li.children[2].textContent = i.ok ? "" : i.fix;
      if (!i.ok && /model missing/.test(i.detail)) {
        const b = document.createElement("button");
        b.textContent = "⬇ Download brain now (~2 GB)";
        b.onclick = () => act(() => api("/api/brain/pull", { method: "POST" }), "Downloading on the PC — takes a few minutes");
        li.append(b);
      }
      card.querySelector("ul").append(li);
    });
  } catch (e) { card.textContent = e.message; }
}

// ── Switches ───────────────────────────────────────────────────────────────

const SWITCHES = [
  ["clipboard", "Clipboard sync", "Copies on the PC reach your phone & tablet"],
  ["recall", "Screen memory", "Jarvis remembers what was on screen (8-hour segments, on this PC only)"],
  ["assist", "Form helper", "Chrome highlights forms and offers to fill them"],
  ["telegram", "Telegram", "Talk to Jarvis from Telegram"],
  ["voice", "“Hey Jarvis” voice", "Say “Hey Jarvis” to the PC and he answers out loud. Uses the PC's mic; audio is never saved"],
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
      if (key === "voice") loadVoiceStatus();
      list.append(switchRow(title, desc + extra, s[key], async (on) => {
        await api("/api/settings", { method: "PATCH", body: { [key]: on } });
        toast(`${title} ${on ? "on" : "off"}`);
        if (key === "recall") loadRecallStatus();
      }));
    });
    list.append(await notifyRow());
    list.append(switchRow("Speak answers on this device", "When you ask with the 🎙 mic, Jarvis answers out loud here too",
      localGet("station_speak", "1") === "1", async (on) => localSet("station_speak", on ? "1" : "0")));
    list.append(switchRow("Auto-copy on this device", "When the app is open, new copies from other devices go straight to this device's clipboard",
      localGet("station_autocopy", "1") === "1", async (on) => localSet("station_autocopy", on ? "1" : "0")));
    loadSync(s);
    loadFriday();
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

// "Hey Jarvis" status under its switch
async function loadVoiceStatus() {
  try {
    const v = await api("/api/voice");
    const row = [...$$("#switchList li")].find((li) => li.textContent.includes("Hey Jarvis"));
    const small = row?.querySelector("small");
    if (small && v.enabled) small.textContent = `Status: ${v.state}${v.last_heard ? ` · last heard “${v.last_heard}”` : ""}`;
  } catch {}
}

// Friday link: shared memory, one brain, ask each other
async function loadFriday() {
  const box = $("#fridayBox");
  let f;
  try { f = await api("/api/friday"); } catch (e) { box.textContent = e.message; return; }
  box.innerHTML = "";
  const status = document.createElement("p");
  status.className = "hint";
  status.innerHTML = `<span class="dot ${f.online ? "ok" : "bad"}" style="display:inline-block;margin-right:6px"></span>`;
  status.append(f.linked ? `Friday: ${f.detail}` : "Not linked yet. Paste Friday's pairing code (Friday → ⚙ Settings → Chrome pairing code).");
  box.append(status);

  const form = document.createElement("form");
  form.className = "row";
  form.innerHTML = `<input placeholder="${f.linked ? "Paste a new pairing code to change it" : "Friday's pairing code"}" autocomplete="off"><button class="btn primary">${f.linked ? "Update" : "Link"}</button>`;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const code = form.querySelector("input").value.trim();
    if (!code) return;
    await act(() => api("/api/settings", { method: "PATCH", body: { friday_code: code } }), "Linked with Friday");
    loadFriday();
  };
  box.append(form);

  const ul = document.createElement("ul");
  ul.className = "switches";
  const set = (key, label) => async (on) => { await api("/api/settings", { method: "PATCH", body: { [key]: on } }); toast(`${label} ${on ? "on" : "off"}`); loadFriday(); };
  ul.append(switchRow("Link with Friday", "Jarvis and Friday talk to each other on this PC", f.enabled, set("friday", "Friday link")));
  ul.append(switchRow("Shared memory", "Jarvis uses what Friday knows about you, and shares notes with Friday", f.share_memory, set("friday_share_memory", "Shared memory")));
  ul.append(switchRow("Think with Claude (your API key)", "Off = 100% free/local. On = uses ANTHROPIC_API_KEY from Jarvis/.env, falls back to Ollama", !!f.claude_brain, set("claude_brain", "Claude brain")));
  ul.append(switchRow("Think with Friday's brains", "Jarvis answers using Friday's models and API keys (falls back to Ollama)", f.brain, set("friday_brain", "Friday's brains")));
  box.append(ul);

  if (f.online && f.models?.length) {
    const row = document.createElement("div");
    row.className = "row";
    row.style.marginTop = "8px";
    const sel = document.createElement("select");
    sel.className = "btn grow";
    ["auto", ...f.models].forEach((m) => sel.append(new Option(m === "auto" ? "Friday's default brain" : m, m, false, m === f.model)));
    sel.onchange = () => act(() => api("/api/settings", { method: "PATCH", body: { friday_model: sel.value } }), "Brain chosen");
    row.append(sel);
    box.append(row);
  }
  const tip = document.createElement("p");
  tip.className = "hint";
  tip.style.marginTop = "8px";
  tip.textContent = "Tip: in Jarvis's chat, say “ask Friday …” to hand a question to Friday.";
  box.append(tip);
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

// ── Where your time went (from screen memory) ──────────────────────────────

let insightsDay = "";
const fmtMins = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`);
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function tipOn(el, text) {
  const tip = $("#chartTip");
  const show = (e) => {
    tip.textContent = text;
    tip.classList.add("show");
    const r = el.getBoundingClientRect();
    tip.style.left = `${Math.min(window.innerWidth - tip.offsetWidth - 8, Math.max(8, r.left + r.width / 2 - tip.offsetWidth / 2))}px`;
    tip.style.top = `${Math.max(8, r.top - tip.offsetHeight - 6)}px`;
  };
  const hide = () => tip.classList.remove("show");
  el.addEventListener("pointerenter", show);
  el.addEventListener("pointerleave", hide);
  el.addEventListener("touchstart", (e) => { show(e); setTimeout(hide, 1800); }, { passive: true });
}

function columns(values, labels, kind, selected = -1, tipText) {
  const max = Math.max(...values, 1);
  const cols = document.createElement("div");
  cols.className = `cols ${kind}`;
  const ticks = document.createElement("div");
  ticks.className = `ticks ${kind}`;
  values.forEach((v, i) => {
    const col = document.createElement("div");
    col.className = "col" + (v ? "" : " zero");
    col.innerHTML = `<i style="height:${(100 * v) / max}%"></i>`;
    tipOn(col, tipText(i, v));
    cols.append(col);
    const t = document.createElement("span");
    t.textContent = labels[i];
    if (i === selected) t.className = "on";
    ticks.append(t);
  });
  return [cols, ticks];
}

async function loadInsights(day = insightsDay) {
  const card = $("#insightsCard");
  let d;
  try { d = await api(`/api/insights${day ? `?day=${day}` : ""}`); } catch (e) { card.textContent = e.message; return; }
  insightsDay = d.day;
  const today = isoDay(new Date());
  const label = d.day === today ? "Today" : new Date(d.day + "T12:00").toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });
  card.innerHTML = `<div class="ins-head"><button class="icon-btn" data-step="-1" title="Day before">‹</button>
    <div class="what"><b></b><small></small></div><button class="icon-btn" data-step="1" title="Day after">›</button></div>`;
  card.querySelector("b").textContent = `Where your time went · ${label}`;
  card.querySelector("small").textContent = d.total_minutes
    ? `${fmtMins(d.total_minutes)} on the PC · ${d.first.slice(11, 16)}–${d.last.slice(11, 16)}`
    : "Nothing recorded this day (screen memory saves only when the screen changes).";
  card.querySelectorAll("[data-step]").forEach((b) => {
    const next = new Date(d.day + "T12:00");
    next.setDate(next.getDate() + Number(b.dataset.step));
    b.disabled = isoDay(next) > today;
    b.onclick = () => loadInsights(isoDay(next));
  });
  if (!d.total_minutes && !d.week.some((w) => w.total_minutes)) return;

  if (d.apps.length) {
    const sec = document.createElement("div");
    sec.className = "ins-sec";
    sec.textContent = "By app";
    const bars = document.createElement("div");
    bars.className = "app-bars";
    const top = d.apps.slice(0, 6);
    const rest = d.apps.slice(6).reduce((s, a) => s + a.minutes, 0);
    if (rest) top.push({ app: "Other", minutes: rest });
    const max = Math.max(...top.map((a) => a.minutes));
    top.forEach((a) => {
      const row = document.createElement("div");
      row.className = "app-bar";
      row.innerHTML = `<span class="name"></span><div class="track"><div class="fill" style="width:${(100 * a.minutes) / max}%"></div></div><span class="val"></span>`;
      row.querySelector(".name").textContent = a.app;
      row.querySelector(".val").textContent = fmtMins(a.minutes);
      bars.append(row);
    });
    card.append(sec, bars);
  }

  const hourSec = document.createElement("div");
  hourSec.className = "ins-sec";
  hourSec.textContent = "By hour";
  const hourLabels = d.hours.map((_, h) => (h % 6 === 0 ? String(h).padStart(2, "0") : ""));
  card.append(hourSec, ...columns(d.hours, hourLabels, "hours", -1,
    (h, v) => `${String(h).padStart(2, "0")}:00–${String(h + 1).padStart(2, "0")}:00 · ${fmtMins(v)}`));

  const weekSec = document.createElement("div");
  weekSec.className = "ins-sec";
  weekSec.textContent = "Last 7 days";
  const days = d.week.map((w) => new Date(w.day + "T12:00").toLocaleDateString([], { weekday: "short" }));
  const [wc, wt] = columns(d.week.map((w) => w.total_minutes), days, "week", 6,
    (i, v) => `${new Date(d.week[i].day + "T12:00").toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" })} · ${fmtMins(v)}`);
  [...wc.children].forEach((col, i) => { col.style.cursor = "pointer"; col.onclick = () => loadInsights(d.week[i].day); });
  card.append(weekSec, wc, wt);
}

async function loadRecall() {
  loadRecallStatus();
  loadInsights();
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
