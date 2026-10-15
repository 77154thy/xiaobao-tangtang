/**
 * Socket.IO 事件处理：房间流程 + 游戏实时通信（输入转发 / 快照转发 / 通关校验）。
 *
 * 客户端 → 服务端：createRoom, joinRoom, playerReady, changeMode, swapDuty,
 *                selectLevel, startGame, playerInput, levelComplete, playerDied,
 *                stateSnapshot, leaveRoom
 * 服务端 → 客户端：roomCreated, roomJoined, playerListUpdate, gameStart, levelStart,
 *                gameStateUpdate, gameOver, opponentInput, playerDied,
 *                opponentLeft, opponentRejoined, error
 */
'use strict';

const LEVELS_PER_MODE = 120;                       // 每种模式的关卡总数（与前端 constants.js 保持一致）
const CELEBRATE_MSG = '恭喜小宝和汤汤闯关成功，小宝真棒，加油下一关~';
const INPUT_RATE_LIMIT = 45;                       // 每秒最多转发的输入包数
const SNAPSHOT_RATE_LIMIT = 6;                     // 每秒最多转发的快照数

/** 每个_socket一个滑动窗口限频器 */
function makeRateLimiter(maxPerSec) {
  const window = { t: 0, count: 0 };
  return () => {
    const now = Date.now();
    if (now - window.t > 1000) { window.t = now; window.count = 0; }
    window.count++;
    return window.count <= maxPerSec;
  };
}

function register(io, rooms) {
  // 房间被服务端关闭时，通知房内在线玩家
  rooms.onRoomClosed = (socketId, code, message) => {
    io.to(socketId).emit('error', { code, message });
  };

  io.on('connection', (socket) => {
    const allowInput = makeRateLimiter(INPUT_RATE_LIMIT);
    const allowSnapshot = makeRateLimiter(SNAPSHOT_RATE_LIMIT);
    let joinedRoomCode = null; // 本 socket 当前所在房间

    const sendError = (code, message) => socket.emit('error', { code, message });
    const broadcastList = (room) =>
      io.to(room.id).emit('playerListUpdate', rooms.publicRoom(room));
    const emitTo = (room, idx, event, payload) => {
      const p = room.players[idx];
      if (p && p.connected && p.socketId) io.to(p.socketId).emit(event, payload);
    };

    /* ---------------- 房间流程 ---------------- */

    socket.on('createRoom', ({ nickname } = {}) => {
      const { room, player } = rooms.createRoom(nickname);
      player.socketId = socket.id;
      joinedRoomCode = room.id;
      socket.join(room.id);
      socket.emit('roomCreated', {
        roomCode: room.id,
        playerId: player.id,
        player: { idx: player.idx, role: player.role, nickname: player.nickname },
        room: rooms.publicRoom(room),
      });
    });

    socket.on('joinRoom', ({ roomCode, nickname, playerId } = {}) => {
      try {
        const { room, player, rejoined } = rooms.joinRoom(roomCode, nickname, playerId);
        player.socketId = socket.id;
        joinedRoomCode = room.id;
        socket.join(room.id);
        socket.emit('roomJoined', {
          roomCode: room.id,
          playerId: player.id,
          player: { idx: player.idx, role: player.role, nickname: player.nickname },
          room: rooms.publicRoom(room),
        });
        if (rejoined) {
          emitTo(room, 1 - player.idx, 'opponentRejoined', { nickname: player.nickname });
          // 游戏中断线重连：全员重新同步当前关卡
          if (room.status === 'playing') {
            io.to(room.id).emit('levelStart', {
              level: room.currentLevel,
              reason: 'rejoin',
              mode: room.mode,
              duties: room.duties,
              serverNow: Date.now(),
            });
          }
        }
        broadcastList(room);
      } catch (e) {
        sendError(e.code || 'JOIN_FAILED', e.message || '加入房间失败');
      }
    });

    socket.on('playerReady', ({ ready } = {}) => {
      const found = rooms.getBySocket(socket.id);
      if (!found) return sendError('NOT_IN_ROOM', '你不在任何房间中');
      found.player.ready = !!ready;
      found.room.lastActiveAt = Date.now();
      broadcastList(found.room);
    });

    socket.on('changeMode', ({ mode } = {}) => {
      const found = rooms.getBySocket(socket.id);
      if (!found) return sendError('NOT_IN_ROOM', '你不在任何房间中');
      const { room, player } = found;
      if (player.role !== 'host') return sendError('NOT_HOST', '只有房主可以切换模式');
      if (room.status === 'playing' && !room.settling) {
        return sendError('GAME_RUNNING', '本关进行中，请在结算后再切换模式');
      }
      if (mode !== 'sync' && mode !== 'dual') return sendError('BAD_MODE', '模式参数错误');
      room.mode = mode;
      room.lastActiveAt = Date.now();
      broadcastList(room);
    });

    socket.on('swapDuty', () => {
      const found = rooms.getBySocket(socket.id);
      if (!found) return sendError('NOT_IN_ROOM', '你不在任何房间中');
      const { room, player } = found;
      if (player.role !== 'host') return sendError('NOT_HOST', '只有房主可以互换职责');
      if (room.status === 'playing' && !room.settling) {
        return sendError('GAME_RUNNING', '本关进行中，请在结算后再互换职责');
      }
      room.duties = {
        moverIdx: 1 - room.duties.moverIdx,
        jumperIdx: 1 - room.duties.jumperIdx,
      };
      broadcastList(room);
    });

    socket.on('startGame', ({ level } = {}) => {
      const found = rooms.getBySocket(socket.id);
      if (!found) return sendError('NOT_IN_ROOM', '你不在任何房间中');
      const { room, player } = found;
      if (player.role !== 'host') return sendError('NOT_HOST', '只有房主可以开始游戏');
      const other = room.players[1];
      if (!other || !other.connected) return sendError('NO_OPPONENT', '等待对手加入');
      if (!other.ready) return sendError('NOT_READY', '对方还未准备');
      const lv = Math.min(LEVELS_PER_MODE, Math.max(1, Math.round(level) || 1));
      room.status = 'playing';
      room.settling = false;
      room.currentLevel = lv;
      room.levelStartAt = Date.now();
      room.lastActiveAt = Date.now();
      io.to(room.id).emit('gameStart', {
        mode: room.mode,
        level: lv,
        duties: room.duties,
        serverNow: Date.now(),
      });
    });

    /** 选关 / 下一关 / 重玩：统一由房主触发，服务器校验后广播 levelStart */
    socket.on('selectLevel', ({ level, reason } = {}) => {
      const found = rooms.getBySocket(socket.id);
      if (!found) return sendError('NOT_IN_ROOM', '你不在任何房间中');
      const { room, player } = found;
      if (player.role !== 'host') return sendError('NOT_HOST', '只有房主可以选择关卡');
      if (room.status !== 'playing') return sendError('NOT_PLAYING', '请先开始游戏');
      const lv = Math.min(LEVELS_PER_MODE, Math.max(1, Math.round(level) || 1));
      room.currentLevel = lv;
      room.settling = false;
      room.levelStartAt = Date.now();
      room.lastActiveAt = Date.now();
      io.to(room.id).emit('levelStart', {
        level: lv,
        reason: reason || 'select',
        mode: room.mode,
        duties: room.duties,
        serverNow: Date.now(),
      });
    });

    socket.on('leaveRoom', () => {
      const found = rooms.getBySocket(socket.id);
      if (!found) return;
      const { room, player } = found;
      const other = room.players[1 - player.idx];
      rooms.closeRoom(room, 'OPPONENT_LEFT', `${player.nickname} 已离开房间`);
      if (other && other.socketId) {
        io.to(other.socketId).emit('opponentLeft', { nickname: player.nickname, closed: true });
      }
      socket.leave(room.id);
      joinedRoomCode = null;
    });

    /** 延迟测量回声（客户端 HUD 显示 ping） */
    socket.on('pingx', (cb) => {
      if (typeof cb === 'function') cb();
    });

    socket.on('disconnect', () => {
      const result = rooms.handleDisconnect(socket.id);
      if (!result) return;
      const { room, player, other } = result;
      if (other && other.socketId) {
        io.to(other.socketId).emit('opponentLeft', {
          nickname: player.nickname,
          graceMs: 60000,
        });
      }
      joinedRoomCode = null;
    });

    /* ---------------- 游戏实时通信 ---------------- */

    /** 输入转发：服务器不解析按键语义，原样转发给对手（低延迟、近无状态） */
    socket.on('playerInput', (data) => {
      if (!allowInput()) return;
      const found = rooms.getBySocket(socket.id);
      if (!found) return;
      const { room, player } = found;
      emitTo(room, 1 - player.idx, 'opponentInput', {
        playerIdx: player.idx,
        seq: data && data.seq,
        l: !!(data && data.l),
        r: !!(data && data.r),
        j: !!(data && data.j),
      });
    });

    /** 主机状态快照转发（客机用于漂移校正） */
    socket.on('stateSnapshot', (data) => {
      if (!allowSnapshot()) return;
      const found = rooms.getBySocket(socket.id);
      if (!found || found.player.role !== 'host') return;
      emitTo(found.room, 1, 'gameStateUpdate', data);
    });

    /** 死亡表现同步（复活在各自本地即时进行，不设死亡次数） */
    socket.on('playerDied', (data) => {
      const found = rooms.getBySocket(socket.id);
      if (!found) return;
      emitTo(found.room, 1 - found.player.idx, 'playerDied', {
        playerIdx: found.player.idx,
        t: data && data.t,
      });
    });

    /**
     * 通关上报：任一端检测到双方到达出口即可上报；
     * 服务器校验关卡号一致且未在结算中（幂等：先到先得），再广播 gameOver。
     */
    socket.on('levelComplete', ({ level, timeMs, gems } = {}) => {
      const found = rooms.getBySocket(socket.id);
      if (!found) return;
      const { room } = found;
      if (room.status !== 'playing' || room.settling) return;
      if (Math.round(level) !== room.currentLevel) return;
      room.settling = true;
      room.lastActiveAt = Date.now();
      // 用服务器时间计算本关用时，保证两端一致
      const serverTime = Math.max(0, Math.min(2 * 3600 * 1000, Date.now() - room.levelStartAt));
      const finalLevel = room.currentLevel >= LEVELS_PER_MODE;
      if (!finalLevel) room.currentLevel += 1; // 通关后自动指向下一关
      io.to(room.id).emit('gameOver', {
        level,
        timeMs: serverTime || Math.round(timeMs) || 0,
        gems: gems || {},
        msg: finalLevel ? '恭喜小宝和汤汤通关了全部关卡！你们是最默契的搭档！' : CELEBRATE_MSG,
        isFinal: finalLevel,
        nextLevel: room.currentLevel,
        serverNow: Date.now(),
      });
    });
  });
}

module.exports = { register };
