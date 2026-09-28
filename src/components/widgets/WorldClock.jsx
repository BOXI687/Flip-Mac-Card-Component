/*
 * 世界时钟小组件（World Clock）
 *   中号：4 个表盘排一行，下面写城市 / 今天 / 时差
 *   小号：1 个大表盘，城市名写在表盘里
 *
 * useNow() 每秒给一次新时间，组件就重新算一遍指针角度 —— 不用自己去改 DOM。
 * （掀角时翻起来的那一角是卡片的「复印件」，不归 React 管，所以那一角里的秒针会停住，没关系）
 */
import { useNow } from '../../hooks/useNow.js';

// 每个时区缓存一个格式化器（创建 Intl 对象比较贵，不要每秒都 new）
const formatters = {};
function partsIn(tz, date) {
  if (!formatters[tz]) {
    formatters[tz] = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
  }
  const out = {};
  for (const p of formatters[tz].formatToParts(date)) out[p.type] = +p.value || 0;
  out.hour %= 24;
  return out;
}

/** 某时区相对 UTC 的偏移（分钟）：把那个时区的「墙上时间」当成 UTC 算，再减去真实时间 */
function tzOffsetMinutes(tz, date) {
  const p = partsIn(tz, date);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUTC - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

// 和 iOS 一样写成「+8小时」（英文系统是「+8HRS」），不加空格
function offsetLabel(diffMin) {
  const sign = diffMin < 0 ? '-' : '+';
  const abs = Math.abs(diffMin);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}小时${m ? `${m}分` : ''}`;
}

function dayLabel(tzParts, now) {
  const a = Date.UTC(tzParts.year, tzParts.month - 1, tzParts.day);
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const d = Math.round((a - b) / 86400000);
  return d === 0 ? '今天' : d === 1 ? '明天' : d === -1 ? '昨天' : `${d > 0 ? '+' : ''}${d} 天`;
}

// 12 个数字均匀分布在一个圆上。角度 0 指向 12 点，顺时针。只算一次
const NUMBERS = Array.from({ length: 12 }, (_, k) => {
  const i = k + 1;
  const a = (i / 12) * Math.PI * 2;
  return { i, x: (50 + Math.sin(a) * 38.5).toFixed(2), y: (50 - Math.cos(a) * 38.5).toFixed(2) };
});

/**
 * 表盘（100x100 的格子）。比例量自 Apple 官方的世界时钟小组件图：
 *   数字大（字高约为表盘直径的 12%），中等粗细，离边很近；没有刻度
 *   时针、分针一样粗，靠近圆心的一小段是细「脖子」；秒针是橙色细线，穿过圆心还留一小截尾巴
 *   圆心是一个橙色小圆圈
 * label：小号组件把城市名写在表盘里
 */
function ClockFace({ p, label, peek }) {
  const rot = (deg) => `rotate(${deg} 50 50)`;
  return (
    <svg className="clock" viewBox="0 0 100 100" aria-hidden="true" data-peek={peek}>
      <circle cx="50" cy="50" r="50" className="clock__face" />
      <g className="clock__numbers">
        {NUMBERS.map((n) => (
          <text key={n.i} x={n.x} y={n.y}>{n.i}</text>
        ))}
      </g>
      {label && <text className="clock__label" x="50" y="68">{label}</text>}
      <g className="clock__hour" transform={rot(((p.hour % 12) + p.minute / 60) * 30)}>
        <line className="clock__neck" x1="50" y1="50" x2="50" y2="41" />
        <line x1="50" y1="41" x2="50" y2="25" />
      </g>
      <g className="clock__minute" transform={rot((p.minute + p.second / 60) * 6)}>
        <line className="clock__neck" x1="50" y1="50" x2="50" y2="41" />
        <line x1="50" y1="41" x2="50" y2="10" />
      </g>
      <g className="clock__second" transform={rot(p.second * 6)}>
        <line x1="50" y1="58" x2="50" y2="3" />
      </g>
      <circle cx="50" cy="50" r="2.3" className="clock__pin" />
    </svg>
  );
}

const pad2 = (n) => String(n).padStart(2, '0');

/** size：'medium'（默认，最多 4 个城市）或 'small'（只用第一个城市） */
export default function WorldClock({ size = 'medium', cities }) {
  const now = useNow();
  const small = size === 'small';
  const list = small ? cities.slice(0, 1) : cities.slice(0, 4);
  const localOffset = -now.getTimezoneOffset();
  return (
    <div className={`clocks clocks--${size}`}>
      {list.map((c, i) => {
        const p = partsIn(c.tz, now);
        // 夜里（18:00 ~ 6:00）换成深色表盘，和 iOS 一样一眼看出那边是白天还是晚上
        const night = p.hour < 6 || p.hour >= 18;
        // 第一个城市是偷看时的主角：它的表盘、城市、时差带 data-peek，别的城市整个标成 "rest"（只负责变淡）
        const hero = i === 0;
        const tag = (name) => (hero ? name : undefined);
        return (
          <div key={c.tz} className={`clocks__item${night ? ' is-night' : ''}`} data-tz={c.tz} data-peek={hero ? undefined : 'rest'}>
            <ClockFace p={p} label={small ? c.name : null} peek={tag('dial')} />
            {!small && (
              <>
                <div className="clocks__city" data-peek={tag('city')}>{c.name}</div>
                <div className="clocks__sub" data-peek={tag('day')}>{dayLabel(p, now)}</div>
                <div className="clocks__sub" data-peek={tag('off')}>{offsetLabel(tzOffsetMinutes(c.tz, now) - localOffset)}</div>
              </>
            )}
            {/* 只在偷看时出现：数字时间（从表盘中心「浮」出来）；小号的城市名平时写在表盘里，偷看时另给一份 */}
            {hero && (
              <div className="clocks__digital" data-peek="time" data-peek-only aria-hidden="true">
                {pad2(p.hour)}:{pad2(p.minute)}
              </div>
            )}
            {hero && small && (
              <div className="clocks__peek-city" data-peek="city" data-peek-only aria-hidden="true">{c.name}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/*
 * 掀开就聚拢（见 engine/reveal.js、CLAUDE.md）：第一个城市的时间挤进口子里。
 *   A 换座位：口子小 → 只有数字时间 → 时间 + 城市 → 小表盘 + 时间 + 城市 + 时差
 *   B 磁铁：数字时间最重要，表盘、城市跟过来；「今天」和别的城市让开变淡
 */
WorldClock.peek = {
  medium: {
    roll: 'time',
    layouts: [
      'time',
      { either: [{ col: ['time', 'city'] }, { row: ['time', 'city'] }] },
      { either: [{ row: [{ key: 'dial', scale: 0.8 }, { col: ['time', 'city', 'off'] }] }, { col: [{ key: 'dial', scale: 0.6 }, 'time', 'city'] }] },
    ],
    magnet: {
      chain: [{ key: 'time', scale: 1.4 }, { key: 'city', scale: 0.9 }, { key: 'dial', scale: 0.55 }],
      weight: { time: 1, city: 0.7, dial: 0.55, off: 0.2, day: 0.15, rest: 0 },
    },
  },
  small: {
    roll: 'time',
    layouts: [
      'time',
      { either: [{ col: ['time', 'city'] }, { row: ['time', 'city'] }] },
      { either: [{ row: [{ key: 'dial', scale: 0.42 }, { col: ['time', 'city'] }] }, { col: [{ key: 'dial', scale: 0.36 }, 'time', 'city'] }] },
    ],
    magnet: {
      chain: [{ key: 'time', scale: 1.4 }, { key: 'city', scale: 0.9 }, { key: 'dial', scale: 0.32 }],
      weight: { time: 1, city: 0.7, dial: 0.5 },
    },
  },
};
