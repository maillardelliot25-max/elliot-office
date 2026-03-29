@echo off
title Stop Maillard AI
color 0C
echo.
echo  Stopping Maillard AI...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
    echo  Stopped process %%a
)
echo  Done. All systems stopped.
timeout /t 2 /nobreak >nul
