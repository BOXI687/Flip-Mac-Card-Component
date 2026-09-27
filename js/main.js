/*
 * main.js —— 把所有东西组装起来
 */
(function () {
  'use strict';

  // ---- 数据：想改组件内容，就改这里 ----
  const DEVICES = [
    { icon: 'iphone', level: 41, charging: false },
    { icon: 'airpods', level: 100, charging: true },
    { icon: 'case', level: 100, charging: true },
    { icon: 'speaker', level: 100, charging: false },
  ];

  const CITIES = [
    { name: '北京', tz: 'Asia/Shanghai' },
    { name: '马德里', tz: 'Europe/Madrid' },
    { name: '东京', tz: 'Asia/Tokyo' },
    { name: '伦敦', tz: 'Europe/London' },
  ];

  const stack = document.getElementById('stack'); // 中号那一叠
  const smallStacks = [document.getElementById('stackSmallA'), document.getElementById('stackSmallB')];

  // 1. 画组件：中号 4 个设备 / 4 个城市；小号电池是 2×2 圆环，小号时钟只显示一个城市
  Widgets.renderBattery(stack.querySelector('.card--battery'), DEVICES);
  Widgets.renderClocks(stack.querySelector('.card--clock'), CITIES);
  const smallCity = [CITIES[3], CITIES[0]]; // 左边那叠下面藏着伦敦，右边那叠最上面是北京
  smallStacks.forEach((el, i) => {
    Widgets.renderBattery(el.querySelector('.card--battery'), DEVICES, 'small');
    Widgets.renderClocks(el.querySelector('.card--clock'), [smallCity[i]], 'small');
  });
  Widgets.startClockTicker();

  // 2. 电池组件是「玻璃」材质：卡片里画一份和屏幕对齐的壁纸，看起来像透过去看到了壁纸。
  //    （卡片本身必须不透明，不然掀角时会透出下面那张卡，所以是「假玻璃」）
  //    这里告诉 CSS：每一叠在屏幕上的位置、壁纸有多大，好让那份壁纸对齐
  const root = document.documentElement;
  const allStacks = [stack, ...smallStacks];
  function syncWallpaper() {
    const wp = getComputedStyle(document.body, '::before');
    root.style.setProperty('--wp-w', `${innerWidth}px`);
    root.style.setProperty('--wp-h', wp.height);
    allStacks.forEach((el) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--wp-x', `${(-r.left).toFixed(1)}px`);
      el.style.setProperty('--wp-y', `${(-r.top).toFixed(1)}px`);
    });
  }
  syncWallpaper();
  window.addEventListener('resize', syncWallpaper);
  // 电脑上侧边栏开关时内容会滑动：滑动期间每一帧都对齐一次
  let syncing = 0;
  const home = document.querySelector('.home');
  home.addEventListener('transitionrun', (e) => {
    if (e.target !== home || syncing) return;
    const tick = () => { syncWallpaper(); syncing = requestAnimationFrame(tick); };
    syncing = requestAnimationFrame(tick);
  });
  home.addEventListener('transitionend', (e) => {
    if (e.target !== home) return;
    cancelAnimationFrame(syncing);
    syncing = 0;
    syncWallpaper();
  });

  // 3. 启动翻角交互（只偷看、不翻页，所以右侧小圆点固定停在第一个，写在 index.html 里）
  //    每一叠各有一个 PeelStack，互不影响；调参面板的参数对所有叠都生效
  const peel = new PeelStack(stack);
  const smallPeels = smallStacks.map((el) => new PeelStack(el));

  // 4. 调参面板：会先把上次调好的参数装回来，所以要在「首次提示」之前
  Tuner.attach(peel, smallPeels);
  // 面板在电脑上默认开着（不播动画地把内容推到左边），推完再对齐一次壁纸
  syncWallpaper();
  requestAnimationFrame(() => requestAnimationFrame(syncWallpaper));

  // 可发现性：打开时自动掀一下中号那叠的右下角，暗示「这里可以拖」（面板里可以关掉）
  if (peel.params.hintOnLoad) setTimeout(() => peel.peek('br'), 900);

  // 5. 在 iPhone 上看 console：网址后面加 ?eruda 会加载一个手机端调试面板
  if (/[?&]eruda\b/.test(location.search)) {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/eruda@3';
    s.onload = () => window.eruda.init();
    document.head.appendChild(s);
  }

  // 6. 版本标签：A / B 版本在页面顶部标出自己是哪个版本，免得看混
  const variantLabel = document.documentElement.dataset.variantLabel;
  if (variantLabel) {
    const tag = document.createElement('div');
    tag.className = 'variant-tag';
    tag.textContent = variantLabel;
    document.querySelector('.home').prepend(tag);
  }

  window.peel = peel; // 方便在控制台里玩：peel.peek('tl')
  window.peels = [peel, ...smallPeels]; // 所有叠（测试用）
})();
