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
})(window.XBT);
