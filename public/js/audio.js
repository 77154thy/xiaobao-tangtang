/**
 * 音效管理：WebAudio 合成音效（零素材，加载即用）。
 * iOS 需要用户首次触摸后才能出声，input.js 中已做解锁。
 */
'use strict';

(function (XBT) {
  let actx = null;
  let master = null;
  let muted = localStorage.getItem('xbt_mute') === '1';

  function ensure() {
    if (actx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      actx = new AC();
      master = actx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(actx.destination);
      return true;
    } catch (e) { return false; }
  }

  /** 基础音符：type 波形，f0→f1 滑频，dur 时长，vol 音量，delay 延迟 */
  function tone(type, f0, f1, dur, vol, delay) {
    if (!ensure()) return;
    const t0 = actx.currentTime + (delay || 0);
    const osc = actx.createOscillator();
    const g = actx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol) {
    if (!ensure()) return;
    const len = Math.floor(actx.sampleRate * dur);
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = actx.createBufferSource();
    src.buffer = buf;
    const g = actx.createGain();
    g.gain.value = vol;
    src.connect(g); g.connect(master);
    src.start();
  }

  const sfx = {
    jump: () => tone('square', 320, 620, 0.14, 0.16),
    land: () => noise(0.08, 0.12),
    gem: () => { tone('sine', 880, 880, 0.09, 0.2); tone('sine', 1320, 1320, 0.12, 0.18, 0.07); },
    death: () => { tone('sawtooth', 300, 70, 0.4, 0.22); noise(0.2, 0.15); },
    spring: () => tone('square', 200, 900, 0.22, 0.2),
    door: () => tone('triangle', 500, 240, 0.18, 0.18),
    respawn: () => tone('sine', 500, 900, 0.16, 0.16),
    click: () => tone('triangle', 700, 500, 0.07, 0.12),
    win: () => {
      const seq = [523, 659, 784, 1047];
      seq.forEach((f, i) => tone('triangle', f, f, 0.22, 0.22, i * 0.14));
      tone('sine', 1568, 1568, 0.4, 0.12, 0.56);
    },
  };

  XBT.audio = {
    play(name) { if (sfx[name]) sfx[name](); },
    unlock() { if (ensure() && actx.state === 'suspended') actx.resume(); },
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      localStorage.setItem('xbt_mute', muted ? '1' : '0');
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
  };
})(window.XBT);
