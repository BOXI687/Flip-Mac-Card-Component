/*
 * App.jsx —— 整个页面：假装是一块真的 iPhone 主屏幕
 *
 * 从上到下：一个中号叠放 → 一行两个小号叠放 → 一排 4 个 App 图标 → 「搜索」小胶囊 → 程序坞（4 个图标）。
 * 页面上没有任何「原型」的痕迹（没有说明文字、没有调参按钮）：
 * 调参面板藏起来了，长按壁纸空白处约 0.9 秒打开（engine/tuner.js 里的「长按壁纸」）。
 *
 * 每一叠都是一个 <PeelStack>，各有各的引擎，互不影响；调参面板的参数对所有叠都生效。
 * 叠里放哪几张、什么内容，主屏幕上放哪些图标，都在 data.js 里改。
 */
import { useEffect, useRef } from 'react';
import PeelStack from './components/PeelStack.jsx';
import AppIcon from './components/AppIcon.jsx';
import { STACKS, HOME_APPS } from './data.js';
import { Tuner } from './engine/tuner.js';

// 版本标签：A / B 版本在 index.html 的 <html data-variant-label> 里写上名字，页面顶部会显示，免得看混
const VARIANT_LABEL = document.documentElement.dataset.variantLabel;

export default function App() {
  const engines = useRef({}); // 三叠的引擎，由 <PeelStack> 装好后交过来
  const homeRef = useRef(null);
  const keep = (id) => (engine) => {
    engines.current[id] = engine;
  };

  // 这个 effect 在三叠都装好引擎以后才运行（React 先装里面的组件，再装外面的）
  useEffect(() => {
    const { stack: peel, stackSmallA, stackSmallB } = engines.current;
    const smallPeels = [stackSmallA, stackSmallB];
    const all = [peel, ...smallPeels];
    const home = homeRef.current;

    // 1. 电池组件是「玻璃」材质：卡片里画一份和屏幕对齐的壁纸，看起来像透过去看到了壁纸。
    //    （卡片本身必须不透明，不然掀角时会透出下面那张卡，所以是「假玻璃」）
    //    这里告诉 CSS：每一叠在屏幕上的位置、壁纸有多大，好让那份壁纸对齐
    const root = document.documentElement;
    function syncWallpaper() {
      const wp = getComputedStyle(document.body, '::before');
      root.style.setProperty('--wp-w', `${innerWidth}px`);
      root.style.setProperty('--wp-h', wp.height);
      all.forEach(({ el }) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--wp-x', `${(-r.left).toFixed(1)}px`);
        el.style.setProperty('--wp-y', `${(-r.top).toFixed(1)}px`);
      });
    }
    // 电脑上侧边栏开关时内容会滑动：滑动期间每一帧都对齐一次
    let syncing = 0;
    const onRun = (e) => {
      if (e.target !== home || syncing) return;
      const tick = () => {
        syncWallpaper();
        syncing = requestAnimationFrame(tick);
      };
      syncing = requestAnimationFrame(tick);
    };
    const onEnd = (e) => {
      if (e.target !== home) return;
      cancelAnimationFrame(syncing);
      syncing = 0;
      syncWallpaper();
    };
    syncWallpaper();
    window.addEventListener('resize', syncWallpaper);
    home.addEventListener('transitionrun', onRun);
    home.addEventListener('transitionend', onEnd);

    // 2. 调参面板：会先把上次调好的参数（包括壁纸）装回来，所以要在「首次提示」之前
    const tuner = Tuner.attach(peel, smallPeels, { home });
    // 面板在电脑上默认开着（不播动画地把内容推到左边），推完再对齐一次壁纸
    syncWallpaper();
    let raf = requestAnimationFrame(() => (raf = requestAnimationFrame(syncWallpaper)));

    // 3. 可发现性：打开时自动掀一下中号那叠的右下角，暗示「这里可以拖」（面板里可以关掉）
    const hint = peel.params.hintOnLoad ? setTimeout(() => peel.peek('br'), 900) : 0;

    window.peel = peel; // 方便在控制台里玩：peel.peek('tl')、peel.swiper
    window.peels = all; // 所有叠（测试用）
    window.tuner = tuner; // 控制台里 tuner.open() 也能打开面板（测试也用）

    return () => {
      clearTimeout(hint);
      cancelAnimationFrame(raf);
      cancelAnimationFrame(syncing);
      window.removeEventListener('resize', syncWallpaper);
      home.removeEventListener('transitionrun', onRun);
      home.removeEventListener('transitionend', onEnd);
      tuner.destroy();
    };
  }, []);

  return (
    <main className="home" ref={homeRef}>
      {VARIANT_LABEL && <div className="variant-tag">{VARIANT_LABEL}</div>}
      {/* 像 iPhone 主屏幕一样排版：上面一个中号小组件，下面一行两个小号小组件。尺寸、间距见 style.css 顶部 */}
      <div className="screen">
        <PeelStack id="stack" dotsId="dots" size="medium" widgets={STACKS.medium} onEngine={keep('stack')} />
        <div className="widget-row">
          <PeelStack id="stackSmallA" size="small" widgets={STACKS.smallA} onEngine={keep('stackSmallA')} />
          <PeelStack id="stackSmallB" size="small" widgets={STACKS.smallB} onEngine={keep('stackSmallB')} />
        </div>
      </div>

      {/* 一排 App 图标：和小组件对齐的 4 列（尺寸、间距见 style.css「App 图标」） */}
      <div className="apps">
        {HOME_APPS.grid.map((a) => (
          <AppIcon key={a.app} {...a} />
        ))}
      </div>

      {/* 屏幕最下面：「搜索」小胶囊 + 程序坞。margin-top: auto 把它们推到底 */}
      <div className="dock-area">
        <div className="search-pill" role="img" aria-label="搜索">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="6.8" cy="6.8" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.9" />
            <path d="M10.3 10.3 L 14 14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          </svg>
          搜索
        </div>
        <div className="dock">
          {HOME_APPS.dock.map((a) => (
            <AppIcon key={a.app} {...a} showName={false} />
          ))}
        </div>
      </div>
    </main>
  );
}
