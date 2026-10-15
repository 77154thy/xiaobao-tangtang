# 小宝汤汤爱闯关 - 公网隧道管理器（自动重连 + 双服务轮换 + 网址存档）
# 用法：由「一键异地联机.bat」调用，一般不需要手动运行。
# 原理：在本机开一条加密 SSH 隧道，把公网网址转发到本机的 3000 端口游戏服务。

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [Text.Encoding]::UTF8

# 两个免费隧道服务轮流使用，一家限流就切另一家
$providers = @(
  @{ name = "serveo";        host = "serveo.net";        target = "serveo.net" },
  @{ name = "localhost.run"; host = "localhost.run";     target = "nokey@localhost.run" }
)

$urlFile = Join-Path $PSScriptRoot "当前游戏网址.txt"
$attempt = 0

while ($true) {
  $p = $providers[$attempt % $providers.Count]
  $attempt++

  Write-Host ""
  Write-Host "[隧道] 正在通过 $($p.name) 建立公网通道..." -ForegroundColor Cyan

  $ssh = "ssh -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes -o TCPKeepAlive=yes -R 80:localhost:3000 $($p.target)"
  $urlDone = $false

  & cmd /c "$ssh 2>&1" | ForEach-Object {
    $line = "$_"
    Write-Host $line
    if (-not $urlDone -and $line -match "https://[a-zA-Z0-9.\-]+\.(lhr\.life|serveousercontent\.com)") {
      $url = $Matches[0]
      $urlDone = $true
      @(
        "小宝汤汤爱闯关 - 当前游戏网址",
        "",
        "网址： $url",
        "生成时间： $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
        "",
        "把上面的网址发给小伙伴，两人打开同一网址即可联机对玩。",
        "（每次重连网址会变化，以本文件内容为准）"
      ) | Out-File -Encoding utf8 $urlFile
      Write-Host ""
      Write-Host "==================================================================" -ForegroundColor Green
      Write-Host "  公网网址已生成：" -ForegroundColor Green
      Write-Host "  $url" -ForegroundColor Yellow
      Write-Host "  已保存到：当前游戏网址.txt（双击可查看最新网址）" -ForegroundColor Green
      Write-Host "==================================================================" -ForegroundColor Green
    }
  }

  Write-Host "[隧道] 连接断开（免费隧道会定期重置），15 秒后自动切换重连..." -ForegroundColor Yellow
  Start-Sleep -Seconds 15
}
