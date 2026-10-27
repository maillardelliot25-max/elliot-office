@echo off
title Jarvis God Station
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (
  echo Run install_station.bat first.
  if /i not "%~1"=="/quiet" pause
  exit /b 1
)
rem Already running? Then don't start a second copy.
netstat -ano | findstr /r /c:":8780 .*LISTENING" >nul && (
  echo Jarvis is already running.
  timeout /t 4 >nul
  exit /b 0
)
rem Add anything new this version needs (quick when nothing is missing).
.venv\Scripts\python.exe -c "import webauthn" 2>nul || .venv\Scripts\python.exe -m pip install --quiet --disable-pip-version-check --no-index --find-links wheels webauthn
rem Watchdog: if the station ever stops or crashes, restart it (backoff up to 60s).
set WAIT=5
:loop
.venv\Scripts\python.exe -m station
echo.
echo  Station stopped - restarting in %WAIT%s (close this window to stop Jarvis for good)
timeout /t %WAIT% >nul
set /a WAIT=WAIT*2
if %WAIT% gtr 60 set WAIT=60
goto loop
