/* utils/success-fx.js —— 通关成功动画的纯数据构建器
 *
 * 输入：scene.successFx + 关卡数据 + 页面环境（舞台矩形 / 窗口尺寸）
 * 输出：页面可直接 setData 的 fx plan（样式串 + 原始数值）
 *
 * 约束：
 *   1. 不依赖 tt、不出现任何关卡 id 或关卡名（和 interaction.js 同一条守卫）；
 *   2. 关键帧只用 transform / opacity；位移靠 CSS 变量 --fx-dx / --fx-dy；
 *   3. 原始数字（from/delta/duration）一并返回，CSS 变量失效时可切 tt.createAnimation；
 *   4. 任何无效配置都返回 active:false，绝不抛异常、不阻塞结算。
 *
 * 数据结构见 docs/接口契约.md §5.2。
 */
'use strict';

const EXIT_MS = 250;              // 效果层退场淡出
const BUFFER_MS = 80;             // 定时器与动画帧的缓冲
const DEFAULT_HOLD_MS = 200;      // 动画结束后的停留
const DEFAULT_DURATION_MS = 2400;
const MIN_DURATION_MS = 200;
const MAX_DURATION_MS = 5000;
const MAX_DELAY_MS = 5000;
const DEFAULT_DECO_SIZE = 128;
const DEFAULT_TARGET_SIZE = 44;
const SUPPORTED_VERSION = 1;
const FX_TYPES = { launch: true, fall: true, zoom: true };

/* 电影化效果的上限：宁可少而稳，不在低端机上堆节点 */
const MAX_GHOSTS = 4;
const DEFAULT_GHOST_STEP_MS = 60;
const DEFAULT_GHOST_OPACITY = 0.35;
const MAX_PARTICLES = 28;
const MAX_STARS = 40;

function num(value, fallback) {
  const n = Number(value);
  return isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** 百分比保留 2 位，避免样式串里出现一长串小数 */
function pct(value) {
  return String(Math.round(value * 100) / 100);
}

function round(value) {
  return Math.round(value);
}

/** 确定性伪随机：同一份数据每次构建结果一致，测试可断言 */
function rand(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

function countOf(value, fallback) {
  if (value === true) return fallback;
  if (value === false || value === undefined || value === null) return 0;
  return clamp(Math.floor(num(value, 0)), 0, MAX_PARTICLES);
}

function resolveRef(ref, decoById, targetById) {
  if (typeof ref !== 'string') return null;
  const at = ref.indexOf(':');
  if (at <= 0) return null;

  const kind = ref.slice(0, at);
  const id = ref.slice(at + 1);
  const source = kind === 'deco'
    ? decoById[id]
    : (kind === 'target' ? targetById[id] : null);

  if (!source) return null;
  const x = Number(source.x);
  const y = Number(source.y);
  if (!isFinite(x) || !isFinite(y)) return null;

  return {
    kind: kind,
    id: id,
    x: x,
    y: y,
    icon: source.icon || '',
    rotate: source.rotate
  };
}

/** 粒子通用样式：位置 + 尺寸 + 终点偏移（CSS 变量）+ 时长 */
function particleStyle(xPct, yPct, wRpx, hRpx, delayMs, durationMs, dxRpx, dyRpx, scale) {
  return 'left:' + pct(xPct) + '%;top:' + pct(yPct) + '%;'
    + 'width:' + round(wRpx) + 'rpx;height:' + round(hRpx) + 'rpx;'
    + '--fx-px:' + round(dxRpx) + 'rpx;--fx-py:' + round(dyRpx) + 'rpx;'
    + '--fx-scale:' + scale + ';'
    + 'animation-delay:' + round(delayMs) + 'ms;'
    + 'animation-duration:' + round(durationMs) + 'ms;';
}

function build(scene, interactionConfig, env) {
  env = env || {};
  const cfg = scene && scene.successFx;
  if (!cfg || !Array.isArray(cfg.items) || cfg.items.length === 0) {
    return { active: false };
  }
  if (cfg.version !== undefined && Number(cfg.version) !== SUPPORTED_VERSION) {
    return { active: false };
  }

  const deco = (scene && Array.isArray(scene.deco)) ? scene.deco : [];
  const targets = (interactionConfig
    && interactionConfig.props
    && Array.isArray(interactionConfig.props.targets))
    ? interactionConfig.props.targets
    : [];

  const decoById = {};
  deco.forEach(function (d, i) {
    if (!d) return;
    decoById[d.id || ('deco-' + i)] = d;
  });

  const targetById = {};
  targets.forEach(function (t) {
    if (t && t.id) targetById[t.id] = t;
  });

  const items = [];
  const ghosts = [];
  const particles = [];
  const shockwaves = [];
  const craters = [];
  const flashes = [];
  const props = [];
  const grid = [];
  const spaceStars = [];
  const stars = [];
  const shakeAtMs = [];
  let rumbleMs = 0;
  let captionDelayMs = 0;
  let space = false;
  let hideDeco = false;
  let hideTargets = false;
  let fullscreen = false;
  let effectEndMs = 0;

  function bumpEffectEnd(ms) {
    if (ms > effectEndMs) effectEndMs = ms;
  }

  cfg.items.forEach(function (raw, index) {
    if (!raw || !FX_TYPES[raw.type]) return;

    const src = resolveRef(raw.ref, decoById, targetById);
    if (!src) return;

    const isDeco = src.kind === 'deco';
    const size = clamp(
      num(raw.size, isDeco ? DEFAULT_DECO_SIZE : DEFAULT_TARGET_SIZE),
      16, 400
    );
    const durationMs = clamp(
      num(raw.durationMs, DEFAULT_DURATION_MS),
      MIN_DURATION_MS, MAX_DURATION_MS
    );
    const delayMs = clamp(num(raw.delayMs, 0), 0, MAX_DELAY_MS);
    const rotate = num(raw.rotate, isDeco ? num(src.rotate, 0) : 0);
    const visual = typeof raw.visual === 'string' ? raw.visual : '';

    /* 蓄力：只对升空生效；movement 在蓄力结束后才开始 */
    const chargeMs = raw.type === 'launch'
      ? clamp(num(raw.chargeMs, 0), 0, 1500)
      : 0;
    const moveDelay = delayMs + chargeMs;

    /* 起点：舞台内效果用舞台百分比；全屏放大用视口百分比 */
    let xPct;
    let yPct;
    if (raw.type === 'zoom') {
      fullscreen = true;
      if (env.stageRect && env.windowWidth && env.windowHeight) {
        xPct = ((env.stageRect.left + src.x * env.stageRect.width) / env.windowWidth) * 100;
        yPct = ((env.stageRect.top + src.y * env.stageRect.height) / env.windowHeight) * 100;
      } else {
        /* 测量失败：给一个近似起点，仍然完成镜头推进 */
        xPct = 50;
        yPct = 60;
      }
    } else {
      xPct = src.x * 100;
      yPct = src.y * 100;
    }

    /* 终点 → 位移增量（百分比相对 mover 自身尺寸） */
    let dxPct = 0;
    let dyPct = 0;
    if (raw.type === 'zoom') {
      dxPct = 50 - xPct;
      dyPct = 50 - yPct;
    } else {
      const to = raw.to || {};
      let baseX = src.x;
      let baseY = src.y;

      if (to.ref) {
        const dest = resolveRef(to.ref, decoById, targetById);
        if (dest) {
          baseX = dest.x;
          baseY = dest.y;
        }
      } else if (isFinite(Number(to.x)) && isFinite(Number(to.y))) {
        baseX = Number(to.x);
        baseY = Number(to.y);
      }

      const endX = baseX + num(to.dx, 0);
      const endY = baseY + num(to.dy, 0);
      dxPct = (endX - src.x) * 100;
      dyPct = (endY - src.y) * 100;
    }

    const hideSource = raw.hideSource !== false;
    if (hideSource) {
      if (isDeco) hideDeco = true;
      else hideTargets = true;
    }

    /* 矢量演员的朝向：彗星尾巴永远指向来路（与速度相反） */
    let visualRotate = rotate;
    if (visual === 'comet') {
      visualRotate = Math.round(Math.atan2(-dxPct, dyPct) * 180 / Math.PI * 10) / 10;
    } else if (visual) {
      visualRotate = 0;
    }

    space = true;

    let flame = null;
    if (raw.flame) {
      flame = {
        icon: raw.flame.icon || '🔥',
        style: 'font-size:' + clamp(num(raw.flame.size, 96), 16, 300) + 'rpx;'
          + 'bottom:' + (-num(raw.flame.offsetY, 0)) + 'rpx;'
          + 'animation-duration:' + clamp(num(raw.flame.flickerMs, 240), 80, 2000) + 'ms;'
      };
    }

    const impactStart = moveDelay + Math.round(durationMs * 0.9);
    let impact = null;
    let impactMs = 0;
    if (raw.impact) {
      impactMs = clamp(num(raw.impact.durationMs, 400), 100, 2000);
      /* 爆点在演员最后 10% 行程出现：正好接住 fx-settle 的淡出，
         避免演员先消失、停一拍才出现爆点的空档。 */
      impact = {
        icon: raw.impact.icon || '💥',
        style: 'font-size:' + clamp(num(raw.impact.size, 64), 16, 300) + 'rpx;'
          + 'animation-duration:' + impactMs + 'ms;'
          + 'animation-delay:' + impactStart + 'ms;'
      };
    }

    const timing = raw.type === 'zoom' ? 'ease-in-out'
      : (raw.type === 'fall' ? 'ease-in' : 'ease-in-out');

    const moverStyle = '--fx-dx:' + pct(dxPct) + '%;'
      + '--fx-dy:' + pct(dyPct) + '%;'
      + 'animation-duration:' + durationMs + 'ms;'
      + 'animation-delay:' + moveDelay + 'ms;'
      + 'animation-timing-function:' + timing + ';';
    const bodyStyle = 'font-size:' + size + 'rpx;'
      + 'animation-duration:' + durationMs + 'ms;'
      + 'animation-delay:' + moveDelay + 'ms;';

    items.push({
      key: 'fx-' + index,
      type: raw.type,
      icon: src.icon,
      visual: visual,
      sizeRpx: size,
      rotate: visualRotate,
      from: { xPct: xPct, yPct: yPct },
      delta: { xPct: dxPct, yPct: dyPct },
      durationMs: durationMs,
      delayMs: delayMs,
      chargeMs: chargeMs,
      /* 模板直接用这些样式串；原始数值另外保留，便于降级 */
      anchorStyle: 'left:' + pct(xPct) + '%;top:' + pct(yPct) + '%;',
      chargeClass: chargeMs > 0 ? 'fx-charge' : '',
      chargeStyle: chargeMs > 0
        ? 'animation-duration:' + chargeMs + 'ms;animation-delay:' + delayMs + 'ms;'
        : '',
      moverStyle: moverStyle,
      bodyClass: 'fx-body--' + raw.type,
      bodyStyle: bodyStyle,
      rotatorStyle: 'transform: rotate(' + visualRotate + 'deg);',
      iconStyle: 'font-size:' + size + 'rpx;',
      halo: raw.type === 'zoom' && raw.halo === true,
      flame: flame,
      impact: impact
    });

    bumpEffectEnd(moveDelay + durationMs + impactMs);

    /* ---------------- 残影 ---------------- */
    /* 矢量演员自带尾焰/尾巴，不再叠加 emoji 残影 */
    const ghostCount = visual ? 0 : clamp(Math.floor(num(raw.ghosts, 0)), 0, MAX_GHOSTS);
    const ghostStep = clamp(num(raw.ghostStepMs, DEFAULT_GHOST_STEP_MS), 20, 400);
    const ghostOpacity = clamp(num(raw.ghostOpacity, DEFAULT_GHOST_OPACITY), 0.05, 0.9);
    for (let g = 1; g <= ghostCount; g++) {
      const gd = moveDelay + g * ghostStep;
      const op = Math.round(ghostOpacity * Math.pow(0.68, g - 1) * 100) / 100;
      ghosts.push({
        key: 'gh-' + index + '-' + g,
        icon: src.icon,
        visual: visual,
        wrapStyle: 'opacity:' + op + ';',
        anchorStyle: 'left:' + pct(xPct) + '%;top:' + pct(yPct) + '%;',
        moverStyle: '--fx-dx:' + pct(dxPct) + '%;'
          + '--fx-dy:' + pct(dyPct) + '%;'
          + 'animation-duration:' + durationMs + 'ms;'
          + 'animation-delay:' + gd + 'ms;'
          + 'animation-timing-function:' + timing + ';',
        bodyClass: 'fx-body--' + raw.type,
        bodyStyle: 'font-size:' + size + 'rpx;'
          + 'animation-duration:' + durationMs + 'ms;'
          + 'animation-delay:' + gd + 'ms;',
        rotatorStyle: 'transform: rotate(' + visualRotate + 'deg);',
        iconStyle: 'font-size:' + size + 'rpx;'
      });
      /* 残影末帧必然淡出，不必为它延长效果层生命周期 */
    }

    /* ---------------- 升空：烟雾 / 火花 / 速度线 ---------------- */
    if (raw.type === 'launch') {
      const smokeCount = countOf(raw.smoke, 8);
      for (let i = 0; i < smokeCount; i++) {
        const sx = xPct + (rand(index * 31 + i * 7 + 1) - 0.5) * 7;
        const sy = yPct + 5 + rand(index * 17 + i * 3 + 2) * 5;
        const dx = (rand(index * 13 + i * 5 + 3) - 0.5) * 150;
        const dy = 40 + rand(index * 19 + i * 11 + 4) * 130;
        const psize = 16 + rand(index * 23 + i * 13 + 5) * 28;
        const pd = delayMs + rand(index * 29 + i * 17 + 6) * 500;
        const pdur = 900 + rand(index * 37 + i * 19 + 7) * 600;
        particles.push({
          key: 'sm-' + index + '-' + i,
          cls: 'fx-particle fx-particle--smoke',
          style: particleStyle(sx, sy, psize, psize, pd, pdur, dx, dy, 2.2)
        });
        bumpEffectEnd(pd + pdur);
      }

      const sparkCount = countOf(raw.sparks, 8);
      for (let i = 0; i < sparkCount; i++) {
        const angle = rand(index * 41 + i * 23 + 8) * Math.PI * 2;
        const dist = 40 + rand(index * 43 + i * 29 + 9) * 100;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist + 30;
        const ssize = 5 + rand(index * 47 + i * 31 + 10) * 7;
        const sd = moveDelay + rand(index * 53 + i * 37 + 11) * 700;
        const sdur = 400 + rand(index * 59 + i * 41 + 12) * 320;
        particles.push({
          key: 'sp-' + index + '-' + i,
          cls: 'fx-particle fx-particle--spark',
          style: particleStyle(xPct, yPct, ssize, ssize, sd, sdur, dx, dy, 0.2)
        });
        bumpEffectEnd(sd + sdur);
      }

      const streakCount = countOf(raw.streaks, 8);
      for (let i = 0; i < streakCount; i++) {
        const sx = 6 + rand(index * 61 + i * 43 + 13) * 88;
        const sy = 12 + rand(index * 67 + i * 47 + 14) * 76;
        const w = 3 + rand(index * 71 + i * 53 + 15) * 3;
        const h = 60 + rand(index * 73 + i * 59 + 16) * 70;
        const dx = (rand(index * 79 + i * 61 + 17) - 0.5) * 30;
        const dy = -(260 + rand(index * 83 + i * 67 + 18) * 300);
        const sd = moveDelay + rand(index * 89 + i * 71 + 19) * 900;
        const sdur = 500 + rand(index * 97 + i * 73 + 20) * 400;
        particles.push({
          key: 'st-' + index + '-' + i,
          cls: 'fx-particle fx-particle--streak',
          style: particleStyle(sx, sy, w, h, sd, sdur, dx, dy, 1)
        });
        bumpEffectEnd(sd + sdur);
      }

      if (raw.shake === true) shakeAtMs.push(delayMs + chargeMs);
      if (raw.rumble === true) {
        rumbleMs = Math.max(rumbleMs, delayMs + chargeMs + 300);
      }
      /* 蓄力类动画：文案等起步时再出现，别抢蓄力的戏 */
      if (chargeMs > 0) {
        captionDelayMs = Math.max(captionDelayMs, delayMs + chargeMs);
      }
    }

    /* ---------------- 坠落：冲击波 / 尘埃 / 陨坑 ---------------- */
    if (raw.type === 'fall') {
      const endX = xPct + dxPct;
      const endY = yPct + dyPct;

      const burstCount = countOf(raw.impactBurst, 10);
      for (let i = 0; i < burstCount; i++) {
        const angle = rand(index * 101 + i * 79 + 21) * Math.PI * 2;
        const dist = 50 + rand(index * 103 + i * 83 + 22) * 120;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist;
        const psize = 6 + rand(index * 107 + i * 89 + 23) * 10;
        const pd = impactStart + rand(index * 109 + i * 97 + 24) * 120;
        const pdur = 450 + rand(index * 113 + i * 101 + 25) * 420;
        particles.push({
          key: 'bu-' + index + '-' + i,
          cls: 'fx-particle ' + (i % 3 === 0 ? 'fx-particle--dust' : 'fx-particle--spark'),
          style: particleStyle(endX, endY, psize, psize, pd, pdur, dx, dy, 0.2)
        });
        bumpEffectEnd(pd + pdur);
      }

      if (raw.shockwave === true) {
        shockwaves.push({
          key: 'sw-' + index,
          style: 'left:' + pct(endX) + '%;top:' + pct(endY) + '%;'
            + 'animation-delay:' + impactStart + 'ms;animation-duration:520ms;'
        });
        flashes.push({
          key: 'fl-' + index,
          style: 'left:' + pct(endX) + '%;top:' + pct(endY) + '%;'
            + 'animation-delay:' + impactStart + 'ms;'
        });
        bumpEffectEnd(impactStart + 520);
      }

      if (raw.crater === true) {
        const csize = 34 + Math.round(rand(index * 127 + 26) * 12);
        craters.push({
          key: 'cr-' + index,
          style: 'left:' + pct(endX) + '%;top:' + pct(endY) + '%;'
            + 'width:' + csize + 'rpx;height:' + csize + 'rpx;'
            + 'animation-delay:' + (impactStart + 120) + 'ms;'
        });
      }

      if (raw.shake === true) shakeAtMs.push(impactStart);
    }

    /* ---------------- 全屏放大：星野 ---------------- */
    if (raw.type === 'zoom') {
      const starCount = clamp(Math.floor(num(raw.stars, 0)), 0, MAX_STARS);
      for (let i = 0; i < starCount; i++) {
        const sx = 2 + rand(index * 131 + i * 107 + 27) * 96;
        const sy = 2 + rand(index * 137 + i * 109 + 28) * 96;
        const ssize = 2 + Math.round(rand(index * 139 + i * 113 + 29) * 5);
        const sd = Math.round(rand(index * 149 + i * 127 + 30) * 2200);
        const sdur = Math.round(1200 + rand(index * 151 + i * 131 + 31) * 1800);
        stars.push({
          key: 'st-' + index + '-' + i,
          style: 'left:' + pct(sx) + '%;top:' + pct(sy) + '%;'
            + 'width:' + ssize + 'rpx;height:' + ssize + 'rpx;'
            + 'animation-delay:-' + sd + 'ms;animation-duration:' + sdur + 'ms;'
        });
      }
    }
  });

  if (!items.length) return { active: false };

  /* 舞台整体切到深空底：来源装饰/目标全部隐藏，换成矢量场景 */
  if (cfg.hideAll === true) {
    hideDeco = true;
    hideTargets = true;
  }

  /* 静态矢量道具（例如坠落关的月面） */
  if (Array.isArray(cfg.props)) {
    cfg.props.forEach(function (rawProp, pi) {
      if (!rawProp || typeof rawProp.visual !== 'string') return;
      const srcProp = resolveRef(rawProp.ref, decoById, targetById);
      if (!srcProp) return;
      const psize = clamp(num(rawProp.size, 128), 16, 400);
      props.push({
        key: 'prop-' + pi,
        visual: rawProp.visual,
        style: 'left:' + pct(srcProp.x * 100) + '%;'
          + 'top:' + pct(srcProp.y * 100) + '%;'
          + 'width:' + psize + 'rpx;height:' + psize + 'rpx;'
      });
    });
  }

  /* 深空网格 + 星点：只给舞台内效果用 */
  if (space) {
    for (let i = 1; i < 12; i++) {
      grid.push({
        key: 'gv' + i,
        cls: 'fx-grid-line fx-grid-v',
        style: 'left:' + pct(i / 12 * 100) + '%;'
      });
    }
    for (let i = 1; i < 8; i++) {
      grid.push({
        key: 'gh' + i,
        cls: 'fx-grid-line fx-grid-h',
        style: 'top:' + pct(i / 8 * 100) + '%;'
      });
    }
    for (let i = 0; i < 26; i++) {
      const sx = 2 + rand(i * 131 + 27) * 96;
      const sy = 2 + rand(i * 137 + 28) * 96;
      const ssize = 2 + Math.round(rand(i * 139 + 29) * 5);
      const sd = Math.round(rand(i * 149 + 30) * 2200);
      const sdur = Math.round(1200 + rand(i * 151 + 31) * 1800);
      spaceStars.push({
        key: 'ss-' + i,
        style: 'left:' + pct(sx) + '%;top:' + pct(sy) + '%;'
          + 'width:' + ssize + 'rpx;height:' + ssize + 'rpx;'
          + 'animation-delay:-' + sd + 'ms;animation-duration:' + sdur + 'ms;'
      });
    }
  }

  const holdMs = clamp(num(cfg.holdMs, DEFAULT_HOLD_MS), 0, 5000);

  return {
    active: true,
    fullscreen: fullscreen,
    play: cfg.play === 'first' ? 'first' : 'always',
    holdMs: holdMs,
    persistHide: cfg.persistHide === true,
    effectEndMs: effectEndMs,
    totalMs: effectEndMs + holdMs + EXIT_MS + BUFFER_MS,
    hideDeco: hideDeco,
    hideTargets: hideTargets,
    items: items,
    ghosts: ghosts,
    particles: particles,
    shockwaves: shockwaves,
    flashes: flashes,
    craters: craters,
    props: props,
    grid: grid,
    spaceStars: spaceStars,
    space: space,
    stars: stars,
    shakeAtMs: shakeAtMs,
    rumbleMs: rumbleMs,
    captionDelayMs: captionDelayMs,
    captionStyle: captionDelayMs > 0
      ? 'animation-delay:' + captionDelayMs + 'ms;'
      : ''
  };
}

module.exports = {
  build: build,
  EXIT_MS: EXIT_MS,
  BUFFER_MS: BUFFER_MS,
  DEFAULT_HOLD_MS: DEFAULT_HOLD_MS
};
