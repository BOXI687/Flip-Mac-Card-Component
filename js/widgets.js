/*
 * widgets.js —— 两个 iOS 风格小组件的「长相」
 *
 *   1. 电池组件：4 个圆环（SVG 画圆 + stroke-dasharray 控制进度）
 *   2. 世界时钟：4 个指针表盘（SVG 画表盘 + 每秒旋转指针）
 *
 * 这里全部用「数据 → 生成 HTML 字符串」的方式渲染，改数据就能改外观。
 */
window.Widgets = (function () {
  'use strict';

  // ================= 电池组件 =================

  // 图标都画在 24x24 的格子里。fill="currentColor" 让它们跟随 CSS 的 color。
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
    case: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.5" y="5.5" width="17" height="14" rx="5" fill="currentColor"/>
        <path d="M3.8 10.2h16.4" stroke="var(--card-bg)" stroke-width="0.9"/>
        <circle cx="12" cy="13.6" r="0.9" fill="var(--card-bg)"/>
      </svg>`,
    speaker: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="6" y="2.5" width="12" height="19" rx="2.4" fill="currentColor"/>
        <circle cx="12" cy="7" r="1.6" fill="var(--card-bg)"/>
        <circle cx="12" cy="15" r="3.7" fill="var(--card-bg)"/>
        <circle cx="12" cy="15" r="1.4" fill="currentColor"/>
      </svg>`,
  };

  const RING_R = 28; // 圆环半径（在 64x64 的 viewBox 里）
  const RING_C = 2 * Math.PI * RING_R; // 周长，dasharray 要用

  function batteryItemHTML(d) {
    // 进度环的原理：虚线长度 = 周长；把虚线往回「偏移」没电的那部分，剩下的就是电量
    const offset = RING_C * (1 - d.level / 100);
    const color = d.level <= 20 ? 'var(--red)' : 'var(--green)';
    const bolt = d.charging
      ? `<svg class="ring__bolt" viewBox="0 0 12 16" aria-hidden="true">
           <path d="M7 1 1.8 9h3.6L4.6 15 10.2 6.8H6.6z" fill="${color}"
                 stroke="var(--card-bg)" stroke-width="2.4" paint-order="stroke" stroke-linejoin="round"/>
         </svg>`
      : '';
    return `
      <div class="battery__item">
        <div class="ring">
          <svg class="ring__svg" viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r="${RING_R}" class="ring__track"/>
            <circle cx="32" cy="32" r="${RING_R}" class="ring__progress"
                    stroke="${color}"
                    stroke-dasharray="${RING_C.toFixed(2)}"
                    stroke-dashoffset="${offset.toFixed(2)}"/>
          </svg>
          <div class="ring__icon">${ICONS[d.icon] || ''}</div>
          ${bolt}
        </div>
        <div class="battery__pct">${d.level}%</div>
      </div>`;
  }

  function renderBattery(el, devices) {
    el.innerHTML = `<div class="battery">${devices.map(batteryItemHTML).join('')}</div>`;
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

  function offsetLabel(diffMin) {
    const sign = diffMin < 0 ? '-' : '+';
    const abs = Math.abs(diffMin);
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return `${sign}${h} 小时${m ? ` ${m} 分` : ''}`;
  }

  function dayLabel(tzParts, now) {
    const a = Date.UTC(tzParts.year, tzParts.month - 1, tzParts.day);
    const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const d = Math.round((a - b) / 86400000);
    return d === 0 ? '今天' : d === 1 ? '明天' : d === -1 ? '昨天' : `${d > 0 ? '+' : ''}${d} 天`;
  }

  function clockFaceSVG() {
    // 12 个数字均匀分布在半径 37 的圆上。角度 0 指向 12 点，顺时针。
    let numbers = '';
    for (let i = 1; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x = 50 + Math.sin(a) * 37;
      const y = 50 - Math.cos(a) * 37;
      numbers += `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}">${i}</text>`;
    }
    return `
      <svg class="clock" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="49.5" class="clock__face"/>
        <g class="clock__numbers">${numbers}</g>
        <g class="clock__hour"><line x1="50" y1="50" x2="50" y2="26"/></g>
        <g class="clock__minute"><line x1="50" y1="50" x2="50" y2="13"/></g>
        <g class="clock__second"><line x1="50" y1="59" x2="50" y2="9"/></g>
        <circle cx="50" cy="50" r="3.4" fill="#000"/>
        <circle cx="50" cy="50" r="2.1" fill="var(--orange)"/>
        <circle cx="50" cy="50" r="0.9" fill="#fff"/>
      </svg>`;
  }

  function renderClocks(el, cities) {
    el.innerHTML = `<div class="clocks">${cities
      .map(
        (c) => `
        <div class="clocks__item" data-tz="${c.tz}">
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
      item.querySelector('[data-role="day"]').textContent = dayLabel(p, now);
      item.querySelector('[data-role="offset"]').textContent = offsetLabel(tzOffsetMinutes(tz, now) - localOffset);
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
