/* utils/interaction.js —— interactionConfig 解释器
 *
 * 输入严格对齐《接口契约》§5.1。引擎只认配置，不认识任何具体关卡。
 *
 * ⚠️ 本文件内不得出现任何关卡语义（关卡名、图标、按 id 判断分支）。
 *    这是「新增关卡不改代码只加数据」能否成立的判据。
 *
 * 与 prototypes/js/interaction.js 的区别：
 *   原型版直接操作 DOM（createElement / classList / addEventListener）；
 *   这里改成【纯状态机】——只算数据，由页面 setData 后交给 ttml 渲染。
 *   状态机逻辑（幂等、宽容失败、通关判定）与原型完全一致。
 *
 * 三个契约缺口的决议在此落地：
 *   G2  坐标是 0~1 归一化的【中心点】
 *   G3  失败为宽容模式：仅 1 秒瞬时提示，不清零、不扣进度
 *   G4  同一目标重复点击不重复计数
 *   G5  未知 version 降级不白屏
 */
'use strict';

var VERSION_SUPPORTED = 1;

/* 缺口 G3 的决议：点错只做 1 秒瞬时提示，随后自动回到可玩态。
 * 对儿童产品来说，「点错一次就归零」等于劝退。 */
var WRONG_HOLD_MS = 1000;

/* 五类交互。click 已实现，其余四个契约 §5.1 已定义但尚未实现。 */
var INTERPRETERS = {
  click: initClick,
  drag: null,
  dragSort: null,
  connect: null,
  drop: null
};

function initClick(config) {
  var props = config.props || {};
  return {
    type: 'click',
    state: 'playing',            // playing | wrong | success
    need: props.requiredHits || 1,
    hits: 0,
    wrongCount: 0,
    targets: (props.targets || []).map(function (t) {
      return {
        id: t.id,
        label: t.label || '',
        icon: t.icon || '',
        isCorrect: !!t.isCorrect,
        /* 坐标由归一化值转成百分比字符串，交给 ttml 的内联 style。
           中心点语义 → 样式里配了 transform: translate(-50%,-50%) */
        styleStr: 'left:' + (t.x * 100) + '%;top:' + (t.y * 100) + '%;',
        hit: false,
        wrong: false
      };
    })
  };
}

/**
 * 初始化一个交互。
 * @returns {Object} 状态对象；配置不受支持时返回 { error: '...' }
 */
function init(config) {
  if (!config) return { error: '关卡配置缺失' };

  /* 缺口 G5：未知 version 降级 + 不白屏 */
  var version = config.version || 1;
  if (version !== VERSION_SUPPORTED) {
    return { error: '暂不支持该关卡版本（v' + version + '）' };
  }

  var make = INTERPRETERS[config.type];
  if (!make) return { error: '暂不支持的交互类型：' + config.type };

  return make(config);
}

/**
 * 点击一个目标。就地修改 st，并返回本次发生了什么。
 * @returns {{changed:boolean, miss:boolean, success:boolean}}
 */
function tap(st, targetId) {
  var res = { changed: false, miss: false, success: false };
  if (!st || !st.targets || st.state !== 'playing') return res;

  var target = null;
  for (var i = 0; i < st.targets.length; i++) {
    if (st.targets[i].id === targetId) { target = st.targets[i]; break; }
  }
  if (!target) return res;

  if (!target.isCorrect) {
    target.wrong = true;
    st.state = 'wrong';
    st.wrongCount++;
    res.changed = true;
    res.miss = true;
    return res;
  }

  /* 缺口 G4：同一目标重复点击不重复计数 */
  if (target.hit) return res;
  target.hit = true;
  st.hits++;
  res.changed = true;

  if (st.hits >= st.need) {
    st.state = 'success';
    res.success = true;
  }
  return res;
}

/**
 * 失败提示到期，回到可玩态。
 * 缺口 G3：宽容模式 —— 不清零、不扣进度。
 * @returns {boolean} 是否发生了状态变化
 */
function recover(st) {
  if (!st || !st.targets || st.state !== 'wrong') return false;
  st.state = 'playing';
  for (var i = 0; i < st.targets.length; i++) {
    st.targets[i].wrong = false;
  }
  return true;
}

/** 重置为初始状态（重玩） */
function reset(config) {
  return init(config);
}

module.exports = {
  init: init,
  tap: tap,
  recover: recover,
  reset: reset,
  WRONG_HOLD_MS: WRONG_HOLD_MS
};
