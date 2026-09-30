/*
 * 日历小组件（Calendar，只有小号，深色）
 *   左上：星期几（灰色小字：星期二）
 *   下面：今天几号（大字）
 *   再下面：一行灰色小标签「今天」，和一张圆角描边的日程卡（描边、字都是蓝色）：日程名字 + 「09:30 – 10:00」
 *
 * 日程来自 story.js：永远是「下一个整点 / 半点、离现在 35～65 分钟」的设计站会（30 分钟），
 * 所以时间永远和 iPhone 状态栏对得上。日期、星期也是真的（story.js 里算）。
 * 样子照 Boxi 手机上的日历小组件（深色、灰色的星期、蓝色描边的日程卡）画的。
 */
import { useNow } from '../../hooks/useNow.js';
import { useStory } from '../../story.js';

export default function Calendar() {
  const now = useNow();
  const { weekday, meeting } = useStory();
  // 偷看时（掀开上面那张卡）要动的元素都带 data-peek（说明见文件最后的 Calendar.peek）：
  // 日期、星期、日程名字、偷看时才出现的大号时间；「今天」标签、描边的框、原来那行小时间只负责变淡（"rest"）。
  // 描边的框是单独一个空元素（.cal__event），名字和时间放在它上面而不是它里面：
  // 这样框变淡时不会把里面正在移动的名字也一起变淡（父子不能同时打标记）
  return (
    <div className="cal">
      <p className="cal__week" data-peek="week">{weekday}</p>
      <p className="cal__date" data-peek="date">{now.getDate()}</p>
      <p className="cal__section" data-peek="rest">{meeting.dayLabel}</p>
      <i className="cal__event" data-peek="rest" />
      <p className="cal__title" data-peek="title">{meeting.title}</p>
      <p className="cal__time" data-peek="rest">
        {meeting.startText} – {meeting.endText}
      </p>
      {/* 只在偷看时出现：大号的开始时间（从原来那行小时间的位置「浮」出来） */}
      <p className="cal__peek-time" data-peek="time" data-peek-only aria-hidden="true">
        {meeting.startText}
      </p>
    </div>
  );
}

/*
 * 掀开就聚拢（见 engine/reveal.js、CLAUDE.md）：偷看日历，最想知道的是「下一个日程几点」。
 *   口子小 → 只有大号时间（数字一位一位升起）→ 时间 + 日程名字 → 再加今天几号和星期
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
