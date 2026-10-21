// Friday on every page: when you start filling in a form, offer to fill it for you.
(() => {
  if (window.__jarvisForms) return;
  const esc = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  window.__jarvisForms = true;
  const offered = new WeakSet();
  const FIELDS = 'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=password]):not([type=file]), textarea, select';
  const SECRET = /pass|card|cvv|cvc|iban|sort.?code|account.?num|ssn|social.?sec|pin\b|otp|one.?time/i;

  const formOf = el => el.closest("form, [role=form]") || el.closest("div[role=list], main") || document.body;
  const fieldsIn = form => [...form.querySelectorAll(FIELDS)].filter(f => {
    const r = f.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && !f.disabled && !f.readOnly && !SECRET.test(`${f.name} ${f.id} ${f.autocomplete} ${labelOf(f)}`);
  });
  function labelOf(f) {
    const byFor = f.id && document.querySelector(`label[for="${CSS.escape(f.id)}"]`);
    const wrap = f.closest("label");
    // Google Forms and many modern sites put the question text in a nearby heading
    const q = f.closest('[role=listitem], .form-group, .field, fieldset')?.querySelector('[role=heading], legend, label, .label');
    return (byFor?.innerText || wrap?.innerText || f.getAttribute("aria-label") || f.placeholder || q?.innerText || f.name || f.id || "")
      .trim().replace(/\s+/g, " ").slice(0, 120);
  }

  // A small card in the corner, kept apart from the page's own styles
  let host = null;
  function card(html, buttons, glowEl) {
    host?.remove();
    host = document.createElement("div");
    host.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483647";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>
      .c{font:14px/1.45 system-ui,"Segoe UI",sans-serif;background:#1f1e1d;color:#ecebe6;border:1px solid #c96442;border-radius:14px;
         padding:14px 16px;width:300px;box-shadow:0 12px 40px rgba(0,0,0,.35);animation:in .25s ease-out}
      .t{color:#c96442;font-weight:700;margin-bottom:4px} .b{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
      button{font:inherit;border-radius:8px;border:1px solid #3e3e3a;background:#30302e;color:#ecebe6;padding:5px 11px;cursor:pointer}
      button.p{background:#c96442;border-color:#c96442;color:#fff} @keyframes in{from{transform:translateY(16px);opacity:0}}</style>
      <div class="c"><div class="t">✦ Friday</div><div>${html}</div><div class="b"></div></div>`;
    const row = root.querySelector(".b");
    buttons.forEach(([label, primary, fn]) => {
      const b = document.createElement("button");
      b.textContent = label; if (primary) b.className = "p";
      b.onclick = fn; row.append(b);
    });
    document.documentElement.append(host);
    if (glowEl) glow(glowEl, true);
  }
  function close(form) { host?.remove(); host = null; if (form) glow(form, false); }
  function glow(el, on) {
    el.style.transition = "box-shadow .4s";
    el.style.boxShadow = on ? "0 0 0 3px #c96442, 0 0 26px rgba(201,100,66,.55)" : "";
    el.style.borderRadius = on ? "10px" : "";
  }

  async function settings() {
    try { return await chrome.runtime.sendMessage({ type: "jarvis-settings" }); } catch { return null; }
  }

  document.addEventListener("focusin", async e => {
    const el = e.target;
    if (!el.matches?.(FIELDS)) return;
    const form = formOf(el);
    if (offered.has(form) || fieldsIn(form).length < 3) return;
    offered.add(form);
    const s = await settings();
    if (!s || !s.paired || !s.proactive || (s.muted || []).includes(location.hostname)) return;
    const sir = s.butler ? ", sir" : "";
    card(`I've got this${sir}. Shall I fill in this form for you? I'll use what I know about you, then you check it and press submit.`, [
      ["Fill it for me", true, () => fill(form, s)],
      ["No thanks", false, () => close(form)],
      ["Not on this site", false, () => { chrome.runtime.sendMessage({ type: "jarvis-mute", host: location.hostname }); close(form); }],
    ], form);
  }, true);

  async function fill(form, s) {
    const fields = fieldsIn(form);
    const list = fields.map((f, i) => ({
      id: String(i), label: labelOf(f), type: f.tagName === "SELECT" ? "select" : f.type || "text",
      options: f.tagName === "SELECT" ? [...f.options].map(o => o.text.trim()).filter(Boolean).slice(0, 40) : undefined,
      current: f.value || "",
    }));
    card(`Right away${s.butler ? ", sir" : ""}. Filling it in…`, [], form);
    const r = await chrome.runtime.sendMessage({ type: "jarvis-autofill", fields: list, title: document.title, url: location.href });
    if (!r || r.error) return card(`Sorry${s.butler ? ", sir" : ""}, I couldn't fill it: ${esc(r?.error || "Friday isn't reachable")}`, [["OK", true, () => close(form)]]);
    let n = 0;
    const missing = [];
    fields.forEach((f, i) => {
      const v = r.values?.[String(i)];
      if (v === undefined || v === null || v === "") { if (!f.value) missing.push(list[i].label || list[i].type); return; }
      if (f.value) return;   // never overwrite what you typed
      if (f.tagName === "SELECT") {
        const opt = [...f.options].find(o => o.text.trim().toLowerCase() === String(v).toLowerCase());
        if (!opt) return;
        f.value = opt.value;
      } else if (f.type === "checkbox" || f.type === "radio") {
        if (!/^(yes|true|1|checked)$/i.test(String(v))) return;
        f.checked = true;
      } else {
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(f), "value")?.set;
        setter ? setter.call(f, String(v)) : (f.value = String(v));
      }
      f.dispatchEvent(new Event("input", { bubbles: true }));
      f.dispatchEvent(new Event("change", { bubbles: true }));
      f.style.backgroundColor = "rgba(74,222,128,.18)";
      n++;
    });
    card(`Done${s.butler ? ", sir" : ""}. I filled ${n} field${n === 1 ? "" : "s"}${missing.length ? `. I left these for you: <i>${missing.slice(0, 6).map(esc).join(", ")}</i>` : ""}. Please check everything, then press submit yourself.`,
      [["Thanks", true, () => close(form)]], form);
  }
})();
