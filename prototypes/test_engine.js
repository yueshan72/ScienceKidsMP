/* test_engine.js —— 交互引擎行为测试
 *
 * 在 Node 里用最小 DOM 垫片驱动 js/interaction.js 的状态机，验证
 * 「点错 / 重复点 / 通关 / 重置 / 版本降级」这几条核心逻辑真的对，
 * 而不是只靠肉眼看代码。
 *
 * 跑法：  node test_engine.js
 * 退出码：0 = 全过；1 = 有失败项
 *
 * 这里用的关卡配置是【编造的通用配置】，故意不含任何真实关卡名——
 * 顺带也证明了引擎确实不认识具体关卡。
 */
'use strict';

const fs = require('fs');
const path = require('path');

/* ---------- 最小 DOM 垫片 ---------- */
function makeEl(tag) {
  const el = {
    tagName: tag,
    className: '',
    textContent: '',
    style: {},
    children: [],
    _cls: new Set(),
    _lis: {},
    _attr: {},
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(t, f) { (this._lis[t] = this._lis[t] || []).push(f); },
    dispatch(t) { (this._lis[t] || []).forEach((f) => f({ target: this })); },
    setAttribute(k, v) { this._attr[k] = v; },
    getAttribute(k) { return this._attr[k]; },
  };
  el.classList = {
    add: (...cs) => { cs.forEach((c) => el._cls.add(c)); },
    remove: (...cs) => { cs.forEach((c) => el._cls.delete(c)); },
    contains: (c) => el._cls.has(c),
  };
  return el;
}
global.document = { createElement: makeEl };

/* ---------- 载入引擎 ---------- */
const ENGINE = path.join(__dirname, 'js', 'interaction.js');
const tmp = path.join(require('os').tmpdir(), 'engine_under_test.js');
fs.writeFileSync(tmp, fs.readFileSync(ENGINE, 'utf8') + '\nmodule.exports = Interaction;');
const Interaction = require(tmp);

/* ---------- 测试框架 ---------- */
let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  [OK]  ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (extra ? '  → ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 通用配置：2 个正确目标 + 1 个错误目标，要中 2 个 */
function cfg() {
  return {
    type: 'click', version: 1,
    prompt: 'p', successText: 's', failText: '这个不对哦',
    props: {
      targets: [
        { id: 'a', label: 'A', x: 0.2, y: 0.2, isCorrect: true },
        { id: 'b', label: 'B', x: 0.8, y: 0.2, isCorrect: true },
        { id: 'x', label: 'X', x: 0.5, y: 0.6, isCorrect: false },
      ],
      requiredHits: 2,
    },
  };
}

const targetsOf = (s) => s.children.filter((c) => c.className === 'stage-target');
const hintOf = (s) => s.children.find((c) => c.className.indexOf('stage-hint') === 0);

(async function run() {
  console.log('交互引擎行为测试 · ' + path.relative(process.cwd(), ENGINE));
  console.log('-'.repeat(56));

  /* --- 1. 装配 --- */
  const stage = makeEl('view');
  const successes = [];
  let misses = 0;
  const engine = Interaction.create(stage, cfg(), {
    onSuccess: (r) => successes.push(r),
    onMiss: () => misses++,
  });

  ok('装配成功，目标全部渲染', targetsOf(stage).length === 3,
    '实际 ' + targetsOf(stage).length);
  ok('初始状态为 playing', engine.getState() === 'playing');

  const [A, B, X] = targetsOf(stage);

  /* --- 2. 点错：宽容模式（缺口 G3） --- */
  X.dispatch('click');
  const hint = hintOf(stage);
  ok('点错后状态变为 wrong', engine.getState() === 'wrong');
  ok('失败提示显示出来', !hint.classList.contains('is-hidden'));
  ok('失败提示文案来自配置', hint.textContent === '这个不对哦', hint.textContent);
  ok('点错的目标带 is-wrong 类', X.classList.contains('is-wrong'));
  ok('点错不会误判为通关', successes.length === 0);
  ok('点错触发 onMiss 一次', misses === 1, '实际 ' + misses);

  /* --- 3. 失败自动恢复，且不清零 --- */
  await sleep(1150);
  ok('1 秒后自动回到 playing', engine.getState() === 'playing',
    '实际 ' + engine.getState());
  ok('提示已隐藏', hint.classList.contains('is-hidden'));
  ok('is-wrong 已清除', !X.classList.contains('is-wrong'));

  /* --- 4. 幂等：同一目标连点不重复计数（缺口 G4） --- */
  A.dispatch('click');
  A.dispatch('click');
  A.dispatch('click');
  ok('同一目标连点 3 次只计 1 次（未通关）', successes.length === 0,
    '若能重复计数，1 次点击就会通关');
  ok('已点目标带 is-hit 类', A.classList.contains('is-hit'));

  /* --- 5. 通关 --- */
  B.dispatch('click');
  ok('点中第 2 个目标后通关', successes.length === 1);
  ok('通关后状态为 success', engine.getState() === 'success');
  ok('onSuccess 带回 wrongCount=1', successes[0].wrongCount === 1,
    JSON.stringify(successes[0]));
  ok('舞台带上 is-success 类', stage.classList.contains('is-success'));

  /* --- 6. 通关后不再响应 --- */
  X.dispatch('click');
  A.dispatch('click');
  ok('通关后再点不产生新结算',
    successes.length === 1 && engine.getState() === 'success');

  /* --- 7. 重置 --- */
  engine.reset();
  ok('重置后状态回到 playing', engine.getState() === 'playing');
  ok('重置后 is-hit 已清除', !A.classList.contains('is-hit'));
  ok('重置后 is-success 已清除', !stage.classList.contains('is-success'));
  B.dispatch('click');
  A.dispatch('click');
  ok('重置后可以重新通关', successes.length === 2);

  /* --- 8. 版本与类型降级（缺口 G5） --- */
  const s2 = makeEl('view');
  const w2 = [];
  const r2 = Interaction.create(s2, { type: 'click', version: 99, props: {} },
    { onWarn: (c, v) => w2.push([c, v]) });
  ok('未知 version 不白屏、返回 null', r2 === null);
  ok('未知 version 触发上报', w2.length === 1 && w2[0][0] === 'unsupported-version');

  const s3 = makeEl('view');
  const w3 = [];
  const r3 = Interaction.create(s3, { type: 'drag', version: 1, props: {} },
    { onWarn: (c, v) => w3.push([c, v]) });
  ok('未实现的类型优雅降级（不抛异常）',
    r3 === null && w3[0] && w3[0][0] === 'unsupported-type');

  /* --- 9. 引擎确实与关卡无关 --- */
  const src = fs.readFileSync(ENGINE, 'utf8');
  ok('引擎源码不含任何关卡专有词',
    !/rocket|meteor|点火|陨石|月球/i.test(src));

  console.log('-'.repeat(56));
  console.log('共 ' + (pass + fail) + ' 项，' +
    (fail === 0 ? '全部通过' : fail + ' 项失败'));
  process.exit(fail ? 1 : 0);
})();
