#!/usr/bin/env bash
# Launch Claude Code against local Ollama. No API key, no internet needed after setup.
cd "$(dirname "$0")"
MODEL="${MODEL:-$(cat .model 2>/dev/null || echo qwen3-coder:30b)}"
cd - >/dev/null

export ANTHROPIC_BASE_URL=http://localhost:11434
export ANTHROPIC_AUTH_TOKEN=ollama
export ANTHROPIC_API_KEY=""
# Every internal model tier must point local, or some calls still try Anthropic's servers.
export ANTHROPIC_MODEL="$MODEL"
export ANTHROPIC_DEFAULT_OPUS_MODEL="$MODEL"
export ANTHROPIC_DEFAULT_SONNET_MODEL="$MODEL"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="$MODEL"
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1

exec claude --model "$MODEL" "$@"
