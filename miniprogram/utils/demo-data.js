/* utils/demo-data.js —— 演示数据（临时）
 *
 * ⚠️ 这是【临时】数据源。云开发环境开通后，这些内容应搬到云数据库，
 *    页面改为经 utils/request.js 调云函数拉取（见《接口契约》§3）。
 *    保留这个文件的目的是：在云环境就绪前，前端能独立跑起来、可演示。
 *
 * 字段结构与《接口契约》§4.1 的集合定义一致：
 *     contents ←→ contents 集合
 *     shop     ←→ products 集合（V1.0 不建表，此处为静态占位）
 */

var DEMO = {
  contents: [
    {
      _id: 'c1', topicId: 'space', type: 'video',
      title: '火箭为什么能飞上天？', ageGroup: '3-6', duration: 95,
      adProduct: true
    },
    {
      _id: 'c2', topicId: 'space', type: 'video',
      title: '月亮为什么会变形状？', ageGroup: '3-6', duration: 88,
      adProduct: false
    },
    {
      _id: 'c3', topicId: 'space', type: 'video',
      title: '太空里为什么会飘起来？', ageGroup: '6-9', duration: 120,
      adProduct: true
    },
    {
      _id: 'c4', topicId: 'space', type: 'video',
      title: '火星上有没有外星人？', ageGroup: '6-9', duration: 132,
      adProduct: false,
      /* 《需求文档》§9.2：争议性话题须标注「科学假设 / 未定论」 */
      disputed: true
    },
    {
      _id: 'c5', topicId: 'space', type: 'video',
      title: '黑洞是怎么形成的？', ageGroup: '9-12', duration: 168,
      adProduct: false,
      disputed: true
    },
    {
      _id: 'c6', topicId: 'space', type: 'video',
      title: '第一宇宙速度是怎么算出来的？', ageGroup: '9-12', duration: 180,
      adProduct: false
    }
  ],

  /* 商品位占位。V1.0 不接精选联盟（学生主体无法准入，见《接口契约》§3.4），
     但商品位 UI 与「推广」标识保留。 */
  shop: [
    { _id: 'p1', name: '儿童天文望远镜（占位）', contentId: 'c1' },
    { _id: 'p2', name: '太阳系行星模型（占位）', contentId: 'c3' }
  ],

  /* levels ←→ levels 集合（《接口契约》§4.1）
   *
   * ⚠️ scene 字段目前【不在契约里】，是写原型时发现的缺口 G7 的临时兜底。
   *    没有它，同为 click 类型的两关舞台会长得一模一样，前端只能写
   *    if (levelId === '...') —— 那「加数据就加关卡」当场失效。
   *    建议随会签把 scene 补进契约 §4.1 的 levels 集合。
   *
   * 两个关卡的 interactionConfig 结构完全相同、只是数据不同，
   * 没有任何一处需要按关卡 id 写判断。 */
  levels: {
    'rocket-1': {
      _id: 'rocket-1',
      topicId: 'space',
      name: '火箭发射',
      sciencePoint: '反冲力原理',
      order: 1,
      ageGroup: '3-6',

      scene: {
        key: 'rocket',
        /* rotate：emoji 自带朝向未必是你要的。🚀 默认朝右上 45°，
           转 -45° 才是竖直向上。不填则为 0。 */
        deco: [{ icon: '🚀', x: 0.5, y: 0.55, anim: 'launch', rotate: -45 }]
      },

      interactionConfig: {
        type: 'click',
        version: 1,
        prompt: '点一点下面的点火按钮，让火箭飞起来！',
        successText: '发射成功！',
        failText: '这个不是点火的，再找找～',
        props: {
          /* ⚠️ icon 字段也不在契约里（缺口 G1：click 的 targets 缺表现层字段，
             而 drag 的 draggable 却有）。建议补齐并与 drag 对齐。
             坐标 x/y 是 0~1 归一化的【中心点】—— 缺口 G2 的决议。 */
          targets: [
            { id: 't1', label: '点火按钮', icon: '🔥', x: 0.50, y: 0.80, isCorrect: true },
            { id: 't2', label: '小星星', icon: '✨', x: 0.24, y: 0.26, isCorrect: false },
            { id: 't3', label: '小星星', icon: '✨', x: 0.76, y: 0.20, isCorrect: false }
          ],
          requiredHits: 1
        }
      }
    },

    /* 第 2 关只用来证明「加 JSON 就加关卡」——
       它没有任何一行专属代码，页面与引擎都没为它改过。 */
    'meteor-2': {
      _id: 'meteor-2',
      topicId: 'space',
      name: '陨石坑',
      sciencePoint: '撞击成坑',
      order: 2,
      ageGroup: '9-12',

      scene: {
        key: 'meteor',
        deco: [{ icon: '🌕', x: 0.5, y: 0.60, anim: 'none', rotate: 0 }]
      },

      interactionConfig: {
        type: 'click',
        version: 1,
        prompt: '把两颗陨石都点中，在月面上砸出坑来！',
        successText: '砸出两个大坑！',
        failText: '那是月亮，不是陨石哦～',
        props: {
          targets: [
            { id: 'm1', label: '陨石', icon: '☄️', x: 0.24, y: 0.22, isCorrect: true },
            { id: 'm2', label: '陨石', icon: '☄️', x: 0.76, y: 0.32, isCorrect: true },
            { id: 'n1', label: '月亮', icon: '🌕', x: 0.50, y: 0.88, isCorrect: false }
          ],
          requiredHits: 2      /* ← 与第 1 关不同：要连中两个 */
        }
      }
    }
  }
};

module.exports = DEMO;
