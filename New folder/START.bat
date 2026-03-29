@echo off
title Maillard AI — Elliot's Command Center
color 0A
cls

echo.
echo  =====================================================
echo   MAILLARD AI — Elliot's Autonomous Revenue System
echo  =====================================================
echo.

:: ── Check Node.js ──────────────────────────────────────
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js is not installed.
    echo  Download it from: https://nodejs.org/en/download
    echo  Install it, then double-click START.bat again.
    pause
    exit /b
)

:: ── Kill anything on port 3000 ─────────────────────────
echo  Clearing port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
)

:: ── Install dependencies if needed ────────────────────
cd /d "%~dp0AI_Empire"
if not exist node_modules (
    echo  Installing dependencies... (first run only, ~1 min)
    npm install --silent
)

:: ── Copy .env if it doesn't exist ────────────────────
if not exist .env (
    if exist .env.example (
        copy .env.example .env >nul
        echo  Created .env from template.
    )
)

:: ── Start the server ───────────────────────────────────
echo.
echo  Starting Maillard AI...
echo  Dashboard will open at: http://localhost:3000
echo.
echo  Login: admin@empire.ai  /  empire2024
echo.
echo  Press Ctrl+C to stop.
echo  ─────────────────────────────────────────────────

:: Open browser after short delay
start /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

:: Start server (keep window open, show logs)
node backend/server.js

pause
