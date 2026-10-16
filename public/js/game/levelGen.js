/**
 * 确定性关卡生成器：种子 = 模式 + 关卡号，双端生成完全一致的关卡。
 *
 * 关卡坐标系：以「格」为单位（引擎渲染时乘以 TILE），左上角 (0,0)，32 x 18 格。
 *   - 双人模式(dual)：地面在 16~17 行，天花板 0~1 行，两人走同一条路线。
 *   - 同步模式(sync)：上层桥板在 9~10 行（汤汤），地面 16~17 行（小宝），
 *     天花板 0~3 行，两人上下两条通道，接受相同指令同步移动。
 *
 * 每关 = 出生区(2格) + 若干模板片段 + 终点区(4格)，片段由章节机制池抽取，
 * 关卡保证可通关：所有跳跃距离/高度均在物理能力范围内（跳高 3.5 格、跳远 4.5 格）。
 */
'use strict';

(function (XBT) {
  const W = 32, H = 18;

  /** 确定性伪随机数（mulberry32）：同一种子每次产生相同序列 */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const ri = (rng, min, max) => min + Math.floor(rng() * (max - min + 1)); // [min,max] 整数
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

  /** 章节号：1~6，每 20 关引入新机制 */
  function chapterOf(level) { return Math.min(6, Math.ceil(level / 20)); }

  /* ================================================================
   *  模式B「双侠同行」片段库：两人走同一条路，各显神通
   * ================================================================ */

  const D = {};

  // 平地：随手撒几颗宝石
  D.flat = (L, rng, x, w) => {
    const n = rng() < 0.5 ? 0 : ri(rng, 1, 2);
    for (let i = 0; i < n; i++) L.gems.push({ x: x + 1.5 + i * 1.2, y: 14.6 });
  };

  // 缺口坑：底下是火/水/毒液或深渊，宽度 2~3（轻松可跳过）
  D.gap = (L, rng, x, w) => {
    const pw = Math.min(w - 2, ri(rng, 2, 3));
    const px = x + Math.floor((w - pw) / 2);
    cutPit(L, px, pw);
    const kind = pick(rng, ['fire', 'water', 'toxic']);
    if (kind === 'toxic') {
      L.liquids.push({ x: px, y: 16, w: pw, h: 2, kind });
    } else if (rng() < 0.5) {
      L.liquids.push({ x: px, y: 16, w: pw, h: 2, kind });
    } // 否则是无底深渊
    arcGems(L, px, pw);
  };

  // 台阶高地：先上 1~2 格小丘再下来
  D.steps = (L, rng, x, w) => {
    const hgt = ri(rng, 1, 2);
    const bw = Math.max(2, w - 4);
    L.solids.push([x + 2, 16 - hgt, bw, hgt]);
    L.gems.push({ x: x + 2 + bw / 2, y: 16 - hgt - 0.8 });
    if (rng() < 0.4) L.gems.push({ x: x + 1, y: 14.6 });
  };

  // 高墙：2~3 格，需要助跑跳上/跳过
  D.ledge = (L, rng, x, w) => {
    const hgt = ri(rng, 2, 3);
    const mx = x + Math.floor(w / 2);
    L.solids.push([mx, 16 - hgt, 1, hgt]);
    L.gems.push({ x: mx + 0.5, y: 16 - hgt - 0.8 });
  };

  // 双色池：火池 + 水池，中间留 2 格落脚地——小宝趟火跳水池、汤汤跳火池趟水
  D.pools = (L, rng, x, w) => {
    if (w < 8) { D.gap(L, rng, x, w); return; } // 宽度不够时退化为普通坑
    const pw = 2;
    cutPit(L, x + 1, pw);
    L.liquids.push({ x: x + 1, y: 16, w: pw, h: 2, kind: 'fire' });
    cutPit(L, x + 3 + pw, pw); // 中间 2 格安全地
    L.liquids.push({ x: x + 3 + pw, y: 16, w: pw, h: 2, kind: 'water' });
    L.gems.push({ x: x + 1 + pw / 2, y: 14.4 });
    L.gems.push({ x: x + 3 + pw + pw / 2, y: 14.4 });
  };

  // 移动平台：宽坑(≤5格)上左右往返的大平台，看准时机跳上去
  D.moverGap = (L, rng, x, w) => {
    const pw = Math.min(w - 2, 5);
    cutPit(L, x + 1, pw);
    L.liquids.push({ x: x + 1, y: 16, w: pw, h: 2, kind: pick(rng, ['toxic', 'water', 'fire']) });
    L.movers.push({
      x: x + 1.5, y: 14, w: 3, dx: Math.max(1, pw - 3), dy: 0,
      period: 2.6 + rng() * 1.2, phase: rng(),
    });
  };

  // 竖直电梯：高墙(6格)旁的垂直升降台，乘梯翻墙
  D.vertWall = (L, rng, x, w) => {
    const mx = x + 4;
    L.solids.push([mx, 10, 2, 6]); // 墙体：10~15 行
    L.movers.push({
      x: mx - 2.4, y: 15, w: 2, dx: 0, dy: -5,
      period: 4.2 + rng(), phase: rng(),
    });
    L.gems.push({ x: mx + 1, y: 8.8 });
    L.gems.push({ x: mx + 0.2, y: 8.8 });
  };

  // 压力板 + 大门：一人站板开门，另一人先过，再踩对面的板接应
  D.plateDoor = (L, rng, x, w) => {
    const mx = x + Math.floor(w / 2);
    L.buttons.push({ x: x + 1, y: 15.7, w: 1.4 });
    L.buttons.push({ x: mx + 2, y: 15.7, w: 1.4 });
    L.doors.push({ x: mx, y: 11, w: 1, h: 5, btns: [0, 1] });
    L.gems.push({ x: mx + 0.5, y: 10 });
  };

  // 弹簧高墙：踩弹簧飞越 5 格高墙
  D.spring = (L, rng, x, w) => {
    const mx = x + Math.floor(w / 2);
    L.solids.push([mx, 11, 1, 5]);
    L.springs.push({ x: mx - 2, y: 15, power: XBT.PHYS.springV });
    L.gems.push({ x: mx + 0.5, y: 8.6 });
    L.gems.push({ x: mx - 1.5, y: 10.2 });
  };

  // 定时尖刺：周期性升降的地刺，看准节奏跑过去
  D.timedSpikes = (L, rng, x, w) => {
    const sw = Math.min(w - 3, ri(rng, 3, 4));
    const sx = x + 2;
    L.spikes.push({ x: sx, y: 15, w: sw, h: 1, period: 2.0 + rng() * 0.6, phase: rng() });
    L.gems.push({ x: sx + sw / 2, y: 13.4 });
    L.gems.push({ x: sx + 0.5, y: 14.4 });
  };

  // 碎裂平台：踩上 1.6 秒后消失的桥墩，脚下不停留
  D.crumble = (L, rng, x, w) => {
    const pw = w - 2;
    cutPit(L, x + 1, pw);
    L.liquids.push({ x: x + 1, y: 16, w: pw, h: 2, kind: 'toxic' });
    for (let cx = x + 2; cx < x + 1 + pw; cx += 2) {
      L.crumbles.push({ x: cx, y: 14, w: 1, onTime: 1.6, offTime: 1.3, phase: rng() });
    }
  };

  // 宝石高台：跳上小高台拿奖励宝石
  D.gemIsle = (L, rng, x, w) => {
    const mx = x + Math.floor(w / 2) - 1;
    L.solids.push([mx, 13, 2, 3]);
    L.gems.push({ x: mx + 0.6, y: 12.2 });
    L.gems.push({ x: mx + 1.4, y: 12.2 });
  };

  /** 在地面(16~17行)挖坑 */
  function cutPit(L, px, pw) {
    for (const s of L.solids) {
      // 地面主块在生成时已加入，这里把与坑重叠的地面块切掉（简化：地面由整块构成）
    }
    L.pits.push([px, pw]); // 延迟到 finalize 时统一挖地面
  }
  /** 坑口上方的 3 颗弧形宝石 */
  function arcGems(L, px, pw) {
    L.gems.push({ x: px + 0.5, y: 14.2 });
    L.gems.push({ x: px + pw / 2, y: 13.2 });
    L.gems.push({ x: px + pw - 0.5, y: 14.2 });
  }

  /* ================================================================
   *  模式A「心有灵犀」片段库：上下两条通道，相同指令同步移动
   *  上层汤汤（桥板 9~10 行），下层小宝（地面 16~17 行）
   * ================================================================ */

  const S = {};

  S.flat = (L, rng, x, w) => {
    L.gems.push({ x: x + w / 2, y: 14.6 });
    L.gems.push({ x: x + w / 2, y: 7.6 });
  };

  // 双层同步坑：两条通道同一位置都有坑，必须同时起跳
  S.twinGap = (L, rng, x, w) => {
    const pw = Math.min(w - 2, ri(rng, 2, 3));
    const px = x + Math.floor((w - pw) / 2);
    L.pits.push([px, pw]);                                  // 下层挖坑
    L.liquids.push({ x: px, y: 16, w: pw, h: 2, kind: pick(rng, ['water', 'toxic']) });
    L.topPits.push([px, pw]);                               // 上层挖桥板洞（下面有尖刺堵底）
    L.spikes.push({ x: px, y: 10, w: pw, h: 1, period: 0, phase: 0, lane: 'top' });
    arcGems(L, px, pw);
  };

  // 错位坑 + 挡墙：两层坑错开 2 格，单次跳跃无法同时跨过——
  // 利用挡墙卡住一个角色制造错位，对齐各自的坑再跳
  S.stagger = (L, rng, x, w) => {
    // 下层挡墙（2格高可跳过）→ 下层坑 [x+3,x+6) → 上层坑 [x+5,x+8) → 上层挡墙
    L.solids.push([x + 1, 14, 1, 2]);
    L.pits.push([x + 3, 3]);
    L.liquids.push({ x: x + 3, y: 16, w: 3, h: 2, kind: 'water' });
    L.topPits.push([x + 5, 3]);
    L.spikes.push({ x: x + 5, y: 10, w: 3, h: 1, period: 0, phase: 0, lane: 'top' });
    L.solids.push([x + 10, 7, 1, 2]); // 上层通道里的挡墙（7~8 行）
    L.gems.push({ x: x + 4.5, y: 13.4 });
    L.gems.push({ x: x + 6.5, y: 7.6 });
  };

    // 天花板尖刺：上层通道一段头顶尖刺——这段千万别跳！
  S.ceilSpikes = (L, rng, x, w) => {
    const sw = w - 2;
    L.spikes.push({ x: x + 1, y: 4, w: sw, h: 1, period: 0, phase: 0, lane: 'top', down: true });
    L.gems.push({ x: x + 1 + sw / 2, y: 8.0 }); // 引诱你跳的宝石，走过去就能拿
  };

  // 双层压力板：下层板 + 上层门（或镜像）——站上板的同时另一个才能过门
  S.plates = (L, rng, x, w) => {
    const mx = x + Math.floor(w / 2);
    if (rng() < 0.5) {
      L.buttons.push({ x: mx - 2, y: 15.7, w: 1.6, lane: 0 });
      L.doors.push({ x: mx + 0.5, y: 3, w: 1, h: 6, btns: [0] }); // 上层门顶到天花板
      L.gems.push({ x: mx + 1, y: 8.2 });
    } else {
      L.buttons.push({ x: mx - 2, y: 8.7, w: 1.6, lane: 1 }); // 上层桥板上的板
      L.doors.push({ x: mx + 0.5, y: 11, w: 1, h: 5, btns: [0] }); // 下层门从桥板底到地面
      L.gems.push({ x: mx + 1, y: 15.2 });
    }
  };

  // 双层深坑：两层的坑中间各有一块安全柱，需要「两段跳」配合通过
  S.gapDeep = (L, rng, x, w) => {
    const pw = Math.min(w - 2, ri(rng, 4, 5));
    const px = x + Math.floor((w - pw) / 2);
    L.pits.push([px, pw]);
    L.liquids.push({ x: px, y: 16, w: pw, h: 2, kind: 'toxic' });
    L.topPits.push([px, pw]);
    L.spikes.push({ x: px, y: 10, w: pw, h: 1, period: 0, phase: 0, lane: 'top' });
    const mx = px + Math.floor(pw / 2);
    L.solids.push([mx, 14, 2, 2]);   // 下层坑中安全柱（顶在 14 行）
    L.solids.push([mx, 7, 2, 2]);    // 上层坑中安全柱（顶在 7 行）
    L.gems.push({ x: mx + 1, y: 13.2 });
    L.gems.push({ x: mx + 1, y: 6.2 });
  };

  // 双层定时尖刺：两层同相位（高难度时错相位，抓重叠窗口通过）
  S.timed = (L, rng, x, w) => {
    const sw = Math.min(w - 3, ri(rng, 3, 4));
    const sx = x + 2;
    const period = 2.2 + rng() * 0.6;
    const offset = L.level >= 60 && rng() < 0.4 ? 0.3 : 0; // 60 关后两层错相位，难度提升
    L.spikes.push({ x: sx, y: 15, w: sw, h: 1, period, phase: 0 });
    L.spikes.push({ x: sx, y: 8, w: sw, h: 1, period, phase: offset, lane: 'top' });
    L.gems.push({ x: sx + sw / 2, y: 13.4 });
    L.gems.push({ x: sx + sw / 2, y: 6.4 });
  };

  // 双层移动平台：同相位左右往返的大平台，一起搭车
  S.mover = (L, rng, x, w) => {
    const pw = w - 2;
    L.pits.push([x + 1, pw]);
    L.liquids.push({ x: x + 1, y: 16, w: pw, h: 2, kind: 'toxic' });
    L.topPits.push([x + 1, pw]);
    L.spikes.push({ x: x + 1, y: 10, w: pw, h: 1, period: 0, phase: 0, lane: 'top' });
    const period = 3.0 + rng();
    L.movers.push({ x: x + 2, y: 15, w: 3, dx: Math.max(1, pw - 4), dy: 0, period, phase: 0 });
    L.movers.push({ x: x + 2, y: 8, w: 3, dx: Math.max(1, pw - 4), dy: 0, period, phase: 0 });
  };

  // 双层碎裂平台：同相位碎裂桥，谁也别停留
  S.crumble = (L, rng, x, w) => {
    const pw = w - 2;
    L.pits.push([x + 1, pw]);
    L.liquids.push({ x: x + 1, y: 16, w: pw, h: 2, kind: 'toxic' });
    L.topPits.push([x + 1, pw]);
    L.spikes.push({ x: x + 1, y: 10, w: pw, h: 1, period: 0, phase: 0, lane: 'top' });
    for (let cx = x + 2; cx < x + 1 + pw; cx += 2) {
      const phase = rng();
      L.crumbles.push({ x: cx, y: 15, w: 1, onTime: 1.7, offTime: 1.3, phase });
      L.crumbles.push({ x: cx, y: 8, w: 1, onTime: 1.7, offTime: 1.3, phase });
    }
  };

  /* ================================================================
   *  组装关卡
   * ================================================================ */

  const DUAL_POOL = {
    1: ['gap', 'steps', 'ledge', 'pools', 'flat'],
    2: ['moverGap', 'vertWall'],
    3: ['plateDoor'],
    4: ['spring', 'timedSpikes'],
    5: ['crumble', 'gemIsle'],
  };
  const SYNC_POOL = {
    1: ['twinGap', 'ceilSpikes', 'flat'],
    2: ['mover'],
    3: ['plates'],
    4: ['gapDeep', 'timed'],
    5: ['stagger', 'crumble'],
  };
  const HINTS = {
    gap: '小心脚下的坑！火会烫到汤汤，水会淋湿小宝，绿色毒液谁都怕！',
    steps: '跳上小山丘，站得高看得远！',
    ledge: '高墙挡路？助跑跳上去！',
    pools: '小宝不怕火，汤汤不怕水——各自跳过致命的那一池！',
    moverGap: '看准时机，跳上移动平台！',
    vertWall: '高墙跳不过？乘着升降台慢慢上去！',
    plateDoor: '一人站在压力板上开门，另一人先过去，再踩对面的板接应！',
    spring: '踩上弹簧，「嗖——」飞过高墙！',
    timedSpikes: '尖刺缩下去的瞬间，赶紧跑过去！',
    crumble: '碎裂平台踩上去就开始碎裂，千万别停留！',
    gemIsle: '高台上有宝石，跳上去拿！',
    flat: '轻装前进！',
    twinGap: '心有灵犀：两个坑同时出现，一起跳！',
    stagger: '坑错开了？用挡墙卡住一个人，错开位置再对齐跳！',
    ceilSpikes: '头顶有尖刺——这一段千万别跳！',
    plates: '一人踩住压力板，另一个赶紧通过大门！',
    gapDeep: '宽坑中间有安全柱——分两跳，节奏一致！',
    timed: '两层尖刺一起缩下时才能通过，看准节奏！',
    mover: '同相位的双城平台，一起搭车过去！',
    crumble: '双层碎裂桥，脚下生根不如脚下生风！',
  };

  /**
   * 生成关卡主函数
   * @param {'dual'|'sync'} mode
   * @param {number} level 1~120
   */
  function genLevel(mode, level) {
    const seed = (mode === 'sync' ? 77003 : 12001) + level * 7919;
    const rng = mulberry32(seed);
    const ch = chapterOf(level);

    const L = {
      mode, level, w: W, h: H,
      solids: [], liquids: [], spikes: [], movers: [], crumbles: [],
      buttons: [], doors: [], springs: [], gems: [], pits: [], topPits: [],
      spawns: [], exits: [], hint: '', chapter: ch,
    };

    // ---- 边框与地面 ----
    const ceilRows = mode === 'sync' ? 3 : 2; // 同步模式天花板更厚（保证上层跳跃/弹簧空间）
    L.solids.push([0, 0, W, ceilRows]);          // 天花板
    L.solids.push([0, 0, 1, H]);                 // 左墙
    L.solids.push([W - 1, 0, 1, H]);             // 右墙
    L.solids.push([1, 16, W - 2, 2]);            // 地面（坑稍后挖）
    if (mode === 'sync') L.solids.push([1, 9, W - 2, 2]); // 上层桥板（汤汤）

    // ---- 片段数量与宽度分配 ----
    const spanStart = 2, spanEnd = 27;           // 可用跨度 [2, 27) 共 25 格
    const span = spanEnd - spanStart;
    let n = 3 + (level >= 20 ? 1 : 0) + (level >= 50 ? 1 : 0) + (level >= 90 ? 1 : 0);
    n = Math.min(n, 5);
    const base = Math.floor(span / n);
    let rem = span - base * n;

    // ---- 机制池：当前章节 + 之前章节复习 ----
    const pool = [];
    const lib = mode === 'sync' ? SYNC_POOL : DUAL_POOL;
    for (let c = 1; c <= Math.min(ch, 5); c++) pool.push(...lib[c]);
    const keys = [...new Set(pool)];
    let last = '';

    let x = spanStart;
    for (let i = 0; i < n; i++) {
      const w = base + (rem-- > 0 ? 1 : 0);
      let name = pick(rng, keys);
      if (name === last) name = pick(rng, keys); // 尽量避免连续重复
      last = name;
      const fn = mode === 'sync' ? S[name] : D[name];
      fn(L, rng, x, w);
      x += w;
    }
    // 挑一条提示语（优先展示本关第一个片段的玩法）
    L.hint = HINTS[last] || HINTS.flat;

    // ---- 挖坑（地面 / 上层桥板）----
    for (const [px, pw] of L.pits) carve(L.solids, px, pw, 16, 2);
    for (const [px, pw] of L.topPits) {
      carve(L.solids, px, pw, 9, 2);
      // 洞底只吊 2 格厚的堵板（11~12 行）：上层角色掉进洞会踩到尖刺复活，
      // 下层角色仍可从堵板下方（13~15 行）正常通行
      L.solids.push([px, 11, pw, 2]);
    }

    // ---- 出生点与终点 ----
    if (mode === 'sync') {
      L.spawns = [{ x: 1.6, y: 16 }, { x: 1.6, y: 9 }];
      L.exits = [
        { x: 28, y: 14, w: 2, h: 2, owner: 0 },  // 下层小宝的火之门
        { x: 28, y: 7, w: 2, h: 2, owner: 1 },   // 上层汤汤的水之门
      ];
    } else {
      L.spawns = [{ x: 1.6, y: 16 }, { x: 2.8, y: 16 }];
      L.exits = [
        { x: 27, y: 14, w: 2, h: 2, owner: 0 },
        { x: 29, y: 14, w: 2, h: 2, owner: 1 },
      ];
    }

    // ---- 起点附近保底宝石 ----
    if (L.gems.length < 3) L.gems.push({ x: 5, y: 14.6 });
    L.gemTotal = L.gems.length;
    return L;
  }

  /** 把与 [px, px+pw) 重叠的地面矩形切出坑（仅处理整块地面 y==cy） */
  function carve(solids, px, pw, cy, ch) {
    const out = [];
    for (const [x, y, w, h] of solids) {
      const overlap = px < x + w && px + pw > x && y === cy;
      if (!overlap) { out.push([x, y, w, h]); continue; }
      const left = px - x;
      const right = (x + w) - (px + pw);
      if (left > 0) out.push([x, y, left, h]);
      if (right > 0) out.push([px + pw, y, right, h]);
    }
    solids.length = 0;
    out.forEach((r) => solids.push(r));
  }

  XBT.genLevel = genLevel;
  XBT.chapterOf = chapterOf;
})(window.XBT);
