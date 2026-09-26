// pages/topic/topic.js —— 主题内容页（太空）
// 依据：《需求文档》4.2 短视频科普 / 4.3 互动实验闯关 / 4.4 电商带货

const app = getApp();
const { call } = require('../../utils/request');

Page({
  data: {
    topic: null,
    videoList: [],   // 短视频列表（《需求文档》4.2）
    levelList: [],   // 关卡列表（《需求文档》4.3，太空主题 3-5 关）
    productList: [], // 商品推荐（《需求文档》4.4）
    loading: true,
  },

  onLoad() {
    this.fetchTopicData();
  },

  fetchTopicData() {
    // TODO(S2)：
    //   - 视频列表走 contents 集合，按 ageGroup 过滤
    //   - 关卡列表走 levels 集合，见 接口契约 §4
    //   - 商品位走 product 云函数 listByLevel，见 接口契约 §3.4
    this.setData({ loading: false });
  },

  onTapVideo(e) {
    // TODO(S2)：进入播放页；视频末尾引导「去动手试一试」跳对应关卡（《需求文档》4.2）
    console.log('play video', e.currentTarget.dataset.id);
  },

  onTapLevel(e) {
    const levelId = e.currentTarget.dataset.id;
    tt.navigateTo({ url: `/pages/level/level?levelId=${levelId}` });
  },

  onTapProduct(e) {
    // TODO(S2)：跳转抖音小程序购物车 / 精选联盟落地页（《需求文档》4.4）
    // 注意：带货内容必须显著标识，不得诱导消费（《需求文档》9.1）
    console.log('open product', e.currentTarget.dataset.id);
  },
});
