/*
 * 日历小组件（Calendar，只有小号）
 *   左上：今天几号（大字）| 农历日期（竖着两个灰字）| 星期（竖着两个红字）
 *   下面：今天的日程，没有就写「今天无日程」
 *
 * 日期、农历、星期都是真的：用浏览器自带的 Intl（国际化）工具算，
 * 'zh-CN-u-ca-chinese' 的意思是「中文、农历」。算不出来（很老的浏览器）就不显示农历。
 */
import { useNow } from '../../hooks/useNow.js';

const NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/** 农历的「几号」：1 → 初一，17 → 十七，20 → 二十，30 → 三十 */
function lunarDayName(d) {
  if (d <= 10) return `初${NUM[d]}`;
  if (d < 20) return `十${NUM[d - 10]}`;
  if (d === 20) return '二十';
  if (d < 30) return `廿${NUM[d - 20]}`;
  return '三十';
}

let lunarFormat = null;
function lunarDay(date) {
  try {
    lunarFormat = lunarFormat || new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { day: 'numeric' });
    const v = lunarFormat.formatToParts(date).find((p) => p.type === 'day').value;
    const d = parseInt(v, 10);
    return Number.isFinite(d) ? lunarDayName(d) : v; // 有的浏览器直接给汉字
  } catch (e) {
    return null;
  }
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

export default function Calendar({ events = [] }) {
  const now = useNow();
  const lunar = lunarDay(now);
  return (
    <div className="cal">
      <div className="cal__head">
        <span className="cal__date">{now.getDate()}</span>
        {lunar && (
          <span className="cal__col cal__lunar" aria-label={`农历${lunar}`}>
            {[...lunar].map((ch, i) => (
              <i key={i}>{ch}</i>
            ))}
          </span>
        )}
        <span className="cal__col cal__week" aria-label={`星期${WEEK[now.getDay()]}`}>
          <i>周</i>
          <i>{WEEK[now.getDay()]}</i>
        </span>
      </div>
      {events.length === 0 ? (
        <p className="cal__empty">今天无日程</p>
      ) : (
        events.map((e) => (
          <p key={e.title} className="cal__event">{e.title}</p>
        ))
      )}
    </div>
  );
}
