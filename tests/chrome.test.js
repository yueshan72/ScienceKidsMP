/* tests/chrome.test.js —— 导航栏 / tabBar 主题跟随测试（Node，无需小程序环境）
 *
 * 覆盖：暖色 / 深色配色、tabBar 开关、未知主题回退、API 缺失容错。
 *
 * 跑法：node tests/chrome.test.js
 */
'use strict';

let calls = [];

global.tt = {
  setNavigationBarColor: function (opts) { calls.push({ api: 'nav', opts: opts }); },
  setTabBarStyle: function (opts) { calls.push({ api: 'tab', opts: opts }); }
};

const Chrome = require('../miniprogram/utils/chrome.js');

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  [OK]   ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (extra ? '  → ' + extra : '')); }
}

console.log('导航栏 / tabBar 主题测试');
console.log('-'.repeat(56));

/* ================= 1. 暖色 ================= */
console.log('\n[1] 暖色主题');
calls = [];
Chrome.apply('warm', { tabBar: true });

const navWarm = calls.find(function (c) { return c.api === 'nav'; });
const tabWarm = calls.find(function (c) { return c.api === 'tab'; });
ok('设置导航栏', !!navWarm);
ok('导航栏背景暖白', navWarm && navWarm.opts.backgroundColor === '#FFF8EE');
ok('导航栏前景黑字', navWarm && navWarm.opts.frontColor === '#000000');
ok('设置 tabBar', !!tabWarm);
ok('tabBar 背景暖白', tabWarm && tabWarm.opts.backgroundColor === '#FFF8EE');
ok('tabBar 选中色橙色', tabWarm && tabWarm.opts.selectedColor === '#FF8A3D');
ok('tabBar 边框 white', tabWarm && tabWarm.opts.borderStyle === 'white');

/* ================= 2. 深色 ================= */
console.log('\n[2] 深色主题');
calls = [];
Chrome.apply('cool');

const navCool = calls.find(function (c) { return c.api === 'nav'; });
ok('设置导航栏', !!navCool);
ok('导航栏背景深空', navCool && navCool.opts.backgroundColor === '#0B1026');
ok('导航栏前景白字', navCool && navCool.opts.frontColor === '#ffffff');
ok('未传 tabBar 时不改 tabBar', !calls.some(function (c) { return c.api === 'tab'; }));

/* ================= 3. 未知主题 ================= */
console.log('\n[3] 未知主题');
calls = [];
Chrome.apply('unknown');
const navUnknown = calls.find(function (c) { return c.api === 'nav'; });
ok('回退到深色', navUnknown && navUnknown.opts.backgroundColor === '#0B1026');

/* ================= 4. 容错 ================= */
console.log('\n[4] 容错');
global.tt = {};
let threw = false;
try {
  Chrome.apply('warm', { tabBar: true });
} catch (e) {
  threw = true;
}
ok('缺少 API 不抛异常', !threw);

global.tt = {
  setNavigationBarColor: function () { throw new Error('boom'); },
  setTabBarStyle: function () { throw new Error('boom'); }
};
threw = false;
try {
  Chrome.apply('warm', { tabBar: true });
} catch (e) {
  threw = true;
}
ok('API 抛异常时也不影响页面', !threw);

/* ================= 5. 页面接线 ================= */
console.log('\n[5] 页面接线');
const fs = require('fs');
const path = require('path');
function pageSource(name) {
  return fs.readFileSync(
    path.join(__dirname, '../miniprogram/pages/' + name + '/' + name + '.js'),
    'utf8'
  );
}

ok('首页调用 Chrome.apply', pageSource('index').indexOf('Chrome.apply') !== -1);
ok('首页带 tabBar', pageSource('index').indexOf('{ tabBar: true }') !== -1);
ok('我的调用 Chrome.apply', pageSource('mine').indexOf('Chrome.apply') !== -1);
ok('我的带 tabBar', pageSource('mine').indexOf('{ tabBar: true }') !== -1);
ok('主题页调用 Chrome.apply', pageSource('topic').indexOf('Chrome.apply') !== -1);
ok('主题页不碰 tabBar', pageSource('topic').indexOf('{ tabBar: true }') === -1);
ok('关卡页调用 Chrome.apply', pageSource('level').indexOf('Chrome.apply') !== -1);
ok('关卡页不碰 tabBar', pageSource('level').indexOf('{ tabBar: true }') === -1);
ok('视频页调用 Chrome.apply', pageSource('video').indexOf('Chrome.apply') !== -1);
ok('视频页不碰 tabBar', pageSource('video').indexOf('{ tabBar: true }') === -1);

console.log('-'.repeat(56));
console.log('共 ' + (pass + fail) + ' 项，' + (fail === 0 ? '全部通过' : fail + ' 项失败'));
process.exit(fail ? 1 : 0);
