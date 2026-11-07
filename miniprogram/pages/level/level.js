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
const SuccessFx = require('../../utils/success-fx.js');
const Points = require('../../utils/points.js');
const Chrome = require('../../utils/chrome.js');
const Starfield = require('../../utils/starfield.js');

/* 全局动画开关：真机若发现 CSS 关键帧异常，可置 false 回退到静态成功态 */
const FX_ENABLED = true;

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
    showBadge: false,
    successText: '',
    fx: null,
    stars: [],
    stageGrid: [],
    craters: [],
    shakeClass: ''
  },

  onLoad(query) {
    const age = app.globalData.ageGroup || Local.getAgeGroup();
    const win = getWindowSize();
    this._windowWidth = win.width;
    this._windowHeight = win.height;
    this._stageRect = null;
    Chrome.apply(Age.themeOf(age));
    this.setData({ theme: Age.themeOf(age) });
    this.loadLevel(query.id || firstLevelId());
  },

  onReady() {
    /* 舞台测量只为地球全屏放大服务；失败时 success-fx 有 50%/60% 回退 */
    this.measureStage();
  },

  onHide() {
    /* 切后台时不能把动画层留在那里：立即收尾并显示已拿到的奖励 */
    this.finishFxImmediately();
  },

  onUnload() {
    clearTimeout(this._hintTimer);
    this.clearFxTimers();
    this._fxSeq = (this._fxSeq || 0) + 1;
    this._settleSeq = (this._settleSeq || 0) + 1;
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
    this.clearFxTimers();
    this._fxSeq = (this._fxSeq || 0) + 1;
    this._fxHolding = false;
    this._pendingReward = null;
    this._fxPlan = null;

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
      showBadge: false,
      successText: '',
      fx: null,
      stars: Starfield.build(26),
      stageGrid: buildStageGrid(),
      craters: [],
      shakeClass: ''
    }, () => this.measureStage());
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
      this.playSuccessFx();
      return;
    }

    this.setData({ targets: this.it.targets });
  },

  /* ---------------- 成功动画 ---------------- */

  /**
   * 通关成功：先生成动画计划。
   * 数据立即结算（settle(true)），奖励 UI 由 _fxHolding 闸门压到动画结束；
   * 动画无效 / play='first' 且已完成时直接走静态成功态。
   */
  playSuccessFx() {
    const plan = this.buildFxPlan();
    const skip = !plan || !plan.active
      || (plan.play === 'first' && !!Local.getLevelProgress(this.level._id));

    if (skip) {
      this.setData({
        targets: this.it.targets,
        stageClass: 'is-success',
        successText: '',
        fx: null,
        craters: []
      });
      this.settle(false);
      return;
    }

    this.clearFxTimers();
    this._fxPlan = plan;
    this._fxHolding = true;
    this._fxSeq = (this._fxSeq || 0) + 1;
    const seq = this._fxSeq;

    const stageClass = 'is-success is-fxing'
      + (plan.hideDeco ? ' fx-hide-deco' : '')
      + (plan.hideTargets ? ' fx-hide-targets' : '')
      + (plan.fullscreen ? ' fx-keep-source' : '');

    this.setData({
      targets: this.it.targets,
      stageClass: stageClass,
      successText: this.level.interactionConfig.successText || '',
      /* 陨坑在动画开始时就渲染，靠 animation-delay 等到撞击时刻才出现，
         动画结束后继续留在舞台上（直到重玩 / 切关）。 */
      craters: plan.craters || [],
      fx: Object.assign({}, plan, {
        exiting: false,
        containerClass: plan.fullscreen ? 'is-fx-dim' : ''
      })
    });

    this.settle(true);
    this.scheduleFxShakes(plan, seq);

    const holdUntil = plan.effectEndMs + plan.holdMs + SuccessFx.BUFFER_MS;
    this._fxHoldTimer = setTimeout(() => {
      if (seq !== this._fxSeq) return;
      this.setData({ 'fx.exiting': true });
      this._fxExitTimer = setTimeout(() => {
        if (seq !== this._fxSeq) return;
        this.endSuccessFx();
      }, SuccessFx.EXIT_MS);
    }, holdUntil);
  },

  buildFxPlan() {
    if (!FX_ENABLED) return null;
    if (!this.level || !this.level.scene || !this.level.scene.successFx) return null;
    try {
      return SuccessFx.build(this.level.scene, this.level.interactionConfig, {
        stageRect: this._stageRect,
        windowWidth: this._windowWidth,
        windowHeight: this._windowHeight
      });
    } catch (e) {
      console.warn('[level] successFx build failed', e);
      return null;
    }
  },

  endSuccessFx() {
    const plan = this._fxPlan;
    this.clearFxTimers();
    this._fxSeq = (this._fxSeq || 0) + 1;
    this._fxHolding = false;
    this._fxPlan = null;

    let stageClass = 'is-success';
    if (plan && plan.persistHide) {
      stageClass += (plan.hideDeco ? ' fx-hide-deco' : '')
        + (plan.hideTargets ? ' fx-hide-targets' : '');
    }

    this.setData({ fx: null, successText: '', stageClass: stageClass, shakeClass: '' });
    this.showRewardIfReady();
  },

  finishFxImmediately() {
    if (!this._fxPlan) return;
    this.endSuccessFx();
  },

  /** 震屏：撞击/起飞时间点由 success-fx 计算，页面只负责按点切 class */
  scheduleFxShakes(plan, seq) {
    this._shakeSeq = this._shakeSeq || 0;
    clearTimeout(this._rumbleOffTimer);
    this._rumbleOffTimer = null;

    (plan.shakeAtMs || []).slice().sort(function (a, b) { return a - b; })
      .forEach((ms) => {
        const t = setTimeout(() => {
          if (seq !== this._fxSeq || !this._fxPlan) return;
          const my = (this._shakeSeq = (this._shakeSeq || 0) + 1);
          this.setData({ shakeClass: my % 2 ? 'is-shaking-a' : 'is-shaking-b' });
          const off = setTimeout(() => {
            if (my === this._shakeSeq) this.setData({ shakeClass: '' });
          }, 460);
          this._shakeOffTimers.push(off);
        }, ms);
        this._shakeTimers.push(t);
      });

    if (plan.rumbleMs > 0) {
      this.setData({ shakeClass: 'is-rumble' });
      this._rumbleOffTimer = setTimeout(() => {
        if (seq !== this._fxSeq) return;
        if (this.data.shakeClass === 'is-rumble') this.setData({ shakeClass: '' });
      }, plan.rumbleMs);
    }
  },

  clearFxTimers() {
    clearTimeout(this._fxHoldTimer);
    clearTimeout(this._fxExitTimer);
    clearTimeout(this._rumbleOffTimer);
    this._fxHoldTimer = null;
    this._fxExitTimer = null;
    this._rumbleOffTimer = null;
    (this._shakeTimers || []).forEach(clearTimeout);
    (this._shakeOffTimers || []).forEach(clearTimeout);
    this._shakeTimers = [];
    this._shakeOffTimers = [];
  },

  measureStage() {
    if (typeof tt === 'undefined' || typeof tt.createSelectorQuery !== 'function') return;
    try {
      tt.createSelectorQuery()
        .select('.stage')
        .boundingClientRect((rect) => {
          if (rect) this._stageRect = rect;
        })
        .exec();
    } catch (e) {
      /* 测量失败不影响动画；success-fx 会用 50%/60% 回退 */
    }
  },

  /**
   * 通关结算。
   * ⚠️ 页面只负责【展示】：星级、徽章都来自「云函数」判定，前端绝不自算 ——
   *    这是《接口契约》§3.2 里最容易被写错的一条（进度与奖励是核心数据）。
   */
  settle(holdUi) {
    /* 结算序号：若结算返回前用户点了「再试一次」或切了关卡，
       旧结果不得覆盖新状态。 */
    this._settleSeq = (this._settleSeq || 0) + 1;
    const seq = this._settleSeq;
    this._fxHolding = !!holdUi;
    this._pendingReward = null;

    const apply = (r) => {
      if (seq !== this._settleSeq) return;
      this._pendingReward = {
        stars: r && r.stars,
        newBadges: (r && r.newBadges) || [],
        isFirstComplete: !!(r && r.isFirstComplete)
      };
      this.showRewardIfReady();
    };

    /* 云优先、本地兜底：云环境未配置时 data-service 直接用本地幂等实现，
       配置后自动改走 progress 云函数（星级/徽章由服务端判定，契约 §3.2）。 */
    dataService.completeLevel(
      this.level._id,
      this.it.wrongCount,
      this.level.topicId,
      apply
    ).then(apply).catch(() => {
      if (seq !== this._settleSeq) return;
      /* data-service 内部已回落本地；这里只兜住极端异常，避免卡在通关态无反馈 */
      if (!this._pendingReward) apply({ stars: 3, newBadges: [] });
    });
  },

  showRewardIfReady() {
    if (this._fxHolding || !this._pendingReward) return;
    const n = Math.max(0, Math.min(3, Number(this._pendingReward.stars) || 0));
    /* 三颗星分开渲染，便于逐颗弹入（纯展示节奏，星级仍由结算结果决定） */
    const starList = [0, 1, 2].map(function (i) {
      return {
        key: 's' + i,
        char: i < n ? '★' : '☆',
        on: i < n,
        style: 'animation-delay:' + (i * 120) + 'ms;'
      };
    });
    /* 积分 V1.0 仅展示：首次通关 +10；重复通关不重复计分，不显示加分 */
    const pointsText = this._pendingReward.isFirstComplete
      ? '+' + Points.POINTS_PER_LEVEL + ' 积分'
      : '';
    this.setData({
      reward: {
        starsText: Format.starsText(n),
        starList: starList,
        pointsText: pointsText
      },
      showBadge: (this._pendingReward.newBadges || []).length > 0
    });
  },

  onReset() {
    clearTimeout(this._hintTimer);
    this.clearFxTimers();
    this._fxSeq = (this._fxSeq || 0) + 1;
    this._settleSeq = (this._settleSeq || 0) + 1; // 作废未返回的结算
    this._fxHolding = false;
    this._pendingReward = null;
    this._fxPlan = null;
    this.it = Interaction.reset(this.level.interactionConfig);
    this.setData({
      targets: this.it.targets,
      stageClass: '',
      showHint: false,
      hintText: '',
      reward: null,
      showBadge: false,
      successText: '',
      fx: null,
      craters: [],
      shakeClass: ''
    });
  },

});

/* ---------------- 小工具 ---------------- */

function getWindowSize() {
  try {
    if (typeof tt !== 'undefined' && typeof tt.getWindowInfo === 'function') {
      const info = tt.getWindowInfo();
      if (info && info.windowWidth && info.windowHeight) {
        return { width: info.windowWidth, height: info.windowHeight };
      }
    }
  } catch (e) { /* 继续走旧 API */ }

  try {
    const info = tt.getSystemInfoSync();
    return {
      width: info.windowWidth || 375,
      height: info.windowHeight || 667
    };
  } catch (e) {
    return { width: 375, height: 667 };
  }
}

/** 常态舞台的深空网格：11 条竖线 + 7 条横线，和成功动画的网格同款 */
function buildStageGrid() {
  const out = [];
  for (let i = 1; i < 12; i++) {
    out.push({
      key: 'gv' + i,
      cls: 'fx-grid-line fx-grid-v',
      style: 'left:' + (Math.round(i / 12 * 10000) / 100) + '%;'
    });
  }
  for (let i = 1; i < 8; i++) {
    out.push({
      key: 'gh' + i,
      cls: 'fx-grid-line fx-grid-h',
      style: 'top:' + (Math.round(i / 8 * 10000) / 100) + '%;'
    });
  }
  return out;
}

function firstLevelId() {
  const ids = Object.keys(DEMO.levels);
  return ids[0];
}

/** 装饰物：坐标转百分比（外层定位），旋转单独一层（内层） */
function buildDeco(scene) {
  if (!scene || !scene.deco) return [];
  return scene.deco.map(function (d, i) {
    return {
      id: d.id || ('deco-' + i),
      icon: d.icon,
      visual: d.visual || '',
      anim: d.anim || 'none',
      wrapStyle: 'left:' + (d.x * 100) + '%;top:' + (d.y * 100) + '%;',
      rotStyle: 'transform: rotate(' + (d.rotate || 0) + 'deg);'
    };
  });
}
