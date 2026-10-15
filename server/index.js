/**
 * 服务端入口：Express 托管前端静态资源 + Socket.IO 实时通信。
 * 单服务部署（前端与后端同源，免 CORS），也可拆分部署（见 README）。
 */
'use strict';

const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const { RoomManager } = require('./roomManager');
const gameHandler = require('./gameHandler');

const PORT = process.env.PORT || 3080;
const app = express();

// 健康检查（部署平台探活用）
app.get('/health', (_req, res) => res.json({ ok: true, name: '小宝汤汤爱闯关', time: Date.now() }));

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
  console.log('==========================================');
  console.log('  小宝汤汤爱闯关 - 服务已启动');
  console.log(`  本机游玩:   http://localhost:${PORT}`);
  console.log('  手机联机:   同一 WiFi 下访问本机局域网 IP');
  console.log(`  (查看 IP:  ipconfig 中的 IPv4 地址):${PORT}`);
  console.log('==========================================');
});
