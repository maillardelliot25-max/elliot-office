const $ = (s) => document.querySelector(s);
const send = (msg) => new Promise((res) => chrome.runtime.sendMessage(msg, (r) => res(r || { ok: false })));

async function refresh() {
  $("#err").textContent = "";
  const { token, station } = await chrome.storage.local.get(["token", "station"]);
  $("#station").value = station || "http://localhost:8765";
  if (!token) { $("#pair").hidden = false; $("#paired").hidden = true; return; }
  const s = await send({ type: "status" });
  if (!s.ok) {
    if (s.error === "not-paired") return refresh();
    $("#paired").hidden = false; $("#pair").hidden = true;
    $("#err").textContent = "Can't reach the God Station — is start_station.bat running?";
    return;
  }
  $("#paired").hidden = false; $("#pair").hidden = true;
  $("#toggle").textContent = s.enabled ? "Form helper: ON — tap to turn off" : "Form helper: OFF — tap to turn on";
  $("#toggle").onclick = async () => { await send({ type: "setAssist", on: !s.enabled }); refresh(); };
}

$("#pair").addEventListener("submit", async (e) => {
  e.preventDefault();
  const r = await send({ type: "pair", pin: $("#pin").value.trim(), station: $("#station").value.trim() });
  if (!r.ok) { $("#err").textContent = r.error || "Pairing failed"; return; }
  refresh();
});
$("#unpair").addEventListener("click", async () => { await chrome.storage.local.remove("token"); refresh(); });
refresh();
