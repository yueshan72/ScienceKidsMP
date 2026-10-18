// pages/index/index.js —— 首页
// 从 prototypes/js/app.js 搬运。对应关系：
//     HTML 里的 data-tap="x"   ←→  bindtap="onX"（本文件的方法名）
//     原型里的 DOM 操作        ←→  setData + ttml 的 tt:for / tt:if
//
// 依据：《需求文档》4.1 首页（年龄段选择 / 主题入口 / 内容流）
// 合规：《需求文档》§9.1 —— 首次使用须由监护人同意后才处理儿童信息

const app = getApp();
const DEMO = require('../../utils/demo-data.js');
const Local = require('../../utils/local-state.js');
const dataService = require('../../utils/data-service.js');
const Age = require('../../utils/age.js');
const Format = require('../../utils/format.js');

Page({
  data: {
    theme: 'cool',
    ageGroup: null,
    ageLabel: '未选择',
    ageOptions: Age.AGE_OPTIONS,
    showAgePicker: false,
    showConsent: false,
    consentGranted: false,
    consentDenied: false,
    contentList: [],
    shopList: []
  },

  onLoad() {
    const consentGranted = Local.getConsent().granted;
    this.setData({ consentGranted: consentGranted, showConsent: !consentGranted });

    if (!consentGranted) return;

    const ageGroup = app.globalData.ageGroup || Local.getAgeGroup();
    if (ageGroup) {
      this.applyAge(ageGroup, { persist: false });
    } else {
      // 《需求文档》4.1：首次进入必须选年龄段
      this.setData({ showAgePicker: true });
      this.refreshLists();
    }
  },

  /* 从「我的」页返回时同步：年龄可能被更正，也可能撤回同意后清空了数据 */
  onShow() {
    const consent = Local.getConsent();
    if (!consent.granted) {
      this.setData({
        consentGranted: false,
        consentDenied: false,
        showConsent: true,
        showAgePicker: false,
        contentList: [],
        shopList: []
      });
      return;
    }

    if (!this.data.consentGranted) {
      this.setData({ consentGranted: true, showConsent: false });
    }

    const age = app.globalData.ageGroup || Local.getAgeGroup();
    if (age && age !== this.data.ageGroup) {
      this.applyAge(age, { persist: false });
    } else {
      this.refreshLists();
    }
  },

  /* ---------------- 监护人同意（§9.1） ---------------- */

  onAgreeConsent() {
    Local.grantConsent();
    const age = app.globalData.ageGroup || Local.getAgeGroup();
    this.setData({
      consentGranted: true,
      consentDenied: false,
      showConsent: false,
      showAgePicker: !age
    });
    if (age) this.applyAge(age, { persist: false });
    else this.refreshLists();
  },

  onDeclineConsent() {
    this.setData({
      showConsent: false,
      consentDenied: true,
      showAgePicker: false,
      contentList: [],
      shopList: []
    });
  },

  onReconsiderConsent() {
    this.setData({ showConsent: true, consentDenied: false });
  },

  /* ---------------- 分龄 ---------------- */

  /**
   * 设置年龄段。这是改主题的唯一入口 ——
   * 同时驱动配色、文案、内容流过滤，避免三处状态各自为政。
   */
  applyAge(ageGroup, opts) {
    app.globalData.ageGroup = ageGroup;
    if (!opts || opts.persist !== false) dataService.setAgeGroup(ageGroup);

    this.setData({
      ageGroup: ageGroup,
      theme: Age.themeOf(ageGroup),
      ageLabel: Age.labelOf(ageGroup),
      showAgePicker: false
    });

    this.refreshLists();
  },

  /* ---------------- 列表 ---------------- */

  refreshLists() {
    if (!Local.getConsent().granted) {
      this.setData({ contentList: [], shopList: [] });
      return;
    }

    const age = this.data.ageGroup;

    /* V1.0 范围决策：视频内容为客户端静态数据，不设 content 云函数
       （见《接口契约》§8.3）。接入内容管理端后再把分龄过滤移入服务端。 */
    const contentList = DEMO.contents
      .filter(function (c) { return !age || c.ageGroup === age; })
      .map(function (c) {
        return Object.assign({}, c, {
          durationText: Format.fmtDuration(c.duration),
          fav: Local.isFavorite(c._id)
        });
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
  },

  onTapVideo(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    tt.navigateTo({ url: '/pages/video/video?id=' + id });
  },

  onToggleFav(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const added = Local.toggleFavorite(id);
    tt.showToast({ title: added ? '已收藏' : '已取消收藏', icon: 'none' });
    this.refreshLists();
  }
});
