// app.js —— 儿童科普小程序「小宇宙科普」
// 依据：《需求文档》4.5 轻量用户体系 / 4.1 分龄入口 / §9.1 儿童信息合规

const Local = require('./utils/local-state.js');
const request = require('./utils/request.js');

App({
  globalData: {
    openid: null,
    ageGroup: null, // '3-6' | '6-9' | '9-12'，null 表示首次进入需选择

    /* 数据层配置（V1.4：云数据库审核通过，主路线恢复为文档型数据库三函数）。
     *
     * mode:
     *   'local' —— 只读写手机本地存储，不发起网络请求（离线兜底）
     *   'auto'  —— 本地优先 + 云端同步；当前指向原三个云函数（文档型数据库）
     *
     * 主路线（当前）：/user/index、/progress/index、/checkin/index + 云数据库。
     * 备选路线：单函数 /api/index + 对象存储 TOS（代码与指南保留，未启用）。
     * paths 的实际值需在开发者工具「复制小程序端调用示例」里核对一次。 */
    cloud: {
      mode: 'auto',                  // 'local' | 'auto'
      envID: 'env-dIAlSn9Fkv',       // 抖音云控制台的环境 ID
      serviceID: '1mh9na5bu8gm2',    // 云函数服务的 serviceID（dev 环境）
      paths: {
        user: '/user/index',         // 主路线：三个独立云函数
        progress: '/progress/index',
        checkin: '/checkin/index'
      }
    }
  },

  onLaunch() {
    /* 本地模式：从本地存储恢复年龄（撤回同意后会被清空） */
    this.globalData.ageGroup = Local.getAgeGroup();

    /* 把配置交给 request.js。
       mode='local' 时 enabled=false，request 不会发起网络请求；
       mode='auto' 时由 data-service 走「本地先行 + 云端同步」。 */
    request.configure({
      enabled: this.globalData.cloud.mode === 'auto',
      envID: this.globalData.cloud.envID,
      serviceID: this.globalData.cloud.serviceID,
      paths: this.globalData.cloud.paths
    });
  }

  /* 分龄写入统一走 utils/data-service.js（本地立即生效 + 云端异步同步），
     页面不再调用 App 上的方法，避免两套写入路径。 */
});
