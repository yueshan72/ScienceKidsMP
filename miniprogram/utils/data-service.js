/* utils/data-service.js —— 页面数据唯一入口（本地优先，可切换云端）
 *
 * V1.4（2026-10-27）：
 *   云数据库体验权限已通过，主路线恢复为**文档型数据库三个云函数**；
 *   TOS（对象存储）后端作为备选保留，切换时只改 app.js 的 paths。
 *   - 默认/当前 cloud.mode = 'auto'：本地先写，再同步云端；
 *   - 云端失败自动回落本地并标记 offline=true，不阻塞课堂演示；
 *   - 页面只依赖本文件，不直接感知数据来自本地还是云端。
 *
 * 分层：
 *   pages/*  →  utils/data-service.js（本文件，编排）
 *                 ├─ data-adapters/local-adapter.js  本地实现（默认）
 *                 └─ data-adapters/cloud-adapter.js  云端实现（保留）
 *
 * 写策略（两种模式一致）：
 *   1. 先写本地镜像，保证演示/离线时不丢数据；
 *   2. mode='auto' 时再调云端，成功用云端结果覆盖，失败标记 offline=true；
 *   3. 删除 / 撤回同意是例外：云端失败时必须抛出，本地数据不能被清掉
 *      （否则用户以为云端也删了，实际没有）。
 *
 * 读取策略：页面仍从 utils/local-state.js 读本地镜像（同步、无加载态）。
 *   云端只负责写同步；未来需要跨设备拉取时，再在启动时补一次 syncDown。
 *
 * 数据层接口定义见 docs/数据层接口.md。
 */
'use strict';

const request = require('./request.js');
const Local = require('./local-state.js');
const localAdapter = require('./data-adapters/local-adapter.js');
const cloudAdapter = require('./data-adapters/cloud-adapter.js');

/** 当前是否启用云端同步（mode='auto' 且 envID/serviceID 都已配置） */
function cloudEnabled() {
  return request.isEnabled();
}

/** 当前数据模式：'local' | 'auto'（供「我的」页或调试展示） */
function mode() {
  return cloudEnabled() ? 'auto' : 'local';
}

/* 云端同步的超时上限。云端慢/卡住时不能拖住页面反馈：
   本地已经写好，超时后按「离线」处理即可。 */
const CLOUD_SYNC_TIMEOUT_MS = 6000;

function withTimeout(promise, ms) {
  return new Promise(function (resolve, reject) {
    let settled = false;
    const timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      reject({ code: 3001, message: '云端同步超时（本地已保存）' });
    }, ms);
    promise.then(function (value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    }, function (err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** 设置 / 更正年龄：本地立即生效，云端异步同步 */
async function setAgeGroup(ageGroup) {
  const local = await localAdapter.setAgeGroup(ageGroup);
  if (!cloudEnabled()) return Object.assign({}, local, { offline: false });

  try {
    const r = await withTimeout(cloudAdapter.setAgeGroup(ageGroup), CLOUD_SYNC_TIMEOUT_MS);
    return Object.assign({}, r, { offline: false });
  } catch (e) {
    console.warn('[data-service] setAgeGroup cloud failed, local kept', e);
    return Object.assign({}, local, { offline: true });
  }
}

/**
 * 通关。本地幂等记录先行（保证演示闭环），云端判定后覆盖星星/徽章。
 * 契约 §3.2：星级与徽章由云函数判定，前端不可信。
 *
 * onLocal 可选：本地结果写好后就回调一次，页面可以立刻显示星星/徽章，
 * 不必等云端（云端慢或挂起时，反馈也不会丢）。云端返回后页面再校正。
 */
async function completeLevel(levelId, wrongCount, topicId, onLocal) {
  const local = await localAdapter.completeLevel(levelId, wrongCount, topicId);
  const localResult = Object.assign({}, local, { offline: false });

  if (typeof onLocal === 'function') onLocal(localResult);
  if (!cloudEnabled()) return localResult;

  try {
    const r = await withTimeout(
      cloudAdapter.completeLevel(levelId, wrongCount, topicId),
      CLOUD_SYNC_TIMEOUT_MS
    );
    return Object.assign({}, r, { offline: false });
  } catch (e) {
    console.warn('[data-service] completeLevel cloud failed, local kept', e);
    return Object.assign({}, localResult, { offline: true });
  }
}

/** 今日打卡。本地先行，云端成功时以云端 streak 为准 */
async function checkin() {
  const local = await localAdapter.checkin();
  if (!cloudEnabled()) return Object.assign({}, local, { offline: false });

  try {
    const r = await withTimeout(cloudAdapter.checkin(), CLOUD_SYNC_TIMEOUT_MS);
    return Object.assign({}, r, { offline: false });
  } catch (e) {
    console.warn('[data-service] checkin cloud failed, local kept', e);
    return Object.assign({}, local, { offline: true });
  }
}

/**
 * 删除我的数据：云端成功后才清本地；云端失败则抛出，页面据此提示用户。
 * mode='local' 时直接清本地。
 */
async function deleteData() {
  if (cloudEnabled()) {
    await cloudAdapter.deleteData();
  }
  return localAdapter.deleteData();
}

/**
 * 撤回监护人同意：云端删除 + 本地清空并记录撤回时间。
 * 与 deleteData 相同，云端失败时不改本地状态。
 */
async function withdrawConsent() {
  if (cloudEnabled()) {
    await cloudAdapter.withdrawConsent();
  }
  return localAdapter.withdrawConsent();
}

/** 连续打卡（本地镜像；云端的日历只在「我的」页需要时再拉，V1.0 先用本地） */
function getStreak() {
  return Local.getStreak();
}

module.exports = {
  cloudEnabled: cloudEnabled,
  mode: mode,
  setAgeGroup: setAgeGroup,
  completeLevel: completeLevel,
  checkin: checkin,
  deleteData: deleteData,
  withdrawConsent: withdrawConsent,
  getStreak: getStreak
};
