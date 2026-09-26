// pages/mine/mine.js —— 我的
// 依据：《需求文档》4.1 我的入口 / 4.3 打卡 / 4.5 轻量用户体系

const app = getApp();
const { call } = require('../../utils/request');

Page({
  data: {
    ageGroup: null,
    progress: [],   // 闯关进度
    badges: [],     // 徽章
    streak: 0,      // 连续打卡天数
    favorites: [],  // 收藏
  },

  onShow() {
    this.setData({ ageGroup: app.globalData.ageGroup });
    this.fetchAll();
  },

  fetchAll() {
    // TODO(S2)：
    //   call('progress', 'list', {})     见 接口契约 §3.2
    //   call('progress', 'getBadges', {})
    //   call('checkin', 'getStreak', {}) 见 接口契约 §3.3
  },

  onOpenAgePicker() {
    // TODO(S2)：复用首页的分龄选择；可随时修改（《需求文档》4.1）
    tt.navigateTo({ url: '/pages/index/index' });
  },

  onCheckin() {
    // TODO(S2)：call('checkin', 'checkin', {})
    // 连续天数由云函数按服务器日期判定，不用客户端时间（接口契约 §3.3）
    console.log('checkin');
  },
});
