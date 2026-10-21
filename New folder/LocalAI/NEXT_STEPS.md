# Jarvis: what's built, and what's next

This file is the hand-over. Give it to whoever continues the work (Claude Code on a local model, a new Claude chat, or a developer) and work through it one item at a time.

## How to continue for free (Claude Code + Ollama)

1. Run `setup-windows.ps1` once (it installs Ollama, Claude Code and a coding model).
2. In PowerShell: `cd "New folder"` then `& ".\LocalAI\start-claude-local.ps1"`.
3. Paste one task from the list below, e.g. *"Read LocalAI/NEXT_STEPS.md and do task 1. Run the app afterwards to check it works."*

Be realistic: local models are much weaker at building software than Claude. Give them one small task at a time, test after each, and keep the commits small (`git add -A && git commit -m "…"`). For the bigger tasks, a Claude chat or a developer will be faster.

## Map of the code

| Part | Where | What it does |
|---|---|---|
| App server | `LocalAI/app/server.py` | Python, standard library. Every HTTP route, chats, tools, memory, settings, the `/v1` brain hub |
| Brains | `LocalAI/app/providers.py` | Ollama, Claude (Anthropic SDK), ChatGPT/Gemini/any OpenAI-compatible service (OpenAI SDK) |
| App page | `LocalAI/app/index.html` | The whole web interface (one file) |
| Memory | `LocalAI/app/memory.py` | Long-term memory store and auto-learning |
| File organizer | `LocalAI/app/organizer.py` | Sort folders by AI / type / date |
| Jarvis Lens (PC) | `LocalAI/app/jarvis_lens.py` | Swipe-up / Ctrl+Alt+Space screen questions; screen memory recorder |
| Chrome | `LocalAI/chrome-extension/` | Side panel (`sidepanel.js`), form helper on every page (`content.js`), `background.js` |
| Android | `LocalAI/android/` | Digital-assistant app; GitHub Actions builds `Jarvis.apk` (`.github/workflows/android.yml`) |

Every `/api/*` and `/v1/*` call needs the pairing code (header `X-Jarvis-Token`, or `Authorization: Bearer`).

## Done

- Chat with any brain (offline or API key); brain tab with summaries; download offline brains; add any OpenAI-compatible service
- Memory that learns what you like; recall past chats; Projects; files, images, PDFs; artifacts; image/video generation (Gemini); research, math, app builder; file organizer
- Chrome: side panel, page reading, browse-for-me with **Autopilot**, and the **"I've got this, sir"** form helper that highlights forms and fills them from memory (never passwords, cards or submit)
- Butler personality (calls you "sir", announces each job)
- PC: Jarvis Lens (swipe up from the bottom edge), screen memory in 8-hour blocks with storage shown in Settings
- Samsung/Android: assistant app (corner swipe), connects to the PC over Wi-Fi
- Brain hub (`/v1`) for other systems

## Next tasks (in order)

1. **Watch the whole PC screen for forms, not just Chrome.** In `jarvis_lens.py`, every N seconds (setting `screen_watch`, off by default), take a small screenshot when the screen changed and ask the Lens model, briefly: "Is the user filling in a form or stuck? Reply JSON {help: bool, message}". If `help` is true, show a Windows notification ("Sir, I've got this…"), for example with `pip install win11toast`, whose button opens the Lens bar. Throttle to at most one offer per 10 minutes, and only when a cheap/local model is selected (this sends screenshots constantly).
2. **Let Lens fill forms in desktop apps.** After the user accepts, ask the model for the field values (re-use `autofill()` in `server.py` with labels read from the screenshot), then type them with `pynput.keyboard` (Tab between fields). Never type into password fields; always stop before submitting.
3. **Sign PDFs / fill PDF documents.** Add a tool `fill_pdf(path, values)` and `sign_pdf(path, page, x, y)` in `server.py` using `pypdf` (`PdfWriter.update_page_form_field_values` for form PDFs) and a saved signature image (Settings: upload `signature.png`) stamped with `pypdf` + Pillow. Save as a new file, never overwrite the original.
4. **"What was I doing at 3pm?"** Add a tool `screen_history(time)` that loads the screenshot nearest that time from `data/screen_memory/` and sends it to a vision model; return its description.
5. **Proactive help on the phone/tablet.** In the Android app, add a "Jarvis noticed" notification: a foreground service is NOT allowed to read the screen. Use the assistant session only (user swipes), or an AccessibilityService (strict Play Store rules; fine for sideloading) that detects focused form fields and posts a notification "Sir, I've got this". Same autofill endpoint.
6. **Tablet layout.** The Android sheet already works on tablets; test landscape and cap the card width at ~640dp.
7. **Away from home.** Document Tailscale setup (phone → PC) in the README, or add a cloud relay.
8. **Hook up the device-management system.** Point its AI settings at `http://<PC>:8765/v1` with the pairing code as the API key (README section 10). If it is the repo's `Jarvis/` project, change `Jarvis/core/brain_claude.py` to use the OpenAI SDK against that URL so both share brains and memory.

## Safety rules to keep

- Never enter passwords, card/bank details or one-time codes. Never press submit or buy without the user.
- Screen memory and screenshots stay on the PC unless the user chooses a cloud brain; keep it **off by default**.
- Every remote request needs the pairing code.
