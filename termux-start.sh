#!/bin/sh
# 小宝汤汤爱闯关 - 手机服务器一键启动（Termux）
# 用法：在 Termux 里执行  sh termux-start.sh
set -e

REPO="https://github.com/77154thy/xiaobao-tangtang.git"
MIRROR="https://ghproxy.net/https://github.com/77154thy/xiaobao-tangtang.git"
DIR="$HOME/xiaobao-tangtang"

echo ""
echo "==> 小宝汤汤爱闯关 · 手机服务器启动器"
echo "==> [1/3] 安装运行环境（首次约 1-2 分钟；若提示确认请输入 y 或直接回车）"
pkg install -y nodejs-lts git 2>/dev/null || pkg install -y nodejs git

echo "==> [2/3] 获取游戏文件"
if [ -d "$DIR/.git" ]; then
  cd "$DIR"
  (git pull --ff-only || true)
else
  git clone --depth=1 "$REPO" "$DIR" 2>/dev/null || git clone --depth=1 "$MIRROR" "$DIR"
  cd "$DIR"
fi

echo "==> [3/3] 安装依赖并启动"
npm install --no-audit --no-fund --loglevel=error

IP="$(ip route get 1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}')"
[ -z "$IP" ] && IP="$(ifconfig 2>/dev/null | grep -o 'inet [0-9.]*' | grep -v 127.0.0.1 | head -1 | cut -d' ' -f2)"

echo ""
echo "======================================================"
echo "  启动成功！保持 Termux 窗口开着就是开机状态"
echo ""
echo "  这台手机自己玩:   http://localhost:3080"
echo "  另一台设备(连同一 WiFi/热点)打开:"
echo "      http://${IP:-<本机IP>}:3080"
echo ""
echo "  停止服务: 按 Ctrl+C，或直接关掉 Termux"
echo "======================================================"
echo ""
exec node server/index.js
