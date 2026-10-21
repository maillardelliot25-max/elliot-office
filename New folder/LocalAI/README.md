# Elliot AI: your own private, offline AI app

A Claude-style app that runs entirely on your own computer. It needs no API key, has no monthly bill, and keeps your data private. After setup it works without internet, except for web search.

## What it can do

| Feature | How |
|---|---|
| 💬 **Chat** with saved history | Sidebar with your chats; rename or delete them |
| 👁 **Read images** and screenshots | Click 📎, paste, or drag one in. The app switches to the vision model automatically |
| 📄 **Read documents** | PDF, Word (.docx), text, code, CSV and more |
| ▶ **Artifacts**: live previews | Web pages and SVGs the AI writes open in a side panel. Copy, download, or save them |
| 🛠 **Tools / agent mode** (like Claude Code) | Writes and edits real files, runs commands and code, fixes its own errors, searches the web. It asks your permission first |
| 💭 **Thinking mode** | Step-by-step reasoning for hard questions (on models that support it) |
| 🧠 **Memory** | Remembers facts about you across chats. You can view and edit them in Settings |
| ⚙ **Custom instructions** | Tell it how you want answers |
| ↻ Retry, copy, stop | Same as the Claude app |

Plus **Claude Code** itself running in your terminal on the same local model (`start-claude-local`).

> **Be realistic:** the app does what the Claude app does, but the "brain" is a free open-source model, not Claude itself. Claude can't be downloaded. Local models are good for everyday chat, writing and coding. They're slower, and weaker than Claude on hard problems. A bigger model on a stronger PC gets closer.

## 1. Pick models for your machine

| Your computer | Main model (chat + code + tools) | Image model |
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

## 3. Use it

**The app:** on Windows, double-click **`Start Elliot AI.bat`**. On Mac/Linux, run `./start-app.sh`. Your browser opens at http://localhost:8765.

- Pick a model at the top right. The icons show what each model can do: 👁 images, 🛠 tools, 💭 thinking.
- Turn on **🛠 Tools** and ask: *"Build me a landing page for Maillard AI and run it."* It writes the files into your workspace folder (by default `ElliotAI-Workspace` in your home folder) and asks before each write or command. Click **Always allow** to stop the prompts.
- Your chats, memory and settings are saved in `LocalAI/app/data/`. Nothing leaves your computer.

**Claude Code in the terminal:** run this from any project folder:
```powershell
& "C:\path\to\New folder\LocalAI\start-claude-local.ps1"     # Windows
```
```bash
/path/to/LocalAI/start-claude-local.sh                       # Mac/Linux
```

**Jarvis:** leave `ANTHROPIC_API_KEY=` blank in `Jarvis/.env`, and Jarvis uses `OLLAMA_MODEL` instead.

**Add more models anytime:** run `ollama pull <name>` and they appear in the app's dropdown. Browse models at https://ollama.com/search.

## Troubleshooting

- **"Can't reach Ollama":** open the Ollama app (or run `ollama serve`).
- **Very slow:** the model is too big for your PC. Use a smaller one from the table.
- **The AI ignores tools, or forgets earlier messages:** set `OLLAMA_CONTEXT_LENGTH=65536` and restart Ollama. Also use a model with 🛠 in the dropdown.
- **"PDF support needs pypdf":** run `python -m pip install pypdf`.
- **Claude Code asks you to log in:** start it with `start-claude-local`, not plain `claude`.

**Safety:** in Tools mode, file access is limited to the workspace folder. Commands, however, run with your user's full permissions. Keep the permission prompts on unless you trust what you're asking for.
