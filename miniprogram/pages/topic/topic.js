// pages/topic/topic.js —— 主题内容页（太空）
// 依据：《需求文档》4.2 短视频科普 / 4.3 互动实验闯关 / 4.4 电商带货
//
// 页面角色：首页与关卡页之间的枢纽。

const app = getApp();
const DEMO = require('../../utils/demo-data.js');
const Local = require('../../utils/local-state.js');
const progress = require('../../utils/mock-progress.js');
const Age = require('../../utils/age.js');
const Format = require('../../utils/format.js');

const TOPIC_ID = 'space';

Page({
  data: {
    theme: 'cool',
    ageGroup: null,
    videoList: [],
    levelList: [],
    shopList: [],
    doneCount: 0
  },

  /* 用 onShow 而不是 onLoad：从关卡页返回时要刷新通关状态，
     否则刚通关回来还显示「去试试」。 */
  onShow() {
    const age = app.globalData.ageGroup || Local.getAgeGroup();
    this.setData({ theme: Age.themeOf(age), ageGroup: age });
    this.refresh(age);
  },

  refresh(age) {
    /* V1.0 范围决策：视频/关卡内容为客户端静态数据（契约 §8.3）；
       用户进度读取本地镜像，云环境就绪后由 data-service 同步到 progress 云函数。 */

    const videoList = DEMO.contents
      .filter(function (c) {
        return c.topicId === TOPIC_ID
          && c.type === 'video'
          && (!age || c.ageGroup === age);
      })
      .map(function (c) {
        return Object.assign({}, c, {
          durationText: Format.fmtDuration(c.duration),
          fav: Local.isFavorite(c._id)
        });
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

  onTapVideo(e) {
    /* 播放页已落地：有 mediaUrl 就播放，没有就显示「素材准备中」占位。
       正式素材由团队补齐（§8.2）。 */
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    tt.navigateTo({ url: '/pages/video/video?id=' + id });
  },

  onToggleFav(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const added = Local.toggleFavorite(id);
    tt.showToast({ title: added ? '已收藏' : '已取消收藏', icon: 'none' });
    this.refresh(this.data.ageGroup);
  }
});
