/* app.js —— 页面装配
 *
 * 对应真机上的 app.js + Page({ data, methods })。
 * 本文件里的 actions 对象 == 真机的 bindtap 处理器表：
 *     data-tap="pickAge"  ←→  bindtap="onPickAge"
 * 一一对应，移植时是纯改名。
 */
(function () {
  'use strict';

  /* 三档年龄 → 两套主题。6-9 暂继承暖色。
   * 因为主题只是 token overlay，日后要给它单独一套，加一段 CSS 即可，布局不动。 */
  var AGE_THEME = { '3-6': 'warm', '6-9': 'warm', '9-12': 'cool' };
  var AGE_LABEL = { '3-6': '3-6 岁', '6-9': '6-9 岁', '9-12': '9-12 岁' };

  var LS_KEY = 'sci.ageGroup';

  /* 模拟云数据库 progress 集合的 (openid, levelId) 联合唯一索引。
   * 真机上这段整个不存在——幂等由云函数 + 唯一索引保证（契约 §3.2）。 */
  var MOCK_DONE = {};

  function $(id) { return document.getElementById(id); }

  var App = {
    page: document.body.getAttribute('data-page'),  // 'index' | 'level'
    ageGroup: null,
    theme: 'cool',
    engine: null,
    levelId: null,

    /* ---------------- 生命周期 ---------------- */
    init: function () {
      var q = new URLSearchParams(location.search);

      /* 优先读 URL 参数（file:// 下 localStorage 可能被禁用），
         其次读 localStorage。这样哪怕存储不可用，跨页主题也不会丢。 */
      this.ageGroup = q.get('age') || this.restore();

      this.applyTheme();
      this.syncAgeText();

      if (this.page === 'index') {
        this.renderContent();
        this.renderShop();
      } else if (this.page === 'topic') {
        this.renderTopic();
      } else {
        this.renderLevel(q.get('id') || firstLevelId());
      }

      this.bindTap();
      this.bindProto();

      /* 《需求文档》4.1：首次进入必须选年龄段。
         已有选择时不再弹，但可随时由「修改」重开。 */
      if (!this.ageGroup) this.show($('agePicker'));
    },

    /* ---------------- 分龄与主题 ---------------- */

    /* 改主题的唯一入口。同时驱动配色、年龄段文案、内容流过滤，
       避免三处状态各自为政导致不同步。 */
    setAge: function (age) {
      this.ageGroup = age;
      this.applyTheme();
      this.syncAgeText();
      this.persist();

      if (this.page === 'index') {
        this.renderContent();
        this.renderShop();
        this.hide($('agePicker'));
      }
    },

    /* 年龄段文案的唯一出口。init 和 setAge 都要调——
       之前只在 setAge 里更新，导致带 ?age= 进来时显示「未选择」。 */
    syncAgeText: function () {
      var t = $('ageText');
      if (!t) return;
      t.textContent = this.ageGroup
        ? (AGE_LABEL[this.ageGroup] || this.ageGroup)
        : '未选择';
    },

    /* 主题 class 挂在 #root 上，而不是 #page。
       原因：CSS 变量只向下继承，而弹窗是 .page 的兄弟节点不是子节点，
       挂在 .page 上弹窗就读不到 --c-surface / --c-mask，背景会透明。
       转 .ttml 时，弹窗会移进根 view 内部，届时挂在根 view 上即可。 */
    applyTheme: function () {
      App.theme = AGE_THEME[this.ageGroup] || 'cool';
      $('root').className = 'phone theme-' + App.theme;
      this.syncProtoButtons();
    },

    restore: function () {
      try { return localStorage.getItem(LS_KEY) || null; } catch (e) { return null; }
    },
    persist: function () {
      try { localStorage.setItem(LS_KEY, this.ageGroup || ''); } catch (e) { /* 忽略 */ }
    },

    /* ---------------- 首页 ---------------- */

    renderContent: function () {
      var box = $('contentList');
      if (!box) return;

      var age = this.ageGroup;
      var list = DATA.contents.filter(function (c) {
        return !age || c.ageGroup === age;   /* 分龄过滤；未选年龄段时不过滤 */
      });

      box.innerHTML = '';

      if (!list.length) {
        box.appendChild(textBlock('这个年龄段的内容还在做，先看看别的吧～', 'hint card'));
        return;
      }

      list.forEach(function (c) {
        var card = document.createElement('view');
        card.className = 'video-card';

        var title = document.createElement('text');
        title.className = 'video-title';
        title.textContent = c.title;
        card.appendChild(title);

        /* 《需求文档》§9.2：争议性话题须标注「科学假设 / 未定论」 */
        if (c.disputed) {
          var d = document.createElement('view');
          d.className = 'disclaimer';
          d.textContent = '⚠️ 这一集涉及科学假设，尚无定论，和孩子一起讨论看看。';
          card.appendChild(d);
        }

        var foot = document.createElement('view');
        foot.className = 'video-foot';

        var dur = document.createElement('text');
        dur.textContent = Math.floor(c.duration / 60) + '′' + (c.duration % 60) + '″';
        foot.appendChild(dur);

        /* 《需求文档》§9.1：带货内容必须显著标识 */
        if (c.adProduct) {
          var ad = document.createElement('text');
          ad.className = 'ad-mark';
          ad.textContent = '推广';
          foot.appendChild(ad);
        }

        card.appendChild(foot);
        box.appendChild(card);
      });
    },

    renderShop: function () {
      var box = $('shopList');
      if (!box) return;
      box.innerHTML = '';

      DATA.shop.forEach(function (p) {
        var card = document.createElement('view');
        card.className = 'shop-card';

        var name = document.createElement('text');
        name.className = 'shop-name';
        name.textContent = p.name;
        card.appendChild(name);

        /* 商品位必须带「推广」标识 —— 即便 V1.0 不接精选联盟、
           数据是静态占位，标识也不能省（契约 §3.4 范围决策）。 */
        var ad = document.createElement('text');
        ad.className = 'ad-mark';
        ad.textContent = '推广';
        card.appendChild(ad);

        box.appendChild(card);
      });
    },

    /* ---------------- 主题页 ---------------- */

    renderTopic: function () {
      var age = this.ageGroup;
      var self = this;

      /* 科普视频：按主题 + 年龄段过滤 */
      var box = $('videoList');
      box.innerHTML = '';
      var videos = DATA.contents.filter(function (c) {
        return c.topicId === 'space' && c.type === 'video' && (!age || c.ageGroup === age);
      });

      if (!videos.length) {
        box.appendChild(textBlock('这个年龄段的视频还在做，先玩玩下面的实验吧～', 'hint card'));
      } else {
        videos.forEach(function (c) {
          var card = document.createElement('view');
          card.className = 'video-card';

          var title = document.createElement('text');
          title.className = 'video-title';
          title.textContent = c.title;
          card.appendChild(title);

          if (c.disputed) {
            var d = document.createElement('view');
            d.className = 'disclaimer';
            d.textContent = '⚠️ 这一集涉及科学假设，尚无定论，和孩子一起讨论看看。';
            card.appendChild(d);
          }

          var foot = document.createElement('view');
          foot.className = 'video-foot';
          var dur = document.createElement('text');
          dur.textContent = Math.floor(c.duration / 60) + '′' + (c.duration % 60) + '″';
          foot.appendChild(dur);
          if (c.adProduct) {
            var ad = document.createElement('text');
            ad.className = 'ad-mark';
            ad.textContent = '推广';
            foot.appendChild(ad);
          }
          card.appendChild(foot);
          box.appendChild(card);
        });
      }

      /* 关卡列表：本主题的全部关卡，带通关状态 */
      var lbox = $('levelList');
      lbox.innerHTML = '';
      var levels = Object.keys(DATA.levels)
        .map(function (k) { return DATA.levels[k]; })
        .filter(function (lv) { return lv.topicId === 'space'; })
        .sort(function (a, b) { return a.order - b.order; });

      var done = 0;
      levels.forEach(function (lv) {
        var isDone = !!MOCK_DONE[lv._id];
        if (isDone) done++;

        var item = document.createElement('view');
        item.className = 'level-item' + (isDone ? ' is-done' : '');
        item.setAttribute('data-tap', 'tapLevel');
        item.setAttribute('data-id', lv._id);

        var order = document.createElement('text');
        order.className = 'level-order';
        order.textContent = lv.order;
        item.appendChild(order);

        var main = document.createElement('view');
        main.className = 'level-main';
        var nm = document.createElement('text');
        nm.className = 'level-name';
        nm.textContent = lv.name;
        var pt = document.createElement('text');
        pt.className = 'level-point';
        pt.textContent = lv.sciencePoint;
        main.appendChild(nm);
        main.appendChild(pt);
        item.appendChild(main);

        var st = document.createElement('text');
        st.className = 'level-state';
        st.textContent = isDone ? '已通关' : '去试试';
        item.appendChild(st);

        lbox.appendChild(item);
      });

      var note = $('doneNote');
      if (note) note.textContent = '已完成 ' + done + ' / ' + levels.length;

      /* 商品位 */
      var sbox = $('shopList');
      sbox.innerHTML = '';
      DATA.shop.forEach(function (p) {
        var card = document.createElement('view');
        card.className = 'shop-card';
        var name = document.createElement('text');
        name.className = 'shop-name';
        name.textContent = p.name;
        card.appendChild(name);
        var ad = document.createElement('text');
        ad.className = 'ad-mark';
        ad.textContent = '推广';
        card.appendChild(ad);
        sbox.appendChild(card);
      });
    },

    /* ---------------- 关卡页 ---------------- */

    renderLevel: function (levelId) {
      var lv = DATA.levels[levelId];
      this.levelId = levelId;

      if (!lv) {
        $('prompt').textContent = '关卡不存在（错误码 2001）';
        $('levelName').textContent = '—';
        $('sciencePoint').textContent = '—';
        return;
      }

      $('levelName').textContent = lv.name;
      $('sciencePoint').textContent = '科普点：' + lv.sciencePoint;
      $('prompt').textContent = lv.interactionConfig.prompt;

      var stage = $('stage');
      stage.innerHTML = '';
      stage.className = 'stage';
      stage.setAttribute('data-scene', (lv.scene && lv.scene.key) || 'default');

      /* 场景装饰物。属展示层，由页面渲染——引擎只认 interactionConfig。 */
      if (lv.scene && lv.scene.deco) {
        lv.scene.deco.forEach(function (d) {
          var deco = document.createElement('view');
          deco.className = 'stage-deco';
          deco.setAttribute('data-anim', d.anim || 'none');
          deco.style.left = (d.x * 100) + '%';
          deco.style.top = (d.y * 100) + '%';
          /* 旋转角度（度）。不填就是不转。 */
          deco.style.setProperty('--deco-rotate', (d.rotate || 0) + 'deg');
          deco.textContent = d.icon;
          stage.appendChild(deco);
        });
      }

      var self = this;
      this.engine = Interaction.create(stage, lv.interactionConfig, {
        onSuccess: function (r) { self.onLevelDone(lv._id, r.wrongCount); },
        onWarn: function (code, val) { console.warn('[interaction]', code, val); }
      });

      this.hide($('reward'));
      this.hide($('badge'));
      this.hide($('resetBtn'));
      this.syncProtoButtons();
    },

    /* 假装的「云函数」。真机上整段替换为：
     *     call('progress', 'complete', { levelId }).then(...)
     * 契约 §3.2：奖励判定必须在云函数，前端不可信。 */
    mockComplete: function (levelId, wrongCount) {
      if (MOCK_DONE[levelId]) {
        /* 幂等命中：重复调用返回同一结果，不重复发星、不重复发徽章 */
        return { code: 0, message: 'ok', data: MOCK_DONE[levelId] };
      }
      var stars = wrongCount === 0 ? 3 : (wrongCount === 1 ? 2 : 1);
      var data = {
        levelId: levelId,
        status: 'done',
        stars: stars,
        newBadges: ['badge_space'],
        isFirstComplete: true
      };
      MOCK_DONE[levelId] = data;
      return { code: 0, message: 'ok', data: data };
    },

    onLevelDone: function (levelId, wrongCount) {
      var res = this.mockComplete(levelId, wrongCount);
      if (res.code !== 0) return;

      var d = res.data;

      /* 页面只负责【展示】：星级、徽章都来自「云函数」，
         前端绝不自算 —— 这是契约里最容易被写错的一条。 */
      $('rewardStars').textContent = repeat('★', d.stars) + repeat('☆', 3 - d.stars);
      this.show($('reward'));

      if (d.newBadges && d.newBadges.length) {
        $('badge').textContent = '🏅 获得徽章：太空探索者';
        this.show($('badge'));
      }
      this.show($('resetBtn'));
    },

    /* ---------------- 交互绑定 ---------------- */

    /* actions 就是真机的 bindtap 处理器表，键名与 data-tap 一一对应 */
    actions: {
      openAgePicker: function () { this.show($('agePicker')); },
      pickAge: function (el) { this.setAge(el.getAttribute('data-age')); },
      topic: function () { go('topic.html', this.ageGroup); },
      tapLevel: function (el) { goLevel(el.getAttribute('data-id'), this.ageGroup); },
      back: function () { go('index.html', this.ageGroup); },
      reset: function () {
        if (this.engine) this.engine.reset();
        $('stage').classList.remove('is-success');
        this.hide($('reward'));
        this.hide($('badge'));
        this.hide($('resetBtn'));
      }
    },

    bindTap: function () {
      var self = this;
      $('page').addEventListener('click', function (e) {
        var el = e.target.closest('[data-tap]');
        if (!el) return;
        var fn = self.actions[el.getAttribute('data-tap')];
        if (fn) fn.call(self, el, e);
      });
    },

    /* ---------------- 原型专用：演示条（转 .ttml 时整段删除）---------------- */

    bindProto: function () {
      var self = this;
      var bar = document.querySelector('.proto-bar');
      if (!bar) return;

      bar.addEventListener('click', function (e) {
        var el = e.target.closest('[data-proto]');
        if (!el) return;
        var kind = el.getAttribute('data-proto');

        if (kind === 'age') {
          if (self.page === 'level') {
            /* 关卡页换主题：不重载页面，直接换 class，方便肉眼比对布局是否位移 */
            self.setAge(el.getAttribute('data-age'));
          } else {
            self.setAge(el.getAttribute('data-age'));
          }
        } else if (kind === 'level') {
          goLevel(el.getAttribute('data-level'), self.ageGroup);
        } else if (kind === 'reset') {
          self.actions.reset.call(self);
        } else if (kind === 'clearcache') {
          try { localStorage.removeItem(LS_KEY); } catch (err) { /* 忽略 */ }
          location.href = 'index.html';
        }
      });
    },

    syncProtoButtons: function () {
      var bar = document.querySelector('.proto-bar');
      if (!bar) return;
      Array.prototype.forEach.call(bar.querySelectorAll('[data-proto="age"]'), function (b) {
        var on = b.getAttribute('data-age') === App.ageGroup;
        b.className = 'proto-btn' + (on ? ' is-on' : '');
      });
      Array.prototype.forEach.call(bar.querySelectorAll('[data-proto="level"]'), function (b) {
        var on = b.getAttribute('data-level') === App.levelId;
        b.className = 'proto-btn' + (on ? ' is-on' : '');
      });
    },

    show: function (elm) { if (elm) elm.classList.remove('is-hidden'); },
    hide: function (elm) { if (elm) elm.classList.add('is-hidden'); }
  };

  /* ---------------- 小工具 ---------------- */

  function firstLevelId() {
    return Object.keys(DATA.levels)[0];
  }

  function go(page, age) {
    location.href = page + (age ? '?age=' + encodeURIComponent(age) : '');
  }

  function goLevel(levelId, age) {
    location.href = 'level.html?id=' + encodeURIComponent(levelId)
      + (age ? '&age=' + encodeURIComponent(age) : '');
  }

  function repeat(s, n) {
    var out = '';
    for (var i = 0; i < n; i++) out += s;
    return out;
  }

  function textBlock(text, cls) {
    var n = document.createElement('view');
    n.className = cls;
    n.textContent = text;
    return n;
  }

  window.App = App;
  App.init();
})();
