# Safe local install of Ruflo into C:\Tools\ruflo (no install scripts, no telemetry, no cloud)
$ErrorActionPreference = "Continue"
$d = "C:\Tools\ruflo"; New-Item -ItemType Directory -Force "$d\hive","$d\logs" | Out-Null
Set-Location $d
$env:RUFLO_FUNNEL = "0"; $env:CLAUDE_FLOW_AUTO_UPDATE = "false"; $env:DO_NOT_TRACK = "1"; $env:OTEL_SDK_DISABLED = "true"
[IO.File]::WriteAllText("$d\policy.json", '{"funnel":{"enabled":false}}', (New-Object Text.UTF8Encoding $false))
[IO.File]::WriteAllText("$d\hive\claude-flow.config.json", '{"funnel":{"enabled":false},"telemetry":{"enabled":false},"flowNexus":{"enabled":false},"providers":{"default":"ollama","ollama":{"endpoint":"http://127.0.0.1:11434","model":"qwen3:8b"}}}', (New-Object Text.UTF8Encoding $false))
if (-not (Test-Path "$d\package.json")) { & npm.cmd init -y | Out-Null }
& npm.cmd install ruflo@3.63.8 --ignore-scripts --no-fund --no-audit --save-exact 2>&1 | Select-Object -Last 3
& npm.cmd audit --omit=dev 2>&1 | Select-Object -Last 3 | Out-File "$d\logs\audit.txt"
# user-level kill switches so any ruflo run on this PC stays local
foreach ($k in @{RUFLO_FUNNEL="0"; CLAUDE_FLOW_AUTO_UPDATE="false"; RUFLO_ENTERPRISE_POLICY="$d\policy.json"}.GetEnumerator()) {
  [Environment]::SetEnvironmentVariable($k.Key, $k.Value, "User") }
Set-Location "$d\hive"
& node "$d\node_modules\ruflo\bin\ruflo.js" providers configure -p ollama -e http://127.0.0.1:11434 -m qwen3:8b --no-color 2>&1 | Select-Object -Last 2
& node "$d\node_modules\ruflo\bin\ruflo.js" hive-mind init -t hierarchical --no-color 2>&1 | Select-Object -Last 2
& node "$d\node_modules\ruflo\bin\ruflo.js" --version
"INSTALL DONE"
