// cloudfunctions/user —— 登录与用户信息
// 契约：docs/接口契约.md §3.1
//
// 注：各云函数独立部署，信封工具在四个函数里各留一份是刻意的，
//     不做跨函数共享，避免部署时互相牵连。

const ok = (data) => ({ code: 0, message: 'ok', data });
const fail = (code, message) => ({ code, message, data: null });

exports.main = async (event = {}) => {
  const { action, ...payload } = event;

  // TODO(S1)：确认抖音云开发云函数的入参签名与上下文取用方式（对照官方文档）
  const openid = event.openid || (event.userInfo && event.userInfo.openid) || null;

  switch (action) {
    case 'login':
      return onLogin(openid, payload);

    case 'setAgeGroup':
      return onSetAgeGroup(openid, payload);

    case 'getProfile':
      return onGetProfile(openid);

    default:
      return fail(1002, `未知 action: ${action}`);
  }
};

/**
 * 登录：用抖音登录凭证换 openid，首次登录 ageGroup 为 null
 * 出参 { openid, ageGroup, isNew }
 */
async function onLogin(openid, { code }) {
  if (!openid) return fail(1001, '未登录');
  // TODO(S3)：调抖音开放平台接口换取 openid；users 集合 upsert
  //   ageGroup 首次为 null —— 前端按《需求文档》4.1 弹年龄段选择
  return ok({ openid, ageGroup: null, isNew: true });
}

/**
 * 设置年龄段（《需求文档》4.1，可随时修改）
 * 出参 { ageGroup }
 */
async function onSetAgeGroup(openid, { ageGroup }) {
  const allowed = ['3-6', '6-9', '9-12'];
  if (!allowed.includes(ageGroup)) return fail(1002, '年龄段不合法');
  // TODO(S3)：users 集合更新
  return ok({ ageGroup });
}

/**
 * 取用户档案
 * 出参 { openid, ageGroup, badges[], stats }
 * ⚠️ 合规（《需求文档》9.1）：不采集未成年人敏感信息、精确位置、联系方式
 */
async function onGetProfile(openid) {
  if (!openid) return fail(1001, '未登录');
  // TODO(S3)：users + badges 聚合
  return ok({ openid, ageGroup: null, badges: [], stats: {} });
}
