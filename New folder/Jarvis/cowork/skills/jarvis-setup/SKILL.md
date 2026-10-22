---
name: jarvis-setup
description: Install, update, start, stop or repair Jarvis (the "God Station" home AI) on Elliot's Windows PC. Use when Elliot says "set up Jarvis", "install Jarvis", "update Jarvis", "restart Jarvis", "Jarvis isn't working", or asks for the pairing PIN.
---

# Jarvis setup (Windows)

Jarvis is a Python server that runs on Elliot's PC (port **8780**). Its code lives in the GitHub repo
`maillardelliot25-max/elliot-office`, folder `New folder/Jarvis/`, branch `claude/cross-device-home-app-epwsbl`.
Install it to **`%USERPROFILE%\Jarvis`** unless Elliot names another folder.

Use PowerShell. Tell Elliot what you are about to do before each step that installs or changes something,
and wait for his OK. Never delete `station_data\` or `.env`: they hold his memory, screen memory, paired
devices, keys and settings.

## Install (first time)

1. **Python 3.12** — check `py -3.12 --version`. If missing: `winget install -e --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements`, then open a new PowerShell so `py` is on PATH.
2. **Download Jarvis** to a temp folder and copy just the Jarvis folder into place:
   ```powershell
   $zip = "$env:TEMP\jarvis.zip"; $tmp = "$env:TEMP\jarvis-src"
   Invoke-WebRequest "https://github.com/maillardelliot25-max/elliot-office/archive/refs/heads/claude/cross-device-home-app-epwsbl.zip" -OutFile $zip
   Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue; Expand-Archive $zip $tmp
   $src = Get-ChildItem $tmp | Select-Object -First 1 | ForEach-Object { Join-Path $_.FullName "New folder\Jarvis" }
   New-Item -ItemType Directory -Force "$env:USERPROFILE\Jarvis" | Out-Null
   Copy-Item "$src\*" "$env:USERPROFILE\Jarvis" -Recurse -Force
   ```
3. **Install** (takes a few minutes; optional parts may print "skipped", which is fine):
   `cd $env:USERPROFILE\Jarvis; .\install_station.bat /quiet`
   `install_station.bat` uses `python`; if that isn't found but `py` is, first run `py -3.12 -m venv .venv`.
4. **Ollama (the free local brain)** — ask first (about 2 GB):
   `winget install -e --id Ollama.Ollama --accept-source-agreements --accept-package-agreements`, then
   `& "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" pull llama3.2:3b`
5. **Start Jarvis** in its own window, so it keeps running after you finish:
   `Start-Process cmd -ArgumentList '/c','start_station.bat' -WorkingDirectory "$env:USERPROFILE\Jarvis"`
   Wait ~10 seconds, then read **`station_data\addresses.txt`** and **`station_data\pairing_pin.txt`**, and tell Elliot:
   "Open <address> in Chrome on your phone and enter PIN <pin>." Windows may ask to allow Python through
   the firewall: tell him to click **Allow** (Private networks).
6. **Optional, ask about each:**
   - Start with Windows: `.\install_autostart.bat /quiet`
   - Claude link (Jarvis's tools in Claude): `.\setup_claude_link.bat /quiet`, then Elliot fully quits and reopens Claude.
   - Tailscale (reach Jarvis from anywhere): `winget install -e --id tailscale.tailscale` and sign in.

Check it worked: `Invoke-RestMethod http://localhost:8780/` returns the app page, and the station window shows no errors.

## Update to the newest version

1. Ask Elliot first; Jarvis restarts (about 30 seconds).
2. Stop it: `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*-m station*' } | ForEach-Object { Stop-Process -Id $_.ProcessId }`
3. Download and extract as in Install step 2, but copy **without** his data:
   ```powershell
   robocopy $src "$env:USERPROFILE\Jarvis" /E /XD station_data .venv logs /XF .env
   ```
   (robocopy exit codes 0–7 mean success.)
4. `cd $env:USERPROFILE\Jarvis; .\install_station.bat /quiet` (picks up any new requirements).
5. Start it again (Install step 5) and confirm `http://localhost:8780/` answers. Paired phones stay paired.

## Repair

- **Phone can't connect:** is the station window open? Same Wi-Fi? Firewall allowed? Read `station_data\addresses.txt` for the right address.
- **"brain offline"** in the app: start Ollama (Start menu) and run `ollama pull llama3.2:3b`.
- **Port 8780 busy:** another Jarvis is already running (check with the Stop command above, listing instead of stopping).
- **Errors in the station window:** copy the last lines to Elliot and fix the cause; the README (`README_STATION.md`) has a troubleshooting table.
- **New PIN for another device:** read `station_data\pairing_pin.txt` (it changes after each pairing).
