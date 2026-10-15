/**
 * 主控制器：页面状态机 + 游戏主循环 + 事件接线。
 */
'use strict';

(function (XBT) {
  const { $, showScreen, toast, renderRoom, buildLevelPicker, showSettle, hideSettle, updateHud } = XBT.ui;
  const net = XBT.net;

  const STEP = 1 / 60;
  const app = {
    nickname: localStorage.getItem('xbt_nickname') || '',
    myIdx: 0,
    room: null,        // 最近一次 playerListUpdate 的房间公开数据
    game: null,
    renderer: null,
    input: null,
    mode: 'dual',
    duties: { moverIdx: 0, jumperIdx: 1 },
    level: 1,
    levelStartTime: 0,
    completeSent: false,
    settleTimeout: null,
    inputSeq: 0,
    ping: null,
  };

  /* ================= 工具 ================= */

  const isHost = () => !!(app.room && app.room.players[app.myIdx] && app.room.players[app.myIdx].role === 'host');
  const myDuty = () => app.mode === 'sync'
    ? (app.duties.moverIdx === app.myIdx ? 'mover' : 'jumper')
    : null;
  const names = () => {
    const ps = (app.room && app.room.players) || [];
    return [ps[0] ? ps[0].nickname : '小宝', ps[1] ? ps[1].nickname : '汤汤'];
  };

  function saveBest(mode, level, timeMs) {
    const key = `xbt_best_${mode}_${level}`;
    const old = Number(localStorage.getItem(key) || 0);
    if (!old || timeMs < old) localStorage.setItem(key, String(Math.round(timeMs)));
  }

  /* ================= 页面流转 ================= */

  function resetToHome(msg) {
    net.leaveRoom();
    app.room = null;
    app.game = null;
    clearInterval(snapTimer);
    clearInterval(inputTimer);
    clearTimeout(app.settleTimeout);
    hideSettle();
    showScreen('home');
    if (msg) toast(msg, 3200);
  }

  // —— 首页 ——
  function bindHome() {
    const nickEl = $('#nickname');
    nickEl.value = app.nickname;
    nickEl.addEventListener('input', () => {
      app.nickname = nickEl.value.trim().slice(0, 12);
      localStorage.setItem('xbt_nickname', app.nickname);
    });
    $('#btn-create').onclick = () => {
      if (!app.nickname) { toast('先给自己起个名字吧！'); nickEl.focus(); return; }
      XBT.audio.play('click');
      net.createRoom(app.nickname);
    };
    $('#btn-join').onclick = () => {
      if (!app.nickname) { toast('先给自己起个名字吧！'); nickEl.focus(); return; }
      const code = $('#room-code-input').value.trim().toUpperCase();
      if (code.length !== 4) { toast('请输入 4 位房间号'); return; }
      XBT.audio.play('click');
      net.joinRoom(code, app.nickname);
    };
  }

  // —— 等待房间 ——
  function bindRoom() {
    $('#btn-ready').onclick = () => {
      XBT.audio.play('click');
      const me = app.room && app.room.players[app.myIdx];
      net.setReady(!(me && me.ready));
    };
    $('#btn-start').onclick = () => {
      if (!isHost()) return;
      XBT.audio.play('click');
      net.startGame(app.room.currentLevel);
    };
    $('#mode-dual').onclick = () => { if (isHost()) net.changeMode('dual'); };
    $('#mode-sync').onclick = () => { if (isHost()) net.changeMode('sync'); };
    $('#btn-swap').onclick = () => { if (isHost()) net.swapDuty(); };
    $('#btn-pick-room').onclick = () => openPicker('room');
    $('#btn-leave').onclick = () => resetToHome('已离开房间');
    $('#btn-copy').onclick = () => {
      const code = $('#room-code').textContent;
      if (navigator.clipboard) navigator.clipboard.writeText(code).then(() => toast('房间号已复制：' + code));
      else toast('房间号：' + code);
    };
  }

  // —— 选关面板 ——
  let pickerFrom = 'room';
  function openPicker(from) {
    pickerFrom = from;
    const mode = (app.room && app.room.mode) || app.mode;
    const current = from === 'settle' ? app.level : ((app.room && app.room.currentLevel) || 1);
    $('#picker-title').textContent = `选择关卡（${XBT.MODE_LABEL[mode]}）`;
    buildLevelPicker($('#picker-grid'), mode, current, (lv) => {
      closePicker();
      if (from === 'settle') {
        if (isHost()) net.selectLevel(lv, 'select');
      } else if (isHost()) {
        net.startGame(lv);
      } else toast('只有房主可以选择关卡');
    });
    $('#overlay-picker').classList.add('show');
  }
  function closePicker() { $('#overlay-picker').classList.remove('show'); }

  // —— 游戏页按钮 ——
  function bindGame() {
    $('#btn-exit-game').onclick = () => resetToHome('已退出游戏');
    $('#btn-mute').onclick = () => {
      const m = XBT.audio.toggleMute();
      $('#btn-mute').textContent = m ? '🔇' : '🔊';
    };
    $('#btn-next').onclick = () => {
      clearTimeout(app.settleTimeout);
      if (isHost()) net.selectLevel(app.nextLevel || app.level + 1, 'next');
    };
    $('#btn-replay').onclick = () => {
      clearTimeout(app.settleTimeout);
      if (isHost()) net.selectLevel(app.level, 'replay');
    };
    $('#btn-pick-settle').onclick = () => { clearTimeout(app.settleTimeout); openPicker('settle'); };
    $('#btn-back-room').onclick = () => resetToHome('已回到首页');
    $('#btn-close-picker').onclick = closePicker;
  }

  /* ================= 关卡启动与主循环 ================= */

  const canvas = $('#game-canvas');

  function startLevel(mode, level, duties) {
    app.mode = mode;
    app.level = level;
    app.duties = duties;
    app.completeSent = false;
    clearTimeout(app.settleTimeout);
    hideSettle();
    closePicker();

    const data = XBT.genLevel(mode, level);
    app.game = XBT.createGame(data, {
      myIdx: app.myIdx, mode, duties,
    });
    if (!app.renderer) app.renderer = XBT.createRenderer(canvas);
    app.renderer.resize();
    app.levelStartTime = performance.now();

    if (!app.input) {
      app.input = XBT.createInput({ getDuty: myDuty });
      app.input.onChange = () => sendInputNow();
      app.input.bind();
    }
    app.input.setVisible();
    showScreen('game');
    $('#btn-mute').textContent = XBT.audio.muted ? '🔇' : '🔊';
    toast(data.hint, 3500);

    // 视口锁定（移动端尽力而为）
    try {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
        document.documentElement.requestFullscreen().catch(() => {});
        if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
      }
    } catch (e) { /* ignore */ }
  }

  // 输入上报：变化即发 + 50ms 心跳，保证对手端最迟 50ms 收到
  function sendInputNow() {
    if (!app.game || !net.connected) return;
    app.game.setMyInput(app.input.state); // 本机模拟零延迟：直接写本地
    net.sendInput({ seq: app.inputSeq++, ...app.input.state });
  }
  const inputTimer = setInterval(() => {
    if (app.game && document.getElementById('screen-game').classList.contains('active')) sendInputNow();
  }, 50);

  /**
   * 兜底模拟器：浏览器会对后台/被遮挡的标签页暂停或限速 rAF，
   * 一旦发现 rAF 静默超过 120ms，就用定时器补齐这段时间的模拟，
   * 保证任何环境下双方进度一致（单设备双窗口测试时尤其重要）。
   */
  const simFallbackTimer = setInterval(() => {
    if (!app.game || !document.getElementById('screen-game').classList.contains('active')) return;
    const now = performance.now();
    if (now - (app.lastSimAt || 0) < 120) return; // rAF 正常在跑，无需兜底
    const elapsed = Math.min(1, (now - (app.lastSimAt || now)) / 1000);
    app.game.setMyInput(app.input.state);
    const n = Math.min(60, Math.round(elapsed / STEP));
    for (let i = 0; i < n; i++) app.game.step(STEP);
    const evs = app.game.events.splice(0, app.game.events.length);
    // 兜底期间丢弃纯表现类事件，只保留需要联网/提示的关键事件
    handleGameEvents(evs.filter((e) => e.type === 'complete' || e.type === 'death' || e.type === 'enterExit'));
    app.lastSimAt = now;
  }, 100);

  // 房主快照：每 500ms 广播一次，供客人校正漂移
  const snapTimer = setInterval(() => {
    if (app.game && app.myIdx === 0 && document.getElementById('screen-game').classList.contains('active')) {
      net.sendSnapshot({
        t: app.game.t,
        chars: app.game.chars.map((c) => ({ x: Math.round(c.x), y: Math.round(c.y) })),
        gems: [...app.game.gemsTaken],
      });
    }
  }, 500);

  // 引擎事件 → 音效 / 网络（事件数组由 raf 统一切出后分发给处理方与渲染器）
  function handleGameEvents(evs) {
    const g = app.game;
    for (const ev of evs) {
      switch (ev.type) {
        case 'jump': XBT.audio.play('jump'); break;
        case 'land': XBT.audio.play('land'); break;
        case 'gem': XBT.audio.play('gem'); break;
        case 'spring': XBT.audio.play('spring'); break;
        case 'death':
          XBT.audio.play('death');
          if (ev.idx === app.myIdx) net.notifyDied(g.t);
          break;
        case 'respawn': XBT.audio.play('respawn'); break;
        case 'enterExit':
          if (g.chars[0].inExit && g.chars[1].inExit) XBT.audio.play('win');
          else toast(`${names()[ev.idx]} 到达终点，等一等队友！`, 1800);
          break;
        case 'complete':
          if (!app.completeSent) {
            app.completeSent = true;
            net.levelComplete({
              level: app.level,
              timeMs: performance.now() - app.levelStartTime,
              gems: { p0: g.gemBy[0], p1: g.gemBy[1] },
            });
          }
          break;
      }
    }
  }

  const raf = () => {
    requestAnimationFrame(raf);
    const now = performance.now();
    const dt = Math.min(0.1, (now - (raf.last || now)) / 1000);
    raf.last = now;
    if (!app.game || !document.getElementById('screen-game').classList.contains('active')) return;
    app.game.setMyInput(app.input.state); // 本机输入 → 本地模拟（对手输入由网络事件写入）
    let acc = dt, steps = 0;
    while (acc >= STEP && steps < 5) { app.game.step(STEP); acc -= STEP; steps++; }
    app.lastSimAt = now; // 供兜底模拟器判断 rAF 是否活跃
    const evs = app.game.events.splice(0, app.game.events.length);
    handleGameEvents(evs);
    app.renderer.draw(app.game, dt, { myIdx: app.myIdx, names: names(), events: evs });
    // HUD 节流刷新
    if (!raf.hudT || now - raf.hudT > 200) {
      raf.hudT = now;
      updateHud({
        level: app.level,
        time: ((now - app.levelStartTime) / 1000).toFixed(1) + 's',
        gems: `${app.game.gemBy[0] + app.game.gemBy[1]}/${app.game.rawLevel.gemTotal}`,
        mode: app.mode,
        duty: app.mode === 'sync' ? (myDuty() === 'mover' ? '方向手' : '跳跃手')
          : (app.myIdx === 0 ? '小宝' : '汤汤'),
        ping: app.ping,
      });
    }
  };

  /* ================= 网络事件 ================= */

  function bindNet() {
    net.on('net:connected', () => {
      if (app.room) toast('已重新连接服务器');
    });
    net.on('net:disconnected', () => {
      if (app.room) toast('连接断开，正在重连…', 5000);
    });
    net.on('net:ping', (ms) => { app.ping = ms; });

    net.on('net:roomCreated', (data) => {
      app.myIdx = data.player.idx;
      app.room = data.room;
      net.setSession({ roomCode: data.roomCode, playerId: data.playerId });
      showScreen('room');
      renderRoom(data.room, app.myIdx);
      toast(`房间创建成功！把房间号 ${data.roomCode} 告诉小伙伴`);
    });

    net.on('net:roomJoined', (data) => {
      app.myIdx = data.player.idx;
      app.room = data.room;
      net.setSession({ roomCode: data.roomCode, playerId: data.playerId });
      showScreen('room');
      renderRoom(data.room, app.myIdx);
      if (data.room.status === 'playing') {
        // 断线重连回房：直接回到当前关卡（服务器会补发 levelStart）
        toast('已重新加入房间！');
      } else {
        toast(`加入房间 ${data.roomCode} 成功！`);
      }
    });

    net.on('net:playerListUpdate', (data) => {
      app.room = data;
      if (document.getElementById('screen-room').classList.contains('active')) {
        renderRoom(data, app.myIdx);
      }
      if (data.mode) { app.mode = data.mode; app.duties = data.duties || app.duties; }
    });

    net.on('net:gameStart', (data) => {
      startLevel(data.mode, data.level, data.duties);
    });

    net.on('net:levelStart', (data) => {
      // 下一关 / 重玩 / 选关 / 重连同步
      startLevel(data.mode || app.mode, data.level, data.duties || app.duties);
      if (data.reason === 'next') toast(`第 ${data.level} 关 开始！`, 1600);
    });

    net.on('net:gameOver', (data) => {
      saveBest(app.mode, data.level, data.timeMs);
      app.nextLevel = data.nextLevel;
      showSettle(data, {
        isHost: isHost(),
        gemTotal: app.game ? app.game.rawLevel.gemTotal : null,
        timer: app.settleTimer,
      });
      // 房主 5 秒后自动进入下一关（可被手动按钮取消）
      clearTimeout(app.settleTimeout);
      if (isHost() && !data.isFinal) {
        app.settleTimeout = setTimeout(() => {
          net.selectLevel(data.nextLevel, 'next');
        }, 5200);
      }
    });

    net.on('net:opponentInput', (data) => {
      if (app.game) app.game.setPeerInput({ l: data.l, r: data.r, j: data.j });
    });

    net.on('net:gameStateUpdate', (snap) => {
      if (app.game) app.game.applySnapshot(snap);
    });

    net.on('net:playerDied', (data) => {
      if (app.game && data.playerIdx !== app.myIdx) app.game.forceDeath(data.playerIdx);
    });

    net.on('net:opponentLeft', (data) => {
      toast(`${data.nickname || '对方'} 掉线了，等待回来（60 秒内有效）…`, 5000);
    });

    net.on('net:opponentRejoined', (data) => {
      toast(`${data.nickname || '对方'} 回来了！继续加油！`);
    });

    net.on('net:error', (data) => {
      const closed = ['OPPONENT_LEFT', 'OPPONENT_TIMEOUT', 'ROOM_EXPIRED', 'ROOM_NOT_FOUND', 'REJOIN_FAILED'].includes(data.code);
      if (closed && app.room) resetToHome(data.message);
      else toast(data.message || '操作失败', 3200);
    });
  }

  /* ================= 启动 ================= */

  // 调试/自动化测试句柄（不影响正常游玩）
  window.__xbtApp = app;

  window.addEventListener('DOMContentLoaded', () => {
    bindHome();
    bindRoom();
    bindGame();
    bindNet();
    net.connect();
    requestAnimationFrame(raf);
  });
})(window.XBT);
