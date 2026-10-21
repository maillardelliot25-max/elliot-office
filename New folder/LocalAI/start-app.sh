#!/usr/bin/env bash
# Open Elliot AI in your browser.
cd "$(dirname "$0")/app"
pgrep -x ollama >/dev/null || (nohup ollama serve >/tmp/ollama.log 2>&1 &)
exec python3 server.py "$@"
