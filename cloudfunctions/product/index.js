// cloudfunctions/product —— 精选联盟商品
// 契约：docs/接口契约.md §3.4
//
// 注：各云函数独立部署，信封工具在四个函数里各留一份是刻意的。

const ok = (data) => ({ code: 0, message: 'ok', data });
const fail = (code, message) => ({ code, message, data: null });

exports.main = async (event = {}) => {
  const { action, ...payload } = event;

  switch (action) {
    case 'listByContent':
      return onListByContent(payload);

    case 'listByLevel':
      return onListByLevel(payload);

    default:
      return fail(1002, `未知 action: ${action}`);
  }
};

/**
 * 按内容取商品位（视频下方，每处 1-2 个）
 * 入参 { contentId }
 * 出参 { list:[{productId,name,cover,price,jumpUrl,hasAdMark}] }
 *
 * ⚠️ 合规（《需求文档》9.1）：
 *    - 带货内容必须**显著标识**，不得诱导性、夸大性消费引导
 *    - 故返回值带 hasAdMark，前端须据此渲染"推广"标记
 */
async function onListByContent({ contentId }) {
  if (!contentId) return fail(1002, 'contentId 必填');
  // TODO(S3)：接精选联盟商品接口；不自建商品体系（《开发计划书》第 1 节）
  return ok({ list: [] });
}

/**
 * 按关卡取商品位
 * 入参 { levelId }
 * 出参同 listByContent
 */
async function onListByLevel({ levelId }) {
  if (!levelId) return fail(1002, 'levelId 必填');
  return ok({ list: [] });
}
