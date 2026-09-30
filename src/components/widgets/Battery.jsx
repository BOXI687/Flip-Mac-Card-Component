/*
 * 电池小组件（Batteries）
 *   中号：4 个圆环排一行，下面写百分比
 *   小号：4 个圆环排成 2×2，不写百分比
 *
 * 组件（component）就像 Figma 里的 Component：画一次，到处用。
 * size 这个属性（prop）就像 Figma 的 Variant：同一个组件，切到 'medium' 或 'small' 长得不一样。
 * devices 也是属性：换一组数据，画出来的内容就跟着变。
 *
 * 圆环、图标的数值出处写在 styles/widgets.css 里。
 */
import { useId } from 'react';

// ---- 画图小工具：用「奇偶填充」(fill-rule: evenodd) 在图形上挖洞 ----
const circ = (cx, cy, r) => `M${cx + r} ${cy}a${r} ${r} 0 1 0 ${-2 * r} 0a${r} ${r} 0 1 0 ${2 * r} 0Z`;
const rrect = (x, y, w, h, r) =>
  `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}` +
  `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;

// 图标都画在 24x24 的格子里，照着 SF Symbols 的比例重画（不直接用 Apple 的图标文件）。
// fill="currentColor" 让它们跟随 CSS 的 color
const ICONS = {
  iphone: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="2.5" width="10" height="19" rx="2.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="10.4" y="4.4" width="3.2" height="1.1" rx="0.55" fill="currentColor" />
    </svg>
  ),
  airpods: (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <ellipse cx="7.6" cy="7.6" rx="3.3" ry="3.5" />
      <rect x="8.2" y="8.4" width="2.3" height="10.4" rx="1.15" />
      <ellipse cx="16.4" cy="7.6" rx="3.3" ry="3.5" />
      <rect x="13.5" y="8.4" width="2.3" height="10.4" rx="1.15" />
    </svg>
  ),
  // 充电盒：圆角盒子，挖出盖子的缝和前面的指示灯
  case: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" fillRule="evenodd" d={`${rrect(3.5, 5.5, 17, 14, 5)}M3.55 9.75H20.45V10.65H3.55Z${circ(12, 13.6, 0.9)}`} />
    </svg>
  ),
  // 音箱：长方块，挖出上面的小喇叭和下面的大喇叭（大喇叭中间再补一个实心点）
  speaker: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" fillRule="evenodd" d={`${rrect(6, 2.5, 12, 19, 2.4)}${circ(12, 7, 1.6)}${circ(12, 15, 3.7)}${circ(12, 15, 1.4)}`} />
    </svg>
  ),
};

// 圆环画在 64x64 的格子里。线宽 6.2：量自 Apple 官方图里的电池小组件（环宽 ≈ 外径的 9.7%）
const RING_STROKE = 6.2;
const RING_R = 32 - RING_STROKE / 2; // 外边正好贴着格子边
const RING_C = 2 * Math.PI * RING_R; // 周长，dasharray 要用

// 充电的闪电：画在圆环正上方，圆环在闪电周围「断开」一圈（用遮罩挖掉，和 iOS 一样）
const BOLT = 'M7 1 1.8 9h3.6L4.6 15 10.2 6.8H6.6z'; // 12x16 的格子
const BOLT_AT = 'translate(26 -5.5)'; // 放到圆环顶上居中

/**
 * hero：这是不是电量最低的那个设备。掀开上面那张卡时，它的圆环、图标、百分比会挤进口子里
 *   （data-peek 标出来，说明写在文件最后的 Battery.peek）；别的设备整个标成 "rest"，只负责变淡。
 *   小号平时不写百分比，但偷看时要看到数字，所以给它藏一个只在偷看时出现的百分比（data-peek-only）
 */
function BatteryRing({ device, withPct, hero }) {
  // 遮罩要有一个全页面唯一的名字（id）。不能几个圆环共用一个：浏览器只认页面里第一个同名的，
  // 要是第一个恰好在一张藏起来的卡片里，所有用它的圆环都会一起消失。useId() 给每个组件一个不重复的名字
  const notchId = useId();
  // 进度环的原理：虚线长度 = 周长；把虚线往回「偏移」没电的那部分，剩下的就是电量
  const offset = RING_C * (1 - device.level / 100);
  const color = device.level <= 20 ? 'var(--red)' : 'var(--green)';
  return (
    <div className="battery__item" data-peek={hero ? undefined : 'rest'}>
      <div className="ring">
        <svg className="ring__svg" viewBox="0 0 64 64" aria-hidden="true" data-peek={hero ? 'ring' : undefined}>
          {device.charging && (
            <defs>
              <mask id={notchId} maskUnits="userSpaceOnUse" x="-8" y="-8" width="80" height="80">
                <rect x="-8" y="-8" width="80" height="80" fill="#fff" />
                <path d={BOLT} transform={BOLT_AT} fill="#000" stroke="#000" strokeWidth="3.2" strokeLinejoin="round" />
              </mask>
            </defs>
          )}
          <g mask={device.charging ? `url(#${notchId})` : undefined}>
            <circle cx="32" cy="32" r={RING_R} className="ring__track" />
            <circle
              cx="32" cy="32" r={RING_R} className="ring__progress" transform="rotate(-90 32 32)"
              stroke={color} strokeDasharray={RING_C.toFixed(2)} strokeDashoffset={offset.toFixed(2)}
            />
          </g>
          {device.charging && <path className="ring__bolt" d={BOLT} transform={BOLT_AT} fill={color} />}
        </svg>
        <div className="ring__icon" data-peek={hero ? 'icon' : undefined}>{ICONS[device.icon]}</div>
      </div>
      {withPct && <div className="battery__pct" data-peek={hero ? 'pct' : undefined}>{device.level}%</div>}
      {!withPct && hero && (
        <div className="battery__pct battery__pct--peek" data-peek="pct" data-peek-only aria-hidden="true">{device.level}%</div>
      )}
    </div>
  );
}

export default function Battery({ size = 'medium', devices }) {
  const small = size === 'small';
  const list = devices.slice(0, 4);
  // 电量最低的那个（一样低就取前面那个）：偷看时最想知道的就是它
  const lowest = list.reduce((best, d, i) => (d.level < list[best].level ? i : best), 0);
  return (
    <div className={`battery battery--${size}`}>
      {list.map((d, i) => (
        <BatteryRing key={d.icon} device={d} withPct={!small} hero={i === lowest} />
      ))}
    </div>
  );
}

/*
 * 掀开就聚拢（见 engine/reveal.js、CLAUDE.md）：电量最低的设备挤进口子里。
 *   口子小 → 图标 + 百分比；口子大 → 圆环（图标在圆环里）+ 百分比；其它设备留在原位、变淡
 */
const PEEK = {
  hero: 'pct', // 主角（不写的话 = 第一张座位表里的第一个元素）
  roll: 'pct',
  layouts: [
    { either: [{ row: ['icon', 'pct'] }, { col: ['icon', 'pct'] }] },
    { either: [{ row: [{ over: ['ring', 'icon'] }, 'pct'] }, { col: [{ over: ['ring', 'icon'] }, 'pct'] }] },
  ],
};
Battery.peek = { medium: PEEK, small: PEEK };
