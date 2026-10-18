/* tests/interaction.test.js —— 真机交互引擎（miniprogram/utils/interaction.js）行为测试
 *
 * 背景：prototypes/test_engine.js 的 26 项测试测的是【原型 DOM 版】；
 *       真机跑的是另一份纯状态机。两份代码逻辑一致，但测试不能互相代替。
 *       本文件把同一组行为断言迁移到真机版。
 *
 * 跑法：node tests/interaction.test.js
 * 退出码：0 = 全过；1 = 有失败项
 *
 * 测试配置是编造的通用配置，不含任何真实关卡名 —— 顺带证明引擎与关卡无关。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ENGINE_PATH = path.join(__dirname, '..', 'miniprogram', 'utils', 'interaction.js');
const Interaction = require(ENGINE_PATH);

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  [OK]   ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (extra ? '  → ' + extra : '')); }
}

/* 通用配置：2 个正确目标 + 1 个错误目标，要中 2 个 */
function cfg() {
  return {
    type: 'click',
    version: 1,
    prompt: 'p',
    successText: 's',
    failText: '这个不对哦',
    props: {
      targets: [
        { id: 'a', label: 'A', icon: '🅰', x: 0.2, y: 0.2, isCorrect: true },
        { id: 'b', label: 'B', x: 0.8, y: 0.2, isCorrect: true },
        { id: 'x', label: 'X', x: 0.5, y: 0.6, isCorrect: false }
      ],
      requiredHits: 2
    }
  };
}

function byId(st, id) {
  return st.targets.filter((t) => t.id === id)[0];
}

console.log('真机交互引擎行为测试 · ' + path.relative(process.cwd(), ENGINE_PATH));
console.log('-'.repeat(60));

/* ================= 1. 装配 ================= */
console.log('\n[1] 装配');
const st = Interaction.init(cfg());
ok('init 返回状态对象', !!st && !st.error);
ok('type = click', st.type === 'click');
ok('初始 state = playing', st.state === 'playing');
ok('requiredHits 读入（2）', st.need === 2, '实际 ' + st.need);
ok('初始 hits / wrongCount = 0', st.hits === 0 && st.wrongCount === 0);
ok('目标全部生成（3 个）', st.targets.length === 3, '实际 ' + st.targets.length);
ok('target 保留表现层字段', byId(st, 'a').label === 'A' && byId(st, 'a').icon === '🅰');
ok('target 初始未命中', st.targets.every((t) => t.hit === false && t.wrong === false));

/* ================= 2. 坐标（G2：中心点，0~1 归一化） ================= */
console.log('\n[2] 坐标');
ok('0.2 → left:20%;top:20%;',
  byId(st, 'a').styleStr === 'left:20%;top:20%;', byId(st, 'a').styleStr);
ok('0.8 / 0.2 各自换算',
  byId(st, 'b').styleStr === 'left:80%;top:20%;', byId(st, 'b').styleStr);

/* ================= 3. 点错：宽容模式（G3） ================= */
console.log('\n[3] 点错（G3 宽容模式）');
const miss1 = Interaction.tap(st, 'x');
ok('点错 changed=true / miss=true', miss1.changed && miss1.miss && !miss1.success);
ok('state 变为 wrong', st.state === 'wrong');
ok('wrongCount = 1', st.wrongCount === 1, '实际 ' + st.wrongCount);
ok('错误目标带 wrong 标记', byId(st, 'x').wrong === true);
ok('点错不增加 hits', st.hits === 0);
ok('wrong 态内再点被忽略', Interaction.tap(st, 'a').changed === false);
ok('recover 回到 playing', Interaction.recover(st) === true && st.state === 'playing');
ok('recover 清除 wrong 标记', byId(st, 'x').wrong === false);
ok('recover 不清零 hits / wrongCount', st.hits === 0 && st.wrongCount === 1);
ok('非 wrong 态调用 recover 返回 false', Interaction.recover(st) === false);
ok('未知 targetId 不产生变化', Interaction.tap(st, 'nope').changed === false);

/* ================= 4. 幂等点击（G4） ================= */
console.log('\n[4] 重复点击（G4）');
const hitA = Interaction.tap(st, 'a');
ok('第一次点 A：hits=1，未通关', hitA.changed && !hitA.success && st.hits === 1);
ok('同一目标连点 3 次仍只计 1 次',
  Interaction.tap(st, 'a').changed === false &&
  Interaction.tap(st, 'a').changed === false &&
  st.hits === 1);
ok('A 带 hit 标记', byId(st, 'a').hit === true);

/* ================= 5. 通关 ================= */
console.log('\n[5] 通关');
const hitB = Interaction.tap(st, 'b');
ok('第 2 个目标触发 success', hitB.changed && hitB.success);
ok('state = success', st.state === 'success');
ok('hits = need = 2', st.hits === 2);
ok('wrongCount 保留（结算要用）', st.wrongCount === 1);
ok('通关后点错误目标无效', Interaction.tap(st, 'x').changed === false);
ok('通关后 recover 返回 false', Interaction.recover(st) === false);

/* ================= 6. 重置 ================= */
console.log('\n[6] 重置');
const fresh = Interaction.reset(cfg());
ok('reset 得到全新的 playing 状态', fresh.state === 'playing' && fresh.hits === 0);
ok('reset 后无 hit/wrong 残留',
  fresh.targets.every((t) => !t.hit && !t.wrong));
ok('reset 不共享旧对象', fresh !== st);
const again = Interaction.tap(fresh, 'a');
ok('重置后可以重新计数', again.changed && fresh.hits === 1);

/* ================= 7. 降级与边界（G5） ================= */
console.log('\n[7] 降级与边界（G5）');
ok('空配置 → 明确错误',
  !!Interaction.init(null).error);
ok('未知 version → 明确错误（不抛异常）',
  (Interaction.init({ type: 'click', version: 99, props: {} }).error || '').indexOf('版本') !== -1);
ok('未实现类型 → 明确错误（不抛异常）',
  (Interaction.init({ type: 'drag', version: 1, props: {} }).error || '').indexOf('交互类型') !== -1);
ok('缺 requiredHits 时默认为 1',
  Interaction.init({ type: 'click', version: 1, props: { targets: [] } }).need === 1);
const edge = Interaction.init({
  type: 'click', version: 1,
  props: { targets: [{ id: 'p', x: 0, y: 1, isCorrect: true }], requiredHits: 1 }
});
ok('坐标 0 / 1 边界换算正确',
  edge.targets[0].styleStr === 'left:0%;top:100%;', edge.targets[0].styleStr);

/* ================= 8. 引擎与关卡无关 ================= */
console.log('\n[8] 引擎与关卡无关');
const src = fs.readFileSync(ENGINE_PATH, 'utf8');
ok('源码不含关卡专有词',
  !/rocket|meteor|点火|陨石|月球/i.test(src));
ok('源码不按 levelId 分支',
  !/levelId/.test(src));

console.log('-'.repeat(60));
console.log('共 ' + (pass + fail) + ' 项，' + (fail === 0 ? '全部通过' : fail + ' 项失败'));
process.exit(fail ? 1 : 0);
