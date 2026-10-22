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
| Friday Lens (PC) | `LocalAI/app/friday_lens.py` | Swipe-up / Ctrl+Alt+Space screen questions; screen memory recorder |
| Chrome | `LocalAI/chrome-extension/` | Side panel (`sidepanel.js`), form helper on every page (`content.js`), `background.js` |
| Android | `LocalAI/android/` | Digital-assistant app; GitHub Actions builds `Friday.apk` (`.github/workflows/android.yml`) |

Every `/api/*` and `/v1/*` call needs the pairing code (header `X-Friday-Token`, or `Authorization: Bearer`).

## Done

- Chat with any brain (offline or API key); brain tab with summaries; download offline brains; add any OpenAI-compatible service
- Memory that learns what you like; recall past chats; Projects; files, images, PDFs; artifacts; image/video generation (Gemini); research, math, app builder; file organizer
- Chrome: side panel, page reading, browse-for-me with **Autopilot**, and the **"I've got this, sir"** form helper that highlights forms and fills them from memory (never passwords, cards or submit)
- Butler personality (calls you "sir", announces each job)
- PC: Friday Lens (swipe up from the bottom edge), screen memory in 8-hour blocks with storage shown in Settings, and screen watching that offers help with forms and errors anywhere on the PC
- Samsung/Android: assistant app (corner swipe), connects to the PC over Wi-Fi
- Brain hub (`/v1`) for other systems

## Next tasks (in order)

1. ✅ **Watch the whole PC screen.** `screen_watcher()` in `friday_lens.py` + `/api/screen_check`. Settings → Friday Lens → "Watch my screen and offer help".
2. ✅ **Proactive form help on the phone/tablet.** `FormHelperService.java` (an AccessibilityService the user turns on). It offers on the first focused box of a form with 2+ fillable boxes, glows the edges, shows a card (never takes focus), fills empty boxes via `/api/autofill` with `ACTION_SET_TEXT`, skips passwords/card/bank/codes, stays quiet on sign-in and payment screens, never submits. "Not in this app" mutes per app (Prefs `form_muted`).
3. ✅ **Tablet layout.** `AssistPanel.fitScreen()`: the sheet is max 640dp and centred; long answers scroll within 45% of the screen.
4. ✅ **Away from home.** README section 9: Tailscale, using `100.x.x.x:8765` or the https `….ts.net` address. `tailscale serve` requests arrive from localhost, so `guard()` treats a `*.ts.net` Host, `Tailscale-User-Login` or `X-Forwarded-For` as remote (phone access + pairing code). Settings shows both addresses (`tailscale_info()`), and its button runs `tailscale serve --bg 8765` (`/api/tailscale_serve`, PC only).
5. ✅ **"What was I doing at 3pm?" / shared brains with the device-management system.** Covered by the Jarvis link (`jarvis_link.py`, README section 11) and Jarvis using Friday's `/v1` gateway.
6. **Covered by Jarvis, not Friday:** filling desktop (non-browser) apps on the PC, and signing/filling PDFs. Jarvis has PC keyboard control and PDF sign/fill (`Jarvis/station/docs.py`). Don't duplicate them in Friday.
7. **Ideas:** let the phone panel ask Jarvis-backed questions (send `"tools": true` from `AssistPanel` once approvals can be answered from the phone); a "Friday noticed" quick-settings tile.

## Home Station (tablet dashboard)

- `New folder/Shared/shared_state.py`: the shared SQLite file (`Shared/state/shared.db`, or `FJ_SHARED_DIR`). Tables: tasks, events, metrics (24 h), processes (latest snapshot), services. Standard library only.
- `New folder/Shared/jarvis_reporter.py` (+ `start_jarvis_reporter.bat`): Jarvis's side. It samples metrics, processes and service ports every 5 s, and with `--run-jarvis` starts Jarvis Station unchanged, copies its log lines into `events` (levels from the text, tracebacks grouped) and restarts it if it crashes. Jarvis's own code isn't modified.
- `LocalAI/app/station_dashboard.py` + `station.html`: Friday's side, at `/station`, with `GET /api/station/state` and `POST /api/station/task`. It reads Jarvis's `station_data` read-only (`mode=ro`).
- **Still to do (Jarvis's session):** a task runner that executes queued tasks: `claim_next()` → work → `report(id, progress=…)`, check `still_wanted(id)` between steps, then `report(id, status="done"|"failed", result=…)`.

## Safety rules to keep

- Never enter passwords, card/bank details or one-time codes. Never press submit or buy without the user.
- Screen memory and screenshots stay on the PC unless the user chooses a cloud brain; keep it **off by default**.
- Every remote request needs the pairing code.

## Working alongside Jarvis (home base)

The split Elliot agreed: **Friday** is the everywhere AI (Chrome, Android, on the go). **Jarvis** (branch `claude/cross-device-home-app-epwsbl`, folder `New folder/Jarvis/`) is the home base: the PC, files, screen memory (Recall), management and data.

- **Ports:** Friday uses **8765**, Jarvis uses **8780**. If 8765 is taken, Friday says so and exits.
- **Duplicates:** Jarvis keeps screen memory (it has OCR search). Leave Friday's screen memory off. Elliot keeps only one of the two form-helper extensions.

**Jarvis calls Friday.** Keep these shapes stable. Jarvis sends the pairing code as `X-Jarvis-Token`, so the server must keep accepting that old header name.
- `GET /v1/models`
- `GET /api/memory` and `POST /api/memory {"text", "category": "Other"}`
- `POST /v1/chat/completions {"model", "messages", "stream": false}` (sometimes with Jarvis's own system prompt, expecting JSON `{"reply", "actions"}`)

**Friday can call Jarvis** (not wired up yet) at `http://localhost:8780` with `Authorization: Bearer <token>`. Jarvis writes the token to `Jarvis/station_data/friday.token` on startup.
- `GET /api/recall/search?q=` and `GET /api/recall/frames?limit=` (screen history)
- `GET /api/memory/search?q=` and `POST /api/memory/note {"text"}`
- `GET /api/files?path=`, `GET /api/system`, `GET /api/clipboard`
