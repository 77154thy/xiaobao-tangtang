/* 跳跃手感验证（仅开发用）：
 * 合成一个宽 4 格(160px)的坑，模拟不同助跑距离下能否跳过。
 * 旧参数：距离约 183px（4 格坑要完美操作）→ 新参数应显著宽裕。
 */
global.window = global;
require('../public/js/game/constants.js');
require('../public/js/game/levelGen.js');
require('../public/js/game/entities.js');
require('../public/js/game/engine.js');
const XBT = window.XBT;

const PIT_L = 400, PIT_R = 560; // 坑左缘/右缘（px），宽 4 格

function makeLevel() {
  return {
    mode: 'dual', level: 1, w: 32, h: 18,
    solids: [
      [0, 0, 32, 2], [0, 0, 1, 18], [31, 0, 1, 18],
      [1, 16, 9, 2],   // 地面 tiles 1..9  → x 40..400
      [14, 16, 17, 2], // 地面 tiles 14..30 → x 560..1240
    ],
    liquids: [{ x: 10, y: 16, w: 4, h: 2, kind: 'water' }],
    spikes: [], movers: [], crumbles: [], buttons: [], doors: [], springs: [],
    gems: [], spawns: [{ x: 1.6, y: 16 }, { x: 2.8, y: 16 }],
    exits: [{ x: 27, y: 14, w: 2, h: 2, owner: 0 }, { x: 29, y: 14, w: 2, h: 2, owner: 1 }],
    hint: '', chapter: 1, gemTotal: 0,
  };
}

function tryJump(runupTiles) {
  const g = XBT.createGame(makeLevel(), { myIdx: 0, mode: 'dual', duties: { moverIdx: 0, jumperIdx: 1 } });
  const c = g.chars[0];
  c.x = PIT_L - 13 - runupTiles * 40;
  c.y = 640;
  c.onGround = true;
  let jumped = false;
  for (let f = 0; f < 600; f++) {
    // 到达坑左缘起跳，并保持按住（真实玩家按住跳跃键获得最大跳高）
    if (!jumped && c.x >= PIT_L - 13 - 2) jumped = true;
    g.setMyInput({ l: false, r: true, j: jumped });
    g.step(1 / 60);
    if (c.dead) return { ok: false, reason: '掉坑死亡', x: Math.round(c.x) };
    if (jumped && c.onGround && c.x > PIT_L) {
      return c.x >= PIT_R + 13
        ? { ok: true, landX: Math.round(c.x) }
        : { ok: false, reason: '落在坑里', landX: Math.round(c.x) };
    }
  }
  return { ok: false, reason: '超时', x: Math.round(c.x) };
}

const scenarios = [
  ['满速助跑 4 格', 4],
  ['短助跑 1 格', 1],
  ['几乎贴边起步', 0],
];
let allOk = true;
for (const [name, r] of scenarios) {
  const res = tryJump(r);
  if (!res.ok) allOk = false;
  console.log(`${res.ok ? 'PASS' : 'FAIL'}  ${name}: ${JSON.stringify(res)}`);
}
console.log(allOk ? '全部场景可跳过 4 格坑 ✓' : '存在跳不过的场景 ✗');
process.exit(allOk ? 0 : 1);
