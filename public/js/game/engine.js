/**
 * 游戏引擎：固定步长(1/60s)物理模拟，双端确定性。
 *
 * 同步规则（输入转发架构）：
 *   - dual 模式：本端输入驱动自己的角色，对手角色由转发来的输入驱动；
 *   - sync 模式：方向输入来自 duties.moverIdx 玩家，跳跃输入来自
 *     duties.jumperIdx 玩家，同一份合并指令驱动两个角色。
 *   - 房主定期广播快照，客人据此软校正对手位置与关卡时钟（防漂移）。
 */
'use strict';

(function (XBT) {
  const { overlap, charBox, liquidKills, moverState, crumbleSolid, spikeUp, toPx } = XBT.Ent;
  const PHYS = XBT.PHYS;

  function createChar(spawn, idx) {
    return {
      idx, x: spawn.x, y: spawn.y, w: PHYS.charW, h: PHYS.charH,
      vx: 0, vy: 0, onGround: false, groundType: null,
      face: 1, dead: false, respawnT: 0, invulnT: 0, inExit: false,
      prevJ: false, jumpBufT: 0, coyoteT: 0, cutDone: true,
      runPhase: 0, landSquash: 0, spawn,
    };
  }

  /**
   * 创建游戏实例
   * @param level  格坐标关卡数据（genLevel 的返回值）
   * @param opts   { myIdx, mode, duties, isHost }
   */
  function createGame(level, opts) {
    const px = toPx(level);
    const myIdx = opts.myIdx || 0;
    const peerIdx = 1 - myIdx;
    const mode = opts.mode || 'dual';
    const duties = opts.duties || { moverIdx: 0, jumperIdx: 1 };

    const game = {
      level: px, rawLevel: level, mode, duties, myIdx, peerIdx,
      t: 0, finished: false, completeSent: false,
      chars: [createChar(px.spawns[0], 0), createChar(px.spawns[1], 1)],
      inputs: [{ l: false, r: false, j: false }, { l: false, r: false, j: false }],
      gemsTaken: new Set(),        // 已收集宝石下标
      gemBy: [0, 0],               // 各自收集数
      moverStates: px.movers.map((m) => moverState(m, 0)),
      crumbleStates: px.crumbles.map((c) => crumbleSolid(c, 0)),
      spikeStates: px.spikes.map((s) => spikeUp(s, 0)),
      buttonStates: px.buttons.map(() => false),
      doorStates: px.doors.map(() => false),
      events: [],                  // 待处理事件（音效/粒子/网络）
      snapTarget: null,            // 客人收到的校正快照
    };

    /* ------------- 输入接口 ------------- */

    game.setMyInput = (inp) => { game.inputs[myIdx] = inp; };
    game.setPeerInput = (inp) => { game.inputs[peerIdx] = inp; };

    function mergedInput() {
      if (mode !== 'sync') return null;
      return {
        l: game.inputs[duties.moverIdx].l,
        r: game.inputs[duties.moverIdx].r,
        j: game.inputs[duties.jumperIdx].j,
      };
    }

    /* ------------- 网络校正 ------------- */

    /** 客人收到房主快照：软校正关卡时钟与对手位置 */
    game.applySnapshot = (snap) => {
      if (!snap || !snap.chars) return;
      game.snapTarget = snap;
    };

    game.forceDeath = (idx) => {
      const c = game.chars[idx];
      if (!c.dead && !c.inExit) kill(game, c, false);
    };

    /* ------------- 主步进 ------------- */

    game.step = function (dt) {
      game.t += dt;

      // 快照校正（客人）：对齐房主时钟；对手位置插值追随
      if (game.snapTarget) {
        const s = game.snapTarget;
        const dtT = s.t - game.t;
        if (Math.abs(dtT) >= 1.5) game.t = s.t; // 差距过大（房主曾卡顿）：硬同步，避免永久脱节
        else if (Math.abs(dtT) > 0.12) game.t += dtT * Math.min(1, dt * 2.5); // 小差距平滑拉近
        const peer = game.chars[peerIdx];
        const tp = s.chars[peerIdx];
        if (tp && !peer.dead) {
          const dx = tp.x - peer.x, dy = tp.y - peer.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > 150 * 150) { peer.x = tp.x; peer.y = tp.y; }
          else { peer.x += dx * Math.min(1, dt * 6); peer.y += dy * Math.min(1, dt * 6); }
        }
        if (s.gems) for (const g of s.gems) takeGem(game, g, null, true);
      }

      updateMechanics(game);

      const mInp = mergedInput();
      for (let i = 0; i < 2; i++) {
        const c = game.chars[i];
        if (c.dead) {
          c.respawnT -= dt;
          if (c.respawnT <= 0) respawn(game, c);
          continue;
        }
        const inp = mode === 'sync' ? mInp : game.inputs[i];
        simulate(game, c, inp || { l: false, r: false, j: false }, dt);
      }

      // 通关判定：两个角色都活着并进入自己的出口
      if (!game.finished && game.chars[0].inExit && game.chars[1].inExit) {
        game.finished = true;
        game.events.push({ type: 'complete' });
      }
    };

    return game;
  }

  /* ================= 内部函数 ================= */

  /** 更新移动平台 / 碎裂板 / 尖刺 / 压力板 / 大门状态 */
  function updateMechanics(g) {
    const t = g.t;
    for (let i = 0; i < g.level.movers.length; i++) g.moverStates[i] = moverState(g.level.movers[i], t);
    for (let i = 0; i < g.level.crumbles.length; i++) g.crumbleStates[i] = crumbleSolid(g.level.crumbles[i], t);
    for (let i = 0; i < g.level.spikes.length; i++) g.spikeStates[i] = spikeUp(g.level.spikes[i], t);
    // 压力板：任一存活角色踩上即触发
    for (let i = 0; i < g.level.buttons.length; i++) {
      const b = g.level.buttons[i];
      let pressed = false;
      for (const c of g.chars) {
        if (c.dead) continue;
        const box = charBox(c);
        if (overlap(box.x, box.y, box.w, box.h + 4, b.x, b.y - 6, b.w, b.h + 6)) pressed = true;
      }
      g.buttonStates[i] = pressed;
    }
    for (let i = 0; i < g.level.doors.length; i++) {
      const d = g.level.doors[i];
      g.doorStates[i] = d.btns.some((bi) => g.buttonStates[bi]);
    }
  }

  /** 组装本帧碰撞矩形（静态 + 门 + 移动平台 + 存在的碎裂板） */
  function solidRects(g, cIdx) {
    const list = [];
    for (const s of g.level.solids) list.push({ ...s, kind: 'solid' });
    for (let i = 0; i < g.level.doors.length; i++) {
      if (!g.doorStates[i]) list.push({ ...g.level.doors[i], kind: 'door' });
    }
    for (let i = 0; i < g.level.movers.length; i++) {
      const m = g.moverStates[i];
      list.push({ x: m.x, y: m.y, w: g.level.movers[i].w, h: 12, kind: 'mover', mi: i });
    }
    for (let i = 0; i < g.level.crumbles.length; i++) {
      if (g.crumbleStates[i]) list.push({ x: g.level.crumbles[i].x, y: g.level.crumbles[i].y, w: g.level.crumbles[i].w, h: 14, kind: 'crumble', ci: i });
    }
    return list;
  }

  /** 单个角色的一帧物理与逻辑 */
  function simulate(g, c, inp, dt) {
    // 进入出口的角色定格庆祝
    if (c.inExit) {
      c.vx = 0; c.vy = 0;
      c.runPhase += dt * 10;
      checkExit(g, c);
      return;
    }

    const dir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
    if (dir !== 0) {
      c.vx += dir * PHYS.accel * dt;
      c.vx = Math.max(-PHYS.move, Math.min(PHYS.move, c.vx));
      c.face = dir;
    } else {
      const f = (c.onGround ? PHYS.friction : PHYS.friction * 0.3) * dt;
      if (Math.abs(c.vx) <= f) c.vx = 0; else c.vx -= Math.sign(c.vx) * f;
    }

    // 跳跃：预输入缓冲 + 土狼时间 + 可变跳高
    if (inp.j && !c.prevJ) c.jumpBufT = PHYS.jumpBuffer;
    c.prevJ = inp.j;
    c.jumpBufT -= dt;
    c.coyoteT -= dt;
    if (c.jumpBufT > 0 && (c.onGround || c.coyoteT > 0)) {
      c.vy = -PHYS.jumpV;
      c.onGround = false;
      c.coyoteT = 0;
      c.jumpBufT = 0;
      c.cutDone = false;
      g.events.push({ type: 'jump', idx: c.idx });
    }
    if (!inp.j && c.vy < -120 && !c.cutDone) { c.vy *= PHYS.jumpCut; c.cutDone = true; }

    c.vy = Math.min(PHYS.maxFall, c.vy + PHYS.grav * dt);
    if (c.invulnT > 0) c.invulnT -= dt;

    const wasGround = c.onGround;
    c.onGround = false;
    const rects = solidRects(g, c.idx);
    const moverVX = wasGround && c.groundType === 'mover' && c.groundRef != null
      ? g.moverStates[c.groundRef].vx : 0;

    // ---- X 轴移动与碰撞 ----
    c.x += (c.vx + moverVX) * dt;
    for (const r of rects) {
      const box = charBox(c);
      if (!overlap(box.x, box.y, box.w, box.h, r.x, r.y, r.w, r.h)) continue;
      if (c.vx + moverVX > 0) c.x = r.x - c.w / 2;
      else if (c.vx + moverVX < 0) c.x = r.x + r.w + c.w / 2;
      c.vx = 0;
    }

    // ---- Y 轴移动与碰撞 ----
    const prevFeet = c.y;
    c.y += c.vy * dt;
    for (const r of rects) {
      const box = charBox(c);
      if (!overlap(box.x, box.y, box.w, box.h, r.x, r.y, r.w, r.h)) continue;
      if (c.vy >= 0) { // 落到顶面
        c.y = r.y;
        c.vy = 0;
        c.onGround = true;
        c.groundType = r.kind;
        c.groundRef = r.kind === 'mover' ? r.mi : (r.kind === 'crumble' ? r.ci : null);
        if (!wasGround) {
          c.landSquash = 0.18;
          g.events.push({ type: 'land', idx: c.idx });
        }
      } else { // 顶到头
        c.y = r.y + r.h + c.h;
        c.vy = 0;
      }
    }

    // 弹簧：从上方落到弹簧顶面则弹起（不参与侧向碰撞，可直接走过）
    if (c.vy >= 0) {
      for (const sp of g.level.springs) {
        if (prevFeet <= sp.y + 6 && c.y >= sp.y && c.y <= sp.y + sp.h + 14) {
          const box = charBox(c);
          if (box.x < sp.x + sp.w && box.x + box.w > sp.x) {
            c.y = sp.y;
            c.vy = -sp.power;
            c.onGround = false;
            c.cutDone = true;
            g.events.push({ type: 'spring', idx: c.idx });
          }
        }
      }
    }

    // 站在队友头上（互相垫脚，单向站台）
    if (!c.onGround && c.vy > 60) {
      const other = g.chars[1 - c.idx];
      if (!other.dead && !other.inExit) {
        const box = charBox(c), ob = charBox(other);
        const top = ob.y;
        if (box.x < ob.x + ob.w && box.x + box.w > ob.x &&
            prevFeet <= top + 8 && c.y >= top) {
          c.y = top;
          c.vy = 0;
          c.onGround = true;
          c.groundType = 'peer';
          c.groundRef = null;
        }
      }
    }

    if (c.onGround) { c.coyoteT = PHYS.coyote; c.cutDone = c.cutDone && c.vy <= 0; }
    else if (wasGround && c.groundType !== 'mover') { /* 离地进入土狼时间 */ }

    // 动画计时
    c.runPhase += (Math.abs(c.vx) > 10 && c.onGround ? Math.abs(c.vx) / 26 : 0.8) * dt * 6;
    if (c.landSquash > 0) c.landSquash -= dt;

    // 宝石收集
    for (let i = 0; i < g.level.gems.length; i++) {
      if (g.gemsTaken.has(i)) continue;
      const gm = g.level.gems[i];
      const box = charBox(c);
      const cx = Math.max(box.x, Math.min(gm.x, box.x + box.w));
      const cy = Math.max(box.y, Math.min(gm.y, box.y + box.h));
      if ((gm.x - cx) ** 2 + (gm.y - cy) ** 2 < 30 * 30) takeGem(g, i, c.idx, false);
    }

    // 出口检测
    checkExit(g, c);
    if (c.inExit) return;

    // 危险物检测（无敌期跳过）
    if (c.invulnT <= 0) {
      const box = charBox(c);
      for (const lq of g.level.liquids) {
        if (overlap(box.x, box.y, box.w, box.h, lq.x, lq.y, lq.w, lq.h) && liquidKills(lq.kind, c.idx)) {
          kill(g, c, true); return;
        }
      }
      for (let i = 0; i < g.level.spikes.length; i++) {
        const sp = g.level.spikes[i];
        if (!g.spikeStates[i]) continue;
        const sy = sp.down ? sp.y + sp.h * 0.35 : sp.y; // 倒挂尖刺
        if (overlap(box.x, box.y, box.w, box.h, sp.x, sy, sp.w, sp.h)) { kill(g, c, true); return; }
      }
    }
    if (c.y > XBT.VIEW_H + 140) kill(g, c, true); // 掉出世界
  }

  function checkExit(g, c) {
    if (c.inExit) return;
    const ex = g.level.exits[c.idx];
    const box = charBox(c);
    if (box.x + box.w > ex.x + 8 && box.x < ex.x + ex.w - 8 && c.y > ex.y + ex.h * 0.4) {
      c.inExit = true;
      c.x = ex.x + ex.w / 2;
      c.vx = 0; c.vy = 0;
      g.events.push({ type: 'enterExit', idx: c.idx });
    }
  }

  function takeGem(g, i, by, silent) {
    if (g.gemsTaken.has(i)) return;
    g.gemsTaken.add(i);
    if (by != null) g.gemBy[by]++;
    if (!silent) g.events.push({ type: 'gem', idx: by, gem: i, x: g.level.gems[i].x, y: g.level.gems[i].y });
  }

  function kill(g, c, notify) {
    c.dead = true;
    c.respawnT = PHYS.respawnDelay;
    c.vx = 0; c.vy = 0;
    g.events.push({ type: 'death', idx: c.idx, x: c.x, y: c.y, notify });
  }

  function respawn(g, c) {
    c.dead = false;
    c.x = c.spawn.x; c.y = c.spawn.y;
    c.vx = 0; c.vy = 0;
    c.invulnT = PHYS.invulnTime;
    c.onGround = false;
    c.inExit = false;
    g.events.push({ type: 'respawn', idx: c.idx });
  }

  XBT.createGame = createGame;
})(window.XBT);
