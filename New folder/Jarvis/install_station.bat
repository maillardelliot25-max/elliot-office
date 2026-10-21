@echo off
title Jarvis God Station - Install
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo Python is not installed.
  echo Install it from https://www.python.org/downloads/  ^(tick "Add python.exe to PATH"^)
  echo or open Terminal and run:  winget install Python.Python.3.12
  pause
  exit /b 1
)
if not exist .venv\Scripts\python.exe python -m venv .venv
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install -r requirements-station.txt
if errorlevel 1 (
  echo Install failed - see the error above.
  pause
  exit /b 1
)
echo.
echo  Done! Now double-click start_station.bat
pause
