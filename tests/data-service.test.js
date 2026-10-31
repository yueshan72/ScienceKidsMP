/* tests/data-service.test.js —— 数据层（本地优先 / 云端适配器）行为测试
 *
 * 覆盖：
 *   1. mode='local'：不创建云实例、不发起网络请求，所有操作落本地；
 *   2. mode='auto' 成功：云端结果覆盖本地，offline=false；
 *   3. mode='auto' 失败：本地结果保留，offline=true；
 *   4. 删除 / 撤回同意在云端失败时【不清本地】（fail-closed）。
 *
 * 跑法：node tests/data-service.test.js
 */
'use strict';

const store = new Map();
let cloudCreated = 0;
let cloudCalls = [];

global.tt = {
  getStorageSync: (k) => (store.has(k) ? store.get(k) : ''),
  setStorageSync: (k, v) => { store.set(k, v); },
  removeStorageSync: (k) => { store.delete(k); }
};

const Local = require('../miniprogram/utils/local-state.js');
const request = require('../miniprogram/utils/request.js');
const dataService = require('../miniprogram/utils/data-service.js');

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  [OK]   ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (extra ? '  → ' + extra : '')); }
}

function resetStore() { store.clear(); }
function resetCloudSpy() {
  cloudCreated = 0;
  cloudCalls = [];
}
function configureLocal() {
  request.configure({ enabled: false, envID: 'env-test', serviceID: 'svc-test' });
}
function configureAuto() {
  request.configure({ enabled: true, envID: 'env-test', serviceID: 'svc-test' });
}

/** 假云端：按 action 返回契约 §3 形状 */
function installFakeCloud() {
  global.tt.createCloud = function () {
    cloudCreated++;
    return {
      callContainer: function (opts) {
        const body = opts.init.body || {};
        cloudCalls.push({ path: opts.path, action: body.action });
        let data;
        switch (body.action) {
          case 'setAgeGroup':
            data = { ageGroup: body.ageGroup };
            break;
          case 'complete':
            data = {
              levelId: body.levelId, status: 'done', stars: 3,
              newBadges: ['badge_space'], isFirstComplete: true
            };
            break;
          case 'checkin':
            data = { date: '2026-10-27', streak: 5, isNew: true };
            break;
          case 'deleteData':
            data = { deleted: true };
            break;
          case 'withdrawConsent':
            data = { withdrawn: true };
            break;
          default:
            data = {};
        }
        opts.success({ statusCode: 200, data: { code: 0, data: data } });
      }
    };
  };
}
function uninstallCloud() {
  delete global.tt.createCloud;
}

async function run() {
  console.log('数据层测试');
  console.log('-'.repeat(56));

  /* ============ 1. mode='local'：不碰网络 ============ */
  console.log("\n[1] local 模式：不创建云实例、只落本地");
  resetStore();
  configureLocal();
  resetCloudSpy();
  installFakeCloud(); // 即使云能力“存在”，local 模式也不该用

  ok('cloudEnabled=false', dataService.cloudEnabled() === false);
  ok("mode()='local'", dataService.mode() === 'local');

  const ageR = await dataService.setAgeGroup('6-9');
  ok('setAgeGroup 返回 offline=false', ageR.offline === false);
  ok('本地年龄已写入', Local.getAgeGroup() === '6-9');

  const lvR = await dataService.completeLevel('rocket-1', 0, 'space');
  ok('completeLevel 本地判定 3 星', lvR.stars === 3, String(lvR.stars));
  ok('completeLevel offline=false', lvR.offline === false);

  const ckR = await dataService.checkin();
  ok('checkin isNew=true', ckR.isNew === true);
  ok('checkin offline=false', ckR.offline === false);

  ok('全程没有创建云实例', cloudCreated === 0, String(cloudCreated));
  ok('全程没有云调用', cloudCalls.length === 0, String(cloudCalls.length));

  /* ============ 2. auto 成功：云端结果覆盖 ============ */
  console.log("\n[2] auto 模式成功：云端结果为准");
  resetStore();
  resetCloudSpy();
  configureAuto();
  installFakeCloud();

  ok('cloudEnabled=true', dataService.cloudEnabled() === true);
  ok("mode()='auto'", dataService.mode() === 'auto');

  const a2 = await dataService.setAgeGroup('9-12');
  ok('云端 setAgeGroup offline=false', a2.offline === false);
  ok('本地镜像同步写入 9-12', Local.getAgeGroup() === '9-12');

  const lv2 = await dataService.completeLevel('rocket-1', 2, 'space');
  ok('云端覆盖星级为 3', lv2.stars === 3, String(lv2.stars));
  ok('云端徽章返回', (lv2.newBadges || []).indexOf('badge_space') !== -1);
  ok('云端调用带 action=complete',
    cloudCalls.some((c) => c.action === 'complete' && c.path === '/progress/index'));

  const ck2 = await dataService.checkin();
  ok('云端 streak=5 覆盖本地', ck2.streak === 5, String(ck2.streak));
  ok('云端 checkin offline=false', ck2.offline === false);

  const del2 = await dataService.deleteData();
  ok('deleteData 成功', del2.deleted === true);
  ok('本地数据已清空', Local.getAgeGroup() === null);

  Local.grantConsent();
  const wd2 = await dataService.withdrawConsent();
  ok('withdrawConsent 成功', wd2.withdrawn === true);
  ok('本地同意状态为已撤回', Local.getConsent().granted === false);

  /* ============ 3. auto 失败：本地保留 ============ */
  console.log("\n[3] auto 模式云端失败：本地结果保留");
  resetStore();
  resetCloudSpy();
  configureAuto();
  uninstallCloud(); // 让 request.call 抛错

  const warn = console.warn;
  console.warn = function () {}; // 预期内的失败日志，测试输出保持干净

  const a3 = await dataService.setAgeGroup('3-6');
  ok('失败时 offline=true', a3.offline === true);
  ok('本地年龄仍写入', Local.getAgeGroup() === '3-6');

  const ck3 = await dataService.checkin();
  ok('打卡失败 offline=true', ck3.offline === true);
  ok('本地打卡仍记录', Local.getCheckins().length === 1);

  let deleteThrew = false;
  try {
    await dataService.deleteData();
  } catch (e) {
    deleteThrew = true;
  }
  ok('删除失败会抛出（页面可提示）', deleteThrew === true);
  ok('删除失败不清本地年龄', Local.getAgeGroup() === '3-6');
  ok('删除失败不清本地打卡', Local.getCheckins().length === 1);

  let withdrawThrew = false;
  try {
    await dataService.withdrawConsent();
  } catch (e) {
    withdrawThrew = true;
  }
  ok('撤回失败会抛出', withdrawThrew === true);
  ok('撤回失败不清本地数据', Local.getAgeGroup() === '3-6');

  console.warn = warn;

  /* ============ 4. 切回 local 后彻底离线 ============ */
  console.log("\n[4] 从 auto 切回 local：不再发起云调用");
  resetCloudSpy();
  installFakeCloud();
  configureLocal();
  const a4 = await dataService.setAgeGroup('6-9');
  ok('切回后 offline=false', a4.offline === false);
  ok('切回后不再创建云实例', cloudCreated === 0, String(cloudCreated));
  ok('切回后无云调用', cloudCalls.length === 0, String(cloudCalls.length));

  uninstallCloud();
  configureLocal();

  console.log('\n' + '-'.repeat(56));
  console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  process.exit(fail === 0 ? 0 : 1);
}

run().catch(function (e) {
  console.error('测试执行异常：', e);
  process.exit(1);
});
