/**
 * 输入管理：键盘 + 触屏虚拟按键。
 * 按模式与职责过滤：dual 模式全部按键属于自己；sync 模式下
 * 只有自己职责对应的按键生效（方向手：左右；跳跃手：跳）。
 */
'use strict';

(function (XBT) {
  /**
   * @param opts { getMode, getDuty }  getDuty(): 'mover' | 'jumper' | null(dual)
   * @returns { state, bind, setVisible, destroy }
   */
  function createInput(opts) {
    const raw = { l: false, r: false, j: false };   // 键盘原始状态
    const touch = { l: false, r: false, j: false }; // 触屏按钮状态
    let onChange = null;

    function getDuty() { return opts.getDuty ? opts.getDuty() : null; }

    /** 合成我的有效输入（按模式/职责过滤） */
    function mine() {
      const duty = getDuty();
      if (!duty) return { l: raw.l || touch.l, r: raw.r || touch.r, j: raw.j || touch.j };
      if (duty === 'mover') return { l: raw.l || touch.l, r: raw.r || touch.r, j: false };
      return { l: false, r: false, j: raw.j || touch.j };
    }

    function fire() { if (onChange) onChange(mine()); }

    // ---- 键盘 ----
    const keyMap = {
      ArrowLeft: 'l', KeyA: 'l',
      ArrowRight: 'r', KeyD: 'r',
      ArrowUp: 'j', KeyW: 'j', Space: 'j',
    };
    function onKeyDown(e) {
      const k = keyMap[e.code];
      if (!k) return;
      e.preventDefault();
      if (!raw[k]) { raw[k] = true; fire(); }
    }
    function onKeyUp(e) {
      const k = keyMap[e.code];
      if (!k) return;
      raw[k] = false; fire();
    }

    // ---- 触屏按钮 ----
    function bindButton(el, key) {
      if (!el) return;
      const down = (e) => { e.preventDefault(); touch[key] = true; el.classList.add('active'); fire(); };
      const up = (e) => { e.preventDefault(); touch[key] = false; el.classList.remove('active'); fire(); };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
      // 防止 iOS 长按弹出菜单 / 双击缩放
      el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    function bind() {
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      bindButton(document.getElementById('btn-left'), 'l');
      bindButton(document.getElementById('btn-right'), 'r');
      bindButton(document.getElementById('btn-jump'), 'j');
      // iOS 音频解锁
      const unlock = () => { if (XBT.audio) XBT.audio.unlock(); };
      window.addEventListener('touchstart', unlock, { once: true });
      window.addEventListener('pointerdown', unlock, { once: true });
      window.addEventListener('keydown', unlock, { once: true });
    }

    /** 按职责显示/隐藏虚拟按键 */
    function setVisible() {
      const duty = getDuty();
      const bl = document.getElementById('btn-left');
      const br = document.getElementById('btn-right');
      const bj = document.getElementById('btn-jump');
      if (!bl || !br || !bj) return;
      const showMove = !duty || duty === 'mover';
      const showJump = !duty || duty === 'jumper';
      bl.style.display = br.style.display = showMove ? 'flex' : 'none';
      bj.style.display = showJump ? 'flex' : 'none';
    }

    function destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      raw.l = raw.r = raw.j = touch.l = touch.r = touch.j = false;
    }

    return {
      bind, setVisible, destroy,
      set onChange(fn) { onChange = fn; },
      get state() { return mine(); },
    };
  }

  XBT.createInput = createInput;

  /**
   * 单机双人双输入源（同屏零延迟模式）：
   *   P1（小宝）：键盘 A/D 移动、W 跳跃；触屏左半区 ◀▶⬆
   *   P2（汤汤）：键盘 ←/→ 移动、↑ 或 空格 跳跃；触屏右半区 ◀▶⬆
   * 心有灵犀模式下由 setVisible 过滤：P1 只有方向键，P2 只有跳跃键。
   */
  function createLocalInputs() {
    const p1 = { l: false, r: false, j: false };
    const p2 = { l: false, r: false, j: false };
    const map1 = { KeyA: 'l', KeyD: 'r', KeyW: 'j' };        // S 无用途
    const map2 = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'j', Space: 'j' };

    function apply(state, code, map, down) {
      const k = map[code];
      if (!k) return false;
      if (state[k] !== down) { state[k] = down; return true; }
      return false;
    }
    function onKeyDown(e) {
      let used = false;
      if (apply(p1, e.code, map1, true)) used = true;
      if (apply(p2, e.code, map2, true)) used = true;
      if (used) e.preventDefault();
    }
    function onKeyUp(e) {
      let used = false;
      if (apply(p1, e.code, map1, false)) used = true;
      if (apply(p2, e.code, map2, false)) used = true;
      if (used) e.preventDefault();
    }

    function bindTouch(el, state, key) {
      if (!el) return;
      const down = (e) => { e.preventDefault(); state[key] = true; el.classList.add('active'); };
      const up = (e) => { e.preventDefault(); state[key] = false; el.classList.remove('active'); };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
      el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    function bind() {
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      bindTouch(document.getElementById('p1-left'), p1, 'l');
      bindTouch(document.getElementById('p1-right'), p1, 'r');
      bindTouch(document.getElementById('p1-jump'), p1, 'j');
      bindTouch(document.getElementById('p2-left'), p2, 'l');
      bindTouch(document.getElementById('p2-right'), p2, 'r');
      bindTouch(document.getElementById('p2-jump'), p2, 'j');
      const unlock = () => { if (XBT.audio) XBT.audio.unlock(); };
      window.addEventListener('touchstart', unlock, { once: true });
      window.addEventListener('pointerdown', unlock, { once: true });
      window.addEventListener('keydown', unlock, { once: true });
    }

    /** 按模式显示按键：dual 全显示；sync 时 P1 只留方向、P2 只留跳跃 */
    function setVisible(mode) {
      const sync = mode === 'sync';
      const conf = { 'p1-jump': sync, 'p2-left': sync, 'p2-right': sync };
      for (const id in conf) {
        const el = document.getElementById(id);
        if (el) el.style.display = conf[id] ? 'none' : 'flex';
      }
    }

    function destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      p1.l = p1.r = p1.j = false;
      p2.l = p2.r = p2.j = false;
    }

    return { p1, p2, bind, setVisible, destroy };
  }

  XBT.createLocalInputs = createLocalInputs;
})(window.XBT);
