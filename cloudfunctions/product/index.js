// cloudfunctions/product —— 精选联盟商品（预留契约，V1.0 不实现、不部署）
// 契约：docs/接口契约.md §3.4 范围决策（学生主体无法满足精选联盟准入门槛）
//
// 保留本文件的作用是让「预留契约」有明确归宿；部署时跳过这个目录。
// 未来若主体条件具备，按契约 §3.4 的入参/出参实现即可，前端无需改动。

'use strict';

module.exports = async function (params, context) {
  return {
    code: 4002,
    message: 'V1.0 不接入精选联盟',
    data: null
  };
};
