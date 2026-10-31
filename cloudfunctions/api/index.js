/* cloudfunctions/api —— TOS 后端统一入口
 *
 * 一个云函数承载 user / progress / checkin 三组 action：
 *   request.js 在 body 里带上 name（user|progress|checkin）与 action，
 *   本函数按 name 路由；这样只需部署 1 个函数、配 1 条路径。
 *
 * 旧实现（cloudfunctions/user|progress|checkin + 文档型数据库）保留不动，
 * 只是 app.js 的 paths 不再指向它们。
 *
 * 抖音云函数签名：module.exports = async function (params, context)
 */
'use strict';

const { dySDK } = require('@open-dy/node-server-sdk');
const store = require('./tos-store.js');
const { dispatch } = require('./handlers.js');

module.exports = async function (params, context) {
  params = params || {};

  let openid = '';
  try {
    openid = (dySDK.context(context).getContext() || {}).openId || '';
  } catch (e) {
    console.error('[api] context error', e);
  }

  if (!openid) {
    return { code: 1001, message: '未登录', data: null };
  }

  return dispatch(openid, params, store);
};
