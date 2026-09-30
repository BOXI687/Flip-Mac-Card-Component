/*
 * peel.js —— 翻角交互引擎
 *
 * 图层（从下到上）：
 *   z 10..  其它卡片（被压在下面）
 *   z 20    下面那张卡片（被「偷看」的那张）
 *   z 25    under-shade：折痕旁边、下面那张卡被纸卷遮暗的一条（贴着折痕，很窄）
 *   z 30    顶层卡片：用 clip-path 裁掉被掀起的那一角
 *   z 35    shadow：翻页投在顶层卡片上的影子（贴着折痕最实，越往纸尖越远、越虚）
 *   z 40    flap：翻过来的那一角（顶层卡片的克隆 + 白色「纸背」 + 卷曲的光影）
 *   z 50    debug：几何辅助线
 *
 * 状态机（只偷看，不翻页：松手后永远盖回原位，上下顺序不变）：
 *   idle ──按住角落──▶ dragging ──松手──▶ returning（弹回）──▶ idle
 *   returning 过程中可以再次抓住翻页（可打断的动画，iOS 的核心手感之一）
 *
 * 这个文件不认识 React：它只管「一个 DOM 元素 + 里面的几张 .card」。
 * React 组件（src/components/PeelStack.jsx）负责把卡片画出来，再把这个引擎「装」上去。
 * 每一帧的动画都在这里直接改 DOM 的样式，不经过 React —— 一秒 60 次重新渲染太慢了。
 *
 * 哪张在最上面由 index 决定（上下滑切换时 swipe.js 会改它）。
 * 掀角时露出来的永远是「顺序里的下一张」（index + 1，到头了就绕回第一张）。
 */
import * as G from './geometry.js';
import { Reveal } from './reveal.js';

// 弹簧参数（用「响应时间 + 阻尼比」来想，比直接调 k/c 直观）
//   response：大约多久完成一次来回，越小越快
//   damping：1 = 刚好不回弹，<1 会有一点弹性
export function spring(response, damping) {
  const w = (2 * Math.PI) / response;
  return { k: w * w, c: 2 * damping * w };
}
const SPRING_PEEK = spring(0.3, 0.9); // 轻点/提示时掀一下（固定，不开放调节）
const PRESS_LIFT = 0.12; // 「按住翘一下」的基础幅度 = 卡片高度 × 这个比例（再乘面板里的倍数）
const CORNER_SMOOTHING = 0.6; // 连续圆角的平滑度：Apple 设计稿写的是「Smooth Apple (60%)」

/*
 * ======== 可调参数的默认值（全部集中在这里） ========
 * 页面上的「调参」面板（tuner.js）会实时修改 peel.params 里的这些值。
 * 在面板里调好后点「复制参数」，把复制出来的数字抄回这里，就成了新的默认值。
 * 每个值都在用到的那一刻才读取，所以改了立刻生效，不用刷新。
 */
const DEFAULTS = {
  // ---- 手感 ----
  returnResponse: 0.38, // 弹回用多久（秒），越小越快
  returnDamping: 0.82, // 弹回的阻尼：1 = 不回弹，越小越「弹」（面板里显示成「回弹弹性」）
  maxLift: 0.65, // 最多能掀起整张卡面积的多少（0~1）。快到上限时会越拉越「沉」，像拉橡皮筋
  cornerHit: 0.45, // 角落热区半径 = 卡片高度 × 这个比例
  pressLift: 1, // 手指刚按住角落时，纸角先自己翘起一点（倍数，0 = 不翘），告诉人「抓住了」
  // ---- 外观 ----
  paperColor: '#f4ecd8', // 纸背颜色（暖白纸）
  paperOpacity: 0.6, // 纸背不透明度：越小，透过纸背看到的反字越清楚
  flapBlur: 2, // 透过纸背看到的字有多模糊（px）
  highlight: 0.75, // 卷曲高光强度（1 = 100%）
  flapShadow: 0.38, // 掀起的纸角投到下面的影子有多深（0~1）
  underShade: 1, // 下层卡片上阴影的强度（1 = 100%）
  // ---- 其他 ----
  hintOnLoad: false, // 打开页面时自动掀一下右下角（App.jsx 读取）
  wallpaper: 'olive', // 主屏幕壁纸：'olive' 橄榄 / 'dusk' 夜幕 / 'dawn' 晨光（tuner.js 把它写到 <html data-wallpaper>，样子在 style.css）
  // ---- 上下滑切换（swipe.js 读取；放在这里是为了和上面的参数一起存、一起复制） ----
  swipeResponse: 0.42, // 切换到下一张用多久（秒），越小越快
  swipeDamping: 0.86, // 切换停下时的阻尼：1 = 不晃，越小越「弹」
  // ---- 掀开时，下面那张卡的信息怎么动（reveal.js 读取） ----
  peekGather: true, // 掀开时信息聚拢：true = 按座位表挤进口子里，false = 下面那张卡不动
  peekRoll: true, // 数字逐位升起：数字露出来时一位一位从下面升到原位（名字沿用以前的「滚动」，存过的设置照样能用）
  peekResponse: 0.34, // 信息跟上去用多久（秒），越小越紧跟
  peekDamping: 0.72, // 信息停下时的阻尼：1 = 不晃，越小越「弹」
  peekStagger: 40, // 出发间隔（毫秒）：后一个元素比前一个晚出发多久
  peekScale: 1.5, // 放大倍数：主角在口子里最多放大到原来的几倍
};

export class PeelStack {
  /**
   * el：放卡片的那个元素（.stack），卡片是它下面的 .card
   * options.layers：翻角图层放在哪（默认就是 el）。React 版会给一个 React 自己不管的空 div，
   *   这样引擎往里面加元素、克隆卡片，都不会和 React 打架
   * options.onOtherDown(e)：按下的地方不是角落时调用（交给上下滑切换）
   * options.isBusy()：返回 true 时（比如卡片正在上下滑），角落也不能掀
   * options.peekSpecs：每张卡片的「掀开就聚拢」说明（和卡片一一对应，没有的是 null），见 reveal.js
   */
  constructor(el, options = {}) {
    this.el = el;
    this.layersEl = options.layers || el;
    this.onOtherDown = options.onOtherDown || null;
    this.isBusy = options.isBusy || (() => false);
    this.peekSpecs = options.peekSpecs || [];
    this.reveal = new Reveal(this); // 掀开时让下面那张卡的信息聚拢到口子里
    this.geom = null; // 最近一帧的折痕和掀开了多少（reveal 每帧要用）
    // 可调参数：先拷一份默认值，再用 options.params 覆盖（不直接改 DEFAULTS，这样随时能「恢复默认」）
    this.params = Object.assign({}, DEFAULTS, options.params);
    this.cards = Array.from(el.querySelectorAll(':scope > .card'));
    this.index = 0; // 最上面那张是第几张（在 cards 里的位置）
    this.state = 'idle';
    this.C = null; // 被拖的角
    this.P = null; // 角当前的位置
    this.v = { x: 0, y: 0 }; // P 的速度（px/s），让松手后的动画接得上手指的速度
    this.raf = 0;
    this.debug = false;

    this.buildLayers();
    this.measure();
    this.layoutZ();
    this.applyStyleParams();

    this.loop = this.loop.bind(this);
    // 记下每个监听函数，destroy() 时才能一个个摘掉
    this.listeners = [
      [el, 'pointerdown', (e) => this.onDown(e)],
      [el, 'pointermove', (e) => this.onMove(e)],
      [el, 'pointerup', (e) => this.onUp(e)],
      [el, 'pointercancel', (e) => this.onUp(e)],
      [window, 'resize', () => this.measure()],
    ];
    this.listeners.forEach(([t, type, fn]) => t.addEventListener(type, fn));
  }

  /**
   * 拆掉引擎：摘掉监听、停掉动画、删掉自己加的图层、还原卡片的样式。
   * React 组件卸载时会调用（开发模式下 React 会故意「装上 → 拆掉 → 再装上」一次，检查有没有收拾干净）
   */
  destroy() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.listeners.forEach(([t, type, fn]) => t.removeEventListener(type, fn));
    this.reveal.end();
    [this.underShade, this.shadowWrap, this.flapWrap, this.debugSvg].forEach((n) => n.remove());
    this.cards.forEach((c) => {
      c.style.clipPath = c.style.webkitClipPath = c.style.zIndex = c.style.visibility = '';
      c.removeAttribute('aria-hidden');
    });
    this.el.classList.remove('is-dragging', 'show-debug');
  }

  // ---------------- 准备图层 ----------------
  buildLayers() {
    const make = (cls, parent = this.layersEl) => {
      const d = document.createElement('div');
      d.className = cls;
      parent.appendChild(d);
      return d;
    };
    // 下面卡片上的阴影
    this.underShade = make('peel-under');
    this.underGrad = make('peel-grad', this.underShade);
    // 翻页的投影：外层负责模糊（filter），内层负责形状（clip-path）。
    // 顺序不能反：同一个元素上是「先模糊、后裁剪」，影子边缘会被裁成硬边。
    // 以前用 drop-shadow 套在整个翻页外面，每帧都要把翻页（含模糊的反字）重画一遍再投影，
    // 手机上很吃力；现在影子是单独一块纯色形状，只模糊它自己
    this.shadowWrap = make('peel-shadow');
    this.shadowShape = make('peel-shadow__shape', this.shadowWrap);
    // 翻页：flap 负责镜像变换和裁剪
    this.flapWrap = make('peel-flap-wrap');
    this.flap = make('peel-flap', this.flapWrap);
    this.flapFront = make('peel-flap__front', this.flap); // 克隆的卡片内容（镜像后就像透过纸背看到的字）
    make('peel-flap__paper', this.flap); // 半透明白色纸背
    this.flapGrad = make('peel-grad', this.flap); // 卷曲的高光
    // 调试层
    this.debugSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.debugSvg.setAttribute('class', 'peel-debug');
    this.layersEl.appendChild(this.debugSvg);
    this.hideLayers();
  }

  /** 修改参数（只传要改的那几个），外观类参数会马上同步到 CSS */
  setParams(patch) {
    Object.assign(this.params, patch);
    this.applyStyleParams();
    this.lastKey = null; // 手指没动也要按新参数重画一帧
  }

  /**
   * 外观类参数通过 CSS 变量交给 style.css（见 .peel-flap__paper 等规则）。
   * 手感类参数不用在这里处理：它们在 onUp / render 里每次现读。
   */
  applyStyleParams() {
    const p = this.params;
    const st = this.el.style;
    st.setProperty('--peel-paper', hexToRgba(p.paperColor, p.paperOpacity));
    st.setProperty('--peel-blur', `${p.flapBlur}px`);
  }

  measure() {
    const r = this.el.getBoundingClientRect();
    this.W = r.width;
    this.H = r.height;
    // 卡片的真实轮廓：iOS 连续圆角（不是普通圆角）。半径从 CSS 的 border-radius 读，
    // 设计数值只写在 style.css 一个地方。平躺的卡片、翻页、阴影都从这个轮廓切出来
    const radius = parseFloat(getComputedStyle(this.cards[0]).borderTopLeftRadius) || 0;
    this.shape = G.squirclePolygon(this.W, this.H, radius, CORNER_SMOOTHING);
    this.shapeArea = G.area(this.shape);
    this.restClip = G.toClipPath(this.shape);
    this.cards.forEach((c) => c !== this.peelCard && this.applyClip(c, null));
    this.lastKey = null;
  }

  /**
   * 叠放顺序：最上面那张 z 30，下一张 z 20（掀角时露出来的就是它），
   * 其它的藏起来（反正被盖住了，藏起来手机上少画几层）
   */
  layoutZ() {
    const top = this.top;
    const under = this.under;
    this.cards.forEach((c) => {
      c.style.zIndex = c === top ? 30 : c === under ? 20 : 10;
      c.style.visibility = c === top || c === under ? '' : 'hidden';
      c.setAttribute('aria-hidden', c === top ? 'false' : 'true');
    });
  }

  get top() {
    return this.cards[this.index];
  }

  /** 顺序里的下一张（到头了绕回第一张）：掀角偷看的就是它 */
  get under() {
    return this.cards[(this.index + 1) % this.cards.length];
  }

  /** 换最上面那张（上下滑切换停稳后由 swipe.js 调用） */
  setIndex(i) {
    const n = this.cards.length;
    this.index = ((i % n) + n) % n;
    if (this.state !== 'idle') this.reset();
    this.layoutZ();
  }

  /** 手指位置 → 卡片坐标（左上角为原点） */
  local(e) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** 找离点 p 最近、并且在热区内的角 */
  hitCorner(p) {
    const hit = this.H * this.params.cornerHit;
    let best = null;
    let bestD = Infinity;
    for (const c of G.corners(this.W, this.H)) {
      const d = G.distance(p, c);
      if (d < hit && d < bestD) {
        best = c;
        bestD = d;
      }
    }
    return best;
  }

  // ---------------- 手势 ----------------
  onDown(e) {
    if (this.pointerId != null) return;
    if (this.isBusy()) {
      // 卡片正在上下滑：这一下交给滑动（可以半路抓住），不掀角
      if (this.onOtherDown) this.onOtherDown(e);
      return;
    }
    const p = this.local(e);

    if (this.state === 'returning' && G.distance(p, this.displayP()) < this.H * this.params.cornerHit) {
      // 动画还没结束又被抓住：从画面上的当前位置接着拖，而不是跳回去
      this.P = this.displayP();
      this.bounceDir = null;
      this.grabOffset = G.sub(this.P, p);
      this.pressTarget = 0; // 纸角本来就是翘着的，不用再「翘一下」
    } else {
      if (this.state !== 'idle') this.reset();
      const corner = this.hitCorner(p);
      if (!corner) {
        // 没按在角上：不掀角，交给上下滑切换（角落优先，一按下就决定是哪一种）
        if (this.onOtherDown) this.onOtherDown(e);
        return;
      }
      this.beginPeel(corner);
      this.grabOffset = G.sub(corner, p); // 手指不必正好按在角尖上
      this.pressTarget = 1;
    }
    this.press = 0;
    this.pressV = 0;

    this.state = 'dragging';
    this.pointerId = e.pointerId;
    this.el.setPointerCapture(e.pointerId); // 手指滑出卡片也继续收到事件
    this.el.classList.add('is-dragging');
    this.downPoint = p;
    this.moved = false;
    this.samples = [{ t: e.timeStamp, p: { x: this.P.x, y: this.P.y } }];
    this.startLoop();
    e.preventDefault();
  }

  onMove(e) {
    if (e.pointerId !== this.pointerId) {
      // 没在拖：鼠标悬停到角上时给个「可以抓」的光标（电脑上调试时有用）
      if (this.state === 'idle' && e.pointerType === 'mouse' && !this.isBusy()) {
        this.el.style.cursor = this.hitCorner(this.local(e)) ? 'grab' : '';
      }
      return;
    }
    const p = this.local(e);
    this.P = this.limitLift(G.add(p, this.grabOffset));
    if (G.distance(p, this.downPoint) > 4) this.moved = true;
    // 只保留最近 100ms 的采样，用来算松手时的速度。
    // 记录的是「角」的位置而不是手指：被橡皮筋拉住时角其实没怎么动，速度也不该算进去
    this.samples.push({ t: e.timeStamp, p: { x: this.P.x, y: this.P.y } });
    while (this.samples.length > 2 && e.timeStamp - this.samples[0].t > 100) this.samples.shift();
  }

  onUp(e) {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.el.classList.remove('is-dragging');
    // 「按住翘起」只是画面上多出来的一点：松手时把它并进真实位置，
    // 这样接下来的动画从画面上看到的位置出发，不会先缩回去再弹出来
    this.P = this.displayP();
    this.press = this.pressTarget = 0;

    if (!this.moved) {
      // 只是点了一下角：掀一下给个反馈
      this.peek();
      return;
    }

    // 不管拖了多远、甩得多快，松手都盖回去（只偷看，不翻页）。
    // 松手瞬间的速度交给弹簧，动画才能接得上手指，不会「顿一下」
    // 只保留「朝原位」的那部分速度：往外（掀得更大）的速度如果也带上，
    // 纸角会先往外冲一下再回来，看起来像出错了
    const v = this.releaseVelocity(e.timeStamp);
    const home = G.normalize(G.sub(this.C, this.P));
    this.v = G.scale(home, Math.max(0, G.dot(v, home)));
    this.bounceDir = G.scale(home, -1);
    this.returnHome();
  }

  /**
   * 限制「最多能掀多大」：沿拖动方向，角最远能到 dMax（此时掀起面积 = maxLift）。
   * 不是硬生生卡住，而是快到上限时越拉越沉（橡皮筋），更像真的纸。
   *   前 70% 的距离：完全跟手
   *   之后：用 1 - e^(-x) 曲线，无限接近 dMax 但永远到不了
   */
  limitLift(P) {
    const d = G.sub(P, this.C);
    const len = G.length(d);
    if (len < 0.01) return P;
    const u = G.scale(d, 1 / len);
    const dMax = this.maxLiftDistance(u);
    const knee = dMax * 0.7;
    if (len <= knee) return P;
    const range = dMax - knee;
    const eased = knee + range * (1 - Math.exp(-(len - knee) / range));
    return G.add(this.C, G.scale(u, eased));
  }

  /** 沿方向 u 拖多远，掀起的面积正好等于 maxLift？（二分查找，每帧十几次，很便宜） */
  maxLiftDistance(u) {
    const target = this.params.maxLift;
    const lifted = (len) => {
      const f = G.fold(this.C, G.add(this.C, G.scale(u, len)));
      return f ? this.liftedFraction(f) : 0;
    };
    let lo = 0;
    let hi = 2 * (this.W + this.H); // 足够远：折痕肯定越过了整张卡
    if (lifted(hi) < target) return Infinity; // 往卡片外面拖：怎么拖都掀不起来，不用限制
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (lifted(mid) < target) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  /** 被掀起的部分占整张卡片面积的比例（0 ~ 1） */
  liftedFraction(f) {
    const lifted = G.clipHalfPlane(this.shape, (X) => -f.dist(X));
    return G.area(lifted) / this.shapeArea;
  }

  /** 弹回原位（弹簧参数现读，调参面板一改就生效） */
  returnHome() {
    const p = this.params;
    this.animateTo(this.C, spring(p.returnResponse, p.returnDamping), 'returning', () => this.reset());
  }

  /**
   * 松手瞬间的速度。只看松手前 80ms 内的采样：
   * 手指停住不动时不会有新的 move 事件，旧采样会一直留着，
   * 不过滤的话，停了一秒再松手也会带上「一秒前那一下」的速度。
   */
  releaseVelocity(releaseT) {
    const s = this.samples.filter((x) => releaseT - x.t <= 80);
    if (s.length < 2) return { x: 0, y: 0 };
    const a = s[0];
    const b = s[s.length - 1];
    const dt = (b.t - a.t) / 1000;
    if (dt <= 0) return { x: 0, y: 0 };
    return { x: (b.p.x - a.p.x) / dt, y: (b.p.y - a.p.y) / dt };
  }

  // ---------------- 掀角生命周期 ----------------
  beginPeel(corner) {
    this.C = { x: corner.x, y: corner.y };
    this.P = { x: corner.x, y: corner.y };
    this.peelCard = this.top;
    // 把顶层卡片克隆一份放到翻页上。镜像之后，它就像「透过纸背看到的反字」
    const clone = this.peelCard.cloneNode(true);
    clone.removeAttribute('aria-label');
    clone.style.cssText = '';
    this.flapFront.replaceChildren(clone);
    this.flapWrap.style.display = 'block';
    this.underShade.style.display = 'block';
    this.shadowWrap.style.display = 'block';
    this.lastKey = null;
    this.geom = null;
    // 下面那张卡：量好它上面信息的原位，准备聚拢（没有说明的小组件什么也不做）
    const under = this.under;
    this.reveal.begin(under, this.peekSpecs[this.cards.indexOf(under)]);
  }

  /** 轻轻掀起再放下（点角落 / 首次提示） */
  peek(cornerName) {
    if (cornerName) {
      if (this.state !== 'idle' || this.isBusy()) return;
      this.beginPeel(G.corners(this.W, this.H).find((c) => c.name === cornerName));
    }
    const toCenter = G.normalize(G.sub({ x: this.W / 2, y: this.H / 2 }, this.C));
    const peekTo = G.add(this.C, G.scale(toCenter, this.H * 0.42));
    this.v = { x: 0, y: 0 };
    this.bounceDir = toCenter;
    this.animateTo(this.limitLift(peekTo), SPRING_PEEK, 'returning', () => this.returnHome(), 6); // 6 = 离目标 6px 内就开始往回收
  }

  /**
   * 画面上用的角的位置。
   * 回弹有弹性时，角会冲过原位、跑到卡片外面。直接拿去算折痕的话，
   * 折痕方向会整个反过来，变成「整张卡都被掀起」——画面上整张卡镜像闪出去一下。
   * 所以冲过头的那部分沿掀开方向「弹回来」：看起来像纸角碰到桌面轻轻弹了一下。
   */
  displayP() {
    if (this.state === 'dragging') return this.pressedP();
    const u = this.bounceDir;
    if (!u) return this.P;
    const s = G.dot(G.sub(this.P, this.C), u);
    return s >= 0 ? this.P : G.sub(this.P, G.scale(u, 2 * s));
  }

  /**
   * 按住时的「翘一下」：手指刚按下、还没拖，纸角就朝卡片中心翘起一小截，
   * 像真的用指甲挑起纸角 —— 不用拖就知道「抓住了」。
   * 手指拖得越远，这一截就越淡出（拖出 2.5 倍距离后完全消失），
   * 所以从「按住」过渡到「跟手」是连续的，不会跳。
   */
  pressedP() {
    const L = this.H * PRESS_LIFT * this.params.pressLift * (this.press || 0);
    if (L <= 0.01) return this.P;
    const toCenter = G.normalize(G.sub({ x: this.W / 2, y: this.H / 2 }, this.C));
    const fade = Math.max(0, 1 - G.distance(this.P, this.C) / (this.H * PRESS_LIFT * this.params.pressLift * 2.5));
    // 连续圆角的角是「圆」进去的：从矩形的角尖到卡片真正的边缘还有十几 px 是空的。
    // 折痕在 C→P 的一半处，所以多挪「两倍这段空白」，翘起来的那一截才从卡片真正的边缘算起，
    // 不然按住时几乎看不见纸角翘起（按住多久、翘多少的手感不变）
    const inset = Math.min(...this.shape.map((X) => G.dot(G.sub(X, this.C), toCenter)));
    return G.add(this.P, G.scale(toCenter, (L + 2 * Math.max(0, inset) * (this.press || 0)) * fade));
  }

  /** 「翘一下」的动画：一个很快、带一点点弹性的小弹簧（约 0.2 秒） */
  stepPress(dt) {
    const k = 900;
    const c = 2 * 0.72 * Math.sqrt(k);
    const h = dt / 4;
    for (let i = 0; i < 4; i++) {
      this.pressV += (k * ((this.pressTarget || 0) - this.press) - c * this.pressV) * h;
      this.press += this.pressV * h;
    }
  }

  reset() {
    this.state = 'idle';
    this.bounceDir = null;
    if (this.peelCard) this.applyClip(this.peelCard, null); // 盖回去：恢复完整的连续圆角轮廓
    this.peelCard = null;
    this.C = this.P = null;
    this.onSettle = null;
    this.geom = null;
    this.reveal.end(); // 盖回去了：下面那张卡上的信息全部回到原位（清掉所有变换）
    this.hideLayers();
    this.drawDebug(null);
  }

  hideLayers() {
    this.flapWrap.style.display = 'none';
    this.underShade.style.display = 'none';
    this.shadowWrap.style.display = 'none';
    this.flapFront.replaceChildren();
  }

  // ---------------- 动画：弹簧 ----------------
  animateTo(target, cfg, state, onSettle, tolerance = 0.5) {
    this.target = target;
    this.spring = cfg;
    this.state = state;
    this.onSettle = onSettle;
    this.tolerance = tolerance;
    this.startLoop();
  }

  startLoop() {
    if (this.raf) return;
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  loop(now) {
    const dt = Math.min((now - this.lastT) / 1000, 1 / 30);
    this.lastT = now;
    if (this.state === 'returning') this.stepSpring(dt);
    else if (this.state === 'dragging') this.stepPress(dt);
    if (this.state === 'idle') {
      this.raf = 0;
      return;
    }
    this.render();
    // 手指停住时 render 会跳过，但信息的弹簧还要继续追目标，所以每帧都走一步
    this.reveal.step(now, this.geom);
    this.raf = requestAnimationFrame(this.loop);
  }

  /**
   * 弹簧 = 胡克定律 + 阻尼：
   *   加速度 a = k·(目标 - 当前位置) - c·速度
   * 每帧拆成 4 个小步积分，更稳定。
   */
  stepSpring(dt) {
    const { k, c } = this.spring;
    const T = this.target;
    const h = dt / 4;
    for (let i = 0; i < 4; i++) {
      const ax = k * (T.x - this.P.x) - c * this.v.x;
      const ay = k * (T.y - this.P.y) - c * this.v.y;
      this.v.x += ax * h;
      this.v.y += ay * h;
      this.P.x += this.v.x * h;
      this.P.y += this.v.y * h;
    }
    const settled = G.distance(this.P, T) < this.tolerance && G.length(this.v) < 40;
    if (settled) {
      const cb = this.onSettle;
      this.onSettle = null;
      if (cb) cb();
    }
  }

  // ---------------- 渲染：每一帧都在这里 ----------------
  render() {
    const D = this.displayP();
    // 手指按住不动时，画面和上一帧一模一样：跳过，省电也省得手机发热
    const key = `${D.x.toFixed(2)},${D.y.toFixed(2)}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    const f = G.fold(this.C, D);
    if (!f) {
      const none = G.toClipPath([]);
      this.applyClip(this.peelCard, null);
      this.flap.style.clipPath = this.flap.style.webkitClipPath = none;
      this.underShade.style.clipPath = this.underShade.style.webkitClipPath = none;
      this.shadowShape.style.clipPath = this.shadowShape.style.webkitClipPath = none;
      this.drawDebug(null);
      this.geom = null;
      return;
    }

    const W = this.W;
    const H = this.H;
    const p = this.params;
    // 用卡片的真实轮廓（连续圆角）来切，而不是矩形：这样平躺的部分、翻页、影子的圆角都和卡片一致
    const kept = G.clipHalfPlane(this.shape, (X) => f.dist(X)); // 还平躺的部分
    const lifted = G.clipHalfPlane(this.shape, (X) => -f.dist(X)); // 被掀起的部分
    // 被掀起的部分 = 下面那张卡露出来的部分（翻过去的纸落在平躺那一侧，不挡它）。
    // reveal 每帧要用：折痕 f，和掀开了整张卡的多少 frac
    this.geom = { f, frac: G.area(lifted) / this.shapeArea };

    // 1) 顶层卡片：只显示平躺的部分
    this.applyClip(this.peelCard, kept);

    // 2) 翻页：裁出被掀起的部分，再沿折痕镜像过去
    const clip = G.toClipPath(lifted);
    this.flap.style.clipPath = this.flap.style.webkitClipPath = clip;
    this.flap.style.transform = `matrix(${G.reflectionMatrix(f).map((v) => v.toFixed(5)).join(',')})`;

    // 3) 光影。s = 折痕到角尖的距离（翻页有多「宽」）；
    //    r = 纸卷的半径：小角卷得紧，大角卷得松，但有上限 ——
    //    以前光影按翻页宽度等比放大，掀大了高光会变成一大片「金属板」，阴影也会盖住半张卡
    const s = f.length / 2;
    const r = Math.min(Math.max(s * 0.42, 7), H * 0.3);
    const ramp = Math.min(1, f.length / 40); // 刚开始拖时光影淡入，不突兀
    const away = { x: -f.n.x, y: -f.n.y }; // 从折痕指向角尖（掀起的那一侧）
    const hi = (a) => Math.min(1, a * p.highlight).toFixed(3);
    const sh = (a) => Math.min(1, a * p.underShade).toFixed(3);

    // 纸卷的光影（画在翻页上，跟着一起镜像）：
    //   折痕处是纸卷的背光面（暗）→ 卷的顶上有一道窄窄的反光 → 越往纸尖越平、越接近纸本来的颜色，
    //   纸尖微微暗一点（它翘得最高，朝向偏离光源）
    this.flapGrad.style.background = alongGradient(W, H, f.M, away, [
      [0, `rgba(0,0,0,${hi(0.26)})`],
      [r * 0.12, `rgba(0,0,0,${hi(0.07)})`],
      [r * 0.45, `rgba(255,255,255,${hi(0.72)})`],
      [r * 0.95, `rgba(255,255,255,${hi(0.3)})`],
      [r * 2.2, `rgba(255,255,255,${hi(0.06)})`],
      [Math.max(s, r * 2.2 + 1), `rgba(0,0,0,${hi(0.08)})`],
    ]);

    // 下面那张卡上、贴着折痕的一道暗边（纸卷挡住了光）。宽度跟着纸卷走，不再铺满整个露出来的区域
    this.underShade.style.clipPath = this.underShade.style.webkitClipPath = clip;
    this.underGrad.style.opacity = ramp;
    this.underGrad.style.background = alongGradient(W, H, f.M, away, [
      [0, `rgba(0,0,0,${sh(0.5)})`],
      [r * 0.3, `rgba(0,0,0,${sh(0.26)})`],
      [r * 1.2, `rgba(0,0,0,${sh(0.08)})`],
      [r * 2.8, 'rgba(0,0,0,0)'],
    ]);

    // 4) 投影：把翻页的形状「投」到桌面上。
    //    折痕那里纸贴着卡片，影子也贴着；离折痕越远纸翘得越高，影子就离得越远（往下 + 往外），
    //    再用整体模糊让它越掀越软。光从屏幕上方来，和 iOS 的阴影方向一致
    //    贴着折痕的那两个角往翻页里面缩进一点：那里纸是贴着卡片的，
    //    不缩的话模糊会从折痕两端「晕」到卡片外面，像一块脏印子
    const blur = Math.min(2 + s * 0.09, 14);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const shadowPoly = lifted.map((X) => {
      const Y = G.reflectPoint(X, f);
      const h = Math.max(0, f.dist(Y)); // 这一点离折痕多远 ≈ 它翘起多高
      const out = h * 0.08 + blur * 1.2 * Math.max(0, 1 - h / (2 * blur));
      const q = { x: Y.x + out * f.n.x, y: Y.y + out * f.n.y + h * 0.14 + 1 };
      minX = Math.min(minX, q.x);
      minY = Math.min(minY, q.y);
      maxX = Math.max(maxX, q.x);
      maxY = Math.max(maxY, q.y);
      return q;
    });
    // 影子形状只画它自己那一小块（而不是一大张画布），模糊的范围就小，手机上更省力
    const ss = this.shadowShape.style;
    ss.width = `${(maxX - minX).toFixed(1)}px`;
    ss.height = `${(maxY - minY).toFixed(1)}px`;
    ss.transform = `translate(${minX.toFixed(1)}px, ${minY.toFixed(1)}px)`;
    ss.clipPath = ss.webkitClipPath = G.toClipPath(shadowPoly.map((q) => ({ x: q.x - minX, y: q.y - minY })));
    const ws = this.shadowWrap.style;
    ws.filter = ws.webkitFilter = `blur(${blur.toFixed(1)}px)`;
    ws.opacity = (p.flapShadow * ramp).toFixed(3);

    this.drawDebug(f, kept, lifted);
  }

  /** poly 为空 = 卡片完整平躺，显示整张连续圆角轮廓 */
  applyClip(card, poly) {
    const v = poly ? G.toClipPath(poly) : this.restClip;
    card.style.clipPath = v;
    card.style.webkitClipPath = v;
  }

  // ---------------- 调试：把几何画出来 ----------------
  setDebug(on) {
    this.debug = on;
    this.el.classList.toggle('show-debug', on);
    this.lastKey = null;
    if (!on) this.drawDebug(null);
  }

  drawDebug(f, kept, lifted) {
    if (!this.debug || !f) {
      this.debugSvg.innerHTML = '';
      return;
    }
    const pts = (poly) => poly.map((p) => `${p.x},${p.y}`).join(' ');
    const t = { x: -f.n.y, y: f.n.x }; // 折痕方向（法向量转 90°）
    const a = G.add(f.M, G.scale(t, -1000));
    const b = G.add(f.M, G.scale(t, 1000));
    const dot = (p, color, label) => `
      <circle cx="${p.x}" cy="${p.y}" r="4.5" fill="${color}" stroke="#fff" stroke-width="1.5"/>
      <text x="${p.x + 8}" y="${p.y - 8}" fill="${color}">${label}</text>`;
    this.debugSvg.innerHTML = `
      <polygon points="${pts(kept)}" fill="rgba(48,209,88,0.06)" stroke="#30d158" stroke-width="1.5"/>
      <polygon points="${pts(lifted)}" fill="rgba(255,159,10,0.08)" stroke="#ff9f0a" stroke-width="1.5"/>
      <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#ff375f" stroke-width="2" stroke-dasharray="6 5"/>
      <line x1="${f.C.x}" y1="${f.C.y}" x2="${f.P.x}" y2="${f.P.y}" stroke="#0a84ff" stroke-width="1.5"/>
      ${dot(f.C, '#ff9f0a', 'C 角')}
      ${dot(f.M, '#ff375f', 'M 中点')}
      ${dot(f.P, '#0a84ff', 'P 手指')}
      <text x="8" y="${this.H - 10}" fill="#fff">掀起 ${Math.round(this.liftedFraction(f) * 100)}%（上限 ${Math.round(this.params.maxLift * 100)}%）</text>`;
  }
}

/**
 * 「从折痕开始、朝某个方向」的线性渐变，直接画在和卡片一样大的元素上。
 *   CSS 的 linear-gradient 只能给角度，起点固定在元素的一角外面。
 *   所以先算出折痕中点 M 在渐变线上的位置 t0，每个色标都写成 t0 + 距离。
 *   （以前的做法是把一个 1200×2400 的大方块挪到折痕上再旋转，手机上要为它开很大的图层）
 *   stops：[[离折痕多远(px), 颜色], ...]
 */
function alongGradient(W, H, M, u, stops) {
  const deg = (Math.atan2(u.x, -u.y) * 180) / Math.PI; // CSS 里 0deg 朝上、90deg 朝右
  const L = Math.abs(W * u.x) + Math.abs(H * u.y); // 渐变线的长度（CSS 规范里的公式）
  const t0 = (M.x - W / 2) * u.x + (M.y - H / 2) * u.y + L / 2;
  let last = -Infinity;
  const list = stops.map(([d, color]) => {
    last = Math.max(last, t0 + d); // 色标必须从小到大
    return `${color} ${last.toFixed(1)}px`;
  });
  return `linear-gradient(${deg.toFixed(2)}deg, ${list.join(', ')})`;
}

/** '#rrggbb' + 不透明度 → 'rgba(r,g,b,a)' */
function hexToRgba(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const n = m ? parseInt(m[1], 16) : 0xf7f7fa;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

PeelStack.DEFAULTS = Object.freeze(Object.assign({}, DEFAULTS)); // 给调参面板用（「恢复默认」）
