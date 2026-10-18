// cloudfunctions/checkin —— 打卡 / 连续天数
// 契约：docs/接口契约.md §3.3
//
// 抖音云函数签名：module.exports = async function (params, context)
//
// ⚠️ 连续天数一律按【服务器日期】判定，绝不使用客户端时间 ——
//    否则改手机时间就能刷打卡（《需求文档》4.3 连续打卡激励留存）。
//    日期按 UTC+8 计算，避免云函数运行环境的时区差异。

'use strict';

const { dySDK } = require('@open-dy/node-server-sdk');

const ok = (data) => ({ code: 0, message: 'ok', data });
const fail = (code, message) => ({ code, message, data: null });

module.exports = async function (params, context) {
  params = params || {};
  const action = params.action;

  let openid = '';
  try {
    openid = (dySDK.context(context).getContext() || {}).openId || '';
  } catch (e) {
    console.error('[checkin] context error', e);
  }

  switch (action) {
    case 'checkin':
      return onCheckin(openid);
    case 'getStreak':
      return onGetStreak(openid);
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

async function datesOf(openid) {
  const res = await db().collection('checkins').where({ openid }).get();
  return rows(res).map((d) => d.date).filter(Boolean);
}

/** 今日打卡（幂等） */
async function onCheckin(openid) {
  if (!openid) return fail(1001, '未登录');

  const today = dateStrCN(new Date());
  try {
    const checkins = db().collection('checkins');
    const res = await checkins.where({ openid, date: today }).get();

    if (!rows(res).length) {
      await checkins.add({ openid, date: today });
    }

    /* 重新取全部日期再算，保证并发/重复调用下 streak 一致 */
    const dates = await datesOf(openid);
    return ok({
      date: today,
      streak: calcStreak(dates),
      isNew: !rows(res).length
    });
  } catch (e) {
    console.error('[checkin] checkin failed', e);
    return fail(3001, '云数据库读写失败');
  }
}

/** 连续天数 + 最近 30 天日历 */
async function onGetStreak(openid) {
  if (!openid) return fail(1001, '未登录');
  try {
    const dates = await datesOf(openid);
    const set = {};
    dates.forEach((d) => { set[d] = true; });

    const calendar = [];
    const today = dateStrCN(new Date());
    for (let i = 29; i >= 0; i--) {
      const d = addDaysStr(today, -i);
      calendar.push({ date: d, done: !!set[d] });
    }

    const sorted = dates.slice().sort();
    return ok({
      streak: calcStreak(dates),
      lastDate: sorted.length ? sorted[sorted.length - 1] : null,
      calendar
    });
  } catch (e) {
    console.error('[checkin] getStreak failed', e);
    return fail(3001, '云数据库读写失败');
  }
}

/* ---------------- 日期工具（UTC+8） ---------------- */

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
