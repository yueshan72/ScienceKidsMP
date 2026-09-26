// pages/index/index.js —— 首页
// 依据：《需求文档》4.1 首页（年龄段选择 / 主题入口 / 内容流 / 我的入口）

const app = getApp();
const { call } = require('../../utils/request');

Page({
  data: {
    ageGroup: null,        // 首次进入为 null，需弹选择
    showAgePicker: false,  // 分龄选择弹窗
    ageOptions: ['3-6', '6-9', '9-12'],
    topic: null,           // 太空主题入口
    contentList: [],       // 按年龄段推荐的内容流
    loading: true,
  },

  onLoad() {
    const ageGroup = app.globalData.ageGroup;
    this.setData({
      ageGroup,
      showAgePicker: !ageGroup, // 首次进入弹年龄选择（《需求文档》4.1）
    });
    if (ageGroup) this.fetchContent();
  },

  /**
   * 分龄入口：选择年龄段，可随时修改（《需求文档》4.1）
   */
  onPickAge(e) {
    const ageGroup = e.currentTarget.dataset.age;
    app.setAgeGroup(ageGroup);
    this.setData({ ageGroup, showAgePicker: false });
    this.fetchContent();
  },

  onOpenAgePicker() {
    this.setData({ showAgePicker: true });
  },

  onCloseAgePicker() {
    // 已有年龄段时才能关闭；首次进入必须选（否则首页无法按年龄分层）
    if (this.data.ageGroup) this.setData({ showAgePicker: false });
  },

  fetchContent() {
    // TODO(S2)：内容流由云函数按 ageGroup 过滤后返回，前端不做过滤（接口契约 §5）
    this.setData({ loading: false });
  },

  onTapTopic() {
    tt.navigateTo({ url: '/pages/topic/topic' });
  },
});
