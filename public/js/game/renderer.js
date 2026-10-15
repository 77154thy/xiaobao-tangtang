/**
 * 渲染器：Canvas 2D 绘制关卡、角色、机关与粒子特效。
 * 内部逻辑分辨率 1280x720，按窗口等比缩放并适配高分屏。
 */
'use strict';

(function (XBT) {
  const T = XBT.TILE;
  const C = XBT.COLORS;

  function createRenderer(canvas) {
    const ctx = canvas.getContext('2d');
    const particles = [];
    let flashT = 0;        // 死亡红屏
    let flashColor = '#ff3b30';
    let shakeT = 0;
    let completeT = 0;     // 通关彩带
    let springAnim = [0, 0];

    /* ---------- 自适应尺寸 ---------- */
    function resize() {
      const vw = window.innerWidth, vh = window.innerHeight;
      const scale = Math.min(vw / XBT.VIEW_W, vh / XBT.VIEW_H);
      const cw = Math.floor(XBT.VIEW_W * scale), ch = Math.floor(XBT.VIEW_H * scale);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.style.width = cw + 'px';
      canvas.style.height = ch + 'px';
      canvas.width = Math.floor(cw * dpr);
      canvas.height = Math.floor(ch * dpr);
      ctx.setTransform((cw * dpr) / XBT.VIEW_W, 0, 0, (cw * dpr) / XBT.VIEW_W, 0, 0);
      canvas.__scale = scale;
    }
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 200));
    resize();

    /* ---------- 粒子 ---------- */
    function burst(x, y, color, n, speed, grav) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.8);
        particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.4, life: 0.5 + Math.random() * 0.5, age: 0, color, size: 2 + Math.random() * 4, grav: grav || 600 });
      }
    }
    function confetti() {
      const colors = ['#ff5252', '#ffd54a', '#4fc3f7', '#81c784', '#ba68c8', '#ff8a65'];
      for (let i = 0; i < 90; i++) {
        particles.push({ x: Math.random() * XBT.VIEW_W, y: -20 - Math.random() * 200, vx: (Math.random() - 0.5) * 60, vy: 60 + Math.random() * 120, life: 2.5 + Math.random(), age: 0, color: colors[i % colors.length], size: 4 + Math.random() * 5, grav: 30, conf: true });
      }
    }

    /** 消费引擎事件数组（由 main.js 统一切出后传入），生成粒子/特效 */
    function handleEvents(game, events) {
      for (const ev of events) {
        switch (ev.type) {
          case 'death':
            burst(ev.x, ev.y - 18, ev.idx === 0 ? C.p0 : C.p1, 26, 240);
            flashT = 0.35; flashColor = ev.idx === 0 ? 'rgba(255,80,40,' : 'rgba(60,150,255,';
            shakeT = 0.25;
            break;
          case 'respawn':
            burst(game.chars[ev.idx].x, game.chars[ev.idx].y - 18, ev.idx === 0 ? C.p0 : C.p1, 14, 150, 100);
            break;
          case 'gem':
            burst(ev.x, ev.y, C.gem, 12, 160, 250);
            break;
          case 'jump':
            burst(game.chars[ev.idx].x, game.chars[ev.idx].y, '#ffffff', 6, 90, 300);
            break;
          case 'land':
            burst(game.chars[ev.idx].x, game.chars[ev.idx].y, '#e8e0d0', 8, 80, 200);
            break;
          case 'spring':
            springAnim[ev.idx] = 0.3;
            burst(game.chars[ev.idx].x, game.chars[ev.idx].y, C.spring, 14, 200, 150);
            break;
          case 'complete':
            completeT = 4;
            confetti();
            break;
        }
      }
    }

    /* ---------- 各元素绘制 ---------- */

    function drawBackground(game) {
      const hue = [200, 130, 265, 20, 175, 320][(game.rawLevel.chapter - 1) % 6];
      const g = ctx.createLinearGradient(0, 0, 0, XBT.VIEW_H);
      g.addColorStop(0, `hsl(${hue}, 62%, 72%)`);
      g.addColorStop(0.65, `hsl(${hue + 15}, 55%, 84%)`);
      g.addColorStop(1, `hsl(${hue + 25}, 48%, 92%)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, XBT.VIEW_W, XBT.VIEW_H);

      // 太阳
      ctx.fillStyle = 'rgba(255, 244, 180, 0.9)';
      ctx.beginPath(); ctx.arc(1080, 110, 52, 0, Math.PI * 2); ctx.fill();

      // 云（随时间飘动）
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (let i = 0; i < 4; i++) {
        const cx = ((i * 380 + game.t * (12 + i * 5)) % (XBT.VIEW_W + 260)) - 130;
        const cy = 70 + i * 42;
        cloud(cx, cy, 1 + (i % 2) * 0.4);
      }
      // 远山
      ctx.fillStyle = `hsla(${hue}, 40%, 60%, 0.45)`;
      hill(0, 560, 1);
      ctx.fillStyle = `hsla(${hue + 20}, 38%, 52%, 0.5)`;
      hill(-160, 600, 1.4);
    }
    function cloud(x, y, s) {
      ctx.beginPath();
      ctx.arc(x, y, 24 * s, 0, Math.PI * 2);
      ctx.arc(x + 26 * s, y - 10 * s, 18 * s, 0, Math.PI * 2);
      ctx.arc(x + 52 * s, y, 22 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    function hill(off, base, s) {
      ctx.beginPath();
      ctx.moveTo(-100 + off, XBT.VIEW_H);
      for (let x = -100; x <= XBT.VIEW_W + 100; x += 40) {
        ctx.lineTo(x + off, base - Math.abs(Math.sin((x / 400 + s) * Math.PI)) * 130 * s);
      }
      ctx.lineTo(XBT.VIEW_W + 100 + off, XBT.VIEW_H);
      ctx.fill();
    }

    function rr(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function drawSolids(game) {
      for (const s of game.level.solids) {
        // 泥土主体
        const g = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
        g.addColorStop(0, '#b07a4e');
        g.addColorStop(1, '#8a5a38');
        ctx.fillStyle = g;
        rr(s.x, s.y, s.w, s.h, 6); ctx.fill();
        // 草皮顶
        ctx.fillStyle = C.ground;
        rr(s.x, s.y, s.w, Math.min(12, s.h), 6); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(s.x + 4, s.y + 3, Math.max(0, s.w - 8), 3);
      }
    }

    function drawLiquids(game) {
      for (const lq of game.level.liquids) {
        const pal = lq.kind === 'fire' ? [C.fire, C.fireDeep] : lq.kind === 'water' ? [C.water, C.waterDeep] : [C.toxic, C.toxicDeep];
        const g = ctx.createLinearGradient(0, lq.y, 0, lq.y + lq.h);
        g.addColorStop(0, pal[0]); g.addColorStop(1, pal[1]);
        ctx.fillStyle = g;
        // 波动水面
        ctx.beginPath();
        ctx.moveTo(lq.x, lq.y + lq.h);
        for (let x = 0; x <= lq.w; x += 10) {
          const wy = lq.y + Math.sin((lq.x + x) / 26 + game.t * 3.2) * 4 + 4;
          ctx.lineTo(lq.x + x, wy);
        }
        ctx.lineTo(lq.x + lq.w, lq.y + lq.h);
        ctx.closePath(); ctx.fill();
        // 高光气泡
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        for (let i = 0; i < lq.w / 34; i++) {
          const bx = lq.x + 14 + i * 34 + Math.sin(game.t * 2 + i) * 6;
          const by = lq.y + 16 + ((game.t * 22 + i * 29) % Math.max(10, lq.h - 22));
          ctx.beginPath(); ctx.arc(bx, by, 2.4, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    function drawSpikes(game) {
      for (let i = 0; i < game.level.spikes.length; i++) {
        const sp = game.level.spikes[i];
        const up = game.spikeStates[i];
        const n = Math.max(1, Math.round(sp.w / 16));
        const sw = sp.w / n;
        const dir = sp.down ? 1 : -1; // 倒挂向下 / 直立向上
        for (let k = 0; k < n; k++) {
          const bx = sp.x + k * sw;
          const tip = up ? (sp.down ? sp.y + sp.h : sp.y) : (sp.down ? sp.y + sp.h * 0.4 : sp.y + sp.h * 0.6);
          const baseY = sp.down ? sp.y : sp.y + sp.h;
          ctx.fillStyle = up ? C.spike : 'rgba(150,160,175,0.55)';
          ctx.beginPath();
          ctx.moveTo(bx + 1.5, baseY);
          ctx.lineTo(bx + sw - 1.5, baseY);
          ctx.lineTo(bx + sw / 2, tip);
          ctx.closePath(); ctx.fill();
          if (up && sp.period) { // 定时尖刺弹出时的红光提示
            ctx.fillStyle = 'rgba(255,60,60,0.25)';
            ctx.fillRect(bx, sp.down ? tip : sp.y - 3, sw, sp.down ? sp.h - (tip - sp.y) : sp.h + 3);
          }
        }
      }
    }

    function drawMovers(game) {
      for (let i = 0; i < game.level.movers.length; i++) {
        const m = game.level.movers[i], st = game.moverStates[i];
        // 轨道虚线
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.setLineDash([6, 8]);
        ctx.beginPath();
        ctx.moveTo(m.x + m.w / 2, m.y + 6);
        ctx.lineTo(m.x + m.w / 2 + m.dx, m.y + 6 + m.dy);
        ctx.stroke();
        ctx.setLineDash([]);
        // 平台
        ctx.fillStyle = '#6d7b8f';
        rr(st.x, st.y, m.w, 12, 5); ctx.fill();
        ctx.fillStyle = '#9fb2c8';
        rr(st.x, st.y, m.w, 5, 4); ctx.fill();
      }
    }

    function drawCrumbles(game) {
      for (let i = 0; i < game.level.crumbles.length; i++) {
        const cr = game.level.crumbles[i];
        if (!game.crumbleStates[i]) continue;
        ctx.fillStyle = C.crumble;
        rr(cr.x, cr.y, cr.w, 14, 4); ctx.fill();
        // 裂纹
        ctx.strokeStyle = 'rgba(90,60,30,0.7)';
        ctx.beginPath();
        ctx.moveTo(cr.x + cr.w * 0.3, cr.y + 2); ctx.lineTo(cr.x + cr.w * 0.5, cr.y + 12);
        ctx.moveTo(cr.x + cr.w * 0.7, cr.y + 3); ctx.lineTo(cr.x + cr.w * 0.55, cr.y + 12);
        ctx.stroke();
      }
    }

    function drawSprings(game, myChars) {
      for (let i = 0; i < game.level.springs.length; i++) {
        const sp = game.level.springs[i];
        const anim = springAnim[i % 2] || 0; // 压缩动画（简化按序号）
        const h = 26 - anim * 30;
        const topY = sp.y + sp.h - h - 6;
        ctx.fillStyle = '#7a8794';
        ctx.fillRect(sp.x + 8, sp.y + sp.h - 8, sp.w - 16, 8); // 底座
        ctx.strokeStyle = C.spring;
        ctx.lineWidth = 4;
        ctx.beginPath();
        const coils = 3;
        for (let k = 0; k <= coils * 2; k++) {
          const yy = topY + ((sp.y + sp.h - 8) - topY) * (k / (coils * 2));
          const xx = sp.x + sp.w / 2 + (k % 2 ? 10 : -10);
          k === 0 ? ctx.moveTo(sp.x + sp.w / 2, topY) : ctx.lineTo(xx, yy);
        }
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.fillStyle = C.spring;
        rr(sp.x + 2, topY - 6, sp.w - 4, 8, 3); ctx.fill(); // 顶板
      }
    }

    function drawButtonsDoors(game) {
      for (let i = 0; i < game.level.buttons.length; i++) {
        const b = game.level.buttons[i], on = game.buttonStates[i];
        ctx.fillStyle = on ? '#ffd766' : C.button;
        rr(b.x + 3, b.y + (on ? 5 : 0), b.w - 6, b.h, 4); ctx.fill();
        ctx.fillStyle = '#8a6d1d';
        ctx.fillRect(b.x, b.y + b.h, b.w, 4);
      }
      for (let i = 0; i < game.level.doors.length; i++) {
        const d = game.level.doors[i], open = game.doorStates[i];
        if (open) {
          ctx.fillStyle = 'rgba(176,106,212,0.16)';
          ctx.fillRect(d.x, d.y, d.w, d.h);
        } else {
          const g = ctx.createLinearGradient(d.x, d.y, d.x + d.w, d.y + d.h);
          g.addColorStop(0, C.door); g.addColorStop(1, '#7d3fa3');
          ctx.fillStyle = g;
          rr(d.x + 2, d.y, d.w - 4, d.h, 6); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.font = 'bold 18px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('🔒', d.x + d.w / 2, d.y + d.h / 2 + 6);
        }
      }
    }

    function drawGems(game) {
      for (let i = 0; i < game.level.gems.length; i++) {
        if (game.gemsTaken.has(i)) continue;
        const gm = game.level.gems[i];
        const bob = Math.sin(game.t * 2.4 + i * 1.3) * 5;
        const x = gm.x, y = gm.y + bob;
        ctx.fillStyle = C.gem;
        ctx.beginPath();
        ctx.moveTo(x, y - 11); ctx.lineTo(x + 9, y); ctx.lineTo(x, y + 11); ctx.lineTo(x - 9, y);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 4, y - 1); ctx.lineTo(x, y + 2); ctx.closePath(); ctx.fill();
      }
    }

    function drawExits(game) {
      for (const ex of game.level.exits) {
        const col = ex.owner === 0 ? C.exit0 : C.exit1;
        // 传送门光环
        ctx.save();
        ctx.strokeStyle = col;
        ctx.lineWidth = 5;
        ctx.globalAlpha = 0.85 + Math.sin(game.t * 3) * 0.15;
        ctx.beginPath();
        ctx.ellipse(ex.x + ex.w / 2, ex.y + ex.h - 4, ex.w / 2 - 4, ex.h / 2 - 2, 0, Math.PI, 0);
        ctx.stroke();
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(ex.x + ex.w / 2, ex.y + ex.h - 4, ex.w / 2 - 6, ex.h / 2 - 4, 0, Math.PI, 0);
        ctx.fill();
        ctx.restore();
        // 属性图标
        ctx.font = '20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(ex.owner === 0 ? '🔥' : '💧', ex.x + ex.w / 2, ex.y + 14);
      }
    }

    function drawChar(c, name, isMy, t) {
      if (c.dead) return;
      const blink = c.invulnT > 0 && Math.floor(t * 10) % 2 === 0;
      ctx.globalAlpha = blink ? 0.35 : 1;
      const squash = Math.max(0, c.landSquash) * 2.4;
      const bob = c.onGround ? Math.abs(Math.sin(c.runPhase)) * 3 * (Math.abs(c.vx) > 10 ? 1 : 0) : 0;
      const bw = c.w + squash * 6;
      const bh = c.h - squash * 8 + bob;
      const x = c.x - bw / 2, y = c.y - bh;
      const main = c.idx === 0 ? C.p0 : C.p1;
      const dark = c.idx === 0 ? C.p0Dark : C.p1Dark;
      // 身体
      const g = ctx.createLinearGradient(0, y, 0, y + bh);
      g.addColorStop(0, main); g.addColorStop(1, dark);
      ctx.fillStyle = g;
      rr(x, y, bw, bh, 11); ctx.fill();
      // 头饰：小宝火焰 / 汤汤水滴
      ctx.fillStyle = c.idx === 0 ? '#ffd23c' : '#bfe9ff';
      if (c.idx === 0) {
        ctx.beginPath();
        ctx.moveTo(c.x - 7, y + 3);
        ctx.quadraticCurveTo(c.x, y - 14 - Math.sin(t * 8) * 2, c.x + 7, y + 3);
        ctx.closePath(); ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(c.x - 6, y + 4);
        ctx.quadraticCurveTo(c.x, y - 12, c.x + 6, y + 4);
        ctx.closePath(); ctx.fill();
      }
      // 眼睛
      const eo = c.face * 3.5;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(c.x - 5 + eo, y + 14, 4.4, 0, Math.PI * 2); ctx.arc(c.x + 5 + eo, y + 14, 4.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#222';
      ctx.beginPath(); ctx.arc(c.x - 5 + eo + c.face, y + 14.5, 2.1, 0, Math.PI * 2); ctx.arc(c.x + 5 + eo + c.face, y + 14.5, 2.1, 0, Math.PI * 2); ctx.fill();
      // 腮红
      ctx.fillStyle = 'rgba(255,120,120,0.5)';
      ctx.beginPath(); ctx.arc(c.x - 8 + eo, y + 20, 2.6, 0, Math.PI * 2); ctx.arc(c.x + 8 + eo, y + 20, 2.6, 0, Math.PI * 2); ctx.fill();
      // 名字牌
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = isMy ? '#ffffff' : 'rgba(255,255,255,0.75)';
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 3;
      const label = (isMy ? '▶' : '') + name;
      ctx.strokeText(label, c.x, y - 8);
      ctx.fillText(label, c.x, y - 8);
      ctx.globalAlpha = 1;
    }

    function drawParticles(dt) {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.age += dt;
        if (p.age >= p.life) { particles.splice(i, 1); continue; }
        p.vy += p.grav * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
        ctx.fillStyle = p.color;
        if (p.conf) ctx.fillRect(p.x, p.y, p.size, p.size * 1.6);
        else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - p.age / p.life * 0.5), 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
    }

    /* ---------- 主绘制 ---------- */
    function draw(game, dt, extras) {
      handleEvents(game, extras.events || []);
      if (flashT > 0) flashT -= dt;
      if (shakeT > 0) shakeT -= dt;
      for (let i = 0; i < 2; i++) if (springAnim[i] > 0) springAnim[i] -= dt;

      ctx.save();
      if (shakeT > 0) {
        ctx.translate((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
      }
      drawBackground(game);
      drawExits(game);
      drawLiquids(game);
      drawSolids(game);
      drawMovers(game);
      drawCrumbles(game);
      drawSprings(game);
      drawButtonsDoors(game);
      drawSpikes(game);
      drawGems(game);
      const names = extras.names || ['小宝', '汤汤'];
      for (const c of game.chars) drawChar(c, names[c.idx], c.idx === extras.myIdx, game.t);
      drawParticles(dt);

      // 死亡红/蓝屏闪
      if (flashT > 0) {
        ctx.fillStyle = flashColor + (flashT * 0.9) + ')';
        ctx.fillRect(0, 0, XBT.VIEW_W, XBT.VIEW_H);
      }
      ctx.restore();
    }

    return { draw, resize };
  }

  XBT.createRenderer = createRenderer;
})(window.XBT);
