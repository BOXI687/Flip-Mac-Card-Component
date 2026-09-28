/*
 * 手势的「松手」测试（CLAUDE.md 里要求：改到回弹 / 弹簧就要跑）
 *
 * 掀角：中号 + 一个小号 × 四个角 × 默认参数 / 最 Q 弹（returnDamping 0.35）×
 *       慢慢拖松手、快甩、停住再松手、弹回途中再抓住。
 *       每次都检查：松手以后掀起的面积，永远不超过松手那一刻的面积（防「整张卡闪出去」）。
 * 上下滑：中号 + 一个小号 × 往上 / 往下 × 默认 / 很弹（swipeDamping 0.4）×
 *       慢拖不到一半（弹回原来那张）、慢拖过一半（换一张）、轻轻快甩（换一张）、
 *       停住再松手（按位置决定）、滑动途中再抓住（接着拖，不跳）、拉过头（最多换一张）。
 *
 *   npm run build
 *   (cd dist && python3 -m http.server 8780) &
 *   PORT=8780 node tests/verify-gestures.js
 */
const { execSync } = require('child_process');
const { chromium } = require(`${execSync('npm root -g').toString().trim()}/playwright`);
const PORT = process.env.PORT || 8780;
const URL = `http://localhost:${PORT}/index.html`;
const results = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  (' + extra + ')' : ''}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.addInitScript(() => localStorage.setItem('peel-tuner-v1', JSON.stringify({ hintOnLoad: false })));
  await page.goto(URL);
  await sleep(600);
  const cdp = await ctx.newCDPSession(page);
  const t = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  const moveTo = async (a, b, steps, delay) => {
    for (let i = 1; i <= steps; i++) { await t('touchMove', a.x + (b.x - a.x) * i / steps, a.y + (b.y - a.y) * i / steps); await sleep(delay); }
  };

  // 页面里的记录器：松手那一刻（在引擎处理之前）记下掀起面积，之后每一帧记最大值；
  // 上下滑则记每一帧的位置，看有没有跳、最后停在哪
  await page.evaluate(() => {
    const frac = (p) => {
      if (!p.C) return 0;
      const f = Geometry.fold(p.C, p.displayP());
      return f ? p.liftedFraction(f) : 0;
    };
    window.__rec = null;
    window.__watch = (i) => {
      const p = peels[i];
      const rec = { rel: null, max: 0, ended: false, pos: [], swEnd: null };
      window.__rec = rec;
      const tick = () => {
        if (rec.rel != null && p.state === 'returning') rec.max = Math.max(rec.max, frac(p));
        if (p.swiper.state !== 'idle' || rec.pos.length === 0) rec.pos.push(p.swiper.pos);
        if (rec.rel != null && p.state === 'idle' && p.swiper.state === 'idle') rec.ended = true;
        if (!rec.stop) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      rec.onUp = () => { if (p.state === 'dragging') { rec.rel = frac(p); rec.max = 0; } };
      rec.onDown = () => { if (p.state === 'returning') { rec.rel = null; rec.regrabbed = true; } };
    };
    addEventListener('pointerup', () => window.__rec && window.__rec.onUp(), true);
    addEventListener('pointerdown', () => window.__rec && window.__rec.onDown(), true);
  });
  const stop = () => page.evaluate(() => { const r = window.__rec; r.stop = true; return { rel: r.rel, max: r.max, ended: r.ended, regrabbed: !!r.regrabbed, pos: r.pos }; });
  const waitIdle = (i) => page.waitForFunction((i) => peels[i].state === 'idle' && peels[i].swiper.state === 'idle', i, { timeout: 6000 }).then(() => true, () => false);

  const stacks = [[0, 'stack'], [1, 'stackSmallA']];
  const boxOf = (id) => page.evaluate((id) => { const r = document.getElementById(id).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, id);

  // ================= 掀角松手 =================
  for (const [i, id] of stacks) {
    const B = await boxOf(id);
    for (const damping of [0.82, 0.35]) {
      await page.evaluate((d) => peels.forEach((p) => p.setParams({ returnDamping: d })), damping);
      for (const c of ['tl', 'tr', 'br', 'bl']) {
        const from = { tl: { x: B.l + 6, y: B.t + 6 }, tr: { x: B.r - 6, y: B.t + 6 }, br: { x: B.r - 6, y: B.b - 6 }, bl: { x: B.l + 6, y: B.b - 6 } }[c];
        const to = { x: B.l + B.w * 0.5, y: B.t + B.h * 0.45 };
        for (const kind of ['slow', 'flick', 'pause', 'regrab']) {
          await page.evaluate((i) => window.__watch(i), i);
          await t('touchStart', from.x, from.y);
          if (kind === 'flick') await moveTo(from, to, 4, 8);
          else await moveTo(from, to, 20, 25);
          if (kind === 'pause') await sleep(400);
          await t('touchEnd');
          if (kind === 'regrab') {
            await sleep(70);
            const tip = await page.evaluate((i) => { const p = peels[i]; const d = p.displayP(); const r = p.el.getBoundingClientRect(); return { x: r.left + d.x, y: r.top + d.y, s: p.state }; }, i);
            await t('touchStart', tip.x, tip.y);
            await moveTo(tip, { x: tip.x + (to.x - from.x) * 0.15, y: tip.y + (to.y - from.y) * 0.15 }, 4, 16);
            await t('touchEnd');
          }
          const idle = await waitIdle(i);
          await sleep(60);
          const r = await stop();
          const ok = idle && r.rel != null && r.rel > (kind === 'regrab' ? 0 : 0.02) && r.max <= r.rel + 0.002 && (kind !== 'regrab' || r.regrabbed);
          check(`peel ${id} ${c} ${kind} damping ${damping}: lifted after release <= at release`, ok, `at release ${(r.rel * 100).toFixed(1)}%, max after ${(r.max * 100).toFixed(1)}%${kind === 'regrab' ? `, regrabbed ${r.regrabbed}` : ''}`);
        }
      }
    }
    await page.evaluate(() => peels.forEach((p) => p.setParams({ returnDamping: PeelStack.DEFAULTS.returnDamping })));
  }

  // ================= 上下滑松手 =================
  for (const [i, id] of stacks) {
    const B = await boxOf(id);
    const n = await page.evaluate((i) => peels[i].cards.length, i);
    const pitch = await page.evaluate((i) => peels[i].swiper.pitch, i);
    const c = { x: B.l + B.w / 2, y: B.t + B.h / 2 };
    for (const damping of [0.86, 0.4]) {
      await page.evaluate((d) => peels.forEach((p) => p.setParams({ swipeDamping: d })), damping);
      for (const dir of [-1, 1]) {
        const word = dir < 0 ? 'up' : 'down';
        const cases = [
          // [名字, 拖多少张, 步数, 每步间隔, 松手前停多久, 期望换几张]
          ['slow 30%', 0.3, 20, 30, 0, 0],
          ['slow 70%', 0.7, 20, 30, 0, 1],
          ['flick 15%', 0.15, 3, 8, 0, 1],
          ['pause at 30%', 0.3, 12, 16, 350, 0],
          ['pause at 70%', 0.7, 12, 16, 350, 1],
          ['overdrag 2.5 cards', 2.5, 30, 16, 0, 1],
        ];
        for (const [name, amount, steps, delay, pause, change] of cases) {
          const start = await page.evaluate((i) => peels[i].index, i);
          await page.evaluate((i) => window.__watch(i), i);
          await t('touchStart', c.x, c.y);
          await moveTo(c, { x: c.x, y: c.y + dir * amount * pitch }, steps, delay);
          const during = await page.evaluate((i) => peels[i].swiper.pos, i);
          if (pause) await sleep(pause);
          await t('touchEnd');
          const idle = await waitIdle(i);
          await sleep(40);
          const r = await stop();
          const end = await page.evaluate((i) => { const p = peels[i]; return { index: p.index, transforms: p.cards.map((k) => k.style.transform).join(''), clip: p.el.style.clipPath }; }, i);
          const want = (((start - dir * change) % n) + n) % n;
          const jumps = r.pos.slice(1).map((v, k) => Math.abs(v - r.pos[k]) * pitch);
          const maxJump = Math.max(0, ...jumps);
          const excursion = Math.max(...r.pos.map((v) => Math.abs(v - start)));
          const overOk = name.startsWith('overdrag') ? Math.abs(during - start) < 1.45 : true;
          check(`swipe ${id} ${word} ${name} damping ${damping}`, idle && end.index === want && end.transforms === '' && end.clip === '' && maxJump < 45 && excursion < 1.6 && overOk,
            `index ${start} -> ${end.index} (want ${want}), max frame step ${maxJump.toFixed(1)}px, furthest ${excursion.toFixed(2)} cards, pos at release ${(during - start).toFixed(2)}`);
        }
        // 滑动途中再抓住：先快甩一下，70ms 后按住 —— 应当马上跟手、位置不跳；再往回拖过一半松手，回到原来那张
        {
          const start = await page.evaluate((i) => peels[i].index, i);
          await t('touchStart', c.x, c.y);
          await moveTo(c, { x: c.x, y: c.y + dir * 0.35 * pitch }, 4, 8);
          await t('touchEnd');
          await sleep(70);
          const before = await page.evaluate((i) => ({ pos: peels[i].swiper.pos, s: peels[i].swiper.state }), i);
          await page.evaluate((i) => window.__watch(i), i);
          await t('touchStart', c.x, c.y);
          const atGrab = await page.evaluate((i) => ({ pos: peels[i].swiper.pos, s: peels[i].swiper.state }), i);
          await moveTo(c, { x: c.x, y: c.y - dir * 0.9 * pitch }, 14, 20);
          await t('touchEnd');
          const idle = await waitIdle(i);
          const r = await stop();
          const end = await page.evaluate((i) => peels[i].index, i);
          const jump = Math.abs(atGrab.pos - before.pos) * pitch; // 两次读之间弹簧还在走，允许一点点
          const jumps = r.pos.slice(1).map((v, k) => Math.abs(v - r.pos[k]) * pitch);
          check(`swipe ${id} ${word} re-grab mid-snap damping ${damping}`, before.s === 'settling' && atGrab.s === 'dragging' && jump < 25 && Math.max(0, ...jumps) < 45 && idle && end === start,
            `state ${before.s} -> ${atGrab.s}, moved ${jump.toFixed(1)}px between reads, back to ${end} (want ${start})`);
        }
      }
    }
    await page.evaluate(() => peels.forEach((p) => p.setParams({ swipeDamping: PeelStack.DEFAULTS.swipeDamping })));
  }

  check('no console/page errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  console.log(results.join('\n'));
  console.log(`\n${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed`);
})();
