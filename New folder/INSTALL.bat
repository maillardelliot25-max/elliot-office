@echo off
title Maillard AI — First-Time Setup
color 0B
cls

echo.
echo  ╔═══════════════════════════════════════════════════╗
echo  ║   MAILLARD AI — First-Time Setup                 ║
echo  ║   This runs once. Takes about 2 minutes.         ║
echo  ╚═══════════════════════════════════════════════════╝
echo.

:: ── Check Node.js ──────────────────────────────────────────────────────────
echo  [1/4] Checking Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [!] Node.js is NOT installed.
    echo.
    echo  Please install it:
    echo    1. Open this link: https://nodejs.org/en/download
    echo    2. Download the Windows Installer (.msi)
    echo    3. Run it, click Next through everything
    echo    4. Come back and double-click INSTALL.bat again
    echo.
    pause
    start https://nodejs.org/en/download
    exit /b 1
)
echo  [OK] Node.js found.

:: ── Install AI Empire dependencies ─────────────────────────────────────────
echo  [2/4] Installing AI Empire dependencies...
cd /d "%~dp0AI_Empire"
call npm install --loglevel error 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] npm install failed. Check internet connection and try again.
    pause
    exit /b 1
)
echo  [OK] Dependencies installed.

:: ── Setup .env ─────────────────────────────────────────────────────────────
echo  [3/4] Setting up environment...
if not exist .env (
    if exist .env.example (
        copy .env.example .env >nul
        echo  [OK] Created .env from template.
    )
) else (
    echo  [OK] .env already exists.
)

:: ── Setup Jarvis (Python - optional) ───────────────────────────────────────
echo  [4/4] Checking Python for Jarvis (optional)...
python --version >nul 2>&1
if %errorlevel% equ 0 (
    cd /d "%~dp0Jarvis"
    pip install -r requirements-free.txt --quiet 2>&1
    echo  [OK] Jarvis Python dependencies installed.
) else (
    echo  [SKIP] Python not found. Jarvis requires Python 3.10+.
    echo         AI Empire works fine without it.
)

:: ── Done ───────────────────────────────────────────────────────────────────
echo.
echo  ╔═══════════════════════════════════════════════════╗
echo  ║   Setup Complete!                                ║
echo  ║                                                  ║
echo  ║   Double-click START.bat to launch              ║
echo  ║   Dashboard: http://localhost:3000              ║
echo  ║   Login: admin@empire.ai / empire2024           ║
echo  ╚═══════════════════════════════════════════════════╝
echo.
pause
