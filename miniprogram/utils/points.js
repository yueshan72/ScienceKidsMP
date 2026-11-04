/* utils/points.js —— 展示型积分（V1.0）
 *
 * 范围：只做展示，不单独持久化，不涉及兑换 / 扣减。
 * 规则：每通过一个关卡 +10 分；通关记录本身幂等，所以重复通关不会重复计分。
 * 积分由进度对象（local-state.getProgress 的形状）实时推导，不新增存储键，
 * 「删除我的数据」清空进度后积分自然归零。
 */
'use strict';

const POINTS_PER_LEVEL = 10;

/**
 * 从进度对象推导总积分。
 * @param {Object} progress 形如 { levelId: { status: 'done', ... } }
 * @returns {number}
 */
function totalFromProgress(progress) {
  if (!progress || typeof progress !== 'object' || Array.isArray(progress)) return 0;
  let done = 0;
  Object.keys(progress).forEach(function (levelId) {
    const item = progress[levelId];
    if (item && item.status === 'done') done++;
  });
  return done * POINTS_PER_LEVEL;
}

module.exports = {
  POINTS_PER_LEVEL: POINTS_PER_LEVEL,
  totalFromProgress: totalFromProgress
};
