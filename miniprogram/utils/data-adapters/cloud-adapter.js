/* utils/data-adapters/cloud-adapter.js —— 云端数据适配器
 *
 * 数据层接口的实现之一，与 local-adapter.js 方法一一对应。
 * 只在 app.js 的 cloud.mode = 'auto' 时由 data-service 调用。
 *
 * 依赖：utils/request.js（透传契约 §2.2 信封与错误码）。
 * 云端返回的字段以《接口契约》§3 为准；本文件不加工业务数据。
 *
 * 当前主路线（2026-10-27 云数据库审核通过）：
 *   user / progress / checkin 三个独立云函数 + 文档型数据库。
 * 备选路线：
 *   单函数 /api/index + 对象存储 TOS（代码与指南保留，改 paths 即可切换）。
 */
'use strict';

const request = require('../request.js');

function setAgeGroup(ageGroup) {
  return request.call('user', 'setAgeGroup', { ageGroup: ageGroup });
}

function completeLevel(levelId, wrongCount, topicId) {
  return request.call('progress', 'complete', {
    levelId: levelId,
    topicId: topicId || 'space',
    wrongCount: wrongCount || 0
  });
}

function checkin() {
  return request.call('checkin', 'checkin', {});
}

function deleteData() {
  return request.call('user', 'deleteData', {});
}

function withdrawConsent() {
  return request.call('user', 'withdrawConsent', {});
}

module.exports = {
  setAgeGroup: setAgeGroup,
  completeLevel: completeLevel,
  checkin: checkin,
  deleteData: deleteData,
  withdrawConsent: withdrawConsent
};
