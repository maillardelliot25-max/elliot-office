// Friday for Windows: Friday in her own window, a tray icon, and a watchdog that keeps
// Friday's server (port 8765) and Jarvis (port 8780) running all the time.
"use strict";
const { app, BrowserWindow, Tray, Menu, shell, dialog, nativeImage, session, powerSaveBlocker } = require("electron");
const { spawn, execFileSync } = require("child_process");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");

const FRIDAY_PORT = 8765, JARVIS_PORT = 8780;
const FRIDAY_URL = `http://localhost:${FRIDAY_PORT}`;
const JARVIS_URL = `http://localhost:${JARVIS_PORT}`;
const HOME = os.homedir();
const STATE = app.getPath("userData");
const CONFIG = path.join(STATE, "config.json");
const LOG = path.join(STATE, "friday-desktop.log");
const NO_WINDOW = { windowsHide: true };
const PY_ENV = { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" };   // logs to a file: no emoji crashes

let win = null, tray = null, quitting = false;
const children = { friday: null, jarvis: null };

function log(...a) { try { fs.appendFileSync(LOG, `${new Date().toISOString()} ${a.join(" ")}\n`); } catch {} }
function readConfig() { try { return JSON.parse(fs.readFileSync(CONFIG, "utf8")); } catch { return {}; } }
function writeConfig(c) { try { fs.mkdirSync(STATE, { recursive: true }); fs.writeFileSync(CONFIG, JSON.stringify(c, null, 2)); } catch {} }
const asset = (f) => path.join(__dirname, "assets", f);
// One codebase, two sister apps: Friday-Setup.exe and Jarvis-Setup.exe (built with productName "Jarvis")
const MODE = app.getName() === "Jarvis" ? "jarvis" : "friday";
const PROGRAMS = path.join(process.env.LOCALAPPDATA || "", "Programs");
const SISTER_EXE = MODE === "jarvis" ? path.join(PROGRAMS, "friday-desktop", "Friday.exe") : path.join(PROGRAMS, "jarvis-desktop", "Jarvis.exe");
const sisterInstalled = () => fs.existsSync(SISTER_EXE);
function openSister() {      // the other app if it's installed, else its page in the browser
  if (sisterInstalled()) spawn(SISTER_EXE, [], { detached: true, stdio: "ignore" }).unref();
  else shell.openExternal(MODE === "jarvis" ? FRIDAY_URL : JARVIS_URL);
}

function portOpen(port) {
  return new Promise((res) => {
    const s = net.connect({ port, host: "127.0.0.1" });
    s.setTimeout(700);
    s.on("connect", () => { s.destroy(); res(true); });
    s.on("error", () => res(false));
    s.on("timeout", () => { s.destroy(); res(false); });
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Where Friday and Jarvis live on this PC ─────────────────────────────────
function globDirs(base, depth, test) {          // small breadth-first folder search
  const out = []; let level = [base];
  for (let d = 0; d <= depth && level.length; d++) {
    const next = [];
    for (const dir of level) {
      if (test(dir)) out.push(dir);
      try { for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory() && !e.name.startsWith(".")) next.push(path.join(dir, e.name)); } catch {}
    }
    level = next;
  }
  return out;
}
const newest = (dirs, f) => dirs.sort((a, b) => { const m = (d) => { try { return fs.statSync(path.join(d, f)).mtimeMs; } catch { return 0; } }; return m(b) - m(a); })[0];

function fridayAppDir() {
  const c = readConfig();
  if (c.fridayDir && fs.existsSync(path.join(c.fridayDir, "server.py"))) return c.fridayDir;
  // Your own copy (keeps your chats, memory and settings) wins over the bundled one.
  const found = [];
  for (const base of ["Downloads", "Documents", "Desktop", "ElliotAI-Workspace"].map((b) => path.join(HOME, b)))
    found.push(...globDirs(base, 5, (d) => path.basename(d) === "app" && fs.existsSync(path.join(d, "server.py")) && fs.existsSync(path.join(d, "friday_lens.py"))));
  const own = newest(found.filter((d) => fs.existsSync(path.join(d, "data"))), "server.py") || newest(found, "server.py");
  const dir = own || path.join(process.resourcesPath, "LocalAI", "app");
  writeConfig({ ...c, fridayDir: dir });
  return dir;
}

function jarvisDir() {
  const c = readConfig();
  if (c.jarvisDir && fs.existsSync(path.join(c.jarvisDir, "station"))) return c.jarvisDir;
  const found = [];
  for (const base of ["Downloads", "Documents", "Desktop"].map((b) => path.join(HOME, b)))
    found.push(...globDirs(base, 5, (d) => path.basename(d) === "Jarvis" && fs.existsSync(path.join(d, "station", "__main__.py")) && fs.existsSync(path.join(d, ".venv", "Scripts", "python.exe"))));
  const dir = newest(found, path.join("station", "__main__.py")) || null;
  if (dir) writeConfig({ ...c, jarvisDir: dir });
  return dir;
}

function findPython() {
  const cands = [["py", ["-3"]], ["python", []], [path.join(process.env.LOCALAPPDATA || "", "Programs", "Python", "Python312", "python.exe"), []]];
  for (const [exe, pre] of cands) {
    try { if (execFileSync(exe, [...pre, "-c", "print(3)"], { ...NO_WINDOW, timeout: 8000 }).toString().trim() === "3") return [exe, pre]; } catch {}
  }
  return null;
}

// ── Keep both running ───────────────────────────────────────────────────────
function startFriday(py) {
  const dir = fridayAppDir();
  const bundled = dir.startsWith(process.resourcesPath);
  const env = { ...PY_ENV };
  if (bundled) env.ELLIOT_AI_DATA = path.join(STATE, "data");
  const out = fs.openSync(path.join(STATE, "friday-server.log"), "a");
  log("starting Friday from", dir);
  children.friday = spawn(py[0], [...py[1], "server.py", "--no-browser"], { cwd: dir, env, ...NO_WINDOW, stdio: ["ignore", out, out] });
  children.friday.on("exit", (c) => { log("Friday exited", c); children.friday = null; });
  const lens = path.join(dir, "friday_lens.py");
  if (fs.existsSync(lens)) {
    const pyw = py[0] === "py" ? "pyw" : py[0].replace(/python(\.exe)?$/i, "pythonw$1");
    try { spawn(pyw, [...py[1], lens], { cwd: dir, ...NO_WINDOW, detached: true, stdio: "ignore" }).unref(); } catch {}
  }
}

function startJarvis() {
  const dir = jarvisDir();
  if (!dir) return false;
  const out = fs.openSync(path.join(STATE, "jarvis.log"), "a");
  log("starting Jarvis from", dir);
  children.jarvis = spawn(path.join(dir, ".venv", "Scripts", "python.exe"), ["-m", "station"], { cwd: dir, env: PY_ENV, ...NO_WINDOW, stdio: ["ignore", out, out] });
  children.jarvis.on("exit", (c) => { log("Jarvis exited", c); children.jarvis = null; });
  return true;
}

let setupRunning = false;
async function runSetup() {          // first run on a PC without Python/Friday's packages
  if (setupRunning) return; setupRunning = true;
  const script = path.join(process.resourcesPath, "LocalAI", "install-and-start.ps1");
  status("Installing what Friday needs (first run only, a few minutes)…");
  await new Promise((res) => {
    const p = spawn("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script], { env: { ...process.env, FRIDAY_DESKTOP: "1" }, stdio: "ignore" });
    p.on("exit", res); p.on("error", res);
  });
  setupRunning = false;
}

let failures = 0;
async function watchdog() {          // every 15 s: anything down gets restarted
  while (!quitting) {
    if (!(await portOpen(FRIDAY_PORT)) && !children.friday) {
      const py = findPython();
      if (!py) await runSetup(); else startFriday(py);
      for (let i = 0; i < 60 && !(await portOpen(FRIDAY_PORT)); i++) await sleep(1000);
      if (await portOpen(FRIDAY_PORT)) { failures = 0; showFriday(); }
      else if (++failures === 2) { await runSetup(); }
      else if (failures === 4) status(`Friday won't start. Details: ${path.join(STATE, "friday-server.log")}`);
    }
    if (!(await portOpen(JARVIS_PORT)) && !children.jarvis) startJarvis();
    await sleep(15000);
  }
}

// ── Window and tray ─────────────────────────────────────────────────────────
function status(text) { if (win && !win.isDestroyed()) win.webContents.executeJavaScript(`window.postMessage(${JSON.stringify(text)},"*")`).catch(() => {}); }

let fridayShown = false;
function showFriday() {
  if (!win || win.isDestroyed() || fridayShown) return;
  fridayShown = true;
  win.loadURL(FRIDAY_URL);
}

function createWindow(show) {
  win = new BrowserWindow({
    width: 1240, height: 840, minWidth: 420, minHeight: 500, show, title: "Friday",
    backgroundColor: "#070b14", icon: asset("icon.ico"), autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.loadFile(path.join(__dirname, "loading.html"));
  portOpen(FRIDAY_PORT).then((up) => up && showFriday());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(FRIDAY_URL)) return { action: "allow" };
    shell.openExternal(url); return { action: "deny" };
  });
  win.webContents.on("did-fail-load", () => { fridayShown = false; setTimeout(() => portOpen(FRIDAY_PORT).then((up) => up && showFriday()), 3000); });
  win.on("close", (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });   // close = back to the tray
}

// ── Jarvis in his own window, signed in automatically with the desktop token Jarvis keeps on this PC ──
let jwin = null;
function jarvisToken() {
  const dir = jarvisDir();
  try { return dir ? fs.readFileSync(path.join(dir, "station_data", "desktop.token"), "utf8").trim() : ""; } catch { return ""; }
}
async function openJarvis(show = true) {
  if (jwin && !jwin.isDestroyed()) { if (show) { jwin.show(); jwin.focus(); } return; }
  jwin = new BrowserWindow({
    width: 1100, height: 820, show, title: "Jarvis", backgroundColor: "#070b14", icon: asset("jarvis.ico"),
    autoHideMenuBar: true, webPreferences: { contextIsolation: true, sandbox: true },
  });
  jwin.on("close", (e) => { if (!quitting) { e.preventDefault(); jwin.hide(); } });
  jwin.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  for (let i = 0; i < 90 && !(await portOpen(JARVIS_PORT)); i++) await sleep(1000);
  await jwin.loadURL(JARVIS_URL).catch(() => {});
  const t = jarvisToken();
  if (t) {
    const had = await jwin.webContents.executeJavaScript(
      `(() => { if (localStorage.getItem("station_token")) return true; localStorage.setItem("station_token", ${JSON.stringify(t)}); return false; })()`).catch(() => true);
    if (!had) jwin.reload();
  }
  jwin.webContents.on("did-fail-load", () => setTimeout(() => !jwin.isDestroyed() && jwin.loadURL(JARVIS_URL), 5000));
}

function openWindow() {
  if (!win || win.isDestroyed()) createWindow(true);
  win.show(); win.focus();
}

const startAtLogin = () => app.getLoginItemSettings({ args: ["--hidden"] }).openAtLogin;
function setStartAtLogin(on) { app.setLoginItemSettings({ openAtLogin: on, args: ["--hidden"] }); }

function buildTray() {
  const J = MODE === "jarvis";
  tray = new Tray(nativeImage.createFromPath(asset(J ? "jarvis-tray.png" : "tray.png")));
  tray.setToolTip(J ? "Jarvis" : "Friday");
  const menu = () => Menu.buildFromTemplate([
    J ? { label: "Open Jarvis", click: () => openJarvis(true) } : { label: "Open Friday", click: openWindow },
    J ? { label: "Open Friday", click: openSister }
      : { label: "Open Jarvis", click: () => (sisterInstalled() ? openSister() : openJarvis(true)) },
    { type: "separator" },
    { label: "Start with Windows", type: "checkbox", checked: startAtLogin(), click: (i) => setStartAtLogin(i.checked) },
    { label: "Choose Friday folder…", click: async () => {
        const r = await dialog.showOpenDialog({ title: "Pick Friday's app folder (the one with server.py)", properties: ["openDirectory"] });
        if (!r.canceled && fs.existsSync(path.join(r.filePaths[0], "server.py"))) { writeConfig({ ...readConfig(), fridayDir: r.filePaths[0] }); restartFriday(); }
      } },
    { label: "Restart Friday", click: restartFriday },
    { type: "separator" },
    { label: `Quit ${J ? "Jarvis" : "Friday"} app (Friday and Jarvis keep running)`, click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu());
  tray.on("right-click", () => tray.setContextMenu(menu()));
  tray.on("click", () => (J ? openJarvis(true) : openWindow()));
}

function restartFriday() {
  if (children.friday) { try { children.friday.kill(); } catch {} children.friday = null; }
  fridayShown = false;
  if (win && !win.isDestroyed()) win.loadFile(path.join(__dirname, "loading.html"));
}

// ── Start ───────────────────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => (MODE === "jarvis" ? openJarvis(true) : openWindow()));
  app.setAppUserModelId(MODE === "jarvis" ? "ai.maillard.jarvis.desktop" : "ai.maillard.friday.desktop");
  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((wc, perm, cb) =>
      cb(["media", "microphone", "clipboard-read", "clipboard-sanitized-write", "notifications", "fullscreen"].includes(perm)));
    const c = readConfig();
    if (!c.loginSet) { setStartAtLogin(true); writeConfig({ ...readConfig(), loginSet: true }); }   // always running: on by default
    powerSaveBlocker.start("prevent-app-suspension");   // keeps the PC from sleeping while Friday runs
    buildTray();
    // Each app opens its own window when the PC starts; Friday also opens Jarvis if the Jarvis app isn't installed
    if (MODE === "jarvis") openJarvis(true);
    else { createWindow(true); if (!sisterInstalled()) openJarvis(true); }
    watchdog();
  });
  app.on("window-all-closed", (e) => e.preventDefault?.());
  // Friday's and Jarvis's servers are left running on quit: they're meant to stay up.
  app.on("before-quit", () => { quitting = true; for (const k of Object.keys(children)) children[k]?.unref?.(); });
}
