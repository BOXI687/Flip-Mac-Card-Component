/*
 * 「掀开就聚拢」（engine/reveal.js）的检查。iPhone 393×852 触摸：
 *   npm run build
 *   (cd dist && python3 -m http.server 8780) &
 *   PORT=8780 node tests/verify-reveal.js
 *
 * 天气（中号）、电池（小号）、世界时钟（中号）× A 换座位 / B 磁铁 × 四个角：
 *   - 慢慢掀的时候，主角每一帧的位置是连续的（没有突然跳一下）
 *   - 停住以后，主角的中心在露出来的口子里、是正的（没有歪、没有镜像）、看得见
 *   - 掀到最大：数字滚动停在真实数值
 *   - 松手盖回：下面那张卡上所有改过的样式都清掉了（transform / opacity / 数字滚动那一层）
 * 另外：风格「关」时什么都不动；系统「减弱动态效果」时什么都不动；换了一张卡再掀，量的是新的那张；
 * 天气（小号）、电池（中号）、世界时钟（小号）各跑一次 A / B；没有 console 报错。
 */
const { execSync } = require('child_process');
const { chromium } = require(`${execSync('npm root -g').toString().trim()}/playwright`);
const PORT = process.env.PORT || 8780;
const URL = `http://localhost:${PORT}/index.html`;
const results = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  (' + extra + ')' : ''}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 哪一叠、最上面放第几张，下面（被偷看的）才是想测的那种小组件
const CASES = {
  'weather-medium': { stack: 0, id: 'stack', index: 1, label: '天气' },
  'battery-small': { stack: 2, id: 'stackSmallB', index: 1, label: '电池' },
  'clock-medium': { stack: 0, id: 'stack', index: 0, label: '世界时钟' },
  'weather-small': { stack: 1, id: 'stackSmallA', index: 0, label: '天气' },
  'battery-medium': { stack: 0, id: 'stack', index: 5, label: '电池' },
  'clock-small': { stack: 2, id: 'stackSmallB', index: 0, label: '世界时钟' },
};

async function setup(browser, extra = {}) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, timezoneId: 'Asia/Shanghai' }, extra));
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.clock.setFixedTime(new Date('2026-09-28T15:02:10+08:00')); // 白天：天气是晴天，北京 15:02
  // 只在第一次打开时关掉首次提示（重新加载时保留测试自己写进去的值）
  await page.addInitScript(() => { if (!localStorage.getItem('peel-tuner-v1')) localStorage.setItem('peel-tuner-v1', JSON.stringify({ hintOnLoad: false })); });
  await page.goto(URL);
  await sleep(700);
  const cdp = await ctx.newCDPSession(page);
  const t = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  // 页面里的记录器：每一帧记下主角的位置（reveal 自己算的「看得见的内容的中心」）
  await page.evaluate(() => {
    window.__trace = null;
    const tick = () => {
      if (window.__trace) {
        const d = window.__traceStack.reveal.debug();
        if (d.active) window.__trace.push([d.hero.x, d.hero.y, d.hero.s]);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return { ctx, page, errs, t };
}

const corners = (B) => ({ tl: { x: B.l + 6, y: B.t + 6 }, tr: { x: B.r - 6, y: B.t + 6 }, br: { x: B.r - 6, y: B.b - 6 }, bl: { x: B.l + 6, y: B.b - 6 } });

/** 放好这一叠：最上面是第 index 张，所有叠都用 style */
async function prepare(page, cs, style) {
  await page.evaluate(({ cs, style }) => {
    const p = peels[cs.stack];
    p.swiper.pos = p.swiper.target = cs.index;
    p.setIndex(cs.index);
    peels.forEach((q) => q.setParams({ peekStyle: style, peekRoll: true }));
    window.__traceStack = p;
  }, { cs, style });
  return page.evaluate((id) => { const r = document.getElementById(id).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, cs.id);
}

/** 主角现在的样子：Range 量到的（带变换的）内容中心、在不在口子里、是不是正的 */
const heroState = (page, i) => page.evaluate((i) => {
  const p = peels[i];
  const d = p.reveal.debug();
  if (!d.active) return { active: false };
  const el = p.under.querySelector(`[data-peek="${d.heroKey}"]`);
  // 文字的框：只量元素自己的字（不算数字滚动那一层：它的数字带子很长，只是被裁掉了看不见）
  const r = el instanceof SVGElement ? el.getBoundingClientRect() : (() => {
    const own = [...el.childNodes].filter((n) => !(n.classList && n.classList.contains('peek-roll')));
    const g = document.createRange();
    g.setStartBefore(own[0]);
    g.setEndAfter(own[own.length - 1]);
    return g.getBoundingClientRect();
  })();
  const S = p.el.getBoundingClientRect();
  const c = { x: r.left + r.width / 2 - S.left, y: r.top + r.height / 2 - S.top };
  const f = p.geom && p.geom.f;
  const inside = !!f && f.dist(c) < 0 && c.x > 0 && c.y > 0 && c.x < p.W && c.y < p.H;
  const m = new DOMMatrix(getComputedStyle(el).transform === 'none' ? undefined : getComputedStyle(el).transform);
  const rot = (Math.atan2(m.b, m.a) * 180) / Math.PI;
  return {
    active: true, key: d.heroKey, o: +d.o.toFixed(3), c: { x: +c.x.toFixed(1), y: +c.y.toFixed(1) }, inside,
    upright: m.a > 0 && m.d > 0 && Math.abs(rot) < 1, rot: +rot.toFixed(2), scale: +Math.hypot(m.a, m.b).toFixed(3),
    opacity: +getComputedStyle(el).opacity, roll: d.roll, rollFinal: d.rollFinal,
  };
}, i);

/** 盖回去以后：下面那张卡（和整叠）上不应该留下任何 reveal 改过的样式 */
const leftovers = (page, i) => page.evaluate((i) => {
  const p = peels[i];
  const bad = [];
  p.cards.forEach((card) => card.querySelectorAll('[data-peek]').forEach((el) => {
    if (el.style.transform || el.style.opacity || el.style.transformOrigin || el.style.color || el.style.position) bad.push(`${el.dataset.peek}:${el.getAttribute('style')}`);
  }));
  const overlays = p.el.querySelectorAll('.peek-roll').length;
  return { state: p.state, active: p.reveal.active, bad, overlays };
}, i);

(async () => {
  const browser = await chromium.launch();
  const { ctx, page, errs, t } = await setup(browser);

  // ================= 三种小组件 × A / B × 四个角 =================
  const full = [['weather-medium', 'a'], ['weather-medium', 'b'], ['battery-small', 'a'], ['battery-small', 'b'], ['clock-medium', 'a'], ['clock-medium', 'b']];
  for (const [name, style] of full) {
    const cs = CASES[name];
    for (const c of ['tl', 'tr', 'br', 'bl']) {
      const B = await prepare(page, cs, style);
      const from = corners(B)[c];
      const mid = { x: B.l + B.w / 2, y: B.t + B.h / 2 };
      // 往卡片中心再过去一点（中号卡很宽，只拖到中心的话口子还不大）
      const to = { x: mid.x + (mid.x - from.x) * 0.25, y: mid.y + (mid.y - from.y) * 0.25 };
      await page.evaluate(() => (window.__trace = []));
      await t('touchStart', from.x, from.y);
      for (let k = 1; k <= 40; k++) { await t('touchMove', from.x + (to.x - from.x) * k / 40, from.y + (to.y - from.y) * k / 40); await sleep(16); }
      await sleep(600); // 停住：弹簧停稳
      const trace = await page.evaluate(() => { const tr = window.__trace; window.__trace = null; return tr; });
      const h = await heroState(page, cs.stack);
      // 连续：每一帧走多少 px（v），相邻两帧走的距离差多少（跳变）
      const v = trace.slice(1).map((r, k) => Math.hypot(r[0] - trace[k][0], r[1] - trace[k][1]));
      const jump = Math.max(0, ...v.slice(1).map((x, k) => Math.abs(x - v[k])));
      const sJump = Math.max(0, ...trace.slice(1).map((r, k) => Math.abs(r[2] - trace[k][2])));
      check(`${name} ${style.toUpperCase()} ${c}: hero moves continuously while peeling`, trace.length > 30 && jump < 6 && sJump < 0.08,
        `${trace.length} frames, max step ${Math.max(0, ...v).toFixed(1)}px, max step change ${jump.toFixed(1)}px, max scale step ${sJump.toFixed(3)}`);
      check(`${name} ${style.toUpperCase()} ${c}: paused mid-peel → hero inside the opening, upright, visible`, h.active && h.inside && h.upright && h.opacity > 0.9 && h.scale > 0.35,
        JSON.stringify({ key: h.key, o: h.o, c: h.c, rot: h.rot, scale: h.scale, opacity: h.opacity }));
      // 再往外拖到最大：数字滚动停在真实数值
      const far = { x: mid.x + (mid.x - from.x) * 1.4, y: mid.y + (mid.y - from.y) * 1.4 };
      for (let k = 1; k <= 12; k++) { await t('touchMove', to.x + (far.x - to.x) * k / 12, to.y + (far.y - to.y) * k / 12); await sleep(16); }
      await sleep(700);
      const hf = await heroState(page, cs.stack);
      if (c === 'br' || c === 'tl') {
        check(`${name} ${style.toUpperCase()} ${c}: fully peeled → odometer shows the real value`, hf.active && hf.roll === hf.rollFinal && /\d/.test(hf.rollFinal || '') && hf.inside, `${hf.roll} / ${hf.rollFinal}, o ${hf.o}, inside ${hf.inside}`);
      }
      await t('touchEnd');
      await page.waitForFunction((i) => peels[i].state === 'idle', cs.stack, { timeout: 5000 }).catch(() => {});
      await sleep(60);
      const lo = await leftovers(page, cs.stack);
      check(`${name} ${style.toUpperCase()} ${c}: after release every change on the card is cleared`, lo.state === 'idle' && !lo.active && lo.bad.length === 0 && lo.overlays === 0, JSON.stringify(lo));
    }
  }

  // ================= 另外三种尺寸：每种一个角、A / B =================
  for (const [name, c] of [['weather-small', 'bl'], ['battery-medium', 'tr'], ['clock-small', 'br']]) {
    for (const style of ['a', 'b']) {
      const cs = CASES[name];
      const B = await prepare(page, cs, style);
      const from = corners(B)[c];
      const mid = { x: B.l + B.w / 2, y: B.t + B.h / 2 };
      const to = { x: mid.x + (mid.x - from.x) * 0.25, y: mid.y + (mid.y - from.y) * 0.25 };
      await t('touchStart', from.x, from.y);
      for (let k = 1; k <= 30; k++) { await t('touchMove', from.x + (to.x - from.x) * k / 30, from.y + (to.y - from.y) * k / 30); await sleep(16); }
      await sleep(600);
      const h = await heroState(page, cs.stack);
      await t('touchEnd');
      await page.waitForFunction((i) => peels[i].state === 'idle', cs.stack, { timeout: 5000 }).catch(() => {});
      await sleep(60);
      const lo = await leftovers(page, cs.stack);
      check(`${name} ${style.toUpperCase()} ${c}: hero in the opening, upright; cleared after release`, h.active && h.inside && h.upright && h.opacity > 0.9 && lo.bad.length === 0 && lo.overlays === 0 && !lo.active,
        JSON.stringify({ key: h.key, o: h.o, c: h.c, rot: h.rot, lo }));
    }
  }

  // ================= 「关」：什么都不动 =================
  {
    const cs = CASES['weather-medium'];
    const B = await prepare(page, cs, 'off');
    const from = corners(B).br;
    await t('touchStart', from.x, from.y);
    for (let k = 1; k <= 20; k++) { await t('touchMove', from.x - B.w * 0.5 * k / 20, from.y - B.h * 0.5 * k / 20); await sleep(16); }
    await sleep(300);
    const off = await page.evaluate((i) => { const p = peels[i]; return { state: p.state, active: p.reveal.active, styled: [...p.under.querySelectorAll('[data-peek]')].filter((e) => e.getAttribute('style')).length }; }, cs.stack);
    await t('touchEnd'); await sleep(1300);
    check('style 关: nothing on the under card moves', off.state === 'dragging' && !off.active && off.styled === 0, JSON.stringify(off));
  }

  // ================= 滑到别的卡以后再掀：量的是新的「下一张」 =================
  {
    await page.evaluate(() => peels.forEach((q) => q.setParams({ peekStyle: 'a' })));
    const cs = CASES['weather-medium'];
    await prepare(page, cs, 'a'); // 中号最上面是世界时钟，下面是天气
    const B = await page.evaluate(() => { const r = document.getElementById('stack').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; });
    // 手指往上滑一张：最上面换成天气，下面是播客（没有说明 → 不动）
    const m = { x: B.l + B.w / 2, y: B.t + B.h / 2 };
    await t('touchStart', m.x, m.y);
    for (let k = 1; k <= 12; k++) { await t('touchMove', m.x, m.y - 110 * k / 12); await sleep(16); }
    await t('touchEnd'); await sleep(1000);
    const from = corners(B).br;
    await t('touchStart', from.x, from.y);
    for (let k = 1; k <= 20; k++) { await t('touchMove', from.x - B.w * 0.5 * k / 20, from.y - B.h * 0.4 * k / 20); await sleep(16); }
    await sleep(300);
    const a = await page.evaluate(() => ({ index: peel.index, under: peel.under.getAttribute('aria-label'), active: peel.reveal.active }));
    await t('touchEnd'); await sleep(1300);
    // 往下滑回去两张：最上面是电池，下面是世界时钟（有说明 → 动）
    for (let n = 0; n < 2; n++) {
      await t('touchStart', m.x, m.y);
      for (let k = 1; k <= 12; k++) { await t('touchMove', m.x, m.y + 110 * k / 12); await sleep(16); }
      await t('touchEnd'); await sleep(1000);
    }
    await t('touchStart', from.x, from.y);
    for (let k = 1; k <= 20; k++) { await t('touchMove', from.x - B.w * 0.5 * k / 20, from.y - B.h * 0.4 * k / 20); await sleep(16); }
    await sleep(400);
    const b = await page.evaluate(() => ({ index: peel.index, under: peel.under.getAttribute('aria-label'), active: peel.reveal.active, card: peel.reveal.card === peel.under, hero: peel.reveal.debug().heroKey }));
    await t('touchEnd'); await sleep(1300);
    const lo = await leftovers(page, 0);
    check('after swiping: peeking a widget without a spec moves nothing; swiping back measures the new under card', a.index === 2 && a.under === '播客·待播清单' && !a.active && b.index === 0 && b.under === '世界时钟' && b.active && b.card && b.hero === 'time' && lo.bad.length === 0,
      JSON.stringify({ a, b, lo }));
  }

  // ================= 调参面板：风格切换、默认标记、数字滚动开关 =================
  {
    await page.evaluate(() => { document.getElementById('tunerOpen').click(); });
    await sleep(600);
    const seg = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('.tn-seg__btn')];
      return { names: btns.map((b) => b.textContent), def: btns.filter((b) => b.classList.contains('is-default')).map((b) => b.textContent), sel: btns.filter((b) => b.classList.contains('is-selected')).map((b) => b.textContent), minH: Math.min(...btns.map((b) => b.getBoundingClientRect().height)) };
    });
    check('panel: 信息怎么动 shows A / B / 关 with A marked default', seg.names.join() === 'A 换座位,B 磁铁,关' && seg.def.join() === 'A 换座位' && seg.sel.join() === 'A 换座位' && seg.minH >= 44, JSON.stringify(seg));
    await page.evaluate(() => { const b = [...document.querySelectorAll('.tn-seg__btn')].find((x) => x.textContent === 'B 磁铁'); b.scrollIntoView({ block: 'center' }); });
    await sleep(100);
    const bb = await page.evaluate(() => { const r = [...document.querySelectorAll('.tn-seg__btn')].find((x) => x.textContent === 'B 磁铁').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await t('touchStart', bb.x, bb.y); await sleep(30); await t('touchEnd'); await sleep(100);
    const after = await page.evaluate(() => ({ all: peels.every((p) => p.params.peekStyle === 'b'), saved: JSON.parse(localStorage.getItem(Tuner.STORE_KEY)).peekStyle, readout: [...document.querySelectorAll('.tn-row')].find((r) => r.querySelector('.tn-label').textContent === '信息怎么动').querySelector('.tn-value').textContent }));
    check('panel: tapping B 磁铁 switches every stack and is saved', after.all && after.saved === 'b' && after.readout === 'B 磁铁', JSON.stringify(after));
    await page.evaluate(() => document.querySelector('.tn-switch[aria-label="数字滚动"]').click());
    check('panel: 数字滚动 switch toggles peekRoll', await page.evaluate(() => peels.every((p) => p.params.peekRoll === false)));
    await page.evaluate(() => { localStorage.setItem(Tuner.STORE_KEY, JSON.stringify({ peekStyle: 'zzz', peekScale: 9, hintOnLoad: false })); });
    await page.reload(); await sleep(700);
    const sane = await page.evaluate(() => [peel.params.peekStyle, peel.params.peekScale]);
    check('panel: bad saved peek values are sanitised', sane[0] === 'a' && sane[1] === 2.2, sane.join());
  }
  check('no console/page errors', errs.length === 0, errs.join(' | '));
  await ctx.close();

  // ================= 系统「减弱动态效果」：信息不动 =================
  {
    const s = await setup(browser, { reducedMotion: 'reduce' });
    const cs = CASES['weather-medium'];
    const B = await prepare(s.page, cs, 'a');
    const from = corners(B).br;
    await s.t('touchStart', from.x, from.y);
    for (let k = 1; k <= 20; k++) { await s.t('touchMove', from.x - B.w * 0.5 * k / 20, from.y - B.h * 0.5 * k / 20); await sleep(16); }
    await sleep(300);
    const r = await s.page.evaluate((i) => { const p = peels[i]; return { state: p.state, active: p.reveal.active, styled: [...p.under.querySelectorAll('[data-peek]')].filter((e) => e.getAttribute('style')).length }; }, cs.stack);
    await s.t('touchEnd'); await sleep(1300);
    check('prefers-reduced-motion: under card stays still', r.state === 'dragging' && !r.active && r.styled === 0 && s.errs.length === 0, JSON.stringify(r));
    await s.ctx.close();
  }

  await browser.close();
  console.log(results.join('\n'));
  console.log(`\n${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed`);
})();
