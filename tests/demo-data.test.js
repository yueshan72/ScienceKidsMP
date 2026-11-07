/* tests/demo-data.test.js —— 演示内容数据完整性测试（Node，无需小程序环境）
 *
 * 覆盖：内容字段、封面文件存在、视频文件存在、关卡数据完整、levelId 引用有效。
 *
 * 跑法：node tests/demo-data.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const DEMO = require('../miniprogram/utils/demo-data.js');

const ROOT = path.join(__dirname, '..', 'miniprogram');
const AGES = ['3-6', '6-9', '9-12'];

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  [OK]   ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (extra ? '  → ' + extra : '')); }
}

function fsPath(packagePath) {
  return path.join(ROOT, packagePath.replace(/^\//, ''));
}

console.log('演示内容数据测试');
console.log('-'.repeat(56));

/* ================= 1. 内容字段 ================= */
console.log('\n[1] 内容字段');
ok('有 6 条内容', DEMO.contents.length === 6, String(DEMO.contents.length));
ok('每条都有 _id', DEMO.contents.every(function (c) { return !!c._id; }));
ok('每条都有标题', DEMO.contents.every(function (c) { return !!c.title; }));
ok('每条都有简介', DEMO.contents.every(function (c) { return !!c.desc; }));
ok('每条年龄段合法', DEMO.contents.every(function (c) { return AGES.indexOf(c.ageGroup) !== -1; }));
ok('每条都有封面', DEMO.contents.every(function (c) { return !!c.cover; }));
ok('封面路径以 /assets/covers/ 开头',
  DEMO.contents.every(function (c) { return c.cover.indexOf('/assets/covers/') === 0; }));

/* ================= 2. 文件存在 ================= */
console.log('\n[2] 文件存在');
const missingCovers = DEMO.contents.filter(function (c) { return !fs.existsSync(fsPath(c.cover)); });
ok('所有封面文件存在', missingCovers.length === 0,
  missingCovers.map(function (c) { return c.cover; }).join(', '));

const tinyCovers = DEMO.contents.filter(function (c) {
  try { return fs.statSync(fsPath(c.cover)).size < 1024; } catch (e) { return true; }
});
ok('封面文件不是空文件', tinyCovers.length === 0,
  tinyCovers.map(function (c) { return c.cover; }).join(', '));

const withMedia = DEMO.contents.filter(function (c) { return !!c.mediaUrl; });
const missingMedia = withMedia.filter(function (c) {
  if (/^https:\/\//.test(c.mediaUrl)) return false; // 云端视频不检查本地文件
  return !fs.existsSync(fsPath(c.mediaUrl));
});
ok('所有配了视频的内容文件存在', missingMedia.length === 0,
  missingMedia.map(function (c) { return c.mediaUrl; }).join(', '));

/* ================= 3. 关卡数据 ================= */
console.log('\n[3] 关卡数据');
const levelIds = Object.keys(DEMO.levels);
ok('至少 3 个关卡', levelIds.length >= 3, String(levelIds.length));
ok('每个关卡都有名称/科普点/交互配置',
  levelIds.every(function (id) {
    const lv = DEMO.levels[id];
    return !!lv.name && !!lv.sciencePoint && !!lv.interactionConfig;
  }));
ok('每个关卡都有 scene',
  levelIds.every(function (id) { return !!DEMO.levels[id].scene; }));

const badRefs = DEMO.contents.filter(function (c) {
  return c.levelId && !DEMO.levels[c.levelId];
});
ok('内容的 levelId 都能找到对应关卡', badRefs.length === 0,
  badRefs.map(function (c) { return c.levelId; }).join(', '));

console.log('-'.repeat(56));
console.log('共 ' + (pass + fail) + ' 项，' + (fail === 0 ? '全部通过' : fail + ' 项失败'));
process.exit(fail ? 1 : 0);
