/*
 * swipe.js —— 上下滑切换（像 iOS 主屏幕上的「智能叠放」Smart Stack）
 *
 * 手指按在卡片中间（不是角落）上下滑：最上面那张跟着手指走，下一张 / 上一张从边上滑进来；
 * 松手后用弹簧停到最近的一张 —— 甩得快，就算只拖了一点点也会去下一张。
 *   往上滑 = 下一张，往下滑 = 上一张。
 *   首尾相连：最后一张再往上滑回到第一张（iOS 的智能叠放也是循环的），所以没有「到头」。
 *   一次最多换一张：拉过一整张以后越拉越沉（橡皮筋），松手也只走一张。
 *   动画途中可以再次抓住，从画面上的位置接着拖（可打断）。
 *
 * 和 peel.js 一样不认识 React，每一帧直接改卡片的 transform。
 * 只有「最上面换成了哪一张」这件事会告诉 React（onChange），让小圆点和名字跟着变 ——
 * 一次滑动最多通知一两次，不是每帧都通知。
 *
 * 位置用「第几张」来记（pos，可以是小数）：
 *   pos = 2    第 3 张（从 0 数）正好停在叠里
 *   pos = 2.3  第 3 张往上走了 30%，第 4 张从下面露出 30%
 *
 * 状态机：
 *   idle ──按下──▶ pending（还不知道是不是要滑）──竖着动超过 6px──▶ dragging ──松手──▶ settling（弹簧）──▶ idle
 *                    └── 横着动、或者没动就松手 ──▶ idle（什么也不做）
 *   settling 途中按下 ──▶ 直接 dragging（接着拖）
 */
import { spring } from './peel.js';

const SLOP = 6; // 手指动多少 px 才算「开始滑」，免得手抖一下卡片就动
const GAP = 8; // 滑动时两张卡片之间的缝（px）：看得出是两个独立的小组件
const FLICK_SPEED = 220; // 松手时手指每秒走超过这么多 px，就算「甩」：直接去甩的方向那一张
const RUBBER = 0.55; // 橡皮筋系数（iOS 滚动视图的经典值）：越小越「沉」

const mod = (i, n) => ((i % n) + n) % n;

export class StackSwiper {
  /**
   * peel：这一叠的 PeelStack 引擎（共用它量好的尺寸、卡片列表、参数）
   * onChange(index)：最上面换成第几张时调用（React 用它更新小圆点和名字）
   */
  constructor(peel, { onChange } = {}) {
    this.peel = peel;
    this.el = peel.el;
    this.cards = peel.cards;
    this.n = this.cards.length;
    this.onChange = onChange || (() => {});
    this.pos = peel.index;
    this.target = this.pos;
    this.v = 0; // 速度，单位「张 / 秒」
    this.state = 'idle';
    this.pointerId = null;
    this.raf = 0;
    this.reported = peel.index;
    this.loop = this.loop.bind(this);
    // pointerdown 不在这里听：由 peel.js 先判断是不是角落，不是才交过来（见 onDown）
    this.listeners = [
      ['pointermove', (e) => this.onMove(e)],
      ['pointerup', (e) => this.onUp(e)],
      ['pointercancel', (e) => this.onUp(e, true)],
    ];
    this.listeners.forEach(([type, fn]) => this.el.addEventListener(type, fn));
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.listeners.forEach(([type, fn]) => this.el.removeEventListener(type, fn));
    this.clearVisuals();
  }

  /** 正在滑或正在弹：这时候角落不能掀（peel.js 会问） */
  get busy() {
    return this.state !== 'idle';
  }

  /** 相邻两张卡片之间的距离 = 卡片高度 + 缝 */
  get pitch() {
    return this.peel.H + GAP;
  }

  get index() {
    return mod(Math.round(this.pos), this.n);
  }

  // ---------------- 手势 ----------------
  onDown(e) {
    if (this.pointerId != null || this.n < 2) return;
    const wasMoving = this.state === 'settling';
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.pointerId = e.pointerId;
    try {
      this.el.setPointerCapture(e.pointerId); // 手指滑出卡片也继续收到事件
    } catch (err) {
      /* 指针已经结束时个别浏览器会报错，忽略 */
    }
    e.preventDefault();
    this.x0 = e.clientX;
    this.y0 = e.clientY;
    this.startPos = this.pos;
    // 这一次滑动以哪一张为「起点」：正在弹的话，以它要去的那张为准
    this.base = wasMoving ? this.target : Math.round(this.pos);
    this.samples = [{ t: e.timeStamp, pos: this.pos }];
    // 动画途中抓住：马上跟手（不用再等 6px），卡片停在手指下面
    this.state = wasMoving ? 'dragging' : 'pending';
    this.v = 0;
  }

  onMove(e) {
    if (e.pointerId !== this.pointerId) return;
    if (this.state === 'pending') {
      const dx = e.clientX - this.x0;
      const dy = e.clientY - this.y0;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SLOP) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        // 横着划：不是切换（iOS 上横划是翻主屏幕页），这一下不管了
        this.release();
        this.state = 'idle';
        return;
      }
      // 从越过 6px 的那一点开始跟手，卡片不会「跳」一下
      this.y0 += Math.sign(dy) * SLOP;
      this.state = 'dragging';
      this.beginVisuals();
    }
    if (this.state !== 'dragging') return;
    const raw = this.startPos - (e.clientY - this.y0) / this.pitch; // 手指往上（dy < 0）→ pos 变大 → 下一张
    this.pos = this.rubberBand(raw);
    // 只留最近 100ms 的采样，松手时算速度（和掀角一样）
    this.samples.push({ t: e.timeStamp, pos: this.pos });
    while (this.samples.length > 2 && e.timeStamp - this.samples[0].t > 100) this.samples.shift();
    this.render();
  }

  onUp(e, cancelled = false) {
    if (e.pointerId !== this.pointerId) return;
    this.release();
    if (this.state === 'pending') {
      this.state = 'idle'; // 只是点了一下卡片中间：什么也不做
      return;
    }
    if (this.state !== 'dragging') return;
    // 松手速度（张/秒）。只看松手前 80ms：停住不动再松手，速度就是 0，不会莫名其妙飞走
    const v = cancelled ? 0 : this.releaseVelocity(e.timeStamp);
    // 甩了：去甩的方向的下一张（往上甩 → 位置往上取整，往下甩 → 往下取整）
    // 没甩（慢慢拖、或者停住再松手）：停到离现在最近的一张 —— 也就是拖过一半才换
    // 不管哪种，离起点最多一张
    let target;
    if (Math.abs(v) * this.pitch > FLICK_SPEED) target = v > 0 ? Math.floor(this.pos) + 1 : Math.ceil(this.pos) - 1;
    else target = Math.round(this.pos);
    this.target = Math.max(this.base - 1, Math.min(this.base + 1, target));
    this.v = v; // 手指的速度交给弹簧，动画接得上手，不会「顿一下」
    this.state = 'settling';
    this.report(this.target);
    this.startLoop();
  }

  release() {
    try {
      this.el.releasePointerCapture(this.pointerId);
    } catch (err) {
      /* 已经释放了，忽略 */
    }
    this.pointerId = null;
  }

  releaseVelocity(releaseT) {
    const s = this.samples.filter((x) => releaseT - x.t <= 80);
    if (s.length < 2) return 0;
    const a = s[0];
    const b = s[s.length - 1];
    const dt = (b.t - a.t) / 1000;
    return dt > 0 ? (b.pos - a.pos) / dt : 0;
  }

  /**
   * 橡皮筋：离起点一张以内完全跟手；超出的部分越拉越沉，永远拉不到第二张。
   * 公式是 iOS 滚动视图的：超出 x，实际只走 (1 - 1/(x·0.55/d + 1))·d，d = 卡片高度
   */
  rubberBand(raw) {
    const lo = this.base - 1;
    const hi = this.base + 1;
    if (raw >= lo && raw <= hi) return raw;
    const edge = raw > hi ? hi : lo;
    const x = Math.abs(raw - edge) * this.pitch;
    const d = this.peel.H;
    const eased = (1 - 1 / ((x * RUBBER) / d + 1)) * d;
    return edge + (Math.sign(raw - edge) * eased) / this.pitch;
  }

  // ---------------- 动画：弹簧（和掀角的弹回是同一种弹簧） ----------------
  startLoop() {
    if (this.raf) return;
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  loop(now) {
    const dt = Math.min((now - this.lastT) / 1000, 1 / 30);
    this.lastT = now;
    const { k, c } = spring(this.peel.params.swipeResponse, this.peel.params.swipeDamping); // 现读，调参马上生效
    const h = dt / 4;
    for (let i = 0; i < 4; i++) {
      this.v += (k * (this.target - this.pos) - c * this.v) * h;
      this.pos += this.v * h;
    }
    const px = this.pitch;
    if (Math.abs(this.target - this.pos) * px < 0.5 && Math.abs(this.v) * px < 40) {
      this.finish();
      return;
    }
    this.render();
    this.raf = requestAnimationFrame(this.loop);
  }

  /** 停稳了：把新的「最上面那张」交给掀角引擎，清掉滑动用的临时样式 */
  finish() {
    this.raf = 0;
    const idx = mod(this.target, this.n);
    this.pos = this.target = idx;
    this.v = 0;
    this.state = 'idle';
    this.clearVisuals();
    this.peel.setIndex(idx);
    this.report(idx);
  }

  /** 最上面换了一张才告诉 React（滑过一半就换，和 iOS 的小圆点一样跟着手指变） */
  report(i) {
    const idx = mod(Math.round(i), this.n);
    if (idx === this.reported) return;
    this.reported = idx;
    this.onChange(idx);
  }

  // ---------------- 画面 ----------------
  /**
   * 开始滑：整叠按连续圆角裁一下（像一个窗口，卡片在窗口里上下走，出了窗口就看不见）。
   * 电池卡片的「假玻璃」是一份和屏幕对齐的壁纸，卡片移动时要反着挪回去，才一直对得上
   */
  beginVisuals() {
    this.el.style.clipPath = this.el.style.webkitClipPath = this.peel.restClip;
    this.el.classList.add('is-swiping');
    this.wpY = parseFloat(this.el.style.getPropertyValue('--wp-y')) || 0;
  }

  clearVisuals() {
    this.el.style.clipPath = this.el.style.webkitClipPath = '';
    this.el.classList.remove('is-swiping');
    this.cards.forEach((c) => {
      c.style.transform = '';
      c.style.removeProperty('--wp-y');
    });
  }

  /** 每一帧：只摆出正在露面的两张（上面那张往上走、下面那张跟上来），其它的藏起来 */
  render() {
    const px = this.pitch;
    const i0 = Math.floor(this.pos);
    const f = this.pos - i0; // 0 ~ 1：上面那张走了多少
    const a = this.cards[mod(i0, this.n)];
    const b = this.cards[mod(i0 + 1, this.n)];
    this.cards.forEach((c) => {
      if (c !== a && c !== b) c.style.visibility = 'hidden';
    });
    const place = (card, y) => {
      card.style.visibility = '';
      card.style.zIndex = 30;
      card.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
      card.style.setProperty('--wp-y', `${(this.wpY - y).toFixed(1)}px`);
    };
    place(a, -f * px);
    place(b, (1 - f) * px);
    this.report(this.pos);
  }
}
