// utils/request.js —— 云函数统一调用入口
// 契约依据：docs/接口契约.md §2（通用约定）与 §3（云函数清单）
//
// 职责：透传 {code, message, data} 信封、统一错误码处理、统一调用路径。
// 页面里不要裸调云函数，一律走这里，否则错误处理会散落各处。
//
// 抖音云调用方式（2026-10 官方文档已确认）：
//   1. 入口：tt.createCloud({ envID, serviceID })      基础库 ≥ 2.70.0.0
//   2. 云函数：cloud.callContainer({ path, init })      （不是 callFunction）
//   3. 云函数导出：module.exports = async function (params, context)
//   4. 用户身份：dySDK.context(context).getContext().openId
//   5. 云数据库：dySDK.database().collection(name)
//
// 仍需在开发者工具里核对的两项（每个环境不同）：
//   - serviceID：云函数服务控制台提供
//   - path：右键云函数 →「复制小程序端调用示例」里的路径
//   核对后填到 app.js 的 globalData.cloud 即可，本文件无需再改。

'use strict';

const DEFAULT_PATHS = {
  user: '/user/index',
  progress: '/progress/index',
  checkin: '/checkin/index'
};

const ERROR_MESSAGE = {
  1001: '登录已失效，请重新进入',
  1002: '参数有误',
  1003: '没有权限',
  1004: '请先选择年龄段',
  2001: '内容已下架',
  2002: '内容不在当前年龄段范围',
  3001: '网络异常，请重试',
  3002: '资源暂时不可用',
  4001: '请检查手机时间',
  4002: '商品信息暂时不可用',
  4003: '商品已下架',
  5000: '出了点问题，请稍后再试'
};

let cloudInstance = null;
let config = {
  enabled: false,
  envID: '',
  serviceID: '',
  paths: Object.assign({}, DEFAULT_PATHS)
};

/**
 * 注入云配置（由 app.js 的 onLaunch 调用）
 * @param {object} opts { enabled, envID, serviceID, paths? }
 */
function configure(opts) {
  if (!opts) return;
  config = {
    enabled: !!opts.enabled,
    envID: opts.envID || '',
    serviceID: opts.serviceID || '',
    paths: Object.assign({}, DEFAULT_PATHS, opts.paths || {})
  };
  cloudInstance = null; // 配置变了，下次重新创建
}

function isEnabled() {
  return !!(config.enabled && config.envID && config.serviceID);
}

function getCloud() {
  if (!cloudInstance) {
    if (typeof tt === 'undefined' || typeof tt.createCloud !== 'function') {
      throw new Error('当前基础库不支持抖音云（需 ≥ 2.70.0.0）');
    }
    cloudInstance = tt.createCloud({
      envID: config.envID,
      serviceID: config.serviceID
    });
  }
  return cloudInstance;
}

/**
 * 调用云函数
 * @param {string} name    云函数名：user | progress | checkin
 * @param {string} action  动作名，见 接口契约 §3
 * @param {object} payload 业务入参
 * @returns {Promise<object>} 成功时 resolve 出 data，失败时 reject 出 {code, message}
 */
function call(name, action, payload) {
  payload = payload || {};

  return new Promise((resolve, reject) => {
    if (!isEnabled()) {
      reject({ code: 5000, message: '云环境未配置（见 app.js globalData.cloud）' });
      return;
    }

    const path = config.paths[name];
    if (!path) {
      reject({ code: 1002, message: '未知云函数：' + name });
      return;
    }

    let cloud;
    try {
      cloud = getCloud();
    } catch (e) {
      reject({ code: 5000, message: e.message || ERROR_MESSAGE[5000] });
      return;
    }

    if (typeof cloud.callContainer !== 'function') {
      reject({ code: 5000, message: '当前 SDK 不支持 callContainer' });
      return;
    }

    cloud.callContainer({
      path: path,
      init: {
        method: 'POST',
        header: { 'content-type': 'application/json' },
        body: Object.assign({}, payload, { action: action }),
        timeout: 60000 // ms
      },
      success: (res) => {
        if (res && typeof res.statusCode === 'number'
            && (res.statusCode < 200 || res.statusCode >= 300)) {
          reject({ code: 3001, message: '服务返回 HTTP ' + res.statusCode });
          return;
        }

        let body = res && res.data;
        if (typeof body === 'string') {
          try {
            body = JSON.parse(body);
          } catch (e) {
            reject({ code: 5000, message: '返回内容不是合法 JSON' });
            return;
          }
        }

        if (!body || typeof body.code === 'undefined') {
          reject({ code: 5000, message: '返回结构不符合契约 §2.2' });
          return;
        }

        if (body.code === 0) {
          resolve(body.data);
        } else {
          reject({
            code: body.code,
            message: body.message || ERROR_MESSAGE[body.code] || '请求失败'
          });
        }
      },
      fail: (err) => {
        reject({
          code: 3001,
          message: (err && (err.errMsg || err.message)) || ERROR_MESSAGE[3001]
        });
      }
    });
  });
}

module.exports = {
  call: call,
  configure: configure,
  isEnabled: isEnabled,
  ERROR_MESSAGE: ERROR_MESSAGE
};
