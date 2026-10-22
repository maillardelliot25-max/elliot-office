# Elliot AI: your own all-round AI app

A Claude-style app that runs on your own computer. Choose the "brain" per chat:

- **💻 Free local models** (Ollama): private, offline, no key.
- **☁ Claude** (real Claude Opus / Sonnet / Haiku), **ChatGPT** models, and **Gemini**: add your own API keys in Settings.

On top of that it creates images and videos with **Gemini Nano Banana / Veo**, builds apps from a prompt, solves maths, and organizes your files and photos.

## Everything it can do

| Feature | How |
|---|---|
| 💬 **Chat** with saved history | Sidebar with search, rename, delete; edit any message you sent; retry, copy, stop |
| 📁 **Projects** | Group chats, give them shared instructions and knowledge files (briefs, brand guides, code) |
| 👁 **Read images** and screenshots | 📎, paste or drag one in. The app switches to the vision model automatically |
| 📄 **Read documents** | PDF, Word, PowerPoint, Excel, text, code, CSV |
| ▶ **Artifacts**: live previews | Web pages, React apps (with Tailwind), SVGs, Mermaid diagrams and documents open in a side panel. Copy, download or save them |
| 🛠 **Tools / agent mode** (like Claude Code) | Writes and edits real files, runs code, analyses data, fixes its own errors, searches the web. It asks your permission first |
| 🔎 **Research mode** | Runs many web searches, reads the sources, and writes a report with citations (Claude uses its own built-in web search) |
| 🧮 **Math mode** | Step-by-step solutions with properly typeset formulas, every calculation checked by running Python. Uses your strongest reasoning model automatically (ChatGPT first, then Claude, then Gemini) |
| 🚀 **Build app** | Describe an app and it writes a complete project in your workspace (`apps/…`), opens it running in the side panel, and lets you download it as a .zip. Ask for changes and it edits the files |
| 🗂 **Organize files & photos** | Point it at a folder (Downloads, Pictures…). The AI looks at each photo and reads each document, then sorts them into folders like Receipts, Screenshots, Family, Invoices. Or sort by type or month. You review the plan, rename folders, untick files, then Apply. **Undo** puts everything back |
| 🐍 **Python tool** | The AI can run Python for exact maths, data analysis and charts (it asks first, or you can allow it permanently) |
| 💭 **Thinking mode** | Step-by-step reasoning for hard questions |
| 🎨 **Create & edit images** | **Gemini Nano Banana 2 / Pro**: top-quality images, text in images, edit your photos. Follow-ups like "make it bluer" edit the last image. Also works with a local Stable Diffusion server |
| 🎬 **Create videos** | **Google Veo 3.1**: about 8-second clips with sound, from text or by animating an image |
| 🎤 **Voice** | Speak your messages (🎤), and have answers read aloud (🔊) |
| 🧠 **Memory that learns** | After each conversation Friday notes anything lasting it learned about you: likes, dislikes, preferences, people, work, goals. It shows "🧠 Remembered: …". It never stores passwords or card numbers. Say "remember…" or "forget…" anytime, ask "what did we decide about X last week?" (it searches past chats), or manage everything on the 🧠 Memory screen |
| 📸 **Friday Lens: ask about your screen** | Like Gemini's screen feature: **swipe up from the bottom edge of your screen** (a quick upward flick of the mouse, touchpad or finger) or press **Ctrl+Alt+Space**. Friday takes a screenshot and a bar pops up at the bottom: ask "what's this error?", "summarise this", "translate", "what should I reply?". Follow-up questions work, and **Open in app** continues the chat |
| 🧠 **Any AI brain** | Tap the brain tab (top right) to switch brains. Each one has a one-line summary and badges: 👁 sees images, 🛠 uses tools, 💭 thinks, 🔒 offline, ☁ online. **＋ Add or download a brain**: download offline models in one click with a progress bar, or add any OpenAI-compatible service (OpenRouter, Groq, Mistral, DeepSeek, xAI Grok, Together, Perplexity) or offline app (LM Studio, Jan, llama.cpp) |
| 🔌 **Brain hub for your other systems** | Your device-management AI, scripts or Friday can use every brain here, plus Friday's memory of you, through a standard OpenAI-style API (section 10) |
| 📱 **Friday on your Samsung phone** | An Android app that becomes your phone's **digital assistant** (instead of Gemini). **Swipe up from a bottom corner** (or hold the side button) in any app: Friday gets a screenshot plus the text on screen, a sheet slides up, and you ask by typing, quick buttons or 🎤 voice. Answers come from Friday on your PC, with the same models, memory and chats |
| 🎨 **Make it yours** | Settings → **Edit appearance**: themes (Claude, Midnight, Friday, Ocean, Forest, Rose, Mono), light/dark, your own colours, font, text size, roundness, chat width, and a **video or image background** with dim, blur and see-through panels. Chrome uses your colours too |
| 🙋 **"I've got this, sir"** | Start filling in a form on any website (Google Forms, sign-ups, applications): Friday highlights it and offers to fill it from what it remembers about you. It never fills passwords or card details and never presses submit. Turn it off with 🙋 in the side panel, or tap *Not on this site* |
| 👀 **Notices when you need help, anywhere on your PC** | Optional (Settings → Friday Lens). When the screen changes, Lens glances at it with an offline model. If you're filling in a form, an error appears, or you look stuck, the screen edges glow and a note pops up: *"Sir, I've got this…"* with **Help me**, **Not now** and **Stop watching**. At most once every 10 minutes |
| 🎩 **Friendly digital butler** | Friday calls you "sir" and tells you what it's about to do. Switch to a plain assistant in Settings → Personality |
| 🎞 **Screen memory** | Optional, off by default. Lens saves a screenshot when your screen changes, in 8-hour blocks on this PC, deleting old blocks automatically. Settings shows the storage used |
| 🌐 **Friday in Chrome** | Side panel on any website: summarise or explain the page, right-click selected text or an image → *Ask Friday*, draft replies. With 🖱 *Browse for me* on, Friday clicks, types, scrolls and opens pages for you, asking before each action |
| ⤓ **Export** | Save any chat as a Markdown file |

Plus **Claude Code** itself in your terminal on the same local model (`start-claude-local`), and the repo's older **Jarvis** agent (`Jarvis/` folder) running offline too.

> **Be realistic:** the app gives you what the Claude app does, but the chat "brain" is a free open-source model, not Claude itself. Claude can't be downloaded. Local models are good for everyday chat, writing and coding, but slower and weaker than Claude on hard problems. Images and videos come from Google's top models, so those *are* state of the art.

Your assistant is called **Friday** (rename it in Settings). It works in two places:
- **The app**: a full Claude-style app in your browser at http://localhost:8765.
- **Friday in Chrome**: a side panel that sits next to any website (step 6).

Both share the same chats and the same memory.

## 1. Pick models for your machine

| Your computer | Main model (chat + code + tools) | Image-reading model |
|---|---|---|
| 32 GB+ RAM, or a GPU with 24 GB | `qwen3-coder:30b` (default) | `qwen3-vl:8b` (default) |
| 16 GB RAM | `qwen3:14b` | `qwen3-vl:8b` |
| 8 GB RAM | `qwen3:8b` | `qwen3-vl:4b` |

## 2. Install (one time)

**Windows** (PowerShell):
```powershell
cd "New folder\LocalAI"
powershell -ExecutionPolicy Bypass -File .\setup-windows.ps1
# smaller PC:  ... -File .\setup-windows.ps1 -Model qwen3:8b -VisionModel qwen3-vl:4b
```
This installs Ollama, Python and Claude Code, and downloads the models. When it finishes, quit Ollama from the system tray and reopen it.

**Mac / Linux**:
```bash
cd "New folder/LocalAI"
./setup.sh                          # or: ./setup.sh qwen3:8b qwen3-vl:4b
```

## 3. Add cloud AI keys (optional)

Open **⚙ Settings, memory & keys** and paste any of these. Keys stay in `LocalAI/app/data/settings.json` on your computer. The app shows them only as `••••1234` and sends each one only to its own provider.

| Key | Unlocks | Get it at |
|---|---|---|
| Anthropic | **Claude** (Opus 5.5, Sonnet 5.5, Haiku 5.5…): the real Claude, with its own web search | https://console.anthropic.com/settings/keys |
| OpenAI | **ChatGPT** models (the newest GPT models your account has) and Math mode | https://platform.openai.com/api-keys |
| Google AI Studio | **Gemini** chat models, plus image and video generation (next step) | https://aistudio.google.com/apikey |

All three are pay-as-you-go (charged per use by each company), separate from any ChatGPT Plus or Claude Pro subscription. Set spending limits in each provider's billing page. Once a key is added, its models appear in the model dropdown, marked ☁. Local models stay free.

## 4. Turn on image & video generation (optional, 2 minutes)

1. Go to **https://aistudio.google.com/apikey**, sign in with Google, and click **Create API key**.
2. In the app, open **⚙ Settings, memory & keys** and paste the key. It stays in `LocalAI/app/data/settings.json` on your computer only.
3. Pick the image model: **Nano Banana 2** (fast, great) or **Nano Banana Pro** (best quality and text in images).

**Cost:** Google's image and video models are pay-as-you-go. Images cost a few cents each. Veo video is billed per second of video, which adds up, so the app asks before the AI makes a video on its own. Check current prices and free-tier limits at https://ai.google.dev/gemini-api/docs/pricing.

**Fully free, offline images instead:** install [Stable Diffusion WebUI Forge](https://github.com/lllyasviel/stable-diffusion-webui-forge), which needs a decent NVIDIA GPU. Start it with `--api`, then set **Image generator → Local** in Settings. The quality is lower than Nano Banana, but it's free and private.

## 5. Use it

**Start the app:** on Windows, double-click **`Start Elliot AI.bat`**. On Mac/Linux, run `./start-app.sh`. Your browser opens at http://localhost:8765.

- **💬 Chat / 🎨 Create image / 🎬 Create video / 🚀 Build app:** the tabs above the message box. In image and video mode, pick the shape (square, wide, tall).
- **🧮 Math:** turn it on next to Tools for homework, finance or engineering questions.
- **🗂 Organize files & photos:** in the sidebar. Paste a folder path, click **Scan folder**, check the plan, then **Apply**. It only sorts files directly in that folder (not sub-folders), and refuses whole drives and system folders.
- **🛠 Tools on:** ask *"Build me a landing page for Maillard AI and run it"* or *"Make me a logo"*. Files land in your workspace folder (by default `ElliotAI-Workspace` in your home folder). Generated images are also saved there, in `generated/`.
- **Projects:** use the dropdown at the top of the sidebar, then **＋ New project**.
- The model dropdown shows what each model can do: 👁 images, 🛠 tools, 💭 thinking.
- Your chats, projects and settings are saved in `LocalAI/app/data/`.

**Claude Code in the terminal:** run this from any project folder:
```powershell
& "C:\path\to\New folder\LocalAI\start-claude-local.ps1"     # Windows
```
```bash
/path/to/LocalAI/start-claude-local.sh                       # Mac/Linux
```

**Add more models anytime:** run `ollama pull <name>`. Browse models at https://ollama.com/search.

## 6. Add Friday to Chrome (2 minutes)

1. Start the app (`Start Elliot AI.bat`), open **⚙ Settings, keys & Chrome**, and copy the **pairing code**.
2. In Chrome, go to `chrome://extensions` and switch on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `New folder/LocalAI/chrome-extension` folder.
4. Pin Friday (🧩 puzzle icon → 📌), then click its **J** icon or press **Alt+J**. Paste the pairing code and click **Connect**.

Then:
- **📄 This page** (on by default): Friday reads the page you're on.
- **🖱 Browse for me**: Friday can operate the page ("find the cheapest flight on this site", "fill this form with my details"). It asks before every click, type or page change, and never types passwords or card details.
- **Right-click** selected text → *Ask Friday about…*, an image → *Ask Friday about this image*, or any page → *Summarise this page with Friday*.
- The **⤢** button opens the full app. Chats from Chrome show up there too.

The app must be running for the extension to work. Chrome doesn't let extensions read its own pages (chrome://, the Web Store), so Friday can't help there.

**Security:** every request to the app must carry the pairing code. Websites and other extensions can't use your Friday.

## 7. Friday Lens: ask about your screen

Lens starts automatically with **Start Elliot AI.bat** and runs quietly in the background.

- **Swipe up:** move the pointer (or your finger on a touchscreen) to the very bottom edge of the screen, then flick it quickly upward. Slow movements, like going to the taskbar and back, don't trigger it.
- **Or press Ctrl+Alt+Space.**
- Ask your question, or tap a quick one (*What's this? · Explain the error · Summarise · Translate · What should I reply?*). **📸 New capture** takes a fresh screenshot, **Esc** hides the bar, and **Open in app** continues in the full app.
- It needs a model that can see images. "Auto" picks the best one you have: Claude, then Gemini, then ChatGPT, then a local one like `qwen3-vl:8b`. Change it, the shortcut, or turn the swipe off in Settings → **Friday Lens**, then restart the app.
- Screenshots go to the model you chose. With a ☁ model that means the company behind it, so close anything private first or use a local model.
- On a Mac, allow Python under System Settings → Privacy & Security → **Accessibility** and **Screen Recording** the first time.

In the app, **📸** next to the message box attaches a screenshot of any screen or window. In Chrome, the side panel's **📸 What I see** asks about the current tab.

## 8. Customise the look

Settings → **🎨 Edit appearance**. Everything previews live. **Save** keeps it, **Cancel** undoes it, **Reset to default** starts over.

For a video background, use **⬆ Upload** (MP4 or WebM, up to 150 MB; short loops of 10 to 30 seconds look best) or paste a link to an .mp4. Turn **Darken** up and use **See-through panels** to keep text readable.

## 9. Friday on your Samsung phone

**On the PC:**
1. Open Friday → ⚙ **Settings** → **📱 Friday on your phone** → tick **Allow my phone to connect over Wi-Fi** → Save.
2. Close and restart the app (`Start Elliot AI.bat`). If Windows asks whether to allow Python on networks, choose **Private networks**.
3. Back in Settings, note the **PC address** (like `192.168.1.20:8765`) and the **pairing code**.

**On the phone:**
1. Install the app: open `https://github.com/maillardelliot25-max/elliot-office/releases/tag/friday-android` in the phone's browser (sign in to GitHub if asked), download **Friday.apk**, open it, and allow installing from your browser when asked. GitHub rebuilds this file whenever the app's code changes. *Already have the older phone app installed? Uninstall it first. The new version installs as a separate app.*
2. Open **Friday**, enter the PC address and pairing code, and tap **Connect**.
3. Tap **Open assistant settings** and choose Friday as the **Digital assistant app / Device assistance app**. On the same screen, turn on **Use screenshot** and **Analyse text on screen** (wording varies by phone and One UI version).
4. Pick how to open it:
   - **Swipe gestures:** Settings → Display → Navigation bar → *Swipe gestures*, then swipe up diagonally from a bottom corner.
   - **Side button:** Settings → Advanced features → Side button → *Press and hold* → *Digital assistant*.
5. Optional: tap **Allow microphone** to ask by voice with 🎤.
6. Optional, **"Sir, I've got this" form help:** tap **Open Accessibility settings** → *Installed apps* → **Friday form helper** → On.
   If Android says it's a *restricted setting*, go to Settings → Apps → Friday → ⋮ (top right) → **Allow restricted settings**, then try again.
   Now, when you start typing into a form in any app (sign-ups, applications, delivery details…), the screen edges glow and Friday offers to fill it in from what it remembers about you.
   It only fills **empty** boxes. It never touches passwords, card or bank details, ID numbers or one-time codes, it stays quiet on sign-in and payment screens, and it **never presses Send or Submit**: you check first.
   Tap **Not in this app** to silence it for one app (you can undo that on the setup screen).

**Away from home (free, private): Tailscale**
1. Install [Tailscale](https://tailscale.com/download) on the PC and on the phone, and sign in with the **same account** on both.
2. On the PC, phone access must be on (step 1 above). In the Tailscale app on the PC, copy this PC's address (`100.x.x.x`).
3. In the Friday phone app, change the PC address to `100.x.x.x:8765` and tap **Connect**. It now works on mobile data and any Wi-Fi.
4. Optional, **secure https address:** in the Tailscale admin page (login.tailscale.com → **DNS**), turn on **MagicDNS** and **HTTPS Certificates**. Then in Friday on the PC → ⚙ Settings → 📱 Friday on your phone, click **Turn on the secure https address**. Use the `https://<your-pc>.<tailnet>.ts.net` address it shows in the phone app, or open it in the phone's browser (`…ts.net/?key=<pairing code>` once). Over https the browser also allows the 🎤 mic, and Chrome can **Install app** for a home-screen icon.
Tailscale encrypts everything between your devices, and nothing is opened to the internet: only devices signed in to your Tailscale account can reach these addresses. Friday still asks every device for the pairing code. The PC must be on, with Friday running.

**Good to know:**
- The phone must be on the **same Wi-Fi as the PC** (or connected with Tailscale, above), and Friday must be running on the PC.
- Tablets work the same way. The panel stays a comfortable width in the middle of a big or sideways screen.
- Screenshots and screen text go to your PC and then to the model Friday Lens uses (Settings → Friday Lens). With a ☁ model that means the company behind it. Password fields are never read.
- Android requires an assistant to include a voice service. Friday's simply passes voice typing through to Google's or Samsung's, so voice typing elsewhere keeps working.
- To go back to Gemini, choose it again under Digital assistant app.

## 10. Use Friday as the brain hub for your other systems

Anything that can talk to an OpenAI-style API can use **every brain you've added**, with one address and one key. That includes your device-management AI, home-automation tools, scripts, and apps like n8n or Home Assistant. Your API keys stay inside Friday; other systems only ever see the pairing code.

| Setting | Value |
|---|---|
| Base URL | `http://localhost:8765/v1` (from another device: `http://<PC address>:8765/v1`, with phone access on) |
| API key | Your **pairing code** (Settings → Friday in Chrome) |
| Model | Any brain ID from `GET /v1/models`, e.g. `qwen3:8b` or `cloud:anthropic:claude-opus-5-5`, or `auto` for your default brain |

```python
from openai import OpenAI
friday = OpenAI(base_url="http://localhost:8765/v1", api_key="YOUR-PAIRING-CODE")
reply = friday.chat.completions.create(model="auto", messages=[{"role": "user", "content": "Summarise today's device alerts"}])
print(reply.choices[0].message.content)
```

If the request has no `system` message, Friday answers as itself, with your memory and custom instructions. Send your own `system` message to set a different role. Streaming (`stream=True`) and images (`image_url` data URLs) work. Tools and file actions are only available inside Friday's own apps.

## 11. Friday + Jarvis (your home base)

Friday is your everywhere AI: Chrome, phone and tablet. **Jarvis** (the `Jarvis` folder next to this one) is the home base on the PC. It keeps your screen history, files, clipboard and PC controls. They work together:

- **Run both:** Friday uses port 8765 and Jarvis uses 8780. Start each one normally.
- **Friday → Jarvis:** with Jarvis running, Friday links up by itself (⚙ Settings → **🏠 Jarvis, your home base** shows ✓). In a chat with 🛠 Tools on, ask things like:
  - *"What was I doing at 3pm?"* Friday finds that moment in Jarvis's screen history and describes it (offline, unless your chat model is ☁).
  - *"What was the price of that flight I looked at this morning?"* Friday searches the text that was on your screen.
  - *"Find my CV on the PC"*, *"How's my PC doing?"*
  - Recall also searches what you told Jarvis on any device.
- **Jarvis → Friday:** in Jarvis → PC → Friday, paste Friday's pairing code (⚙ Settings → Friday in Chrome). Jarvis can then think with any brain you've added to Friday and share memories with it.
- **One of each:** let Jarvis keep the screen history (leave Friday's **🎞 Screen memory** off), and use only one form helper in Chrome.

## 12. Let Claude in Chrome do the setup

Open [CLAUDE_IN_CHROME.md](CLAUDE_IN_CHROME.md) and paste its prompt into Claude in Chrome on your PC. It goes through Friday's setup with you: your details, offline brains, API keys, phone access, the Tailscale https address, the Jarvis link, teaching Friday about you, and a final test.

## 13. Home Station: a dashboard on your Galaxy Tab as a second screen

A full-screen dashboard for the tablet beside your PC: processor, memory, storage, power and network use, Jarvis's task queue (add, pause, cancel, retry, reprioritise), services and busiest processes, Jarvis's live activity log, and a read-only summary of Jarvis's screen memory, conversations, switches and paired devices. It runs entirely on the PC with no internet. Jarvis and Friday share one local file (`New folder/Shared/state/shared.db`).

1. **Connect the tablet as a second monitor:** connect it to the PC by USB with a second-screen app (or use Samsung **Second Screen** from the tablet's quick panel). Windows → Settings → System → Display: choose **Extend these displays**, and set the tablet's scale to **150%** (175% if text looks small).
2. **Start Jarvis with its reporter:** double-click `New folder\Shared\start_jarvis_reporter.bat`. It starts Jarvis exactly as `start_station.bat` does, so use this one instead, and feeds the dashboard. If Jarvis stops, it's restarted.
3. **Start Friday:** `Start Elliot AI.bat`.
4. **Open the dashboard:** double-click `Open Home Station.bat` (or go to `http://localhost:8765/station`). Press **Win+Shift+Right Arrow** to move the window to the tablet, then click **Full screen**.

**Offline first.** Everything above works with no internet. Anything that needs another device or the internet is saved to an outbox first (`New folder/Shared/state/sync_queue.json`) and sent when it can be:
- The reporter also runs a **network daemon** (`Shared/net_daemon.py`, or run it on its own). It checks the connection in the background with 1-second probes, so nothing ever waits on network timeouts.
- **Back online:** saved items for the internet are sent automatically. Items for this PC, home-network devices and Tailscale devices go as soon as those devices answer, even with no internet.
- **Replies** land in `sync_inbox.json`, the Activity log and, if the item came from a task, on that task. The dashboard's **Activity → Outbox** shows what's waiting, with Retry and Remove.
- **Asking a ☁ cloud brain while offline:** Friday saves the question and says so immediately. The answer arrives when the connection is back. Offline 💻 brains keep answering as normal.
- **Other programs** can save to the outbox: `POST /api/sync/queue` with `{"kind": "http", "payload": {"method", "url", "body"}, "label"}` (or `"friday_ask"` with `{"model", "prompt"}`), or `sync_outbox.enqueue(...)` in Python.

Tasks you add wait in the queue until Jarvis's task runner picks them up. Jarvis claims them with `shared_state.claim_next()`, and pausing or cancelling from the dashboard stops it at its next step (`still_wanted()`).

## What's next

See [NEXT_STEPS.md](NEXT_STEPS.md) for the hand-over: what's built, where everything lives, the next tasks in order (whole-screen form watching, filling desktop apps, signing PDFs…), and how to keep building for free with Claude Code on a local model.

## Troubleshooting

- **"Can't reach Ollama":** open the Ollama app (or run `ollama serve`).
- **Very slow:** the model is too big for your PC. Use a smaller one from the table.
- **The AI ignores tools, or forgets earlier messages:** set `OLLAMA_CONTEXT_LENGTH=65536` and restart Ollama. Also use a model with 🛠.
- **"Add your free Google AI Studio key":** see step 3.
- **Gemini error 429 or "quota":** you've hit your limit. Check billing in Google AI Studio.
- **React or diagram preview is blank:** those previews need internet, to load React or Mermaid. Web pages, SVGs and documents work offline.
- **🎤 doesn't work:** use Chrome or Edge. Voice typing uses the browser's speech service, which needs internet.
- **Chrome says "Friday isn't paired" or "can't reach Elliot AI":** make sure the app is running, then paste the pairing code again (the ⚙ Settings screen shows it).
- **Phone says "Can't reach the PC":** check that phone access is ticked **and** the app was restarted, that both devices are on the same Wi-Fi (not guest Wi-Fi), and that Windows Firewall allows Python on Private networks.
- **The phone assistant opens but has no screenshot:** turn on *Use screenshot* in the Digital assistant app settings. Some apps (banking, Netflix) block screenshots, but Friday still reads their text where allowed.
- **Swiping up does nothing:** check Lens is running (start the app with `Start Elliot AI.bat`), try Ctrl+Alt+Space, and make sure the swipe starts at the very last pixel row of the screen. If it triggers by accident, turn the swipe off in Settings and use the shortcut.
- **Background video doesn't play:** use MP4 (H.264) or WebM. iPhone .mov files often won't play in browsers, so convert them first.
- **A downloaded brain doesn't appear:** make sure the Ollama app is running, then reopen the brain tab. Big models (30 GB+) need a strong PC; start with something like `qwen3:8b`.
- **An added service says "Couldn't connect":** check the API address (it usually ends in `/v1`) and key. Some services don't list their models; type the model names in the "Model names" box instead.
- **"PDF support needs pypdf":** run `python -m pip install pypdf`.

**Privacy & safety:** with a 💻 local model, chat, documents and memory never leave your computer. With a ☁ model, your messages and attachments go to that company (Anthropic, OpenAI or Google) under your API account. File organizing with a ☁ model sends small previews of each photo and the start of each document. Image and video prompts, and any images you edit, are sent to Google when you use Gemini. Web search goes to DuckDuckGo. In Tools mode, file access is limited to the workspace folder. Commands, however, run with your user's full permissions, so keep the permission prompts on unless you trust what you're asking for.
