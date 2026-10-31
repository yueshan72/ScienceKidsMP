/* utils/data-adapters/local-adapter.js —— 本地数据适配器（V1.2 默认）
 *
 * 数据层接口的实现之一，与 cloud-adapter.js 保持相同的方法与返回形状：
 *   setAgeGroup / completeLevel / checkin / deleteData / withdrawConsent
 *
 * 约定：
 *   1. 所有方法返回 Promise（本地操作同步完成，用 Promise.resolve 包装），
 *      这样 data-service 不需要区分本地/云端两套写法；
 *   2. 本适配器只读写手机本地存储（utils/local-state.js），不发起网络请求；
 *   3. 返回的数据形状与《接口契约》§3 一致，页面无需感知数据来自哪里。
 */
'use strict';

const Local = require('../local-state.js');
const mockProgress = require('../mock-progress.js');

function setAgeGroup(ageGroup) {
  Local.setAgeGroup(ageGroup);
  return Promise.resolve({ ageGroup: ageGroup });
}

function completeLevel(levelId, wrongCount, topicId) {
  const r = mockProgress.complete(levelId, wrongCount, topicId);
  return Promise.resolve(Object.assign({}, r));
}

function checkin() {
  return Promise.resolve(Local.checkinToday());
}

function deleteData() {
  Local.deleteAllData();
  return Promise.resolve({ deleted: true });
}

function withdrawConsent() {
  Local.withdrawConsent();
  return Promise.resolve({ withdrawn: true });
}

module.exports = {
  setAgeGroup: setAgeGroup,
  completeLevel: completeLevel,
  checkin: checkin,
  deleteData: deleteData,
  withdrawConsent: withdrawConsent
};
