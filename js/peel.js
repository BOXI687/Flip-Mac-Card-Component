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
 * 状态机：
 *   idle ──按住角落──▶ dragging ──松手──▶ returning（弹回）──▶ idle
 *                                  └────▶ flipping（翻走）──▶ idle（顺序已交换）
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
  const SPRING_RETURN = spring(0.38, 0.82); // 弹回：略带一点回弹，像纸的弹性
  const SPRING_FLIP = spring(0.55, 1.0); // 翻走：干脆利落
  const SPRING_PEEK = spring(0.3, 0.9); // 轻点/提示时掀一下

  class PeelStack {
    constructor(el, options = {}) {
      this.el = el;
      this.opts = Object.assign(
        {
          cornerHit: 0.45, // 角落热区半径 = 卡片高度 × 这个比例
          flickVelocity: 500, // 甩动超过这个速度（px/s）也算翻页
          onChange: () => {},
        },
        options
      );
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
      const hit = this.H * this.opts.cornerHit;
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
      if (this.pointerId != null || this.state === 'flipping') return;
      const p = this.local(e);

      if (this.state === 'returning' && G.distance(p, this.P) < this.H * this.opts.cornerHit) {
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
      this.samples = [{ t: e.timeStamp, p }];
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
      this.P = G.add(p, this.grabOffset);
      if (G.distance(p, this.downPoint) > 4) this.moved = true;
      // 只保留最近 100ms 的采样，用来算松手时的速度
      this.samples.push({ t: e.timeStamp, p });
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

      this.v = this.releaseVelocity();
      const f = G.fold(this.C, this.P);
      const center = { x: this.W / 2, y: this.H / 2 };
      const vAlong = f ? G.dot(this.v, f.n) : 0; // 速度在拖动方向上的分量
      // 翻页条件：折痕越过卡片中心（翻过一半） 或者 快速甩动
      let flip = !!f && (f.dist(center) < 0 || (vAlong > this.opts.flickVelocity && f.length > 20));
      if (vAlong < -300) flip = false; // 往回甩 = 反悔

      if (flip) this.flipAway(f.n);
      else this.animateTo(this.C, SPRING_RETURN, 'returning', () => this.reset());
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

    // ---------------- 翻页生命周期 ----------------
    beginPeel(corner) {
      this.C = { x: corner.x, y: corner.y };
      this.P = { x: corner.x, y: corner.y };
      this.peelCard = this.top;
      this.swapped = false;
      // 把顶层卡片克隆一份放到翻页上。镜像之后，它就像「透过纸背看到的反字」
      const clone = this.peelCard.cloneNode(true);
      clone.removeAttribute('aria-label');
      clone.style.cssText = '';
      this.flapFront.replaceChildren(clone);
      this.flapWrap.style.display = 'block';
      this.underShade.style.display = 'block';
      this.flapWrap.style.opacity = 1;
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
      const back = () => this.animateTo(this.C, SPRING_RETURN, 'returning', () => this.reset());
      this.animateTo(peekTo, SPRING_PEEK, 'returning', back, 6); // 6 = 离目标 6px 内就开始往回收
    }

    flipAway(n) {
      // 目标：沿拖动方向拉得足够远，让折痕完全越过整张卡片
      let far = 0;
      for (const X of G.corners(this.W, this.H)) far = Math.max(far, G.dot(G.sub(X, this.C), n));
      const target = G.add(this.C, G.scale(n, far * 2 + this.W * 0.9));
      this.animateTo(target, SPRING_FLIP, 'flipping', () => this.reset(), 20);
    }

    /** 顶层卡片完全被掀走的那一刻：交换顺序 */
    swapCards() {
      if (this.swapped) return;
      this.swapped = true;
      this.peelCard.style.clipPath = '';
      this.peelCard.style.webkitClipPath = '';
      this.cards.push(this.cards.shift());
      this.layoutZ();
      this.underShade.style.display = 'none';
      this.opts.onChange(this.cards);
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
      if (this.state === 'returning' || this.state === 'flipping') this.stepSpring(dt);
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
      if (!this.swapped) {
        if (kept.length < 3) this.swapCards();
        else this.applyClip(this.peelCard, kept);
      }

      // 2) 翻页：裁出被掀起的部分，再沿折痕镜像过去
      const clip = G.toClipPath(lifted);
      this.flap.style.clipPath = this.flap.style.webkitClipPath = clip;
      this.flap.style.transform = `matrix(${G.reflectionMatrix(f).map((v) => v.toFixed(5)).join(',')})`;

      // 3) 光影：高光和阴影都以折痕为起点，朝被掀起的一侧渐变
      const s = f.length / 2; // 折痕到角尖的距离 = 翻页的「宽度」
      const angle = (Math.atan2(-f.n.y, -f.n.x) * 180) / Math.PI;
      const shadeTransform = `translate(${f.M.x}px, ${f.M.y}px) rotate(${angle}deg) translate(0, -50%)`;
      const px = (r) => `${(r * s).toFixed(1)}px`;

      this.flapGrad.style.transform = shadeTransform;
      this.flapGrad.style.background = `linear-gradient(to right,
        rgba(0,0,0,0.20) 0px,
        rgba(0,0,0,0.04) ${px(0.1)},
        rgba(255,255,255,0.65) ${px(0.26)},
        rgba(255,255,255,0.10) ${px(0.6)},
        rgba(0,0,0,0.10) ${px(1)})`;

      this.underShade.style.clipPath = this.underShade.style.webkitClipPath = clip;
      this.underGrad.style.transform = shadeTransform;
      this.underGrad.style.opacity = Math.min(1, f.length / 60); // 刚开始拖时阴影淡一点，不突兀
      this.underGrad.style.background = `linear-gradient(to right,
        rgba(0,0,0,0.55) 0px,
        rgba(0,0,0,0.22) ${px(0.22)},
        rgba(0,0,0,0) ${px(0.85)})`;

      // 4) 翻走阶段：折痕越过卡片后，让翻页渐渐淡出
      if (this.state === 'flipping') {
        let beyond = Infinity;
        for (const X of rect) beyond = Math.min(beyond, -f.dist(X));
        this.flapWrap.style.opacity = Math.max(0, 1 - Math.max(0, beyond) / (this.W * 0.45));
      }

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
        ${dot(f.P, '#0a84ff', 'P 手指')}`;
    }
  }

  return PeelStack;
})();
