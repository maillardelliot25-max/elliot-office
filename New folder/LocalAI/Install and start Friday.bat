@echo off
rem Double-click: installs anything Friday needs (only what is missing), then starts Friday and opens it.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-and-start.ps1"
