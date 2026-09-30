/*
 * 天气小组件（Weather）
 *   中号：左上城市 + 大温度，右上天气图标 + 天气 + 最高/最低，下面一排 6 个小时的预报
 *   小号：城市、大温度、图标、天气、最高/最低，从上往下排
 *
 * 数据是编的（src/data.js 里的 WEATHER），但时间是真的：
 * 逐小时预报从「下一个整点」开始排，日出 / 日落落在这几个小时里就插一格，和 iOS 一样。
 * 天黑以后（日落到日出）背景换成夜空的深蓝，图标换成月亮。
 * 下雨：story.js 说「几点起有雨」，逐小时预报从那一格起画雨的图标，
 * 中号里还有一行小字「16:00 起有雨」（两边用的是同一个数，不会对不上）。
 */
import { useId } from 'react';
import { useNow } from '../../hooks/useNow.js';
import { storyAt } from '../../story.js';

// ---------------- 编出来的「一天的天气」 ----------------
const toHours = ([h, m]) => h + m / 60;

/** 某个钟点的气温：一条平滑的曲线，下午 3 点最热、凌晨 3 点最冷（数值来自 data.js） */
function tempAt(w, hour) {
  const mid = (w.high + w.low) / 2;
  const amp = (w.high - w.low) / 2;
  return Math.round(mid + amp * Math.cos(((hour - 15) / 24) * Math.PI * 2));
}

function isNight(w, hour) {
  return hour < toHours(w.sunrise) || hour >= toHours(w.sunset);
}

/** 某个钟点的天空：白天大多是晴，偶尔几朵云；晚上是晴夜，偶尔有云 */
function skyAt(w, hour) {
  const h = Math.floor(hour) % 24;
  const cloudy = w.cloudyHours.includes(h);
  if (isNight(w, hour)) return cloudy ? 'cloudMoon' : 'moon';
  return cloudy ? 'cloudSun' : 'sun';
}

const SKY_TEXT = { sun: '晴朗', cloudSun: '大部晴朗', moon: '晴朗', cloudMoon: '局部多云' };

/** 下面那排预报：从下一个整点开始的 6 格，日出 / 日落在范围内就插进去。rainFrom：从这个钟点起的格子画雨 */
function hourlyFrom(w, now, rainFrom) {
  const start = now.getHours() + 1;
  const cols = [];
  for (let i = 0; i < 6; i++) {
    const h = (start + i) % 24;
    // 下雨的钟点不管白天黑夜都是雨云图标；日出 / 日落那一格（下面插进来的）照旧
    const icon = start + i >= rainFrom ? 'rain' : skyAt(w, h);
    cols.push({ key: `h${h}`, hour: start + i, label: `${h}时`, icon, temp: tempAt(w, h) });
  }
  for (const [name, hm] of [['sunset', w.sunset], ['sunrise', w.sunrise]]) {
    const nowH = now.getHours() + now.getMinutes() / 60;
    let t = toHours(hm);
    if (t < nowH) t += 24; // 今天的已经过了，看明天的
    if (t < start + 5) {
      const at = cols.findIndex((c) => c.hour > t);
      const [h, m] = hm;
      cols.splice(at, 0, { key: name, hour: t, label: `${h}:${String(m).padStart(2, '0')}`, icon: name, temp: tempAt(w, t) });
    }
  }
  return cols.slice(0, 6);
}

// ---------------- 图标（照着 SF Symbols 彩色天气图标的样子自己画的，24×24 格子） ----------------
const SUN = '#ffd60a';

function Sun({ cx = 12, cy = 12, r = 4.3, ray = 3 }) {
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    const r0 = r + 2.1;
    return (
      <line key={i} x1={cx + Math.cos(a) * r0} y1={cy + Math.sin(a) * r0}
        x2={cx + Math.cos(a) * (r0 + ray)} y2={cy + Math.sin(a) * (r0 + ray)} />
    );
  });
  return (
    <g fill={SUN} stroke={SUN} strokeWidth="1.7" strokeLinecap="round">
      <circle cx={cx} cy={cy} r={r} stroke="none" />
      {rays}
    </g>
  );
}

// 云：三个圆 + 一条平底拼起来。stroke：描一圈边（只在下面的遮罩里用）
function Cloud({ dx = 0, dy = 0, fill = '#fff', stroke }) {
  return (
    <g fill={fill} stroke={stroke} strokeWidth={stroke ? 2.6 : undefined} transform={`translate(${dx} ${dy})`}>
      <circle cx="8" cy="15.2" r="3.8" />
      <circle cx="12.6" cy="12.4" r="5" />
      <circle cx="17.2" cy="15.6" r="3.4" />
      <rect x="8" y="14" width="9.2" height="5" />
    </g>
  );
}

// 月牙：一个圆，用遮罩挖掉右上方的一块。
// 遮罩的名字（id）用 useId() 生成，保证全页面唯一（同名的话浏览器只认第一个，它要是在藏起来的卡片里，月亮就没了）
function Moon({ dx = 0, dy = 0, stars = true }) {
  const id = useId();
  return (
    <g transform={`translate(${dx} ${dy})`}>
      <defs>
        <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
          <rect width="24" height="24" fill="#fff" />
          <circle cx="15.8" cy="8.2" r="6.4" fill="#000" />
        </mask>
      </defs>
      <circle cx="11" cy="13" r="7.4" fill="#fff" mask={`url(#${id})`} />
      {stars && (
        <g fill="#fff">
          <path d="M18 3.2q.35 1.95 2.3 2.3-1.95.35-2.3 2.3-.35-1.95-2.3-2.3 1.95-.35 2.3-2.3z" />
          <path d="M21 9.4q.2 1.1 1.3 1.3-1.1.2-1.3 1.3-.2-1.1-1.3-1.3 1.1-.2 1.3-1.3z" />
        </g>
      )}
    </g>
  );
}

// 日出 / 日落：地平线上半个太阳 + 一个箭头（日落朝下，日出朝上）
function SunEdge({ up }) {
  const id = useId();
  return (
    <g>
      <clipPath id={id}>
        <rect width="24" height="17.2" />
      </clipPath>
      <g clipPath={`url(#${id})`}>
        <Sun cx={12} cy={17.6} r={4.4} ray={2.2} />
      </g>
      <line x1="3.5" y1="19.6" x2="20.5" y2="19.6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      <path d={up ? 'M12 9.2V2.8M9.4 5.2 12 2.6l2.6 2.6' : 'M12 2.6V9M9.4 6.6 12 9.2l2.6-2.6'}
        fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

/**
 * 躲在云后面的太阳 / 月亮：沿着云的轮廓再往外挖掉一圈，两者之间留一道缝，
 * 同是白色的云和月亮才分得开（SF Symbols 的彩色天气图标也是这样）
 */
function BehindCloud({ children }) {
  const id = useId();
  return (
    <>
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <rect width="24" height="24" fill="#fff" />
        <Cloud dx={-2} dy={1.4} fill="#000" stroke="#000" />
      </mask>
      <g mask={`url(#${id})`}>{children}</g>
      <Cloud dx={-2} dy={1.4} />
    </>
  );
}

function WxIcon({ kind, className, peek }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" data-peek={peek}>
      {kind === 'sun' && <Sun />}
      {kind === 'cloudSun' && (
        <BehindCloud>
          <Sun cx={15.4} cy={8.4} r={3.6} ray={2.2} />
        </BehindCloud>
      )}
      {kind === 'moon' && <Moon />}
      {kind === 'cloudMoon' && (
        <BehindCloud>
          <g transform="translate(16 7.6) scale(0.66) translate(-12 -12)">
            <Moon stars={false} />
          </g>
        </BehindCloud>
      )}
      {kind === 'cloud' && <Cloud dy={-1} />}
      {/* 雨：云往上挪一点，下面三道斜着的蓝色雨丝 */}
      {kind === 'rain' && (
        <>
          <Cloud dy={-2.6} />
          <g stroke="#5ac8fa" strokeWidth="1.8" strokeLinecap="round">
            <line x1="9.4" y1="18.6" x2="8.4" y2="21.6" />
            <line x1="13.4" y1="18.6" x2="12.4" y2="21.6" />
            <line x1="17.4" y1="18.6" x2="16.4" y2="21.6" />
          </g>
        </>
      )}
      {kind === 'sunset' && <SunEdge up={false} />}
      {kind === 'sunrise' && <SunEdge up />}
    </svg>
  );
}

/** 城市名后面的定位小箭头（SF Symbols 的 location.fill 的样子） */
function LocationArrow() {
  return (
    <svg className="wx__loc" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M11.2.8 1 5.3l4.7.9.9 4.8z" fill="currentColor" />
    </svg>
  );
}

/** 两个字竖着叠起来（「最 / 高」） */
function Tag({ a, b }) {
  return (
    <span className="wx__hl-tag" aria-hidden="true">
      <i>{a}</i>
      <i>{b}</i>
    </span>
  );
}

/** 「最高 31° 最低 20°」：「最高」「最低」两个字竖着叠起来，这是 iOS 中文版的样子 */
function HighLow({ high, low }) {
  return (
    <div className="wx__hl" aria-label={`最高 ${high}°，最低 ${low}°`} data-peek="hl">
      <Tag a="最" b="高" />
      <span className="wx__hl-num">{high}°</span>
      <Tag a="最" b="低" />
      <span className="wx__hl-num">{low}°</span>
    </div>
  );
}

export default function Weather({ size = 'medium', data }) {
  const now = useNow();
  const hour = now.getHours() + now.getMinutes() / 60;
  const night = isNight(data, hour);
  const sky = skyAt(data, hour);
  const temp = tempAt(data, hour);
  const cls = `wx wx--${size}${night ? ' wx--night' : ''}`;
  const { rain } = storyAt(now);

  const city = (
    <div className="wx__city" data-peek="city">
      {data.city}
      <LocationArrow />
    </div>
  );

  if (size === 'small') {
    return (
      <div className={cls}>
        {city}
        <div className="wx__temp" data-peek="temp">{temp}°</div>
        <WxIcon kind={sky} className="wx__icon" peek="icon" />
        <div className="wx__cond" data-peek="cond">{SKY_TEXT[sky]}</div>
        <HighLow high={data.high} low={data.low} />
      </div>
    );
  }

  return (
    <div className={cls}>
      <div className="wx__top">
        <div className="wx__now">
          {city}
          <div className="wx__temp" data-peek="temp">{temp}°</div>
        </div>
        {/* 「16:00 起有雨」：温度右边的空位。偷看时只变淡（"rest"） */}
        <div className="wx__rain" data-peek="rest">
          <WxIcon kind="rain" className="wx__rain-icon" />
          {rain.hint}
        </div>
        <div className="wx__today">
          <WxIcon kind={sky} className="wx__icon" peek="icon" />
          <div className="wx__cond" data-peek="cond">{SKY_TEXT[sky]}</div>
          <HighLow high={data.high} low={data.low} />
        </div>
      </div>
      <div className="wx__hours" data-peek="hours">
        {hourlyFrom(data, now, rain.fromHour).map((c) => (
          <div key={c.key} className="wx__hour">
            <div className="wx__time">{c.label}</div>
            <WxIcon kind={c.icon} className="wx__hicon" />
            <div className="wx__htemp">{c.temp}°</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/*
 * 掀开就聚拢（见 engine/reveal.js、CLAUDE.md）：掀起上面那张卡时，天气卡上的信息怎么挤进口子里。
 *   上面 JSX 里带 data-peek="…" 的元素就是这里说的名字。
 *   roll     哪个元素的数字会「逐位升起」（名字是以前「数字滚动」时起的，沿用）
 *   layouts  座位表：口子从小到大依次用 —— 先只有温度 → 温度 + 图标 + 天气 → 再加最高/最低。
 *            不在座位表里的元素（城市、逐小时预报）留在原位、变淡
 */
const PEEK = {
  roll: 'temp',
  layouts: [
    'temp',
    // either：横排、竖排两种都算，哪种在当前的口子里放得更大就（渐渐）用哪种
    { either: [{ row: ['temp', 'icon', 'cond'] }, { col: ['temp', { row: ['icon', 'cond'] }] }] },
    { either: [{ col: [{ row: ['temp', 'icon', 'cond'] }, 'hl'] }, { col: ['temp', { row: ['icon', 'cond'] }, 'hl'] }] },
  ],
};
Weather.peek = { medium: PEEK, small: PEEK };
