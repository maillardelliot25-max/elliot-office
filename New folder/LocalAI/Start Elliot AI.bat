@echo off
rem Double-click to open Elliot AI in your browser.
cd /d "%~dp0app"
start "" /min ollama serve >nul 2>&1
python server.py || py server.py
pause
