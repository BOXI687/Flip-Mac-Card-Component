/*
 * geometry.js —— 翻角效果背后的全部数学
 *
 * 核心思想（一句话）：
 *   把纸的一角 C 拉到手指位置 P，折痕就是线段 CP 的「垂直平分线」。
 *   折痕把卡片切成两块：
 *     - 远离 C 的那块：还平躺着（kept）
 *     - 靠近 C 的那块：被掀起来、翻过去，变成「翻页」(flap)
 *   翻页的位置 = 被切掉那块沿折痕做一次「镜像」。
 *
 * 这个文件只做数学，不碰任何 DOM，也不认识 React，所以最容易读懂，也最容易测试。
 * 坐标系：以卡片左上角为原点 (0,0)，x 向右、y 向下，单位是 px。
 *
 * 它是一个 ES module（模块）：函数前面写 export，就是把它「交出去」，
 * 别的文件用 import * as G from './geometry.js' 拿来用 —— 不再挂在 window 上。
 */

// ---------- 向量小工具 ----------
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const scale = (a, s) => ({ x: a.x * s, y: a.y * s });
export const dot = (a, b) => a.x * b.x + a.y * b.y;
export const length = (a) => Math.hypot(a.x, a.y);
export const distance = (a, b) => length(sub(a, b));
export const normalize = (a) => {
  const l = length(a);
  return l > 0 ? scale(a, 1 / l) : { x: 0, y: 0 };
};

/** 卡片的矩形轮廓（顺时针四个点） */
export function rectPolygon(w, h) {
  return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
}

/**
 * iOS 的「连续圆角」（squircle）轮廓，顺时针一圈点。
 *   普通 border-radius：直边在某一点突然接上一段圆弧，曲率一下子从 0 跳到 1/r，看着有点「硬」。
 *   连续圆角：直边先用一段贝塞尔曲线慢慢弯进来，中间才是一小段圆弧，所以拐角更柔和。
 *   Apple 设计稿（iOS 27 UI Kit，Sketch 版）里小组件的圆角写的就是
 *   「Radius 28，Style: Smooth Apple (60%)」—— smoothing 就是这里的 0.6。
 * 算法和 Figma 的 corner smoothing 一样（每个角：贝塞尔 + 圆弧 + 贝塞尔），
 * 再把曲线采样成点，好喂给 clipHalfPlane 和 CSS 的 polygon()。
 * 形状是凸的，所以用直线切它（clipHalfPlane）结果依然正确。
 */
export function squirclePolygon(w, h, r, smoothing = 0.6, steps = 8) {
  const budget = Math.min(w, h) / 2;
  r = Math.min(r, budget);
  if (r <= 0) return rectPolygon(w, h);
  // 以下是 Figma 的做法：p = 圆角从直边开始「弯」的长度，超出一半边长就压缩平滑度
  let s = smoothing;
  let p = (1 + s) * r;
  if (p > budget) {
    s = Math.max(0, Math.min(s, budget / r - 1));
    p = Math.min(p, budget);
  }
  const rad = Math.PI / 180;
  const arcMeasure = 90 * (1 - s); // 中间那段真正圆弧的角度
  const arcLen = Math.sin((arcMeasure / 2) * rad) * r * Math.SQRT2; // 圆弧两端点在 x、y 上各差多少
  const alpha = (90 - arcMeasure) / 2;
  const p3p4 = r * Math.tan((alpha / 2) * rad);
  const beta = 45 * s;
  const c = p3p4 * Math.cos(beta * rad);
  const d = c * Math.tan(beta * rad);
  const b = (p - arcLen - c - d) / 3;
  const a = 2 * b;

  // 先算「右上角」这一个角：从 (-p, 0) 走到 (0, p)，坐标相对于角尖 (w, 0)
  const quarter = [];
  const bez = (P0, P1, P2, P3) => {
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      quarter.push({
        x: u * u * u * P0.x + 3 * u * u * t * P1.x + 3 * u * t * t * P2.x + t * t * t * P3.x,
        y: u * u * u * P0.y + 3 * u * u * t * P1.y + 3 * u * t * t * P2.y + t * t * t * P3.y,
      });
    }
  };
  const S0 = { x: -p, y: 0 };
  quarter.push(S0);
  const S1 = { x: -p + a + b + c, y: d };
  bez(S0, { x: -p + a, y: 0 }, { x: -p + a + b, y: 0 }, S1);
  // 圆弧：圆心在 (-r, r)，从 S1 顺时针转到 S2
  const S2 = { x: S1.x + arcLen, y: S1.y + arcLen };
  const a0 = Math.atan2(S1.y - r, S1.x + r);
  const a1 = Math.atan2(S2.y - r, S2.x + r);
  const arcSteps = Math.max(2, Math.round(steps / 2));
  for (let i = 1; i <= arcSteps; i++) {
    const t = a0 + ((a1 - a0) * i) / arcSteps;
    quarter.push({ x: -r + r * Math.cos(t), y: r + r * Math.sin(t) });
  }
  bez(S2, { x: S2.x + d, y: S2.y + c }, { x: S2.x + d, y: S2.y + b + c }, { x: 0, y: p });

  // 其余三个角由右上角旋转 / 翻转得到（顺时针：右上 → 右下 → 左下 → 左上）
  const out = [];
  for (const q of quarter) out.push({ x: w + q.x, y: q.y });
  for (const q of quarter) out.push({ x: w - q.y, y: h + q.x });
  for (const q of quarter) out.push({ x: -q.x, y: h - q.y });
  for (const q of quarter) out.push({ x: q.y, y: -q.x });
  return out;
}

/** 四个角，name 方便调试显示 */
export function corners(w, h) {
  return [
    { name: 'tl', x: 0, y: 0 },
    { name: 'tr', x: w, y: 0 },
    { name: 'br', x: w, y: h },
    { name: 'bl', x: 0, y: h },
  ];
}

/**
 * 计算折痕。
 *   C: 被拖动的那个角（固定不变）
 *   P: 角现在被拖到的位置（跟着手指）
 * 返回：
 *   M      折痕经过的点（CP 的中点）
 *   n      折痕的单位法向量（从 C 指向 P 的方向）
 *   length |CP|，拖动的距离
 *   dist(X) 点 X 到折痕的「有符号距离」：
 *            > 0 在平躺那一侧，< 0 在被掀起那一侧（C 所在的一侧）
 */
export function fold(C, P) {
  const d = sub(P, C);
  const len = length(d);
  if (len < 0.01) return null; // 还没拖动，没有折痕
  const n = scale(d, 1 / len);
  const M = scale(add(C, P), 0.5);
  return {
    C, P, M, n,
    length: len,
    dist: (X) => (X.x - M.x) * n.x + (X.y - M.y) * n.y,
  };
}

/**
 * 用一条直线切多边形，只保留 f(X) >= 0 的那一半。
 * 这就是经典的 Sutherland–Hodgman 裁剪算法（只用一条裁剪边）。
 * 逐条边检查：
 *   - 起点在保留侧 → 保留起点
 *   - 边跨过了直线 → 把交点加进来
 */
export function clipHalfPlane(poly, f) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = f(a);
    const db = f(b);
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db); // 线性插值求交点
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

/**
 * 沿折痕做镜像的 2D 仿射矩阵，直接喂给 CSS 的 matrix(a, b, c, d, e, f)。
 *
 *   镜像公式：X' = X - 2 * ((X - M)·n) * n
 *   展开成矩阵形式：X' = A·X + t
 *     A = I - 2·n·nᵀ           （2x2 部分）
 *     t = 2·(M·n)·n             （平移部分）
 *
 * CSS matrix(a,b,c,d,e,f) 的含义是：
 *   x' = a·x + c·y + e
 *   y' = b·x + d·y + f
 */
export function reflectionMatrix(fd) {
  const { n, M } = fd;
  const mn = dot(M, n);
  return [
    1 - 2 * n.x * n.x, // a
    -2 * n.x * n.y, // b
    -2 * n.x * n.y, // c
    1 - 2 * n.y * n.y, // d
    2 * mn * n.x, // e
    2 * mn * n.y, // f
  ];
}

/** 把点镜像过折痕（调试和测试用，和上面的矩阵是同一个公式） */
export function reflectPoint(X, fd) {
  return sub(X, scale(fd.n, 2 * fd.dist(X)));
}

/** 多边形 → CSS clip-path 字符串 */
export function toClipPath(poly) {
  if (poly.length < 3) return 'polygon(0 0, 0 0, 0 0)'; // 空形状 = 全部裁掉
  return 'polygon(' + poly.map((p) => `${p.x.toFixed(2)}px ${p.y.toFixed(2)}px`).join(', ') + ')';
}

/** 多边形面积（鞋带公式），用来判断「翻过去多少了」 */
export function area(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}
