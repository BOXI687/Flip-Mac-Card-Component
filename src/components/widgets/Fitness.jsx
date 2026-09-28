/*
 * 健身·活动（Fitness activity，只有中号）
 *   左边：一个很粗的红色圆环（暗红是「还没完成」的轨道，亮红是完成的部分），
 *        环的末端有一个带箭头的红色小圆 —— 和 iOS 的「活动圆环」一样
 *   右边：活动 x/500大卡（红字）、步数、距离（灰字）
 */
import { useId } from 'react';

// 圆环画在 100×100 的格子里（中心 50,50）。环宽 20.5 ≈ 外径的 20.5%（量自 Boxi 的截图：外径 129、环宽 26.5）
const R = 39.75; // 环的中线半径 = (100 - 20.5) / 2
const STROKE = 20.5;
const C = 2 * Math.PI * R;

export default function Fitness({ move, goal, steps, distance }) {
  const shadowId = useId(); // 阴影滤镜的名字，全页面唯一
  const p = Math.max(0, Math.min(1, move / goal));
  // 末端的小圆：沿着圆环走到进度的位置（角度 0 = 正上方，顺时针）
  const a = p * Math.PI * 2;
  const tip = { x: 50 + Math.sin(a) * R, y: 50 - Math.cos(a) * R };
  const tipDeg = (a * 180) / Math.PI;
  return (
    <div className="fit">
      <svg className="fit__ring" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <filter id={shadowId} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="1.6" floodColor="#000" floodOpacity="0.55" />
          </filter>
        </defs>
        <circle cx="50" cy="50" r={R} className="fit__track" strokeWidth={STROKE} />
        {p > 0 && (
          <circle cx="50" cy="50" r={R} className="fit__progress" strokeWidth={STROKE} transform="rotate(-90 50 50)"
            strokeDasharray={`${(C * p).toFixed(2)} ${C.toFixed(2)}`} />
        )}
        {/* 末端小圆（直径 ≈ 环宽的 95%）+ 箭头：箭头方向就是圆环前进的方向 */}
        <g transform={`translate(${tip.x.toFixed(2)} ${tip.y.toFixed(2)}) rotate(${tipDeg.toFixed(1)})`}>
          <circle r={9.7} className="fit__tip" filter={`url(#${shadowId})`} />
          <path d="M-4.6 0H4.4M0.6-3.9 4.5 0 0.6 3.9" fill="none" stroke="#1a0006" strokeWidth="1.9"
            strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>
      <dl className="fit__stats">
        <dt>活动</dt>
        <dd className="fit__move">
          {move}/{goal}
          <small>大卡</small>
        </dd>
        <dt>步数</dt>
        <dd>{steps.toLocaleString('en-US')}</dd>
        <dt>距离</dt>
        <dd>
          {distance.toFixed(1)}
          <small>英里</small>
        </dd>
      </dl>
    </div>
  );
}
