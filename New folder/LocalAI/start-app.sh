#!/usr/bin/env bash
# Open Elliot AI in your browser.
cd "$(dirname "$0")/app"
pgrep -x ollama >/dev/null || (nohup ollama serve >/tmp/ollama.log 2>&1 &)
(nohup python3 jarvis_lens.py >/tmp/jarvis_lens.log 2>&1 &)   # swipe up / Ctrl+Alt+Space to ask about your screen
exec python3 server.py "$@"
