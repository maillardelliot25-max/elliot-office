# Local AI: your own offline chat and code builder

This setup runs AI on your own computer. It needs no API key and costs nothing per message, and after the first download it works without internet.

| Piece | What it is |
|---|---|
| **Ollama** | Free app that runs open-source AI models locally |
| **qwen3-coder** | The model (the "brain"). Free, strong at code |
| **Claude Code** | The coding agent app. It reads and writes files and runs commands. Here it is pointed at Ollama instead of Anthropic |
| **chat.html** | A simple ChatGPT-style chat page that talks to Ollama |
| **Jarvis** | Uses Ollama automatically when `ANTHROPIC_API_KEY` is blank |

> **What you're actually running:** this is Claude Code (the *tool*) driving an open-source model. It is **not** Claude (the *model*). Claude's model weights aren't public and can't run offline. Local models are good, but they are slower and weaker than Claude on hard tasks.

## 1. Pick a model for your machine

| Your RAM / GPU | Model | Download |
|---|---|---|
| 32 GB+ RAM, or a GPU with 24 GB | `qwen3-coder:30b` (default, best) | ~19 GB |
| 16 GB RAM | `qwen2.5-coder:14b` | ~9 GB |
| 8 GB RAM | `qwen2.5-coder:7b` | ~5 GB |

Run `ollama list` to see what you have. Run `ollama rm <name>` to free up space.

## 2. Install (one time)

**Windows** (PowerShell):
```powershell
cd "New folder\LocalAI"
powershell -ExecutionPolicy Bypass -File .\setup-windows.ps1
# smaller PC:  ... -File .\setup-windows.ps1 -Model qwen2.5-coder:7b
```
When it finishes, quit Ollama from the system tray and reopen it so the new settings apply.

**Mac / Linux**:
```bash
cd "New folder/LocalAI"
./setup.sh                    # or: ./setup.sh qwen2.5-coder:7b
```

## 3. Use it

**Offline coding agent.** Run this from the folder of the project you want it to work on:
```powershell
& "C:\path\to\New folder\LocalAI\start-claude-local.ps1"     # Windows
```
```bash
/path/to/LocalAI/start-claude-local.sh                       # Mac/Linux
```
Then talk to it like normal, for example: "build me a landing page for Maillard AI".

**Offline chat.** Start a tiny local web server, then open the page:
```bash
cd LocalAI
python -m http.server 8080
```
Open http://localhost:8080/chat.html. Pick a model at the top. Switch the mode to **Code builder** to get complete files back.

**Jarvis.** Leave `ANTHROPIC_API_KEY=` blank in `Jarvis/.env` and it uses `OLLAMA_MODEL` instead.

## Newer shortcut

Recent Ollama versions (0.15+) can do the Claude Code wiring for you:
```bash
ollama launch claude
```
The scripts here do the same thing, and they also work on older versions.

## Troubleshooting

- **Very slow:** the model is too big for your machine. Use a smaller one from the table.
- **Claude Code forgets things or fails to use tools:** the context window is too small. Make sure `OLLAMA_CONTEXT_LENGTH=65536` is set, then restart Ollama.
- **Claude Code asks you to log in:** start it with the `start-claude-local` script, not plain `claude`.
- **chat.html says "Can't reach Ollama":** check that Ollama is running, and open the page through `http://localhost:8080`. Double-clicking the file won't work.
