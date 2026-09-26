// pages/level/level.js —— 闯关详情页（互动实验）
// 依据：《需求文档》4.3 互动实验闯关（核心留存）
// 交互方式：孩子通过「点击 / 拖拽 / 选择」完成互动实验

const { call } = require('../../utils/request');

Page({
  data: {
    levelId: null,
    level: null,       // 关卡信息（levels 集合，见 接口契约 §4）
    status: 'todo',    // todo | done
    stars: 0,
    newBadge: null,    // 全部通关时下发太空徽章（《需求文档》4.3）
  },

  onLoad(query) {
    this.setData({ levelId: query.levelId || null });
    this.fetchLevel();
  },

  fetchLevel() {
    // TODO(S2)：按 levelId 取关卡定义（含 interactionConfig，见 接口契约 §3.2 / §5）
    // TODO(S1)：interactionConfig 的结构需前端 + 设计共同定义（接口契约 §7 待办）
    console.log('load level', this.data.levelId);
  },

  /**
   * 关卡完成 —— 交互做完后调用
   * 注意：奖励发放必须走云函数，前端不可信（接口契约 §3.2）
   * 云函数必须幂等：重复调用同一关卡不重复发星、不重复发徽章
   */
  onComplete() {
    // TODO(S2)：
    //   call('progress', 'complete', { levelId: this.data.levelId })
    //     .then(({ stars, newBadges }) => ...)
    console.log('complete level', this.data.levelId);
  },

  onBack() {
    tt.navigateBack();
  },
});
