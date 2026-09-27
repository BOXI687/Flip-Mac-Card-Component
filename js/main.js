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

  const stack = document.getElementById('stack');

  // 1. 画组件
  Widgets.renderBattery(stack.querySelector('.card--battery'), DEVICES);
  Widgets.renderClocks(stack.querySelector('.card--clock'), CITIES);
  Widgets.startClockTicker();

  // 2. 启动翻角交互（只偷看、不翻页，所以右侧小圆点固定停在第一个，写在 index.html 里）
  const peel = new PeelStack(stack);

  // 3. 调参面板：会先把上次调好的参数装回来，所以要在「首次提示」之前
  Tuner.attach(peel);

  // 4. 可发现性：打开时自动掀一下右下角，暗示「这里可以拖」（面板里可以关掉）
  if (peel.params.hintOnLoad) setTimeout(() => peel.peek('br'), 900);

  // 5. 在 iPhone 上看 console：网址后面加 ?eruda 会加载一个手机端调试面板
  if (/[?&]eruda\b/.test(location.search)) {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/eruda@3';
    s.onload = () => window.eruda.init();
    document.head.appendChild(s);
  }

  // 7. 版本标签：A / B 版本在页面顶部标出自己是哪个版本，免得看混
  const variantLabel = document.documentElement.dataset.variantLabel;
  if (variantLabel) {
    const tag = document.createElement('div');
    tag.className = 'variant-tag';
    tag.textContent = variantLabel;
    document.querySelector('.home').prepend(tag);
  }

  window.peel = peel; // 方便在控制台里玩：peel.peek('tl')
})();
