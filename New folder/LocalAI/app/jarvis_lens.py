"""
Jarvis Lens: ask about whatever is on your screen, like Gemini's screen feature.

Swipe up from the bottom edge of the screen (a quick upward flick of the mouse,
touchpad or finger that starts at the very bottom), or press Ctrl+Alt+Space.
Jarvis takes a screenshot of the screen you're on and a bar pops up at the
bottom where you can ask about it. Esc hides it.

Runs alongside the Elliot AI app (it talks to http://localhost:8765) and uses
the same chats, memory and models.

    pythonw jarvis_lens.py        (Windows, no console window)
    python3 jarvis_lens.py        (Mac / Linux)

Needs: pip install pynput mss pillow
"""

import base64
import io
import json
import os
import queue
import socket
import sys
import threading
import time
import tkinter as tk
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

import mss
from PIL import Image, ImageTk
from pynput import keyboard, mouse

APP_DIR = Path(__file__).resolve().parent
DATA = Path(os.getenv("ELLIOT_AI_DATA", APP_DIR / "data"))
SERVER = f"http://localhost:{os.getenv('PORT', 8765)}"

Screens = getattr(mss, "MSS", None) or mss.mss   # newer mss renamed mss.mss → mss.MSS

SWIPE_EDGE = 4          # px from the bottom edge where a swipe must start
SWIPE_DISTANCE = 220    # px it must travel upwards…
SWIPE_TIME = 0.35       # …within this many seconds
COOLDOWN = 2.0


def settings():
    try:
        return json.loads((DATA / "settings.json").read_text("utf-8"))
    except (OSError, ValueError):
        return {}


def call(path, body=None):
    req = urllib.request.Request(SERVER + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json",
                                          "X-Jarvis-Token": settings().get("chrome_token", "")})
    return urllib.request.urlopen(req, timeout=600)


# ── Screen ───────────────────────────────────────────────────────────────

def monitor_at(x, y, monitors):
    for m in monitors[1:]:   # [0] is the whole virtual desktop
        if m["left"] <= x < m["left"] + m["width"] and m["top"] <= y < m["top"] + m["height"]:
            return m
    return monitors[1] if len(monitors) > 1 else monitors[0]


def capture(x, y):
    """Screenshot of the monitor under the pointer, shrunk to a sensible size for the AI."""
    with Screens() as sct:
        mon = monitor_at(x, y, sct.monitors)
        shot = sct.grab(mon)
    img = Image.frombytes("RGB", shot.size, shot.rgb)
    img.thumbnail((1920, 1920))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=85)
    return img, base64.b64encode(buf.getvalue()).decode(), mon


class SwipeDetector:
    """Spots a quick upward flick that starts at the bottom edge of a screen."""

    def __init__(self, on_swipe):
        self.on_swipe = on_swipe
        self.start = None
        self.last_fire = 0.0
        with Screens() as sct:
            self.monitors = sct.monitors

    def move(self, x, y):
        mon = monitor_at(x, y, self.monitors)
        bottom = mon["top"] + mon["height"] - 1
        now = time.time()
        if y >= bottom - SWIPE_EDGE:
            self.start = (x, y, now, bottom)
            return
        if not self.start:
            return
        sx, sy, t0, b = self.start
        if now - t0 > SWIPE_TIME:
            self.start = None
        elif sy - y >= SWIPE_DISTANCE and abs(x - sx) < SWIPE_DISTANCE and now - self.last_fire > COOLDOWN:
            self.start, self.last_fire = None, now
            self.on_swipe(x, y)


# ── Screen memory ────────────────────────────────────────────────────────

def screen_recorder():
    """When "Screen memory" is on (Settings), save a screenshot whenever the screen has changed, into
    8-hour blocks (00-08, 08-16, 16-24) on this PC, keeping only the newest few blocks."""
    from datetime import datetime
    import shutil
    last = None
    while True:
        s = settings()
        every = max(10, int(s.get("screen_every") or 60))
        if s.get("screen_memory"):
            try:
                with Screens() as sct:
                    shot = sct.grab(sct.monitors[0])          # all screens together
                img = Image.frombytes("RGB", shot.size, shot.rgb)
                sig = img.resize((48, 27)).convert("L").tobytes()
                if last is None or sum(abs(a - b) for a, b in zip(sig, last)) > 48 * 27 * 3:   # skip unchanged screens
                    last = sig
                    now = datetime.now()
                    block = DATA / "screen_memory" / f"{now:%Y-%m-%d}_{now.hour // 8 * 8:02d}-{now.hour // 8 * 8 + 8:02d}h"
                    block.mkdir(parents=True, exist_ok=True)
                    img.thumbnail((1600, 1600))
                    img.save(block / f"{now:%H%M%S}.jpg", "JPEG", quality=60)
                    keep = max(1, int(s.get("screen_keep_blocks") or 3))
                    for old in sorted((DATA / "screen_memory").glob("*"))[:-keep]:
                        shutil.rmtree(old, ignore_errors=True)
            except Exception as e:
                print("screen memory:", e)
        time.sleep(every)


# ── The pop-up bar ───────────────────────────────────────────────────────

class Lens:
    def __init__(self):
        self.root = tk.Tk()
        self.root.withdraw()
        self.root.title("Jarvis Lens")
        self.events = queue.Queue()
        self.chat_id = None
        self.image_b64 = None
        self.busy = False
        self.build()
        self.root.after(50, self.pump)

    def colours(self):
        a = settings().get("appearance") or {}
        dark = a.get("theme") != "light"
        return {
            "accent": a.get("accent") or "#c96442",
            "bg": a.get("panel") or ("#30302e" if dark else "#ffffff"),
            "text": a.get("text") or ("#ecebe6" if dark else "#1f1e1d"),
            "dim": "#a6a59f" if dark else "#73726c",
            "field": "#262624" if dark else "#f5f4ef",
        }

    def build(self):
        c = self.colours()
        name = settings().get("assistant_name") or "Jarvis"
        w = self.win = tk.Toplevel(self.root)
        w.withdraw()
        w.overrideredirect(True)          # no title bar, like a system overlay
        w.attributes("-topmost", True)
        w.configure(bg=c["accent"])       # thin accent border
        card = tk.Frame(w, bg=c["bg"], padx=14, pady=12)
        card.pack(fill="both", expand=True, padx=2, pady=2)

        head = tk.Frame(card, bg=c["bg"])
        head.pack(fill="x")
        tk.Label(head, text=f"✦ {name} · ask about your screen", bg=c["bg"], fg=c["accent"],
                 font=("Segoe UI", 11, "bold")).pack(side="left")
        tk.Button(head, text="✕", command=self.hide, bg=c["bg"], fg=c["dim"], relief="flat", bd=0,
                  activebackground=c["bg"], cursor="hand2").pack(side="right")
        tk.Button(head, text="Open in app", command=self.open_app, bg=c["bg"], fg=c["dim"], relief="flat", bd=0,
                  activebackground=c["bg"], cursor="hand2").pack(side="right", padx=8)
        tk.Button(head, text="📸 New capture", command=self.recapture, bg=c["bg"], fg=c["dim"], relief="flat", bd=0,
                  activebackground=c["bg"], cursor="hand2").pack(side="right")

        body = tk.Frame(card, bg=c["bg"])
        body.pack(fill="both", expand=True, pady=(8, 8))
        self.thumb = tk.Label(body, bg=c["bg"])
        self.thumb.pack(side="left", anchor="n", padx=(0, 12))
        self.out = tk.Text(body, height=9, wrap="word", bg=c["bg"], fg=c["text"], relief="flat", bd=0,
                           font=("Segoe UI", 11), padx=0, pady=0, highlightthickness=0)
        self.out.pack(side="left", fill="both", expand=True)
        self.out.tag_configure("q", foreground=c["dim"])
        self.out.tag_configure("err", foreground="#ff8a80")

        chips = tk.Frame(card, bg=c["bg"])
        chips.pack(fill="x", pady=(0, 6))
        for label, q in (("What's this?", "What's on my screen? Explain it briefly."),
                         ("Explain the error", "There's an error or problem on my screen. What does it mean and how do I fix it?"),
                         ("Summarise", "Summarise what's on my screen in a few bullet points."),
                         ("Translate", "Translate the text on my screen into English."),
                         ("What should I reply?", "Draft a reply to the message on my screen in my usual style.")):
            tk.Button(chips, text=label, command=lambda q=q: self.ask(q), bg=c["field"], fg=c["text"], relief="flat",
                      bd=0, padx=8, pady=3, cursor="hand2", activebackground=c["accent"]).pack(side="left", padx=(0, 6))

        row = tk.Frame(card, bg=c["field"])
        row.pack(fill="x")
        self.entry = tk.Entry(row, bg=c["field"], fg=c["text"], insertbackground=c["text"], relief="flat",
                              font=("Segoe UI", 12), bd=8)
        self.entry.pack(side="left", fill="x", expand=True)
        self.entry.bind("<Return>", lambda e: self.ask(self.entry.get()))
        tk.Button(row, text="Ask", command=lambda: self.ask(self.entry.get()), bg=c["accent"], fg="#fff",
                  relief="flat", bd=0, padx=14, cursor="hand2").pack(side="right", fill="y")
        for widget in (w, self.entry, self.out):
            widget.bind("<Escape>", lambda e: self.hide())

    # Called from the gesture/hotkey threads: hand over to the Tk thread
    def trigger(self, x=None, y=None):
        self.events.put(("show", x, y))

    def pump(self):
        try:
            while True:
                kind, *args = self.events.get_nowait()
                if kind == "show":
                    self.show(*args)
                elif kind == "text":
                    self.out.insert("end", args[0], args[1] if len(args) > 1 else ())
                    self.out.see("end")
                elif kind == "done":
                    self.busy = False
        except queue.Empty:
            pass
        self.root.after(50, self.pump)

    def show(self, x=None, y=None):
        if x is None:
            x, y = mouse.Controller().position
        if self.win.winfo_viewable():
            self.win.withdraw()
            self.root.update()
            time.sleep(0.15)   # don't photograph our own window
        img, self.image_b64, mon = capture(x, y)
        self.chat_id = None
        small = img.copy()
        small.thumbnail((220, 150))
        self.photo = ImageTk.PhotoImage(small)
        self.thumb.configure(image=self.photo)
        self.out.delete("1.0", "end")
        self.out.insert("end", "Ask anything about what's on your screen…", "q")
        width = min(760, mon["width"] - 40)
        height = 330
        left = mon["left"] + (mon["width"] - width) // 2
        top = mon["top"] + mon["height"] - height - 70
        self.win.geometry(f"{width}x{height}+{left}+{top}")
        self.win.deiconify()
        self.win.lift()
        self.win.focus_force()
        self.entry.focus_set()
        # borderless windows sometimes miss the first focus request; ask again once it's on screen
        self.win.after(150, lambda: (self.win.focus_force(), self.entry.focus_force()))

    def recapture(self):
        self.show()

    def hide(self):
        self.win.withdraw()

    def open_app(self):
        webbrowser.open(SERVER + (f"/#chat={self.chat_id}" if self.chat_id else "/"))
        self.hide()

    def ask(self, question):
        question = question.strip()
        if not question or self.busy:
            return
        self.entry.delete(0, "end")
        if not self.chat_id:
            self.out.delete("1.0", "end")
        self.out.insert("end", ("\n\n" if self.chat_id else "") + "› " + question + "\n", "q")
        self.busy = True
        threading.Thread(target=self.stream, args=(question,), daemon=True).start()

    def stream(self, question):
        say = lambda text, tag=(): self.events.put(("text", text, tag))
        try:
            model = settings().get("lens_model") or "auto"
            if model == "auto":
                model = json.loads(call("/api/lens_model").read())["model"]
            if not model:
                say("No AI model that can see images is set up. Install one (ollama pull qwen3-vl:8b) or add a "
                    "Claude/Gemini/OpenAI key in the app's Settings.", "err")
                return
            message = {"content": question}
            if self.image_b64 and not self.chat_id:
                message["images"] = [self.image_b64]
            with call("/api/chat", {"chat_id": self.chat_id, "model": model, "message": message}) as resp:
                for line in resp:
                    if not line.strip():
                        continue
                    ev = json.loads(line)
                    if ev["type"] == "chat":
                        self.chat_id = ev["id"]
                    elif ev["type"] == "text":
                        say(ev["delta"].replace("**", ""))
                    elif ev["type"] == "error":
                        say("\n⚠ " + ev["message"], "err")
            call("/api/memory/learn", {"chat_id": self.chat_id, "model": model}).read()
        except urllib.error.URLError:
            say("Can't reach Elliot AI. Start it first (Start Elliot AI.bat).", "err")
        except Exception as e:
            say(f"\n⚠ {e}", "err")
        finally:
            self.events.put(("done",))


def main():
    try:   # only one Lens at a time (the launcher may start it again)
        lock = socket.socket()
        lock.bind(("127.0.0.1", 8766))
    except OSError:
        print("Jarvis Lens is already running.")
        return
    s = settings()
    lens = Lens()
    hotkey = s.get("lens_hotkey") or "<ctrl>+<alt>+<space>"
    keyboard.GlobalHotKeys({hotkey: lens.trigger}).start()
    if s.get("lens_swipe", True):
        swipe = SwipeDetector(lens.trigger)
        mouse.Listener(on_move=swipe.move).start()
    threading.Thread(target=screen_recorder, daemon=True).start()
    print(f"Jarvis Lens is running: swipe up from the bottom of the screen or press {hotkey}. Ctrl+C to quit.")
    if "--show" in sys.argv:
        lens.trigger()
    try:
        lens.root.mainloop()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
