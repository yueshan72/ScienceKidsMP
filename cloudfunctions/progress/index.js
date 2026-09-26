// cloudfunctions/progress —— 闯关进度
// 契约：docs/接口契约.md §3.2
//
// 注：各云函数独立部署，信封工具在四个函数里各留一份是刻意的。

const ok = (data) => ({ code: 0, message: 'ok', data });
const fail = (code, message) => ({ code, message, data: null });

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

exports.main = async (event = {}) => {
  const { action, ...payload } = event;
  const openid = event.openid || (event.userInfo && event.userInfo.openid) || null;

  switch (action) {
    case 'list':
      return onList(openid, payload);

    case 'complete':
      return onComplete(openid, payload);

    case 'getBadges':
      return onGetBadges(openid);

    default:
      return fail(1002, `未知 action: ${action}`);
  }
};

/**
 * 闯关进度列表
 * 入参 { topicId, page?, pageSize? }
 * 出参 { list:[{levelId,status,completedAt}], total, hasMore }
 */
async function onList(openid, { topicId, page = 1, pageSize = DEFAULT_PAGE_SIZE }) {
  if (!openid) return fail(1001, '未登录');
  if (!topicId) return fail(1002, 'topicId 必填');
  if (!Number.isInteger(page) || page < 1) return fail(1002, 'page 不合法');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    return fail(1002, `pageSize 需为 1~${MAX_PAGE_SIZE}`);
  }
  // TODO(S3)：progress 集合按 openid 查询，分页见 接口契约 §2.4
  return ok({ list: [], total: 0, hasMore: false });
}

/**
 * 关卡完成 —— 发星 / 发徽章
 * 入参 { levelId }
 * 出参 { levelId, status, stars, newBadges[] }
 *
 * ⚠️ 必须幂等：同一 levelId 重复调用不得重复发星、重复发徽章。
 *    依赖 progress 集合 (openid, levelId) 联合唯一索引 —— 见 接口契约 §4。
 *    （前端不可信，奖励判定只能在这里做。）
 */
async function onComplete(openid, { levelId }) {
  if (!openid) return fail(1001, '未登录');
  if (!levelId) return fail(1002, 'levelId 必填');

  // TODO(S3)：
  //   1. 查 progress 里是否已有 (openid, levelId) 且 status=done → 幂等直接返回
  //   2. 否则写入 done，加星
  //   3. 判定该主题下是否全部通关 → 下发太空徽章（《需求文档》4.3）
  return ok({ levelId, status: 'todo', stars: 0, newBadges: [] });
}

/**
 * 徽章列表
 * 出参 { list:[{badgeId,name,earnedAt}] }
 */
async function onGetBadges(openid) {
  if (!openid) return fail(1001, '未登录');
  return ok({ list: [] });
}
