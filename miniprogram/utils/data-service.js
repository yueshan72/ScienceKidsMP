/* utils/data-service.js —— 页面数据入口（云优先，本地兜底）
 *
 * 设计目的：
 *   1. 云环境未配置时（app.js cloud.enabled=false），页面照常跑本地演示；
 *   2. 云环境就绪后，只改 app.js 的配置，页面代码不再改动；
 *   3. 写操作先落本地镜像，云端失败时不丢演示数据；读操作仍以本地镜像展示，
 *      避免为演示引入异步加载态。
 *
 * 内容（视频 / 关卡）在 V1.0 是客户端静态数据：契约没有 content 云函数，
 * 且内容量固定为 3-4 条视频 + 2 个关卡。用户状态（进度/打卡/年龄）走云。
 */
'use strict';

const request = require('./request.js');
const Local = require('./local-state.js');
const mockProgress = require('./mock-progress.js');

function cloudEnabled() {
  return request.isEnabled();
}

/** 设置 / 更正年龄：本地立即生效，云端异步同步 */
async function setAgeGroup(ageGroup) {
  Local.setAgeGroup(ageGroup);
  if (!cloudEnabled()) return { ageGroup, offline: false };

  try {
    const r = await request.call('user', 'setAgeGroup', { ageGroup });
    return Object.assign({}, r, { offline: false });
  } catch (e) {
    console.warn('[data-service] setAgeGroup cloud failed, local kept', e);
    return { ageGroup, offline: true };
  }
}

/**
 * 通关。本地幂等记录先行（保证演示闭环），云端判定后覆盖星星/徽章。
 * 契约 §3.2：星级与徽章由云函数判定，前端不可信。
 */
async function completeLevel(levelId, wrongCount, topicId) {
  const local = mockProgress.complete(levelId, wrongCount);
  if (!cloudEnabled()) return Object.assign({}, local, { offline: false });

  try {
    const r = await request.call('progress', 'complete', {
      levelId,
      topicId: topicId || 'space',
      wrongCount: wrongCount || 0
    });
    return Object.assign({}, r, { offline: false });
  } catch (e) {
    console.warn('[data-service] completeLevel cloud failed, local kept', e);
    return Object.assign({}, local, { offline: true });
  }
}

/** 今日打卡。本地先行，云端成功时以云端 streak 为准 */
async function checkin() {
  const local = Local.checkinToday();
  if (!cloudEnabled()) return Object.assign({}, local, { offline: false });

  try {
    const r = await request.call('checkin', 'checkin', {});
    return Object.assign({}, r, { offline: false });
  } catch (e) {
    console.warn('[data-service] checkin cloud failed, local kept', e);
    return Object.assign({}, local, { offline: true });
  }
}

/** 删除我的数据：云端成功后才清本地；云端失败则抛出，页面据此提示用户 */
async function deleteData() {
  if (cloudEnabled()) {
    await request.call('user', 'deleteData', {});
  }
  Local.deleteAllData();
  return { deleted: true };
}

/** 撤回监护人同意：云端删除 + 本地清空并记录撤回时间 */
async function withdrawConsent() {
  if (cloudEnabled()) {
    await request.call('user', 'withdrawConsent', {});
  }
  Local.withdrawConsent();
  return { withdrawn: true };
}

/** 连续打卡（本地镜像；云端的日历只在「我的」页需要时再拉，V1.0 先用本地） */
function getStreak() {
  return Local.getStreak();
}

module.exports = {
  cloudEnabled: cloudEnabled,
  setAgeGroup: setAgeGroup,
  completeLevel: completeLevel,
  checkin: checkin,
  deleteData: deleteData,
  withdrawConsent: withdrawConsent,
  getStreak: getStreak
};
