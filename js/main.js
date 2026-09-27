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
  const dots = Array.from(document.querySelectorAll('#dots span'));

  // 1. 画组件
  Widgets.renderBattery(stack.querySelector('.card--battery'), DEVICES);
  Widgets.renderClocks(stack.querySelector('.card--clock'), CITIES);
  Widgets.startClockTicker();

  // 2. 右侧的小圆点：告诉用户现在是第几张（和 iOS 智能叠放一样）
  const allCards = Array.from(stack.querySelectorAll(':scope > .card'));
  function updateDots(order) {
    const topIndex = allCards.indexOf(order[0]);
    dots.forEach((d, i) => d.classList.toggle('is-active', i === topIndex));
  }

  // 3. 启动翻角交互
  const peel = new PeelStack(stack, { onChange: updateDots });
  updateDots(peel.cards);

  // 4. 可发现性：第一次打开时自动掀一下右下角，暗示「这里可以拖」
  setTimeout(() => peel.peek('br'), 900);

  // 5. 调试开关：显示折痕、C/M/P 三个点、两块多边形
  const debugBtn = document.getElementById('debugToggle');
  debugBtn.addEventListener('click', () => {
    const on = !stack.classList.contains('show-debug');
    peel.setDebug(on);
    debugBtn.textContent = on ? '隐藏几何辅助线' : '显示几何辅助线';
  });

  // 6. 在 iPhone 上看 console：网址后面加 ?eruda 会加载一个手机端调试面板
  if (/[?&]eruda\b/.test(location.search)) {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/eruda@3';
    s.onload = () => window.eruda.init();
    document.head.appendChild(s);
  }

  window.peel = peel; // 方便在控制台里玩：peel.peek('tl')
})();
