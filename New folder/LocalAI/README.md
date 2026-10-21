# Elliot AI: your own private AI app

A Claude-style app that runs on your own computer. Chat, coding, documents, memory and projects run **locally and free**, with no API key. Image and video generation can use **Google Gemini (Nano Banana / Veo)**, which needs a free Google key, or a free image generator running on your own PC.

## Everything it can do

| Feature | How |
|---|---|
| 💬 **Chat** with saved history | Sidebar with search, rename, delete; edit any message you sent; retry, copy, stop |
| 📁 **Projects** | Group chats, give them shared instructions and knowledge files (briefs, brand guides, code) |
| 👁 **Read images** and screenshots | 📎, paste or drag one in. The app switches to the vision model automatically |
| 📄 **Read documents** | PDF, Word, PowerPoint, Excel, text, code, CSV |
| ▶ **Artifacts**: live previews | Web pages, React apps (with Tailwind), SVGs, Mermaid diagrams and documents open in a side panel. Copy, download or save them |
| 🛠 **Tools / agent mode** (like Claude Code) | Writes and edits real files, runs code, analyses data, fixes its own errors, searches the web. It asks your permission first |
| 🔎 **Research mode** | Runs many web searches, reads the sources, and writes a report with citations |
| 💭 **Thinking mode** | Step-by-step reasoning for hard questions |
| 🎨 **Create & edit images** | **Gemini Nano Banana 2 / Pro**: top-quality images, text in images, edit your photos. Follow-ups like "make it bluer" edit the last image. Also works with a local Stable Diffusion server |
| 🎬 **Create videos** | **Google Veo 3.1**: about 8-second clips with sound, from text or by animating an image |
| 🎤 **Voice** | Speak your messages (🎤), and have answers read aloud (🔊) |
| 🧠 **Memory** + custom instructions | Remembers facts about you across chats. View and edit them in Settings |
| ⤓ **Export** | Save any chat as a Markdown file |

Plus **Claude Code** itself in your terminal on the same local model (`start-claude-local`), and **Jarvis** running offline.

> **Be realistic:** the app gives you what the Claude app does, but the chat "brain" is a free open-source model, not Claude itself. Claude can't be downloaded. Local models are good for everyday chat, writing and coding, but slower and weaker than Claude on hard problems. Images and videos come from Google's top models, so those *are* state of the art.

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

## 3. Turn on image & video generation (optional, 2 minutes)

1. Go to **https://aistudio.google.com/apikey**, sign in with Google, and click **Create API key**.
2. In the app, open **⚙ Settings, memory & keys** and paste the key. It stays in `LocalAI/app/data/settings.json` on your computer only.
3. Pick the image model: **Nano Banana 2** (fast, great) or **Nano Banana Pro** (best quality and text in images).

**Cost:** Google's image and video models are pay-as-you-go. Images cost a few cents each. Veo video is billed per second of video, which adds up, so the app asks before the AI makes a video on its own. Check current prices and free-tier limits at https://ai.google.dev/gemini-api/docs/pricing.

**Fully free, offline images instead:** install [Stable Diffusion WebUI Forge](https://github.com/lllyasviel/stable-diffusion-webui-forge), which needs a decent NVIDIA GPU. Start it with `--api`, then set **Image generator → Local** in Settings. The quality is lower than Nano Banana, but it's free and private.

## 4. Use it

**Start the app:** on Windows, double-click **`Start Elliot AI.bat`**. On Mac/Linux, run `./start-app.sh`. Your browser opens at http://localhost:8765.

- **💬 Chat / 🎨 Create image / 🎬 Create video:** the tabs above the message box. In image and video mode, pick the shape (square, wide, tall).
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

## Troubleshooting

- **"Can't reach Ollama":** open the Ollama app (or run `ollama serve`).
- **Very slow:** the model is too big for your PC. Use a smaller one from the table.
- **The AI ignores tools, or forgets earlier messages:** set `OLLAMA_CONTEXT_LENGTH=65536` and restart Ollama. Also use a model with 🛠.
- **"Add your free Google AI Studio key":** see step 3.
- **Gemini error 429 or "quota":** you've hit your limit. Check billing in Google AI Studio.
- **React or diagram preview is blank:** those previews need internet, to load React or Mermaid. Web pages, SVGs and documents work offline.
- **🎤 doesn't work:** use Chrome or Edge. Voice typing uses the browser's speech service, which needs internet.
- **"PDF support needs pypdf":** run `python -m pip install pypdf`.

**Privacy & safety:** chat, documents and memory never leave your computer. Image and video prompts, and any images you edit, are sent to Google when you use Gemini. Web search goes to DuckDuckGo. In Tools mode, file access is limited to the workspace folder. Commands, however, run with your user's full permissions, so keep the permission prompts on unless you trust what you're asking for.
