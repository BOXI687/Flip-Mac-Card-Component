/*
 * 播客·待播清单（Podcasts Up Next，只有中号）
 *   紫色渐变底，左上「待播清单」，右上播客图标；
 *   下面两集：方形封面 + 标题（最多两行）+ 一行灰字 + 右边圆形播放按钮。
 *   听了一半的那集，播放按钮外面有一圈进度。
 *
 * 节目名、封面都是编的：封面用几个简单的形状画（不用任何真实节目的图片或标志）。
 */
import { useId } from 'react';

/** 播客 App 的图标样子：同心的「信号」弧线 + 中间一个点 + 下面一根小柄（自己画的） */
function PodcastGlyph() {
  return (
    <svg className="pod__glyph" viewBox="0 0 24 26" aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round">
      <path d="M6.3 18.6a9.6 9.6 0 1 1 11.4 0" strokeWidth="1.9" />
      <path d="M8.6 14.9a5.4 5.4 0 1 1 6.8 0" strokeWidth="1.9" />
      <circle cx="12" cy="10.8" r="2.3" fill="currentColor" stroke="none" />
      <path d="M12 14.6v8.2" strokeWidth="3.2" />
    </svg>
  );
}

/** 编出来的封面：只用色块和几何形状 */
function Cover({ art }) {
  const id = useId(); // 渐变的名字，全页面唯一
  if (art === 'dawn') {
    // 暖色：一轮太阳落在两道山坡后面
    return (
      <svg className="pod__cover" viewBox="0 0 48 48" aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffd9a8" />
            <stop offset="1" stopColor="#ff8a65" />
          </linearGradient>
        </defs>
        <rect width="48" height="48" fill={`url(#${id})`} />
        <circle cx="30" cy="24" r="9" fill="#fff4e0" />
        <path d="M0 34q12-10 26 0t22-4v18H0z" fill="#e5603f" />
        <path d="M0 40q14-8 30 1t18 0v7H0z" fill="#b8402e" />
      </svg>
    );
  }
  // 冷色：深色底上几条错开的弧线，像声波
  return (
    <svg className="pod__cover" viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" fill="#12202b" />
      <g fill="none" strokeWidth="3" strokeLinecap="round">
        <path d="M8 34a16 16 0 0 1 32 0" stroke="#3fd0c9" />
        <path d="M14 34a10 10 0 0 1 20 0" stroke="#8be0a4" />
        <path d="M20 34a4 4 0 0 1 8 0" stroke="#f4e285" />
      </g>
    </svg>
  );
}

/** 圆形播放按钮。progress（0~1）：听过的部分，按钮外面画一圈进度 */
function PlayButton({ progress = 0 }) {
  const r = 12.6;
  const c = 2 * Math.PI * r;
  return (
    <span className="pod__play" aria-hidden="true">
      <svg viewBox="0 0 28 28">
        <circle cx="14" cy="14" r="14" className="pod__play-bg" />
        {progress > 0 && (
          <circle cx="14" cy="14" r={r} className="pod__play-ring" transform="rotate(-90 14 14)"
            strokeDasharray={`${(c * progress).toFixed(2)} ${c.toFixed(2)}`} />
        )}
        <path d="M11.1 8.6v10.8l8.5-5.4z" fill="#fff" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export default function Podcasts({ episodes }) {
  return (
    <div className="pod">
      <div className="pod__head">
        <span className="pod__title">待播清单</span>
        <PodcastGlyph />
      </div>
      {episodes.slice(0, 2).map((ep, i) => (
        <div key={ep.title} className={`pod__ep pod__ep--${i}`}>
          <Cover art={ep.art} />
          <div className="pod__text">
            <div className="pod__ep-title">{ep.title}</div>
            <div className="pod__meta">{ep.meta.join(' · ')}</div>
          </div>
          <PlayButton progress={ep.progress} />
        </div>
      ))}
    </div>
  );
}
