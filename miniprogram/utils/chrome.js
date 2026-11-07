/* utils/chrome.js —— 原生导航栏 / tabBar 跟随年龄主题
 *
 * 背景：app.json 里的导航栏和 tabBar 是固定深空色，3-6 / 6-9 的暖色
 *       页面上会出现两条深色边。这里在页面 onShow 时用运行时 API 改色。
 *
 * 注意：
 *   - frontColor 只能是 #ffffff / #000000；
 *   - setTabBarStyle 只能在有 tabBar 的页面调用（首页 / 我的），
 *     其它页面不要传 tabBar: true；
 *   - API 不存在或调用失败时静默跳过，不影响页面。
 */
'use strict';

const THEMES = {
  warm: {
    navBg: '#FFF8EE',
    navFront: '#000000',
    tabBg: '#FFF8EE',
    tabColor: '#8A7A66',
    tabSelected: '#FF8A3D',
    tabBorder: 'white'
  },
  cool: {
    navBg: '#0B1026',
    navFront: '#ffffff',
    tabBg: '#0B1026',
    tabColor: '#8A93B8',
    tabSelected: '#4EA1FF',
    tabBorder: 'black'
  }
};

function get(theme) {
  return THEMES[theme] || THEMES.cool;
}

/**
 * 应用主题到原生导航栏和（可选）tabBar。
 * @param {string} theme 'warm' | 'cool'
 * @param {Object} [opts] { tabBar: true } 时同时改 tabBar
 */
function apply(theme, opts) {
  if (typeof tt === 'undefined') return;
  const t = get(theme);

  if (typeof tt.setNavigationBarColor === 'function') {
    try {
      tt.setNavigationBarColor({
        frontColor: t.navFront,
        backgroundColor: t.navBg,
        fail: function () { /* 无导航栏的页面忽略 */ }
      });
    } catch (e) { /* ignore */ }
  }

  if (opts && opts.tabBar && typeof tt.setTabBarStyle === 'function') {
    try {
      tt.setTabBarStyle({
        color: t.tabColor,
        selectedColor: t.tabSelected,
        backgroundColor: t.tabBg,
        borderStyle: t.tabBorder,
        fail: function () { /* 非 tab 页会失败，忽略 */ }
      });
    } catch (e) { /* ignore */ }
  }
}

module.exports = {
  apply: apply,
  get: get
};
