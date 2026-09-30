/*
 * data.js —— 小组件里显示的内容，和「每一叠里放哪几张」
 *
 * 想改内容（城市、节目、备忘录标题……）或者换叠放顺序，只改这个文件就行。
 * 这里的内容全是编的（网站是公开的，不放任何真实的个人信息）；
 * 日期、时间、农历是真的，由组件自己算。
 */
import Battery from './components/widgets/Battery.jsx';
import WorldClock from './components/widgets/WorldClock.jsx';
import Weather from './components/widgets/Weather.jsx';
import Calendar from './components/widgets/Calendar.jsx';
import Podcasts from './components/widgets/Podcasts.jsx';
import Fitness from './components/widgets/Fitness.jsx';
import Notes from './components/widgets/Notes.jsx';

export const DEVICES = [
  { icon: 'iphone', level: 41, charging: false },
  { icon: 'airpods', level: 100, charging: true },
  { icon: 'case', level: 100, charging: true },
  { icon: 'speaker', level: 100, charging: false },
];

export const CITIES = [
  { name: '北京', tz: 'Asia/Shanghai' },
  { name: '马德里', tz: 'Europe/Madrid' },
  { name: '东京', tz: 'Asia/Tokyo' },
  { name: '伦敦', tz: 'Europe/London' },
];

// 天气：一天里的最高 / 最低温、日出日落时间、哪几个钟点有云（都是编的）
export const WEATHER = {
  city: '上海',
  high: 29,
  low: 21,
  sunrise: [5, 48],
  sunset: [17, 52],
  cloudyHours: [2, 3, 7, 12, 13, 20, 21],
};

// 播客：两集编出来的节目。meta 是标题下面那行灰字；progress = 听了多少（0 = 没听过）
export const EPISODES = [
  { title: '第 42 期：把复杂的东西做得简单', meta: ['新单集', '3天前', '58分钟'], art: 'dawn', progress: 0 },
  { title: 'Slow Craft: Designing Quiet Tools', meta: ['继续', '9/21/2026', '还剩24分钟'], art: 'wave', progress: 0.62 },
];

export const FITNESS = { move: 186, goal: 500, steps: 4218, distance: 1.9 };

export const NOTES = ['周末买菜清单', '读书笔记', '旅行要带的东西'];

// 日历：今天的一个日程（编的）。start / end 是「时:分」，每天都显示同一个
export const EVENTS = [{ title: '设计评审', start: '14:00', end: '15:00' }];

/*
 * 每一种小组件：
 *   kind  → 卡片的 CSS 类名（card--battery …），决定底色
 *   label → 读屏软件念的名字
 *   app   → 小组件下面显示的 App 名（和 iOS 一样写 App 名）
 *   Widget + props → 用哪个组件、传什么数据
 */
const W = {
  battery: { kind: 'battery', label: '电池', app: '电池', Widget: Battery, props: { devices: DEVICES } },
  clock: { kind: 'clock', label: '世界时钟', app: '时钟', Widget: WorldClock, props: { cities: CITIES } },
  weather: { kind: 'weather', label: '天气', app: '天气', Widget: Weather, props: { data: WEATHER } },
  podcasts: { kind: 'podcasts', label: '播客·待播清单', app: '播客', Widget: Podcasts, props: { episodes: EPISODES } },
  fitness: { kind: 'fitness', label: '健身·活动', app: '健身', Widget: Fitness, props: FITNESS },
  notes: { kind: 'notes', label: '备忘录', app: '备忘录', Widget: Notes, props: { notes: NOTES } },
  calendar: { kind: 'calendar', label: '日历', app: '日历', Widget: Calendar, props: { events: EVENTS } },
};

// 小号时钟只显示一个城市（现在右边那叠放的是伦敦）
const clockSmall = (city) => ({ ...W.clock, props: { cities: [city] } });

/**
 * 三叠小组件，数组里第一个在最上面；往上滑依次看到后面的，最后一张再往上滑回到第一张。
 * 按 Boxi 自己手机的主屏幕来排（不是每叠都塞所有小组件）：
 *   中号：世界时钟 → 天气 → 播客 → 健身·活动 → 备忘录
 *   左边小号：日历 → 电池；右边小号：天气 → 时钟（伦敦）
 * 掀开时「信息聚拢」只有电池、时钟、天气有，别的卡在下面时不动。
 */
export const STACKS = {
  medium: [W.clock, W.weather, W.podcasts, W.fitness, W.notes],
  smallA: [W.calendar, W.battery],
  smallB: [W.weather, clockSmall(CITIES[3])],
};

/**
 * 程序坞里的 4 个 App 图标（只是样子，点了只会暗一下，什么也不做）。
 *   app  → 用哪个图形（画法在 components/AppIcon.jsx）
 *   name → App 名。程序坞里和 iOS 一样不写名字，这里的 name 只给读屏软件念
 */
export const DOCK_APPS = [
  { app: 'phone', name: '电话' },
  { app: 'messages', name: '信息' },
  { app: 'camera', name: '相机' },
  { app: 'music', name: '音乐' },
];
