/* interaction.js —— interactionConfig 解释器
 *
 * 输入严格对齐《接口契约》§5.1。引擎只认配置，不认识任何具体关卡。
 * 转真机时：DOM 操作换成 setData + tt:for，状态机逻辑原样保留。
 *
 * ⚠️⚠️ 本文件内不得出现任何关卡语义（关卡名、图标、按 id 判断分支）。
 *      这是「新增关卡不改代码只加数据」能否成立的判据。
 *      prototypes/README.md 的自检 1 就是守这条的，提交前跑一遍。
 *
 * 本文件同时落地了三个契约缺口（G3/G4/G5）的决议，见下方注释。
 */
var Interaction = (function () {
  'use strict';

  var VERSION_SUPPORTED = 1;

  /* 缺口 G3 的决议：宽容模式。
   * 点错只做 1 秒瞬时提示，随后自动回到可玩态——不清零、不扣进度。
   * 对儿童产品来说，「点错一次就归零」等于劝退。 */
  var WRONG_HOLD_MS = 1000;

  /* 五类交互。click 本次实现，其余四个契约 §5.1 已定义但尚未实现。 */
  var INTERPRETERS = {
    click:    renderClick,
    drag:     null,
    dragSort: null,
    connect:  null,
    drop:     null
  };

  function el(tag, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  function plain(text, cls) {
    var n = el('view', cls || 'hint');
    n.textContent = text;
    return n;
  }

  /**
   * 装配一个交互。
   * @param {Element} stageEl  舞台容器
   * @param {Object}  config   关卡数据里的 interactionConfig（契约 §5.1）
   * @param {Object}  handlers { onSuccess({hits,wrongCount}), onMiss(), onWarn(code,val) }
   * @returns {Object|null}    { reset(), getState() }；配置不受支持时返回 null
   */
  function create(stageEl, config, handlers) {
    handlers = handlers || {};

    if (!config) {
      stageEl.appendChild(plain('关卡配置缺失'));
      return null;
    }

    /* 缺口 G5 的决议：遇到不认识的 version 时降级 + 上报，不白屏。 */
    var version = config.version || 1;
    if (version !== VERSION_SUPPORTED) {
      if (handlers.onWarn) handlers.onWarn('unsupported-version', version);
      stageEl.appendChild(plain('暂不支持该关卡版本（v' + version + '）'));
      return null;
    }

    var render = INTERPRETERS[config.type];
    if (!render) {
      if (handlers.onWarn) handlers.onWarn('unsupported-type', config.type);
      stageEl.appendChild(plain('暂不支持的交互类型：' + config.type));
      return null;
    }

    return render(stageEl, config, handlers);
  }

  /* -------------------- click：点击目标 --------------------
   * props.targets[] 每项：{ id, label, icon?, x, y, isCorrect }
   *   x / y  为 0~1 归一化的【中心点】坐标——缺口 G2 的决议。
   *          用归一化坐标是为了不受机型分辨率影响。
   * props.requiredHits 为通关所需命中的正确目标数。 */
  function renderClick(stageEl, config, handlers) {
    var props = config.props || {};
    var targets = props.targets || [];
    var need = props.requiredHits || 1;

    var state = 'playing';
    var hits = 0;
    var wrongCount = 0;
    var holdTimer = null;
    var nodes = {};

    var hintEl = el('view', 'stage-hint is-hidden');

    targets.forEach(function (t) {
      var node = el('view', 'stage-target');

      /* 坐标是中心点语义，所以 CSS 里配了 translate(-50%,-50%) */
      node.style.left = (t.x * 100) + '%';
      node.style.top = (t.y * 100) + '%';

      if (t.icon) {
        var ic = el('text', 'target-icon');
        ic.textContent = t.icon;
        node.appendChild(ic);
      }
      var lb = el('text', 'target-label');
      lb.textContent = t.label || '';
      node.appendChild(lb);

      node.addEventListener('click', function () { onTap(t, node); });

      stageEl.appendChild(node);
      nodes[t.id] = node;
    });

    stageEl.appendChild(hintEl);

    function onTap(t, node) {
      if (state !== 'playing') return;   // 成功态不再响应；失败提示期内也忽略

      if (!t.isCorrect) {
        wrongCount++;
        state = 'wrong';
        node.classList.add('is-wrong');
        showHint(config.failText);
        if (handlers.onMiss) handlers.onMiss();

        clearTimeout(holdTimer);
        holdTimer = setTimeout(function () {
          node.classList.remove('is-wrong');
          hideHint();
          state = 'playing';           // 宽容模式：回到可玩态，不清零
        }, WRONG_HOLD_MS);
        return;
      }

      /* 缺口 G4 的决议：同一目标重复点击不重复计数。
       * （CSS 里 .is-hit 已设 pointer-events:none，这里是双保险。） */
      if (node.classList.contains('is-hit')) return;
      node.classList.add('is-hit');
      hits++;

      if (hits >= need) succeed();
    }

    function succeed() {
      state = 'success';
      stageEl.classList.add('is-success');
      if (handlers.onSuccess) handlers.onSuccess({ hits: hits, wrongCount: wrongCount });
    }

    function reset() {
      clearTimeout(holdTimer);
      state = 'playing';
      hits = 0;
      wrongCount = 0;
      stageEl.classList.remove('is-success');
      hideHint();
      Object.keys(nodes).forEach(function (id) {
        nodes[id].classList.remove('is-hit');
        nodes[id].classList.remove('is-wrong');
      });
    }

    function showHint(msg) {
      hintEl.textContent = msg || config.failText || '再试一次～';
      hintEl.classList.remove('is-hidden');
    }
    function hideHint() { hintEl.classList.add('is-hidden'); }

    return {
      reset: reset,
      getState: function () { return state; }
    };
  }

  return { create: create };
})();
