// Jarvis Assist — spots forms you start filling, highlights them and offers to fill them.
// Never submits anything: you always check and press Submit yourself.
(() => {
  if (window.__jarvisAssist || document.querySelector('meta[name="jarvis-station"]')) return;  // not on Jarvis's own app
  window.__jarvisAssist = true;

  const FIELDS = 'input:not([type]),input[type=text],input[type=email],input[type=tel],input[type=url],' +
    'input[type=number],input[type=date],input[type=search],textarea,select';
  const SITE_KEY = "jarvis-muted:" + location.hostname;
  const offered = new WeakSet();
  let busy = false;

  // ── Page styles (highlight) ────────────────────────────────────────────────
  const style = document.createElement("style");
  style.textContent = `
    .jarvis-glow { outline: 2px solid #38bdf8 !important; outline-offset: 2px !important;
      box-shadow: 0 0 0 6px rgba(56,189,248,.18) !important; transition: box-shadow .3s !important; }
    .jarvis-filled { outline: 2px solid #34d399 !important; outline-offset: 2px !important;
      box-shadow: 0 0 0 6px rgba(52,211,153,.18) !important; }
    .jarvis-todo { outline: 2px dashed #fbbf24 !important; outline-offset: 2px !important; }`;
  document.documentElement.append(style);

  // ── Jarvis bubble (shadow DOM so pages can't break it) ─────────────────────
  const host = document.createElement("div");
  host.style.cssText = "all:initial;position:fixed;right:20px;bottom:20px;z-index:2147483647;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      .b { font: 14px/1.45 system-ui, "Segoe UI", sans-serif; color: #e6edf9; background: #0f1626;
        border: 1px solid #22304f; border-radius: 16px; padding: 14px; width: 300px;
        box-shadow: 0 12px 40px rgba(0,0,0,.45), 0 0 30px rgba(56,189,248,.18);
        animation: in .25s ease-out; }
      @keyframes in { from { transform: translateY(12px); opacity: 0 } }
      .h { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; }
      .logo { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; font-weight: 800;
        color: #050814; background: linear-gradient(135deg, #38bdf8, #a78bfa); flex: none; }
      .t { font-weight: 700; } .m { color: #c3cde3; } .row { display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap; }
      button { font: inherit; font-weight: 600; border-radius: 9px; padding: 7px 11px; cursor: pointer;
        border: 1px solid #22304f; background: #16203a; color: #e6edf9; }
      button.p { background: linear-gradient(135deg, #38bdf8, #a78bfa); color: #050814; border: 0; }
      .x { margin-left: auto; background: none; border: 0; color: #8a99b8; padding: 0 4px; font-size: 18px; }
    </style>
    <div class="b" hidden>
      <div class="h"><div class="logo">J</div><div class="t">Jarvis</div><button class="x" title="Close">×</button></div>
      <div class="m"></div>
      <div class="row"></div>
    </div>`;
  const box = root.querySelector(".b");
  const msgEl = root.querySelector(".m");
  const rowEl = root.querySelector(".row");
  root.querySelector(".x").onclick = hide;
  let hideTimer;

  function show(text, buttons = [], autoHideMs = 0) {
    if (!host.isConnected) document.documentElement.append(host);
    host.style.display = "block";
    msgEl.textContent = text;
    rowEl.replaceChildren(...buttons.map(([label, fn, primary]) => {
      const b = document.createElement("button");
      b.textContent = label;
      if (primary) b.className = "p";
      b.onclick = fn;
      return b;
    }));
    box.hidden = false;
    clearTimeout(hideTimer);
    if (autoHideMs) hideTimer = setTimeout(hide, autoHideMs);
  }
  function hide() { box.hidden = true; host.style.display = "none"; }  // closed bubble never blocks the page

  const send = (msg) => new Promise((res) => chrome.runtime.sendMessage(msg, (r) => res(r || { ok: false, error: chrome.runtime.lastError?.message })));

  // ── Finding the form's fields ──────────────────────────────────────────────
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" && !el.disabled && !el.readOnly;
  };

  function labelOf(el) {
    const bits = [];
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l) bits.push(l.innerText);
    }
    const wrap = el.closest("label");
    if (wrap) bits.push(wrap.innerText);
    if (el.getAttribute("aria-label")) bits.push(el.getAttribute("aria-label"));
    const by = el.getAttribute("aria-labelledby");
    if (by) by.split(/\s+/).forEach((id) => { const n = document.getElementById(id); if (n) bits.push(n.innerText); });
    if (!bits.length) {  // Google Forms & friends: the question text sits above the box
      const item = el.closest('[role="listitem"], .form-group, .field, fieldset, li, tr');
      const heading = item?.querySelector('[role="heading"], legend, label, th, .label');
      if (heading) bits.push(heading.innerText);
    }
    return bits.join(" ").replace(/\s+/g, " ").trim().slice(0, 200);
  }

  function fieldsIn(container) {
    return [...container.querySelectorAll(FIELDS)].filter(visible);
  }

  function hasPassword(container) {
    return !!container.querySelector("input[type=password]");
  }

  // ── Offer help when you start filling a form ───────────────────────────────
  document.addEventListener("focusin", async (e) => {
    const el = e.target;
    if (busy || !(el instanceof Element) || !el.matches(FIELDS)) return;
    if (sessionStorage.getItem(SITE_KEY) || localStorage.getItem(SITE_KEY)) return;
    const container = el.closest("form") || el.closest('[role="form"], [role="list"], main') || document.body;
    if (offered.has(container) || hasPassword(container)) return;  // never on login forms
    const fields = fieldsIn(container);
    if (fields.length < 2) return;
    offered.add(container);

    const status = await send({ type: "status" });
    if (!status.ok || !status.enabled) return;  // not paired, station off, or helper switched off

    fields.forEach((f) => f.classList.add("jarvis-glow"));
    show(`${status.greeting} I see a form with ${fields.length} boxes. Shall I fill it in?`, [
      ["Fill it", () => fill(container), true],
      ["Not now", () => { clearGlow(container); hide(); }],
      ["Never on this site", () => { localStorage.setItem(SITE_KEY, "1"); clearGlow(container); hide(); }],
    ]);
  }, true);

  function clearGlow(container) {
    container.querySelectorAll(".jarvis-glow").forEach((f) => f.classList.remove("jarvis-glow"));
  }

  // React/Vue-friendly way to set a value so the page notices it
  function setValue(el, value) {
    if (el.tagName === "SELECT") {
      const want = String(value).toLowerCase().trim();
      const opt = [...el.options].find((o) => o.text.toLowerCase().trim() === want || o.value.toLowerCase() === want)
        || [...el.options].find((o) => o.text.toLowerCase().startsWith(want) || want.startsWith(o.text.toLowerCase().trim()) && o.text.trim());
      if (!opt) return false;
      el.value = opt.value;
    } else {
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  async function fill(container) {
    busy = true;
    const els = fieldsIn(container);
    const fields = els.map((el, i) => ({
      i, label: labelOf(el), name: el.name || "", id: el.id || "", type: el.type || el.tagName.toLowerCase(),
      placeholder: el.placeholder || "", autocomplete: el.getAttribute("autocomplete") || "",
      options: el.tagName === "SELECT" ? [...el.options].map((o) => o.text.trim()).filter(Boolean).slice(0, 300) : undefined,
      current: el.value ? "has value" : "",
    })).filter((f, i) => !els[i].value || els[i].tagName === "SELECT");
    show("Right away, sir…");
    const res = await send({ type: "fill", form: { url: location.href, title: document.title, fields } });
    busy = false;
    clearGlow(container);
    if (!res.ok) {
      show(res.error === "not-paired" ? "Sir, I'm not paired with the God Station. Click the Jarvis icon in Chrome to pair me."
        : `I'm sorry, sir: ${res.error}`, [], 8000);
      return;
    }
    let n = 0;
    const done = new Set();
    for (const v of res.values || []) {
      const el = els[v.i];
      if (el && setValue(el, v.value)) { el.classList.add("jarvis-filled"); done.add(el); n++; }
    }
    els.forEach((el) => { if (!done.has(el) && !el.value) el.classList.add("jarvis-todo"); });
    const left = els.filter((el) => !el.value).length;
    show(`${res.message}${left ? ` ${left} left for you (yellow).` : ""}`, [["Thanks, Jarvis", hide, true]], 15000);
    setTimeout(() => container.querySelectorAll(".jarvis-filled,.jarvis-todo")
      .forEach((f) => f.classList.remove("jarvis-filled", "jarvis-todo")), 20000);
  }
})();
