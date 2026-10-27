"""
Friday Lens: ask about whatever is on your screen, like Gemini's screen feature.

Swipe up from the bottom edge of the screen (a quick upward flick of the mouse,
touchpad or finger that starts at the very bottom), or press Ctrl+Alt+Space.
Friday takes a screenshot of the screen you're on and a bar pops up at the
bottom where you can ask about it. Esc hides it.

Runs alongside the Elliot AI app (it talks to http://localhost:8765) and uses
the same chats, memory and models.

    pythonw friday_lens.py        (Windows, no console window)
    python3 friday_lens.py        (Mac / Linux)

Needs: pip install pynput mss pillow
"""

import base64
import io
import json
import os
import queue
import socket
import subprocess
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
                                          "X-Friday-Token": settings().get("chrome_token", "")})
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


# ── Watching for moments you'd like help ────────────────────────────────

OFFER_COOLDOWN = 600    # at most one offer every 10 minutes


def screen_watcher(lens):
    """When "Watch my screen" is on, glance at the screen whenever it changes and ask the watching model
    (offline by default) whether you'd welcome help: a form, an error, or being stuck."""
    last, quiet_until = None, 0.0
    while True:
        s = settings()
        every = max(10, int(s.get("screen_watch_every") or 20))
        if s.get("screen_watch") and time.time() >= quiet_until and not lens.busy_on_screen():
            try:
                x, y = mouse.Controller().position
                img, b64, mon = capture(x, y)
                sig = img.resize((48, 27)).convert("L").tobytes()
                if last is None or sum(abs(a - b) for a, b in zip(sig, last)) > 48 * 27 * 3:
                    last = sig
                    small = img.copy()
                    small.thumbnail((1024, 1024))
                    buf = io.BytesIO()
                    small.save(buf, "JPEG", quality=70)
                    r = json.loads(call("/api/screen_check", {"image": base64.b64encode(buf.getvalue()).decode()}).read())
                    if r.get("help"):
                        quiet_until = time.time() + OFFER_COOLDOWN
                        lens.events.put(("offer", r.get("message") or "I can help with this.", (img, b64, mon)))
                    elif r.get("error"):
                        print("screen watch:", r["error"])
                        quiet_until = time.time() + OFFER_COOLDOWN
            except Exception as e:
                print("screen watch:", e)
        time.sleep(every)


# ── The pop-up bar ───────────────────────────────────────────────────────

class Lens:
    def __init__(self):
        self.root = tk.Tk()
        self.root.withdraw()
        self.root.title("Friday Lens")
        self.events = queue.Queue()
        self.chat_id = None
        self.image_b64 = None
        self.busy = False
        self.showing = False      # read by the watcher thread
        self.offer_parts = []     # the notification card
        self.edges = []           # the glowing screen edges
        self.full_img = None      # last full capture (for "Select area")
        self.mon = None
        self.answer = ""          # the latest reply, for Copy / Read aloud
        self.cancel = False
        self.copy_when_done = False
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
        name = settings().get("assistant_name") or "Friday"
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
        tk.Button(head, text="✂ Select area", command=self.select_area, bg=c["bg"], fg=c["accent"], relief="flat", bd=0,
                  activebackground=c["bg"], cursor="hand2").pack(side="right", padx=8)
        # borderless window: drag it by its header
        head.bind("<ButtonPress-1>", lambda e: setattr(self, "_drag", (e.x_root - w.winfo_x(), e.y_root - w.winfo_y())))
        head.bind("<B1-Motion>", lambda e: w.geometry(f"+{e.x_root - self._drag[0]}+{e.y_root - self._drag[1]}"))

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
                         ("What should I reply?", "Draft a reply to the message on my screen in my usual style."),
                         ("Next step", "What should I do next here? Give me short numbered steps."),
                         ("Copy text", "COPY")):
            tk.Button(chips, text=label, command=lambda q=q: self.ask(q), bg=c["field"], fg=c["text"], relief="flat",
                      bd=0, padx=8, pady=3, cursor="hand2", activebackground=c["accent"]).pack(side="left", padx=(0, 6))
        acts = tk.Frame(card, bg=c["bg"])
        acts.pack(fill="x", pady=(0, 6))
        for label, fn in (("⧉ Copy answer", self.copy_answer), ("🔊 Read aloud", self.read_aloud), ("■ Stop", self.stop)):
            tk.Button(acts, text=label, command=fn, bg=c["bg"], fg=c["dim"], relief="flat", bd=0, padx=4,
                      cursor="hand2", activebackground=c["bg"]).pack(side="left", padx=(0, 10))

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
                    if self.copy_when_done:
                        self.copy_when_done = False
                        self.copy_answer()
                elif kind == "offer":
                    self.offer(*args)
        except queue.Empty:
            pass
        self.root.after(50, self.pump)

    def busy_on_screen(self):
        return self.showing or bool(self.offer_parts)

    def show(self, x=None, y=None, preset=None, question=None):
        self.close_offer()
        if preset:
            img, self.image_b64, mon = preset
        else:
            if x is None:
                x, y = mouse.Controller().position
            if self.win.winfo_viewable():
                self.win.withdraw()
                self.root.update()
                time.sleep(0.15)   # don't photograph our own window
            img, self.image_b64, mon = capture(x, y)
        self.chat_id = None
        self.full_img, self.mon = img, mon
        small = img.copy()
        small.thumbnail((220, 150))
        self.photo = ImageTk.PhotoImage(small)
        self.thumb.configure(image=self.photo)
        self.out.delete("1.0", "end")
        self.out.insert("end", "Ask anything about what's on your screen…", "q")
        width = min(760, mon["width"] - 40)
        height = 370
        left = mon["left"] + (mon["width"] - width) // 2
        top = mon["top"] + mon["height"] - height - 70
        self.win.geometry(f"{width}x{height}+{left}+{top}")
        self.win.deiconify()
        self.win.lift()
        self.win.focus_force()
        self.entry.focus_set()
        # borderless windows sometimes miss the first focus request; ask again once it's on screen
        self.win.after(150, lambda: (self.win.focus_force(), self.entry.focus_force()))
        self.showing = True
        if question:
            self.ask(question)

    # ── "Sir, I've got this": the offer in the corner, with the screen edges glowing ──

    def offer(self, message, preset):
        if self.showing:
            return
        self.close_offer()
        c, (_, _, mon) = self.colours(), preset
        name = settings().get("assistant_name") or "Friday"
        for gx, gy, gw, gh in ((0, 0, mon["width"], 6), (0, mon["height"] - 6, mon["width"], 6),
                               (0, 0, 6, mon["height"]), (mon["width"] - 6, 0, 6, mon["height"])):
            edge = tk.Toplevel(self.root)
            edge.overrideredirect(True)
            edge.attributes("-topmost", True)
            try:
                edge.attributes("-alpha", 0.85)
            except tk.TclError:
                pass
            edge.configure(bg=c["accent"])
            edge.geometry(f"{gw}x{gh}+{mon['left'] + gx}+{mon['top'] + gy}")
            self.edges.append(edge)
        t = tk.Toplevel(self.root)
        t.overrideredirect(True)
        t.attributes("-topmost", True)
        t.configure(bg=c["accent"])
        card = tk.Frame(t, bg=c["bg"], padx=14, pady=12)
        card.pack(fill="both", expand=True, padx=2, pady=2)
        tk.Label(card, text=f"✦ {name}", bg=c["bg"], fg=c["accent"], font=("Segoe UI", 11, "bold")).pack(anchor="w")
        tk.Label(card, text=message, bg=c["bg"], fg=c["text"], font=("Segoe UI", 11), wraplength=330,
                 justify="left").pack(anchor="w", pady=(4, 10))
        row = tk.Frame(card, bg=c["bg"])
        row.pack(anchor="w")
        question = (f"You noticed: \"{message}\" Help me with what's on my screen. If it's a form, tell me exactly what "
                    "to put in each field using what you know about me, and list anything you still need from me. "
                    "If it's an error, explain it simply and give the fix step by step.")
        for label, cmd, primary in (("Help me", lambda: self.show(preset=preset, question=question), True),
                                    ("Not now", self.close_offer, False),
                                    ("Stop watching", self.stop_watching, False)):
            tk.Button(row, text=label, command=cmd, relief="flat", bd=0, padx=10, pady=4, cursor="hand2",
                      bg=c["accent"] if primary else c["field"], fg="#fff" if primary else c["text"]).pack(side="left", padx=(0, 6))
        t.update_idletasks()
        w, h = 380, t.winfo_reqheight()
        t.geometry(f"{w}x{h}+{mon['left'] + mon['width'] - w - 24}+{mon['top'] + mon['height'] - h - 70}")
        self.offer_parts.append(t)
        self.root.after(30000, self.close_offer)        # don't linger if you're busy
        self.root.after(6000, self.dim_edges)            # the glow is a nudge, not a frame

    def dim_edges(self):
        for edge in self.edges:
            try:
                edge.destroy()
            except tk.TclError:
                pass
        self.edges = []

    def close_offer(self):
        self.dim_edges()
        for part in self.offer_parts:
            try:
                part.destroy()
            except tk.TclError:
                pass
        self.offer_parts = []

    def stop_watching(self):
        self.close_offer()
        threading.Thread(target=lambda: call("/api/settings", {"screen_watch": False}).read(), daemon=True).start()

    def recapture(self):
        self.show()

    def hide(self):
        self.win.withdraw()
        self.showing = False

    def open_app(self):
        webbrowser.open(SERVER + (f"/#chat={self.chat_id}" if self.chat_id else "/"))
        self.hide()

    # ── "Select area": drag a box around just the part you mean (like Circle to Search) ──
    def select_area(self):
        if self.full_img is None or self.mon is None:
            return
        mon, img = self.mon, self.full_img
        self.win.withdraw()
        ov = tk.Toplevel(self.root)
        ov.overrideredirect(True)
        ov.attributes("-topmost", True)
        ov.geometry(f"{mon['width']}x{mon['height']}+{mon['left']}+{mon['top']}")
        cv = tk.Canvas(ov, highlightthickness=0, cursor="crosshair", bg="black")
        cv.pack(fill="both", expand=True)
        shown = img.resize((mon["width"], mon["height"]))
        dim = Image.blend(shown, Image.new("RGB", shown.size, (0, 0, 0)), 0.45)
        self._ov_photo = ImageTk.PhotoImage(dim)
        cv.create_image(0, 0, image=self._ov_photo, anchor="nw")
        cv.create_text(mon["width"] // 2, 40, text="Drag around what you want to ask about  ·  Esc to cancel",
                       fill="white", font=("Segoe UI", 14, "bold"))
        accent = self.colours()["accent"]
        st = {}

        def down(e):
            st["x0"], st["y0"] = e.x, e.y
            st["r"] = cv.create_rectangle(e.x, e.y, e.x, e.y, outline=accent, width=3)

        def drag(e):
            if "r" in st:
                cv.coords(st["r"], st["x0"], st["y0"], e.x, e.y)

        def up(e):
            ov.destroy()
            x0, x1 = sorted((st.get("x0", 0), e.x))
            y0, y1 = sorted((st.get("y0", 0), e.y))
            if x1 - x0 < 8 or y1 - y0 < 8:      # a click, not a box: keep the whole screen
                self.win.deiconify()
                return
            sx, sy = img.width / mon["width"], img.height / mon["height"]
            crop = img.crop((int(x0 * sx), int(y0 * sy), int(x1 * sx), int(y1 * sy)))
            buf = io.BytesIO()
            crop.save(buf, "JPEG", quality=90)
            self.show(preset=(crop, base64.b64encode(buf.getvalue()).decode(), mon))
            self.full_img = img                  # so you can pick another area from the same screen

        cv.bind("<ButtonPress-1>", down)
        cv.bind("<B1-Motion>", drag)
        cv.bind("<ButtonRelease-1>", up)
        ov.bind("<Escape>", lambda e: (ov.destroy(), self.win.deiconify()))
        ov.focus_force()

    def copy_answer(self):
        if self.answer.strip():
            self.root.clipboard_clear()
            self.root.clipboard_append(self.answer.strip())
            self.out.insert("end", "\n✓ Copied", "q")

    def read_aloud(self):
        text = self.answer.strip()[:3000]
        if not text:
            return
        ps = ("Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
              "$s.Speak([Console]::In.ReadToEnd())")
        try:
            p = subprocess.Popen(["powershell", "-NoProfile", "-Command", ps], stdin=subprocess.PIPE,
                                 creationflags=0x08000000)
            p.stdin.write(text.encode("utf-8", "replace"))
            p.stdin.close()
        except OSError:
            pass

    def stop(self):
        self.cancel = True

    def ask(self, question):
        question = question.strip()
        if question == "COPY":    # "Copy text": read every word on screen and put it on the clipboard
            self.copy_when_done = True
            question = "Write out all the text in this image exactly as it appears. Output only the text."
        if not question or self.busy:
            return
        self.entry.delete(0, "end")
        if not self.chat_id:
            self.out.delete("1.0", "end")
        self.out.insert("end", ("\n\n" if self.chat_id else "") + "› " + question + "\n", "q")
        self.busy = True
        self.answer = ""
        self.cancel = False
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
                        if self.cancel:
                            say("\n■ Stopped", "q")
                            break
                        self.answer += ev["delta"]
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
        print("Friday Lens is already running.")
        return
    s = settings()
    lens = Lens()
    hotkey = s.get("lens_hotkey") or "<ctrl>+<alt>+<space>"
    keyboard.GlobalHotKeys({hotkey: lens.trigger}).start()
    if s.get("lens_swipe", True):
        swipe = SwipeDetector(lens.trigger)
        mouse.Listener(on_move=swipe.move).start()
    threading.Thread(target=screen_recorder, daemon=True).start()
    threading.Thread(target=screen_watcher, args=(lens,), daemon=True).start()
    print(f"Friday Lens is running: swipe up from the bottom of the screen or press {hotkey}. Ctrl+C to quit.")
    if "--show" in sys.argv:
        lens.trigger()
    try:
        lens.root.mainloop()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
