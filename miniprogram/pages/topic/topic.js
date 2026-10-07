// pages/topic/topic.js —— 主题内容页（太空）
// 依据：《需求文档》4.2 短视频科普 / 4.3 互动实验闯关 / 4.4 电商带货
//
// 页面角色：首页与关卡页之间的枢纽。

const app = getApp();
const DEMO = require('../../utils/demo-data.js');
const progress = require('../../utils/mock-progress.js');

const AGE_THEME = { '3-6': 'warm', '6-9': 'warm', '9-12': 'cool' };
const STORAGE_KEY = 'sci.ageGroup';

const TOPIC_ID = 'space';

Page({
  data: {
    theme: 'cool',
    videoList: [],
    levelList: [],
    shopList: [],
    doneCount: 0
  },

  /* 用 onShow 而不是 onLoad：从关卡页返回时要刷新通关状态，
     否则刚通关回来还显示「去试试」。 */
  onShow() {
    const age = app.globalData.ageGroup || this.restoreAge();
    this.setData({ theme: AGE_THEME[age] || 'cool' });
    this.refresh(age);
  },

  refresh(age) {
    // TODO(S3)：以下三块都改为云函数拉取，分龄过滤必须在云函数里做
    //          （见《接口契约》§5「前端待对齐项」）。此处为临时实现。

    const videoList = DEMO.contents
      .filter(function (c) {
        return c.topicId === TOPIC_ID
          && c.type === 'video'
          && (!age || c.ageGroup === age);
      })
      .map(function (c) {
        return Object.assign({}, c, { durationText: fmtDuration(c.duration) });
      });

    /* 关卡列表：本主题的全部关卡。
       注意 ageGroup 只是排序参考 —— 实验本身不分龄（同《需求文档》2 节：
       V1.0 的分龄是内容难度分层，不做交互差异）。 */
    const levels = Object.keys(DEMO.levels)
      .map(function (k) { return DEMO.levels[k]; })
      .filter(function (lv) { return lv.topicId === TOPIC_ID; })
      .sort(function (a, b) { return a.order - b.order; });

    const levelList = levels.map(function (lv) {
      return {
        _id: lv._id,
        name: lv.name,
        order: lv.order,
        sciencePoint: lv.sciencePoint,
        done: !!progress.get(lv._id)          // 已通关则显示状态
      };
    });

    this.setData({
      videoList: videoList,
      levelList: levelList,
      shopList: DEMO.shop,
      doneCount: progress.doneCountOf(levels.map(function (lv) { return lv._id; }))
    });
  },

  /* ---------------- 事件 ---------------- */

  onTapLevel(e) {
    const levelId = e.currentTarget.dataset.id;
    tt.navigateTo({ url: '/pages/level/level?id=' + levelId });
  },

  onTapVideo() {
    /* 流程缺口（《接口契约》§8.2）：assets/ 里没有任何视频素材，
       也没有播放页。这里刻意不做假动作 —— 与其弹个假提示，
       不如什么都不发生，问题已登记在案。 */
    // TODO(S4)：视频素材到位后，跳播放页
  },

  restoreAge() {
    try { return tt.getStorageSync(STORAGE_KEY) || null; } catch (e) { return null; }
  }
});

/** 秒 → 1′35″ */
function fmtDuration(sec) {
  return Math.floor(sec / 60) + '′' + (sec % 60) + '″';
}
