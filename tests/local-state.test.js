/* tests/local-state.test.js —— 本地状态层行为测试（Node，无需小程序环境）
 *
 * 覆盖：年龄持久化、通关幂等/星级、徽章发放、打卡连续天数、收藏、
 *       删除数据、撤回同意。
 *
 * 跑法：node tests/local-state.test.js
 */
'use strict';

const store = new Map();
global.tt = {
  getStorageSync: (k) => (store.has(k) ? store.get(k) : ''),
  setStorageSync: (k, v) => { store.set(k, v); },
  removeStorageSync: (k) => { store.delete(k); }
};

const DateUtil = require('../miniprogram/utils/date.js');
const Local = require('../miniprogram/utils/local-state.js');
const progress = require('../miniprogram/utils/mock-progress.js');

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  [OK]   ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (extra ? '  → ' + extra : '')); }
}

function resetStore() {
  store.clear();
}

function todayCN() {
  return DateUtil.dateStrCN(new Date());
}

function daysAgo(n) {
  return DateUtil.addDaysStr(todayCN(), -n);
}

console.log('本地状态层测试');
console.log('-'.repeat(56));

/* ================= 1. 年龄 ================= */
console.log('\n[1] 年龄');
resetStore();
ok('初始无年龄', Local.getAgeGroup() === null);
Local.setAgeGroup('6-9');
ok('设置后可读回', Local.getAgeGroup() === '6-9');

/* ================= 2. 通关与星级 ================= */
console.log('\n[2] 通关与星级');
const lvIds = ['rocket-1', 'meteor-2'];
ok('初始未通关', progress.get('rocket-1') === null);
const r1 = progress.complete('rocket-1', 0);
ok('首次通关 isFirstComplete=true', r1.isFirstComplete === true);
ok('0 次点错 = 3 星', r1.stars === 3, String(r1.stars));
ok('只通一关不发徽章', (r1.newBadges || []).length === 0);
ok('进度列表显示 done', progress.list(lvIds)[0].status === 'done');
ok('已完成 1 关', progress.doneCountOf(lvIds) === 1);

const r1b = progress.complete('rocket-1', 2);
ok('重复通关幂等：不再算首次', r1b.isFirstComplete === false);
ok('重复通关不改星星', r1b.stars === 3, String(r1b.stars));

const r2 = progress.complete('meteor-2', 1);
ok('1 次点错 = 2 星', r2.stars === 2, String(r2.stars));
ok('两关全通发徽章', (r2.newBadges || []).indexOf('badge_space') !== -1);
ok('徽章列表有 1 个', progress.badges().length === 1);
ok('徽章名正确', progress.badges()[0].name === '太空探索者');
ok('重复发徽章幂等', Local.awardBadge(Local.BADGE_SPACE) === false && progress.badges().length === 1);

/* ================= 3. 打卡 ================= */
console.log('\n[3] 打卡与连续天数');
const c1 = Local.checkinToday();
ok('今日首次打卡 isNew=true', c1.isNew === true);
ok('连续天数 = 1', c1.streak === 1, String(c1.streak));
const c2 = Local.checkinToday();
ok('同日重复打卡 isNew=false', c2.isNew === false);
ok('同日后连续天数仍为 1', c2.streak === 1);

/* 补两天历史，验证连续计算 */
store.set('sci.checkins', [daysAgo(2), daysAgo(1), todayCN()]);
const s = Local.getStreak();
ok('昨天+前天+今天 → 连续 3 天', s.streak === 3, String(s.streak));
ok('日历 30 天', s.calendar.length === 30);
ok('今天在日历里且已打卡',
  s.calendar[29].date === todayCN() && s.calendar[29].done === true);

/* ================= 4. 收藏与点赞 ================= */
console.log('\n[4] 收藏与点赞');
ok('初始无收藏', Local.getFavorites().length === 0);
ok('收藏返回 true', Local.toggleFavorite('c1') === true);
ok('已收藏', Local.isFavorite('c1') === true);
ok('取消收藏返回 false', Local.toggleFavorite('c1') === false);
ok('取消后不在列表', Local.isFavorite('c1') === false);

ok('初始无点赞', Local.getLikes().length === 0);
ok('点赞返回 true', Local.toggleLike('c1') === true);
ok('已点赞', Local.isLiked('c1') === true);
ok('取消点赞返回 false', Local.toggleLike('c1') === false);

/* ================= 5. 同意 / 删除 / 撤回 ================= */
console.log('\n[5] 同意与数据清理');
ok('初始未同意', Local.getConsent().granted === false);
Local.grantConsent();
ok('同意后 granted=true', Local.getConsent().granted === true);

Local.setAgeGroup('9-12');
Local.toggleFavorite('c2');
Local.toggleLike('c2');
Local.deleteAllData();
ok('删除数据后年龄清空', Local.getAgeGroup() === null);
ok('删除数据后进度清空', progress.get('rocket-1') === null);
ok('删除数据后收藏清空', Local.getFavorites().length === 0);
ok('删除数据后点赞清空', Local.getLikes().length === 0);
ok('删除数据后同意记录也清空', Local.getConsent().granted === false && Local.getConsent().withdrawnAt === null);

Local.grantConsent();
Local.setAgeGroup('3-6');
Local.checkinToday();
Local.withdrawConsent();
const wc = Local.getConsent();
ok('撤回后 granted=false', wc.granted === false);
ok('撤回后记录 withdrawnAt', typeof wc.withdrawnAt === 'number' && wc.withdrawnAt > 0);
ok('撤回后年龄/打卡被清空',
  Local.getAgeGroup() === null && Local.getCheckins().length === 0);

/* ================= 6. 损坏存储的容错 ================= */
console.log('\n[6] 损坏存储的容错');
resetStore();
store.set('sci.progress', 'not-an-object');
ok('损坏的进度 → 安全空对象', Object.keys(Local.getProgress()).length === 0);
store.set('sci.ageGroup', 'not-an-age');
ok('非法年龄 → null', Local.getAgeGroup() === null);
store.set('sci.checkins', 'not-an-array');
ok('损坏的打卡 → 安全空数组', Local.getCheckins().length === 0);
store.set('sci.consent', 'not-an-object');
ok('损坏的同意记录 → 未同意', Local.getConsent().granted === false);
store.set('sci.favorites', { a: 1 });
ok('损坏的收藏 → 安全空数组', Local.getFavorites().length === 0);

console.log('-'.repeat(56));
console.log('共 ' + (pass + fail) + ' 项，' + (fail === 0 ? '全部通过' : fail + ' 项失败'));
process.exit(fail ? 1 : 0);
