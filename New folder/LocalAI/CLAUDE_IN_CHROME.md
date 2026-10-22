# Let Claude in Chrome set up Friday for you

Claude in Chrome works inside your own Chrome on the PC, signed in as you, so it can do the web-page parts of Friday's setup for you.

**First, on the PC (by hand, about 5 minutes):**
1. Run `setup-windows.ps1` once (README step 2), then start Friday with **Start Elliot AI.bat**.
2. Start Jarvis with `New folder\Jarvis\start_station.bat` (if you use Jarvis).
3. Load Friday's Chrome extension: `chrome://extensions` → **Developer mode** → **Load unpacked** → choose the `LocalAI\chrome-extension` folder. Claude in Chrome isn't allowed to touch `chrome://` pages or other extensions, so this step is yours.

Then open Claude in Chrome and paste the prompt below. It asks you before anything that costs money and never types your passwords, so stay nearby for sign-ins.

---

```text
You're setting up "Friday", my personal AI app, which runs on this PC. Work through these steps in order, each in a new tab.
After each step, tell me in one line what you did. Stop and ask me before buying anything, entering payment details,
or changing anything not listed here. Never type my passwords: if a site needs me to sign in, ask me to do it.

1. FRIDAY IS RUNNING
   Open http://localhost:8765. If it doesn't load, stop and tell me to run "Start Elliot AI.bat".

2. MY DETAILS AND STYLE
   In Friday, open "⚙ Settings, keys & Chrome". Ask me what Friday should call me, and set "Your name" to my answer.
   Keep "Assistant's name" as Friday and the personality as the butler. Ask me whether I have any custom instructions,
   and add them if I do. Click Save.

3. OFFLINE BRAINS (free, private)
   In Friday's Settings, click "🧠 AI brains" (top right of the Settings window).
   Ask me how much RAM this PC has, then download the recommended brains that fit: one chat model, one that can see
   images (e.g. qwen3-vl), and a small fast one. Downloads take a while; carry on with the next steps meanwhile, and
   check back at the end.

4. CLOUD BRAINS (optional, ask me first)
   Ask me which of these I want: Claude, ChatGPT, Gemini (Gemini also gives images and video).
   For each one I say yes to, open its key page, let me sign in, create an API key named "Friday", and paste it into
   the matching box in Friday's Settings, then Save:
   - Gemini: https://aistudio.google.com/apikey (free tier)
   - Claude: https://console.anthropic.com/settings/keys
   - ChatGPT: https://platform.openai.com/api-keys
   Don't add billing or payment details. If a site asks for them, stop and tell me.

5. PHONE ACCESS AND AWAY FROM HOME
   In Friday's Settings → "📱 Friday on your phone": tick "Allow my phone to connect over Wi-Fi" and Save.
   Tell me to restart Friday (close it and run "Start Elliot AI.bat" again), and wait until I say it's done.
   If the Settings page says Tailscale isn't installed, tell me to install it from https://tailscale.com/download on
   the PC and my phone, signed in to the same account. Wait for me.
   Then open https://login.tailscale.com/admin/dns, let me sign in, and turn on "MagicDNS" and "HTTPS Certificates"
   (enable them if they're off; don't change anything else).
   Back in Friday's Settings, click "Turn on the secure https address". Read me the 100.x address and the https
   address it shows, plus the pairing code, so I can type them into the Friday phone app.

6. JARVIS (skip if http://localhost:8780 doesn't load)
   In Friday's Settings → "🏠 Jarvis, your home base": make sure "Link Friday to Jarvis" is ticked and that it says
   "✓ Connected to Jarvis". Copy Friday's pairing code from "Friday in Chrome" in the same Settings.
   Open http://localhost:8780. If it asks for a PIN, ask me for the 6-digit PIN shown in the Jarvis window on the PC.
   Go to PC → Friday, paste Friday's pairing code, and turn on the Friday link (and "Think with Friday's brains" if I
   want Jarvis to use the same brains). Save.
   In Jarvis → PC → Switches, check "Screen memory" is on. Then in Friday's Settings, check "🎞 Screen memory /
   Remember my screen" is OFF (Jarvis keeps the screen history, so there's no need for two).
   Ask me which form helper I want in Chrome: Friday's ("I've got this, sir" card) or Jarvis Assist. Tell me which
   extension to remove at chrome://extensions (you can't do that part yourself).

7. TEACH FRIDAY ABOUT ME
   Ask me 8 short questions, one at a time: my full name and how I like to be addressed, my email and phone (for
   forms; optional), my town/city, my work or studies, people who matter to me, things I like, things I dislike,
   and my goals this year. In Friday, open "🧠 Memory: what I know about you" (bottom left), and add each answer as
   its own memory: type it in the box, pick the category, and click Add. Skip anything I don't want to share. Never store passwords, card numbers or ID numbers.

8. TEST IT
   Back in Friday, start a new chat and check each of these works, telling me the result:
   - "Hello Friday, what do you know about me?" (should mention my memories)
   - Turn on 🛠 Tools and ask: "What was I doing on my PC an hour ago?" (needs Jarvis's screen memory to have been
     on for a while; if there's nothing yet, that's fine)
   - If I added Gemini: switch to image mode and ask for "a small logo for Maillard AI"
   - Check the brain downloads from step 3 have finished.
   Finally, give me a short summary: what's set up, the phone addresses and pairing code, and anything left for me to do.
```

---

**What Claude in Chrome can't do here:** install programs (Ollama, Tailscale, Python), load or remove Chrome extensions, change Windows settings, or set up your phone. It will tell you when one of those is needed.

**Shorter jobs to give it later** (paste one at a time):
- `Open http://localhost:8765 → ⚙ Settings → 🧠 AI brains, and download the newest recommended offline brain that fits 16 GB of RAM.`
- `Open Friday at http://localhost:8765 → Memory, and tidy it: merge duplicates and fix the categories. Ask me before deleting anything.`
- `Open https://login.tailscale.com/admin/machines and tell me whether my PC and phone are both connected.`
