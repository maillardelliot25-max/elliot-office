@echo off
REM ============================================================
REM MAILLARD AI — PERSISTENT SERVER (Runs Forever, Auto-Restart)
REM ============================================================
REM This script runs your AI Empire server that:
REM - Starts automatically when you boot
REM - Never times out
REM - Auto-restarts if it crashes
REM - Accessible via WiFi at your local IP
REM ============================================================

setlocal enabledelayedexpansion

title Maillard AI — Persistent Server (Running Forever)
color 0B

echo.
echo  ╔════════════════════════════════════════════════════╗
echo  ║  MAILLARD AI — Persistent Local Server             ║
echo  ║  Running on http://localhost:3000                  ║
echo  ║  Never stops. Auto-restarts on crash.              ║
echo  ╚════════════════════════════════════════════════════╝
echo.

cd /d "%~dp0AI_Empire"

REM Kill any existing processes on port 3000
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do taskkill /PID %%a /F 2>nul

REM Install dependencies if needed
if not exist node_modules (
    echo Installing dependencies...
    call npm install --silent
)

REM Copy .env if missing
if not exist .env (
    if exist .env.example copy .env.example .env >nul
)

REM ── PERSISTENT LOOP ──────────────────────────────────────
:RESTART
echo.
echo [%date% %time%] Starting Maillard AI Server...
echo Dashboard: http://localhost:3000
echo Login: admin@empire.ai / empire2024
echo.
echo Press Ctrl+C to stop (not recommended)
echo ─────────────────────────────────────────────────────

node backend/server.js

REM If server exits, wait 5 seconds and restart
echo.
echo [%date% %time%] Server stopped unexpectedly. Restarting in 5 seconds...
timeout /t 5 /nobreak >nul
goto RESTART
