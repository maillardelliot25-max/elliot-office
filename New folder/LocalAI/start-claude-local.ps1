# Launch Claude Code against local Ollama. No API key, no internet needed after setup.
param([string]$Model = $(if (Test-Path "$PSScriptRoot\.model") { (Get-Content "$PSScriptRoot\.model").Trim() } else { "qwen3-coder:30b" }))

$env:ANTHROPIC_BASE_URL   = "http://localhost:11434"
$env:ANTHROPIC_AUTH_TOKEN = "ollama"
$env:ANTHROPIC_API_KEY    = ""
# Every internal model tier must point local, or some calls still try Anthropic's servers.
$env:ANTHROPIC_MODEL                = $Model
$env:ANTHROPIC_DEFAULT_OPUS_MODEL   = $Model
$env:ANTHROPIC_DEFAULT_SONNET_MODEL = $Model
$env:ANTHROPIC_DEFAULT_HAIKU_MODEL  = $Model
$env:CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1"

claude --model $Model @args
