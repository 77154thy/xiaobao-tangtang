/**
 * 全局常量：尺寸、物理参数、配色。
 * 所有客户端 JS 以普通 <script> 引入，统一挂载到 window.XBT 命名空间。
 */
'use strict';

window.XBT = window.XBT || {};
(function (XBT) {
  // 逻辑画布尺寸：32 x 18 格，每格 40px → 1280 x 720（16:9 横屏）
  XBT.TILE = 40;
  XBT.GRID_W = 32;
  XBT.GRID_H = 18;
  XBT.VIEW_W = XBT.TILE * XBT.GRID_W; // 1280
  XBT.VIEW_H = XBT.TILE * XBT.GRID_H; // 720

  XBT.LEVELS_PER_MODE = 120;

  // 游戏模式
  XBT.MODE = {
    DUAL: 'dual', // 模式B「双侠同行」：两人各自控制自己的角色
    SYNC: 'sync', // 模式A「心有灵犀」：一人控方向、一人控跳跃，两人同步移动
  };
  XBT.MODE_LABEL = { dual: '双侠同行', sync: '心有灵犀' };

  // 物理参数（像素/秒）
  XBT.PHYS = {
    grav: 2400,        // 重力加速度
    move: 265,         // 水平移动速度
    accel: 2800,       // 加速度
    friction: 2600,    // 地面摩擦
    jumpV: 830,        // 起跳速度（跳跃高度约 3.5 格）
    jumpCut: 0.45,     // 松开跳跃键时上升速度削减比例（可变跳高）
    maxFall: 1100,     // 最大下落速度
    springV: 1230,     // 弹簧弹射速度（弹起约 8 格）
    coyote: 0.09,      // 土狼时间（离开平台后仍可起跳的宽限）
    jumpBuffer: 0.12,  // 跳跃预输入缓冲
    charW: 26,         // 角色碰撞盒宽（px）
    charH: 36,         // 角色碰撞盒高（px）
    respawnDelay: 0.8, // 死亡后复活延迟（秒）
    invulnTime: 1.4,   // 复活后无敌时间（秒），防止连续死亡
  };

  // 配色主题
  XBT.COLORS = {
    p0: '#ff7a3c', // 小宝（火娃）
    p0Dark: '#d9541e',
    p1: '#3cb8ff', // 汤汤（水娃）
    p1Dark: '#1e7fd9',
    fire: '#ff5722',
    fireDeep: '#c93a10',
    water: '#2f9fe8',
    waterDeep: '#1668b0',
    toxic: '#7ed321',
    toxicDeep: '#4c8a10',
    spike: '#9aa7b5',
    ground: '#5db861',
    groundDeep: '#3d8f46',
    dirt: '#a9744a',
    slab: '#8d9db5',
    door: '#b06ad4',
    button: '#f4c542',
    spring: '#e8654f',
    crumble: '#c9a36a',
    gem: '#ffd54a',
    exit0: '#ff9c5b',
    exit1: '#5bc4ff',
  };

  // 章节名（每 20 关一个新机制章节）
  XBT.CHAPTER_NAMES = [
    '基础闯关', '移动平台', '机关大门', '弹簧尖刺', '碎裂平台', '终极考验',
  ];
})(window.XBT);
