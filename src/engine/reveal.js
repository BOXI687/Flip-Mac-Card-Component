/*
 * reveal.js —— 掀开就聚拢（peek → gather）
 *
 * 掀起顶层卡片的一角时，下面那张卡（peel.under）上最重要的信息会「挤」到露出来的口子里，
 * 让人从口子里就能读到。这里不是「掀到某个程度就播一段动画」，而是像 Blender 的驱动器（driver）：
 *   掀开多少（口子的形状）→ 每个元素该在哪、多大、多透明（目标）→ 每个元素用自己的弹簧追目标。
 * 所以手指每动一点，信息就跟着动一点；手指停住，它们也停住；松手盖回去，动画倒着放；
 * 中途再抓住，接着动 —— 全都不需要额外处理。
 *
 * 两种风格（调参面板里切换）：
 *   A 换座位：每个小组件事先写好 2~3 种「座位表」（口子小 → 只放主角；口子大 → 主角 + 配角）。
 *             口子越大，越往后面的座位表过渡；元素一个接一个（出发间隔）走到新座位上。
 *   B 磁铁吸过去：没有座位表。每个元素有一个「重要程度」，口子越大、越重要，就被吸得越近；
 *             吸过来的元素沿折痕方向排成一串，中心对准口子的重心；不重要的让开、变淡。
 *             弹簧更软，会轻轻晃，移动时还会顺着方向微微歪一下（停下来就正了）。
 * 另外「数字滚动」：主角里的数字像里程表一样，露出来时从 0 滚到真实数值，盖回去时滚回 0。
 *
 * 规矩（和 peel.js 一样）：
 *   - 不认识 React。只改元素的 transform / opacity（手机上交给显卡），不改布局。
 *   - 元素原来的位置只在「开始掀」的那一刻量一次（begin），之后每帧只做数学。
 *   - 盖回去（peel.reset）时 end() 把所有改过的样式清掉，卡片完全回到原样。
 *
 * 小组件怎么加入：
 *   1. 在组件的 JSX 里给要动的元素加 data-peek="名字"（比如 data-peek="temp"）。
 *      平时看不见、只在偷看时出现的元素（比如世界时钟的数字时间），再加 data-peek-only，
 *      并在 CSS 里把它放在它「出发」的地方（平时透明度是 0）。
 *   2. 在组件上挂一份说明：Weather.peek = { medium: {...}, small: {...} }，格式见 CLAUDE.md。
 *   PeelStack.jsx 会把这份说明交给引擎；没有说明的小组件，掀开时下面的卡保持不动。
 */
import * as G from './geometry.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
/** 平滑的 0 → 1 过渡：x 在 a 以下是 0，b 以上是 1，中间是一段 S 形曲线（起步、到头都不突兀） */
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---- 固定的手感数字（不开放调节） ----
const MIN_SCALE = 0.2; // 口子太小时，元素最小缩到原来的多少（像从角落里「长」出来，比被纸盖住一半好看）
const GAP = 0.045; // 座位之间的空隙 = 卡片高度 × 这个比例
const ENGAGE = [0.015, 0.2]; // 掀开面积（占上限的比例）从 1.5% 到 20% 之间，信息从原位走到口子里
const ROLL = [0.05, 0.42]; // 数字滚动：掀开 5% 开始滚，42% 时停在真实数值
const TILT = 0.008; // B：每秒移动 1px 歪多少度（400px/s ≈ 3°）
const TILT_MAX = 3.5; // B：最多歪几度
const HISTORY_EXTRA = 40; // 出发间隔的历史记录多留几毫秒

/** 系统设置里打开了「减弱动态效果」：信息不动（和「关」一样） */
function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export class Reveal {
  constructor(peel) {
    this.peel = peel;
    this.items = null; // null = 现在没在动任何东西
  }

  get active() {
    return !!this.items;
  }

  /**
   * 开始掀：量出下面那张卡上每个 data-peek 元素的「原位」（相对卡片左上角）。
   * spec：这张小组件的说明（见文件开头）；没有说明、风格是「关」、或者系统要求减弱动态效果时，什么也不做。
   */
  begin(card, spec) {
    this.end();
    const p = this.peel.params;
    if (!card || !spec || p.peekStyle === 'off' || !['a', 'b'].includes(p.peekStyle) || prefersReducedMotion()) return;
    const els = Array.from(card.querySelectorAll('[data-peek]'));
    if (!els.length) return;

    this.card = card;
    this.spec = spec;
    this.style = p.peekStyle;
    const cr = card.getBoundingClientRect();
    this.W = cr.width;
    this.H = cr.height;
    // 离卡片边缘留多少：连续圆角的角是「圆」进去的，座位不能贴着角尖
    const radius = parseFloat(getComputedStyle(card).borderTopLeftRadius) || 0;
    this.pad = Math.max(6, radius * 0.5);
    this.margin = Math.max(6, this.H * 0.05); // 离折痕留多少（折痕旁边有纸卷的阴影）

    // ---- 量原位 ----
    this.items = els.map((el) => {
      const r = el.getBoundingClientRect();
      const v = visualRect(el, r); // 看得见的内容的框（文字元素往往比它的盒子窄）
      const cx = v.left + v.width / 2;
      const cy = v.top + v.height / 2;
      // 缩放、旋转都以「看得见的内容的中心」为原点，这样移动的是内容本身
      el.style.transformOrigin = `${(cx - r.left).toFixed(1)}px ${(cy - r.top).toFixed(1)}px`;
      const only = el.hasAttribute('data-peek-only');
      return {
        el,
        key: el.dataset.peek,
        home: { x: cx - cr.left, y: cy - cr.top, w: v.width, h: v.height },
        homeA: only ? 0 : 1, // 平时的透明度：只在偷看时出现的元素平时是 0
        // 弹簧的当前状态：x, y = 相对原位挪了多少 px；s = 缩放；a = 不透明度
        x: 0, y: 0, s: 1, a: only ? 0 : 1,
        vx: 0, vy: 0, vs: 0, va: 0,
        weight: 0, // B：重要程度（下面从说明里读）
        written: '',
      };
    });
    this.byKey = {};
    this.items.forEach((it, i) => {
      it.i = i;
      if (!(it.key in this.byKey)) this.byKey[it.key] = it;
    });

    // ---- A：座位表（从小到大），和每个元素第一次上场的顺序 ----
    // 每一级可以写成 { either: [横排, 竖排] }：两种排法都算，哪种在当前的口子里放得更大就用哪种
    this.layouts = (spec.layouts || [])
      .map((node) => (node && node.either ? node.either : [node]).map((n) => build(n, this.byKey)).filter(Boolean))
      .filter((alts) => alts.length);
    const order = [];
    (spec.layouts || []).forEach((node) => keysOf(node).forEach((k) => !order.includes(k) && order.push(k)));
    this.heroKey = spec.hero || order[0] || this.items[0].key;
    // 最后一张座位表里的元素 = 「主要信息」：它们的原位都露出来时，就回到卡片本来的样子
    const main = keysOf((spec.layouts || [])[(spec.layouts || []).length - 1]);
    this.mainItems = main.map((k) => this.byKey[k]).filter((it) => it && it.homeA === 1);

    // ---- B：磁铁 ----
    const mag = spec.magnet || {};
    const weight = mag.weight || {};
    this.items.forEach((it) => (it.weight = weight[it.key] ?? (it.key === this.heroKey ? 1 : 0)));
    this.chain = (mag.chain || order).map((node) => {
      const b = build(node, this.byKey);
      if (!b) return null;
      b.weight = Math.max(...b.keys.map((k) => weight[k] ?? 0));
      return b;
    }).filter(Boolean);
    // 一串信息沿折痕排，朝哪头读：以「沿对角线掀」时的折痕为准，尽量从上往下（接近水平时从左往右）。
    // 这一次掀角里方向固定下来，折痕转动时不会突然倒过来
    const C = this.peel.C || { x: this.W, y: this.H };
    const toCenter = G.normalize(G.sub({ x: this.W / 2, y: this.H / 2 }, C));
    let tRef = { x: -toCenter.y, y: toCenter.x };
    if (Math.abs(tRef.y) > 0.3 ? tRef.y < 0 : tRef.x < 0) tRef = G.scale(tRef, -1);
    this.tRef = tRef;

    // ---- 出发间隔：A 按上场顺序，B 按重要程度；不上场的元素（只负责变淡）不等 ----
    // 主角永远第一个出发
    const rank = [this.heroKey].concat(this.style === 'a'
      ? order
      : [...this.chain].sort((a, b) => b.weight - a.weight).flatMap((c) => c.keys)).filter((k, i, a) => a.indexOf(k) === i);
    this.items.forEach((it) => {
      const k = rank.indexOf(it.key);
      it.rank = k < 0 ? 0 : k;
    });

    // ---- 数字滚动 ----
    this.roll = null;
    this.rollOn = !!p.peekRoll;
    const rollEl = spec.roll && this.byKey[spec.roll] && this.byKey[spec.roll].el;
    if (this.rollOn && rollEl) this.roll = buildRoll(rollEl);
    this.rollR = 0;
    this.rollV = 0;

    this.hist = [];
    this.lastT = 0;
    this.o = 0;
  }

  /** 盖回去了：清掉所有改过的样式，卡片回到原样 */
  end() {
    if (!this.items) return;
    this.items.forEach(({ el }) => {
      el.style.transform = '';
      el.style.transformOrigin = '';
      el.style.opacity = '';
    });
    if (this.roll) this.roll.remove();
    this.items = null;
    this.roll = null;
    this.hist = [];
  }

  /**
   * 每一帧（peel.js 的 loop 里调用，手指不动时也调用：弹簧还要继续追目标）。
   * geom：这一帧的折痕 f 和露出来的形状 lifted（下面那张卡看得见的部分）
   */
  step(now, geom) {
    if (!this.items) return;
    const p = this.peel.params;
    // 拖的时候在面板里换了风格 / 开关了数字滚动：重新开始（下一帧起用新的）
    if (p.peekStyle !== this.style || !!p.peekRoll !== this.rollOn) {
      const { card, spec } = this;
      this.end();
      this.begin(card, spec);
      if (!this.items) return;
    }
    const dt = this.lastT ? clamp((now - this.lastT) / 1000, 0, 1 / 30) : 1 / 60;
    this.lastT = now;

    // 1) 这一帧每个元素「应该」在哪（目标），记进历史，出发间隔要用
    const T = this.style === 'b' ? this.targetsB(geom) : this.targetsA(geom);
    const stagger = Math.max(0, p.peekStagger || 0);
    const maxDelay = stagger * (this.items.length + 1);
    this.hist.push({ t: now, T });
    while (this.hist.length > 2 && this.hist[1].t < now - maxDelay - HISTORY_EXTRA) this.hist.shift();

    // 2) 每个元素用自己的弹簧追「若干毫秒以前」的目标 —— 这就是一个接一个出发
    const b = this.style === 'b';
    const damping = b ? Math.max(0.3, p.peekDamping - 0.3) : p.peekDamping; // B 更软，会轻轻晃
    for (const it of this.items) {
      const tgt = this.sample(now - it.rank * stagger, it.i);
      // B：越重要的元素被吸得越快
      const response = b ? p.peekResponse * (1.3 - 0.4 * it.weight) : p.peekResponse;
      const w = (2 * Math.PI) / response;
      const k = w * w;
      const c = 2 * damping * w;
      const h = dt / 4;
      for (let s = 0; s < 4; s++) {
        it.vx += (k * (tgt[0] - it.x) - c * it.vx) * h;
        it.vy += (k * (tgt[1] - it.y) - c * it.vy) * h;
        it.vs += (k * (tgt[2] - it.s) - c * it.vs) * h;
        it.va += (k * (tgt[3] - it.a) - c * it.va) * h;
        it.x += it.vx * h;
        it.y += it.vy * h;
        it.s += it.vs * h;
        it.a += it.va * h;
      }
      // B：顺着移动方向微微歪一下（像被吸着拖过去），停下来就正了
      it.rot = b ? clamp(it.vx * TILT, -TILT_MAX, TILT_MAX) : 0;
      this.write(it);
    }

    // 3) 数字滚动：跟着主角一起出发（同样的延迟），用一个不晃的弹簧
    if (this.roll) {
      const hero = this.byKey[this.heroKey];
      const target = this.sample(now - (hero ? hero.rank : 0) * stagger, -1);
      const w = (2 * Math.PI) / 0.35;
      const h = dt / 4;
      for (let s = 0; s < 4; s++) {
        this.rollV += (w * w * (target - this.rollR) - 2 * w * this.rollV) * h;
        this.rollR += this.rollV * h;
      }
      this.roll.set(clamp(this.rollR, 0, 1));
    }
  }

  /** 从历史里取 t 时刻的目标（两帧之间线性插值）。i = -1 取数字滚动的目标 */
  sample(t, i) {
    const H = this.hist;
    const pick = (e) => (i < 0 ? e.T.roll : e.T.items[i]);
    if (t <= H[0].t) return pick(H[0]);
    for (let k = H.length - 1; k > 0; k--) {
      const a = H[k - 1];
      const b = H[k];
      if (t >= a.t) {
        const u = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 1;
        const A = pick(a);
        const B = pick(b);
        return i < 0 ? lerp(A, B, u) : A.map((v, j) => lerp(v, B[j], u));
      }
    }
    return pick(H[H.length - 1]);
  }

  write(it) {
    const s = Math.max(0.01, it.s);
    const a = clamp(it.a, 0, 1);
    const tf = `translate(${it.x.toFixed(2)}px, ${it.y.toFixed(2)}px) scale(${s.toFixed(4)})${it.rot ? ` rotate(${it.rot.toFixed(2)}deg)` : ''}`;
    const key = `${tf}|${a.toFixed(3)}`;
    if (key === it.written) return; // 和上一帧一样就不写（手指停住、弹簧也停了）
    it.written = key;
    it.el.style.transform = tf;
    it.el.style.opacity = a.toFixed(3);
  }

  // ---------------- 目标：先算「口子」有多大、在哪 ----------------
  /** 掀开了多少：0 = 没掀，1 = 到了「最多能掀多大」的上限 */
  openness(geom) {
    if (!geom || !geom.f) return 0;
    return clamp(geom.frac / Math.max(0.05, this.peel.params.maxLift), 0, 1);
  }

  /** 所有元素都在原位的目标 */
  homeTargets(o) {
    return {
      items: this.items.map((it) => [0, 0, 1, it.homeA]),
      roll: smooth(ROLL[0], ROLL[1], o),
    };
  }

  /**
   * 把「放在绝对位置 seat（卡片坐标）、缩放 s、透明度 a」换成相对原位的 [dx, dy, s, a]
   */
  rel(it, x, y, s, a) {
    return [x - it.home.x, y - it.home.y, s, a];
  }

  // ---------------- A 换座位 ----------------
  /**
   * 口子贴着被掀的那个角。一个「座位表」整体是一个框（宽 w0 × 高 h0），
   * 从角上（往里缩 pad）开始摆，框的四个角都要在折痕这一侧（再留 margin）。
   * 折痕是一条直线，所以「框能放多大」可以直接解出来：
   *   框最远那个角到折痕的距离 = dist(B0) + a·w + b·h ≤ -margin
   *   a、b = 折痕法线在「往卡片里面」两个方向上的分量（只算正的）
   */
  cornerFit(f) {
    const { W, H, pad } = this;
    const C = this.peel.C;
    const sx = C.x < W / 2 ? 1 : -1; // 从这个角往卡片里面是 +x 还是 -x
    const sy = C.y < H / 2 ? 1 : -1;
    const B0 = { x: C.x + sx * pad, y: C.y + sy * pad };
    const room = -this.margin - f.dist(B0);
    const a = Math.max(0, sx * f.n.x);
    const b = Math.max(0, sy * f.n.y);
    return {
      sx, sy, B0,
      fit: (w0, h0) => {
        const card = Math.min((W - 2 * pad) / w0, (H - 2 * pad) / h0);
        if (room <= 0) return 0;
        const k = a * w0 + b * h0;
        return k > 1e-6 ? Math.min(room / k, card) : card;
      },
    };
  }

  targetsA(geom) {
    const o = this.openness(geom);
    this.o = o;
    const e = smooth(ENGAGE[0], ENGAGE[1], o);
    if (e <= 0 || !this.layouts.length) return this.homeTargets(o);
    const p = this.peel.params;
    const maxS = p.peekScale;
    const f = geom.f;
    const cf = this.cornerFit(f);
    const align = cf.sx > 0 ? 'start' : 'end'; // 竖排的元素贴着角的那一边对齐
    const gap = this.H * GAP;

    // 一种排法：能放多大（fit）、每个元素坐在哪（out）
    const arrange = (L) => {
      const sz = L.size(gap);
      const fit = cf.fit(sz.w, sz.h);
      const s = clamp(fit, MIN_SCALE, maxS);
      // 放得下时，在「最大能放的框」里居中（而不是缩在角落）；放不下时从角上开始摆
      const S = Math.max(s, fit);
      const cx = cf.B0.x + (cf.sx * S * sz.w) / 2;
      const cy = cf.B0.y + (cf.sy * S * sz.h) / 2;
      const out = {};
      L.place(cx - (s * sz.w) / 2, cy - (s * sz.h) / 2, s, gap, align, out);
      return { fit, out };
    };
    // 每一级座位表：有「二选一」时两种排法都算，放得更大的那种占的比重更大（软切换，
    // 折痕慢慢转过去时，元素会从横排慢慢换到竖排 —— 这也是「换座位」）
    const seats = this.layouts.map((alts) => {
      const arr = alts.map(arrange);
      const best = Math.max(...arr.map((a) => a.fit));
      // 0.015：两种排法差不多大时才会「一半一半」（那时元素正在换座位）；差一点点就明确选一种
      const w = arr.map((a) => Math.exp((a.fit - best) / 0.015));
      const sum = w.reduce((x, y) => x + y, 0);
      return { fit: arr.reduce((acc, a, j) => acc + (a.fit * w[j]) / sum, 0), alts: arr.map((a, j) => ({ out: a.out, w: w[j] / sum })) };
    });

    // 口子够大（后一级能放到「放大倍数」的 60% 左右）时，渐渐换到后一级座位表。
    // 每一级都是平滑的 0 → 1，所以不会在某个门槛上突然跳
    const th = clamp(0.6 * maxS, 0.8, 1.2);
    const g = seats.map((st, k) => (k === 0 ? 1 : smooth(th - 0.07, th + 0.07, st.fit)));
    const lw = seats.map((_, k) => g[k] * g.slice(k + 1).reduce((acc, x) => acc * (1 - x), 1));

    // 主要信息的原位全都露出来了：回到卡片本来的样子（留在原位最好读）
    let inside = Infinity;
    for (const it of this.mainItems) {
      const { x, y, w, h } = it.home;
      for (const X of [{ x: x - w / 2, y: y - h / 2 }, { x: x + w / 2, y: y - h / 2 }, { x: x - w / 2, y: y + h / 2 }, { x: x + w / 2, y: y + h / 2 }]) {
        inside = Math.min(inside, -f.dist(X));
      }
    }
    const gh = this.mainItems.length ? smooth(this.margin * 0.5, this.margin * 2.5, inside) : 0;
    this.levels = { fit: seats.map((st) => +st.fit.toFixed(3)), weight: lw.map((x) => +(x * (1 - gh)).toFixed(3)), home: +gh.toFixed(3) };

    // 每一级里每个元素的座位（「二选一」按比重合成一个）
    const levelSeat = seats.map((st) => {
      const out = {};
      for (const key of Object.keys(this.byKey)) {
        let x = 0;
        let y = 0;
        let s = 0;
        let w = 0;
        st.alts.forEach((alt) => {
          const seat = alt.out[key];
          if (!seat) return;
          x += alt.w * seat.x;
          y += alt.w * seat.y;
          s += alt.w * seat.s;
          w += alt.w;
        });
        if (w > 0) out[key] = { x: x / w, y: y / w, s: s / w, w };
      }
      return out;
    });
    // 某一级里没有这个元素：它就在「最近一张有它的座位表」的座位上，只是透明 ——
    // 这样新来的元素是在自己的座位上淡入的，不会从原位横穿过来和别的元素叠在一起
    const seatFor = (key, k) => {
      for (let d = 1; d < seats.length; d++) {
        if (levelSeat[k + d] && levelSeat[k + d][key]) return levelSeat[k + d][key];
        if (levelSeat[k - d] && levelSeat[k - d][key]) return levelSeat[k - d][key];
      }
      return null;
    };

    const items = this.items.map((it) => {
      let x = 0;
      let y = 0;
      let s = 0;
      let a = 0;
      const mine = it === this.byKey[it.key];
      seats.forEach((st, k) => {
        const wk = lw[k] * (1 - gh);
        const seat = mine && levelSeat[k][it.key];
        const pres = seat ? seat.w : 0; // 「二选一」里只有一种有它时，按那一种的比重显现
        const at = seat || (mine && seatFor(it.key, k)) || { x: it.home.x, y: it.home.y, s: 1 };
        x += wk * at.x;
        y += wk * at.y;
        s += wk * at.s;
        a += wk * pres;
      });
      x += gh * it.home.x;
      y += gh * it.home.y;
      s += gh;
      a += gh * it.homeA;
      // 换座位途中（两级座位表之间）的元素：快到位了才显现
      a = smooth(0.35, 1, a);
      // 刚开始掀：从原位慢慢走过来（e 从 0 到 1）
      return this.rel(it, lerp(it.home.x, x, e), lerp(it.home.y, y, e), lerp(1, s, e), lerp(it.homeA, a, e));
    });
    return { items, roll: smooth(ROLL[0], ROLL[1], o) };
  }

  // ---------------- B 磁铁吸过去 ----------------
  targetsB(geom) {
    const o = this.openness(geom);
    this.o = o;
    if (o <= 0 || !this.chain.length) return this.homeTargets(o);
    const p = this.peel.params;
    const maxS = p.peekScale;
    const f = geom.f;
    const lifted = geom.lifted;
    const Gc = polyCentroid(lifted); // 口子的重心：磁铁在这里
    const gap = this.H * GAP;

    // 折痕方向 t（沿着折痕走），和 begin 里定好的读的方向同向
    let t = { x: -f.n.y, y: f.n.x };
    if (G.dot(t, this.tRef) < 0) t = G.scale(t, -1);

    // 每个元素被吸多近（0 = 在原位，1 = 吸到了）：越重要越早开始、吸力越大越早
    const pull = p.peekPull;
    const pulls = this.chain.map((c) => smooth((1 - c.weight) * 0.45, (1 - c.weight) * 0.45 + 0.28, o * pull));

    // 一串：前后两个框沿 t 方向刚好不重叠的距离 × 后一个的「位子让出来多少」。
    // 位子比元素先让出来（被吸过来 40% 时位子已经全让开了），元素到的时候不会和别人叠在一起
    const slot = pulls.map((q) => smooth(0, 0.4, q));
    const sizes = this.chain.map((c) => c.size(gap));
    const u = [0];
    for (let k = 1; k < sizes.length; k++) {
      const A = sizes[k - 1];
      const B = sizes[k];
      const along = Math.min(
        Math.abs(t.x) > 1e-6 ? (A.w + B.w) / 2 / Math.abs(t.x) : Infinity,
        Math.abs(t.y) > 1e-6 ? (A.h + B.h) / 2 / Math.abs(t.y) : Infinity
      );
      u.push(u[k - 1] + slot[k] * (along + gap));
    }
    // 这一串的「重心」（越大、吸得越近的元素越重）对准口子的重心
    let m = 0;
    let mu = 0;
    sizes.forEach((sz, k) => {
      const w = slot[k] * sz.w * sz.h;
      m += w;
      mu += w * u[k];
    });
    const uc = m > 0 ? mu / m : 0;
    const offs = u.map((v) => G.scale(t, v - uc));

    // 整串能放多大：二分查找（口子是凸的，缩小一定放得下，所以可以二分）
    const fits = (R) => sizes.every((sz, k) => {
      if (slot[k] <= 0.001) return true;
      const cx = Gc.x + R * offs[k].x;
      const cy = Gc.y + R * offs[k].y;
      const hw = (R * slot[k] * sz.w) / 2;
      const hh = (R * slot[k] * sz.h) / 2;
      return insideBox(this, f, cx - hw, cy - hh, cx + hw, cy + hh);
    });
    // 放大倍数管的是主角：主角在串里如果写了 scale（比如 1.4），整串最多只能放大到 maxS / 1.4
    const heroNode = this.chain.find((c) => c.keys.includes(this.heroKey));
    const probe = {};
    if (heroNode) heroNode.place(0, 0, 1, gap, 'center', probe);
    const capR = maxS / ((probe[this.heroKey] && probe[this.heroKey].s) || 1);
    let R;
    if (fits(capR)) R = capR;
    else {
      let lo = 0;
      let hi = capR;
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid;
        else hi = mid;
      }
      R = lo;
    }
    R = Math.max(R, MIN_SCALE);

    const seat = {};
    this.chain.forEach((c, k) => {
      const sz = sizes[k];
      const cx = Gc.x + R * offs[k].x;
      const cy = Gc.y + R * offs[k].y;
      const out = {};
      c.place(cx - (R * sz.w) / 2, cy - (R * sz.h) / 2, R, gap, 'center', out);
      c.keys.forEach((key) => out[key] && (seat[key] = { ...out[key], pull: pulls[k] }));
    });

    // 还没轮到（或者根本不重要）的元素：被推开一点、变淡，给主角让出地方
    const aside = (it) => {
      const away = G.normalize(G.sub(it.home, Gc));
      const d = this.H * 0.08 * smooth(0, 0.5, o);
      return [it.home.x + away.x * d, it.home.y + away.y * d, 1 - 0.06 * smooth(0, 0.5, o), it.homeA * (1 - smooth(0.02, 0.3, o))];
    };
    const items = this.items.map((it) => {
      const A = aside(it);
      const st = it === this.byKey[it.key] && seat[it.key];
      if (!st) return this.rel(it, ...A);
      // 被吸过来多少 q：从「让开」的位置一路走到串里的座位；平时看不见的元素边走边显现
      const q = st.pull;
      // 透明度到快吸到位时才回到 1：半路上的元素淡淡的，不会和已经坐好的主角抢眼
      return this.rel(it, lerp(A[0], st.x, q), lerp(A[1], st.y, q), lerp(A[2], st.s, q), lerp(A[3], 1, smooth(0.45, 1, q)));
    });
    return { items, roll: smooth(ROLL[0], ROLL[1], o) };
  }

  /** 测试和控制台用：现在每个元素的状态 */
  debug() {
    if (!this.items) return { active: false };
    const hero = this.byKey[this.heroKey];
    return {
      active: true,
      style: this.style,
      heroKey: this.heroKey,
      o: this.o,
      levels: this.levels,
      hero: hero && { x: hero.home.x + hero.x, y: hero.home.y + hero.y, s: hero.s, a: hero.a, rot: hero.rot || 0 },
      roll: this.roll ? this.roll.shown() : null,
      rollFinal: this.roll ? this.roll.text : null,
    };
  }
}

// ---------------- 座位表：一个很小的「flex 布局」 ----------------
/*
 * 写法（在每个小组件的 peek 说明里）：
 *   'temp'                               一个元素（按它原来的大小）
 *   { key: 'dial', scale: 0.7 }          一个元素，缩放到原来的 0.7 倍
 *   { row: ['temp', 'icon', 'cond'] }    横着排（上下居中）
 *   { col: ['time', 'city'] }            竖着排（贴着被掀的那一边对齐）
 *   { over: ['ring', 'icon'] }           叠在一起（中心对齐），比如圆环里的图标
 * build() 把它变成两个函数：size() 算整体多大，place() 把每个元素放到位
 */
function build(node, byKey) {
  if (node == null) return null;
  if (typeof node === 'string') node = { key: node };
  if (node.key) {
    const it = byKey[node.key];
    if (!it) return null;
    const k = node.scale || 1;
    const w = it.home.w * k;
    const h = it.home.h * k;
    return {
      keys: [node.key],
      size: () => ({ w, h }),
      place: (x, y, s, gap, align, out) => {
        out[node.key] = { x: x + (s * w) / 2, y: y + (s * h) / 2, s: s * k };
      },
    };
  }
  const kind = node.row ? 'row' : node.col ? 'col' : 'over';
  const kids = (node[kind] || []).map((n) => build(n, byKey)).filter(Boolean);
  if (!kids.length) return null;
  const gapK = node.gap ?? 1;
  const size = (gap) => {
    const ss = kids.map((c) => c.size(gap));
    const g = gap * gapK * (kids.length - 1);
    if (kind === 'row') return { w: ss.reduce((a, s) => a + s.w, 0) + g, h: Math.max(...ss.map((s) => s.h)) };
    if (kind === 'col') return { w: Math.max(...ss.map((s) => s.w)), h: ss.reduce((a, s) => a + s.h, 0) + g };
    return { w: Math.max(...ss.map((s) => s.w)), h: Math.max(...ss.map((s) => s.h)) };
  };
  return {
    keys: kids.flatMap((c) => c.keys),
    size,
    place: (x, y, s, gap, align, out) => {
      const me = size(gap);
      let cur = 0;
      kids.forEach((c) => {
        const cs = c.size(gap);
        let cx = x;
        let cy = y;
        if (kind === 'row') {
          cx = x + cur * s;
          cy = y + ((me.h - cs.h) * s) / 2;
          cur += cs.w + gap * gapK;
        } else if (kind === 'col') {
          const free = (me.w - cs.w) * s;
          cx = x + (align === 'end' ? free : align === 'center' ? free / 2 : 0);
          cy = y + cur * s;
          cur += cs.h + gap * gapK;
        } else {
          cx = x + ((me.w - cs.w) * s) / 2;
          cy = y + ((me.h - cs.h) * s) / 2;
        }
        c.place(cx, cy, s, gap, align, out);
      });
    },
  };
}

function keysOf(node) {
  if (node == null) return [];
  if (typeof node === 'string') return [node];
  if (node.key) return [node.key];
  return (node.row || node.col || node.over || node.either || []).flatMap(keysOf);
}

/** 看得见的内容的框：文字用 Range 量（div 的盒子往往比字宽）；SVG、没有内容的就用元素自己的框 */
function visualRect(el, r) {
  if (el instanceof SVGElement || !el.firstChild) return r;
  const range = document.createRange();
  range.selectNodeContents(el);
  const v = range.getBoundingClientRect();
  return v.width > 0 && v.height > 0 ? v : r;
}

/** 多边形的面积重心 */
function polyCentroid(poly) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(a) < 1e-6) return poly[0] || { x: 0, y: 0 };
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

/** 一个框是不是完整地在口子里（离折痕留 margin，离卡片边留 pad） */
function insideBox(rv, f, x0, y0, x1, y1) {
  const { W, H, pad, margin } = rv;
  if (x0 < pad || y0 < pad || x1 > W - pad || y1 > H - pad) return false;
  return f.dist({ x: x0, y: y0 }) <= -margin && f.dist({ x: x1, y: y0 }) <= -margin
    && f.dist({ x: x0, y: y1 }) <= -margin && f.dist({ x: x1, y: y1 }) <= -margin;
}

// ---------------- 数字滚动（里程表） ----------------
/*
 * 在元素里面盖一层一模一样的字，其中每个数字换成一条竖着的「数字带」0~9,0，
 * 上下挪这条带子就像里程表的轮子在转。原来的字变透明（还在，占着位置，读屏也还读它）。
 * 每个轮子从 0 转一圈多一点停到自己的数字（所以 0 和 1 也看得出在滚），左边的先停。
 * 这一层不归 React 管；数值变了（比如跨了一分钟）就重新搭一次。
 */
function buildRoll(el) {
  const cs = getComputedStyle(el);
  const color = cs.color;
  const prevPos = el.style.position;
  const prevColor = el.style.color;
  if (cs.position === 'static') el.style.position = 'relative';
  const ov = document.createElement('span');
  ov.className = 'peek-roll';
  ov.setAttribute('aria-hidden', 'true');
  ov.style.color = color;
  ov.style.padding = cs.padding;
  el.append(ov);
  el.style.color = 'transparent';

  const own = () => Array.from(el.childNodes).filter((n) => n !== ov).map((n) => n.textContent).join('');
  let wheels = [];
  let text = '';
  const fill = () => {
    text = own();
    ov.replaceChildren();
    wheels = [];
    for (const ch of text) {
      if (/\d/.test(ch)) {
        const col = document.createElement('span');
        col.className = 'peek-roll__col';
        const ghost = document.createElement('span');
        ghost.className = 'peek-roll__ghost';
        ghost.textContent = ch;
        const strip = document.createElement('span');
        strip.className = 'peek-roll__strip';
        for (const d of '01234567890') {
          const cell = document.createElement('span');
          cell.textContent = d;
          strip.append(cell);
        }
        col.append(ghost, strip);
        ov.append(col);
        wheels.push({ strip, d: +ch, q: 0 });
      } else ov.append(document.createTextNode(ch));
    }
  };
  fill();
  let last = -1;
  const api = {
    get text() {
      return text;
    },
    set(r) {
      if (own() !== text) {
        fill();
        last = -1;
      }
      if (Math.abs(r - last) < 1e-4) return;
      last = r;
      const n = wheels.length;
      wheels.forEach((w, j) => {
        // 左边的轮子先停：第 j 个轮子在 r 走到它那一段时才转完
        const rj = clamp(r * (1 + 0.18 * (n - 1)) - 0.18 * j, 0, 1);
        w.q = ((w.d + 10) * rj) % 10; // 转一圈多：从 0 转过 10 格再到 d
        w.strip.style.transform = `translateY(${((-w.q * 100) / 11).toFixed(3)}%)`;
      });
    },
    /** 现在显示的是什么（测试用） */
    shown() {
      let k = 0;
      return Array.from(text).map((ch) => (/\d/.test(ch) ? String(Math.round(wheels[k++].q) % 10) : ch)).join('');
    },
    remove() {
      ov.remove();
      el.style.color = prevColor;
      el.style.position = prevPos;
    },
  };
  return api;
}
