"""
Jarvis IS the desktop: the HUD runs as the live Windows wallpaper, behind your icons and windows.

How: open the HUD in a borderless Microsoft Edge app window, then re-parent it into the desktop's
wallpaper layer (the "WorkerW" window that live-wallpaper apps use). Works on Windows 10/11, including
the 24H2+ desktop layout. Checked every 30 s, so it comes back after Explorer restarts or Edge closes.
Turn off with JARVIS_DESKTOP_HUD=0.
"""

import ctypes
import logging
import os
import subprocess
import threading
import time
from ctypes import wintypes
from pathlib import Path

logger = logging.getLogger("jarvis.station.desktop_hud")
TITLE = "Jarvis HUD"


def _edge() -> str | None:
    for base in (os.getenv("ProgramFiles(x86)"), os.getenv("ProgramFiles"), os.getenv("LOCALAPPDATA")):
        if base and (p := Path(base) / "Microsoft" / "Edge" / "Application" / "msedge.exe").exists():
            return str(p)
    return None


class DesktopHUD:
    def __init__(self, port: int, data_dir: Path):
        self.url = f"http://localhost:{port}/hud.html?wall=1"
        self.profile = Path(data_dir) / "hud-browser"
        self.proc = None
        self.failed = False

    # ── Win32 ──
    def _user32(self):
        u = ctypes.windll.user32
        u.FindWindowW.restype = wintypes.HWND
        u.FindWindowExW.restype = wintypes.HWND
        u.GetParent.restype = wintypes.HWND
        return u

    def _workerw(self):
        """The window that sits between the wallpaper and the desktop icons."""
        u = self._user32()
        progman = u.FindWindowW("Progman", None)
        res = wintypes.DWORD()
        u.SendMessageTimeoutW(progman, 0x052C, 0xD, 0x1, 0, 1000, ctypes.byref(res))   # ask Explorer to create it
        u.SendMessageTimeoutW(progman, 0x052C, 0, 0, 0, 1000, ctypes.byref(res))
        # Windows 11 24H2+: WorkerW is a child of Progman
        w = u.FindWindowExW(progman, None, "WorkerW", None)
        if w:
            return w
        # Older: the WorkerW sibling that follows the one holding SHELLDLL_DefView
        found = []

        @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
        def each(hwnd, _):
            if u.FindWindowExW(hwnd, None, "SHELLDLL_DefView", None):
                found.append(u.FindWindowExW(None, hwnd, "WorkerW", None))
            return True
        u.EnumWindows(each, 0)
        return found[0] if found and found[0] else progman

    def _hud_window(self):
        u = self._user32()
        hits = []

        @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
        def each(hwnd, _):
            buf = ctypes.create_unicode_buffer(256)
            u.GetWindowTextW(hwnd, buf, 256)
            if buf.value.startswith(TITLE):
                hits.append(hwnd)
            return True
        u.EnumWindows(each, 0)
        return hits[0] if hits else None

    def _attached(self, hwnd) -> bool:
        u = self._user32()
        return bool(hwnd) and u.GetParent(hwnd) == self._workerw()

    def ensure(self):
        u = self._user32()
        hwnd = self._hud_window()
        if not hwnd:
            edge = _edge()
            if not edge:
                return
            self.proc = subprocess.Popen([edge, f"--app={self.url}", f"--user-data-dir={self.profile}", "--no-first-run",
                                          "--no-default-browser-check", "--autoplay-policy=no-user-gesture-required",
                                          "--disable-features=CalculateNativeWinOcclusion", "--window-position=-32000,-32000"])
            for _ in range(40):
                time.sleep(0.5)
                if hwnd := self._hud_window():
                    break
            if not hwnd:
                return
        if self._attached(hwnd):
            return
        GWL_STYLE, WS_CHILD, WS_POPUP, WS_CAPTION, WS_THICKFRAME = -16, 0x40000000, 0x80000000, 0x00C00000, 0x00040000
        style = u.GetWindowLongW(hwnd, GWL_STYLE)
        u.SetWindowLongW(hwnd, GWL_STYLE, (style | WS_CHILD) & ~(WS_POPUP | WS_CAPTION | WS_THICKFRAME))
        worker = self._workerw()
        u.SetParent(hwnd, worker)
        w, h = u.GetSystemMetrics(0), u.GetSystemMetrics(1)
        u.SetWindowPos(hwnd, 0, 0, 0, w, h, 0x0040)   # SWP_SHOWWINDOW
        if not self._attached(hwnd):
            # Couldn't get behind the icons on this Windows build: never leave a full-screen window over the PC
            u.PostMessageW(hwnd, 0x0010, 0, 0)   # WM_CLOSE
            self.failed = True
            logger.warning("[HUD] couldn't attach to the desktop on this Windows build; desktop HUD off")
            return
        logger.info("[HUD] Jarvis HUD is now the desktop wallpaper")

    def run(self):
        time.sleep(8)       # let the server start first
        while not self.failed:
            try:
                self.ensure()
            except Exception as e:
                logger.info(f"[HUD] couldn't place the desktop HUD: {e}")
            time.sleep(30)

    def start(self):
        if os.name == "nt" and os.getenv("JARVIS_DESKTOP_HUD", "0") == "1":
            threading.Thread(target=self.run, daemon=True, name="desktop-hud").start()
