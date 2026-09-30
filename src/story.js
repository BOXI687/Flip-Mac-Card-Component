/*
 * story.js —— 「今天这一天的故事」：所有小组件共用的、跟着真实时间走的内容
 *
 * 为什么要有它：iPhone 顶上的状态栏显示的是真实时间。如果卡片里写死「8:48 出发」，
 * 一眼就穿帮。所以这里所有内容都是「相对现在」算出来的：
 *   · 设计站会：永远是「下一个整点 / 半点」，离现在 35～65 分钟（所以总有一个倒计时）
 *   · 路线：早上（12 点以前）去公司，12 点以后回家；路上 22 分钟；到达时间 = 现在 + 22 分钟
 *   · 下雨：永远是「下一个整点」里离现在 2～3 小时以后的那一个，天气的逐小时预报从那一格起画雨
 *   · 待办、健身、设备电量：内容是编的、固定的（不随时间变）
 *
 * 用法（在小组件里）：
 *   const story = useStory();     // 每秒自动更新一次（和时钟同一个计时器，见 hooks/useNow.js）
 *   story.meeting.startText       // '09:30'
 *   story.commute.arriveText      // '09:10'
 * 想在别处（比如测试）算某一个时刻的故事：storyAt(new Date(...))，它是纯函数，同样的时刻永远得到同样的结果。
 *
 * 全是编的（网站是公开的）；不出现任何真实的公司、地点、品牌。
 */
import { useNow } from './hooks/useNow.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const pad = (n) => String(n).padStart(2, '0');
/** 09:05 这种两位数的「时:分」（24 小时制） */
export const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

// ---------------- 固定的（不随时间变的）内容 ----------------

/** 待办：4 条编的。第一条最紧急（会前要改完），小组件里只显示前 3 条，剩下的写「还有 1 项」 */
export const TODOS = ['会前改完首页稿', '回复设计评审意见', '订周五的会议室', '买咖啡豆'];

/** 会议：名字和时长是固定的，开始时间每次现算 */
const MEETING = { title: '设计站会', lengthMin: 30 };
/** 路线：路上多久、比平时快多少（编的） */
const COMMUTE = { minutes: 22, fasterBy: 3 };

/**
 * 某一个时刻的「故事」。
 * @param {Date} now 现在
 */
export function storyAt(now) {
  const t = now.getTime();

  // ---- 会议：下一个 :00 或 :30，且离现在至少 35 分钟 ----
  // 先把「现在 + 35 分钟」往后取整到 30 分钟的整数倍：取整前的差值 over 就是「超出上一个半点多少」
  const soonest = new Date(t + 35 * MIN);
  const over = (soonest.getMinutes() % 30) * MIN + soonest.getSeconds() * 1000 + soonest.getMilliseconds();
  const start = new Date(soonest.getTime() + (over === 0 ? 0 : 30 * MIN - over));
  const end = new Date(start.getTime() + MEETING.lengthMin * MIN);
  const minutesLeft = Math.ceil((start.getTime() - t) / MIN); // 35 ~ 65
  // 深夜（23:30 以后）下一个会已经是明天了，标签跟着变
  const sameDay = start.getDate() === now.getDate();

  // ---- 路线：12 点以前去公司，以后回家；现在出发，22 分钟后到 ----
  const toWork = now.getHours() < 12;
  const arrive = new Date(t + COMMUTE.minutes * MIN);

  // ---- 下雨：现在 + 2 小时，往后取整到整点（所以离现在 2～3 小时） ----
  const rainAt = new Date(t + 2 * HOUR);
  if (rainAt.getMinutes() || rainAt.getSeconds() || rainAt.getMilliseconds()) {
    rainAt.setHours(rainAt.getHours() + 1, 0, 0, 0);
  }
  // 从「现在这个钟点」数起的第几个整点（3 = 现在 13:30 时的 16:00）
  const hoursAhead = Math.round((rainAt.getTime() - new Date(t).setMinutes(0, 0, 0)) / HOUR);

  return {
    weekday: `星期${WEEK[now.getDay()]}`, // 星期二
    meeting: {
      title: MEETING.title,
      start,
      end,
      startText: hhmm(start), // 09:30
      endText: hhmm(end), // 10:00
      minutesLeft,
      countdown: `还有 ${minutesLeft} 分钟`,
      dayLabel: sameDay ? '今天' : '明天',
    },
    commute: {
      label: toWork ? '去公司' : '回家',
      destination: toWork ? '公司' : '家',
      minutes: COMMUTE.minutes,
      arriveText: hhmm(arrive),
      departText: `现在出发，${hhmm(arrive)} 到`,
      note: `比平时快 ${COMMUTE.fasterBy} 分钟`,
    },
    rain: {
      startText: `${pad(rainAt.getHours())}:00`,
      hint: `${pad(rainAt.getHours())}:00 起有雨`,
      // 天气组件的逐小时预报用：绝对钟点（从今天 0 点数起，可以超过 24），>= 这个数的格子画雨
      fromHour: now.getHours() + hoursAhead,
    },
    todos: TODOS,
  };
}

/** 在组件里用：每秒更新一次的「故事」 */
export function useStory() {
  return storyAt(useNow());
}
