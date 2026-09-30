/*
 * 日历小组件（Calendar，只有小号）
 *   左上：今天几号（大字）| 农历日期（竖着两个灰字）| 星期（竖着两个红字）
 *   下面：今天的日程（左边一根彩色竖条 + 名字 + 时间），没有就写「今天无日程」
 *   日程只显示第一个（小号放不下两个）；日程的样子是 INFERRED（Boxi 的截图里那天没有日程）
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
  const ev = events[0];
  // 偷看时（掀开上面那张卡）要动的元素都带 data-peek（说明见文件最后的 Calendar.peek）：
  // 日期、星期、日程名字、偷看时才出现的大号时间；农历、竖条、原来那行小时间只负责变淡（"rest"）
  return (
    <div className="cal">
      <div className="cal__head">
        <span className="cal__date" data-peek="date">{now.getDate()}</span>
        {lunar && (
          <span className="cal__col cal__lunar" aria-label={`农历${lunar}`} data-peek="rest">
            {[...lunar].map((ch, i) => (
              <i key={i}>{ch}</i>
            ))}
          </span>
        )}
        <span className="cal__col cal__week" aria-label={`星期${WEEK[now.getDay()]}`} data-peek="week">
          <i>周</i>
          <i>{WEEK[now.getDay()]}</i>
        </span>
      </div>
      {!ev ? (
        <p className="cal__empty" data-peek="rest">今天无日程</p>
      ) : (
        <>
          <i className="cal__bar" data-peek="rest" />
          <p className="cal__title" data-peek="title">{ev.title}</p>
          <p className="cal__time" data-peek="rest">
            {ev.start}–{ev.end}
          </p>
          {/* 只在偷看时出现：大号的开始时间（从原来那行小时间的位置「浮」出来） */}
          <p className="cal__peek-time" data-peek="time" data-peek-only aria-hidden="true">
            {ev.start}
          </p>
        </>
      )}
    </div>
  );
}

/*
 * 掀开就聚拢（见 engine/reveal.js、CLAUDE.md）：偷看日历，最想知道的是「下一个日程几点」。
 *   口子小 → 只有大号时间（数字一位一位升起）→ 时间 + 日程名字 → 再加今天几号和星期
 *   今天没有日程时没有「时间」和「名字」这两个元素，引擎会跳过它们，只剩最后一级（日期 + 星期）
 */
Calendar.peek = {
  small: {
    roll: 'time',
    layouts: [
      'time',
      { either: [{ row: ['time', 'title'] }, { col: ['time', 'title'] }] },
      { col: ['time', 'title', { row: [{ key: 'date', scale: 0.45 }, { key: 'week', scale: 0.7 }] }], gap: 0.35 },
    ],
  },
};
