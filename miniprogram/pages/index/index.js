// pages/index/index.js —— 首页
// 从 prototypes/js/app.js 搬运。对应关系：
//     HTML 里的 data-tap="x"   ←→  bindtap="onX"（本文件的方法名）
//     原型里的 DOM 操作        ←→  setData + ttml 的 tt:for / tt:if
//
// 依据：《需求文档》4.1 首页（年龄段选择 / 主题入口 / 内容流）

const app = getApp();
const DEMO = require('../../utils/demo-data.js');

/* 三档年龄 → 两套主题。6-9 暂继承暖色。
   因为主题只是 token 覆盖，日后要给它单独一套，加一段样式即可，布局不动。 */
const AGE_THEME = { '3-6': 'warm', '6-9': 'warm', '9-12': 'cool' };
const AGE_LABEL = { '3-6': '3-6 岁', '6-9': '6-9 岁', '9-12': '9-12 岁' };
const AGE_OPTIONS = [
  { value: '3-6', label: '3-6 岁 · 学前' },
  { value: '6-9', label: '6-9 岁 · 低年级' },
  { value: '9-12', label: '9-12 岁 · 高年级' }
];

const STORAGE_KEY = 'sci.ageGroup';

Page({
  data: {
    theme: 'cool',        // 未选择年龄段时的默认主题（深空）
    ageGroup: null,
    ageLabel: '未选择',
    ageOptions: AGE_OPTIONS,
    showAgePicker: false,
    contentList: [],
    shopList: []
  },

  onLoad() {
    // TODO(S3)：改为 call('user', 'getProfile') 拉取用户档案，见《接口契约》§3.1
    const ageGroup = app.globalData.ageGroup || this.restoreAge();

    if (ageGroup) {
      this.applyAge(ageGroup, { persist: false });
    } else {
      // 《需求文档》4.1：首次进入必须选年龄段
      this.setData({ showAgePicker: true });
      this.refreshLists();
    }
  },

  /* ---------------- 分龄 ---------------- */

  /**
   * 设置年龄段。这是改主题的唯一入口 ——
   * 同时驱动配色、文案、内容流过滤，避免三处状态各自为政。
   */
  applyAge(ageGroup, opts) {
    const theme = AGE_THEME[ageGroup] || 'cool';

    app.globalData.ageGroup = ageGroup;
    // TODO(S3)：调用 user 云函数的 setAgeGroup 持久化，见《接口契约》§3.1
    if (!opts || opts.persist !== false) this.persistAge(ageGroup);

    this.setData({
      ageGroup: ageGroup,
      theme: theme,
      ageLabel: AGE_LABEL[ageGroup] || ageGroup,
      showAgePicker: false
    });

    this.refreshLists();
  },

  restoreAge() {
    try {
      return tt.getStorageSync(STORAGE_KEY) || null;
    } catch (e) {
      return null;
    }
  },

  persistAge(ageGroup) {
    try {
      tt.setStorageSync(STORAGE_KEY, ageGroup);
    } catch (e) {
      /* 存储不可用就算了，不影响本次会话 */
    }
  },

  /* ---------------- 列表 ---------------- */

  refreshLists() {
    const age = this.data.ageGroup;

    // TODO(S3)：改为云函数拉取。分龄过滤必须【在云函数里做，不在前端做】
    //          （见《接口契约》§5「前端待对齐项」）。此处为临时实现。
    const contentList = DEMO.contents
      .filter(function (c) { return !age || c.ageGroup === age; })
      .map(function (c) {
        return Object.assign({}, c, { durationText: fmtDuration(c.duration) });
      });

    this.setData({
      contentList: contentList,
      shopList: DEMO.shop
    });
  },

  /* ---------------- 事件（对应 ttml 里的 bindtap） ---------------- */

  onOpenAgePicker() {
    this.setData({ showAgePicker: true });
  },

  onPickAge(e) {
    const age = e.currentTarget.dataset.age;
    if (age) this.applyAge(age);
  },

  onTapTopic() {
    tt.navigateTo({ url: '/pages/topic/topic' });
  }
});

/** 秒 → 1′35″ 这样的展示文本 */
function fmtDuration(sec) {
  return Math.floor(sec / 60) + '′' + (sec % 60) + '″';
}
