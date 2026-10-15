@echo off
chcp 65001 >nul
title 小宝汤汤爱闯关 - 异地联机（保持此窗口不关）
cd /d %~dp0

echo ==========================================
echo   小宝汤汤爱闯关 - 异地联机一键启动
echo ==========================================
echo.

where ssh >nul 2>nul
if errorlevel 1 (
  echo [x] 未找到 ssh 命令。请在 Windows 设置中启用"OpenSSH 客户端"，
  echo     或参考 部署指南.md 的方案二。
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [1/3] 首次运行，正在安装依赖（约 1 分钟）...
  call npm install
  echo.
) else (
  echo [1/3] 依赖已就绪
)

echo [2/3] 检查游戏服务器...
curl -s -o nul --max-time 2 http://localhost:3000/health
if errorlevel 1 (
  echo       未运行，正在启动（新窗口）...
  start "小宝汤汤-游戏服务器" cmd /k "npm start"
  timeout /t 4 /nobreak >nul
) else (
  echo       服务器已在运行
)

echo [3/3] 启动公网隧道（自动重连，网址自动保存到"当前游戏网址.txt"）
echo.
echo ============================================================
echo   稍等 5~10 秒，窗口里会出现 https://xxxx 网址；
echo   同时会自动写入"当前游戏网址.txt"，随时双击查看。
echo   把网址发给小伙伴即可异地联机！
echo.
echo   本窗口保持开着 = 公网在线；断线会自动重连。
echo   重连后网址会变，以"当前游戏网址.txt"里的为准。
echo ============================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tunnel.ps1"

pause
