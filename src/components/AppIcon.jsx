/*
 * <AppIcon> —— 程序坞里的一个 App 图标（只是样子，点了只会暗一下，什么也不做）
 *
 * 为什么自己画：真的 Apple / 第三方 App 图标有版权，不能放进公开的网站；
 * 彩色的自画图标 Boxi 看了觉得「太假」。所以用 iOS 26/27 的「透明」（Clear）图标风格：
 *   · 底板是一块磨砂玻璃（和程序坞同一种材质，稍微亮一点），不是彩色
 *   · 上面只有一个白色的通用图形（听筒、对话气泡、相机、音符），不是任何 App 的真实图标
 *   · 边缘一圈细亮线，左上和右下更亮（像光打在玻璃边上），中间几乎看不见（INFERRED，近似 Liquid Glass）
 *
 * 画法：一个 64×64 的 SVG（viewBox），缩放到图标的实际大小，所以任何尺寸都清晰。
 *   · 底板：iOS 的连续圆角（squircle，和小组件同一套数学：geometry.js 的 squirclePolygon），
 *     半径 = 边长的 22.5%（INFERRED：量 Boxi 截图里的图标，圆角约 14pt）
 *   · 图形画在 64×64 的坐标里，大约占中间 34×34（和 iOS 图标的留白差不多）
 *   · 渐变、裁切的名字（id）用 useId() 生成，全页面唯一 —— 同名的话浏览器只认第一个
 */
import { useId } from 'react';
import { squirclePolygon } from '../engine/geometry.js';

// 底板形状：只算一次，所有图标共用（是路径数据，不是 id，所以共用没问题）
const TILE = 'M' + squirclePolygon(64, 64, 14.4, 0.6).map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join('L') + 'Z';

// 听筒：先画一个「竖着」的听筒（左边是弯弯的把手，上下两头是朝右的圆头），再整体转 -45°
const HANDSET =
  'M6 -22 H-4 C-10 -22 -13 -13 -13 0 C-13 13 -10 22 -4 22 H6 A5 5 0 0 0 6 12 H-1 ' +
  'C-4.5 12 -7 7 -7 0 C-7 -7 -4.5 -12 -1 -12 H6 A5 5 0 0 0 6 -22 Z';

// 每个 App 的白色图形（都是自己画的通用形状）
const GLYPHS = {
  phone: <path d={HANDSET} transform="translate(33 31) rotate(-45) scale(0.78)" />,
  messages: (
    // 对话气泡：一个扁椭圆 + 左下角一个小尾巴
    <>
      <ellipse cx="32" cy="30.5" rx="17.5" ry="14" />
      <path d="M19.5 37 Q 19 43.5 14.5 46 Q 22.5 46.5 26.5 42 Z" />
    </>
  ),
  camera: (
    // 相机：机身（顶上一小块凸起是取景器）挖掉一圈，中间留镜头
    <>
      <path
        fillRule="evenodd"
        d="M26 22.5 h12 l2.5 3.5 H45 a4 4 0 0 1 4 4 V42 a4 4 0 0 1 -4 4 H19 a4 4 0 0 1 -4 -4 V30 a4 4 0 0 1 4 -4 h4.5 Z M32 27.5 a8.5 8.5 0 1 0 0.01 0 Z"
      />
      <circle cx="32" cy="36" r="5.6" />
    </>
  ),
  music: (
    // 两个连在一起的八分音符
    <>
      <path d="M26 21 L 44.5 17 V 23 L 26 27 Z" />
      <path d="M26 21 V 43.5 M44.5 17 V 39.5" fill="none" stroke="#fff" strokeWidth="3.2" />
      <ellipse cx="21.8" cy="44" rx="5.4" ry="4.2" transform="rotate(-18 21.8 44)" />
      <ellipse cx="40.3" cy="40" rx="5.4" ry="4.2" transform="rotate(-18 40.3 40)" />
    </>
  ),
};

/** app：用哪个图形（上面 GLYPHS 里的名字）；name：App 名（不显示，只给读屏软件念） */
export default function AppIcon({ app, name }) {
  const uid = useId();
  const fillId = `${uid}fill`;
  const glowId = `${uid}glow`;
  const rimId = `${uid}rim`;
  const clipId = `${uid}clip`;
  const shadowId = `${uid}shadow`;
  return (
    <div className="app" role="img" aria-label={name}>
      <svg className="app__icon" viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          {/* 磨砂玻璃底：上面亮一点、下面淡一点（整块都是半透明的白，透出程序坞的玻璃） */}
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.24" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.12" />
          </linearGradient>
          {/* 玻璃里面一团很柔的高光，在左上 */}
          <radialGradient id={glowId} cx="0.3" cy="0" r="0.9">
            <stop offset="0" stopColor="#fff" stopOpacity="0.16" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          {/* 边缘亮线：左上最亮，右下次亮，中间几乎没有 */}
          <linearGradient id={rimId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.75" />
            <stop offset="0.35" stopColor="#fff" stopOpacity="0.12" />
            <stop offset="0.65" stopColor="#fff" stopOpacity="0.06" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.4" />
          </linearGradient>
          <clipPath id={clipId}>
            <path d={TILE} />
          </clipPath>
          {/* 图形下面一点点很淡的影子，让白色图形在浅色壁纸上也看得清 */}
          <filter id={shadowId} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0.8" stdDeviation="1" floodColor="#000" floodOpacity="0.16" />
          </filter>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <path d={TILE} fill={`url(#${fillId})`} />
          <path d={TILE} fill={`url(#${glowId})`} />
          <g fill="#fff" fillOpacity="0.96" filter={`url(#${shadowId})`}>
            {GLYPHS[app]}
          </g>
          {/* 线宽 1.8，一半在形状外面被裁掉，看起来是贴着边的一条 0.9 的内描边 */}
          <path d={TILE} fill="none" stroke={`url(#${rimId})`} strokeWidth="1.8" />
        </g>
      </svg>
    </div>
  );
}
