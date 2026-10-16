@echo off
title Allow LAN connections (run as administrator)
cd /d %~dp0

net session >nul 2>&1
if errorlevel 1 (
  echo.
  echo [!] No administrator rights.
  echo     Please RIGHT-CLICK this file and choose:
  echo        "Run as administrator" / "????????"
  echo.
  pause
  exit /b 1
)

netsh advfirewall firewall delete rule name="XiaobaoTangtang-3080" >nul 2>&1
netsh advfirewall firewall add rule name="XiaobaoTangtang-3080" dir=in action=allow protocol=TCP localport=3080

echo.
echo [OK] Firewall rule added: TCP port 3080 allowed.
echo      Other devices on the same WiFi / hotspot can now
echo      open http://THIS-PC-IP:3080 and play together.
echo.
pause
