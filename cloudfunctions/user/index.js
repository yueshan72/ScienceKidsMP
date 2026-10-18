// cloudfunctions/user —— 登录与用户信息
// 契约：docs/接口契约.md §3.1
//
// 抖音云函数签名（官方文档已确认）：
//   module.exports = async function (params, context)
//   params  = callContainer 的 body（JSON）
//   context = 调用上下文，经 dySDK.context(context).getContext() 取 openId
//
// 各云函数独立部署，信封工具在四个函数里各留一份是刻意的，
// 不做跨函数共享，避免部署时互相牵连。

'use strict';

const { dySDK } = require('@open-dy/node-server-sdk');

const ok = (data) => ({ code: 0, message: 'ok', data });
const fail = (code, message) => ({ code, message, data: null });

const ALLOWED_AGE = ['3-6', '6-9', '9-12'];

module.exports = async function (params, context) {
  params = params || {};
  const action = params.action;

  let openid = '';
  try {
    openid = (dySDK.context(context).getContext() || {}).openId || '';
  } catch (e) {
    console.error('[user] context error', e);
  }

  switch (action) {
    case 'login':
      return onLogin(openid, params);
    case 'setAgeGroup':
      return onSetAgeGroup(openid, params);
    case 'getProfile':
      return onGetProfile(openid);
    case 'deleteData':
      return onDeleteData(openid);
    case 'withdrawConsent':
      return onWithdrawConsent(openid);
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

/** 登录：平台已注入 openId，首次访问建用户，ageGroup 为 null */
async function onLogin(openid) {
  if (!openid) return fail(1001, '未登录');
  try {
    const users = db().collection('users');
    const res = await users.where({ openid }).get();
    const list = rows(res);
    if (list.length) {
      return ok({ openid, ageGroup: list[0].ageGroup || null, isNew: false });
    }
    await users.add({ openid, ageGroup: null, createdAt: Date.now() });
    return ok({ openid, ageGroup: null, isNew: true });
  } catch (e) {
    console.error('[user] login failed', e);
    return fail(3001, '云数据库读写失败');
  }
}

/** 设置 / 更正年龄段 */
async function onSetAgeGroup(openid, params) {
  if (!openid) return fail(1001, '未登录');
  const ageGroup = params.ageGroup;
  if (ALLOWED_AGE.indexOf(ageGroup) === -1) return fail(1002, '年龄段不合法');

  try {
    const users = db().collection('users');
    const res = await users.where({ openid }).get();
    if (rows(res).length) {
      await users.where({ openid }).update({ ageGroup });
    } else {
      await users.add({ openid, ageGroup, createdAt: Date.now() });
    }
    return ok({ ageGroup });
  } catch (e) {
    console.error('[user] setAgeGroup failed', e);
    return fail(3001, '云数据库读写失败');
  }
}

/**
 * 用户档案：users + badges + stats
 * 出参 { openid, ageGroup, badges[], stats }
 * ⚠️ 合规：不采集未成年人敏感信息、精确位置、联系方式
 */
async function onGetProfile(openid) {
  if (!openid) return fail(1001, '未登录');

  try {
    const database = db();
    const users = database.collection('users');
    const userRes = await users.where({ openid }).get();
    const user = rows(userRes)[0] || null;

    const badgesRes = await database.collection('badges').where({ openid }).get();
    const badges = rows(badgesRes).map((b) => ({
      badgeId: b.badgeId,
      name: b.name,
      icon: b.icon || '',
      earnedAt: b.earnedAt || null
    }));

    const progressRes = await database.collection('progress').where({ openid, status: 'done' }).count();
    const checkinRes = await database.collection('checkins').where({ openid }).count();

    /* levels 是可选集合（V1.0 内容静态）；缺失时不应让整个档案失败 */
    let totalLevels = 0;
    try {
      totalLevels = countOf(await database.collection('levels').count());
    } catch (e) {
      totalLevels = 0;
    }

    /* 连续天数按服务器日期计算 */
    const datesRes = await database.collection('checkins').where({ openid }).get();
    const dates = rows(datesRes).map((d) => d.date).filter(Boolean);
    const streak = calcStreak(dates);

    return ok({
      openid,
      ageGroup: user ? (user.ageGroup || null) : null,
      badges,
      stats: {
        doneLevels: countOf(progressRes),
        totalLevels,
        streak,
        checkinDays: countOf(checkinRes)
      }
    });
  } catch (e) {
    console.error('[user] getProfile failed', e);
    return fail(3001, '云数据库读写失败');
  }
}

/**
 * 删除我的数据：清空该用户在四张业务表中的记录。
 * 逐表 best-effort：某一表失败不阻止其他表继续删，最后统一报告失败以便重试。
 */
async function onDeleteData(openid) {
  if (!openid) return fail(1001, '未登录');

  const database = db();
  const collections = ['progress', 'checkins', 'badges', 'users'];
  let failed = false;

  for (const name of collections) {
    try {
      await database.collection(name).where({ openid }).remove();
    } catch (e) {
      console.error('[user] deleteData failed on ' + name, e);
      failed = true;
    }
  }

  if (failed) return fail(3001, '部分数据删除失败，请重试');
  return ok({ deleted: true });
}

/**
 * 撤回监护人同意：停止处理并删除已采集数据。
 * V1.0 采用「删除数据」作为最彻底的停止处理方式；不额外保留同意记录。
 */
async function onWithdrawConsent(openid) {
  const r = await onDeleteData(openid);
  if (r.code !== 0) return r;
  return ok({ withdrawn: true });
}

/* ---------------- 日期工具（服务器时区按 UTC+8，避免服务器 TZ 差异） ---------------- */

function dateStrCN(d) {
  const x = new Date(d.getTime() + 8 * 3600 * 1000);
  return x.toISOString().slice(0, 10);
}

function addDaysStr(s, n) {
  const parts = s.split('-').map(Number);
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + n));
  return d.toISOString().slice(0, 10);
}

function calcStreak(dates) {
  const set = {};
  (dates || []).forEach((d) => { set[d] = true; });
  let cursor = dateStrCN(new Date());
  if (!set[cursor]) cursor = addDaysStr(cursor, -1);
  let n = 0;
  while (set[cursor]) {
    n++;
    cursor = addDaysStr(cursor, -1);
  }
  return n;
}
