/* utils/local-state.js —— 本地状态（演示模式 / 云环境未就绪时的唯一数据源）
 *
 * 与云函数的关系：
 *   云环境就绪后，pages 经 utils/data-service.js 优先走云函数；
 *   云未配置或请求失败时回落到这里。两者的【数据形状】与契约一致，
 *   所以页面代码不需要写两套。
 *
 * 存储键统一以 sci. 开头，便于「删除我的数据 / 撤回同意」一次性清理。
 */
'use strict';

const DateUtil = require('./date.js');

const KEYS = {
  age: 'sci.ageGroup',
  progress: 'sci.progress',
  badges: 'sci.badges',
  checkins: 'sci.checkins',
  consent: 'sci.consent',
  favorites: 'sci.favorites',
  likes: 'sci.likes'
};

const BADGE_SPACE = {
  badgeId: 'badge_space',
  name: '太空探索者',
  icon: '🏅'
};

const ALLOWED_AGE = ['3-6', '6-9', '9-12'];

/** 存储被写坏时的安全取值：对象 / 数组 */
function asObject(v) {
  return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function read(key, fallback) {
  try {
    const v = tt.getStorageSync(key);
    return (v === '' || v === undefined || v === null) ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

function write(key, value) {
  try { tt.setStorageSync(key, value); } catch (e) { /* 存储不可用时只影响持久化 */ }
}

function remove(key) {
  try { tt.removeStorageSync(key); } catch (e) { /* ignore */ }
}

const LocalState = {
  KEYS: KEYS,
  BADGE_SPACE: BADGE_SPACE,

  /* ---------------- 年龄段 ---------------- */
  getAgeGroup() {
    const v = read(KEYS.age, null);
    return ALLOWED_AGE.indexOf(v) !== -1 ? v : null;
  },

  setAgeGroup(ageGroup) {
    if (!ageGroup) { remove(KEYS.age); return; }
    if (ALLOWED_AGE.indexOf(ageGroup) === -1) return;
    write(KEYS.age, ageGroup);
  },

  /* ---------------- 闯关进度 ---------------- */
  getProgress() {
    return asObject(read(KEYS.progress, {}));
  },

  getLevelProgress(levelId) {
    const all = this.getProgress();
    return all[levelId] || null;
  },

  /**
   * 记录通关（幂等）。
   * @param {string} levelId
   * @param {number} wrongCount 点错次数（仅演示模式用于算星；云端由服务端判定）
   * @param {string[]} allLevelIds 本主题全部关卡（用于徽章判定）
   * @param {string} topicId
   */
  completeLevel(levelId, wrongCount, allLevelIds, topicId) {
    const all = this.getProgress();
    if (all[levelId] && all[levelId].status === 'done') {
      return Object.assign({}, all[levelId], {
        newBadges: [],
        isFirstComplete: false
      });
    }

    let wc = Number(wrongCount);
    if (!isFinite(wc) || wc < 0) wc = 0;
    if (wc > 99) wc = 99;
    const stars = wc === 0 ? 3 : (wc === 1 ? 2 : 1);
    all[levelId] = {
      levelId: levelId,
      topicId: topicId || 'space',
      status: 'done',
      stars: stars,
      completedAt: Date.now()
    };
    write(KEYS.progress, all);

    const newBadges = [];
    if (allLevelIds && allLevelIds.length) {
      const done = allLevelIds.filter((id) => all[id] && all[id].status === 'done');
      if (done.length === allLevelIds.length && this.awardBadge(BADGE_SPACE)) {
        newBadges.push(BADGE_SPACE.badgeId);
      }
    }

    return Object.assign({}, all[levelId], {
      newBadges: newBadges,
      isFirstComplete: true
    });
  },

  doneCountOf(levelIds) {
    const all = this.getProgress();
    return (levelIds || []).filter((id) => all[id] && all[id].status === 'done').length;
  },

  resetProgress() {
    remove(KEYS.progress);
  },

  /* ---------------- 徽章 ---------------- */
  getBadges() {
    return asArray(read(KEYS.badges, []));
  },

  /** 幂等发徽章；返回是否本次新得 */
  awardBadge(badge) {
    const list = this.getBadges();
    if (list.some((b) => b.badgeId === badge.badgeId)) return false;
    list.push({
      badgeId: badge.badgeId,
      name: badge.name,
      icon: badge.icon || '',
      earnedAt: Date.now()
    });
    write(KEYS.badges, list);
    return true;
  },

  /* ---------------- 打卡 ---------------- */
  getCheckins() {
    return asArray(read(KEYS.checkins, [])).filter(function (d) {
      return typeof d === 'string';
    });
  },

  /** 今日打卡（幂等）。返回契约 §3.3 的出参形状 */
  checkinToday() {
    const today = DateUtil.dateStrCN();
    const list = this.getCheckins();
    const isNew = list.indexOf(today) === -1;
    if (isNew) {
      list.push(today);
      list.sort();
      write(KEYS.checkins, list);
    }
    return {
      date: today,
      streak: DateUtil.calcStreak(list, today),
      isNew: isNew
    };
  },

  /** 连续天数 + 最近 30 天日历（契约 §3.3 getStreak） */
  getStreak() {
    const list = this.getCheckins();
    const sorted = list.slice().sort();
    return {
      streak: DateUtil.calcStreak(list),
      lastDate: sorted.length ? sorted[sorted.length - 1] : null,
      calendar: DateUtil.calendar(30, list)
    };
  },

  /* ---------------- 监护人同意 ---------------- */
  getConsent() {
    const c = asObject(read(KEYS.consent, null));
    return {
      granted: !!(c.grantedAt && !c.withdrawnAt),
      grantedAt: c.grantedAt || null,
      withdrawnAt: c.withdrawnAt || null
    };
  },

  grantConsent() {
    write(KEYS.consent, { grantedAt: Date.now(), withdrawnAt: null });
  },

  /**
   * 撤回同意：停止处理并清空已采集的数据。
   * 保留一条 withdrawnAt 记录，用于页面显示「已撤回」状态。
   */
  withdrawConsent() {
    this.clearUserData();
    write(KEYS.consent, { grantedAt: null, withdrawnAt: Date.now() });
  },

  /* ---------------- 收藏（V1.0 仅本地；契约尚无收藏云函数） ---------------- */
  getFavorites() {
    return asArray(read(KEYS.favorites, [])).filter(function (d) {
      return typeof d === 'string';
    });
  },

  isFavorite(contentId) {
    return this.getFavorites().indexOf(contentId) !== -1;
  },

  toggleFavorite(contentId) {
    const list = this.getFavorites();
    const i = list.indexOf(contentId);
    if (i === -1) list.push(contentId); else list.splice(i, 1);
    write(KEYS.favorites, list);
    return i === -1;
  },

  /* ---------------- 点赞（V1.0 仅本地；契约尚无点赞云函数） ---------------- */
  getLikes() {
    return asArray(read(KEYS.likes, [])).filter(function (d) {
      return typeof d === 'string';
    });
  },

  isLiked(contentId) {
    return this.getLikes().indexOf(contentId) !== -1;
  },

  toggleLike(contentId) {
    const list = this.getLikes();
    const i = list.indexOf(contentId);
    if (i === -1) list.push(contentId); else list.splice(i, 1);
    write(KEYS.likes, list);
    return i === -1;
  },

  /* ---------------- 删除我的数据 ---------------- */
  /** 删除闯关/徽章/打卡/收藏/点赞/年龄段，保留同意记录 */
  clearUserData() {
    remove(KEYS.age);
    remove(KEYS.progress);
    remove(KEYS.badges);
    remove(KEYS.checkins);
    remove(KEYS.favorites);
    remove(KEYS.likes);
  },

  deleteAllData() {
    this.clearUserData();
    remove(KEYS.consent);
  }
};

module.exports = LocalState;
