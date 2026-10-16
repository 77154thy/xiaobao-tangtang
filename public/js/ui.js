/**
 * UI 模块：DOM 辅助函数、房间面板渲染、选关面板、结算面板、提示浮层。
 */
'use strict';

(function (XBT) {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  /** 切换主屏幕：home / room / game */
  function showScreen(name) {
    $$('.screen').forEach((s) => s.classList.remove('active'));
    const el = document.getElementById('screen-' + name);
    if (el) el.classList.add('active');
  }

  /** 顶部浮动提示 */
  let toastTimer = null;
  function toast(msg, ms) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms || 2600);
  }

  /** 渲染等待房间面板 */
  function renderRoom(room, myIdx) {
    const [p0, p1] = room.players;
    const me = room.players[myIdx];
    $('#room-code').textContent = room.roomCode;
    // 模式切换（仅房主可点）
    const modeBox = $('#mode-select');
    modeBox.classList.toggle('host-only', !(me && me.role === 'host'));
    $('#mode-dual').classList.toggle('on', room.mode === 'dual');
    $('#mode-sync').classList.toggle('on', room.mode === 'sync');
    $('#mode-desc').textContent = room.mode === 'dual'
      ? '各自控制自己的角色，配合到达终点'
      : '一人管方向、一人管跳跃，两个角色同步移动';
    // 职责互换（仅 sync 模式 + 房主）
    const dutyRow = $('#duty-row');
    dutyRow.style.display = room.mode === 'sync' ? 'flex' : 'none';
    dutyRow.classList.toggle('host-only', !(me && me.role === 'host'));
    const moverName = room.players[room.duties.moverIdx] ? room.players[room.duties.moverIdx].nickname : '?';
    const jumperName = room.players[room.duties.jumperIdx] ? room.players[room.duties.jumperIdx].nickname : '?';
    $('#duty-text').textContent = `方向手：${moverName} ｜ 跳跃手：${jumperName}`;
    // 玩家卡片
    for (let i = 0; i < 2; i++) {
      const p = room.players[i];
      const card = $('#player-card-' + i);
      card.classList.toggle('filled', !!p);
      card.classList.toggle('me', !!(p && i === myIdx));
      $('#player-name-' + i).textContent = p
        ? `${p.nickname}${p.role === 'host' ? '（房主）' : ''}${i === myIdx ? '·我' : ''}`
        : '等待加入…';
      $('#player-role-' + i).textContent = p ? (i === 0 ? '🔥 小宝' : '💧 汤汤') : '';
      const readyTag = $('#player-ready-' + i);
      if (p) {
        readyTag.textContent = p.ready ? '✔ 已准备' : '未准备';
        readyTag.className = 'ready-tag ' + (p.ready ? 'ok' : 'no');
      } else readyTag.textContent = '';
    }
    // 就绪按钮 / 开始按钮
    const startBtn = $('#btn-start');
    const readyBtn = $('#btn-ready');
    const allReady = p0 && p1 && p0.ready && p1.ready;
    if (me && me.role === 'host') {
      startBtn.style.display = 'block';
      readyBtn.style.display = 'none';
      startBtn.disabled = !allReady;
      startBtn.textContent = allReady
        ? `🚀 开始闯关（第 ${room.currentLevel} 关）`
        : (p1 ? '等待对方准备…' : '等待玩家加入…');
    } else {
      startBtn.style.display = 'none';
      readyBtn.style.display = 'block';
      readyBtn.textContent = me && me.ready ? '取消准备' : '我准备好了！';
      readyBtn.classList.toggle('primary', !(me && me.ready));
    }
    // 房主专属标记
    $$('.host-only').forEach((el) => {
      el.classList.toggle('disabled', !(me && me.role === 'host'));
    });
  }

  /** 选关面板：120 个关卡按钮 + 最佳纪录 */
  function buildLevelPicker(container, mode, currentLevel, onPick) {
    container.innerHTML = '';
    for (let lv = 1; lv <= XBT.LEVELS_PER_MODE; lv++) {
      const btn = document.createElement('button');
      btn.className = 'lv-btn' + (lv === currentLevel ? ' current' : '');
      const best = localStorage.getItem(`xbt_best_${mode}_${lv}`);
      const ch = XBT.chapterOf(lv);
      btn.innerHTML = `<b>${lv}</b><i>${best ? (best / 1000).toFixed(1) + 's' : '&nbsp;'}</i>`;
      btn.title = `第${ch}章`;
      btn.onclick = () => { XBT.audio.play('click'); onPick(lv); };
      container.appendChild(btn);
    }
  }

  /** 结算面板 */
  function showSettle(data, opts) {
    $('#settle-msg').textContent = data.msg;
    $('#settle-level').textContent = `第 ${data.level} 关`;
    $('#settle-time').textContent = (data.timeMs / 1000).toFixed(1) + ' 秒';
    const gt = (opts.gemTotal != null) ? opts.gemTotal : '?';
    $('#settle-gems').textContent = `${data.gems.p0 + data.gems.p1} / ${gt}`;
    const isHost = opts.isHost;
    $('#btn-next').style.display = isHost && !data.isFinal ? 'inline-block' : 'none';
    $('#btn-replay').style.display = isHost ? 'inline-block' : 'none';
    $('#settle-tip').textContent = isHost
      ? (data.isFinal ? '你们通关了所有关卡！' : '5 秒后自动进入下一关，也可以手动选择')
      : (data.isFinal ? '你们通关了所有关卡！' : '房主正在选择下一关…');
    // 倒计时
    let cd = 5;
    const cdEl = $('#settle-count');
    clearInterval(opts.timer);
    const tick = () => {
      if (data.isFinal) { cdEl.textContent = ''; return; }
      cdEl.textContent = isHost ? `${cd}` : '';
      if (cd-- <= 0) clearInterval(opts.timer);
    };
    tick();
    opts.timer = setInterval(tick, 1000);
    $('#overlay-settle').classList.add('show');
  }
  function hideSettle() {
    $('#overlay-settle').classList.remove('show');
  }

  /** 更新游戏内 HUD */
  function updateHud(info) {
    $('#hud-level').textContent = `第 ${info.level} 关`;
    $('#hud-time').textContent = info.time;
    $('#hud-gems').textContent = `💎 ${info.gems}`;
    $('#hud-ping').textContent = info.ping != null ? `${info.ping}ms` : '--';
    $('#hud-ping').style.display = info.hidePing ? 'none' : '';
    $('#hud-mode').textContent = info.modeText
      || (XBT.MODE_LABEL[info.mode] + (info.duty ? `·你是${info.duty}` : ''));
  }

  XBT.ui = {
    $, $$, showScreen, toast, renderRoom, buildLevelPicker,
    showSettle, hideSettle, updateHud,
  };
})(window.XBT);
