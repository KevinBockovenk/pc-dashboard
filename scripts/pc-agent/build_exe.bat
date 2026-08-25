@echo off
setlocal EnableDelayedExpansion

echo ============================================================
echo  PC Agent - EXE Builder
echo  Run this script on a Windows machine to compile pc_agent.exe
echo ============================================================
echo.

REM ── Check Python ──────────────────────────────────────────────
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found in PATH.
    echo         Install Python 3.8+ from https://python.org and re-run.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('python --version 2^>^&1') do set PYVER=%%v
echo [INFO] Using %PYVER%

REM ── Install build dependencies ────────────────────────────────
echo.
echo [INFO] Installing build dependencies...
python -m pip install --upgrade pip --quiet
python -m pip install pyinstaller websockets psutil pillow pycaw comtypes --quiet
if %errorlevel% neq 0 (
    echo [ERROR] pip install failed. Check your internet connection.
    pause
    exit /b 1
)

REM ── Build EXE ─────────────────────────────────────────────────
echo.
echo [INFO] Building pc_agent.exe (this may take 1-2 minutes)...
python -m PyInstaller ^
    --onefile ^
    --noconsole ^
    --name pc_agent ^
    --icon NONE ^
    --hidden-import pycaw ^
    --hidden-import comtypes ^
    --hidden-import comtypes.client ^
    --hidden-import comtypes.server ^
    --collect-all pycaw ^
    pc_agent.py

if %errorlevel% neq 0 (
    echo [ERROR] PyInstaller build failed. See output above.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  SUCCESS!
echo  Output: dist\pc_agent.exe
echo.
echo  Usage:
echo    dist\pc_agent.exe wss://your-app-url/ws
echo    dist\pc_agent.exe wss://your-app-url/ws --name "Gaming PC"
echo ============================================================
pause
