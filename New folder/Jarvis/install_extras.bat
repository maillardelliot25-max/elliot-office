@echo off
title Jarvis God Station - Free extras
rem Installs the free extras with winget (built into Windows 11). Asks before each one.
cd /d "%~dp0"
where winget >nul 2>nul
if errorlevel 1 (
  echo winget is missing. Update "App Installer" from the Microsoft Store, then run this again.
  pause
  exit /b 1
)

echo.
echo ==== 1. Ollama - Jarvis's free local brain (about 2 GB with the model) ====
choice /c YN /m "Install Ollama and download the brain"
if errorlevel 2 goto tailscale
winget install -e --id Ollama.Ollama --accept-source-agreements --accept-package-agreements
set "OLLAMA=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
if not exist "%OLLAMA%" set "OLLAMA=ollama"
start "" "%LOCALAPPDATA%\Programs\Ollama\ollama app.exe" >nul 2>nul
timeout /t 8 >nul
"%OLLAMA%" pull llama3.2:3b
if errorlevel 1 echo   Could not download the model yet. Later, open Terminal and run:  ollama pull llama3.2:3b

:tailscale
echo.
echo ==== 2. Tailscale - reach the PC from anywhere, privately ====
choice /c YN /m "Install Tailscale"
if errorlevel 2 goto syncthing
winget install -e --id tailscale.tailscale --accept-source-agreements --accept-package-agreements
echo   Now sign in to Tailscale (tray icon), and install Tailscale on your phone and tablet with the same account.

:syncthing
echo.
echo ==== 3. Syncthing - photos, music and files sync on their own ====
choice /c YN /m "Install Syncthing"
if errorlevel 2 goto claude
winget install -e --id Syncthing.Syncthing --accept-source-agreements --accept-package-agreements
echo   On your phone and tablet install "Syncthing-Fork" from the Play Store. README section 6 shows how to link them.

:claude
echo.
echo ==== 4. Claude desktop app - Jarvis's sister AI ====
choice /c YN /m "Install the Claude desktop app"
if errorlevel 2 goto done
winget install -e --id Anthropic.Claude --accept-source-agreements --accept-package-agreements
if errorlevel 1 echo   If that failed, download it from https://claude.ai/download
echo   Sign in to Claude, then double-click setup_claude_link.bat

:done
echo.
echo  All done, sir. Open the Jarvis app - PC tab - the Setup card shows what's left.
pause
