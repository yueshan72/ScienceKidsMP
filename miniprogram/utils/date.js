/* utils/date.js —— 日期与连续打卡计算（UTC+8）
 *
 * 为什么要统一用 UTC+8：
 *   云端打卡按服务器日期（UTC+8）判定；本地演示若用设备本地时区，
 *   当设备时区不是中国时会出现「本地已打卡、云端不认」的偏差。
 *   演示模式也按 UTC+8 计算，保证两侧口径一致。
 */
'use strict';

/** 毫秒时间戳 / Date → YYYY-MM-DD（UTC+8） */
function dateStrCN(d) {
  const x = new Date(((d || new Date()).getTime()) + 8 * 3600 * 1000);
  return x.toISOString().slice(0, 10);
}

/** YYYY-MM-DD 加减天数，返回 YYYY-MM-DD */
function addDaysStr(s, n) {
  const p = s.split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10);
}

/**
 * 连续天数：从今天往回数；今天没打卡则从昨天起算（当天还有机会补）。
 * @param {string[]} dates 已打卡日期（YYYY-MM-DD）
 * @param {string} [today] 指定「今天」，便于测试
 */
function calcStreak(dates, today) {
  const set = {};
  (dates || []).forEach((d) => { set[d] = true; });
  let cursor = today || dateStrCN(new Date());
  if (!set[cursor]) cursor = addDaysStr(cursor, -1);
  let n = 0;
  while (set[cursor]) {
    n++;
    cursor = addDaysStr(cursor, -1);
  }
  return n;
}

/**
 * 最近 N 天日历，按时间升序。
 * @returns {Array<{date:string, done:boolean}>}
 */
function calendar(days, dates, today) {
  const set = {};
  (dates || []).forEach((d) => { set[d] = true; });
  const end = today || dateStrCN(new Date());
  const out = [];
  for (let i = (days || 30) - 1; i >= 0; i--) {
    const d = addDaysStr(end, -i);
    out.push({ date: d, done: !!set[d] });
  }
  return out;
}

module.exports = {
  dateStrCN: dateStrCN,
  addDaysStr: addDaysStr,
  calcStreak: calcStreak,
  calendar: calendar
};
