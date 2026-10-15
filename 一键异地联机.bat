@echo off
chcp 65001 >nul
title 小宝汤汤爱闯关 - 一键异地联机
cd /d %~dp0

echo ==========================================
echo   小宝汤汤爱闯关 - 异地联机一键启动
echo ==========================================
echo.

where ssh >nul 2>nul
if errorlevel 1 (
  echo [x] 未找到 ssh 命令。请在 Windows 设置中启用"OpenSSH 客户端"，
  echo     或参考 部署指南.md 的方案二（部署到 Render）。
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [1/2] 首次运行，正在安装依赖（约 1 分钟）...
  call npm install
  echo.
)

echo [2/2] 正在启动游戏服务器（新窗口）...
start "小宝汤汤-游戏服务器" cmd /k "npm start"
timeout /t 4 /nobreak >nul

echo.
echo ============================================================
echo   稍等 5~10 秒，下面会出现一个 https://xxxx.lhr.life 网址
echo   把那个网址发给小伙伴，两人就能异地一起玩了！
echo   （也可以用屏幕上出现的二维码让手机扫码加入）
echo.
echo   本窗口不要关闭，关闭 = 断开公网连接。
echo   断线会自动重连（重连后网址会变，重新发一次即可）。
echo ============================================================
echo.

:loop
ssh -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes -o TCPKeepAlive=yes -R 80:localhost:3000 nokey@localhost.run
echo.
echo [!] 隧道断开（免费隧道会定期重置），5 秒后自动重连...
echo     重连成功后上面会出现新网址，请重新发给小伙伴。
timeout /t 5 /nobreak >nul
goto loop
