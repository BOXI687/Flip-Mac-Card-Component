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
function Cover({ art, peek }) {
  const id = useId(); // 渐变的名字，全页面唯一
  if (art === 'dawn') {
    // 暖色：一轮太阳落在两道山坡后面
    return (
      <svg className="pod__cover" viewBox="0 0 48 48" aria-hidden="true" data-peek={peek}>
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
    <svg className="pod__cover" viewBox="0 0 48 48" aria-hidden="true" data-peek={peek}>
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
function PlayButton({ progress = 0, peek }) {
  const r = 12.6;
  const c = 2 * Math.PI * r;
  return (
    <span className="pod__play" aria-hidden="true" data-peek={peek}>
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
  const list = episodes.slice(0, 2);
  // 偷看时的主角：听了一半的那集（最可能想接着听），没有就是第一集。
  // 它的播放按钮、封面、标题带 data-peek（说明见文件最后的 Podcasts.peek）；
  // 别的东西（头、另一集、那行灰字）只负责变淡（"rest"）
  const hero = Math.max(0, list.findIndex((ep) => ep.progress > 0));
  return (
    <div className="pod">
      <div className="pod__head" data-peek="rest">
        <span className="pod__title">待播清单</span>
        <PodcastGlyph />
      </div>
      {list.map((ep, i) => {
        const tag = (name) => (i === hero ? name : undefined);
        return (
          <div key={ep.title} className={`pod__ep pod__ep--${i}`} data-peek={i === hero ? undefined : 'rest'}>
            <Cover art={ep.art} peek={tag('cover')} />
            <div className="pod__text">
              <div className="pod__ep-title" data-peek={tag('rest')}>{ep.title}</div>
              <div className="pod__meta" data-peek={tag('rest')}>{ep.meta.join(' · ')}</div>
              {/* 只在偷看时出现：同一个标题换成窄一点的两行（原来那一行太宽，口子里放不下），
                  和灰字里最后一项（「还剩24分钟」/ 时长）。都从原来的位置「浮」出来 */}
              {i === hero && (
                <>
                  <div className="pod__peek-title" data-peek="title" data-peek-only aria-hidden="true">{ep.title}</div>
                  <div className="pod__peek-left" data-peek="left" data-peek-only aria-hidden="true">
                    {ep.meta[ep.meta.length - 1]}
                  </div>
                </>
              )}
            </div>
            <PlayButton progress={ep.progress} peek={tag('play')} />
          </div>
        );
      })}
    </div>
  );
}

/*
 * 掀开就聚拢（见 engine/reveal.js、CLAUDE.md）：偷看待播清单，最想要的是「接着听」—— 那集的播放按钮。
 *   口子小 → 只有播放按钮 → 封面 + 播放按钮 → 再加这集的标题和「还剩24分钟」
 *   播放按钮外面那圈进度是整个一起放大、淡入的（不会一点一点画出来，画到一半就是错的进度）
 */
Podcasts.peek = {
  medium: {
    hero: 'play',
    layouts: [
      'play',
      { either: [{ row: ['cover', 'play'] }, { col: ['cover', 'play'] }] },
      {
        either: [
          { row: [{ key: 'cover', scale: 0.8 }, { col: ['title', 'left'], gap: 0.3 }, 'play'], gap: 0.8 },
          { col: [{ row: [{ key: 'cover', scale: 0.8 }, 'play'] }, 'title', 'left'], gap: 0.4 },
        ],
      },
    ],
  },
};
