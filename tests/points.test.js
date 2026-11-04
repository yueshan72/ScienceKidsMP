/* tests/points.test.js —— 展示型积分推导测试（Node，无需小程序环境）
 *
 * 覆盖：每关 10 分、只计 done、空值与损坏数据返回 0。
 *
 * 跑法：node tests/points.test.js
 */
'use strict';

const Points = require('../miniprogram/utils/points.js');

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  [OK]   ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (extra ? '  → ' + extra : '')); }
}

console.log('积分推导测试');
console.log('-'.repeat(56));

/* ================= 1. 规则 ================= */
console.log('\n[1] 规则');
ok('每关 10 分', Points.POINTS_PER_LEVEL === 10, String(Points.POINTS_PER_LEVEL));

/* ================= 2. 空值与损坏数据 ================= */
console.log('\n[2] 空值与损坏数据');
ok('null → 0', Points.totalFromProgress(null) === 0);
ok('undefined → 0', Points.totalFromProgress(undefined) === 0);
ok('空对象 → 0', Points.totalFromProgress({}) === 0);
ok('数组 → 0', Points.totalFromProgress([]) === 0);
ok('字符串 → 0', Points.totalFromProgress('not-an-object') === 0);

/* ================= 3. 通关计数 ================= */
console.log('\n[3] 通关计数');
ok('1 关 done → 10', Points.totalFromProgress({
  a: { status: 'done' }
}) === 10);
ok('2 关 done → 20', Points.totalFromProgress({
  a: { status: 'done' },
  b: { status: 'done' }
}) === 20);
ok('未完成不计分', Points.totalFromProgress({
  a: { status: 'playing' }
}) === 0);
ok('缺 status 不计分', Points.totalFromProgress({
  a: {}
}) === 0);
ok('null 条目不计分', Points.totalFromProgress({
  a: null,
  b: { status: 'done' }
}) === 10);
ok('混合只算 done', Points.totalFromProgress({
  a: { status: 'done' },
  b: { status: 'playing' },
  c: { status: 'done' },
  d: {}
}) === 20);

console.log('-'.repeat(56));
console.log('共 ' + (pass + fail) + ' 项，' + (fail === 0 ? '全部通过' : fail + ' 项失败'));
process.exit(fail ? 1 : 0);
