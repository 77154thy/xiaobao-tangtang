/**
 * 实体辅助：关卡坐标换算（格 → 像素）、碰撞工具、机关状态计算。
 * 引擎每帧根据关卡时间 t 计算移动平台/碎裂板/尖刺/大门的状态，
 * 两端使用相同的确定性算法保证同步一致。
 */
'use strict';

(function (XBT) {
  const T = XBT.TILE;

  /** AABB 碰撞检测 */
  function overlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  /** 角色 AAB：以脚底中心 (x,y) 定位 */
  function charBox(c) {
    return { x: c.x - c.w / 2, y: c.y - c.h, w: c.w, h: c.h };
  }

  /** 液体对指定玩家是否致命（小宝=0 免疫火，汤汤=1 免疫水，毒液/尖刺全员危险） */
  function liquidKills(kind, idx) {
    if (kind === 'fire') return idx === 1;
    if (kind === 'water') return idx === 0;
    return true; // toxic
  }

  /** 移动平台在时刻 t 的位置与速度（余弦往复，双端一致） */
  function moverState(m, t) {
    const k = 0.5 - 0.5 * Math.cos((t / m.period + m.phase) * Math.PI * 2);
    const x = m.x + m.dx * k;
    const y = m.y + m.dy * k;
    const w = (Math.PI * 2) / m.period;
    const s = Math.sin((t / m.period + m.phase) * Math.PI * 2);
    return { x, y, vx: m.dx * 0.5 * w * s, vy: m.dy * 0.5 * w * s };
  }

  /** 碎裂平台当前是否为实体状态 */
  function crumbleSolid(c, t) {
    const period = c.onTime + c.offTime;
    return ((t / period + c.phase) % 1 + 1) % 1 < c.onTime / period;
  }

  /** 定时尖刺当前是否弹出（period=0 表示常驻） */
  function spikeUp(s, t) {
    if (!s.period) return true;
    return (((t / s.period + s.phase) % 1) + 1) % 1 < 0.5;
  }

  /** 把格坐标关卡转换为像素关卡（引擎直接使用） */
  function toPx(level) {
    const p = Object.assign({}, level);
    p.solids = level.solids.map(([x, y, w, h]) => ({ x: x * T, y: y * T, w: w * T, h: h * T }));
    p.liquids = level.liquids.map((o) => ({ x: o.x * T, y: o.y * T, w: o.w * T, h: o.h * T, kind: o.kind }));
    p.spikes = level.spikes.map((o) => ({ ...o, x: o.x * T, y: o.y * T, w: o.w * T, h: o.h * T }));
    p.movers = level.movers.map((o) => ({ ...o, x: o.x * T, y: o.y * T, dx: o.dx * T, dy: o.dy * T, w: o.w * T }));
    p.crumbles = level.crumbles.map((o) => ({ ...o, x: o.x * T, y: o.y * T, w: o.w * T }));
    p.buttons = level.buttons.map((o) => ({ ...o, x: o.x * T, y: o.y * T, w: o.w * T, h: 0.3 * T }));
    p.doors = level.doors.map((o) => ({ ...o, x: o.x * T, y: o.y * T, w: o.w * T, h: o.h * T }));
    p.springs = level.springs.map((o) => ({ ...o, x: o.x * T, y: o.y * T, w: 1 * T, h: 1 * T }));
    p.gems = level.gems.map((o) => ({ ...o, x: o.x * T, y: o.y * T }));
    p.spawns = level.spawns.map((o) => ({ x: o.x * T, y: o.y * T }));
    p.exits = level.exits.map((o) => ({ ...o, x: o.x * T, y: o.y * T, w: o.w * T, h: o.h * T }));
    return p;
  }

  XBT.Ent = { overlap, charBox, liquidKills, moverState, crumbleSolid, spikeUp, toPx };
})(window.XBT);
