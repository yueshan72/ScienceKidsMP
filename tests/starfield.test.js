/* tests/starfield.test.js —— 确定性星野生成测试（Node，无需小程序环境）
 *
 * 覆盖：数量、确定性、位置/大小/动画范围、非法输入。
 *
 * 跑法：node tests/starfield.test.js
 */
'use strict';

const Starfield = require('../miniprogram/utils/starfield.js');

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  [OK]   ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (extra ? '  → ' + extra : '')); }
}

console.log('星野生成测试');
console.log('-'.repeat(56));

/* ================= 1. 数量与结构 ================= */
console.log('\n[1] 数量与结构');
const stars = Starfield.build(20);
ok('生成 20 个星点', stars.length === 20);
ok('每个都有 key', stars.every(function (s) { return typeof s.key === 'string'; }));
ok('key 唯一', new Set(stars.map(function (s) { return s.key; })).size === 20);
ok('每个都有 style', stars.every(function (s) { return typeof s.style === 'string'; }));

/* ================= 2. 确定性 ================= */
console.log('\n[2] 确定性');
ok('同一数量两次结果一致', JSON.stringify(Starfield.build(12)) === JSON.stringify(Starfield.build(12)));

/* ================= 3. 数值范围 ================= */
console.log('\n[3] 数值范围');
const style = stars[0].style;
function num(re) {
  const m = style.match(re);
  return m ? Number(m[1]) : NaN;
}
const left = num(/left:([\d.]+)%/);
const top = num(/top:([\d.]+)%/);
const size = num(/width:(\d+)rpx/);
const delay = num(/animation-delay:-(\d+)ms/);
const dur = num(/animation-duration:(\d+)ms/);
ok('left 在 2–98%', left >= 2 && left <= 98, String(left));
ok('top 在 2–98%', top >= 2 && top <= 98, String(top));
ok('尺寸 2–6rpx', size >= 2 && size <= 6, String(size));
ok('延迟为负值', delay >= 0 && delay <= 2600, String(delay));
ok('闪烁时长 1600–3800ms', dur >= 1600 && dur <= 3800, String(dur));

/* ================= 4. 边界 ================= */
console.log('\n[4] 边界');
ok('0 个星点', Starfield.build(0).length === 0);
ok('null → 0', Starfield.build(null).length === 0);
ok('负数 → 0', Starfield.build(-5).length === 0);
ok('字符串数字可用', Starfield.build('3').length === 3);

const big = Starfield.build(1, { sizeScale: 2 });
const bigSize = Number((big[0].style.match(/width:(\d+)rpx/) || [0, 0])[1]);
ok('sizeScale 可放大星点', bigSize >= 4, String(bigSize));

/* ================= 5. 页面背景接线 ================= */
console.log('\n[5] 页面背景接线');
const fs = require('fs');
const path = require('path');

function pageSource(name) {
  return fs.readFileSync(
    path.join(__dirname, '../miniprogram/pages/' + name + '/' + name + '.ttml'),
    'utf8'
  );
}

['index', 'topic', 'mine'].forEach(function (name) {
  const src = pageSource(name);
  ok(name + ' 页有 page-bg', src.indexOf('page-bg') !== -1);
  ok(name + ' 页有 bgStars', src.indexOf('bgStars') !== -1);
});

const appCss = fs.readFileSync(path.join(__dirname, '../miniprogram/app.ttss'), 'utf8');
ok('全局星点动画样式', appCss.indexOf('page-star-twinkle') !== -1);
ok('全局按压反馈样式', appCss.indexOf('.is-pressed') !== -1);

console.log('-'.repeat(56));
console.log('共 ' + (pass + fail) + ' 项，' + (fail === 0 ? '全部通过' : fail + ' 项失败'));
process.exit(fail ? 1 : 0);
