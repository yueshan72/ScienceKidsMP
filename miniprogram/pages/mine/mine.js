// pages/mine/mine.js —— 我的
// 依据：《需求文档》4.1 我的入口 / 4.3 打卡 / 4.5 轻量用户体系 / §9.1 儿童信息合规
//
// 数据来源：utils/local-state.js（演示模式，持久化）。
// 云环境就绪后，读操作改走 utils/data-service.js 的云分支；页面结构不变。

const app = getApp();
const Local = require('../../utils/local-state.js');
const DEMO = require('../../utils/demo-data.js');
const progress = require('../../utils/mock-progress.js');
const dataService = require('../../utils/data-service.js');
const Age = require('../../utils/age.js');
const Format = require('../../utils/format.js');
const DateUtil = require('../../utils/date.js');

Page({
  data: {
    theme: 'cool',
    ageGroup: null,
    ageLabel: '未选择',
    ageOptions: Age.AGE_OPTIONS,
    showAgePicker: false,

    stats: { doneLevels: 0, totalLevels: 0, streak: 0, checkinDays: 0 },
    levelList: [],
    badges: [],
    streak: 0,
    calendar: [],
    favorites: [],
    consent: { granted: false, grantedAt: null, withdrawnAt: null }
  },

  /* 从关卡页返回、或首页改了年龄，都要刷新 */
  onShow() {
    this.refresh();
  },

  refresh() {
    const age = Local.getAgeGroup();
    app.globalData.ageGroup = age;

    /* 关卡进度：以 demo-data 的关卡清单为准，合并本地进度 */
    const levels = Object.keys(DEMO.levels)
      .map(function (id) { return DEMO.levels[id]; })
      .filter(function (lv) { return lv.topicId === 'space'; })
      .sort(function (a, b) { return a.order - b.order; });

    const levelIds = levels.map(function (lv) { return lv._id; });
    const plist = progress.list(levelIds);
    const levelList = levels.map(function (lv, i) {
      const p = plist[i];
      return {
        _id: lv._id,
        name: lv.name,
        order: lv.order,
        sciencePoint: lv.sciencePoint,
        done: p.status === 'done',
        starsText: Format.starsText(p.stars)
      };
    });

    const streakData = Local.getStreak();
    const checkins = Local.getCheckins();
    const consent = Local.getConsent();

    /* 最近 14 天打卡日历 */
    const today = DateUtil.dateStrCN();
    const calendar = streakData.calendar.slice(-14).map(function (d) {
      return {
        date: d.date,
        done: d.done,
        today: d.date === today,
        day: Number(d.date.slice(8, 10))
      };
    });

    /* 收藏：只展示仍然存在的内容 */
    const favorites = Local.getFavorites()
      .map(function (id) {
        return DEMO.contents.filter(function (c) { return c._id === id; })[0];
      })
      .filter(Boolean)
      .map(function (c) { return { _id: c._id, title: c.title }; });

    this.setData({
      theme: Age.themeOf(age),
      ageGroup: age,
      ageLabel: Age.labelOf(age),
      stats: {
        doneLevels: levelList.filter(function (l) { return l.done; }).length,
        totalLevels: levelList.length,
        streak: streakData.streak,
        checkinDays: checkins.length
      },
      levelList: levelList,
      badges: Local.getBadges(),
      streak: streakData.streak,
      calendar: calendar,
      favorites: favorites,
      consent: consent
    });
  },

  /* ---------------- 年龄（更正入口） ---------------- */
  onOpenAgePicker() {
    this.setData({ showAgePicker: true });
  },

  onCloseAgePicker() {
    this.setData({ showAgePicker: false });
  },

  onPickAge(e) {
    const age = e.currentTarget.dataset.age;
    if (!age) return;
    app.globalData.ageGroup = age;
    dataService.setAgeGroup(age); // 本地立即生效，云端异步同步
    this.setData({ showAgePicker: false });
    this.refresh();
  },

  /* ---------------- 闯关 ---------------- */
  onTapLevel(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    tt.navigateTo({ url: '/pages/level/level?id=' + id });
  },

  /* ---------------- 打卡 ---------------- */
  onCheckin() {
    dataService.checkin().then((r) => {
      tt.showToast({
        title: r.isNew
          ? '打卡成功，连续 ' + r.streak + ' 天' + (r.offline ? '（本地）' : '')
          : '今天已经打过卡啦',
        icon: 'none'
      });
      this.refresh();
    }).catch((e) => {
      tt.showToast({ title: (e && e.message) || '打卡失败，请重试', icon: 'none' });
    });
  },

  /* ---------------- 隐私与数据（§9.1 硬性） ---------------- */
  onDeleteData() {
    tt.showModal({
      title: '删除我的数据？',
      content: '将删除年龄段、闯关进度、徽章、打卡和收藏，且无法恢复。',
      confirmText: '删除',
      confirmColor: '#E5544B',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return;
        dataService.deleteData().then(function () {
          app.globalData.ageGroup = null;
          tt.showToast({ title: '数据已删除', icon: 'none' });
          setTimeout(function () {
            tt.switchTab({ url: '/pages/index/index' });
          }, 600);
        }).catch(function (e) {
          tt.showModal({
            title: '删除失败',
            content: (e && e.message) || '请检查网络后重试。数据尚未删除。',
            showCancel: false
          });
        });
      }
    });
  },

  onWithdrawConsent() {
    tt.showModal({
      title: '撤回监护人同意？',
      content: '撤回后将停止处理并清空已采集的数据（年龄段、进度、打卡、收藏）。之后需要重新同意才能使用。',
      confirmText: '撤回',
      confirmColor: '#E5544B',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return;
        dataService.withdrawConsent().then(function () {
          app.globalData.ageGroup = null;
          tt.showToast({ title: '已撤回同意', icon: 'none' });
          setTimeout(function () {
            tt.switchTab({ url: '/pages/index/index' });
          }, 600);
        }).catch(function (e) {
          tt.showModal({
            title: '撤回失败',
            content: (e && e.message) || '请检查网络后重试。同意状态尚未撤回。',
            showCancel: false
          });
        });
      }
    });
  }
});
