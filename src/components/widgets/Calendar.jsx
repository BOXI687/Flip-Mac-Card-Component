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
  // 偷看时才出现的倒计时「还有 42 分钟」、日程名字、那行小时间；日期、星期、「今天」标签、描边的框只负责变淡。
  // 描边的框是单独一个空元素（.cal__event），名字和时间放在它上面而不是它里面：
  // 这样框变淡时不会把里面正在移动的名字也一起变淡（父子不能同时打标记）
  return (
    <div className="cal">
      <p className="cal__week" data-peek="week">{weekday}</p>
      <p className="cal__date" data-peek="date">{now.getDate()}</p>
      <p className="cal__section" data-peek="rest">{meeting.dayLabel}</p>
      <i className="cal__event" data-peek="rest" />
      <p className="cal__title" data-peek="title">{meeting.title}</p>
      <p className="cal__time" data-peek="time">
        {meeting.startText} – {meeting.endText}
      </p>
      {/* 只在偷看时出现：倒计时「42 分钟后」（42 是大号的数字，从日程卡的中间「浮」出来）。
          比「还有 42 分钟」短两个字：小号的口子很小，字越少，能放得越大。
          每分钟跟着真实时间变（42 → 41 …），掀着的时候变了，升起的那一层马上换成新的数字 */}
      <p className="cal__peek-count" data-peek="count" data-peek-only aria-hidden="true">
        {meeting.minutesLeft}
        <small> 分钟后</small>
      </p>
    </div>
  );
}

/*
 * 掀开就聚拢（见 engine/reveal.js、CLAUDE.md）：待办在上面时偷看日历，最想知道的是「离开会还有多久」
 * （几点几分状态栏上就有，但「还有 42 分钟」要自己算）。
 *   口子小 → 只有倒计时「42 分钟后」（42 一位一位升起，「分钟后」不动）
 *         → 倒计时 + 日程名字「设计站会」
 *         → 再加时间「16:00 – 16:30」（0.85，小号的口子放不下原大）
 *   日期、星期、「今天」标签、描边的框：变淡
 */
Calendar.peek = {
  small: {
    hero: 'count',
    roll: 'count',
    layouts: [
      'count',
      { col: ['count', 'title'], gap: 0.35 },
      { col: ['count', 'title', { key: 'time', scale: 0.85 }], gap: 0.35 },
    ],
  },
};
