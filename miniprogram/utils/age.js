/* utils/age.js —— 年龄段常量与主题映射（单一来源）
 *
 * 之前 index / topic / level / mine 四个页面各写了一份，改一处容易漏三处。
 * 6-9 岁暂继承暖色：主题只是 token 覆盖，日后要单独一套只改这里。
 */
'use strict';

const AGE_THEME = { '3-6': 'warm', '6-9': 'warm', '9-12': 'cool' };
const AGE_LABEL = { '3-6': '3-6 岁', '6-9': '6-9 岁', '9-12': '9-12 岁' };
const AGE_OPTIONS = [
  { value: '3-6', label: '3-6 岁 · 学前' },
  { value: '6-9', label: '6-9 岁 · 低年级' },
  { value: '9-12', label: '9-12 岁 · 高年级' }
];

function themeOf(ageGroup) {
  return AGE_THEME[ageGroup] || 'cool';
}

function labelOf(ageGroup) {
  return AGE_LABEL[ageGroup] || '未选择';
}

module.exports = {
  AGE_THEME: AGE_THEME,
  AGE_LABEL: AGE_LABEL,
  AGE_OPTIONS: AGE_OPTIONS,
  themeOf: themeOf,
  labelOf: labelOf
};
