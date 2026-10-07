/* utils/mock-progress.js —— 通关进度的临时存储
 *
 * ⚠️ 临时实现。云开发环境开通后，这段整个删除，改由 progress 云函数承担
 *    （见《接口契约》§3.2）。
 *
 * 之所以先有这个模块：关卡页通关后，主题页要能显示「已通关」。
 * 两页共享一份状态，演示才算闭环 —— 否则通关回到主题页还是「去试试」，
 * 看起来像没生效。
 *
 * 只在内存里，App 重启即清空。这正是它「临时」的含义。
 */
'use strict';

var store = {};

module.exports = {
  /** 取某关的通关数据；未通关返回 null */
  get: function (levelId) {
    return store[levelId] || null;
  },

  /** 记录通关。返回本次的结算数据（幂等：已存在则原样返回） */
  complete: function (levelId, wrongCount) {
    if (store[levelId]) return store[levelId];

    /* TODO(S3)：星级规则是【假的】。真实规则在云函数 ——
       前端绝不能自己算星（《接口契约》§3.2：进度与奖励是核心数据）。 */
    var stars = wrongCount === 0 ? 3 : (wrongCount === 1 ? 2 : 1);
    store[levelId] = {
      levelId: levelId,
      status: 'done',
      stars: stars,
      newBadges: ['badge_space'],
      isFirstComplete: true
    };
    return store[levelId];
  },

  /** 某个主题下已通关的关卡数 */
  doneCountOf: function (levelIds) {
    var n = 0;
    for (var i = 0; i < levelIds.length; i++) {
      if (store[levelIds[i]]) n++;
    }
    return n;
  }
};
