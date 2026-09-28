/*
 * <PeelStack> —— 一叠小组件（主屏幕上的一个「智能叠放」）
 *
 * 分工：
 *   React（这个文件）：把卡片、右边的小圆点、下面的名字画出来；记住「现在最上面是第几张」（state）
 *   引擎（engine/peel.js + engine/swipe.js）：掀角、上下滑，每一帧直接改 DOM，不经过 React
 *
 * 两边怎么接上：
 *   useRef 拿到真实的 DOM 元素（像在 Figma 里选中一个图层，拿到它的引用）；
 *   useEffect 在元素出现在页面上以后，把引擎「装」上去；组件消失时把引擎拆掉。
 *   引擎换了最上面那张，调用 setIndex 告诉 React —— React 只重画小圆点和名字。
 *
 * 属性（props）：
 *   id       这一叠的 id（测试和调参面板会用）
 *   size     'medium' | 'small'，会原样传给每个小组件
 *   widgets  这一叠里的小组件（见 data.js 的 STACKS），第一个在最上面
 *   onEngine 引擎装好后把它交给父组件（App 用它连上调参面板）
 */
import { useEffect, useRef, useState } from 'react';
import { PeelStack as PeelEngine } from '../engine/peel.js';
import { StackSwiper } from '../engine/swipe.js';

export default function PeelStack({ id, dotsId, size, widgets, onEngine }) {
  const stackRef = useRef(null);
  const layersRef = useRef(null);
  const [index, setIndex] = useState(0); // 现在最上面的是第几张

  useEffect(() => {
    let swiper = null;
    const peel = new PeelEngine(stackRef.current, {
      layers: layersRef.current,
      // 按下的地方不是角落 → 交给上下滑；正在滑的时候角落也不能掀
      onOtherDown: (e) => swiper.onDown(e),
      isBusy: () => swiper.busy,
    });
    swiper = new StackSwiper(peel, { onChange: setIndex });
    peel.swiper = swiper;
    if (onEngine) onEngine(peel);
    return () => {
      if (onEngine) onEngine(null);
      swiper.destroy();
      peel.destroy();
    };
    // 引擎只在这一叠第一次出现时装一次（空数组 = 不因为重新渲染而重装）
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`widget widget--${size}`}>
      <div className="stack-area">
        <div className={`stack${size === 'small' ? ' stack--small' : ''}`} id={id} ref={stackRef}>
          {widgets.map(({ kind, label, Widget, props }) => (
            <section key={kind} className={`card card--${kind}`} aria-label={label}>
              <Widget size={size} {...props} />
            </section>
          ))}
          {/* 引擎的图层（阴影、翻起来的纸角、辅助线）放在这里。
              React 只画这个空盒子，从不往里面放东西，所以引擎可以随便往里加、克隆卡片，
              两边不会打架。它没有 z-index，里面图层的前后顺序和卡片一起排 */}
          <div className="peel-layers" ref={layersRef} />
        </div>
        <div className="dots" id={dotsId} aria-hidden="true">
          {widgets.map((w, i) => (
            <span key={w.kind} className={i === index ? 'is-active' : undefined} />
          ))}
        </div>
      </div>
      {/* 主屏幕上小组件下面的名字（写的是 App 名，和 iOS 一样），显示的是最上面那张 */}
      <p className="widget__name">{widgets[index].app}</p>
    </div>
  );
}
