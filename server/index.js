/**
 * 服务端入口：Express 托管前端静态资源 + Socket.IO 实时通信。
 * 单服务部署（前端与后端同源，免 CORS），也可拆分部署（见 README）。
 */
'use strict';

const path = require('path');
const os = require('os');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const { RoomManager } = require('./roomManager');
const gameHandler = require('./gameHandler');

const PORT = process.env.PORT || 3080;
const app = express();

/** 列出本机的局域网 IPv4 地址（供同一 WiFi/热点下的其他设备访问）
 *  过滤常见虚拟网卡（WSL/Hyper-V/VMware/VirtualBox/vgate 等），
 *  并把家用常见的 192.168.* 网段排在最前，方便玩家直接照抄。 */
function lanAddresses() {
  const skip = /vEthernet|WSL|VirtualBox|VMware|VMnet|Hyper-V|Loopback|Tailscale|ZeroTier|Radmin|Docker|vgate|TAP-|tun\d/i;
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    if (skip.test(name)) continue;
    for (const info of ifaces[name] || []) {
      if (info.family === 'IPv4' && !info.internal) out.push(info.address);
    }
  }
  const score = (ip) => (ip.startsWith('192.168.') ? 2 : ip.startsWith('10.') ? 1 : 0);
  out.sort((a, b) => score(b) - score(a));
  return out;
}

// 健康检查（部署平台探活用）
app.get('/health', (_req, res) => res.json({ ok: true, name: '小宝汤汤爱闯关', time: Date.now() }));

// 局域网联机地址（首页会调用它，显示"同一 WiFi/热点"的访问地址）
app.get('/api/lan', (_req, res) => res.json({ port: PORT, ips: lanAddresses() }));

// 静态托管前端（public 目录）
// maxAge: 0 + ETag 协商缓存：文件未变返回 304（省流量），文件更新立即生效（便于迭代/热更）
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: 0, etag: true }));

const server = http.createServer(app);
const io = new Server(server, {
  // 拆分部署时允许跨域连接（同源部署不受影响）
  cors: { origin: true, methods: ['GET', 'POST'] },
  pingInterval: 10000,
  pingTimeout: 20000,
});

const rooms = new RoomManager();
gameHandler.register(io, rooms);

// 每分钟清理过期房间
setInterval(() => rooms.cleanup(), 60 * 1000).unref();

server.listen(PORT, () => {
  const ips = lanAddresses();
  console.log('==========================================');
  console.log('  小宝汤汤爱闯关 - 服务已启动');
  console.log(`  本机游玩:   http://localhost:${PORT}`);
  if (ips.length) {
    console.log('  两台设备联机（同一 WiFi/手机热点，另一台设备打开）:');
    for (const ip of ips) console.log(`      http://${ip}:${PORT}`);
  } else {
    console.log('  (未检测到局域网地址，请确认已连接 WiFi/热点)');
  }
  console.log('==========================================');
});
