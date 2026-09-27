/*
 * peel.js —— 翻角交互引擎
 *
 * 图层（从下到上）：
 *   z 10..  其它卡片（被压在下面）
 *   z 20    下面那张卡片（被「偷看」的那张）
 *   z 25    under-shade：投在下面卡片上的阴影（让翻起的纸看起来有高度）
 *   z 30    顶层卡片：用 clip-path 裁掉被掀起的那一角
 *   z 40    flap：翻过来的那一角（顶层卡片的克隆 + 白色「纸背」 + 高光）
 *   z 50    debug：几何辅助线
 *
 * 状态机（只偷看，不翻页：松手后永远盖回原位，上下顺序不变）：
 *   idle ──按住角落──▶ dragging ──松手──▶ returning（弹回）──▶ idle
 *   returning 过程中可以再次抓住翻页（可打断的动画，iOS 的核心手感之一）
 */
window.PeelStack = (function () {
  'use strict';
  const G = window.Geometry;

  // 弹簧参数（用「响应时间 + 阻尼比」来想，比直接调 k/c 直观）
  //   response：大约多久完成一次来回，越小越快
  //   damping：1 = 刚好不回弹，<1 会有一点弹性
  function spring(response, damping) {
    const w = (2 * Math.PI) / response;
    return { k: w * w, c: 2 * damping * w };
  }
  const SPRING_PEEK = spring(0.3, 0.9); // 轻点/提示时掀一下（固定，不开放调节）

  /*
   * ======== 可调参数的默认值（全部集中在这里） ========
   * 页面上的「调参」面板（js/tuner.js）会实时修改 peel.params 里的这些值。
   * 在面板里调好后点「复制参数」，把复制出来的数字抄回这里，就成了新的默认值。
   * 每个值都在用到的那一刻才读取，所以改了立刻生效，不用刷新。
   */
  const DEFAULTS = {
    // ---- 手感 ----
    returnResponse: 0.38, // 弹回用多久（秒），越小越快
    returnDamping: 0.82, // 弹回的阻尼：1 = 不回弹，越小越「弹」（面板里显示成「回弹弹性」）
    maxLift: 0.65, // 最多能掀起整张卡面积的多少（0~1）。快到上限时会越拉越「沉」，像拉橡皮筋
    cornerHit: 0.45, // 角落热区半径 = 卡片高度 × 这个比例
    // ---- 外观 ----
    paperColor: '#f7f7fa', // 纸背颜色
    paperOpacity: 0.84, // 纸背不透明度：越小，透过纸背看到的反字越清楚
    flapBlur: 1.2, // 透过纸背看到的字有多模糊（px）
    highlight: 1, // 卷曲高光强度（1 = 100%）
    flapShadow: 0.38, // 掀起的纸角投到下面的影子有多深（0~1）
    underShade: 1, // 下层卡片上阴影的强度（1 = 100%）
    // ---- 其他 ----
    hintOnLoad: true, // 打开页面时自动掀一下右下角（main.js 读取）
  };

  class PeelStack {
    constructor(el, options = {}) {
      this.el = el;
      // 可调参数：先拷一份默认值，再用 options.params 覆盖（不直接改 DEFAULTS，这样随时能「恢复默认」）
      this.params = Object.assign({}, DEFAULTS, options.params);
      this.cards = Array.from(el.querySelectorAll(':scope > .card'));
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
      el.addEventListener('pointerdown', (e) => this.onDown(e));
      el.addEventListener('pointermove', (e) => this.onMove(e));
      el.addEventListener('pointerup', (e) => this.onUp(e));
      el.addEventListener('pointercancel', (e) => this.onUp(e));
      window.addEventListener('resize', () => this.measure());
    }

    // ---------------- 准备图层 ----------------
    buildLayers() {
      const make = (cls, parent = this.el) => {
        const d = document.createElement('div');
        d.className = cls;
        parent.appendChild(d);
        return d;
      };
      // 下面卡片上的阴影
      this.underShade = make('peel-under');
      this.underGrad = make('peel-grad', this.underShade);
      // 翻页：wrap 负责投影（filter），flap 负责镜像变换和裁剪
      this.flapWrap = make('peel-flap-wrap');
      this.flap = make('peel-flap', this.flapWrap);
      this.flapFront = make('peel-flap__front', this.flap); // 克隆的卡片内容（镜像后就像透过纸背看到的字）
      make('peel-flap__paper', this.flap); // 半透明白色纸背
      this.flapGrad = make('peel-grad', this.flap); // 卷曲的高光
      // 调试层
      this.debugSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.debugSvg.setAttribute('class', 'peel-debug');
      this.el.appendChild(this.debugSvg);
      this.hideLayers();
    }

    /** 修改参数（只传要改的那几个），外观类参数会马上同步到 CSS */
    setParams(patch) {
      Object.assign(this.params, patch);
      this.applyStyleParams();
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
      st.setProperty('--peel-flap-shadow', String(p.flapShadow));
    }

    measure() {
      const r = this.el.getBoundingClientRect();
      this.W = r.width;
      this.H = r.height;
    }

    layoutZ() {
      this.cards.forEach((c, i) => {
        c.style.zIndex = i === 0 ? 30 : 20 - i;
        c.setAttribute('aria-hidden', i === 0 ? 'false' : 'true');
      });
    }

    get top() {
      return this.cards[0];
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
      const p = this.local(e);

      if (this.state === 'returning' && G.distance(p, this.P) < this.H * this.params.cornerHit) {
        // 动画还没结束又被抓住：从当前位置接着拖，而不是跳回去
        this.grabOffset = G.sub(this.P, p);
      } else {
        if (this.state !== 'idle') this.reset();
        const corner = this.hitCorner(p);
        if (!corner) return; // 没按在角上，不处理
        this.beginPeel(corner);
        this.grabOffset = G.sub(corner, p); // 手指不必正好按在角尖上
      }

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
        if (this.state === 'idle' && e.pointerType === 'mouse') {
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

      if (!this.moved) {
        // 只是点了一下角：掀一下给个反馈
        this.peek();
        return;
      }

      // 不管拖了多远、甩得多快，松手都盖回去（只偷看，不翻页）。
      // 松手瞬间的速度交给弹簧，动画才能接得上手指，不会「顿一下」
      this.v = this.releaseVelocity();
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
      const lifted = G.clipHalfPlane(G.rectPolygon(this.W, this.H), (X) => -f.dist(X));
      return G.area(lifted) / (this.W * this.H);
    }

    /** 弹回原位（弹簧参数现读，调参面板一改就生效） */
    returnHome() {
      const p = this.params;
      this.animateTo(this.C, spring(p.returnResponse, p.returnDamping), 'returning', () => this.reset());
    }

    releaseVelocity() {
      const s = this.samples;
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
    }

    /** 轻轻掀起再放下（点角落 / 首次提示） */
    peek(cornerName) {
      if (cornerName) {
        if (this.state !== 'idle') return;
        this.beginPeel(G.corners(this.W, this.H).find((c) => c.name === cornerName));
      }
      const toCenter = G.normalize(G.sub({ x: this.W / 2, y: this.H / 2 }, this.C));
      const peekTo = G.add(this.C, G.scale(toCenter, this.H * 0.42));
      this.v = { x: 0, y: 0 };
      this.animateTo(this.limitLift(peekTo), SPRING_PEEK, 'returning', () => this.returnHome(), 6); // 6 = 离目标 6px 内就开始往回收
    }

    reset() {
      this.state = 'idle';
      if (this.peelCard) {
        this.peelCard.style.clipPath = '';
        this.peelCard.style.webkitClipPath = '';
      }
      this.peelCard = null;
      this.C = this.P = null;
      this.onSettle = null;
      this.hideLayers();
      this.drawDebug(null);
    }

    hideLayers() {
      this.flapWrap.style.display = 'none';
      this.underShade.style.display = 'none';
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
      if (this.state === 'idle') {
        this.raf = 0;
        return;
      }
      this.render();
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
      const f = G.fold(this.C, this.P);
      if (!f) {
        this.applyClip(this.peelCard, null);
        this.flap.style.clipPath = this.flap.style.webkitClipPath = G.toClipPath([]);
        this.underShade.style.clipPath = this.underShade.style.webkitClipPath = G.toClipPath([]);
        this.drawDebug(null);
        return;
      }

      const rect = G.rectPolygon(this.W, this.H);
      const kept = G.clipHalfPlane(rect, (X) => f.dist(X)); // 还平躺的部分
      const lifted = G.clipHalfPlane(rect, (X) => -f.dist(X)); // 被掀起的部分

      // 1) 顶层卡片：只显示平躺的部分
      this.applyClip(this.peelCard, kept);

      // 2) 翻页：裁出被掀起的部分，再沿折痕镜像过去
      const clip = G.toClipPath(lifted);
      this.flap.style.clipPath = this.flap.style.webkitClipPath = clip;
      this.flap.style.transform = `matrix(${G.reflectionMatrix(f).map((v) => v.toFixed(5)).join(',')})`;

      // 3) 光影：高光和阴影都以折痕为起点，朝被掀起的一侧渐变
      const s = f.length / 2; // 折痕到角尖的距离 = 翻页的「宽度」
      const angle = (Math.atan2(-f.n.y, -f.n.x) * 180) / Math.PI;
      const shadeTransform = `translate(${f.M.x}px, ${f.M.y}px) rotate(${angle}deg) translate(0, -50%)`;
      const px = (r) => `${(r * s).toFixed(1)}px`;

      // 高光 / 阴影强度 = 设计稿里的透明度 × 面板里的倍数（最多到 1，不透明就封顶了）
      const hi = (a) => Math.min(1, a * this.params.highlight).toFixed(3);
      const sh = (a) => Math.min(1, a * this.params.underShade).toFixed(3);

      this.flapGrad.style.transform = shadeTransform;
      this.flapGrad.style.background = `linear-gradient(to right,
        rgba(0,0,0,${hi(0.2)}) 0px,
        rgba(0,0,0,${hi(0.04)}) ${px(0.1)},
        rgba(255,255,255,${hi(0.65)}) ${px(0.26)},
        rgba(255,255,255,${hi(0.1)}) ${px(0.6)},
        rgba(0,0,0,${hi(0.1)}) ${px(1)})`;

      this.underShade.style.clipPath = this.underShade.style.webkitClipPath = clip;
      this.underGrad.style.transform = shadeTransform;
      this.underGrad.style.opacity = Math.min(1, f.length / 60); // 刚开始拖时阴影淡一点，不突兀
      this.underGrad.style.background = `linear-gradient(to right,
        rgba(0,0,0,${sh(0.55)}) 0px,
        rgba(0,0,0,${sh(0.22)}) ${px(0.22)},
        rgba(0,0,0,0) ${px(0.85)})`;

      this.drawDebug(f, kept, lifted);
    }

    applyClip(card, poly) {
      const v = poly ? G.toClipPath(poly) : '';
      card.style.clipPath = v;
      card.style.webkitClipPath = v;
    }

    // ---------------- 调试：把几何画出来 ----------------
    setDebug(on) {
      this.debug = on;
      this.el.classList.toggle('show-debug', on);
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

  /** '#rrggbb' + 不透明度 → 'rgba(r,g,b,a)' */
  function hexToRgba(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    const n = m ? parseInt(m[1], 16) : 0xf7f7fa;
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }

  PeelStack.DEFAULTS = Object.freeze(Object.assign({}, DEFAULTS)); // 给调参面板用（「恢复默认」）
  return PeelStack;
})();
