/* tests/tos-api.test.js —— TOS 后端（云函数 api）行为测试
 *
 * 不需要云环境、不需要安装 @volcengine/tos-sdk：
 *   - handlers 只依赖注入的 store；
 *   - tos-store 用假 client 验证 JSON 读写与 key 规则。
 *
 * 覆盖：登录、年龄、通关/星级/徽章、进度列表、打卡/连续天数、
 *       删除/撤回、未知 action、存储故障、name 兼容推断、key 安全。
 *
 * 跑法：node tests/tos-api.test.js
 */
'use strict';

const { dispatch } = require('../cloudfunctions/api/handlers.js');
const tosStore = require('../cloudfunctions/api/tos-store.js');

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  [OK]   ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (extra ? '  → ' + extra : '')); }
}

/** 内存 store，接口与 tos-store 一致 */
function createMemoryStore() {
  const docs = new Map();
  function key(openid, type) { return openid + '/' + type; }
  return {
    docs: docs,
    get: async function (openid, type) {
      const k = key(openid, type);
      return docs.has(k) ? JSON.parse(JSON.stringify(docs.get(k))) : null;
    },
    put: async function (openid, type, doc) {
      docs.set(key(openid, type), JSON.parse(JSON.stringify(doc)));
    },
    removeAll: async function (openid) {
      ['user', 'progress', 'checkins'].forEach(function (t) { docs.delete(key(openid, t)); });
    }
  };
}

function call(store, openid, name, action, extra) {
  const p = Object.assign({ name: name, action: action }, extra || {});
  return dispatch(openid, p, store);
}

async function run() {
  console.log('TOS 后端测试');
  console.log('-'.repeat(56));

  /* ================= 1. 登录 ================= */
  console.log('\n[1] 登录');
  let store = createMemoryStore();
  let r = await call(store, 'user-1', 'user', 'login');
  ok('首次登录 code=0', r.code === 0);
  ok('首次登录 isNew=true', r.data.isNew === true);
  ok('首次登录 ageGroup=null', r.data.ageGroup === null);

  r = await call(store, 'user-1', 'user', 'login');
  ok('再次登录 isNew=false', r.data.isNew === false);

  r = await call(store, '', 'user', 'login');
  ok('空 openid → 1001', r.code === 1001);

  r = await call(store, 'user-1', 'unknown', 'login');
  ok('未知 name → 1002', r.code === 1002);

  /* ================= 2. 年龄 ================= */
  console.log('\n[2] 年龄');
  r = await call(store, 'user-1', 'user', 'setAgeGroup', { ageGroup: '2-3' });
  ok('非法年龄 → 1002', r.code === 1002, String(r.code));

  r = await call(store, 'user-1', 'user', 'setAgeGroup', { ageGroup: '6-9' });
  ok('合法年龄 → code=0', r.code === 0);
  ok('返回 ageGroup=6-9', r.data.ageGroup === '6-9');

  r = await call(store, 'user-1', 'user', 'getProfile');
  ok('档案里年龄已更新', r.data.ageGroup === '6-9');

  /* ================= 3. 通关 / 星级 / 徽章 ================= */
  console.log('\n[3] 通关与徽章');
  r = await call(store, 'user-1', 'progress', 'complete',
    { levelId: 'rocket-1', topicId: 'space', wrongCount: 0 });
  ok('首次通关 code=0', r.code === 0);
  ok('0 次点错 = 3 星', r.data.stars === 3, String(r.data.stars));
  ok('只通一关不发徽章', (r.data.newBadges || []).length === 0);
  ok('isFirstComplete=true', r.data.isFirstComplete === true);

  r = await call(store, 'user-1', 'progress', 'complete',
    { levelId: 'rocket-1', topicId: 'space', wrongCount: 2 });
  ok('重复通关 isFirstComplete=false', r.data.isFirstComplete === false);
  ok('重复通关不改星星', r.data.stars === 3, String(r.data.stars));

  r = await call(store, 'user-1', 'progress', 'complete',
    { levelId: 'meteor-2', topicId: 'space', wrongCount: 1 });
  ok('1 次点错 = 2 星', r.data.stars === 2, String(r.data.stars));
  ok('两关未全通不发徽章', (r.data.newBadges || []).length === 0);

  r = await call(store, 'user-1', 'progress', 'complete',
    { levelId: 'earth-3', topicId: 'space', wrongCount: 0 });
  ok('三关全通发徽章', (r.data.newBadges || []).indexOf('badge_space') !== -1);

  r = await call(store, 'user-1', 'progress', 'getBadges');
  ok('徽章列表 1 个', r.data.list.length === 1);
  ok('徽章名正确', r.data.list[0].name === '太空探索者');

  r = await call(store, 'user-1', 'user', 'getProfile');
  ok('档案 doneLevels=3', r.data.stats.doneLevels === 3, String(r.data.stats.doneLevels));
  ok('档案 totalLevels=3', r.data.stats.totalLevels === 3, String(r.data.stats.totalLevels));
  ok('档案 badges=1', r.data.badges.length === 1);

  /* ================= 4. 进度列表 ================= */
  console.log('\n[4] 进度列表');
  r = await call(store, 'user-1', 'progress', 'list', {});
  ok('缺 topicId → 1002', r.code === 1002);

  r = await call(store, 'user-1', 'progress', 'list', { topicId: 'space' });
  ok('space 总数 3', r.data.total === 3, String(r.data.total));
  ok('默认一页 3 条', r.data.list.length === 3);
  ok('hasMore=false', r.data.hasMore === false);

  r = await call(store, 'user-1', 'progress', 'list', { topicId: 'space', pageSize: 1 });
  ok('pageSize=1 返回 1 条', r.data.list.length === 1);
  ok('pageSize=1 时 hasMore=true', r.data.hasMore === true);
  ok('列表字段含 stars', typeof r.data.list[0].stars === 'number');

  r = await call(store, 'user-1', 'progress', 'list', { topicId: 'space', page: 0 });
  ok('非法 page → 1002', r.code === 1002);

  /* ================= 5. 打卡 ================= */
  console.log('\n[5] 打卡与连续天数');
  r = await call(store, 'user-1', 'checkin', 'checkin');
  const today = r.data.date;
  ok('首次打卡 isNew=true', r.data.isNew === true);
  ok('连续天数 = 1', r.data.streak === 1, String(r.data.streak));
  ok('日期格式 YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(today), today);

  r = await call(store, 'user-1', 'checkin', 'checkin');
  ok('同日重复打卡 isNew=false', r.data.isNew === false);
  ok('同日连续天数仍为 1', r.data.streak === 1, String(r.data.streak));

  r = await call(store, 'user-1', 'checkin', 'getStreak');
  ok('日历 30 天', r.data.calendar.length === 30);
  ok('lastDate = 今天', r.data.lastDate === today);
  ok('今天在日历中已完成', r.data.calendar[29].done === true);

  r = await call(store, 'user-1', 'user', 'getProfile');
  ok('档案 checkinDays=1', r.data.stats.checkinDays === 1, String(r.data.stats.checkinDays));
  ok('档案 streak=1', r.data.stats.streak === 1, String(r.data.stats.streak));

  /* ================= 6. 删除 / 撤回 ================= */
  console.log('\n[6] 删除与撤回');
  r = await call(store, 'user-1', 'user', 'deleteData');
  ok('删除 code=0', r.code === 0);
  ok('删除后无文档', store.docs.size === 0, String(store.docs.size));

  r = await call(store, 'user-1', 'user', 'getProfile');
  ok('删除后年龄为 null', r.data.ageGroup === null);
  ok('删除后 doneLevels=0', r.data.stats.doneLevels === 0);

  r = await call(store, 'user-1', 'user', 'login');
  ok('删除后再登录 isNew=true', r.data.isNew === true);

  await call(store, 'user-1', 'user', 'setAgeGroup', { ageGroup: '9-12' });
  await call(store, 'user-1', 'checkin', 'checkin');
  r = await call(store, 'user-1', 'user', 'withdrawConsent');
  ok('撤回 code=0', r.code === 0);
  ok('撤回后无文档', store.docs.size === 0, String(store.docs.size));

  /* ================= 7. name 兼容推断 ================= */
  console.log('\n[7] 没有 name 时按 action 推断');
  store = createMemoryStore();
  r = await dispatch('user-2', { action: 'checkin' }, store);
  ok('action=checkin 能路由', r.code === 0 && r.data.isNew === true);
  r = await dispatch('user-2', { action: 'complete', levelId: 'rocket-1' }, store);
  ok('action=complete 能路由', r.code === 0 && r.data.stars === 3);
  r = await dispatch('user-2', { action: 'setAgeGroup', ageGroup: '3-6' }, store);
  ok('action=setAgeGroup 能路由', r.code === 0);

  /* ================= 8. 存储故障 ================= */
  console.log('\n[8] 存储故障');
  const broken = {
    get: async function () { throw new Error('TOS down'); },
    put: async function () { throw new Error('TOS down'); },
    removeAll: async function () { throw new Error('TOS down'); }
  };
  const warn = console.error;
  console.error = function () {};
  r = await call(broken, 'user-3', 'user', 'login');
  ok('读取失败 → 3001', r.code === 3001, String(r.code));
  r = await call(broken, 'user-3', 'user', 'deleteData');
  ok('删除失败 → 3001', r.code === 3001, String(r.code));
  console.error = warn;

  /* ================= 9. TOS store：key 与 JSON 读写 ================= */
  console.log('\n[9] TOS store（假 client）');
  process.env.TOS_BUCKET = 'test-bucket';
  process.env.TOS_ACCESS_KEY_ID = 'ak';
  process.env.TOS_ACCESS_KEY_SECRET = 'sk';
  process.env.TOS_PREFIX = 'sciencekids';
  process.env.TOS_ENDPOINT = 'https://tos-cn-beijing.volces.com';

  const cfg = tosStore._readConfig();
  ok('endpoint 去掉协议头',
    cfg.endpoint === 'tos-cn-beijing.volces.com', cfg.endpoint);
  ok('https 时 secure=true', cfg.secure === true);

  process.env.TOS_ENDPOINT = 'http://tos-cn-beijing.volces.com';
  const cfg2 = tosStore._readConfig();
  ok('http 时 secure=false', cfg2.secure === false);
  ok('http 也去掉协议头',
    cfg2.endpoint === 'tos-cn-beijing.volces.com', cfg2.endpoint);

  const objects = new Map();
  async function* oneChunk(buf) { yield buf; }
  const fakeClient = {
    putObject: async function (opts) {
      objects.set(opts.bucket + '/' + opts.key, Buffer.from(opts.body).toString('utf8'));
    },
    getObjectV2: async function (opts) {
      const k = opts.bucket + '/' + opts.key;
      if (!objects.has(k)) {
        const e = new Error('NoSuchKey');
        e.statusCode = 404;
        throw e;
      }
      return { data: { content: oneChunk(Buffer.from(objects.get(k), 'utf8')) } };
    },
    deleteObject: async function (opts) {
      const k = opts.bucket + '/' + opts.key;
      if (!objects.has(k)) {
        const e = new Error('NoSuchKey');
        e.statusCode = 404;
        throw e;
      }
      objects.delete(k);
    }
  };
  tosStore._setClientFactory(function () { return fakeClient; });

  ok('key 结构正确',
    tosStore._keyOf('abc-123', 'user') === 'sciencekids/abc-123/user.json',
    tosStore._keyOf('abc-123', 'user'));
  ok('openid 中的斜杠被收敛',
    tosStore._keyOf('../a/b', 'progress') === 'sciencekids/___a_b/progress.json',
    tosStore._keyOf('../a/b', 'progress'));

  let keyThrew = false;
  try { tosStore._keyOf('abc', 'hack'); } catch (e) { keyThrew = true; }
  ok('未知文档类型抛错', keyThrew === true);

  await tosStore.put('u-tos', 'user', { openid: 'u-tos', ageGroup: '6-9' });
  let got = await tosStore.get('u-tos', 'user');
  ok('put 后可 get', got && got.ageGroup === '6-9');

  got = await tosStore.get('u-missing', 'user');
  ok('对象不存在返回 null', got === null);

  await tosStore.removeAll('u-tos');
  got = await tosStore.get('u-tos', 'user');
  ok('removeAll 后读不到', got === null);
  ok('removeAll 不存在的对象不报错', true);

  tosStore._setClientFactory(null);
  delete process.env.TOS_BUCKET;
  delete process.env.TOS_ACCESS_KEY_ID;
  delete process.env.TOS_ACCESS_KEY_SECRET;
  delete process.env.TOS_PREFIX;
  delete process.env.TOS_ENDPOINT;

  console.log('\n' + '-'.repeat(56));
  console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  process.exit(fail === 0 ? 0 : 1);
}

run().catch(function (e) {
  console.error('测试执行异常：', e);
  process.exit(1);
});
