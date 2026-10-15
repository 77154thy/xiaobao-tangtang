/**
 * 房间管理器：负责房间的创建、加入、断线宽限重连、过期清理。
 * 数据全部保存在内存中（后续可扩展 Redis / SQLite）。
 */
'use strict';

const crypto = require('crypto');

// 房间号字符集：去掉容易混淆的 0/O/1/I/L
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LEN = 4;

const GRACE_MS = 60 * 1000;        // 断线后保留席位的宽限期（60 秒内可重连）
const ROOM_TTL_MS = 2 * 60 * 60 * 1000; // 房间最长存活 2 小时
const EMPTY_TTL_MS = 10 * 60 * 1000;    // 空房（创建后无人加入）10 分钟回收

function genId(prefix) {
  return prefix + '_' + crypto.randomBytes(6).toString('hex');
}

function sanitizeNickname(name) {
  // 昵称去 HTML、限长，防注入与超长
  return String(name || '').replace(/[<>&"']/g, '').trim().slice(0, 12) || '玩家';
}

class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomCode -> room
    this._timers = new Map(); // roomCode -> 断线宽设定时器
  }

  /** 生成不重复的 4 位房间码 */
  _newCode() {
    for (let i = 0; i < 200; i++) {
      let code = '';
      for (let j = 0; j < CODE_LEN; j++) {
        code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('ROOM_CODE_EXHAUSTED');
  }

  /** 创建房间，返回 {room, player}（创建者固定为房主 = 玩家0 = 小宝） */
  createRoom(nickname) {
    const code = this._newCode();
    const player = {
      id: genId('p'),
      nickname: sanitizeNickname(nickname),
      role: 'host',
      ready: true,          // 房主默认就绪
      position: { x: 0, y: 0 },
      score: 0,
      socketId: null,
      connected: true,
      idx: 0,
    };
    const room = {
      id: code,
      players: [player, null],
      status: 'waiting',    // waiting / playing
      mode: 'dual',         // 'dual' 模式B 双人各自控制；'sync' 模式A 一人方向一人跳跃
      duties: { moverIdx: 0, jumperIdx: 1 }, // 模式A：0 号玩家控方向、1 号玩家控跳跃（等待页可互换）
      currentLevel: 1,
      levelStartAt: 0,      // 本关开始的服务器时间（计时用）
      settling: false,      // 已通关、等待进入下一关
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };
    this.rooms.set(code, room);
    return { room, player };
  }

  /**
   * 加入房间。
   * - 全新加入：nickname 入座 1 号位（客人 = 汤汤）
   * - 重连加入：带 playerId 且匹配已断线的席位 → 重新绑定
   * 出错时抛出 {code, message}
   */
  joinRoom(code, nickname, playerId) {
    const room = this.rooms.get(String(code || '').toUpperCase());
    if (!room) throw { code: 'ROOM_NOT_FOUND', message: '房间不存在或已关闭' };

    // 重连：匹配 playerId
    if (playerId) {
      for (const p of room.players) {
        if (p && p.id === playerId) {
          p.connected = true;
          p.nickname = nickname ? sanitizeNickname(nickname) : p.nickname;
          room.lastActiveAt = Date.now();
          this._cancelGrace(room);
          return { room, player: p, rejoined: true };
        }
      }
      throw { code: 'REJOIN_FAILED', message: '该玩家已不在房间，请重新加入' };
    }

    if (room.players[1]) throw { code: 'ROOM_FULL', message: '房间已满（两人）' };
    if (room.status !== 'waiting') throw { code: 'ROOM_PLAYING', message: '游戏已开始，无法加入' };

    const player = {
      id: genId('p'),
      nickname: sanitizeNickname(nickname),
      role: 'guest',
      ready: false,
      position: { x: 0, y: 0 },
      score: 0,
      socketId: null,
      connected: true,
      idx: 1,
    };
    room.players[1] = player;
    room.lastActiveAt = Date.now();
    return { room, player, rejoined: false };
  }

  /** 按 socketId 找到所在房间与玩家 */
  getBySocket(socketId) {
    for (const room of this.rooms.values()) {
      for (const p of room.players) {
        if (p && p.socketId === socketId) return { room, player: p };
      }
    }
    return null;
  }

  /** 玩家掉线：标记断线并启动宽限计时；到期关闭房间并返回被通知方 */
  handleDisconnect(socketId) {
    const found = this.getBySocket(socketId);
    if (!found) return null;
    const { room, player } = found;
    player.connected = false;
    player.ready = false;
    room.lastActiveAt = Date.now();

    const other = room.players[1 - player.idx];
    this._cancelGrace(room);
    this._timers.set(room.id, setTimeout(() => {
      this._timers.delete(room.id);
      this.closeRoom(room, 'OPPONENT_TIMEOUT', '对方离开已超过 1 分钟，房间已关闭');
    }, GRACE_MS));
    return { room, player, other };
  }

  _cancelGrace(room) {
    const t = this._timers.get(room.id);
    if (t) { clearTimeout(t); this._timers.delete(room.id); }
  }

  /** 关闭房间并通知仍在场的人 */
  closeRoom(room, code, message) {
    this._cancelGrace(room);
    for (const p of room.players) {
      if (p && p.connected && p.socketId) {
        // 由 gameHandler 注入的通知回调发出（避免循环依赖）
        if (this.onRoomClosed) this.onRoomClosed(p.socketId, code, message);
      }
    }
    this.rooms.delete(room.id);
  }

  /** 定期清理：超时房间 / 空房 */
  cleanup() {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      const anyConnected = room.players.some((p) => p && p.connected);
      if (!anyConnected && now - room.lastActiveAt > EMPTY_TTL_MS) {
        this.closeRoom(room, 'ROOM_EXPIRED', '房间长时间无人，已自动关闭');
      } else if (now - room.createdAt > ROOM_TTL_MS) {
        this.closeRoom(room, 'ROOM_EXPIRED', '房间超过 2 小时，已自动关闭');
      }
    }
  }

  /** 发给客户端的房间公开数据（剔除敏感字段） */
  publicRoom(room) {
    return {
      roomCode: room.id,
      status: room.status,
      mode: room.mode,
      duties: room.duties,
      currentLevel: room.currentLevel,
      players: room.players.map((p) => p && {
        id: p.id,
        nickname: p.nickname,
        role: p.role,
        ready: p.ready,
        connected: p.connected,
        score: p.score,
        idx: p.idx,
      }),
    };
  }
}

module.exports = { RoomManager, GRACE_MS };
