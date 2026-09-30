/*
 * reveal.js —— 掀开就聚拢（peek → gather）
 *
 * 掀起顶层卡片的一角时，下面那张卡（peel.under）上最重要的信息会「挤」到露出来的口子里，
 * 让人从口子里就能读到。这里不是「掀到某个程度就播一段动画」，而是像 Blender 的驱动器（driver）：
 *   掀开多少（口子的形状）→ 每个元素该在哪、多大、多透明（目标）→ 每个元素用自己的弹簧追目标。
 * 所以手指每动一点，信息就跟着动一点；手指停住，它们也停住；松手盖回去，动画倒着放；
 * 中途再抓住，接着动 —— 全都不需要额外处理。
 *
 * 怎么挤（「换座位」）：每个小组件事先写好 2~3 种「座位表」（口子小 → 只放主角；口子大 → 主角 + 配角）。
 * 口子越大，越往后面的座位表过渡；元素一个接一个（出发间隔）走到新座位上；不在座位表里的元素留在原位、变淡。
 * 调参面板里的「掀开时信息聚拢」可以整个关掉（关掉 = 下面那张卡不动）。
 * 另外「数字逐位升起」：主角的数字一位一位从下面升起来（每一位从头到尾都是正确的那个字），
 * 盖回去时一位一位沉回去。以前是里程表滚动，但拖得慢时轮子会停在中间的数字上（比如「15:96」），
 * 显示了错的信息 —— 规矩是：位置、大小、透明度可以跟手，数字本身永远是对的。
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
const RISE = [0.06, 0.36]; // 数字逐位升起：掀开 6% 开始升，36% 时每一位都到位（主角大约 15%~20% 才在口子里看得清，升起的过程要留给看得见的这一段）
const RISE_STAGGER = 0.3; // 后一位比前一位晚多少才开始升（按一位自己升起的那一段算：0.3 = 前一位升到 30% 时后一位出发）
const RISE_FADE = 0.45; // 每一位在升起的前 45% 里从透明变到不透明（主要靠「从下面露出来」，淡入只是让边缘柔一点）
const HISTORY_EXTRA = 40; // 出发间隔的历史记录多留几毫秒

/** 系统设置里打开了「减弱动态效果」：信息不动（和面板里关掉「掀开时信息聚拢」一样） */
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
   * spec：这张小组件的说明（见文件开头）；没有说明、面板里关掉了聚拢、或者系统要求减弱动态效果时，什么也不做。
   */
  begin(card, spec) {
    this.end();
    const p = this.peel.params;
    if (!card || !spec || !p.peekGather || prefersReducedMotion()) return;
    const els = Array.from(card.querySelectorAll('[data-peek]'));
    if (!els.length) return;

    this.card = card;
    this.spec = spec;
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
        written: '',
      };
    });
    this.byKey = {};
    this.items.forEach((it, i) => {
      it.i = i;
      if (!(it.key in this.byKey)) this.byKey[it.key] = it;
    });

    // ---- 座位表（从小到大），和每个元素第一次上场的顺序 ----
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

    // ---- 出发间隔：按上场顺序；不上场的元素（只负责变淡）不等 ----
    // 主角永远第一个出发
    const rank = [this.heroKey].concat(order).filter((k, i, a) => a.indexOf(k) === i);
    this.items.forEach((it) => {
      const k = rank.indexOf(it.key);
      it.rank = k < 0 ? 0 : k;
    });

    // ---- 数字逐位升起（说明里的 roll 写的是哪个元素；名字沿用以前的「滚动」，存过的设置照样能用） ----
    this.roll = null;
    this.rollOn = !!p.peekRoll;
    const rollEl = spec.roll && this.byKey[spec.roll] && this.byKey[spec.roll].el;
    if (this.rollOn && rollEl) this.roll = buildRise(rollEl);
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
   * geom：这一帧的折痕 f 和掀开了整张卡的多少 frac（见 peel.js 的 render）
   */
  step(now, geom) {
    if (!this.items) return;
    const p = this.peel.params;
    // 拖的时候在面板里关掉了聚拢 / 开关了数字升起：重新开始（下一帧起用新的；关掉了就全部回原位）
    if (!p.peekGather || !!p.peekRoll !== this.rollOn) {
      const { card, spec } = this;
      this.end();
      this.begin(card, spec);
      if (!this.items) return;
    }
    const dt = this.lastT ? clamp((now - this.lastT) / 1000, 0, 1 / 30) : 1 / 60;
    this.lastT = now;

    // 1) 这一帧每个元素「应该」在哪（目标），记进历史，出发间隔要用
    const T = this.targets(geom);
    const stagger = Math.max(0, p.peekStagger || 0);
    const maxDelay = stagger * (this.items.length + 1);
    this.hist.push({ t: now, T });
    while (this.hist.length > 2 && this.hist[1].t < now - maxDelay - HISTORY_EXTRA) this.hist.shift();

    // 2) 每个元素用自己的弹簧追「若干毫秒以前」的目标 —— 这就是一个接一个出发
    const w = (2 * Math.PI) / p.peekResponse;
    const k = w * w;
    const c = 2 * p.peekDamping * w;
    for (const it of this.items) {
      const tgt = this.sample(now - it.rank * stagger, it.i);
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
      this.write(it);
    }

    // 3) 数字逐位升起：跟着主角一起出发（同样的延迟），用一个不晃的弹簧（临界阻尼：跟得顺，不会冲过头）
    if (this.roll) {
      const hero = this.byKey[this.heroKey];
      const target = this.sample(now - (hero ? hero.rank : 0) * stagger, -1);
      const w = (2 * Math.PI) / 0.35;
      const h = dt / 4;
      for (let s = 0; s < 4; s++) {
        this.rollV += (w * w * (target - this.rollR) - 2 * w * this.rollV) * h;
        this.rollR += this.rollV * h;
      }
      // 几乎追上了就直接停在目标上：手指停住时数字真正停住（不再每帧挪零点零几 px、不再每帧重写样式）
      if (Math.abs(target - this.rollR) < 3e-4 && Math.abs(this.rollV) < 0.01) {
        this.rollR = target;
        this.rollV = 0;
      }
      this.roll.set(clamp(this.rollR, 0, 1));
    }
  }

  /** 从历史里取 t 时刻的目标（两帧之间线性插值）。i = -1 取数字升起的目标 */
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
    const tf = `translate(${it.x.toFixed(2)}px, ${it.y.toFixed(2)}px) scale(${s.toFixed(4)})`;
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
      roll: riseProgress(o),
    };
  }

  /**
   * 把「放在绝对位置 seat（卡片坐标）、缩放 s、透明度 a」换成相对原位的 [dx, dy, s, a]
   */
  rel(it, x, y, s, a) {
    return [x - it.home.x, y - it.home.y, s, a];
  }

  // ---------------- 换座位 ----------------
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

  targets(geom) {
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
    return { items, roll: riseProgress(o) };
  }

  /** 测试和控制台用：现在每个元素的状态 */
  debug() {
    if (!this.items) return { active: false };
    const hero = this.byKey[this.heroKey];
    return {
      active: true,
      heroKey: this.heroKey,
      o: this.o,
      levels: this.levels,
      hero: hero && { x: hero.home.x + hero.x, y: hero.home.y + hero.y, s: hero.s, a: hero.a },
      rise: this.roll ? this.roll.state() : null, // 数字升起：每一位是什么字、升到哪了
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
          cx = x + (align === 'end' ? free : 0);
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

// ---------------- 数字逐位升起 ----------------
/*
 * 在元素里面盖一层：原来的每一个字（数字、°、%、: 都算）各放进一个小「窗口」，
 * 窗口和那个字原来占的地方一样大（用 Range 一个字一个字量出来），窗口下沿以下的部分被裁掉。
 * 字在窗口里从下面（往下挪一整个字高）升到原位：还没升起来时它藏在窗口下沿下面，看不见。
 * 每一位从头到尾都是它自己那个正确的字，所以不管拖到哪、停在哪，看到的都不会是错的数字。
 * 原来的字变透明（还在，占着位置，读屏也还读它）。这一层不归 React 管；
 * 数值变了（比如跨了一分钟）就马上用新的字重新搭一次（不会从旧数值「滚」到新数值）。
 */

/** 数字升起的总进度：掀开 6% 时是 0，36% 时是 1，中间匀速 —— 缓动放在每一位自己身上 */
function riseProgress(o) {
  return clamp((o - RISE[0]) / (RISE[1] - RISE[0]), 0, 1);
}

/**
 * 和 CSS 的 cubic-bezier(x1, y1, x2, y2) 一样的缓动曲线，做成一个函数：
 * 输入 0~1 的进度（横轴），输出缓动后的 0~1（纵轴）。横轴是单调的，所以用二分法反查参数 u
 */
function cubicBezier(x1, y1, x2, y2) {
  const at = (p1, p2, u) => 3 * p1 * u * (1 - u) * (1 - u) + 3 * p2 * u * u * (1 - u) + u * u * u;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    let u = x;
    for (let i = 0; i < 24; i++) {
      const v = at(x1, x2, u);
      if (Math.abs(v - x) < 1e-5) break;
      if (v < x) lo = u;
      else hi = u;
      u = (lo + hi) / 2;
    }
    return at(y1, y2, u);
  };
}
// 快出慢停（ease-out）：一开始就明显在动（跟手），快到位时轻轻地停下，不会「咚」一下
const EASE_RISE = cubicBezier(0.22, 1, 0.36, 1);

function buildRise(el) {
  const cs = getComputedStyle(el);
  const prevPos = el.style.position;
  const prevColor = el.style.color;
  if (cs.position === 'static') el.style.position = 'relative';
  const layer = document.createElement('span');
  layer.className = 'peek-rise';
  layer.setAttribute('aria-hidden', 'true');
  layer.style.color = cs.color;
  el.append(layer);
  el.style.color = 'transparent';

  // 元素自己的字（不算这一层）
  const ownNodes = () => {
    const out = [];
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) if (!layer.contains(n)) out.push(n);
    return out;
  };
  const own = () => ownNodes().map((n) => n.data).join('');

  let glyphs = [];
  let text = '';
  let last = -1;

  // 搭这一层：每个字量一次位置，放进自己的窗口
  const fill = () => {
    text = own();
    layer.replaceChildren();
    glyphs = [];
    // 量「平时」的位置：先把引擎给整个元素的 transform 暂时拿掉（同一帧里放回去，屏幕上看不到）
    const tf = el.style.transform;
    el.style.transform = 'none';
    const er = el.getBoundingClientRect();
    const k = el.offsetWidth && er.width ? el.offsetWidth / er.width : 1; // 外面有缩放时，换算回元素自己的 px
    const range = document.createRange();
    for (const node of ownNodes()) {
      // 字在别的子元素里（字号、粗细可能不一样）：把那个子元素的字体抄过来
      const pcs = node.parentElement !== el ? getComputedStyle(node.parentElement) : null;
      let i = 0;
      for (const ch of node.data) {
        range.setStart(node, i);
        range.setEnd(node, i + ch.length);
        i += ch.length;
        const r = range.getBoundingClientRect();
        const h = r.height * k;
        const win = document.createElement('span');
        win.className = 'peek-rise__win';
        win.style.left = `${((r.left - er.left) * k - el.clientLeft).toFixed(2)}px`;
        win.style.top = `${((r.top - er.top) * k - el.clientTop).toFixed(2)}px`;
        win.style.width = `${(r.width * k).toFixed(2)}px`;
        win.style.height = `${h.toFixed(2)}px`;
        const g = document.createElement('span');
        g.className = 'peek-rise__glyph';
        g.textContent = ch;
        // 行高 = 窗口高：字正好摆在窗口里原来的位置
        g.style.lineHeight = `${h.toFixed(2)}px`;
        if (pcs) {
          for (const prop of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontStretch', 'fontVariantNumeric', 'fontFeatureSettings', 'letterSpacing']) g.style[prop] = pcs[prop];
        }
        win.append(g);
        layer.append(win);
        glyphs.push({ g, win, ch, h, x: (r.left - er.left) * k, y: (r.top - er.top) * k, p: 0, written: '' });
      }
    }
    // 对齐：单独摆的字和原来一整串里的字，排版上会差零点几 px（字距微调 kerning、行高取整）。
    // 量一下每个字实际落在哪，差多少就把窗口挪多少 —— 升到位时和原来的字严丝合缝
    for (const gl of glyphs) {
      range.selectNodeContents(gl.g);
      const b = range.getBoundingClientRect();
      const dx = gl.x - (b.left - er.left) * k;
      const dy = gl.y - (b.top - er.top) * k;
      gl.win.style.left = `${(parseFloat(gl.win.style.left) + dx).toFixed(2)}px`;
      gl.win.style.top = `${(parseFloat(gl.win.style.top) + dy).toFixed(2)}px`;
    }
    el.style.transform = tf;
  };

  const api = {
    get text() {
      return text;
    },
    /** r = 总进度 0~1：第 j 位在 r 走到它那一段时升起，前后几位的段有重叠（一位接一位，但不是一位等一位） */
    set(r) {
      // 弹簧只会无限接近 0 / 1：离得很近就当作到了（到位的字不留变换，最清楚）
      if (r > 0.999) r = 1;
      else if (r < 0.001) r = 0;
      if (Math.abs(r - last) < 1e-4) return;
      last = r;
      const n = glyphs.length;
      const span = 1 + RISE_STAGGER * (n - 1);
      glyphs.forEach((gl, j) => {
        const q = clamp(r * span - RISE_STAGGER * j, 0, 1); // 这一位自己的进度
        gl.p = q;
        let key;
        let tf = '';
        let op = '';
        if (q >= 1) key = 'rest'; // 到位：不留变换，字最清楚，和原来的字完全重合
        else {
          const e = EASE_RISE(q);
          tf = `translateY(${((1 - e) * gl.h).toFixed(2)}px)`;
          op = smooth(0, RISE_FADE, q).toFixed(3);
          key = `${tf}|${op}`;
        }
        if (key === gl.written) return; // 和上一帧一样就不写
        gl.written = key;
        gl.g.style.transform = tf;
        gl.g.style.opacity = op;
      });
    },
    /** 现在每一位是什么字、升到哪了（测试和控制台用） */
    state() {
      return { text, glyphs: glyphs.map((gl) => ({ ch: gl.ch, p: +gl.p.toFixed(3) })) };
    },
    remove() {
      mo.disconnect();
      layer.remove();
      el.style.color = prevColor;
      el.style.position = prevPos;
    },
  };

  // React 改了字（跨了一分钟）：在浏览器画出来之前（微任务里）就换成新的字，旧的字一帧也不会多留
  const mo = new MutationObserver(() => {
    if (own() === text) return; // 这一层自己的改动（或者字没变）不用管
    const r = last;
    fill();
    last = -1;
    api.set(Math.max(0, r));
  });
  mo.observe(el, { childList: true, characterData: true, subtree: true });

  fill();
  api.set(0);
  return api;
}
