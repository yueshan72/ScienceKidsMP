/* tests/run-all.js —— 一次跑完全部测试
 *
 * 跑法：node tests/run-all.js
 * 任一子测试失败 → 退出码非 0。
 */
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const files = ['interaction.test.js', 'local-state.test.js'];
let exitCode = 0;
let failedFiles = [];

for (const f of files) {
  console.log('\n>>> ' + f);
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], {
    stdio: 'inherit'
  });
  if (r.status !== 0) {
    exitCode = r.status || 1;
    failedFiles.push(f);
  }
}

console.log('\n' + '='.repeat(60));
if (exitCode === 0) {
  console.log('全部测试通过');
} else {
  console.log('失败的测试文件：' + failedFiles.join(', '));
}
process.exit(exitCode);
