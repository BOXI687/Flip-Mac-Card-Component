/*
 * 「掀开就聚拢」（engine/reveal.js）的检查。iPhone 393×852 触摸：
 *   npm run build
 *   (cd dist && python3 -m http.server 8780) &
 *   PORT=8780 node tests/verify-reveal.js
 *
 * 三叠里的六张卡都有「掀开就聚拢」说明，每一张在「另一张」下面时（天气、设备电量、日历 × 四个角；
 * 地图、待办、健身小号 × br、tl 两个角）：
 *   - 慢慢掀的时候，主角每一帧的位置是连续的（没有突然跳一下）
 *   - 停住以后，主角的中心在露出来的口子里、是正的（没有歪、没有镜像）、看得见
 *   - 掀到最大：数字逐位升起全部到位，显示的是真实数值（有升起数字的卡，br、tl）
 *   - 松手盖回：下面那张卡上所有改过的样式都清掉了（transform / opacity / 数字升起那一层）
 * 数字逐位升起（修「15:96」那种错数字）：地图的到达时间、天气的「几点起有雨」、日历的倒计时、健身的「还差 314 大卡」、
 *   设备电量的 % 各两个角，慢慢掀、中途停三次、慢慢盖回，
 *   每一帧都检查：数字层里每一位都是真实数值里那个位置上的字，没有多余的字；原来的字是透明的（不会叠两层）；
 *   停住时数字也停住；掀到最大时每一位都升到位，和原来的字重合（差不到 1px）；汉字（「到」「分钟后」）一直在原位。
 *   日历、地图（br）：掀着的时候真的过了一分钟（倒计时、到达时间变了），数字层马上是新的字。
 * 另外：面板里关掉「掀开时信息聚拢」时什么都不动；系统「减弱动态效果」时什么都不动；换了一张卡再掀，量的是新的那张；
 * 面板的开关、旧存档（A / B / 关）的换算；没有 console 报错。
 * （世界时钟、播客、备忘录、健身中号、电池中号现在不在任何一叠里，不测；它们的说明还在代码里。）
 */
const { execSync } = require('child_process');
const { chromium } = require(`${execSync('npm root -g').toString().trim()}/playwright`);
const PORT = process.env.PORT || 8780;
const URL = `http://localhost:${PORT}/index.html`;
const results = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  (' + extra + ')' : ''}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 哪一叠、最上面放第几张，下面（被偷看的 = 下一张，最后一张的下一张绕回第一张）才是想测的那种小组件。
// 现在的叠法（src/data.js 的 STACKS）：每叠一对
//   中号 [地图, 天气]；左边小号 [日历, 待办]；右边小号 [健身, 设备电量]
// roll = 这种小组件有「数字逐位升起」；hero = 主角的名字（说明改了会报出来）
const CASES = {
  'weather-medium': { stack: 0, id: 'stack', index: 0, label: '天气', roll: true, hero: 'rain' },
  'calendar-small': { stack: 1, id: 'stackSmallA', index: 1, label: '日历', roll: true, hero: 'count' },
  'battery-small': { stack: 2, id: 'stackSmallB', index: 0, label: '设备电量', roll: true, hero: 'pct' },
  'map-medium': { stack: 0, id: 'stack', index: 1, label: '地图', roll: true, hero: 'arrive' },
  'todo-small': { stack: 1, id: 'stackSmallA', index: 0, label: '待办', hero: 't1' },
  'fitness-small': { stack: 2, id: 'stackSmallB', index: 1, label: '健身·活动', roll: true, hero: 'left' },
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

/** 放好这一叠：最上面是第 index 张；gather = 所有叠的「掀开时信息聚拢」开不开 */
async function prepare(page, cs, gather = true) {
  await page.evaluate(({ cs, gather }) => {
    const p = peels[cs.stack];
    p.swiper.pos = p.swiper.target = cs.index;
    p.setIndex(cs.index);
    peels.forEach((q) => q.setParams({ peekGather: gather, peekRoll: true }));
    // 下面那张真的是想测的那种（STACKS 改了顺序这里会报出来）
    if (p.under.getAttribute('aria-label') !== cs.label) throw new Error(`under card is ${p.under.getAttribute('aria-label')}, expected ${cs.label}`);
    window.__traceStack = p;
  }, { cs, gather });
  return page.evaluate((id) => { const r = document.getElementById(id).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, cs.id);
}

/** 主角现在的样子：Range 量到的（带变换的）内容中心、在不在口子里、是不是正的 */
const heroState = (page, i) => page.evaluate((i) => {
  const p = peels[i];
  const d = p.reveal.debug();
  if (!d.active) return { active: false };
  const el = p.under.querySelector(`[data-peek="${d.heroKey}"]`);
  // 文字的框：只量元素自己的字（不算数字升起那一层）
  const r = el instanceof SVGElement ? el.getBoundingClientRect() : (() => {
    const own = [...el.childNodes].filter((n) => !(n.classList && n.classList.contains('peek-rise')));
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
    opacity: +getComputedStyle(el).opacity, rise: d.rise,
  };
}, i);

/** 盖回去以后：下面那张卡（和整叠）上不应该留下任何 reveal 改过的样式 */
const leftovers = (page, i) => page.evaluate((i) => {
  const p = peels[i];
  const bad = [];
  p.cards.forEach((card) => card.querySelectorAll('[data-peek]').forEach((el) => {
    if (el.style.transform || el.style.opacity || el.style.transformOrigin || el.style.color || el.style.position) bad.push(`${el.dataset.peek}:${el.getAttribute('style')}`);
  }));
  const overlays = p.el.querySelectorAll('.peek-rise').length;
  return { state: p.state, active: p.reveal.active, bad, overlays };
}, i);

(async () => {
  const browser = await chromium.launch();
  const { ctx, page, errs, t } = await setup(browser);

  // ================= 六张卡：前三种 × 四个角，后三种（第二阶段新加的）× br、tl =================
  for (const name of Object.keys(CASES)) {
    const cs = CASES[name];
    for (const c of ['map-medium', 'todo-small', 'fitness-small'].includes(name) ? ['tl', 'br'] : ['tl', 'tr', 'br', 'bl']) {
      const B = await prepare(page, cs);
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
      check(`${name} ${c}: hero moves continuously while peeling`, trace.length > 30 && jump < 6 && sJump < 0.08,
        `${trace.length} frames, max step ${Math.max(0, ...v).toFixed(1)}px, max step change ${jump.toFixed(1)}px, max scale step ${sJump.toFixed(3)}`);
      check(`${name} ${c}: paused mid-peel → hero inside the opening, upright, visible`, h.active && h.key === cs.hero && h.inside && h.upright && h.opacity > 0.9 && h.scale > 0.35,
        JSON.stringify({ key: h.key, o: h.o, c: h.c, rot: h.rot, scale: h.scale, opacity: h.opacity }));
      // 再往外拖到最大：数字逐位升起全部到位
      const far = { x: mid.x + (mid.x - from.x) * 1.4, y: mid.y + (mid.y - from.y) * 1.4 };
      for (let k = 1; k <= 12; k++) { await t('touchMove', to.x + (far.x - to.x) * k / 12, to.y + (far.y - to.y) * k / 12); await sleep(16); }
      await sleep(700);
      const hf = await heroState(page, cs.stack);
      if (cs.roll && (c === 'br' || c === 'tl')) {
        const rs = hf.rise;
        check(`${name} ${c}: fully peeled → every digit risen, showing the real value`, hf.active && !!rs && /\d/.test(rs.text) && rs.glyphs.map((g) => g.ch).join('') === rs.text && rs.glyphs.every((g) => g.p === 1) && hf.inside,
          `${rs && rs.glyphs.map((g) => `${g.ch}:${g.p}`).join(' ')} / ${rs && rs.text}, o ${hf.o}, inside ${hf.inside}`);
      }
      await t('touchEnd');
      await page.waitForFunction((i) => peels[i].state === 'idle', cs.stack, { timeout: 5000 }).catch(() => {});
      await sleep(60);
      const lo = await leftovers(page, cs.stack);
      check(`${name} ${c}: after release every change on the card is cleared`, lo.state === 'idle' && !lo.active && lo.bad.length === 0 && lo.overlays === 0, JSON.stringify(lo));
    }
  }

  // ================= 数字逐位升起：每一帧看到的都是正确的字 =================
  // 地图的到达时间、天气的「几点起有雨」、日历的倒计时、健身的「还差 … 大卡」、设备电量 % × 两个角；
  // 慢慢掀（很多小步）、停三次、慢慢盖回、松手
  // 升起的是说明里 roll 写的那个元素（stopsAt：主角不是 roll 的元素时，要在它出场的那一段停，现在都不需要）
  const RISE_CASES = [
    ['map-medium', /^\d\d:\d\d 到$/],
    ['weather-medium', /^\d\d:00 起有雨$/],
    ['calendar-small', /^\d+ 分钟后$/],
    ['fitness-small', /^还差 \d+ 大卡$/],
    ['battery-small', /^\d+%$/],
  ];
  // 真的过一分钟用的：和 setup() 里冻住的时间一样
  const T0 = new Date('2026-09-28T15:02:10+08:00');
  for (const [name, shape, stopsAt] of RISE_CASES) {
    for (const c of ['br', 'tl']) {
      const cs = CASES[name];
      const B = await prepare(page, cs);
      // 页面里的检查器：每一帧（requestAnimationFrame）都看一遍数字层
      await page.evaluate((i) => {
        const p = peels[i];
        const S = (window.__rise = { frames: 0, layerFrames: 0, bad: [], texts: new Set(), partial: 0, on: true });
        const tick = () => {
          if (!S.on) return;
          const d = p.reveal.debug();
          if (d.active) {
            S.frames++;
            const el = p.under.querySelector(`[data-peek="${p.reveal.spec.roll}"]`);
            const layer = el.querySelector(':scope > .peek-rise');
            if (layer) {
              S.layerFrames++;
              // 「真实数值」= React 写在元素里的字（不算数字层）
              const own = [...el.childNodes].filter((n) => n !== layer).map((n) => n.textContent).join('');
              S.texts.add(own);
              const wins = [...layer.children];
              const chars = [...own];
              const err = (m) => S.bad.length < 5 && S.bad.push(`o ${d.o.toFixed(3)}: ${m}`);
              if (layer.childNodes.length !== wins.length) err('stray text node in the layer');
              if (wins.length !== chars.length) err(`${wins.length} glyphs for "${own}"`);
              if (layer.textContent !== own) err(`layer shows "${layer.textContent}", real "${own}"`);
              wins.forEach((w, j) => {
                if (w.childNodes.length !== 1 || w.firstChild.childNodes.length !== 1 || w.textContent !== chars[j]) err(`glyph ${j} is "${w.textContent}", real "${chars[j]}"`);
                const op = +getComputedStyle(w.firstChild).opacity;
                if (op > 0.02 && op < 0.98) S.partial++;
                // 汉字、空格是标签，不升：一直在原位（没有变换、不透明）
                if (/[\s\u3000-\u9fff]/.test(chars[j]) && (w.firstChild.style.transform || w.firstChild.style.opacity)) err(`label "${chars[j]}" moved`);
              });
              // 原来的字必须是透明的，否则会和数字层叠成两层
              if (!/rgba\(.*, 0\)|transparent/.test(getComputedStyle(el).color)) err(`original text visible (${getComputedStyle(el).color})`);
            }
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }, cs.stack);
      const from = corners(B)[c];
      const mid = { x: B.l + B.w / 2, y: B.t + B.h / 2 };
      const far = { x: mid.x + (mid.x - from.x) * 1.4, y: mid.y + (mid.y - from.y) * 1.4 };
      const pos = (k) => ({ x: from.x + (far.x - from.x) * k, y: from.y + (far.y - from.y) * k });
      const oNow = () => page.evaluate((i) => { const d = peels[i].reveal.debug(); return d.active ? d.o : 0; }, cs.stack);
      const riseNow = () => page.evaluate((i) => { const d = peels[i].reveal.debug(); return d.active && d.rise ? d.rise.glyphs.map((g) => g.p).join() : ''; }, cs.stack);
      await t('touchStart', from.x, from.y);
      // 很多小步往外掀；掀开程度过了 8% / 14% / 20%（健身见上面）时各停一下，看停住时数字是不是也停住
      const stops = (stopsAt || [0.08, 0.14, 0.2]).slice();
      const held = [];
      let k = 0;
      while (k < 1) {
        k = Math.min(1, k + 0.006);
        const p = pos(k);
        await t('touchMove', p.x, p.y);
        await sleep(16);
        if (stops.length && (await oNow()) >= stops[0]) {
          stops.shift();
          // 等数字的弹簧停稳（停稳时引擎把速度直接设成 0）。健身的数字在很短一段里升起，停住时离目标较远，
          // 机器忙的时候要多等一会儿；最多等 3 秒
          await sleep(600);
          await page.waitForFunction((i) => peels[i].reveal.rollV === 0, cs.stack, { timeout: 3000 }).catch(() => {});
          const a = await riseNow();
          await sleep(250);
          const b = await riseNow();
          held.push({ a, b });
        }
      }
      await sleep(700);
      // 掀到最大：每一位都升到位（没有变换、不透明），和原来的字重合
      const rest = await page.evaluate((i) => {
        const p = peels[i];
        const d = p.reveal.debug();
        const el = p.under.querySelector(`[data-peek="${p.reveal.spec.roll}"]`);
        const layer = el.querySelector(':scope > .peek-rise');
        if (!layer) return { ok: false, why: 'no layer' };
        // 元素里所有的字（包括子元素里的，比如「大卡」），不算数字层
        const nodes = [];
        const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = walk.nextNode(); n; n = walk.nextNode()) if (!layer.contains(n)) nodes.push(n);
        const wins = [...layer.children];
        let j = 0;
        let maxOff = 0;
        const r = document.createRange();
        for (const n of nodes) {
          for (let q = 0; q < n.data.length; q++) {
            r.setStart(n, q); r.setEnd(n, q + 1);
            const a = r.getBoundingClientRect();
            if (!wins[j] || !wins[j].firstChild) return { ok: false, why: `no glyph for character ${j}` };
            const g = wins[j++].firstChild;
            const r2 = document.createRange(); r2.selectNodeContents(g);
            const b = r2.getBoundingClientRect();
            maxOff = Math.max(maxOff, Math.abs(b.left - a.left), Math.abs(b.top - a.top), Math.abs(b.bottom - a.bottom));
          }
        }
        const still = wins.every((w) => !w.firstChild.style.transform && !w.firstChild.style.opacity && getComputedStyle(w.firstChild).opacity === '1');
        return { ok: true, text: d.rise.text, all: d.rise.glyphs.every((g) => g.p === 1), still, maxOff: +maxOff.toFixed(2), o: +d.o.toFixed(3), n: wins.length };
      }, cs.stack);
      if ((name === 'calendar-small' || name === 'map-medium') && c === 'br') {
        // 1) 字在掀着的时候变了（像 React 那样直接改字）：还没画下一帧，数字层就已经是新的字，而且直接是到位的（不滚）
        const tick = await page.evaluate(async (i) => {
          const p = peels[i];
          const el = p.under.querySelector(`[data-peek="${p.reveal.spec.roll}"]`);
          const node = [...el.childNodes].filter((n) => n.nodeType === 3 && n.data.trim()).pop();
          const old = node.data;
          const last = old.slice(-1);
          node.data = old.slice(0, -1) + (last === '9' ? '0' : String(+last + 1));
          await Promise.resolve(); // MutationObserver 在微任务里跑
          const layer = el.querySelector(':scope > .peek-rise');
          const own = [...el.childNodes].filter((n) => n !== layer).map((n) => n.textContent).join('');
          const r = { own, layer: layer.textContent, risen: p.reveal.debug().rise.glyphs.every((g) => g.p === 1) };
          node.data = old;
          await Promise.resolve();
          r.back = layer.textContent;
          return r;
        }, cs.stack);
        check(`digit rise ${name}: text changes mid-peel → layer rebuilt with the new characters before the next frame, already risen`, tick.layer === tick.own && tick.risen && tick.back !== tick.layer, JSON.stringify(tick));
        // 2) 真的过了一分钟（时钟往后拨）：React 自己改了倒计时 / 到达时间，数字层跟着是新的值（每一帧的检查也一直在跑）
        const before = await page.evaluate((i) => peels[i].reveal.debug().rise.text, cs.stack);
        await page.clock.setFixedTime(new Date(T0.getTime() + 60 * 1000));
        await page.waitForFunction(({ i, before }) => peels[i].reveal.debug().rise.text !== before, { i: cs.stack, before }, { timeout: 3000 }).catch(() => {});
        await sleep(100);
        const after = await page.evaluate((i) => {
          const p = peels[i];
          const el = p.under.querySelector(`[data-peek="${p.reveal.spec.roll}"]`);
          const layer = el.querySelector(':scope > .peek-rise');
          const own = [...el.childNodes].filter((n) => n !== layer).map((n) => n.textContent).join('');
          return { own, layer: layer.textContent, risen: p.reveal.debug().rise.glyphs.every((g) => g.p === 1) };
        }, cs.stack);
        await page.clock.setFixedTime(T0);
        await page.waitForFunction(({ i, before }) => peels[i].reveal.debug().rise.text === before, { i: cs.stack, before }, { timeout: 3000 }).catch(() => {});
        check(`digit rise ${name}: a real minute passes mid-peel → the risen number shows the new value`, after.own !== before && after.layer === after.own && after.risen && shape.test(after.own), JSON.stringify({ before, after }));
      }
      // 慢慢盖回去（很多小步），再松手
      while (k > 0.05) {
        k = Math.max(0.05, k - 0.008);
        const p = pos(k);
        await t('touchMove', p.x, p.y);
        await sleep(16);
      }
      await t('touchEnd');
      await page.waitForFunction((i) => peels[i].state === 'idle', cs.stack, { timeout: 5000 }).catch(() => {});
      await sleep(60);
      const S = await page.evaluate(() => { const S = window.__rise; S.on = false; return { frames: S.frames, layerFrames: S.layerFrames, bad: S.bad, texts: [...S.texts], partial: S.partial }; });
      const lo = await leftovers(page, cs.stack);
      const tag = `digit rise ${name} ${c}`;
      check(`${tag}: every frame shows only the real characters in the right places`, S.layerFrames > 100 && S.layerFrames === S.frames && S.bad.length === 0 && S.texts.length >= 1 && S.texts.every((x) => shape.test(x)),
        JSON.stringify({ frames: S.frames, layerFrames: S.layerFrames, texts: S.texts, bad: S.bad }));
      check(`${tag}: scrubbed — digits pause when the finger pauses (±0.002), and were seen part-way`, held.length === 3 && held.every((h) => h.a && h.a.split(',').every((v, j) => Math.abs(+v - +h.b.split(',')[j]) <= 0.002)) && held.some((h) => h.a.split(',').some((v) => +v > 0 && +v < 1)) && S.partial > 0,
        JSON.stringify(held));
      check(`${tag}: fully peeled → all risen, at rest, on top of the original text (≤1px)`, rest.ok && rest.all && rest.still && rest.maxOff <= 1 && shape.test(rest.text), JSON.stringify(rest));
      check(`${tag}: after release the layer and styles are gone`, lo.state === 'idle' && !lo.active && lo.bad.length === 0 && lo.overlays === 0, JSON.stringify(lo));
    }
  }

  // ================= 关掉「掀开时信息聚拢」：什么都不动 =================
  {
    const cs = CASES['weather-medium'];
    const B = await prepare(page, cs, false);
    const from = corners(B).br;
    await t('touchStart', from.x, from.y);
    for (let k = 1; k <= 20; k++) { await t('touchMove', from.x - B.w * 0.5 * k / 20, from.y - B.h * 0.5 * k / 20); await sleep(16); }
    await sleep(300);
    const off = await page.evaluate((i) => { const p = peels[i]; return { state: p.state, active: p.reveal.active, styled: [...p.under.querySelectorAll('[data-peek]')].filter((e) => e.getAttribute('style')).length }; }, cs.stack);
    await t('touchEnd'); await sleep(1300);
    check('掀开时信息聚拢 off: nothing on the under card moves', off.state === 'dragging' && !off.active && off.styled === 0, JSON.stringify(off));
  }

  // ================= 滑到别的卡以后再掀：量的是新的「下一张」 =================
  {
    const cs = CASES['weather-medium'];
    await prepare(page, cs); // 中号最上面是地图，下面是天气
    const B = await page.evaluate(() => { const r = document.getElementById('stack').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; });
    // 手指往上滑一张：最上面换成天气，下面绕回地图（量的要是地图，不能还在量天气）
    const m = { x: B.l + B.w / 2, y: B.t + B.h / 2 };
    await t('touchStart', m.x, m.y);
    for (let k = 1; k <= 12; k++) { await t('touchMove', m.x, m.y - 110 * k / 12); await sleep(16); }
    await t('touchEnd'); await sleep(1000);
    const from = corners(B).br;
    await t('touchStart', from.x, from.y);
    for (let k = 1; k <= 20; k++) { await t('touchMove', from.x - B.w * 0.5 * k / 20, from.y - B.h * 0.4 * k / 20); await sleep(16); }
    await sleep(300);
    const a = await page.evaluate(() => ({ index: peel.index, under: peel.under.getAttribute('aria-label'), active: peel.reveal.active, card: peel.reveal.card === peel.under, hero: peel.reveal.debug().heroKey }));
    await t('touchEnd'); await sleep(1300);
    // 往下滑回去一张：最上面又是地图，下面是天气（量的是天气）
    await t('touchStart', m.x, m.y);
    for (let k = 1; k <= 12; k++) { await t('touchMove', m.x, m.y + 110 * k / 12); await sleep(16); }
    await t('touchEnd'); await sleep(1000);
    await t('touchStart', from.x, from.y);
    for (let k = 1; k <= 20; k++) { await t('touchMove', from.x - B.w * 0.5 * k / 20, from.y - B.h * 0.4 * k / 20); await sleep(16); }
    await sleep(400);
    const b = await page.evaluate(() => ({ index: peel.index, under: peel.under.getAttribute('aria-label'), active: peel.reveal.active, card: peel.reveal.card === peel.under, hero: peel.reveal.debug().heroKey }));
    await t('touchEnd'); await sleep(1300);
    const lo = await leftovers(page, 0);
    check('after swiping: each peel measures the new under card (天气 on top → 地图 moves, hero arrive; back to 地图 on top → 天气 moves, hero rain)', a.index === 1 && a.under === '地图' && a.active && a.card && a.hero === 'arrive' && b.index === 0 && b.under === '天气' && b.active && b.card && b.hero === 'rain' && lo.bad.length === 0,
      JSON.stringify({ a, b, lo }));
  }

  // ================= 调参面板：聚拢开关、数字升起开关、旧存档的换算 =================
  {
    await page.evaluate(() => { tuner.open(); });
    await sleep(600);
    const swInfo = (label) => page.evaluate((label) => {
      const s = document.querySelector(`.tn-switch[aria-label="${label}"]`);
      if (!s) return null;
      s.scrollIntoView({ block: 'center' });
      const r = s.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, on: s.getAttribute('aria-checked') };
    }, label);
    const g0 = await swInfo('掀开时信息聚拢');
    const leftovers0 = await page.evaluate(() => ({ seg: document.querySelectorAll('.tn-seg, .tn-seg__btn').length, pull: Tuner.SECTIONS.flatMap((x) => x.items).some((c) => c.key === 'peekPull' || c.key === 'peekStyle') }));
    check('panel: 掀开时信息聚拢 is a switch, on by default; no A / B / 关 control or 吸力 slider left', !!g0 && g0.on === 'true' && leftovers0.seg === 0 && !leftovers0.pull, JSON.stringify({ g0, leftovers0 }));
    await sleep(100);
    await t('touchStart', g0.x, g0.y); await sleep(30); await t('touchEnd'); await sleep(100);
    const off = await page.evaluate(() => ({ all: peels.every((p) => p.params.peekGather === false), saved: JSON.parse(localStorage.getItem(Tuner.STORE_KEY)).peekGather, aria: document.querySelector('.tn-switch[aria-label="掀开时信息聚拢"]').getAttribute('aria-checked') }));
    check('panel: tapping 掀开时信息聚拢 turns it off for every stack and is saved', off.all && off.saved === false && off.aria === 'false', JSON.stringify(off));
    await page.evaluate(() => document.querySelector('.tn-switch[aria-label="掀开时信息聚拢"]').click());
    check('panel: tapping again turns it back on', await page.evaluate(() => peels.every((p) => p.params.peekGather === true)));
    await page.evaluate(() => document.querySelector('.tn-switch[aria-label="数字逐位升起"]').click());
    check('panel: 数字逐位升起 switch toggles peekRoll', await page.evaluate(() => peels.every((p) => p.params.peekRoll === false)));
    await page.evaluate(() => { localStorage.setItem(Tuner.STORE_KEY, JSON.stringify({ peekGather: 'zzz', peekScale: 9, hintOnLoad: false })); });
    await page.reload(); await sleep(700);
    const sane = await page.evaluate(() => [peel.params.peekGather, peel.params.peekScale]);
    check('panel: bad saved peek values are sanitised', sane[0] === true && sane[1] === 2.2, sane.join());
    // 旧版存下来的「信息怎么动」：B 磁铁 → 聚拢开（B 已删掉），关 → 聚拢关；旧的「吸力」丢掉
    const legacy = [];
    for (const [old, want] of [['b', true], ['a', true], ['off', false], ['关', false]]) {
      await page.evaluate((old) => localStorage.setItem(Tuner.STORE_KEY, JSON.stringify({ peekStyle: old, peekPull: 1.6, hintOnLoad: false })), old);
      await page.reload(); await sleep(700);
      const got = await page.evaluate(() => ({ g: peels.map((p) => p.params.peekGather), stray: peels.some((p) => 'peekStyle' in p.params || 'peekPull' in p.params) }));
      legacy.push({ old, want, ...got, ok: got.g.every((v) => v === want) && !got.stray });
    }
    check('panel: old saved peekStyle loads as 聚拢 on (a, b) / off (off, 关), stray peekPull dropped', legacy.every((x) => x.ok), JSON.stringify(legacy));
    await page.evaluate(() => localStorage.setItem(Tuner.STORE_KEY, JSON.stringify({ hintOnLoad: false })));
  }
  check('no console/page errors', errs.length === 0, errs.join(' | '));
  await ctx.close();

  // ================= 系统「减弱动态效果」：信息不动 =================
  {
    const s = await setup(browser, { reducedMotion: 'reduce' });
    const cs = CASES['weather-medium'];
    const B = await prepare(s.page, cs);
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
