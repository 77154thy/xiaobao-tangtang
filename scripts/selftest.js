/* 无头自测：240 关结构校验 + 确定性校验 + 引擎模拟（仅开发用，可删除） */
global.window = global;
require('../public/js/game/constants.js');
require('../public/js/game/levelGen.js');
require('../public/js/game/entities.js');
require('../public/js/game/engine.js');
const XBT = window.XBT;
const T = XBT.TILE;
const issues = [];

for (const mode of ['dual', 'sync']) {
  for (let lv = 1; lv <= 120; lv++) {
    const L1 = JSON.stringify(XBT.genLevel(mode, lv));
    const L2 = JSON.stringify(XBT.genLevel(mode, lv));
    if (L1 !== L2) issues.push(`${mode}${lv}: 非确定性`);
    const L = JSON.parse(L1);
    if (!L.hint) issues.push(`${mode}${lv}: 缺提示`);
    if (L.spawns.length !== 2 || L.exits.length !== 2) issues.push(`${mode}${lv}: 出生/出口数量错误`);
    // 出生点脚下必须有实体
    for (let i = 0; i < 2; i++) {
      const sx = L.spawns[i].x * T, sy = L.spawns[i].y * T;
      const on = L.solids.some((s) => sx > s[0] * T - 6 && sx < (s[0] + s[2]) * T + 6 && Math.abs(s[1] * T - sy) < 4);
      if (!on) issues.push(`${mode}${lv}: 出生点${i}悬空 @(${sx},${sy})`);
    }
    // 引擎模拟：随机输入跑 10 秒 + 快照校正 + 强制死亡，不抛异常
    const g = XBT.createGame(L, { myIdx: 0, mode, duties: { moverIdx: 0, jumperIdx: 1 } });
    try {
      for (let s = 0; s < 600; s++) {
        g.setMyInput({ l: s % 23 === 0, r: s % 19 === 0, j: s % 47 === 0 });
        g.setPeerInput({ l: s % 31 === 0, r: s % 17 === 0, j: s % 41 === 0 });
        g.step(1 / 60);
      }
      g.applySnapshot({ t: 5, chars: [{ x: 100, y: 600 }, { x: 120, y: 600 }], gems: [0, 1] });
      g.step(1 / 60);
      g.forceDeath(1);
      g.step(1 / 60);
    } catch (e) {
      issues.push(`${mode}${lv}: 引擎异常 ${e.message}`);
    }
  }
}
console.log(issues.length
  ? `发现 ${issues.length} 个问题:\n` + issues.slice(0, 30).join('\n')
  : '全部 240 关校验通过（确定性 / 出生点 / 引擎模拟）');
process.exit(issues.length ? 1 : 0);
