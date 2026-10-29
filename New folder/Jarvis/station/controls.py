"""
God Station — PC Controls
==========================
Everything the phone can do to the PC: screen, mouse, keyboard,
volume/media, power, apps, files, clipboard, processes, terminal.

Built for Windows (your HP laptop). Most things also work on Linux/macOS.
"""

import io
import os
import platform
import socket
import subprocess
import time
from datetime import datetime
from pathlib import Path

IS_WINDOWS = platform.system() == "Windows"
IS_MAC = platform.system() == "Darwin"

VOLUME_KEYS = {"up": "volumeup", "down": "volumedown", "mute": "volumemute"}
MEDIA_KEYS = {"playpause": "playpause", "next": "nexttrack", "prev": "prevtrack", "stop": "stop"}

POWER_COMMANDS_WINDOWS = {
    "lock":     ["rundll32.exe", "user32.dll,LockWorkStation"],
    "sleep":    ["rundll32.exe", "powrprof.dll,SetSuspendState", "0,1,0"],
    "shutdown": ["shutdown", "/s", "/t", "60"],   # 60s grace — "cancel" stops it
    "restart":  ["shutdown", "/r", "/t", "60"],
    "cancel":   ["shutdown", "/a"],
}
POWER_COMMANDS_LINUX = {
    "lock":     ["loginctl", "lock-session"],
    "sleep":    ["systemctl", "suspend"],
    "shutdown": ["shutdown", "-h", "+1"],
    "restart":  ["shutdown", "-r", "+1"],
    "cancel":   ["shutdown", "-c"],
}


class ControlError(Exception):
    """A control action failed or isn't available on this PC."""


def enable_dpi_awareness():
    """Make Windows report real pixels so screenshots and clicks line up."""
    if not IS_WINDOWS:
        return
    try:
        import ctypes
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass


class PCControl:
    def __init__(self, upload_dir: Path | None = None):
        self._gui = None
        self.upload_dir = Path(upload_dir or Path.home() / "Downloads" / "Jarvis")

    # ── Mouse & keyboard engine (loaded on first use) ────────────────────────

    @property
    def gui(self):
        if self._gui is None:
            try:
                import pyautogui
            except (Exception, SystemExit) as e:  # pyautogui calls sys.exit() when a backend is missing
                raise ControlError(f"Mouse/keyboard control unavailable: {e}")
            pyautogui.FAILSAFE = False  # a remote cursor in a corner must not kill control
            pyautogui.PAUSE = 0
            self._gui = pyautogui
        return self._gui

    # ── Screen ───────────────────────────────────────────────────────────────

    def grab_image(self):
        """The main screen as a PIL image (no cursor)."""
        from PIL import ImageGrab
        if IS_WINDOWS:   # someone is watching: keep the display awake so it doesn't turn off or lock
            try:
                import ctypes
                ctypes.windll.kernel32.SetThreadExecutionState(0x00000002 | 0x00000001)  # DISPLAY | SYSTEM required
            except Exception:
                pass
        try:
            return ImageGrab.grab(all_screens=False)
        except Exception:
            pass
        try:
            return ImageGrab.grab()
        except Exception as e:
            raise ControlError("The PC is locked or its screen is asleep, so Jarvis can't see it. "
                               "Unlock the PC once; while you're watching, Jarvis now keeps the screen awake. "
                               f"({e})")

    def active_window(self) -> str:
        """Title of the window you're using, plus its program name, e.g. 'Inbox - Gmail — chrome'."""
        if IS_WINDOWS:
            try:
                import ctypes
                import psutil
                user32 = ctypes.windll.user32
                hwnd = user32.GetForegroundWindow()
                length = user32.GetWindowTextLengthW(hwnd)
                buf = ctypes.create_unicode_buffer(length + 1)
                user32.GetWindowTextW(hwnd, buf, length + 1)
                pid = ctypes.c_ulong()
                user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
                try:
                    app = psutil.Process(pid.value).name().removesuffix(".exe")
                except Exception:
                    app = ""
                return f"{buf.value} — {app}" if app else buf.value
            except Exception:
                return ""
        try:
            out = subprocess.run(["xdotool", "getactivewindow", "getwindowname"],
                                 capture_output=True, text=True, timeout=2)
            return out.stdout.strip()
        except (OSError, subprocess.SubprocessError):
            return ""

    def screenshot(self, width: int = 1280, quality: int = 60) -> tuple[bytes, int, int]:
        """JPEG of the main screen, scaled to `width`. Returns (jpeg, screen_w, screen_h)."""
        jpeg, _, full_w, full_h = self.screen_frame(width, quality)
        return jpeg, full_w, full_h

    def screen_frame(self, width: int = 1280, quality: int = 60, last_sig: bytes | None = None,
                     sharp: bool = False) -> tuple[bytes | None, bytes, int, int]:
        """One frame for the live screen: (jpeg or None if nothing changed since last_sig, signature, w, h).
        Skipping unchanged frames keeps the phone's picture fresh without wasting the connection."""
        from PIL import Image, ImageDraw
        img = self.grab_image()
        full_w, full_h = img.size

        # Draw the mouse cursor so you can see it on the phone
        cursor = (0, 0)
        try:
            cx, cy = self.gui.position()
            sw, sh = self.gui.size()
            x, y = cx * full_w / sw, cy * full_h / sh
            cursor = (int(x), int(y))
            r = max(6, full_w // 200)
            draw = ImageDraw.Draw(img)
            draw.ellipse((x - r, y - r, x + r, y + r), outline=(255, 60, 60), width=max(2, r // 3))
        except Exception:
            pass

        sig = img.resize((96, 54), Image.NEAREST).tobytes() + repr(cursor).encode()
        if last_sig is not None and sig == last_sig:
            return None, sig, full_w, full_h
        if width and full_w > width:   # reducing_gap: sharp text at near-bilinear speed
            img = img.resize((width, round(full_h * width / full_w)), Image.BILINEAR, reducing_gap=2.0)
        buf = io.BytesIO()
        img.convert("RGB").save(buf, "JPEG", quality=max(10, min(int(quality), 95)),
                                subsampling=0 if sharp else 2)
        return buf.getvalue(), sig, full_w, full_h

    # ── Mouse ────────────────────────────────────────────────────────────────

    def mouse(self, action: str, x: float | None = None, y: float | None = None,
              dx: float = 0, dy: float = 0, button: str = "left") -> dict:
        """x/y are 0..1 fractions of the screen, so any phone size maps correctly."""
        g = self.gui
        px = py = None
        if x is not None and y is not None:
            sw, sh = g.size()
            px = int(min(max(x, 0.0), 1.0) * (sw - 1))
            py = int(min(max(y, 0.0), 1.0) * (sh - 1))
        if button not in ("left", "right", "middle"):
            raise ControlError(f"Unknown button: {button}")

        if action == "move":
            g.moveTo(px, py)
        elif action == "move_rel":
            g.moveRel(int(dx), int(dy))
        elif action == "click":
            g.click(px, py, button=button)
        elif action == "double":
            g.doubleClick(px, py)
        elif action == "right":
            g.click(px, py, button="right")
        elif action == "down":
            g.mouseDown(px, py, button=button)
        elif action == "up":
            g.mouseUp(px, py, button=button)
        elif action == "scroll":
            if px is not None:
                g.moveTo(px, py)
            g.scroll(int(dy) * (120 if IS_WINDOWS else 1))  # Windows counts 1/120ths of a notch
        else:
            raise ControlError(f"Unknown mouse action: {action}")
        return {"ok": True}

    # ── Keyboard ─────────────────────────────────────────────────────────────

    def type_text(self, text: str) -> dict:
        g = self.gui
        if text.isascii():
            g.write(text, interval=0)
        else:  # emoji / accents: paste through the clipboard
            self.set_clipboard(text)
            g.hotkey("command" if IS_MAC else "ctrl", "v")
        return {"ok": True}

    def hotkey(self, keys: list[str]) -> dict:
        g = self.gui
        keys = [k.strip().lower() for k in keys if k.strip()]
        bad = [k for k in keys if k not in g.KEYBOARD_KEYS]
        if not keys or bad:
            raise ControlError(f"Unknown key(s): {bad or keys}")
        if len(keys) == 1:
            g.press(keys[0])
        else:
            g.hotkey(*keys)
        return {"ok": True}

    def volume(self, action: str, steps: int = 5) -> dict:
        if action not in VOLUME_KEYS:
            raise ControlError(f"Unknown volume action: {action}")
        self.gui.press(VOLUME_KEYS[action], presses=1 if action == "mute" else steps)
        return {"ok": True}

    def media(self, key: str) -> dict:
        if key not in MEDIA_KEYS:
            raise ControlError(f"Unknown media key: {key}")
        self.gui.press(MEDIA_KEYS[key])
        return {"ok": True}

    # ── Power ────────────────────────────────────────────────────────────────

    def power(self, action: str) -> dict:
        table = POWER_COMMANDS_WINDOWS if IS_WINDOWS else POWER_COMMANDS_LINUX
        if action not in table:
            raise ControlError(f"Unknown power action: {action}")
        try:
            subprocess.Popen(table[action])
        except OSError as e:
            raise ControlError(f"Power command failed: {e}")
        note = " in 60 seconds — tap Cancel to stop it" if action in ("shutdown", "restart") else ""
        return {"ok": True, "message": f"{action.capitalize()}{note}"}

    # ── Apps & links ─────────────────────────────────────────────────────────

    def open(self, target: str) -> dict:
        target = target.strip()
        if not target:
            raise ControlError("Nothing to open")
        try:
            if IS_WINDOWS:
                try:
                    os.startfile(target)
                except OSError:
                    subprocess.Popen(["cmd", "/c", "start", "", target],
                                     creationflags=subprocess.CREATE_NO_WINDOW)
            elif IS_MAC:
                subprocess.Popen(["open", target])
            else:
                subprocess.Popen(["xdg-open", target])
        except OSError as e:
            raise ControlError(f"Could not open {target}: {e}")
        return {"ok": True, "message": f"Opened {target}"}

    # ── Clipboard ────────────────────────────────────────────────────────────

    def get_clipboard(self) -> str:
        try:
            import pyperclip
            return pyperclip.paste()
        except Exception as e:
            raise ControlError(f"Clipboard unavailable: {e}")

    def set_clipboard(self, text: str) -> dict:
        try:
            import pyperclip
            pyperclip.copy(text)
        except Exception as e:
            raise ControlError(f"Clipboard unavailable: {e}")
        return {"ok": True}

    # ── Terminal ─────────────────────────────────────────────────────────────

    def shell(self, command: str, timeout: int = 60) -> dict:
        if IS_WINDOWS:
            args = ["powershell", "-NoProfile", "-NonInteractive", "-Command", command]
            flags = subprocess.CREATE_NO_WINDOW
        else:
            args, flags = ["bash", "-lc", command], 0
        try:
            p = subprocess.run(args, capture_output=True, text=True, encoding="utf-8",
                               errors="replace", timeout=timeout, cwd=str(Path.home()),
                               creationflags=flags)
        except subprocess.TimeoutExpired:
            return {"code": -1, "stdout": "", "stderr": f"Timed out after {timeout}s"}
        except OSError as e:
            raise ControlError(f"Could not run command: {e}")
        return {"code": p.returncode, "stdout": p.stdout[-20000:], "stderr": p.stderr[-5000:]}

    # ── System info & processes ──────────────────────────────────────────────

    def system_info(self) -> dict:
        import psutil
        vm = psutil.virtual_memory()
        battery = None
        try:
            b = psutil.sensors_battery()
            if b:
                battery = {"percent": round(b.percent), "plugged": bool(b.power_plugged)}
        except Exception:
            pass
        disks = []
        for part in psutil.disk_partitions(all=False):
            try:
                u = psutil.disk_usage(part.mountpoint)
                disks.append({"mount": part.mountpoint, "total_gb": round(u.total / 1e9, 1),
                              "free_gb": round(u.free / 1e9, 1), "percent": u.percent})
            except (PermissionError, OSError):
                continue
        return {
            "hostname": socket.gethostname(),
            "os": f"{platform.system()} {platform.release()}",
            "cpu_percent": psutil.cpu_percent(interval=0.3),
            "cpu_cores": psutil.cpu_count(),
            "ram_total_gb": round(vm.total / 1e9, 1),
            "ram_percent": vm.percent,
            "battery": battery,
            "disks": disks,
            "uptime_hours": round((time.time() - psutil.boot_time()) / 3600, 1),
        }

    def processes(self, limit: int = 25) -> list[dict]:
        import psutil
        procs = []
        for p in psutil.process_iter(["pid", "name", "memory_info"]):
            try:
                mem = p.info["memory_info"].rss if p.info["memory_info"] else 0
                procs.append({"pid": p.info["pid"], "name": p.info["name"] or "?",
                              "mem_mb": round(mem / 1e6)})
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        procs.sort(key=lambda p: p["mem_mb"], reverse=True)
        return procs[:limit]

    def kill(self, pid: int) -> dict:
        import psutil
        try:
            p = psutil.Process(pid)
            name = p.name()
            p.terminate()
        except psutil.NoSuchProcess:
            raise ControlError(f"No process {pid}")
        except psutil.AccessDenied:
            raise ControlError(f"Not allowed to close {pid} (try running the station as admin)")
        return {"ok": True, "message": f"Closed {name}"}

    # ── Files ────────────────────────────────────────────────────────────────

    def list_dir(self, path: str = "") -> dict:
        if not path:
            import psutil
            roots = [{"name": "Home", "path": str(Path.home()), "is_dir": True}]
            for part in psutil.disk_partitions(all=False):
                roots.append({"name": part.mountpoint, "path": part.mountpoint, "is_dir": True})
            return {"path": "", "parent": None, "entries": roots}

        p = Path(path).expanduser()
        if not p.is_dir():
            raise ControlError(f"Not a folder: {path}")
        entries = []
        try:
            with os.scandir(p) as it:
                for e in it:
                    try:
                        is_dir = e.is_dir()
                        st = e.stat()
                        entries.append({
                            "name": e.name, "path": str(Path(p, e.name)), "is_dir": is_dir,
                            "size": None if is_dir else st.st_size,
                            "modified": datetime.fromtimestamp(st.st_mtime).isoformat(timespec="minutes"),
                        })
                    except OSError:
                        continue
        except PermissionError:
            raise ControlError(f"No permission to open {path}")
        entries.sort(key=lambda e: (not e["is_dir"], e["name"].lower()))
        parent = str(p.parent) if p.parent != p else ""
        return {"path": str(p), "parent": parent, "entries": entries}

    def resolve_file(self, path: str) -> Path:
        p = Path(path).expanduser()
        if not p.is_file():
            raise ControlError(f"Not a file: {path}")
        return p

    def save_upload(self, filename: str, data, folder: str = "") -> dict:
        target_dir = Path(folder).expanduser() if folder else self.upload_dir
        target_dir.mkdir(parents=True, exist_ok=True)
        name = Path(filename).name or "upload.bin"
        target = target_dir / name
        stem, suffix, n = target.stem, target.suffix, 1
        while target.exists():
            target = target_dir / f"{stem} ({n}){suffix}"
            n += 1
        with open(target, "wb") as f:
            while chunk := data.read(1024 * 1024):
                f.write(chunk)
        return {"ok": True, "path": str(target)}
