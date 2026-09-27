/*
 * widgets.js —— 两个 iOS 风格小组件的「长相」
 *
 *   1. 电池组件：圆环（SVG 画圆 + stroke-dasharray 控制进度）
 *        中号：4 个圆环排一行，下面写百分比
 *        小号：4 个圆环排成 2×2，不写百分比
 *   2. 世界时钟：指针表盘（SVG 画表盘 + 每秒旋转指针）
 *        中号：4 个表盘排一行，下面写城市 / 今天 / 时差
 *        小号：1 个大表盘，城市名写在表盘里
 *
 * 这里全部用「数据 → 生成 HTML 字符串」的方式渲染，改数据就能改外观。
 * 尺寸、颜色都在 style.css 里（以 Apple 设计稿的数值为准，出处写在那边的注释里）。
 */
window.Widgets = (function () {
  'use strict';

  // ---- 画图小工具：用「奇偶填充」(fill-rule: evenodd) 在图形上挖洞 ----
  // 以前的洞是用「卡片背景色」画上去假装的；卡片换成玻璃材质后背景不是纯色了，
  // 所以改成真的镂空，透出来的就是卡片本身
  const circ = (cx, cy, r) => `M${cx + r} ${cy}a${r} ${r} 0 1 0 ${-2 * r} 0a${r} ${r} 0 1 0 ${2 * r} 0Z`;
  const rrect = (x, y, w, h, r) =>
    `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}` +
    `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;

  // ================= 电池组件 =================

  // 图标都画在 24x24 的格子里，照着 SF Symbols 的比例重画（不直接用 Apple 的图标文件）。
  // fill="currentColor" 让它们跟随 CSS 的 color
  const ICONS = {
    iphone: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="7" y="2.5" width="10" height="19" rx="2.6" fill="none" stroke="currentColor" stroke-width="1.6"/>
        <rect x="10.4" y="4.4" width="3.2" height="1.1" rx="0.55" fill="currentColor"/>
      </svg>`,
    airpods: `
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
        <ellipse cx="7.6" cy="7.6" rx="3.3" ry="3.5"/>
        <rect x="8.2" y="8.4" width="2.3" height="10.4" rx="1.15"/>
        <ellipse cx="16.4" cy="7.6" rx="3.3" ry="3.5"/>
        <rect x="13.5" y="8.4" width="2.3" height="10.4" rx="1.15"/>
      </svg>`,
    // 充电盒：圆角盒子，挖出盖子的缝和前面的指示灯
    case: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" fill-rule="evenodd"
              d="${rrect(3.5, 5.5, 17, 14, 5)}M3.55 9.75H20.45V10.65H3.55Z${circ(12, 13.6, 0.9)}"/>
      </svg>`,
    // 音箱：长方块，挖出上面的小喇叭和下面的大喇叭（大喇叭中间再补一个实心点）
    speaker: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" fill-rule="evenodd"
              d="${rrect(6, 2.5, 12, 19, 2.4)}${circ(12, 7, 1.6)}${circ(12, 15, 3.7)}${circ(12, 15, 1.4)}"/>
      </svg>`,
  };

  // 圆环画在 64x64 的格子里。线宽 6.2：量自 Apple 官方图里的电池小组件（环宽 ≈ 外径的 9.7%）
  const RING_STROKE = 6.2;
  const RING_R = 32 - RING_STROKE / 2; // 外边正好贴着格子边
  const RING_C = 2 * Math.PI * RING_R; // 周长，dasharray 要用

  // 充电的闪电：画在圆环正上方，圆环在闪电周围「断开」一圈（用遮罩挖掉，和 iOS 一样），
  // 而不是在闪电外面描一圈背景色
  const BOLT = 'M7 1 1.8 9h3.6L4.6 15 10.2 6.8H6.6z'; // 12x16 的格子
  const BOLT_AT = 'translate(26 -5.5)'; // 放到圆环顶上居中
  const NOTCH_ID = 'ring-bolt-notch'; // 所有充电圆环的遮罩形状完全一样，重名也没关系

  function batteryItemHTML(d, withPct) {
    // 进度环的原理：虚线长度 = 周长；把虚线往回「偏移」没电的那部分，剩下的就是电量
    const offset = RING_C * (1 - d.level / 100);
    const color = d.level <= 20 ? 'var(--red)' : 'var(--green)';
    const notch = d.charging
      ? `<defs><mask id="${NOTCH_ID}" maskUnits="userSpaceOnUse" x="-8" y="-8" width="80" height="80">
           <rect x="-8" y="-8" width="80" height="80" fill="#fff"/>
           <path d="${BOLT}" transform="${BOLT_AT}" fill="#000" stroke="#000" stroke-width="3.2" stroke-linejoin="round"/>
         </mask></defs>`
      : '';
    const bolt = d.charging ? `<path class="ring__bolt" d="${BOLT}" transform="${BOLT_AT}" fill="${color}"/>` : '';
    return `
      <div class="battery__item">
        <div class="ring">
          <svg class="ring__svg" viewBox="0 0 64 64" aria-hidden="true">
            ${notch}
            <g${d.charging ? ` mask="url(#${NOTCH_ID})"` : ''}>
              <circle cx="32" cy="32" r="${RING_R}" class="ring__track"/>
              <circle cx="32" cy="32" r="${RING_R}" class="ring__progress" transform="rotate(-90 32 32)"
                      stroke="${color}"
                      stroke-dasharray="${RING_C.toFixed(2)}"
                      stroke-dashoffset="${offset.toFixed(2)}"/>
            </g>
            ${bolt}
          </svg>
          <div class="ring__icon">${ICONS[d.icon] || ''}</div>
        </div>
        ${withPct ? `<div class="battery__pct">${d.level}%</div>` : ''}
      </div>`;
  }

  /** size：'medium'（默认）或 'small' */
  function renderBattery(el, devices, size = 'medium') {
    const small = size === 'small';
    el.innerHTML = `<div class="battery battery--${size}">${devices
      .slice(0, 4)
      .map((d) => batteryItemHTML(d, !small))
      .join('')}</div>`;
  }

  // ================= 世界时钟组件 =================

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

  /**
   * 表盘（100x100 的格子）。比例量自 Apple 官方的世界时钟小组件图：
   *   数字大（字高约为表盘直径的 12%），中等粗细，离边很近；没有刻度
   *   时针、分针一样粗，靠近圆心的一小段是细「脖子」；秒针是橙色细线，穿过圆心还留一小截尾巴
   *   圆心是一个橙色小圆圈
   * 白天白底黑字，夜里深灰底白字（由 updateClocks 切换 .is-night）
   * label：小号组件把城市名写在表盘里
   */
  function clockFaceSVG(label) {
    // 12 个数字均匀分布在一个圆上。角度 0 指向 12 点，顺时针。
    let numbers = '';
    for (let i = 1; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x = 50 + Math.sin(a) * 38.5;
      const y = 50 - Math.cos(a) * 38.5;
      numbers += `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}">${i}</text>`;
    }
    return `
      <svg class="clock" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="50" class="clock__face"/>
        <g class="clock__numbers">${numbers}</g>
        ${label ? `<text class="clock__label" x="50" y="68">${label}</text>` : ''}
        <g class="clock__hour"><line class="clock__neck" x1="50" y1="50" x2="50" y2="41"/><line x1="50" y1="41" x2="50" y2="25"/></g>
        <g class="clock__minute"><line class="clock__neck" x1="50" y1="50" x2="50" y2="41"/><line x1="50" y1="41" x2="50" y2="10"/></g>
        <g class="clock__second"><line x1="50" y1="58" x2="50" y2="3"/></g>
        <circle cx="50" cy="50" r="2.3" class="clock__pin"/>
      </svg>`;
  }

  /** size：'medium'（默认，最多 4 个城市）或 'small'（只用第一个城市） */
  function renderClocks(el, cities, size = 'medium') {
    const small = size === 'small';
    const list = small ? cities.slice(0, 1) : cities.slice(0, 4);
    el.innerHTML = `<div class="clocks clocks--${size}">${list
      .map((c) =>
        small
          ? `<div class="clocks__item" data-tz="${c.tz}">${clockFaceSVG(c.name)}</div>`
          : `<div class="clocks__item" data-tz="${c.tz}">
               ${clockFaceSVG()}
               <div class="clocks__city">${c.name}</div>
               <div class="clocks__sub" data-role="day"></div>
               <div class="clocks__sub" data-role="offset"></div>
             </div>`
      )
      .join('')}</div>`;
  }

  /**
   * 更新页面上「所有」时钟。
   * 注意这里查的是整个 document：翻页时我们会克隆一份卡片到翻页背面，
   * 用这种写法克隆体也会跟着走，不用单独处理。
   */
  function updateClocks(root = document) {
    const now = new Date();
    const localOffset = -now.getTimezoneOffset();
    root.querySelectorAll('.clocks__item[data-tz]').forEach((item) => {
      const tz = item.dataset.tz;
      const p = partsIn(tz, now);
      const set = (sel, deg) => item.querySelector(sel).setAttribute('transform', `rotate(${deg} 50 50)`);
      set('.clock__hour', ((p.hour % 12) + p.minute / 60) * 30);
      set('.clock__minute', (p.minute + p.second / 60) * 6);
      set('.clock__second', p.second * 6);
      // 夜里（18:00 ~ 6:00）换成深色表盘，和 iOS 一样一眼看出那边是白天还是晚上
      item.classList.toggle('is-night', p.hour < 6 || p.hour >= 18);
      const day = item.querySelector('[data-role="day"]');
      if (day) day.textContent = dayLabel(p, now);
      const off = item.querySelector('[data-role="offset"]');
      if (off) off.textContent = offsetLabel(tzOffsetMinutes(tz, now) - localOffset);
    });
  }

  function startClockTicker() {
    updateClocks();
    // 对齐到整秒再开始跳，秒针才和系统时间同步
    setTimeout(() => {
      updateClocks();
      setInterval(updateClocks, 1000);
    }, 1000 - (Date.now() % 1000));
  }

  return { renderBattery, renderClocks, updateClocks, startClockTicker };
})();
