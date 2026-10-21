# Local AI setup for Windows: Ollama + a coding model + Claude Code pointed at it.
# Run in PowerShell:  powershell -ExecutionPolicy Bypass -File .\setup-windows.ps1
# Smaller PC (<16 GB RAM)?  .\setup-windows.ps1 -Model qwen2.5-coder:7b
param([string]$Model = "qwen3-coder:30b", [string]$VisionModel = "qwen3-vl:8b")

$ErrorActionPreference = "Stop"

if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    Write-Host "Installing Ollama..."
    winget install --id Ollama.Ollama -e --accept-source-agreements --accept-package-agreements
    $env:Path += ";$env:LOCALAPPDATA\Programs\Ollama"
}

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Host "Installing Claude Code..."
    irm https://claude.ai/install.ps1 | iex
}

# Claude Code needs a big context window; Ollama's default is too small.
[Environment]::SetEnvironmentVariable("OLLAMA_CONTEXT_LENGTH", "65536", "User")
$env:OLLAMA_CONTEXT_LENGTH = "65536"

Write-Host "Downloading $Model (one time, several GB)..."
ollama pull $Model
Write-Host "Downloading $VisionModel (lets the app read images)..."
ollama pull $VisionModel

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "Installing Python (needed for the Elliot AI app)..."
    winget install --id Python.Python.3.12 -e --accept-source-agreements --accept-package-agreements
}
try { python -m pip install --quiet --upgrade anthropic openai pypdf pillow } catch { Write-Host "Open a new PowerShell and run: python -m pip install anthropic openai pypdf pillow" }

Set-Content -Path "$PSScriptRoot\.model" -Value $Model
Write-Host ""
Write-Host "Done. Restart Ollama from the tray icon so the new context size applies, then run:"
Write-Host "  Double-click 'Start Elliot AI.bat'   (the full app in your browser)"
Write-Host "  .\start-claude-local.ps1            (Claude Code in the terminal, offline)"
Write-Host ""
Write-Host "Optional: paste API keys in the app's Settings to use Claude (console.anthropic.com), ChatGPT (platform.openai.com) and Gemini images/video (aistudio.google.com/apikey)."
