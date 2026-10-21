@echo off
rem Connects Jarvis to the Claude desktop app, so Claude can use Jarvis's memory, screen and files.
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (
  echo Run install_station.bat first.
  pause
  exit /b 1
)
.venv\Scripts\python.exe station\setup_claude.py
pause
