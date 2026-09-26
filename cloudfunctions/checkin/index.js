// cloudfunctions/checkin —— 打卡 / 连续天数
// 契约：docs/接口契约.md §3.3
//
// 注：各云函数独立部署，信封工具在四个函数里各留一份是刻意的。

const ok = (data) => ({ code: 0, message: 'ok', data });
const fail = (code, message) => ({ code, message, data: null });

exports.main = async (event = {}) => {
  const { action, ...payload } = event;
  const openid = event.openid || (event.userInfo && event.userInfo.openid) || null;

  switch (action) {
    case 'checkin':
      return onCheckin(openid);

    case 'getStreak':
      return onGetStreak(openid);

    default:
      return fail(1002, `未知 action: ${action}`);
  }
};

/**
 * 今日打卡
 * 出参 { date, streak, isNew }
 *
 * ⚠️ 连续天数按**服务器日期**判定，绝不用客户端时间 ——
 *    否则改手机时间就能刷打卡（《需求文档》4.3 连续打卡激励留存）。
 */
async function onCheckin(openid) {
  if (!openid) return fail(1001, '未登录');

  const date = serverDate();
  // TODO(S3)：
  //   1. checkins 集合查 (openid, date) 是否已存在 → isNew=false 幂等返回
  //   2. 否则插入，并计算是否与 lastDate 连续 → 累加或重置 streak
  //   3. 依赖 checkins (openid, date) 联合唯一索引
  return ok({ date, streak: 0, isNew: false });
}

/**
 * 连续打卡天数
 * 出参 { streak, lastDate, calendar[] }
 */
async function onGetStreak(openid) {
  if (!openid) return fail(1001, '未登录');
  return ok({ streak: 0, lastDate: null, calendar: [] });
}

/** 服务器当天日期，格式 YYYY-MM-DD */
function serverDate() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
