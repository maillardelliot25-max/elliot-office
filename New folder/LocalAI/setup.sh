#!/usr/bin/env bash
# Local AI setup for macOS/Linux: Ollama + a coding model + Claude Code pointed at it.
# Usage: ./setup.sh                    (default qwen3-coder:30b, needs ~24 GB RAM)
#        ./setup.sh qwen2.5-coder:7b   (smaller machines)
set -euo pipefail
MODEL="${1:-qwen3-coder:30b}"
VISION_MODEL="${2:-qwen3-vl:8b}"
cd "$(dirname "$0")"

if ! command -v ollama >/dev/null; then
  if [[ "$(uname)" == Darwin ]] && command -v brew >/dev/null; then brew install ollama
  else curl -fsSL https://ollama.com/install.sh | sh; fi
fi
command -v claude >/dev/null || curl -fsSL https://claude.ai/install.sh | bash

# Claude Code needs a big context window; Ollama's default is too small.
export OLLAMA_CONTEXT_LENGTH=65536
pgrep -x ollama >/dev/null || (nohup ollama serve >/tmp/ollama.log 2>&1 &) ; sleep 2
ollama pull "$MODEL"
ollama pull "$VISION_MODEL"   # lets the app read images
python3 -m pip install --quiet --user --upgrade anthropic openai pypdf pillow || true   # cloud AI, PDFs, photo sorting
echo "$MODEL" > .model

echo
echo "Done. Add 'export OLLAMA_CONTEXT_LENGTH=65536' to your shell profile, then run:"
echo "  ./start-app.sh              (the full Elliot AI app in your browser)"
echo "  ./start-claude-local.sh     (Claude Code in the terminal, offline)"
echo
echo "Optional: paste API keys in the app's Settings to use Claude (console.anthropic.com), ChatGPT (platform.openai.com) and Gemini images/video (aistudio.google.com/apikey)."
