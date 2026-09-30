/*
 * <AppIcon> —— 主屏幕上的一个 App 图标（只是样子，点了什么也不做）
 *
 * 为什么自己画：真的 Apple / 第三方 App 图标有版权，不能放进公开的网站。
 * 所以每个图标都是「彩色底 + 简单的白色图形」，一看就是「电话」「信息」这类通用 App，但不是任何真实的图标。
 *
 * 画法：一个 64×64 的 SVG（viewBox），缩放到图标的实际大小，所以任何尺寸都清晰。
 *   · 底板：iOS 的连续圆角（squircle，和小组件同一套数学：geometry.js 的 squirclePolygon），
 *     半径 = 边长的 22.5%（INFERRED：量 Boxi 截图里 64pt 的图标，圆角约 14pt）
 *   · 底板上一层很淡的「玻璃高光」（上亮下暗）+ 边缘一圈细亮线：iOS 26 之后图标的 Liquid Glass 质感（INFERRED，近似）
 *   · 渐变的名字（id）用 useId() 生成，全页面唯一 —— 同名的话浏览器只认第一个
 */
import { useId } from 'react';
import { squirclePolygon } from '../engine/geometry.js';

// 底板形状：只算一次，所有图标共用（是路径数据，不是 id，所以共用没问题）
const TILE = 'M' + squirclePolygon(64, 64, 14.4, 0.6).map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join('L') + 'Z';

// 齿轮（设置）：8 个齿，外半径 21、齿根 16.5，中间挖一个洞。用程序算出来，不是描别人的图
const GEAR = (() => {
  const pts = [];
  const at = (r, deg) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return `${(32 + r * Math.cos(a)).toFixed(2)} ${(32 + r * Math.sin(a)).toFixed(2)}`;
  };
  for (let i = 0; i < 8; i++) {
    const c = i * 45;
    pts.push(at(16.5, c - 16), at(21, c - 9), at(21, c + 9), at(16.5, c + 16));
  }
  return `M${pts.join('L')}Z M32 25.5a6.5 6.5 0 1 0 0.01 0Z`;
})();

/*
 * 每个 App：底色渐变（从上到下两个颜色）+ 图形。
 * 图形画在 64×64 的坐标里，大约占中间 36×36（和 iOS 图标的留白差不多）
 */
const APPS = {
  phone: {
    bg: ['#6af07f', '#1fc440'],
    glyph: (
      // 听筒：一段弯弯的「把手」，两头各一个厚一点的圆头（听的一头、说的一头）
      <g fill="none" stroke="#fff" strokeLinecap="round">
        <path d="M21.5 22 Q 21 38.5 42 42.5" strokeWidth="7" />
        <path d="M19.5 17.5 L 21 26" strokeWidth="10.5" />
        <path d="M38 43.5 L 46.5 45" strokeWidth="10.5" />
      </g>
    ),
  },
  messages: {
    bg: ['#6af07f', '#1fc440'],
    glyph: (
      // 对话气泡：一个扁椭圆 + 左下角一个小尾巴
      <g fill="#fff">
        <ellipse cx="32" cy="30.5" rx="19.5" ry="15.5" />
        <path d="M17.5 39 Q 17 45.5 12.5 48 Q 21.5 48.5 25.5 43.5 Z" />
      </g>
    ),
  },
  camera: {
    bg: ['#f0f0f3', '#b8b8bf'],
    glyph: (
      <g>
        {/* 机身：深色圆角长方形，顶上一小块凸起（取景器） */}
        <path d="M25 21.5 h14 l2.5 4 H47 a4 4 0 0 1 4 4 V43 a4 4 0 0 1 -4 4 H17 a4 4 0 0 1 -4 -4 V29.5 a4 4 0 0 1 4 -4 h5.5 Z" fill="#2c2c2e" />
        {/* 镜头：一圈浅灰 + 深色玻璃 + 一点反光 */}
        <circle cx="32" cy="36" r="8.5" fill="#8e8e93" />
        <circle cx="32" cy="36" r="6.2" fill="#1c1c1e" />
        <circle cx="29.8" cy="33.8" r="1.8" fill="#fff" opacity="0.55" />
        {/* 右上角的小黄灯 */}
        <circle cx="45.5" cy="31" r="1.6" fill="#ffd60a" />
      </g>
    ),
  },
  music: {
    bg: ['#ff7a6b', '#f2334f'],
    glyph: (
      // 两个连在一起的八分音符
      <g fill="#fff">
        <path d="M26 20.5 L 45 16.5 V 40" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinejoin="round" />
        <path d="M26 20.5 V 44" fill="none" stroke="#fff" strokeWidth="3.4" />
        <path d="M26 20.5 L 45 16.5 V 22.5 L 26 26.5 Z" />
        <ellipse cx="21.5" cy="44.5" rx="5.6" ry="4.4" transform="rotate(-18 21.5 44.5)" />
        <ellipse cx="40.5" cy="40.5" rx="5.6" ry="4.4" transform="rotate(-18 40.5 40.5)" />
      </g>
    ),
  },
  photos: {
    bg: ['#ffd27a', '#ff8a4f'],
    glyph: (
      // 风景照：太阳 + 前后两座山
      <g>
        <circle cx="41" cy="23" r="5.5" fill="#fff8df" />
        <path d="M8 50 L 26 30 L 38 43 L 44 37 L 58 50 Z" fill="#b8466b" />
        <path d="M8 50 L 22 39 L 34 50 Z" fill="#7d2f5c" />
      </g>
    ),
  },
  maps: {
    bg: ['#e9f2dc', '#cfe2b8'],
    glyph: (
      <g>
        {/* 右上角一片湖 */}
        <path d="M40 6 C 44 14, 52 16, 58 14 V 6 Z" fill="#9fd3f5" />
        {/* 一条白色大路 + 一条黄色小路 */}
        <path d="M4 44 C 20 40, 30 26, 60 22" fill="none" stroke="#fff" strokeWidth="6.5" />
        <path d="M22 60 C 26 46, 34 40, 44 4" fill="none" stroke="#ffd35c" strokeWidth="3.5" />
        {/* 定位针 */}
        <path d="M32 44 C 26 36, 24 32.5, 24 29 a8 8 0 0 1 16 0 c0 3.5 -2 7 -8 15 Z" fill="#ff453a" />
        <circle cx="32" cy="29" r="3.1" fill="#fff" />
      </g>
    ),
  },
  notes: {
    bg: ['#ffdf6e', '#ffc21f'],
    glyph: (
      // 几行字（长短不一，像写了一段笔记）
      <g stroke="#fff" strokeWidth="4" strokeLinecap="round">
        <path d="M18 23 H 46" />
        <path d="M18 32 H 42" />
        <path d="M18 41 H 34" />
      </g>
    ),
  },
  settings: {
    bg: ['#9c9ca3', '#62626a'],
    glyph: (
      <g>
        <path d={GEAR} fill="#e9e9ee" fillRule="evenodd" />
        <circle cx="32" cy="32" r="10.5" fill="none" stroke="#7a7a82" strokeWidth="2" />
      </g>
    ),
  },
};

/**
 * app：用哪个图标（上面 APPS 里的名字）；name：App 名
 * showName：图标下面写不写名字（程序坞里和 iOS 一样不写；读屏软件照样能念出来）
 */
export default function AppIcon({ app, name, showName = true }) {
  const uid = useId();
  const { bg, glyph } = APPS[app];
  const bgId = `${uid}bg`;
  const shineId = `${uid}shine`;
  const clipId = `${uid}clip`;
  return (
    <div className="app" role="img" aria-label={name}>
      <svg className="app__icon" viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id={bgId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={bg[0]} />
            <stop offset="1" stopColor={bg[1]} />
          </linearGradient>
          {/* 玻璃高光：左上一点点亮，往右下淡掉 */}
          <linearGradient id={shineId} x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
            <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <clipPath id={clipId}>
            <path d={TILE} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <path d={TILE} fill={`url(#${bgId})`} />
          {glyph}
          <path d={TILE} fill={`url(#${shineId})`} />
          {/* 边缘的细亮线（一半在形状外面，被裁掉，所以看起来是贴着边的一条内描边） */}
          <path d={TILE} fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.2" />
        </g>
      </svg>
      {showName && (
        <p className="app__name" aria-hidden="true">
          {name}
        </p>
      )}
    </div>
  );
}
