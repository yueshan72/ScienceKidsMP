// cloudfunctions/progress —— 闯关进度
// 契约：docs/接口契约.md §3.2
//
// 抖音云函数签名：module.exports = async function (params, context)
// openId 从 dySDK.context(context).getContext().openId 获取。

'use strict';

const { dySDK } = require('@open-dy/node-server-sdk');

const ok = (data) => ({ code: 0, message: 'ok', data });
const fail = (code, message) => ({ code, message, data: null });

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

/* V1.0 太空主题的关卡数（内容在客户端静态维护，尚未入 levels 集合时的兜底）。
   若 levels 集合已有数据，以集合计数为准。 */
const TOPIC_LEVEL_COUNT = { space: 2 };

const BADGE_SPACE = {
  badgeId: 'badge_space',
  name: '太空探索者',
  icon: '🏅'
};

module.exports = async function (params, context) {
  params = params || {};
  const action = params.action;

  let openid = '';
  try {
    openid = (dySDK.context(context).getContext() || {}).openId || '';
  } catch (e) {
    console.error('[progress] context error', e);
  }

  switch (action) {
    case 'list':
      return onList(openid, params);
    case 'complete':
      return onComplete(openid, params);
    case 'getBadges':
      return onGetBadges(openid);
    default:
      return fail(1002, '未知 action: ' + action);
  }
};

function db() {
  return dySDK.database();
}

function rows(res) {
  return (res && (res.data || res.list)) || [];
}

function countOf(res) {
  if (!res) return 0;
  if (typeof res.total === 'number') return res.total;
  if (Array.isArray(res.data)) return res.data.length;
  return 0;
}

/** 闯关进度列表（数据量小，分页在函数内完成，避免依赖 skip/limit 的差异） */
async function onList(openid, params) {
  if (!openid) return fail(1001, '未登录');
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

  try {
    const res = await db().collection('progress').where({ openid, topicId }).get();
    const all = rows(res).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    const start = (page - 1) * pageSize;
    const list = all.slice(start, start + pageSize).map((p) => ({
      levelId: p.levelId,
      status: p.status,
      stars: p.stars || 0,
      completedAt: p.completedAt || null
    }));
    return ok({
      list,
      total: all.length,
      hasMore: start + list.length < all.length
    });
  } catch (e) {
    console.error('[progress] list failed', e);
    return fail(3001, '云数据库读写失败');
  }
}

/**
 * 关卡完成 —— 发星 / 发徽章
 *
 * 幂等：已完成的 (openid, levelId) 直接返回，不重复发星/发徽章。
 * 依赖 progress 集合 (openid, levelId) 联合唯一索引（契约 §4.3）。
 *
 * 星级规则（V1.0）：3 - min(wrongCount, 2)，wrongCount 由客户端上报并夹紧到 0~99。
 * 奖励判定只在服务端做，前端不可信。
 */
async function onComplete(openid, params) {
  if (!openid) return fail(1001, '未登录');
  const levelId = params.levelId;
  if (!levelId) return fail(1002, 'levelId 必填');

  const topicId = params.topicId || 'space';
  let wrongCount = Number(params.wrongCount);
  if (!Number.isFinite(wrongCount) || wrongCount < 0) wrongCount = 0;
  if (wrongCount > 99) wrongCount = 99;
  const stars = wrongCount === 0 ? 3 : (wrongCount === 1 ? 2 : 1);

  try {
    const database = db();
    const progress = database.collection('progress');

    const existingRes = await progress.where({ openid, levelId }).get();
    const existing = rows(existingRes)[0];

    if (existing && existing.status === 'done') {
      return ok({
        levelId,
        status: 'done',
        stars: existing.stars || 0,
        newBadges: [],
        isFirstComplete: false
      });
    }

    /* 已有 todo 记录时走 update，避免与 (openid, levelId) 唯一索引冲突 */
    if (existing) {
      await progress.where({ openid, levelId }).update({
        topicId,
        status: 'done',
        stars,
        completedAt: Date.now()
      });
    } else {
      await progress.add({
        openid,
        levelId,
        topicId,
        status: 'done',
        stars,
        completedAt: Date.now()
      });
    }

    /* 徽章失败不应把「已完成」变成错误：进度已入库，返回成功更安全 */
    let newBadges = [];
    try {
      newBadges = await maybeAwardSpaceBadge(database, openid, topicId);
    } catch (e) {
      console.error('[progress] badge award failed (completion kept)', e);
    }

    return ok({
      levelId,
      status: 'done',
      stars,
      newBadges,
      isFirstComplete: true
    });
  } catch (e) {
    console.error('[progress] complete failed', e);
    return fail(3001, '云数据库读写失败');
  }
}

/** 该主题全部通关 → 发「太空探索者」徽章（幂等） */
async function maybeAwardSpaceBadge(database, openid, topicId) {
  const levelsRes = await database.collection('levels').where({ topicId }).get();
  let total = rows(levelsRes).length;
  if (!total) total = TOPIC_LEVEL_COUNT[topicId] || 0;
  if (!total) return [];

  const doneRes = await database.collection('progress')
    .where({ openid, topicId, status: 'done' })
    .get();
  if (rows(doneRes).length < total) return [];

  const badges = database.collection('badges');
  const owned = await badges.where({ openid, badgeId: BADGE_SPACE.badgeId }).get();
  if (rows(owned).length) return [];

  await badges.add({
    openid,
    badgeId: BADGE_SPACE.badgeId,
    name: BADGE_SPACE.name,
    icon: BADGE_SPACE.icon,
    earnedAt: Date.now()
  });
  return [BADGE_SPACE.badgeId];
}

/** 徽章列表 */
async function onGetBadges(openid) {
  if (!openid) return fail(1001, '未登录');
  try {
    const res = await db().collection('badges').where({ openid }).get();
    return ok({
      list: rows(res).map((b) => ({
        badgeId: b.badgeId,
        name: b.name,
        icon: b.icon || '',
        earnedAt: b.earnedAt || null
      }))
    });
  } catch (e) {
    console.error('[progress] getBadges failed', e);
    return fail(3001, '云数据库读写失败');
  }
}
