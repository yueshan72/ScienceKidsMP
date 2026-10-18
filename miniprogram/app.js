// app.js —— 儿童科普小程序「小宇宙科普」
// 依据：《需求文档》4.5 轻量用户体系 / 4.1 分龄入口 / §9.1 儿童信息合规

const Local = require('./utils/local-state.js');
const request = require('./utils/request.js');

App({
  globalData: {
    openid: null,
    ageGroup: null, // '3-6' | '6-9' | '9-12'，null 表示首次进入需选择

    /* 抖音云配置。
     * 云环境开通后，把下面三项填上并把 enabled 改为 true，页面即自动切到云函数。
     * 具体步骤见 docs/云开发接入指南.md。
     * paths 的默认值需在开发者工具「复制小程序端调用示例」里核对一次。 */
    cloud: {
      enabled: false,                // ⏳ 文档型数据库审批中；集合建好后改为 true
      envID: 'env-dlAISn9Fkv',       // 抖音云控制台的环境 ID
      serviceID: '1mh9na5bu8gm2',    // 云函数服务的 serviceID（dev 环境）
      paths: {
        user: '/user/index',         // 已由「如何调用」确认
        progress: '/progress/index',
        checkin: '/checkin/index'
      }
    }
  },

  onLaunch() {
    /* 本地模式：从本地存储恢复年龄（撤回同意后会被清空） */
    this.globalData.ageGroup = Local.getAgeGroup();

    /* 把云配置交给 request.js；enabled=false 时 request 会明确报「未配置」，
       页面据此走本地数据，不会静默失败。 */
    request.configure(this.globalData.cloud);
  }

  /* 分龄写入统一走 utils/data-service.js（本地立即生效 + 云端异步同步），
     页面不再调用 App 上的方法，避免两套写入路径。 */
});
