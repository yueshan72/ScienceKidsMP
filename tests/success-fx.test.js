/* tests/success-fx.test.js —— 通关成功动画纯函数测试
 *
 * 不依赖小程序环境；只校验数据解析、位移、时长、降级行为。
 * 跑法：node tests/success-fx.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const Fx = require('../miniprogram/utils/success-fx.js');

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  [OK]   ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (extra ? '  → ' + extra : '')); }
}
function near(a, b, eps) {
  return Math.abs(Number(a) - Number(b)) <= (eps === undefined ? 0.01 : eps);
}
function makeScene(extra) {
  return Object.assign({
    deco: [{ id: 'a', icon: 'A', x: 0.5, y: 0.55, rotate: -45 }],
    successFx: { version: 1, items: [] }
  }, extra || {});
}
function makeTargets(list) {
  return { props: { targets: list } };
}

console.log('成功动画构建测试');
console.log('-'.repeat(56));

/* ================= 1. 无配置 / 无效配置 ================= */
console.log('\n[1] 无效配置一律降级');
ok('没有 scene', Fx.build(null, null, {}).active === false);
ok('没有 successFx', Fx.build({ deco: [] }, null, {}).active === false);
ok('items 为空', Fx.build(makeScene(), null, {}).active === false);
ok('未知版本', Fx.build(makeScene({
  successFx: { version: 99, items: [{ type: 'launch', ref: 'deco:a' }] }
}), null, {}).active === false);
ok('未知类型', Fx.build(makeScene({
  successFx: { version: 1, items: [{ type: 'explode', ref: 'deco:a' }] }
}), null, {}).active === false);
ok('无效引用', Fx.build(makeScene({
  successFx: { version: 1, items: [{ type: 'launch', ref: 'deco:missing' }] }
}), null, {}).active === false);
ok('不抛异常', (function () {
  try { Fx.build(makeScene({ successFx: { items: [null, {}] } }), null, {}); return true; }
  catch (e) { return false; }
})());

/* ================= 2. launch ================= */
console.log('\n[2] launch（升空）');
const launch = Fx.build(makeScene({
  successFx: {
    version: 1, holdMs: 150, persistHide: true,
    items: [{
      type: 'launch', ref: 'deco:a', delayMs: 250, durationMs: 3000,
      to: { x: 0.5, y: -0.5 },
      flame: { icon: 'F', size: 96, offsetY: 6, flickerMs: 240 }
    }]
  }
}), null, {});

ok('active=true', launch.active === true);
ok('只有一个演员', launch.items.length === 1);
ok('起点 50/55', launch.items[0].anchorStyle === 'left:50%;top:55%;');
ok('纵向位移 -105%', near(launch.items[0].delta.yPct, -105));
ok('隐藏 deco', launch.hideDeco === true);
ok('不隐藏 target', launch.hideTargets === false);
ok('不是全屏', launch.fullscreen === false);
ok('play 默认 always', launch.play === 'always');
ok('persistHide 生效', launch.persistHide === true);
ok('effectEnd=3250', launch.effectEndMs === 3250, String(launch.effectEndMs));
ok('total=3730', launch.totalMs === 3730, String(launch.totalMs));
ok('body 类名', launch.items[0].bodyClass === 'fx-body--launch');
ok('mover 带 CSS 变量', launch.items[0].moverStyle.indexOf('--fx-dy:-105%') !== -1);
ok('火焰图标', launch.items[0].flame && launch.items[0].flame.icon === 'F');
ok('火焰在尾部', launch.items[0].flame.style.indexOf('bottom:-6rpx') !== -1);
ok('火焰闪烁时长', launch.items[0].flame.style.indexOf('animation-duration:240ms') !== -1);
ok('旋转保留 -45', launch.items[0].rotatorStyle === 'transform: rotate(-45deg);');

/* ================= 3. fall ================= */
console.log('\n[3] fall（坠落）');
const fall = Fx.build(
  {
    deco: [{ id: 'moon', icon: 'M', x: 0.5, y: 0.6 }],
    successFx: {
      version: 1, holdMs: 200, persistHide: true,
      items: [
        {
          type: 'fall', ref: 'target:m1', durationMs: 2300,
          to: { ref: 'deco:moon', dx: -0.13, dy: -0.06 },
          impact: { icon: 'X', size: 64, durationMs: 400 }
        },
        {
          type: 'fall', ref: 'target:m2', delayMs: 250, durationMs: 2500,
          to: { ref: 'deco:moon', dx: 0.13, dy: -0.09 },
          impact: { icon: 'X', size: 64, durationMs: 400 }
        }
      ]
    }
  },
  makeTargets([
    { id: 'm1', icon: 'C', x: 0.24, y: 0.22 },
    { id: 'm2', icon: 'C', x: 0.76, y: 0.32 }
  ]),
  {}
);

ok('两个演员', fall.items.length === 2);
ok('m1 落到 +13%/+32%',
  near(fall.items[0].delta.xPct, 13) && near(fall.items[0].delta.yPct, 32));
ok('m2 落到 -13%/+19%',
  near(fall.items[1].delta.xPct, -13) && near(fall.items[1].delta.yPct, 19));
ok('隐藏 target', fall.hideTargets === true);
ok('不隐藏 deco', fall.hideDeco === false);
ok('两个都有爆点', !!fall.items[0].impact && !!fall.items[1].impact);
ok('爆点在最后 10% 行程出现（2070ms）',
  fall.items[0].impact.style.indexOf('animation-delay:2070ms') !== -1);
ok('effectEnd 取最大 3150', fall.effectEndMs === 3150, String(fall.effectEndMs));

/* ================= 4. zoom ================= */
console.log('\n[4] zoom（地球放大）');
const zoom = Fx.build(
  {
    deco: [{ id: 'sun', icon: 'S', x: 0.5, y: 0.22 }],
    successFx: {
      version: 1, holdMs: 900, persistHide: false,
      items: [{ type: 'zoom', ref: 'target:e1', durationMs: 3000, size: 128, hideSource: false }]
    }
  },
  makeTargets([{ id: 'e1', icon: 'E', x: 0.5, y: 0.72 }]),
  {
    stageRect: { left: 0, top: 100, width: 750, height: 640 },
    windowWidth: 750,
    windowHeight: 1334
  }
);

ok('active=true', zoom.active === true);
ok('全屏标记', zoom.fullscreen === true);
ok('起点 y ≈ 42.04%', near(zoom.items[0].from.yPct, 42.04, 0.05),
  String(zoom.items[0].from.yPct));
ok('向中心位移 x=0', near(zoom.items[0].delta.xPct, 0));
ok('向中心位移 y≈7.96', near(zoom.items[0].delta.yPct, 7.96, 0.05),
  String(zoom.items[0].delta.yPct));
ok('hideSource=false 不隐藏 target', zoom.hideTargets === false);
ok('zoom body 类名', zoom.items[0].bodyClass === 'fx-body--zoom');
ok('停留 900ms', zoom.holdMs === 900);

const zoomFallback = Fx.build(
  {
    deco: [],
    successFx: { version: 1, items: [{ type: 'zoom', ref: 'target:e1' }] }
  },
  makeTargets([{ id: 'e1', icon: 'E', x: 0.5, y: 0.72 }]),
  {}
);
ok('无舞台测量时回退 50/60',
  zoomFallback.items[0].anchorStyle === 'left:50%;top:60%;');

/* ================= 5. 默认值与夹紧 ================= */
console.log('\n[5] 默认值与夹紧');
const defaults = Fx.build(makeScene({
  successFx: {
    version: 1,
    items: [{ type: 'fall', ref: 'deco:a', to: { dx: 0.1, dy: 0.1 } }]
  }
}), null, {});
ok('默认 hold=200', defaults.holdMs === 200);
ok('默认 duration=2400', defaults.items[0].durationMs === 2400);
ok('默认 size=128（deco）', defaults.items[0].sizeRpx === 128);
ok('默认 play=always', defaults.play === 'always');

const clamped = Fx.build(makeScene({
  successFx: {
    version: 1,
    items: [{ type: 'launch', ref: 'deco:a', durationMs: 99999 }]
  }
}), null, {});
ok('duration 夹到 5000', clamped.items[0].durationMs === 5000);

const first = Fx.build(makeScene({
  successFx: { version: 1, play: 'first', items: [{ type: 'launch', ref: 'deco:a' }] }
}), null, {});
ok('play=first 透传', first.play === 'first');

/* ================= 6. 电影化效果 ================= */
console.log('\n[6] 电影化效果（蓄力/残影/粒子/冲击波/陨坑/星野）');

const cineLaunch = Fx.build({
  deco: [{ id: 'a', icon: 'A', x: 0.5, y: 0.55 }],
  successFx: {
    version: 1,
    items: [{
      type: 'launch', ref: 'deco:a', chargeMs: 600, durationMs: 2000,
      to: { x: 0.5, y: -0.5 },
      ghosts: 2, smoke: 6, sparks: 5, streaks: 4,
      shake: true, rumble: true
    }]
  }
}, null, {});

ok('蓄力 class', cineLaunch.items[0].chargeClass === 'fx-charge');
ok('蓄力时长写进样式', cineLaunch.items[0].chargeStyle.indexOf('animation-duration:600ms') !== -1);
ok('位移在蓄力后开始', cineLaunch.items[0].moverStyle.indexOf('animation-delay:600ms') !== -1);
ok('残影 2 个', cineLaunch.ghosts.length === 2);
ok('残影逐级变淡',
  parseFloat(cineLaunch.ghosts[0].wrapStyle.split(':')[1]) >
  parseFloat(cineLaunch.ghosts[1].wrapStyle.split(':')[1]));
ok('粒子 = 烟雾 6 + 火花 5 + 速度线 4',
  cineLaunch.particles.length === 15, String(cineLaunch.particles.length));
ok('烟雾有独立 class',
  cineLaunch.particles.some(p => p.cls.indexOf('fx-particle--smoke') !== -1));
ok('速度线有独立 class',
  cineLaunch.particles.some(p => p.cls.indexOf('fx-particle--streak') !== -1));
ok('起飞震屏点 = 600ms', cineLaunch.shakeAtMs.indexOf(600) !== -1);
ok('蓄力 rumble 覆盖到起飞后', cineLaunch.rumbleMs >= 900);
ok('effectEnd 覆盖主体位移', cineLaunch.effectEndMs >= 2600, String(cineLaunch.effectEndMs));
ok('文案延迟到点火时刻', cineLaunch.captionDelayMs === 600);
ok('文案延迟写进样式', cineLaunch.captionStyle.indexOf('animation-delay:600ms') !== -1);

const cineFall = Fx.build({
  deco: [{ id: 'm', icon: 'M', x: 0.5, y: 0.6 }],
  successFx: {
    version: 1,
    items: [{
      type: 'fall', ref: 'target:m1', durationMs: 2000,
      to: { ref: 'deco:m', dx: -0.055, dy: -0.02 },
      ghosts: 2, impactBurst: 10, shockwave: true, crater: true, shake: true,
      impact: { icon: 'X', size: 64, durationMs: 400 }
    }]
  }
}, makeTargets([{ id: 'm1', icon: 'C', x: 0.24, y: 0.22 }]), {});

ok('坠落残影 2 个', cineFall.ghosts.length === 2);
ok('爆尘 10 个', cineFall.particles.length === 10, String(cineFall.particles.length));
ok('冲击波 1 个', cineFall.shockwaves.length === 1);
ok('陨坑 1 个', cineFall.craters.length === 1);
ok('震屏点 = 最后 10% 行程', cineFall.shakeAtMs.indexOf(1800) !== -1);
ok('冲击波延迟 1800ms',
  cineFall.shockwaves[0].style.indexOf('animation-delay:1800ms') !== -1);
ok('陨坑比撞击晚 120ms',
  cineFall.craters[0].style.indexOf('animation-delay:1920ms') !== -1);

const cineZoom = Fx.build({
  deco: [{ id: 's', icon: 'S', x: 0.5, y: 0.2 }],
  successFx: {
    version: 1,
    items: [{
      type: 'zoom', ref: 'target:e1', durationMs: 2000, size: 128,
      halo: true, stars: 12, hideSource: false
    }]
  }
}, makeTargets([{ id: 'e1', icon: 'P', x: 0.5, y: 0.72 }]), {});

ok('放大项带光晕', cineZoom.items[0].halo === true);
ok('全屏星野 12 颗', cineZoom.stars.length === 12);
ok('星野用负延迟错开闪烁',
  cineZoom.stars[0].style.indexOf('animation-delay:-') !== -1);

/* 矢量场景 */
const cineVector = Fx.build({
  deco: [{ id: 'moon', icon: 'M', x: 0.5, y: 0.6 }],
  successFx: {
    version: 1,
    hideAll: true,
    persistHide: false,
    props: [{ visual: 'moon', ref: 'deco:moon', size: 128 }],
    items: [{
      type: 'fall', ref: 'target:m1', visual: 'comet', durationMs: 2000,
      to: { ref: 'deco:moon', dx: -0.055, dy: -0.02 },
      shockwave: true, crater: true, shake: true
    }]
  }
}, makeTargets([{ id: 'm1', icon: 'C', x: 0.24, y: 0.22 }]), {});

ok('hideAll 同时隐藏装饰和目标',
  cineVector.hideDeco === true && cineVector.hideTargets === true);
ok('演员带矢量类型', cineVector.items[0].visual === 'comet');
ok('彗星尾巴朝来路（负角度）', cineVector.items[0].rotate < 0,
  String(cineVector.items[0].rotate));
ok('矢量演员不再生成 emoji 残影', cineVector.ghosts.length === 0);
ok('静态道具 1 个', cineVector.props.length === 1);
ok('道具定位到月亮坐标',
  cineVector.props[0].style.indexOf('left:50%;top:60%') !== -1);
ok('深空网格 11+7 条', cineVector.grid.length === 18,
  String(cineVector.grid.length));
ok('深空星点 26 颗', cineVector.spaceStars.length === 26);
ok('space 标记为真', cineVector.space === true);
ok('撞击闪光 1 个', cineVector.flashes.length === 1);
ok('闪光与冲击波同延迟',
  cineVector.flashes[0].style.indexOf('animation-delay:1800ms') !== -1);

/* ================= 7. 源码守卫 ================= */
console.log('\n[7] 源码守卫');
const src = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'utils', 'success-fx.js'), 'utf8');
ok('不含关卡名', !/rocket|meteor|earth|levelId|点火|陨石|月球/i.test(src));
ok('不 require tt', !/require\(['"]tt/.test(src));

console.log('\n' + '-'.repeat(56));
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail === 0 ? 0 : 1);
