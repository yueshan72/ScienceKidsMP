// pages/video/video.js —— 短视频播放页
// 依据：《需求文档》4.2 短视频科普（播放 / 点赞 / 收藏 / 全屏 / 关联实验）
//
// V1.0 说明：
//   - mediaUrl 为空时显示「素材准备中」占位，不白屏；
//   - 点赞、收藏 V1.0 仅本地（契约尚无对应云函数）；
//   - 关联商品位为静态占位，保留「推广」标识（§9.1）。

const app = getApp();
const DEMO = require('../../utils/demo-data.js');
const Local = require('../../utils/local-state.js');
const Age = require('../../utils/age.js');
const Format = require('../../utils/format.js');

Page({
  data: {
    theme: 'cool',
    error: '',
    content: {},
    durationText: '',
    mediaUrl: '',
    levelId: '',
    isSample: false,
    fav: false,
    liked: false,
    shopList: []
  },

  onLoad(query) {
    const id = query && query.id;
    const content = DEMO.contents.filter(function (c) { return c._id === id; })[0];

    if (!content) {
      this.setData({ error: '内容不存在（错误码 2001）' });
      return;
    }

    const age = app.globalData.ageGroup || Local.getAgeGroup();

    this.setData({
      theme: Age.themeOf(age),
      content: content,
      durationText: Format.fmtDuration(content.duration),
      mediaUrl: content.mediaUrl || '',
      levelId: content.levelId || '',
      isSample: content.mediaUrl === '/assets/sample.mp4',
      fav: Local.isFavorite(content._id),
      liked: Local.isLiked(content._id),
      shopList: DEMO.shop.filter(function (p) {
        return p.contentId === content._id;
      })
    });
  },

  onToggleFav() {
    const id = this.data.content._id;
    if (!id) return;
    const added = Local.toggleFavorite(id);
    this.setData({ fav: added });
    tt.showToast({ title: added ? '已收藏' : '已取消收藏', icon: 'none' });
  },

  onToggleLike() {
    const id = this.data.content._id;
    if (!id) return;
    const added = Local.toggleLike(id);
    this.setData({ liked: added });
    tt.showToast({ title: added ? '已点赞' : '已取消点赞', icon: 'none' });
  },

  /** 视频末尾引导：有关联关卡就进关卡，没有就回主题页继续逛 */
  onGoLevel() {
    if (this.data.levelId) {
      tt.navigateTo({ url: '/pages/level/level?id=' + this.data.levelId });
    } else {
      tt.navigateTo({ url: '/pages/topic/topic' });
    }
  },

  onVideoError() {
    tt.showToast({ title: '视频加载失败，请稍后重试', icon: 'none' });
  }
});
