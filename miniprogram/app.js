// app.js —— 儿童科普小程序「小宇宙科普」
// 依据：《需求文档》4.5 轻量用户体系 / 4.1 分龄入口

App({
  globalData: {
    openid: null,
    ageGroup: null, // '3-6' | '6-9' | '9-12'，null 表示首次进入需选择
    cloudEnv: '',   // TODO(S0)：云开发环境开通后填入环境 ID
  },

  onLaunch() {
    // TODO(S2)：初始化云开发环境
    // TODO(S2)：抖音授权登录换取 openid，见 docs/接口契约.md §3.1
    // 注意：首次登录 ageGroup 为 null，需按《需求文档》4.1 弹年龄段选择
  },

  /**
   * 分龄入口：首次进入选择年龄段（《需求文档》4.1，可随时修改）
   */
  setAgeGroup(ageGroup) {
    this.globalData.ageGroup = ageGroup;
    // TODO(S2)：调用 user 云函数 setAgeGroup 持久化，见 接口契约 §3.1
  },
});
