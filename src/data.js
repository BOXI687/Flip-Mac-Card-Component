/*
 * data.js —— 小组件里显示的内容，和「每一叠里放哪几张」
 *
 * 想改内容（城市、节目、备忘录标题……）或者换叠放顺序，只改这个文件就行。
 * 这里的内容全是编的（网站是公开的，不放任何真实的个人信息）；
 * 日期、时间是真的，由组件自己算；「和现在时间有关」的故事（下一个会几点、路上多久、几点下雨）
 * 全在 story.js 里，永远相对「现在」，和 iPhone 状态栏的时间对得上。
 */
import Battery from './components/widgets/Battery.jsx';
import WorldClock from './components/widgets/WorldClock.jsx';
import Weather from './components/widgets/Weather.jsx';
import Calendar from './components/widgets/Calendar.jsx';
import Podcasts from './components/widgets/Podcasts.jsx';
import Fitness from './components/widgets/Fitness.jsx';
import Notes from './components/widgets/Notes.jsx';
import MapCard from './components/widgets/Map.jsx';
import Todo from './components/widgets/Todo.jsx';

export const DEVICES = [
  { icon: 'iphone', level: 41, charging: false },
  { icon: 'airpods', level: 100, charging: true },
  { icon: 'case', level: 100, charging: true },
  { icon: 'speaker', level: 100, charging: false },
];

// 「戴在身上」的设备（小号电池 = 设备电量）：手表、AirPods、耳机盒。手机自己的电量状态栏已经有了，这里不放。
// 手表最低（18%，≤ 20% 显示红色）；耳机盒在充电（有闪电）
export const DEVICES_WORN = [
  { icon: 'watch', level: 18, charging: false },
  { icon: 'airpods', level: 64, charging: false },
  { icon: 'case', level: 100, charging: true },
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
  calendar: { kind: 'calendar', label: '日历', app: '日历', Widget: Calendar, props: {} },
  // 地图、待办的内容都来自 story.js（路线、待办清单），不用传数据
  map: { kind: 'map', label: '地图', app: '地图', Widget: MapCard, props: {} },
  todo: { kind: 'todo', label: '待办', app: '待办', Widget: Todo, props: {} },
  // 设备电量：还是电池小组件（kind 'battery' 保留玻璃材质），只是放的是「戴在身上」的设备
  devices: { kind: 'battery', label: '设备电量', app: '电池', Widget: Battery, props: { devices: DEVICES_WORN } },
};

// 小号时钟只显示一个城市（现在没有叠放它，留着备用：clockSmall(CITIES[3]) 就是伦敦）
export const clockSmall = (city) => ({ ...W.clock, props: { cities: [city] } });

/**
 * 三叠小组件，数组里第一个在最上面；往上滑依次看到后面的，最后一张再往上滑回到第一张。
 * 每一叠都是刻意配好的「一对」：掀开角偷看到的永远是「另一张」，两张互相有关系：
 *   中号 出门：地图（去公司 22 分钟）↔ 天气（几点起有雨，出门要不要带伞）
 *   左小号 今天：日历（设计站会几点）↔ 待办（会前要做完什么）
 *   右小号 随身：健身（今天动了多少）↔ 设备电量（戴在身上的设备还剩多少电）
 * 没放进任何一叠、但代码留着的：播客、世界时钟、备忘录（中号）、W.fitness 的中号版、W.battery（中号，四个设备）。
 * 想放回去：在这里加上 W.xxx 就行。
 * 掀开时「信息聚拢」：六张卡都有说明（在每个小组件文件的最后），偷看到的是「上面那张卡和状态栏都没有的、最有用的一件事」，口子越大信息越多。
 */
export const STACKS = {
  medium: [W.map, W.weather],
  smallA: [W.calendar, W.todo],
  smallB: [W.fitness, W.devices],
};

/**
 * 程序坞里的 4 个 App 图标（只是样子，点了只会暗一下，什么也不做）。
 *   app  → 用哪张图（Boxi 从 Figma 社区文件里挑的矢量图标，放在 src/assets/dock/，对应关系见 components/AppIcon.jsx）
 *   name → App 名。程序坞里和 iOS 一样不写名字，这里的 name 只给读屏软件念
 */
export const DOCK_APPS = [
  { app: 'phone', name: '电话' },
  { app: 'messages', name: '信息' },
  { app: 'camera', name: '相机' },
  { app: 'gmail', name: 'Gmail' },
];
