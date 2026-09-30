/*
 * 地图小组件（Map，只有中号）
 *   整张卡是一幅自己画的、抽象的深色街道图（SVG）：几条街、一块公园、一片水、几个编出来的街名；
 *   一条蓝色的路线，起点是白点，终点是红色的大头针；
 *   左下角一块深色的小面板：去公司（或回家）、22 分钟、现在出发，几点到、比平时快几分钟。
 *
 * 街道图不是真的地图，街名、形状都是编的（网站是公开的，不放任何真实地点、不用任何地图 App 的图）。
 * 面板里的文字全部来自 story.js：「几点到」= 现在 + 22 分钟，早上去公司、中午以后回家。
 *
 * 想看懂 SVG：它像 Figma 里的矢量图层，viewBox="0 0 350 164" 是画布大小，
 * 里面的 line / path / rect 就是一个个图形，数字是画布上的坐标（和 --u 的「pt」是同一个尺度）。
 */
import { useStory } from '../../story.js';

// ---- 街道（都是编的）。坐标画在 350×164 的画布上 ----
// 细街：一张不太整齐的网格
const MINOR = [
  'M0 21H350', 'M0 61H350', 'M0 101H350', 'M0 141H350',
  'M56 0V164', 'M122 0V164', 'M190 0V164', 'M252 0V164', 'M318 0V164',
];
// 主干道：粗一点、亮一点
const MAJOR = ['M0 81H350', 'M222 0V164', 'M88 0V164'];
// 斜着的大道（像参考图里那条斜穿过去的路）
const AVENUE = 'M-10 152 C 90 120, 170 96, 260 -6';
// 弯弯的小路：公园边上
const LANE = 'M132 164 C 140 130, 170 118, 214 122 S 300 150, 350 132';

// 编出来的街名：[文字, x, y, 旋转角度]
const NAMES = [
  ['LINDEN AVE', 236, 13, 0],
  ['ORCHARD RD', 250, 128, -6],
  ['HARBOR BLVD', 202, 84, 0],
  ['NORTH PARK ST', 210, 158, 0],
];

// 路线：从右下的起点出发，拐几个弯，到上面的终点。全都在面板右边（面板压着左边 45%）
const ROUTE = 'M302 142 V101 H252 V61 H190 V36';
const START = { x: 302, y: 142 };
const DEST = { x: 190, y: 36 };

export default function MapWidget() {
  const { commute } = useStory();
  return (
    <div className="map">
      <svg className="map__art" viewBox="0 0 350 164" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width="350" height="164" className="map__land" />
        {/* 水：右上角一片，像一个湖 */}
        <path className="map__water" d="M296 -4 C 300 14, 322 22, 334 40 C 342 54, 350 58, 354 56 V-4Z" />
        {/* 公园：中间偏下一块圆角的绿地 */}
        <rect className="map__park" x="124" y="103" width="64" height="36" rx="10" />
        {MINOR.map((d) => <path key={d} d={d} className="map__minor" />)}
        {MAJOR.map((d) => <path key={d} d={d} className="map__major" />)}
        <path d={LANE} className="map__minor" />
        <path d={AVENUE} className="map__avenue" />
        {/* 街名、路线、起点、终点放在一组里：偷看时（文字挤到口子里）这一组变淡（"rest"），
            只留下安静的街道、水、公园当底，白字压在上面不会和亮蓝的路线、红针、街名打架 */}
        <g data-peek="rest">
          {NAMES.map(([t, x, y, r]) => (
            <text key={t} x={x} y={y} className="map__name" textAnchor="middle" transform={r ? `rotate(${r} ${x} ${y})` : undefined}>
              {t}
            </text>
          ))}
          {/* 路线：先画一条深蓝的宽线当描边，上面再叠亮蓝的线 */}
          <path d={ROUTE} className="map__route-casing" />
          <path d={ROUTE} className="map__route" />
          {/* 起点：白点 + 蓝圈 */}
          <circle cx={START.x} cy={START.y} r="6" className="map__start-ring" />
          <circle cx={START.x} cy={START.y} r="3.4" className="map__start" />
          {/* 终点：红色大头针，针尖对着终点 */}
          <g transform={`translate(${DEST.x} ${DEST.y})`}>
            <path className="map__pin" d="M0 0C-1 -5-8.5 -9-8.5 -16A8.5 8.5 0 0 1 8.5 -16C8.5 -9 1 -5 0 0Z" />
            <circle cy="-16" r="3.1" className="map__pin-dot" />
          </g>
        </g>
      </svg>

      {/* 左下角的面板（真的文字，不画在 SVG 里，字才清楚）。
          面板的深色底是单独一个空元素（.map__panel-bg），字盖在它上面：偷看时字走了、底只负责变淡，
          不会在口子里留下一块空的深色框（父子不能同时打标记，所以不能直接标面板） */}
      <div className="map__panel">
        <i className="map__panel-bg" data-peek="rest" />
        <p className="map__dest" data-peek="dest">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M14.6 1.4 1.6 6.6l5.2 1.6 1.6 5.2z" fill="currentColor" />
          </svg>
          {commute.label}
        </p>
        <p className="map__eta" data-peek="rest">
          <span className="map__min">{commute.minutes}</span>
          <span className="map__unit">分钟</span>
        </p>
        <p className="map__depart" data-peek="rest">{commute.departText}</p>
        <p className="map__note" data-peek="note">{commute.note}</p>
        {/* 只在偷看时出现：大号的到达时间「09:34 到」（从「现在出发，09:34 到」那一行出发），
            和一行小字「路上 22 分钟」（从大号的 22 那里出发） */}
        <p className="map__peek-arrive" data-peek="arrive" data-peek-only aria-hidden="true">
          {commute.arriveText}
          <small> 到</small>
        </p>
        <p className="map__peek-trip" data-peek="trip" data-peek-only aria-hidden="true">
          路上 {commute.minutes} 分钟
        </p>
      </div>
    </div>
  );
}

/*
 * 掀开就聚拢（见 engine/reveal.js、CLAUDE.md）：天气卡在上面时偷看地图，最想知道的是「现在走，几点到」。
 *   口子小 → 大号的「09:34 到」（数字一位一位升起，「到」字不动）+ 小字「去公司」
 *         → 「去公司」后面再加「路上 22 分钟」
 *         → 再加绿色的「比平时快 3 分钟」
 *   中号的口子是横着长的：宽的东西「贵」、往下加一行很「便宜」，三级的宽度又差不多，
 *   所以后两级让主角也跟着变大（1.25、1.5 倍）：口子越大，主角越大，信息也越多，三级不会挤在一起换
 *   面板里原来的大号 22 分钟、「现在出发，09:34 到」那一行、面板的深色底：只负责变淡（"rest"）。
 *   街道图本身不动，只有街名、路线、起点和终点变淡：留下安静的街道当底，字才看得清
 */
const TRIP = { row: ['dest', 'trip'], gap: 0.8 }; // 「➤ 去公司  路上 22 分钟」一行
MapWidget.peek = {
  medium: {
    hero: 'arrive',
    roll: 'arrive',
    layouts: [
      { col: ['arrive', 'dest'], gap: 0.3 },
      { col: [{ key: 'arrive', scale: 1.25 }, TRIP], gap: 0.3 },
      { col: [{ key: 'arrive', scale: 1.5 }, TRIP, 'note'], gap: 0.3 },
    ],
  },
};
