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
const Local = require('../../utils/local-state.js');
const Interaction = require('../../utils/interaction.js');
const dataService = require('../../utils/data-service.js');
const Age = require('../../utils/age.js');
const Format = require('../../utils/format.js');

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
    const age = app.globalData.ageGroup || Local.getAgeGroup();
    this.setData({ theme: Age.themeOf(age) });
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
    this._settleSeq = (this._settleSeq || 0) + 1; // 作废上一关未返回的结算

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
    /* 结算序号：若结算返回前用户点了「再试一次」或切了关卡，
       旧结果不得覆盖新状态。 */
    this._settleSeq = (this._settleSeq || 0) + 1;
    const seq = this._settleSeq;

    /* 云优先、本地兜底：云环境未配置时 data-service 直接用本地幂等实现，
       配置后自动改走 progress 云函数（星级/徽章由服务端判定，契约 §3.2）。 */
    dataService.completeLevel(
      this.level._id,
      this.it.wrongCount,
      this.level.topicId
    ).then((d) => {
      if (seq !== this._settleSeq) return;
      this.setData({
        reward: { starsText: Format.starsText(d.stars) },
        showBadge: (d.newBadges || []).length > 0
      });
    }).catch(() => {
      if (seq !== this._settleSeq) return;
      /* data-service 内部已回落本地；这里只兜住极端异常，避免卡在通关态无反馈 */
      this.setData({ reward: { starsText: '★★★' }, showBadge: false });
    });
  },

  onReset() {
    clearTimeout(this._hintTimer);
    this._settleSeq = (this._settleSeq || 0) + 1; // 作废未返回的结算
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
