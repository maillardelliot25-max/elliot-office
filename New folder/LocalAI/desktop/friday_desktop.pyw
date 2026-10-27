"""
Friday for Windows: its own app window, a tray icon, and Friday's server kept running in the background.

Why Python + Edge instead of an .exe: Windows Smart App Control blocks unsigned programs. This launcher
only uses programs Windows already trusts (Python, Microsoft Edge), so nothing gets blocked.

  pythonw friday_desktop.pyw              start (adds Start menu + desktop shortcuts the first time)
  pythonw friday_desktop.pyw --hidden     start in the tray only (used when starting at sign-in)
  pythonw friday_desktop.pyw --uninstall  remove the shortcuts
"""
import ctypes
import json
import os
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

HERE = Path(__file__).resolve().parent
LOCALAI = HERE.parent
APP = LOCALAI / "app"
PORT = int(os.getenv("PORT", "8765"))
URL = f"http://localhost:{PORT}"
JARVIS_URL = "http://localhost:8780"
ICON_ICO = HERE / "assets" / "icon.ico"
ICON_PNG = HERE / "assets" / "tray.png"
STATE = Path(os.getenv("APPDATA", str(HERE))) / "Friday"
STATE.mkdir(parents=True, exist_ok=True)
LOG = STATE / "friday-server.log"
NO_WINDOW = 0x08000000

PYW = Path(sys.executable)                                   # pythonw.exe (no console)
PY = PYW.with_name("python.exe") if PYW.name.lower() == "pythonw.exe" else PYW
STARTUP_LNK = Path(os.getenv("APPDATA", "")) / r"Microsoft\Windows\Start Menu\Programs\Startup\Friday.lnk"
START_LNK = Path(os.getenv("APPDATA", "")) / r"Microsoft\Windows\Start Menu\Programs\Friday.lnk"


def desktop_dir() -> Path:
    try:
        out = subprocess.run(["powershell", "-NoProfile", "-Command", "[Environment]::GetFolderPath('Desktop')"],
                             capture_output=True, text=True, creationflags=NO_WINDOW, timeout=20).stdout.strip()
        if out:
            return Path(out)
    except Exception:
        pass
    return Path.home() / "Desktop"


def port_open(port=PORT) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.5):
            return True
    except OSError:
        return False


# ── Shortcuts ─────────────────────────────────────────────────────────────
def make_shortcut(path: Path, args: str = ""):
    path.parent.mkdir(parents=True, exist_ok=True)
    ps = ("$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:LNK);"
          "$s.TargetPath=$env:TGT;$s.Arguments=$env:ARGS;$s.WorkingDirectory=$env:WD;"
          "$s.IconLocation=$env:ICO;$s.Description='Friday, your AI';$s.Save()")
    env = dict(os.environ, LNK=str(path), TGT=str(PYW), ARGS=f'"{Path(__file__).resolve()}" {args}'.strip(),
               WD=str(HERE), ICO=str(ICON_ICO))
    subprocess.run(["powershell", "-NoProfile", "-Command", ps], env=env, creationflags=NO_WINDOW, timeout=30)


def install_shortcuts():
    make_shortcut(START_LNK)
    make_shortcut(desktop_dir() / "Friday.lnk")


def set_startup(on: bool):
    if on:
        make_shortcut(STARTUP_LNK, "--hidden")
    elif STARTUP_LNK.exists():
        STARTUP_LNK.unlink()


def uninstall():
    for p in (START_LNK, STARTUP_LNK, desktop_dir() / "Friday.lnk"):
        try:
            p.unlink()
        except OSError:
            pass


# ── Friday's server ───────────────────────────────────────────────────────
started_here = []


def ensure_packages():
    try:
        import pystray  # noqa: F401
        from PIL import Image  # noqa: F401
    except ImportError:
        subprocess.run([str(PY), "-m", "pip", "install", "--quiet", "--disable-pip-version-check", "pystray", "pillow"],
                       creationflags=NO_WINDOW)


def start_server(wait=60) -> bool:
    if port_open():
        return True
    log = open(LOG, "ab")
    started_here.append(subprocess.Popen([str(PY), "server.py", "--no-browser"], cwd=APP, stdout=log,
                                         stderr=subprocess.STDOUT, creationflags=NO_WINDOW))
    lens = APP / "friday_lens.py"
    if lens.exists():
        started_here.append(subprocess.Popen([str(PYW), str(lens)], cwd=APP, creationflags=NO_WINDOW))
    end = time.time() + wait
    while time.time() < end:
        if port_open():
            return True
        if started_here[0].poll() is not None:     # crashed straight away: probably missing packages
            break
        time.sleep(0.5)
    return port_open()


def run_setup():
    """First run on a PC without Friday's packages: the normal installer, in a visible window."""
    script = LOCALAI / "install-and-start.ps1"
    env = dict(os.environ, FRIDAY_DESKTOP="1")
    subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(script)], env=env)


def stop_server():
    for p in started_here:
        try:
            p.terminate()
        except Exception:
            pass
    started_here.clear()


# ── Window ────────────────────────────────────────────────────────────────
def edge_path():
    for base in (os.getenv("ProgramFiles(x86)"), os.getenv("ProgramFiles"), os.getenv("LOCALAPPDATA")):
        if base:
            p = Path(base) / "Microsoft" / "Edge" / "Application" / "msedge.exe"
            if p.exists():
                return p
    return None


def open_window(url=URL, profile="window"):
    edge = edge_path()
    if edge:   # an app window: no tabs or address bar, its own taskbar icon
        subprocess.Popen([str(edge), f"--app={url}", f"--user-data-dir={STATE / profile}", "--no-first-run",
                          "--no-default-browser-check", "--window-size=1200,820"])
    else:
        webbrowser.open(url)


def notify_error(text):
    ctypes.windll.user32.MessageBoxW(None, text, "Friday", 0x10)


# ── Tray ──────────────────────────────────────────────────────────────────
def tray():
    import pystray
    from PIL import Image

    def restart(icon, _):
        stop_server()
        threading.Thread(target=start_server, daemon=True).start()

    def toggle_startup(icon, _):
        set_startup(not STARTUP_LNK.exists())

    def quit_all(icon, _):
        stop_server()
        icon.stop()

    menu = pystray.Menu(
        pystray.MenuItem("Open Friday", lambda i, _: open_window(), default=True),
        pystray.MenuItem("Open Jarvis", lambda i, _: open_window(JARVIS_URL, "jarvis-window")),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Start with Windows", toggle_startup, checked=lambda _: STARTUP_LNK.exists()),
        pystray.MenuItem("Restart Friday", restart),
        pystray.MenuItem("Quit Friday", quit_all),
    )
    pystray.Icon("Friday", Image.open(ICON_PNG), "Friday", menu).run()


def main():
    args = sys.argv[1:]
    if "--uninstall" in args:
        uninstall()
        return
    # One copy only: a second launch just opens the window.
    ctypes.windll.kernel32.CreateMutexW(None, False, "Local\\FridayDesktopTray")
    if ctypes.windll.kernel32.GetLastError() == 183:
        open_window()
        return
    first = not START_LNK.exists()
    if first:
        install_shortcuts()
    ensure_packages()
    if not start_server():
        run_setup()
        if not start_server(90):
            notify_error(f"Friday couldn't start. Details are in:\n{LOG}")
            return
    if "--hidden" not in args:
        open_window()
    tray()


if __name__ == "__main__":
    main()
