# Jarvis: "start ruflo <task>"  ->  Friday-led Ruflo hive (local Ollama / free Groq via Friday only)
param([string]$TaskB64 = "", [string]$Task = "")
$ErrorActionPreference = "Continue"
$Host.UI.RawUI.WindowTitle = "Ruflo hive (Friday is queen)"
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Set-Location "C:\Tools\ruflo"
if ($TaskB64) { & py -3 "C:\Tools\ruflo\friday_hive.py" --b64 $TaskB64 }
else { & py -3 "C:\Tools\ruflo\friday_hive.py" $Task }
