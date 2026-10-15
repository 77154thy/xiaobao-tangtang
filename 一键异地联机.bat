@echo off
title Xiaobao Tangtang - Online Play (Keep Open)
cd /d %~dp0

echo ==========================================
echo   Xiaobao Tangtang - Online Play Launcher
echo ==========================================
echo.

where ssh >nul 2>nul
if errorlevel 1 (
  echo [x] ssh not found. Enable "OpenSSH Client" in Windows Settings,
  echo     or see the deployment guide file.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [1/3] Installing dependencies (first run)...
  call npm install
  echo.
) else (
  echo [1/3] Dependencies ready
)

echo [2/3] Checking game server on port 3080...
curl -s -o nul --max-time 2 http://localhost:3080/health
if errorlevel 1 (
  echo       Not running. Starting it (new window with auto-restart)...
  start "Xiaobao Tangtang - Game Server" cmd /k "%~dp0server-watch.bat"
  ping -n 5 127.0.0.1 >nul
) else (
  echo       Server is running
)

echo [3/3] Starting public tunnel (auto-reconnect; latest URL saved to URL txt file)
echo.
echo ============================================================
echo   In 5-10 seconds a public https URL will appear below.
echo   The latest URL is also saved to the txt file in this
echo   folder (double-click it anytime to view the URL).
echo   Send that URL to your friend and play together!
echo.
echo   Keep this window open = stay online.
echo   The URL changes after each reconnect; use the txt file.
echo ============================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tunnel.ps1"

pause
