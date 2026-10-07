// utils/request.js —— 云函数统一调用入口
// 契约依据：docs/接口契约.md §2（通用约定）与 §3（云函数清单）
//
// 职责：透传 {code, message, data} 信封、统一错误码处理、统一带上 openid。
// 页面里不要裸调云函数，一律走这里，否则错误处理会散落各处。

const ERROR_MESSAGE = {
  1001: '登录已失效，请重新进入',
  1002: '参数有误',
  1003: '没有权限',
  2001: '内容已下架',
  3001: '网络异常，请重试',
  5000: '出了点问题，请稍后再试',
};

/**
 * 调用云函数
 * @param {string} name    云函数名：user | progress | checkin | product
 * @param {string} action  动作名，见 接口契约 §3
 * @param {object} payload 业务入参
 * @returns {Promise<object>} 成功时 resolve 出 data，失败时 reject 出 {code, message}
 */
function call(name, action, payload = {}) {
  // 🔴 严重：下面的实现是【微信写法】，抖音云不适用，当前代码不可用！
  //
  //   抖音云的入口是 tt.createCloud({ envID, serviceID })，
  //   根本不存在 tt.cloud 这个对象（微信才有 wx.cloud）。
  //
  //   已确认：tt.createCloud({envID, serviceID})  /  await cloud.database()
  //   未确认：云函数（callFunction 类能力）的确切调用方法 —— 官方文档当前网络不可访问。
  //
  //   关闭办法：抖音开发者工具 →「抖音云」面板 → 部署任一云函数
  //             → 右键「复制小程序端调用示例」→ 替换本函数实现。
  //   详见 docs/接口契约.md §2.1。
  //
  // 契约 §2.1 已声明：入参 / 出参结构不受调用方式影响，故业务逻辑可先按契约推进。
  return new Promise((resolve, reject) => {
    if (typeof tt === 'undefined' || !tt.cloud || !tt.cloud.callFunction) {
      reject({ code: 5000, message: '云开发未初始化（见 app.js TODO）' });
      return;
    }

    tt.cloud
      .callFunction({ name, data: { action, ...payload } })
      .then((res) => {
        const body = res && res.result;
        if (!body || typeof body.code === 'undefined') {
          reject({ code: 5000, message: '返回结构不符合契约 §2.2' });
          return;
        }
        if (body.code === 0) {
          resolve(body.data);
        } else {
          reject({
            code: body.code,
            message: body.message || ERROR_MESSAGE[body.code] || '请求失败',
          });
        }
      })
      .catch(() => reject({ code: 3001, message: ERROR_MESSAGE[3001] }));
  });
}

module.exports = { call, ERROR_MESSAGE };
