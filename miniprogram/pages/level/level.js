// pages/level/level.js —— 闯关详情页（互动实验）
// 从 prototypes/level.html + prototypes/js/app.js 搬运。
// 依据：《需求文档》4.3 互动实验闯关（核心留存）
//
// 与原型的关键差异：
//   原型里引擎直接操作 DOM（createElement / classList）；
//   这里引擎是纯状态机（utils/interaction.js），页面负责把它算出的状态
//   setData 出去、由 level.ttml 渲染。逻辑本身完全一致。

const app = getApp();
const DEMO = require('../../utils/demo-data.js');
const Interaction = require('../../utils/interaction.js');
const progress = require('../../utils/mock-progress.js');

const AGE_THEME = { '3-6': 'warm', '6-9': 'warm', '9-12': 'cool' };
const STORAGE_KEY = 'sci.ageGroup';

Page({
  data: {
    theme: 'cool',
    error: '',
    level: {},
    prompt: '',
    sceneKey: 'default',
    deco: [],
    targets: [],
    stageClass: '',
    showHint: false,
    hintText: '',
    reward: null,
    showBadge: false
  },

  onLoad(query) {
    const age = app.globalData.ageGroup || this.restoreAge();
    this.setData({ theme: AGE_THEME[age] || 'cool' });
    this.loadLevel(query.id || firstLevelId());
  },

  onUnload() {
    clearTimeout(this._hintTimer);
  },

  /* ---------------- 装配 ---------------- */

  loadLevel(levelId) {
    const lv = DEMO.levels[levelId];
    if (!lv) {
      this.setData({ error: '关卡不存在（错误码 2001）' });
      return;
    }

    this.level = lv;

    // 引擎唯一输入就是 interactionConfig —— 它不认识关卡 id
    this.it = Interaction.init(lv.interactionConfig);
    if (this.it.error) {
      // 缺口 G5：版本/类型不支持时降级提示，不白屏
      this.setData({ error: this.it.error, level: lv });
      return;
    }

    this.setData({
      error: '',
      level: lv,
      prompt: lv.interactionConfig.prompt,
      sceneKey: (lv.scene && lv.scene.key) || 'default',
      deco: buildDeco(lv.scene),
      targets: this.it.targets,
      stageClass: '',
      showHint: false,
      hintText: '',
      reward: null,
      showBadge: false
    });
  },

  /* ---------------- 交互 ---------------- */

  onTapTarget(e) {
    const res = Interaction.tap(this.it, e.currentTarget.dataset.id);
    if (!res.changed) return;

    if (res.miss) {
      this.setData({
        targets: this.it.targets,
        showHint: true,
        hintText: this.level.interactionConfig.failText || '再试一次～'
      });

      // 缺口 G3：宽容模式 —— 1 秒后自动回到可玩态，不清零、不扣进度
      clearTimeout(this._hintTimer);
      this._hintTimer = setTimeout(() => {
        if (Interaction.recover(this.it)) {
          this.setData({ targets: this.it.targets, showHint: false });
        }
      }, Interaction.WRONG_HOLD_MS);
      return;
    }

    if (res.success) {
      this.setData({ targets: this.it.targets, stageClass: 'is-success' });
      this.settle();
      return;
    }

    this.setData({ targets: this.it.targets });
  },

  /**
   * 通关结算。
   * ⚠️ 页面只负责【展示】：星级、徽章都来自「云函数」判定，前端绝不自算 ——
   *    这是《接口契约》§3.2 里最容易被写错的一条（进度与奖励是核心数据）。
   */
  settle() {
    // TODO(S3)：替换为
    //   call('progress', 'complete', { levelId }).then(...)
    // mock-progress 是它的临时替身，幂等语义与契约 §3.2 一致。
    const d = progress.complete(this.level._id, this.it.wrongCount);

    this.setData({
      reward: { starsText: starsText(d.stars) },
      showBadge: d.newBadges.length > 0
    });
  },

  onReset() {
    clearTimeout(this._hintTimer);
    this.it = Interaction.reset(this.level.interactionConfig);
    this.setData({
      targets: this.it.targets,
      stageClass: '',
      showHint: false,
      hintText: '',
      reward: null,
      showBadge: false
    });
  },

  restoreAge() {
    try { return tt.getStorageSync(STORAGE_KEY) || null; } catch (e) { return null; }
  }
});

/* ---------------- 小工具 ---------------- */

function firstLevelId() {
  const ids = Object.keys(DEMO.levels);
  return ids[0];
}

/** 装饰物：坐标转百分比（外层定位），旋转单独一层（内层） */
function buildDeco(scene) {
  if (!scene || !scene.deco) return [];
  return scene.deco.map(function (d, i) {
    return {
      id: 'deco-' + i,
      icon: d.icon,
      anim: d.anim || 'none',
      wrapStyle: 'left:' + (d.x * 100) + '%;top:' + (d.y * 100) + '%;',
      rotStyle: 'transform: rotate(' + (d.rotate || 0) + 'deg);'
    };
  });
}

/** 3 颗星 → ★★★，2 颗 → ★★☆ */
function starsText(n) {
  return '★★★'.slice(0, n) + '☆☆☆'.slice(0, 3 - n);
}
