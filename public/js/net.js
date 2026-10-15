/**
 * 网络层：Socket.IO 封装。
 * - 统一事件总线
 * - 会话凭证（roomCode + playerId）保存到 sessionStorage，断线自动重连回房
 * - 应用层 ping 测量（HUD 显示延迟）
 */
'use strict';

(function (XBT) {
  const listeners = {};
  let socket = null;
  let session = null; // { roomCode, playerId }

  try { session = JSON.parse(sessionStorage.getItem('xbt_session') || 'null'); } catch (e) { /* ignore */ }

  function saveSession(s) {
    session = s;
    if (s) sessionStorage.setItem('xbt_session', JSON.stringify(s));
    else sessionStorage.removeItem('xbt_session');
  }

  function on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); }
  function emitLocal(evt, data) { (listeners[evt] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } }); }

  function connect() {
    if (socket) return socket;
    socket = io({ // 同源连接；拆分部署时可传入后端地址
      reconnection: true,
      reconnectionDelay: 600,
      reconnectionDelayMax: 3000,
      timeout: 8000,
    });
    socket.on('connect', () => {
      emitLocal('net:connected');
      // 断线重连：带凭证自动回房
      if (session && session.roomCode && session.playerId) {
        socket.emit('joinRoom', {
          roomCode: session.roomCode,
          nickname: localStorage.getItem('xbt_nickname') || '玩家',
          playerId: session.playerId,
        });
      }
    });
    socket.on('disconnect', () => emitLocal('net:disconnected'));

    // 服务器事件 → 转成 net:xxx 本地事件
    for (const evt of ['roomCreated', 'roomJoined', 'playerListUpdate', 'gameStart',
      'levelStart', 'gameStateUpdate', 'gameOver', 'error',
      'opponentInput', 'playerDied', 'opponentLeft', 'opponentRejoined']) {
      socket.on(evt, (data) => emitLocal('net:' + evt, data));
    }

    socket.on('error', (data) => {
      // 服务端error：重连失败则清除会话凭证
      if (data && (data.code === 'REJOIN_FAILED' || data.code === 'ROOM_NOT_FOUND')) saveSession(null);
    });

    // ping 测量
    setInterval(() => {
      if (socket.connected) {
        const t0 = performance.now();
        socket.timeout(3000).emit('pingx', (err) => {
          if (!err) emitLocal('net:ping', Math.round(performance.now() - t0));
        });
      }
    }, 3000);

    return socket;
  }

  XBT.net = {
    connect, on,
    get connected() { return !!(socket && socket.connected); },
    createRoom(nickname) { connect().emit('createRoom', { nickname }); },
    joinRoom(roomCode, nickname) { connect().emit('joinRoom', { roomCode, nickname }); },
    setReady(ready) { socket && socket.emit('playerReady', { ready }); },
    changeMode(mode) { socket && socket.emit('changeMode', { mode }); },
    swapDuty() { socket && socket.emit('swapDuty'); },
    startGame(level) { socket && socket.emit('startGame', { level }); },
    selectLevel(level, reason) { socket && socket.emit('selectLevel', { level, reason }); },
    sendInput(state) { socket && socket.emit('playerInput', state); },
    sendSnapshot(snap) { socket && socket.emit('stateSnapshot', snap); },
    notifyDied(t) { socket && socket.emit('playerDied', { t }); },
    levelComplete(payload) { socket && socket.emit('levelComplete', payload); },
    leaveRoom() {
      socket && socket.emit('leaveRoom');
      saveSession(null);
    },
    setSession: saveSession,
    get session() { return session; },
  };
})(window.XBT);
