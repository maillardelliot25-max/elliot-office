# Friday: what's built, and what's next

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
| Friday Lens (PC) | `LocalAI/app/jarvis_lens.py` | Swipe-up / Ctrl+Alt+Space screen questions; screen memory recorder |
| Chrome | `LocalAI/chrome-extension/` | Side panel (`sidepanel.js`), form helper on every page (`content.js`), `background.js` |
| Android | `LocalAI/android/` | Digital-assistant app; GitHub Actions builds `Friday.apk` (`.github/workflows/android.yml`) |

Every `/api/*` and `/v1/*` call needs the pairing code (header `X-Jarvis-Token`, or `Authorization: Bearer`).

## Done

- Chat with any brain (offline or API key); brain tab with summaries; download offline brains; add any OpenAI-compatible service
- Memory that learns what you like; recall past chats; Projects; files, images, PDFs; artifacts; image/video generation (Gemini); research, math, app builder; file organizer
- Chrome: side panel, page reading, browse-for-me with **Autopilot**, and the **"I've got this, sir"** form helper that highlights forms and fills them from memory (never passwords, cards or submit)
- Butler personality (calls you "sir", announces each job)
- PC: Friday Lens (swipe up from the bottom edge), screen memory in 8-hour blocks with storage shown in Settings, and screen watching that offers help with forms and errors anywhere on the PC
- Samsung/Android: assistant app (corner swipe), connects to the PC over Wi-Fi
- Brain hub (`/v1`) for other systems

## Next tasks (in order)

1. ✅ **Done: watch the whole PC screen.** `screen_watcher()` in `jarvis_lens.py` + `/api/screen_check` in `server.py`. Settings → Friday Lens → "Watch my screen and offer help". It checks only when the screen changes, uses an offline vision model by default, glows the screen edges and shows "Sir, I've got this" with Help me / Not now / Stop watching, at most once every 10 minutes.
2. **Let Lens fill forms in desktop apps.** After the user accepts, ask the model for the field values (re-use `autofill()` in `server.py` with labels read from the screenshot), then type them with `pynput.keyboard` (Tab between fields). Never type into password fields; always stop before submitting.
3. **Sign PDFs / fill PDF documents.** Add a tool `fill_pdf(path, values)` and `sign_pdf(path, page, x, y)` in `server.py` using `pypdf` (`PdfWriter.update_page_form_field_values` for form PDFs) and a saved signature image (Settings: upload `signature.png`) stamped with `pypdf` + Pillow. Save as a new file, never overwrite the original.
4. **"What was I doing at 3pm?"** Add a tool `screen_history(time)` that loads the screenshot nearest that time from `data/screen_memory/` and sends it to a vision model; return its description.
5. **Proactive help on the phone/tablet.** In the Android app, add a "Friday noticed" notification: a foreground service is NOT allowed to read the screen. Use the assistant session only (user swipes), or an AccessibilityService (strict Play Store rules; fine for sideloading) that detects focused form fields and posts a notification "Sir, I've got this". Same autofill endpoint.
6. **Tablet layout.** The Android sheet already works on tablets; test landscape and cap the card width at ~640dp.
7. **Away from home.** Document Tailscale setup (phone → PC) in the README, or add a cloud relay.
8. **Hook up the device-management system.** Point its AI settings at `http://<PC>:8765/v1` with the pairing code as the API key (README section 10). If it is the repo's `Jarvis/` project, change `Jarvis/core/brain_claude.py` to use the OpenAI SDK against that URL so both share brains and memory.

## Safety rules to keep

- Never enter passwords, card/bank details or one-time codes. Never press submit or buy without the user.
- Screen memory and screenshots stay on the PC unless the user chooses a cloud brain; keep it **off by default**.
- Every remote request needs the pairing code.

## Working alongside Jarvis Station / Cowork

Elliot's other project, **Jarvis God Station** (branch `claude/cross-device-home-app-epwsbl`, folder `New folder/Jarvis/`), controls the PC from the phone and is gaining an autonomous "Cowork" agent. To run both on one PC:

- **Ports:** Friday uses **8765**. Station also defaults to 8765, so start it with `STATION_PORT=8780` (in its `.env`). If the port is taken, Friday now says so and exits instead of crashing.
- **One brain:** Station/Cowork can think through Friday's OpenAI-compatible gateway at `http://localhost:8765/v1/chat/completions` (`Authorization: Bearer <pairing code>`). That gives it every brain set up in Friday: Ollama, Claude, Gemini, OpenAI and custom brains.
- **Shared memory:** `GET/POST /api/memory` (header `X-Jarvis-Token: <pairing code>`).
- **Don't run duplicates:** both have an 8-hour screen recorder and a Chrome form helper. Keep Station's Recall (it has OCR search) and leave Friday's screen memory off. Load only one of the two form-helper extensions.
