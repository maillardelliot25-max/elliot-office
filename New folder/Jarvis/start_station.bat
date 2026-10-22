@echo off
title Jarvis God Station
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (
  echo Run install_station.bat first.
  if /i not "%~1"=="/quiet" pause
  exit /b 1
)
.venv\Scripts\python.exe -m station
if /i not "%~1"=="/quiet" pause
