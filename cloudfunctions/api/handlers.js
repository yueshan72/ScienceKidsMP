/* cloudfunctions/api/handlers.js —— TOS 后端的业务逻辑（纯函数，无 SDK 依赖）
 *
 * 为什么单独一层：
 *   handlers 只依赖传入的 store（get / put / removeAll），不 require 任何云 SDK。
 *   这样 Node 测试可以直接注入内存 store，不需要装依赖、也不需要真实云环境。
 *
 * 存储接口（由 tos-store.js 实现）：
 *   store.get(openid, type)        → Promise<object|null>   type: user | progress | checkins
 *   store.put(openid, type, doc)   → Promise<void>
 *   store.removeAll(openid)        → Promise<void>          删除该用户三个文档
 *
 * 对外 action 与《接口契约》§3 保持一致；V1.3 起由单个 api 函数承载。
 * 业务规则（星级、徽章、连续天数）全部在服务端判定，前端不可信。
 */
'use strict';

const ok = (data) => ({ code: 0, message: 'ok', data });
const fail = (code, message) => ({ code, message, data: null });

const ALLOWED_AGE = ['3-6', '6-9', '9-12'];

/* V1.0 太空主题关卡数；与旧 progress 云函数的兜底常量保持一致。
   内容仍由客户端静态维护（契约 §8），这里只用于徽章与统计。 */
const TOPIC_LEVEL_COUNT = { space: 3 };

const BADGE_SPACE = {
  badgeId: 'badge_space',
  name: '太空探索者',
  icon: '🏅'
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

/**
 * 统一入口
 * @param {string} openid 由 index.js 从 dySDK context 取出
 * @param {object} params callContainer 的 body（含 name / action / 业务字段）
 * @param {object} store  存储实现
 */
async function dispatch(openid, params, store) {
  params = params || {};
  if (!openid) return fail(1001, '未登录');

  /* name 由 request.js 注入；兼容旧调用：没有 name 时按 action 推断 */
  const name = params.name || inferName(params.action);
  const action = params.action;

  try {
    if (name === 'user') return await handleUser(openid, action, params, store);
    if (name === 'progress') return await handleProgress(openid, action, params, store);
    if (name === 'checkin') return await handleCheckin(openid, action, store);
    return fail(1002, '未知 name: ' + name);
  } catch (e) {
    console.error('[api] store error', e && (e.stack || e));
    return fail(3001, '云存储读写失败');
  }
}

/* ================= user ================= */

async function handleUser(openid, action, params, store) {
  switch (action) {
    case 'login':
      return onLogin(openid, store);
    case 'setAgeGroup':
      return onSetAgeGroup(openid, params, store);
    case 'getProfile':
      return onGetProfile(openid, store);
    case 'deleteData':
      return onDeleteData(openid, store);
    case 'withdrawConsent':
      return onWithdrawConsent(openid, store);
    default:
      return fail(1002, '未知 action: ' + action);
  }
}

async function onLogin(openid, store) {
  const existing = await store.get(openid, 'user');
  if (existing) {
    return ok({ openid: openid, ageGroup: existing.ageGroup || null, isNew: false });
  }
  const now = Date.now();
  await store.put(openid, 'user', {
    openid: openid, ageGroup: null, createdAt: now, updatedAt: now
  });
  return ok({ openid: openid, ageGroup: null, isNew: true });
}

async function onSetAgeGroup(openid, params, store) {
  const ageGroup = params.ageGroup;
  if (ALLOWED_AGE.indexOf(ageGroup) === -1) return fail(1002, '年龄段不合法');

  const user = normalizeUser(await store.get(openid, 'user'), openid);
  user.ageGroup = ageGroup;
  user.updatedAt = Date.now();
  await store.put(openid, 'user', user);
  return ok({ ageGroup: ageGroup });
}

async function onGetProfile(openid, store) {
  const res = await Promise.all([
    store.get(openid, 'user'),
    store.get(openid, 'progress'),
    store.get(openid, 'checkins')
  ]);
  const user = res[0];
  const progress = normalizeProgress(res[1]);
  const checkins = normalizeCheckins(res[2]);

  const doneLevels = Object.keys(progress.levels).filter(function (id) {
    return progress.levels[id] && progress.levels[id].status === 'done';
  }).length;

  return ok({
    openid: openid,
    ageGroup: user ? (user.ageGroup || null) : null,
    badges: progress.badges.filter(Boolean).map(publicBadge),
    stats: {
      doneLevels: doneLevels,
      totalLevels: totalLevels(),
      streak: calcStreak(checkins.dates),
      checkinDays: checkins.dates.length
    }
  });
}

/** 删除我的数据：删除该用户的三个文档（缺失视为已删除） */
async function onDeleteData(openid, store) {
  await store.removeAll(openid);
  return ok({ deleted: true });
}

/** 撤回同意：V1.0 与删除数据一致，不额外保留云端同意记录 */
async function onWithdrawConsent(openid, store) {
  await store.removeAll(openid);
  return ok({ withdrawn: true });
}

/* ================= progress ================= */

async function handleProgress(openid, action, params, store) {
  switch (action) {
    case 'list':
      return onList(openid, params, store);
    case 'complete':
      return onComplete(openid, params, store);
    case 'getBadges':
      return onGetBadges(openid, store);
    default:
      return fail(1002, '未知 action: ' + action);
  }
}

async function onList(openid, params, store) {
  const topicId = params.topicId;
  if (!topicId) return fail(1002, 'topicId 必填');

  let page = params.page === undefined ? 1 : params.page;
  let pageSize = params.pageSize === undefined ? DEFAULT_PAGE_SIZE : params.pageSize;
  page = Number(page);
  pageSize = Number(pageSize);
  if (!Number.isInteger(page) || page < 1) return fail(1002, 'page 不合法');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    return fail(1002, 'pageSize 需为 1~' + MAX_PAGE_SIZE);
  }

  const progress = normalizeProgress(await store.get(openid, 'progress'));
  const all = Object.keys(progress.levels).map(function (id) {
    const p = progress.levels[id] || {};
    return {
      levelId: p.levelId || id,
      topicId: p.topicId,
      status: p.status,
      stars: p.stars || 0,
      completedAt: p.completedAt || null
    };
  }).filter(function (p) {
    return p.topicId === topicId;
  }).sort(function (a, b) {
    return (b.completedAt || 0) - (a.completedAt || 0);
  });

  const start = (page - 1) * pageSize;
  const list = all.slice(start, start + pageSize).map(function (p) {
    return {
      levelId: p.levelId,
      status: p.status,
      stars: p.stars,
      completedAt: p.completedAt
    };
  });

  return ok({
    list: list,
    total: all.length,
    hasMore: start + list.length < all.length
  });
}

/**
 * 关卡完成 —— 发星 / 发徽章（幂等）
 * 星级规则：3 - min(wrongCount, 2)，wrongCount 夹紧到 0~99。
 */
async function onComplete(openid, params, store) {
  const levelId = params.levelId;
  if (!levelId) return fail(1002, 'levelId 必填');

  const topicId = params.topicId || 'space';
  let wrongCount = Number(params.wrongCount);
  if (!Number.isFinite(wrongCount) || wrongCount < 0) wrongCount = 0;
  if (wrongCount > 99) wrongCount = 99;
  const stars = wrongCount === 0 ? 3 : (wrongCount === 1 ? 2 : 1);

  const progress = normalizeProgress(await store.get(openid, 'progress'));
  const existing = progress.levels[levelId];

  if (existing && existing.status === 'done') {
    return ok({
      levelId: levelId,
      status: 'done',
      stars: existing.stars || 0,
      newBadges: [],
      isFirstComplete: false
    });
  }

  progress.levels[levelId] = {
    levelId: levelId,
    topicId: topicId,
    status: 'done',
    stars: stars,
    completedAt: Date.now()
  };

  const newBadges = maybeAwardSpaceBadge(progress, topicId);
  progress.updatedAt = Date.now();
  await store.put(openid, 'progress', progress);

  return ok({
    levelId: levelId,
    status: 'done',
    stars: stars,
    newBadges: newBadges,
    isFirstComplete: true
  });
}

/** 该主题全部通关 → 发「太空探索者」徽章（幂等，直接改 progress 对象） */
function maybeAwardSpaceBadge(progress, topicId) {
  const total = TOPIC_LEVEL_COUNT[topicId] || 0;
  if (!total) return [];

  const done = Object.keys(progress.levels).filter(function (id) {
    const p = progress.levels[id];
    return p && p.topicId === topicId && p.status === 'done';
  }).length;
  if (done < total) return [];

  const owned = progress.badges.some(function (b) {
    return b && b.badgeId === BADGE_SPACE.badgeId;
  });
  if (owned) return [];

  progress.badges.push({
    badgeId: BADGE_SPACE.badgeId,
    name: BADGE_SPACE.name,
    icon: BADGE_SPACE.icon,
    earnedAt: Date.now()
  });
  return [BADGE_SPACE.badgeId];
}

async function onGetBadges(openid, store) {
  const progress = normalizeProgress(await store.get(openid, 'progress'));
  return ok({ list: progress.badges.filter(Boolean).map(publicBadge) });
}

/* ================= checkin ================= */

async function handleCheckin(openid, action, store) {
  switch (action) {
    case 'checkin':
      return onCheckin(openid, store);
    case 'getStreak':
      return onGetStreak(openid, store);
    default:
      return fail(1002, '未知 action: ' + action);
  }
}

/** 今日打卡（幂等），连续天数按服务器日期（UTC+8）计算 */
async function onCheckin(openid, store) {
  const today = dateStrCN(new Date());
  const doc = normalizeCheckins(await store.get(openid, 'checkins'));
  const isNew = doc.dates.indexOf(today) === -1;

  if (isNew) {
    doc.dates.push(today);
    doc.dates.sort();
    doc.updatedAt = Date.now();
    await store.put(openid, 'checkins', doc);
  }

  return ok({
    date: today,
    streak: calcStreak(doc.dates),
    isNew: isNew
  });
}

/** 连续天数 + 最近 30 天日历 */
async function onGetStreak(openid, store) {
  const doc = normalizeCheckins(await store.get(openid, 'checkins'));
  const set = {};
  doc.dates.forEach(function (d) { set[d] = true; });

  const calendar = [];
  const today = dateStrCN(new Date());
  for (let i = 29; i >= 0; i--) {
    const d = addDaysStr(today, -i);
    calendar.push({ date: d, done: !!set[d] });
  }

  const sorted = doc.dates.slice().sort();
  return ok({
    streak: calcStreak(doc.dates),
    lastDate: sorted.length ? sorted[sorted.length - 1] : null,
    calendar: calendar
  });
}

/* ================= 归一化 / 工具 ================= */

function normalizeUser(doc, openid) {
  const d = doc || {};
  const now = Date.now();
  return {
    openid: d.openid || openid,
    ageGroup: ALLOWED_AGE.indexOf(d.ageGroup) !== -1 ? d.ageGroup : null,
    createdAt: d.createdAt || now,
    updatedAt: d.updatedAt || now
  };
}

function normalizeProgress(doc) {
  const d = doc || {};
  return {
    openid: d.openid || '',
    levels: (d.levels && typeof d.levels === 'object' && !Array.isArray(d.levels))
      ? d.levels : {},
    badges: Array.isArray(d.badges) ? d.badges : []
  };
}

function normalizeCheckins(doc) {
  const d = doc || {};
  return {
    openid: d.openid || '',
    dates: Array.isArray(d.dates)
      ? d.dates.filter(function (x) { return typeof x === 'string'; })
      : []
  };
}

function publicBadge(b) {
  return {
    badgeId: b.badgeId,
    name: b.name,
    icon: b.icon || '',
    earnedAt: b.earnedAt || null
  };
}

function totalLevels() {
  return Object.keys(TOPIC_LEVEL_COUNT).reduce(function (n, k) {
    return n + (TOPIC_LEVEL_COUNT[k] || 0);
  }, 0);
}

/** 兼容旧调用：没有 name 时按 action 反推所属函数 */
function inferName(action) {
  if (action === 'login' || action === 'setAgeGroup' || action === 'getProfile'
      || action === 'deleteData' || action === 'withdrawConsent') return 'user';
  if (action === 'complete' || action === 'list' || action === 'getBadges') return 'progress';
  if (action === 'checkin' || action === 'getStreak') return 'checkin';
  return '';
}

/* ---------------- 日期工具（UTC+8，避免服务器时区差异） ---------------- */

function dateStrCN(d) {
  return new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function addDaysStr(s, n) {
  const parts = s.split('-').map(Number);
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + n));
  return d.toISOString().slice(0, 10);
}

function calcStreak(dates) {
  const set = {};
  (dates || []).forEach(function (d) { set[d] = true; });
  let cursor = dateStrCN(new Date());
  if (!set[cursor]) cursor = addDaysStr(cursor, -1);
  let n = 0;
  while (set[cursor]) {
    n++;
    cursor = addDaysStr(cursor, -1);
  }
  return n;
}

module.exports = {
  dispatch: dispatch,
  /* 导出给测试与未来复用 */
  _internals: {
    dateStrCN: dateStrCN,
    addDaysStr: addDaysStr,
    calcStreak: calcStreak,
    normalizeProgress: normalizeProgress,
    normalizeCheckins: normalizeCheckins,
    TOPIC_LEVEL_COUNT: TOPIC_LEVEL_COUNT
  }
};
