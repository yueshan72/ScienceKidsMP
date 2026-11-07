/* utils/starfield.js —— 确定性星野生成器
 *
 * 用途：关卡常态舞台、首页「太空 / 宇宙」主题卡。
 * 位置 / 大小 / 闪烁节奏由固定算法生成，同一个 count 每次结果一致；
 * 不使用 Math.random，避免每次进入观感变化。
 */
'use strict';

function rand(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

/**
 * 生成星点数组，直接给 tt:for 用。
 * @param {number} count 星点数量
 * @param {Object} [opts] { sizeScale: 1.5 } 可放大星点（页面背景比舞台需要更明显）
 * @returns {Array<{key:string, style:string}>}
 */
function build(count, opts) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const sizeScale = (opts && Number(opts.sizeScale)) || 1;
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = 2 + rand(i * 7 + 1) * 96;
    const y = 2 + rand(i * 11 + 2) * 96;
    const baseSize = 2 + Math.round(rand(i * 13 + 3) * 4);
    const size = Math.max(1, Math.round(baseSize * sizeScale));
    const delay = Math.round(rand(i * 17 + 4) * 2600);
    const dur = Math.round(1600 + rand(i * 19 + 5) * 2200);
    out.push({
      key: 'star-' + i,
      style: 'left:' + (Math.round(x * 100) / 100) + '%;'
        + 'top:' + (Math.round(y * 100) / 100) + '%;'
        + 'width:' + size + 'rpx;height:' + size + 'rpx;'
        + 'animation-delay:-' + delay + 'ms;animation-duration:' + dur + 'ms;'
    });
  }
  return out;
}

module.exports = {
  build: build
};
