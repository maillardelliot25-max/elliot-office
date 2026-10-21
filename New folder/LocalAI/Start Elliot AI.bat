@echo off
rem Double-click to open Elliot AI (Friday) in your browser.
rem Also starts Friday Lens: swipe up from the bottom of the screen (or Ctrl+Alt+Space) to ask about your screen.
cd /d "%~dp0app"
start "" /min ollama serve >nul 2>&1
start "" pythonw jarvis_lens.py
python server.py || py server.py
pause
