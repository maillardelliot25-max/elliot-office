"""
God Station — "Hey Jarvis" voice
=================================
Talk to Jarvis hands-free on the PC, like Siri:

    "Hey Jarvis, open YouTube"        → does it, says "Opened YouTube"
    "Jarvis"  …  "what's on my calendar?"   (say his name, wait for "Yes, sir?")
    "Hey Jarvis, shut down the PC"    → "Shut down PC. Shall I go ahead? Say yes or no."

Everything runs on this PC, offline:
- listening: Vosk speech recognition (free, ~40 MB model, downloaded once)
- speaking: the voices built into Windows (SAPI, via pyttsx3)
Audio is never saved. Only what you ask Jarvis is kept, like a chat.
Off until you switch it on: app → PC → Switches → "Hey Jarvis voice".
"""

import asyncio
import io
import json
import logging
import queue
import re
import threading
import time
import zipfile
from pathlib import Path

logger = logging.getLogger("jarvis.station.voice")

MODEL_URL = "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip"
SAMPLE_RATE = 16000
FOLLOW_UP_SECONDS = 8      # after "Jarvis" alone, how long to wait for the request
CONFIRM_SECONDS = 15       # how long a "Shall I go ahead?" stays open
SPEAK_MAX_CHARS = 450

YES = re.compile(r"^(?:yes|yeah|yep|sure|do it|go ahead|confirm|okay|ok|please do)\b")
NO = re.compile(r"^(?:no|nope|cancel|stop|don't|do not|never mind|nevermind)\b")


def split_wake(text: str, wake: str = "jarvis") -> str | None:
    """'hey jarvis open youtube' → 'open youtube'; 'jarvis' → ''; no wake word → None."""
    t = text.lower().strip()
    m = re.search(rf"\b(?:(?:hey|hi|ok|okay|yo)\s+)?{re.escape(wake.lower())}\b[\s,.!?]*(.*)$", t)
    if not m:
        return None
    return m.group(1).strip()


def speakable(text: str) -> str:
    """Strip markdown, emoji and links so the voice reads naturally."""
    t = re.sub(r"https?://\S+", "a link", text)
    t = re.sub(r"[*_`#>|~]", "", t)
    t = re.sub(r"[^\w\s.,!?;:'\"()%$£€+\-/@&]", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    if len(t) > SPEAK_MAX_CHARS:
        t = t[:SPEAK_MAX_CHARS].rsplit(" ", 1)[0] + "… The rest is in the app, sir."
    return t


# ── The real microphone and voice (Windows) ─────────────────────────────────

def ensure_model(folder: Path, url: str = MODEL_URL) -> Path:
    """Download the free offline speech model once (~40 MB)."""
    folder.mkdir(parents=True, exist_ok=True)
    found = [p for p in folder.iterdir() if p.is_dir() and (p / "am").exists()] if folder.exists() else []
    if found:
        return found[0]
    import httpx
    logger.info("[VOICE] Downloading the offline speech model (one time, ~40 MB)…")
    with httpx.Client(timeout=300, follow_redirects=True) as c:
        r = c.get(url)
        r.raise_for_status()
    zipfile.ZipFile(io.BytesIO(r.content)).extractall(folder)
    found = [p for p in folder.iterdir() if p.is_dir() and (p / "am").exists()]
    if not found:
        raise RuntimeError("The speech model download didn't contain a model")
    return found[0]


def vosk_listener(model_dir: Path, is_paused, should_stop):
    """Yields what you said, one sentence at a time. Nothing is recorded to disk."""
    import sounddevice as sd
    import vosk
    vosk.SetLogLevel(-1)
    rec = vosk.KaldiRecognizer(vosk.Model(str(model_dir)), SAMPLE_RATE)
    audio: queue.Queue = queue.Queue(maxsize=50)

    def on_audio(data, frames, when, status):
        if not is_paused():           # don't listen to Jarvis's own voice
            try:
                audio.put_nowait(bytes(data))
            except queue.Full:
                pass

    with sd.RawInputStream(samplerate=SAMPLE_RATE, blocksize=8000, dtype="int16", channels=1, callback=on_audio):
        was_paused = False
        while not should_stop():
            if is_paused():
                was_paused = True
                time.sleep(0.05)
                continue
            if was_paused:
                rec.Reset()
                was_paused = False
            try:
                chunk = audio.get(timeout=0.5)
            except queue.Empty:
                continue
            if rec.AcceptWaveform(chunk):
                text = json.loads(rec.Result()).get("text", "").strip()
                if text:
                    yield text


def windows_speak(text: str, rate: int = 185):
    """Say it out loud with a built-in Windows voice (prefers an English male voice, like Jarvis)."""
    import pyttsx3
    engine = pyttsx3.init()
    try:
        voices = engine.getProperty("voices") or []
        for wanted in ("george", "ryan", "en-gb", "david", "mark"):
            v = next((v for v in voices if wanted in (v.name + v.id).lower()), None)
            if v:
                engine.setProperty("voice", v.id)
                break
        engine.setProperty("rate", rate)
        engine.say(text)
        engine.runAndWait()
    finally:
        engine.stop()


# ── The assistant ────────────────────────────────────────────────────────────

class VoiceAssistant:
    """
    handle(command) -> awaitable chat result (the same brain as the app and Telegram)
    run_confirmed(action) -> result of an action you said "yes" to
    listen(model_dir, is_paused, should_stop) -> iterator of sentences
    speak(text)
    """

    def __init__(self, handle, run_confirmed, settings, data_dir: Path,
                 listen=vosk_listener, speak=windows_speak, model=ensure_model):
        self.handle, self.run_confirmed, self.settings = handle, run_confirmed, settings
        self.model_folder = Path(data_dir) / "voice"
        self.listen, self.speak_fn, self.model = listen, speak, model
        self.loop: asyncio.AbstractEventLoop | None = None
        self.thread: threading.Thread | None = None
        self._stop = threading.Event()
        self.speaking = False
        self.state = "off"
        self.last_heard = ""
        self.last_reply = ""
        self.awaiting_until = 0.0
        self.pending: dict | None = None
        self.pending_until = 0.0

    # lifecycle
    def start(self, loop: asyncio.AbstractEventLoop):
        self.loop = loop
        self.thread = threading.Thread(target=self._run, name="jarvis-voice", daemon=True)
        self.thread.start()

    def stop(self):
        self._stop.set()

    def status(self) -> dict:
        return {"enabled": self.settings["voice"], "state": self.state, "wake_word": self.settings["voice_wake"],
                "last_heard": self.last_heard, "last_reply": self.last_reply}

    def _should_stop(self) -> bool:
        return self._stop.is_set() or not self.settings["voice"]

    def _run(self):
        while not self._stop.is_set():
            if not self.settings["voice"]:
                self.state = "off"
                time.sleep(1)
                continue
            try:
                self.state = "getting ready (first time: downloading the speech model)…"
                model_dir = self.model(self.model_folder)
                self.state = f"listening for “{self.settings['voice_wake']}”"
                for text in self.listen(model_dir, lambda: self.speaking, self._should_stop):
                    self.hear(text)
                    if self._should_stop():
                        break
            except ImportError:
                self.state = "error: voice isn't installed — run install_station.bat again"
                logger.warning("[VOICE] vosk/sounddevice/pyttsx3 missing")
                self._wait(30)
            except Exception as e:
                self.state = f"error: {e}"
                logger.warning(f"[VOICE] {e}")
                self._wait(15)

    def _wait(self, seconds: float):
        end = time.monotonic() + seconds
        while time.monotonic() < end and not self._stop.is_set() and self.settings["voice"]:
            time.sleep(0.5)

    # one sentence heard
    def hear(self, text: str):
        now = time.monotonic()
        said = text.lower().strip()

        if self.pending and now < self.pending_until:
            action, self.pending = self.pending, None
            if YES.match(said):
                res = self.run_confirmed(action)
                msg = (res.get("result") or {}).get("message") if res.get("status") == "done" else res.get("error")
                return self.say(msg or ("Done, sir." if res.get("status") == "done" else "That didn't work, sir."))
            if NO.match(said):
                return self.say("Cancelled, sir.")
            # anything else: treat it as a new request below
        self.pending = None

        if now < self.awaiting_until:
            command = split_wake(said, self.settings["voice_wake"])
            command = said if command is None else command
        else:
            command = split_wake(said, self.settings["voice_wake"])
            if command is None:
                return  # not talking to Jarvis
        self.awaiting_until = 0.0
        if not command:
            self.awaiting_until = now + FOLLOW_UP_SECONDS
            return self.say("Yes, sir?")

        self.last_heard = command
        self.state = "thinking…"
        try:
            out = asyncio.run_coroutine_threadsafe(self.handle(command), self.loop).result(timeout=300)
        except Exception as e:
            logger.warning(f"[VOICE] couldn't handle “{command}”: {e}")
            return self.say("I'm sorry, sir, something went wrong.")
        finally:
            self.state = f"listening for “{self.settings['voice_wake']}”"

        reply = out.get("reply") or "Done, sir."
        ask = next((a for a in out.get("actions", []) if a.get("status") == "confirm"), None)
        if ask:
            self.pending, self.pending_until = ask["action"], time.monotonic() + CONFIRM_SECONDS
            reply = f"{ask['label']}. Shall I go ahead? Say yes or no."
        self.say(reply)

    def say(self, text: str):
        self.last_reply = text
        words = speakable(text)
        if not words:
            return
        self.speaking = True
        try:
            self.speak_fn(words)
        except Exception as e:
            logger.warning(f"[VOICE] couldn't speak: {e}")
        finally:
            time.sleep(0.3)  # let the room go quiet before listening again
            self.speaking = False
