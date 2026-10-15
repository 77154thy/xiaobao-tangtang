@echo off
title Xiaobao Tangtang - Game Server
cd /d %~dp0

set "NODE=node"
where node >nul 2>nul
if errorlevel 1 (
  if exist "C:\Program Files\nodejs\node.exe" set "NODE=C:\Program Files\nodejs\node.exe"
)

echo ==========================================
echo   Xiaobao Tangtang - Game Server
echo   KEEP THIS WINDOW OPEN.
echo   Server auto-restarts if it exits.
echo   Port: 3080  (http://localhost:3080)
echo ==========================================
echo.

:loop
"%NODE%" server\index.js
echo.
echo [server] exited, restarting in 3 seconds... (close this window to stop)
ping -n 4 127.0.0.1 >nul
goto loop
