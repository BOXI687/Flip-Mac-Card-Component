const { execSync } = require('child_process');
const { chromium } = require(`${execSync('npm root -g').toString().trim()}/playwright`);
const OUT = (process.env.OUT || require('path').join(require('os').tmpdir(), 'peel-shots')) + '/';
require('fs').mkdirSync(OUT, { recursive: true });
const PORT = process.env.PORT || 8780;
const URL = `http://localhost:${PORT}/index.html`;
const results = [];
const check = (name, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  (' + extra + ')' : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setup(browser, initScript, extra = {}) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }, extra));
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://localhost:${PORT}` });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  page.on('pageerror', (e) => errs.push(String(e)));
  if (initScript) await page.addInitScript(initScript);
  const cdp = await ctx.newCDPSession(page);
  const t = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  const drag = async (a, b, steps = 12, delay = 16, release = true) => {
    await t('touchStart', a.x, a.y);
    for (let i = 1; i <= steps; i++) { await t('touchMove', a.x + (b.x - a.x) * i / steps, a.y + (b.y - a.y) * i / steps); await sleep(delay); }
    if (release) await t('touchEnd');
  };
  const tap = async (x, y) => { await t('touchStart', x, y); await sleep(30); await t('touchEnd'); };
  return { ctx, page, errs, t, drag, tap };
}

(async () => {
  const browser = await chromium.launch();
  const { ctx, page, errs, t, drag, tap } = await setup(browser);
  await page.goto(URL);

  // ---- 首次提示 ----
  await sleep(1150);
  const peekState = await page.evaluate(() => [peel.state, getComputedStyle(peel.flapWrap).display]);
  check('hint peek runs on load', peekState[0] === 'returning' && peekState[1] === 'block', peekState.join(','));
  await sleep(1500);
  check('hint peek settles to idle', (await page.evaluate(() => peel.state)) === 'idle');
  await page.screenshot({ path: OUT + '01-home.png' });

  const R = await page.evaluate(() => { const r = document.getElementById('stack').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

  // ---- 打开面板 ----
  const btn = await page.evaluate(() => { const r = document.getElementById('tunerOpen').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await tap(btn.x, btn.y);
  await sleep(700);
  const sheet = await page.evaluate(() => { const s = document.querySelector('.tn-sheet'); const r = s.getBoundingClientRect(); return { open: s.classList.contains('is-open'), top: r.top, bottom: r.bottom, w: r.width }; });
  check('panel opens', sheet.open);
  check('panel does not cover widget', sheet.top > R.b + 10, `sheet top ${sheet.top.toFixed(0)} > stack bottom ${R.b.toFixed(0)}`);
  check('no horizontal overflow (panel open)', (await overflow()) === 0);
  await page.screenshot({ path: OUT + '02-panel-open.png' });

  // ---- 滚动面板 ----
  const bodyBox = await page.evaluate(() => { const r = document.querySelector('.tn-body').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await drag({ x: 60, y: bodyBox.y + bodyBox.h - 40 }, { x: 60, y: bodyBox.y + 40 }, 10, 16);
  await sleep(600);
  const st1 = await page.evaluate(() => document.querySelector('.tn-body').scrollTop);
  check('sheet scrolls with vertical swipe', st1 > 100, `scrollTop ${st1}`);
  await page.evaluate(() => (document.querySelector('.tn-body').scrollTop = 0));

  // ---- 每个滑块 ----
  const keys = await page.evaluate(() => Tuner.SECTIONS.flatMap((s) => s.items).filter((c) => !c.type).map((c) => c.key));
  const probe = {
    returnDamping: () => peel.params.returnDamping,
    returnResponse: () => peel.params.returnResponse,
    maxLift: () => peel.params.maxLift,
    cornerHit: () => peel.params.cornerHit,
    paperOpacity: () => getComputedStyle(document.querySelector('.peel-flap__paper')).backgroundColor,
    flapBlur: () => getComputedStyle(document.querySelector('.peel-flap__front')).filter,
    highlight: () => peel.params.highlight,
    // 版本 A：投影改成独立的 .peel-shadow 图层，强度每帧由 JS 按参数设置
    flapShadow: () => peel.params.flapShadow,
    pressLift: () => peel.params.pressLift,
    underShade: () => peel.params.underShade,
  };
  for (const key of keys) {
    const info = await page.evaluate((key) => {
      const views = [...document.querySelectorAll('.tn-slider')];
      const el = views.find((v) => v.getAttribute('aria-label') === Tuner.SECTIONS.flatMap((s) => s.items).find((c) => c.key === key).label);
      el.scrollIntoView({ block: 'center' });
      const tr = el.querySelector('.tn-slider__track').getBoundingClientRect();
      const th = el.querySelector('.tn-slider__thumb').getBoundingClientRect();
      return { tl: tr.left, tw: tr.width, y: tr.top + 2, thx: th.left + th.width / 2, label: el.getAttribute('aria-label') };
    }, key);
    await sleep(100);
    const before = await page.evaluate(`(${probe[key]})()`);
    const pBefore = await page.evaluate((k) => peel.params[k], key);
    // 按住圆点往右拖 = 应该变化
    const target = info.thx > info.tl + info.tw / 2 ? info.tl + info.tw * 0.1 : info.tl + info.tw * 0.9;
    await drag({ x: info.thx, y: info.y }, { x: target, y: info.y }, 8, 16);
    await sleep(80);
    const after = await page.evaluate(`(${probe[key]})()`);
    const pAfter = await page.evaluate((k) => peel.params[k], key);
    const readout = await page.evaluate((label) => [...document.querySelectorAll('.tn-row')].find((r) => r.querySelector('.tn-label').textContent === label).querySelector('.tn-value').textContent, info.label);
    check(`slider ${info.label} (${key}) changes behaviour`, before !== after && pBefore !== pAfter, `${pBefore} -> ${pAfter}; ${String(before).slice(0, 40)} -> ${String(after).slice(0, 40)}; 读数 ${readout}`);
  }
  // 轻点轨道跳值
  const tapInfo = await page.evaluate(() => { const el = document.querySelector('.tn-slider'); el.scrollIntoView({ block: 'center' }); const r = el.querySelector('.tn-slider__track').getBoundingClientRect(); return { x: r.left + r.width * 0.5, y: r.top + 2 }; });
  await sleep(80);
  await tap(tapInfo.x, tapInfo.y);
  const dampAfterTap = await page.evaluate(() => peel.params.returnDamping);
  check('tap on slider track jumps to position', Math.abs(dampAfterTap - 0.68) < 0.02, `damping ${dampAfterTap}`);

  // 颜色
  await page.evaluate(() => document.querySelector('.tn-swatch[aria-label="黑"]').scrollIntoView({ block: 'center' }));
  const sw = await page.evaluate(() => { const r = document.querySelector('.tn-swatch[aria-label="黑"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 15 }; });
  await tap(sw.x, sw.y);
  const paper = await page.evaluate(() => [peel.params.paperColor, getComputedStyle(document.querySelector('.peel-flap__paper')).backgroundColor]);
  check('paper colour swatch applies', paper[0] === '#1c1c1e' && paper[1].startsWith('rgba(28, 28, 30'), paper.join(' / '));
  await page.screenshot({ path: OUT + '03-panel-appearance.png' });

  // 开关
  await page.evaluate(() => document.querySelector('.tn-switch').scrollIntoView({ block: 'center' }));
  const sws = await page.evaluate(() => [...document.querySelectorAll('.tn-switch')].map((s) => { const r = s.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }));
  await tap(sws[0].x, sws[0].y);
  check('hint-on-load switch toggles', (await page.evaluate(() => peel.params.hintOnLoad)) === false);
  await tap(sws[1].x, sws[1].y);
  check('geometry overlay switch toggles', await page.evaluate(() => peel.debug && document.getElementById('stack').classList.contains('show-debug')));
  await page.screenshot({ path: OUT + '04-panel-other.png' });

  // ---- 面板开着拖卡片 ----
  await page.evaluate(() => peel.setParams({ paperColor: '#f7f7fa' }));
  const br = { x: R.r - 6, y: R.b - 6 };
  await drag(br, { x: R.l + R.w * 0.55, y: R.t + R.h * 0.35 }, 14, 16, false);
  await sleep(50);
  const mid = await page.evaluate(() => ({ state: peel.state, flap: getComputedStyle(peel.flapWrap).display, clip: peel.top.style.clipPath.slice(0, 20), frac: peel.liftedFraction(Geometry.fold(peel.C, peel.P)) }));
  check('drag corner with panel open still peels', mid.state === 'dragging' && mid.flap === 'block' && mid.clip.startsWith('polygon'), JSON.stringify(mid));
  check('panel stays open while dragging card', await page.evaluate(() => document.querySelector('.tn-sheet').classList.contains('is-open')));
  await page.screenshot({ path: OUT + '05-mid-peel-panel-open-debug.png' });
  await t('touchEnd');
  await sleep(1200);

  // ---- 最多能掀多大 + 长距离拖动/快速甩动都不换卡 ----
  await page.evaluate(() => { peel.setParams({ maxLift: 0.65 }); peel.setDebug(false); });
  const topBefore = await page.evaluate(() => peel.top.className);
  await drag(br, { x: R.l - 150, y: R.t - 120 }, 20, 16, false);
  const far = await page.evaluate(() => peel.liftedFraction(Geometry.fold(peel.C, peel.P)));
  check('max-lift limit holds on very long drag', far <= 0.651 && far > 0.55, `lifted ${(far * 100).toFixed(1)}%`);
  await page.screenshot({ path: OUT + '06-max-lift.png' });
  await t('touchEnd');
  await sleep(40);
  check('release after long drag springs back (returning)', (await page.evaluate(() => peel.state)) === 'returning');
  await sleep(1500);
  const afterLong = await page.evaluate(() => [peel.state, peel.top.className, peel.top.style.clipPath]);
  check('long drag does NOT change top card', afterLong[0] === 'idle' && afterLong[1] === topBefore && afterLong[2] === '', afterLong.join(' | '));
  // 快速甩
  await drag(br, { x: R.l + 20, y: R.t + 10 }, 4, 8);
  await sleep(30);
  const flickV = await page.evaluate(() => [peel.state, Math.hypot(peel.v.x, peel.v.y)]);
  check('fast flick: release velocity carried into spring', flickV[0] === 'returning' && flickV[1] > 300, `speed ${flickV[1].toFixed(0)}`);
  await sleep(1500);
  check('fast flick does NOT change top card', (await page.evaluate(() => [peel.state, peel.top.className].join())) === `idle,${topBefore}`);
  check('dots stay static', await page.evaluate(() => document.querySelector('#dots span').classList.contains('is-active')));

  // ---- 弹回途中再次抓住 ----
  await page.evaluate(() => document.addEventListener('pointerdown', () => { if (peel.C) { const d = peel.displayP(); window.__downP = { x: d.x, y: d.y, s: peel.state }; } }, true));
  await drag(br, { x: R.l + R.w * 0.5, y: R.t + R.h * 0.5 }, 10, 16);
  await sleep(60);
  const P0 = await page.evaluate(() => ({ x: peel.P.x, y: peel.P.y, s: peel.state }));
  await t('touchStart', R.l + P0.x, R.t + P0.y);
  await t('touchMove', R.l + P0.x - 5, R.t + P0.y - 5);
  await sleep(40);
  const grab = await page.evaluate(() => ({ s: peel.state, x: peel.P.x, y: peel.P.y }));
  // 按下那一刻画面上的位置（避开 CDP 往返期间弹簧还在动造成的误差）
  const P = await page.evaluate(() => window.__downP);
  check('interrupt-grab during return works', P.s === 'returning' && grab.s === 'dragging' && Math.hypot(grab.x - P.x + 5, grab.y - P.y + 5) < 4, JSON.stringify({ P, grab }));
  await t('touchEnd');
  await sleep(1500);

  // ---- 回弹参数真的影响动画 ----
  const settle = async (params) => page.evaluate(async (params) => {
    peel.setParams(params);
    peel.beginPeel(Geometry.corners(peel.W, peel.H)[2]);
    peel.P = { x: peel.W * 0.5, y: peel.H * 0.3 };
    peel.v = { x: 0, y: 0 };
    const t0 = performance.now();
    let overshoot = 0;
    peel.returnHome();
    await new Promise((res) => { const f = () => { if (peel.P) overshoot = Math.max(overshoot, peel.P.x - peel.W); if (peel.state === 'idle') res(); else requestAnimationFrame(f); }; f(); });
    return { ms: performance.now() - t0, overshoot };
  }, params);
  const fast = await settle({ returnResponse: 0.15, returnDamping: 1 });
  const slow = await settle({ returnResponse: 0.8, returnDamping: 1 });
  const bouncy = await settle({ returnResponse: 0.38, returnDamping: 0.35 });
  const stiff = await settle({ returnResponse: 0.38, returnDamping: 1 });
  check('回弹速度 changes settle time', slow.ms > fast.ms * 2, `fast ${fast.ms.toFixed(0)}ms, slow ${slow.ms.toFixed(0)}ms`);
  check('回弹弹性 changes overshoot', bouncy.overshoot > 5 && stiff.overshoot < 1, `bouncy ${bouncy.overshoot.toFixed(1)}px, stiff ${stiff.overshoot.toFixed(1)}px`);
  // 角落感应范围
  const hit = await page.evaluate(() => { const p = { x: peel.W - peel.H * 0.6, y: peel.H }; peel.setParams({ cornerHit: 0.45 }); const a = !!peel.hitCorner(p); peel.setParams({ cornerHit: 0.8 }); const b = !!peel.hitCorner(p); return [a, b]; });
  check('角落感应范围 changes hit zone', hit[0] === false && hit[1] === true);

  // ---- 恢复默认 / 试一下 / 复制 ----
  const footBtns = await page.evaluate(() => [...document.querySelectorAll('.tn-foot .tn-btn')].map((b) => { const r = b.getBoundingClientRect(); return { text: b.textContent, x: r.x + r.width / 2, y: r.y + r.height / 2 }; }));
  const fb = Object.fromEntries(footBtns.map((b) => [b.text, b]));
  await tap(fb['恢复默认'].x, fb['恢复默认'].y);
  const isDef = await page.evaluate(() => JSON.stringify(peel.params) === JSON.stringify(PeelStack.DEFAULTS));
  check('恢复默认 restores defaults', isDef);
  await sleep(1800);
  await tap(fb['试一下'].x, fb['试一下'].y);
  await sleep(100);
  check('试一下 peeks a corner', (await page.evaluate(() => peel.state)) === 'returning');
  await sleep(1500);
  await tap(fb['复制参数'].x, fb['复制参数'].y);
  await sleep(300);
  const toast = await page.evaluate(() => { const e = document.querySelector('.tn-toast'); return [e.textContent, e.classList.contains('is-visible')]; });
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  let parsed = null; try { parsed = JSON.parse(clip); } catch (e) {}
  check('复制参数 copies JSON + shows toast', toast[0] === '已复制' && toast[1] && parsed && parsed.returnDamping === 0.82 && Object.keys(parsed).length === 12 && !('debug' in parsed), clip);
  await page.screenshot({ path: OUT + '07-copied-toast.png' });

  // 剪贴板失败 → 手动复制框
  await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('no')); document.execCommand = () => false; });
  await tap(fb['复制参数'].x, fb['复制参数'].y);
  await sleep(300);
  const manual = await page.evaluate(() => { const m = document.querySelector('.tn-manual'); return [getComputedStyle(m).display, m.querySelector('textarea').value.length]; });
  check('clipboard failure shows selectable text', manual[0] === 'flex' && manual[1] > 50, manual.join(','));
  await page.screenshot({ path: OUT + '08-manual-copy.png' });
  const ok = await page.evaluate(() => { const r = document.querySelector('.tn-manual .tn-btn').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await tap(ok.x, ok.y);

  // ---- 点卡片不关，点空白处关 ----
  await tap(R.l + R.w / 2, R.t + R.h / 2);
  await sleep(100);
  check('tap on card keeps panel open', await page.evaluate(() => document.querySelector('.tn-sheet').classList.contains('is-open')));
  await tap(20, 40);
  await sleep(600);
  check('tap outside closes panel', !(await page.evaluate(() => document.querySelector('.tn-sheet').classList.contains('is-open'))));
  // 完成按钮
  await tap(btn.x, btn.y); await sleep(600);
  const done = await page.evaluate(() => { const r = document.querySelector('.tn-close').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await tap(done.x, done.y); await sleep(600);
  check('完成 button closes panel', !(await page.evaluate(() => document.querySelector('.tn-sheet').classList.contains('is-open'))));
  const targets = await page.evaluate(() => { document.getElementById('tunerOpen').click(); return [...document.querySelectorAll('.tn-close, .tn-foot .tn-btn, .tn-slider, #tunerOpen')].map((e) => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); }); });
  check('tap targets >= 44px', Math.min(...targets) >= 44, `min ${Math.min(...targets)}`);
  await page.evaluate(() => document.querySelector('.tn-close').click()); await sleep(400);

  // ---- 调试层 + 截图 ----
  await page.evaluate(() => peel.setDebug(true));
  await drag(br, { x: R.l + R.w * 0.6, y: R.t + R.h * 0.4 }, 12, 16, false);
  await page.screenshot({ path: OUT + '09-debug-overlay.png' });
  check('debug overlay draws', (await page.evaluate(() => peel.debugSvg.innerHTML.includes('掀起'))));
  await t('touchEnd'); await sleep(1400);
  await page.evaluate(() => peel.setDebug(false));
  await drag(br, { x: R.l + R.w * 0.55, y: R.t + R.h * 0.3 }, 12, 16, false);
  await page.screenshot({ path: OUT + '10-mid-peel.png' });
  await t('touchEnd'); await sleep(1400);
  check('no horizontal overflow (end)', (await overflow()) === 0);

  // ---- 保存 & 重新打开 ----
  await page.evaluate(() => { peel.setParams({ maxLift: 0.4, hintOnLoad: false }); localStorage.setItem(Tuner.STORE_KEY, JSON.stringify(peel.params)); });
  await page.reload(); await sleep(1300);
  const saved = await page.evaluate(() => [peel.params.maxLift, peel.params.hintOnLoad, peel.state]);
  check('values persist after reload (and hint off respected)', saved[0] === 0.4 && saved[1] === false && saved[2] === 'idle', saved.join(','));
  await page.evaluate(() => localStorage.setItem(Tuner.STORE_KEY, '{"maxLift":99,"cornerHit":"x","bogus":1,"paperColor":"red"}'));
  await page.reload(); await sleep(300);
  const sane = await page.evaluate(() => [peel.params.maxLift, peel.params.cornerHit, 'bogus' in peel.params, peel.params.paperColor]);
  check('bad saved values are sanitised', sane[0] === 0.95 && sane[1] === 0.45 && !sane[2] && sane[3] === '#f7f7fa', sane.join(','));
  await page.evaluate(() => localStorage.clear());
  check('no console/page errors (main run)', errs.length === 0, errs.join(' | '));
  await ctx.close();

  // ---- 存储抛错 ----
  const s2 = await setup(browser, () => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('SecurityError: storage disabled'); } });
  });
  await s2.page.goto(URL);
  await sleep(1200);
  const ok2 = await s2.page.evaluate(() => [peel.state, !!document.querySelector('.tn-sheet')]);
  const b2 = await s2.page.evaluate(() => { const r = document.getElementById('tunerOpen').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await s2.tap(b2.x, b2.y); await sleep(600);
  const sl = await s2.page.evaluate(() => { const r = document.querySelector('.tn-slider__track').getBoundingClientRect(); return { x: r.left + r.width * 0.9, y: r.top + 2 }; });
  await s2.tap(sl.x, sl.y);
  const changed = await s2.page.evaluate(() => peel.params.returnDamping);
  check('localStorage throwing: page + panel still work', ok2[0] === 'returning' && ok2[1] && changed < 0.5 && s2.errs.length === 0, `damping ${changed}; errs ${s2.errs.join('|')}`);
  await s2.ctx.close();

  await browser.close();
  console.log(results.join('\n'));
  console.log(`\n${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed`);
})();
