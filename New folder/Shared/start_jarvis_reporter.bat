@echo off
title Jarvis + reporter (feeds Friday's Home Station)
cd /d "%~dp0"
rem Uses Jarvis's own Python (it has psutil); falls back to the system Python.
set "PY=..\Jarvis\.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
rem Starts Jarvis Station unchanged and records its log. Use this instead of start_station.bat.
"%PY%" jarvis_reporter.py --run-jarvis
pause
