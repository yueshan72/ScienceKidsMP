/* utils/format.js —— 展示层小工具（单一来源） */
'use strict';

/** 秒 → 1′35″ */
function fmtDuration(sec) {
  sec = Number(sec) || 0;
  return Math.floor(sec / 60) + '′' + (sec % 60) + '″';
}

/** 0~3 颗星 → ★★☆ */
function starsText(n) {
  n = Number(n) || 0;
  if (n < 0) n = 0;
  if (n > 3) n = 3;
  return '★★★'.slice(0, n) + '☆☆☆'.slice(0, 3 - n);
}

module.exports = {
  fmtDuration: fmtDuration,
  starsText: starsText
};
