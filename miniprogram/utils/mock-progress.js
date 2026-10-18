/* utils/mock-progress.js —— 通关进度的演示实现
 *
 * ⚠️ 云环境就绪后由 progress 云函数接管（见《接口契约》§3.2）。
 *    本模块只做两件事：把 utils/local-state.js 适配成旧接口，
 *    并在演示模式下补齐「全部通关发徽章」的判定。
 *
 * 数据已改为持久化存储（tt.setStorageSync），App 重启后进度仍在。
 * 这样「我的」页、主题页、关卡页共享同一份状态，演示才闭环。
 */
'use strict';

const Local = require('./local-state.js');
const DEMO = require('./demo-data.js');

function levelIdsOfTopic(topicId) {
  return Object.keys(DEMO.levels)
    .filter(function (id) { return DEMO.levels[id].topicId === topicId; })
    .sort(function (a, b) { return DEMO.levels[a].order - DEMO.levels[b].order; });
}

module.exports = {
  /** 取某关的通关数据；未通关返回 null */
  get: function (levelId) {
    return Local.getLevelProgress(levelId);
  },

  /** 记录通关（幂等，重复调用返回 isFirstComplete=false） */
  complete: function (levelId, wrongCount) {
    const lv = DEMO.levels[levelId];
    const topicId = lv ? lv.topicId : 'space';
    return Local.completeLevel(levelId, wrongCount, levelIdsOfTopic(topicId), topicId);
  },

  /** 某个主题下已通关的关卡数 */
  doneCountOf: function (levelIds) {
    return Local.doneCountOf(levelIds);
  },

  /** 关卡进度列表（契约 §3.2 list 的形状） */
  list: function (levelIds) {
    const all = Local.getProgress();
    return (levelIds || []).map(function (id) {
      const p = all[id];
      return {
        levelId: id,
        status: p ? p.status : 'todo',
        stars: p ? p.stars : 0,
        completedAt: p ? p.completedAt : null
      };
    });
  },

  badges: function () {
    return Local.getBadges();
  },

  levelIdsOfTopic: levelIdsOfTopic
};
