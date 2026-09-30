/*
 * 手机（iPhone 393×852，触摸）上的检查。测的是打包好的网站（dist/），不是源代码：
 *   npm run build
 *   (cd dist && python3 -m http.server 8780) &      # 端口被占用就换一个，再用 PORT=… 告诉脚本
 *   PORT=8780 node tests/verify-phone.js
 */
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
  // 长按：按住不动 ms 毫秒再松手（调参面板的隐藏入口是长按壁纸空白处 0.9 秒）
  const longPress = async (p, ms = 1150) => { await t('touchStart', p.x, p.y); await sleep(ms); await t('touchEnd'); };
  return { ctx, page, errs, t, drag, tap, longPress };
}

// 壁纸上的一块空白：App 图标那一排和「搜索」之间的正中间（这里什么都没有，和真 iPhone 一样）
const wallSpot = (page) => page.evaluate(() => {
  const a = document.querySelector('.apps').getBoundingClientRect();
  const s = document.querySelector('.search-pill').getBoundingClientRect();
  return { x: innerWidth / 2, y: (a.bottom + s.top) / 2 };
});
const sheetOpen = (page) => page.evaluate(() => document.querySelector('.tn-sheet').classList.contains('is-open'));

(async () => {
  const browser = await chromium.launch();
  // 首次提示默认是关的（Boxi 调好的默认值）：主流程第一次打开时把它打开，才能测它
  const { ctx, page, errs, t, drag, tap, longPress } = await setup(browser, () => { if (!localStorage.getItem('peel-tuner-v1')) localStorage.setItem('peel-tuner-v1', JSON.stringify({ hintOnLoad: true })); });
  await page.goto(URL);

  // ---- 首次提示 ----
  // 首次提示在组件装好后 900ms 掀一下。等它真的开始（以前固定等 1150ms：
  // 页面 JS 执行得晚一点，就会在提示开始之前检查，误报）
  await page.waitForFunction(() => window.peel && peel.state === 'returning', null, { timeout: 5000 }).catch(() => {});
  const peekState = await page.evaluate(() => [peel.state, getComputedStyle(peel.flapWrap).display]);
  check('hint peek runs on load', peekState[0] === 'returning' && peekState[1] === 'block', peekState.join(','));
  await sleep(1500);
  check('hint peek settles to idle', (await page.evaluate(() => peel.state)) === 'idle');
  await page.screenshot({ path: OUT + '01-home.png' });

  const R = await page.evaluate(() => { const r = document.getElementById('stack').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

  // ---- 主屏幕：看起来像真的 iPhone，没有原型的痕迹 ----
  const home = await page.evaluate(() => {
    const r = (e) => e.getBoundingClientRect();
    const apps = [...document.querySelectorAll('.apps .app')];
    const dock = [...document.querySelectorAll('.dock .app')];
    const pill = r(document.querySelector('.search-pill'));
    const dk = r(document.querySelector('.dock'));
    const small = r(document.getElementById('stackSmallA'));
    const texts = [...document.querySelectorAll('.home p, .home button')].map((e) => e.textContent.trim());
    return {
      noProto: !document.querySelector('.hint, #tunerOpen, .tuner-open') && !texts.some((x) => /调参|拖动|滑动/.test(x)),
      apps: apps.length, dock: dock.length,
      appNames: apps.map((a) => a.querySelector('.app__name')?.textContent), dockNames: dock.filter((a) => a.querySelector('.app__name')).length,
      iconW: r(apps[0].querySelector('.app__icon')).width,
      // 程序坞里的图标和上面那排同一列
      colsMatch: apps.every((a, i) => Math.abs(r(a).left - r(dock[i]).left) < 0.5),
      appsTop: r(apps[0]).top, smallB: small.bottom,
      pill: [pill.top, pill.bottom, pill.width], dockBox: [dk.top, dk.bottom, dk.left, dk.right],
      fits: document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth,
      stacks: peels.map((p) => [Math.round(p.W), Math.round(p.H)]).join(' '),
      blur: getComputedStyle(document.querySelector('.dock')).backdropFilter,
    };
  });
  check('home screen: no hint text, no 调参 button', home.noProto);
  check('home screen: 4 app icons with names + 4 dock icons without names', home.apps === 4 && home.dock === 4 && home.appNames.every(Boolean) && home.dockNames === 0, home.appNames.join(','));
  check('home screen: icon ≈ 62pt (64 × u), dock icons share the grid columns', Math.abs(home.iconW - 64 * 338 / 349.67) < 0.5 && home.colsMatch, `icon ${home.iconW.toFixed(1)}`);
  check('home screen: order widgets → icons → 搜索 → dock, all on one 393×852 screen', home.appsTop > home.smallB + 30 && home.pill[0] > home.appsTop + 80 && home.pill[1] < home.dockBox[0] && home.dockBox[1] <= 852 - 15 && home.dockBox[1] >= 852 - 18 && home.fits, JSON.stringify(home));
  check('home screen: widget stacks unchanged (338×158, 158×158 ×2)', home.stacks === '338,158 158,158 158,158', home.stacks);
  check('home screen: dock is real glass (backdrop blur)', /blur/.test(home.blur), home.blur);
  await page.screenshot({ path: OUT + '01b-home-screen.png' });

  // ---- 隐藏入口：长按壁纸空白处 ----
  const spot = await wallSpot(page);
  await tap(spot.x, spot.y); await sleep(300);
  check('long-press: a short tap on the wallpaper does not open the panel', !(await sheetOpen(page)));
  await t('touchStart', spot.x, spot.y); await sleep(500);
  check('long-press: not open yet after 0.5 s', !(await sheetOpen(page)));
  await t('touchEnd'); await sleep(700);
  check('long-press: releasing at 0.5 s cancels', !(await sheetOpen(page)));
  // 按住以后手指挪开 > 10px：取消
  await t('touchStart', spot.x, spot.y); await sleep(200);
  for (let i = 1; i <= 4; i++) { await t('touchMove', spot.x + i * 4, spot.y); await sleep(16); }
  await sleep(1000); await t('touchEnd'); await sleep(300);
  check('long-press: moving the finger > 10px cancels', !(await sheetOpen(page)));
  // 挪一点点（< 10px）：照样算长按
  await t('touchStart', spot.x, spot.y); await sleep(200);
  await t('touchMove', spot.x + 4, spot.y + 3); await sleep(1000);
  const openedWhileHeld = await sheetOpen(page);
  await t('touchEnd'); await sleep(300);
  check('long-press: small wobble (< 10px) still opens, while the finger is still down', openedWhileHeld && (await sheetOpen(page)));
  await page.evaluate(() => document.querySelector('.tn-close').click()); await sleep(600);
  // 在小组件中间、App 图标、搜索、程序坞上长按：不打开，小组件也不换
  const notWall = await page.evaluate(() => {
    const c = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    return [c('#stack'), c('.apps .app__icon'), c('.search-pill'), c('.dock .app:nth-child(3)'), c('.widget__name')];
  });
  for (const p of notWall) { await longPress(p); await sleep(200); }
  check('long-press on a widget / icon / 搜索 / dock / widget name does not open the panel (and no swipe)', !(await sheetOpen(page)) && (await page.evaluate(() => peels.every((p) => p.index === 0 && p.state === 'idle'))));
  check('long-press: no text selection or callout (user-select / touch-callout none)', await page.evaluate(() => { const b = getComputedStyle(document.body); return (b.userSelect === 'none' || b.webkitUserSelect === 'none') && String(window.getSelection()) === ''; }));

  // ---- 打开面板（长按壁纸） ----
  await longPress(spot);
  await sleep(700);
  const sheet = await page.evaluate(() => { const s = document.querySelector('.tn-sheet'); const r = s.getBoundingClientRect(); return { open: s.classList.contains('is-open'), top: r.top, bottom: r.bottom, w: r.width }; });
  check('panel opens', sheet.open);
  check('panel does not cover widget', sheet.top > R.b + 10, `sheet top ${sheet.top.toFixed(0)} > stack bottom ${R.b.toFixed(0)}`);
  // 下面还有一排小号：面板要停在最下面那排的名字下面
  const lowest = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.stack, .widget__name')].map((e) => e.getBoundingClientRect().bottom)));
  check('panel stops below the lowest widget (small row + names)', sheet.top >= lowest + 8, `sheet top ${sheet.top.toFixed(0)} vs lowest ${lowest.toFixed(0)}`);
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
    swipeDamping: () => peel.params.swipeDamping,
    swipeResponse: () => peel.params.swipeResponse,
    peekResponse: () => peel.params.peekResponse,
    peekDamping: () => peel.params.peekDamping,
    peekStagger: () => peel.params.peekStagger,
    peekScale: () => peel.params.peekScale,
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
  // 面板改的参数对每一叠（中号 + 两个小号）都生效
  const sameAll = await page.evaluate((keys) => peels.every((p) => keys.every((k) => p.params[k] === peel.params[k])), keys);
  check('panel changes apply to every stack (medium + 2 small)', sameAll && (await page.evaluate(() => peels.length)) === 3);
  // 轻点轨道跳值
  const tapInfo = await page.evaluate(() => { const el = document.querySelector('.tn-slider'); el.scrollIntoView({ block: 'center' }); const r = el.querySelector('.tn-slider__track').getBoundingClientRect(); return { x: r.left + r.width * 0.5, y: r.top + 2 }; });
  await sleep(80);
  await tap(tapInfo.x, tapInfo.y);
  const dampAfterTap = await page.evaluate(() => peel.params.returnDamping);
  check('tap on slider track jumps to position', Math.abs(dampAfterTap - 0.68) < 0.02, `damping ${dampAfterTap}`);

  // 颜色：默认的纸色（暖白纸）下面有小点，一开始就是选中的
  const swDef = await page.evaluate(() => ({ def: [...document.querySelectorAll('.tn-swatch.is-default:not(.tn-swatch--wp)')].map((b) => b.getAttribute('aria-label')), sel: [...document.querySelectorAll('.tn-swatch.is-selected:not(.tn-swatch--wp)')].map((b) => b.getAttribute('aria-label')), color: PeelStack.DEFAULTS.paperColor }));
  check('paper colour: 暖白纸 #f4ecd8 is the default swatch and selected', swDef.def.join() === '暖白纸' && swDef.sel.join() === '暖白纸' && swDef.color === '#f4ecd8', JSON.stringify(swDef));
  await page.evaluate(() => document.querySelector('.tn-swatch[aria-label="黑"]').scrollIntoView({ block: 'center' }));
  const sw = await page.evaluate(() => { const r = document.querySelector('.tn-swatch[aria-label="黑"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 15 }; });
  await tap(sw.x, sw.y);
  const paper = await page.evaluate(() => [peel.params.paperColor, getComputedStyle(document.querySelector('.peel-flap__paper')).backgroundColor]);
  check('paper colour swatch applies', paper[0] === '#1c1c1e' && paper[1].startsWith('rgba(28, 28, 30'), paper.join(' / '));
  await page.screenshot({ path: OUT + '03-panel-appearance.png' });

  // 壁纸：默认橄榄（名字下有小点、选中）；点「夜幕」→ 页面、电池的假玻璃都换；存起来
  const wp0 = await page.evaluate(() => ({ def: [...document.querySelectorAll('.tn-swatch--wp.is-default')].map((b) => b.getAttribute('aria-label')).join(), sel: [...document.querySelectorAll('.tn-swatch--wp.is-selected')].map((b) => b.getAttribute('aria-label')).join(), html: document.documentElement.dataset.wallpaper, glass: getComputedStyle(document.querySelector('#stack .card--battery')).backgroundImage }));
  check('wallpaper: 橄榄 is the default and selected', wp0.def === '橄榄' && wp0.sel === '橄榄' && wp0.html === 'olive' && (await page.evaluate(() => PeelStack.DEFAULTS.wallpaper)) === 'olive', JSON.stringify(wp0).slice(0, 120));
  await page.evaluate(() => document.querySelector('.tn-swatch--wp[aria-label="夜幕"]').scrollIntoView({ block: 'center' }));
  const wsw = await page.evaluate(() => { const r = document.querySelector('.tn-swatch--wp[aria-label="夜幕"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 20 }; });
  await tap(wsw.x, wsw.y); await sleep(100);
  const wp1 = await page.evaluate(() => ({ p: peels.map((s) => s.params.wallpaper).join(), html: document.documentElement.dataset.wallpaper, bg: getComputedStyle(document.documentElement).backgroundColor, glass: getComputedStyle(document.querySelector('#stack .card--battery')).backgroundImage, saved: JSON.parse(localStorage.getItem(Tuner.STORE_KEY)).wallpaper }));
  check('wallpaper: 夜幕 applies to the page, every stack, the battery glass, and is saved', wp1.p === 'dusk,dusk,dusk' && wp1.html === 'dusk' && wp1.bg === 'rgb(12, 20, 34)' && wp1.glass !== wp0.glass && wp1.saved === 'dusk', JSON.stringify(wp1).slice(0, 160));
  await page.screenshot({ path: OUT + '03b-wallpaper-dusk.png' });

  // 开关
  // 开关按名字找（「掀开时」那一节也有一个开关，顺序不能当依据）
  const swAt = (label) => page.evaluate((label) => { const s = document.querySelector(`.tn-switch[aria-label="${label}"]`); s.scrollIntoView({ block: 'center' }); const r = s.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, label);
  const sws = [await swAt('打开时自动提示')];
  await tap(sws[0].x, sws[0].y);
  check('hint-on-load switch toggles', (await page.evaluate(() => peel.params.hintOnLoad)) === false);
  sws[1] = await swAt('几何辅助线');
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
  // 卡片平躺时的 clip-path 是整张连续圆角轮廓（以前是空字符串），和下面那张卡的一样
  const restClip = await page.evaluate(() => peel.cards[1].style.clipPath);
  check('long drag does NOT change top card', afterLong[0] === 'idle' && afterLong[1] === topBefore && afterLong[2] === restClip && restClip.startsWith('polygon'), afterLong.slice(0, 2).join(' | '));
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
  check('复制参数 copies JSON (21 keys, incl. wallpaper) + shows toast', toast[0] === '已复制' && toast[1] && parsed && parsed.returnDamping === 0.82 && Object.keys(parsed).length === 21 && parsed.wallpaper === 'olive' && !('debug' in parsed) && !('peekStyle' in parsed) && !('peekPull' in parsed) && parsed.peekGather === true, clip);
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
  // 完成按钮（先长按壁纸再打开）
  await longPress(spot); await sleep(600);
  const done = await page.evaluate(() => { const r = document.querySelector('.tn-close').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await tap(done.x, done.y); await sleep(600);
  check('完成 button closes panel', !(await page.evaluate(() => document.querySelector('.tn-sheet').classList.contains('is-open'))));
  const targets = await page.evaluate(() => { tuner.open(); return [...document.querySelectorAll('.tn-close, .tn-foot .tn-btn, .tn-slider')].map((e) => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); }); });
  // 44 减一点点：元素落在小数像素的位置上时，量出来可能是 43.9999（浮点误差，不是真的变小了）
  check('tap targets >= 44px', Math.min(...targets) >= 44 - 1e-3, `min ${Math.min(...targets)}`);
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

  // ---- 小号的两叠：每一叠的四个角都能掀，松手都盖回、不换卡，互不影响 ----
  const layout = await page.evaluate(() => {
    const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
    return { m: box(document.getElementById('stack')), a: box(document.getElementById('stackSmallA')), b: box(document.getElementById('stackSmallB')) };
  });
  const near = (a, b) => Math.abs(a - b) < 0.6;
  check('home grid: medium 338x158, smalls 158x158, gap 22, rows aligned (HIG 393pt)',
    near(layout.m.w, 338) && near(layout.m.h, 158) && near(layout.a.w, 158) && near(layout.a.h, 158) && near(layout.b.w, 158)
    && near(layout.b.l - layout.a.r, 22) && near(layout.a.l, layout.m.l) && near(layout.b.r, layout.m.r) && near(layout.a.t, layout.b.t) && layout.a.t > layout.m.b + 30,
    JSON.stringify(layout));
  for (const [i, id] of [[1, 'stackSmallA'], [2, 'stackSmallB']]) {
    const S = layout[i === 1 ? 'a' : 'b'];
    const topCls = await page.evaluate((i) => peels[i].top.className, i);
    for (const c of ['tl', 'tr', 'br', 'bl']) {
      const from = { tl: { x: S.l + 6, y: S.t + 6 }, tr: { x: S.r - 6, y: S.t + 6 }, br: { x: S.r - 6, y: S.b - 6 }, bl: { x: S.l + 6, y: S.b - 6 } }[c];
      await drag(from, { x: S.l + S.w * 0.5, y: S.t + S.h * 0.5 }, 10, 16, false);
      await sleep(40);
      const m = await page.evaluate((i) => { const p = peels[i]; const name = p.C && Geometry.corners(p.W, p.H).find((k) => k.x === p.C.x && k.y === p.C.y).name; return { s: p.state, name, flap: getComputedStyle(p.flapWrap).display, frac: p.liftedFraction(Geometry.fold(p.C, p.displayP())), medium: peel.state }; }, i);
      await t('touchEnd');
      await sleep(1300);
      const e = await page.evaluate((i) => { const p = peels[i]; return { s: p.state, top: p.top.className, clip: p.top.style.clipPath === p.cards[1].style.clipPath }; }, i);
      check(`small stack ${id}: ${c} corner peels and returns to idle`, m.s === 'dragging' && m.name === c && m.flap === 'block' && m.frac > 0.05 && m.medium === 'idle' && e.s === 'idle' && e.top === topCls && e.clip, JSON.stringify({ m, e }));
    }
  }
  await drag({ x: layout.b.r - 6, y: layout.b.b - 6 }, { x: layout.b.l + layout.b.w * 0.45, y: layout.b.t + layout.b.h * 0.4 }, 10, 16, false);
  await page.screenshot({ path: OUT + '11-small-peel.png' });
  await t('touchEnd'); await sleep(1300);


  // ================= 上下滑切换（智能叠放） =================
  // 每一叠：往上滑 → 下一张，往下滑 → 上一张，小圆点和名字跟着变；首尾相连（循环）
  const stackIds = ['stack', 'stackSmallA', 'stackSmallB'];
  const boxOf = (id) => page.evaluate((id) => { const r = document.getElementById(id).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, id);
  const stackInfo = (i) => page.evaluate((i) => {
    const p = peels[i];
    const area = p.el.closest('.widget');
    const dots = [...area.querySelectorAll('.dots span')];
    return {
      index: p.index, swIndex: p.swiper.index, sw: p.swiper.state, peel: p.state,
      top: p.top.getAttribute('aria-label'), n: p.cards.length,
      dot: dots.findIndex((d) => d.classList.contains('is-active')), dotsN: dots.length,
      label: area.querySelector('.widget__name').textContent,
      topVisible: getComputedStyle(p.top).visibility === 'visible' && p.top.style.zIndex === '30',
      transforms: p.cards.map((c) => c.style.transform).join(''),
      clip: p.el.style.clipPath.slice(0, 12),
    };
  }, i);
  const APP = { 电池: '电池', 世界时钟: '时钟', 天气: '天气', '播客·待播清单': '播客', '健身·活动': '健身', 备忘录: '备忘录', 日历: '日历' };
  const others = (i) => page.evaluate((i) => peels.filter((_, k) => k !== i).map((p) => `${p.index}${p.swiper.state}${p.state}`).join(','), i);
  // 从卡片中间竖着拖 dy（负数 = 往上）
  const swipe = async (id, dy, steps = 12, delay = 16, release = true) => {
    const B = await boxOf(id);
    const a = { x: B.l + B.w / 2, y: B.t + B.h / 2 };
    await drag(a, { x: a.x, y: a.y + dy }, steps, delay, release);
  };
  for (let i = 0; i < 3; i++) {
    const id = stackIds[i];
    const before = await stackInfo(i);
    const othersBefore = await others(i);
    const n = before.n;
    const seq = [[-1, 1, 'up → next'], [1, 0, 'down → previous'], [1, n - 1, 'down from first wraps to last'], [-1, 0, 'up from last wraps to first']];
    for (const [dir, want, what] of seq) {
      await swipe(id, dir * 110);
      await sleep(900);
      const s = await stackInfo(i);
      check(`swipe ${id}: ${what}`, s.index === want && s.swIndex === want && s.sw === 'idle' && s.peel === 'idle' && s.dot === want && s.dotsN === n && s.label === APP[s.top] && s.topVisible && s.transforms === '' && s.clip === '', JSON.stringify(s));
    }
    check(`swipe ${id}: other stacks unaffected`, (await others(i)) === othersBefore, `${othersBefore} -> ${await others(i)}`);
  }
  check('stack sizes: every stack holds the 3 peek-animated widgets', (await page.evaluate(() => peels.map((p) => p.cards.length).join())) === '3,3,3');

  // 滑到一半的截图（中号往上拖一半，不松手）
  await swipe('stack', -70, 10, 16, false);
  await sleep(60);
  const midSwipe = await stackInfo(0);
  check('mid-swipe: two cards on screen, clipped to the stack shape', midSwipe.sw === 'dragging' && midSwipe.clip.startsWith('polygon') && (midSwipe.transforms.match(/translate3d/g) || []).length === 2, JSON.stringify(midSwipe));
  await page.screenshot({ path: OUT + '12-mid-swipe.png' });
  await t('touchEnd'); await sleep(900);

  // 角落优先：从角落竖着拖是掀角，不是切换
  for (let i = 0; i < 3; i++) {
    const B = await boxOf(stackIds[i]);
    const idx0 = (await stackInfo(i)).index;
    await drag({ x: B.r - 6, y: B.b - 6 }, { x: B.r - 6, y: B.b - 76 }, 10, 16, false);
    await sleep(40);
    const s = await stackInfo(i);
    await t('touchEnd'); await sleep(1300);
    const e = await stackInfo(i);
    check(`corner zone on ${stackIds[i]}: vertical drag peels, never swipes`, s.peel === 'dragging' && s.sw === 'idle' && e.index === idx0 && e.peel === 'idle', JSON.stringify({ s: [s.peel, s.sw], e: [e.index, e.peel] }));
  }
  // 横着划不切换
  {
    const B = await boxOf('stack');
    await drag({ x: B.l + B.w / 2 - 50, y: B.t + B.h / 2 }, { x: B.l + B.w / 2 + 60, y: B.t + B.h / 2 + 10 }, 10, 16);
    await sleep(500);
    const s = await stackInfo(0);
    check('horizontal drag in the middle does not switch', s.index === 0 && s.sw === 'idle' && s.transforms === '', JSON.stringify(s));
  }
  // 滑到别的卡以后，掀角偷看的是「顺序里的下一张」；四个角都试，每一叠都试
  for (let i = 0; i < 3; i++) {
    const id = stackIds[i];
    await swipe(id, -110); await sleep(900);
    await swipe(id, -110); await sleep(900); // 现在最上面是第 3 张（index 2）
    const B = await boxOf(id);
    for (const c of ['tl', 'tr', 'br', 'bl']) {
      const from = { tl: { x: B.l + 6, y: B.t + 6 }, tr: { x: B.r - 6, y: B.t + 6 }, br: { x: B.r - 6, y: B.b - 6 }, bl: { x: B.l + 6, y: B.b - 6 } }[c];
      await drag(from, { x: B.l + B.w * 0.5, y: B.t + B.h * 0.5 }, 10, 16, false);
      await sleep(40);
      const m = await page.evaluate((i) => {
        const p = peels[i];
        const under = p.cards[(p.index + 1) % p.cards.length];
        const name = p.C && Geometry.corners(p.W, p.H).find((k) => k.x === p.C.x && k.y === p.C.y).name;
        const clone = p.flapFront.firstElementChild;
        return {
          s: p.state, name, index: p.index, under: under.getAttribute('aria-label'),
          underOk: p.under === under && under.style.zIndex === '20' && getComputedStyle(under).visibility === 'visible',
          othersHidden: p.cards.filter((c) => c !== p.top && c !== under).every((c) => getComputedStyle(c).visibility === 'hidden'),
          cloneOk: !!clone && clone.className === p.top.className && clone.getAttribute('aria-label') === null,
          frac: p.liftedFraction(Geometry.fold(p.C, p.displayP())),
        };
      }, i);
      await t('touchEnd');
      await sleep(1300);
      const e = await stackInfo(i);
      check(`${id} at card 3: ${c} corner peeks the next card (${m.under}) and returns`, m.s === 'dragging' && m.name === c && m.index === 2 && m.underOk && m.othersHidden && m.cloneOk && m.frac > 0.05 && e.peel === 'idle' && e.index === 2 && e.transforms === '', JSON.stringify({ m, e: [e.peel, e.index] }));
    }
    if (i === 0) {
      await drag({ x: B.r - 6, y: B.b - 6 }, { x: B.l + B.w * 0.55, y: B.t + B.h * 0.35 }, 12, 16, false);
      await sleep(40);
      await page.screenshot({ path: OUT + '13-peel-weather-over-next.png' });
      await t('touchEnd'); await sleep(1300);
    }
    // 回到第一张
    await swipe(id, 110); await sleep(900);
    await swipe(id, 110); await sleep(900);
    check(`${id}: back to first card`, (await stackInfo(i)).index === 0);
  }
  check('no horizontal overflow (after swipes)', (await overflow()) === 0);

  // ---- 保存 & 重新打开 ----
  await page.evaluate(() => { peel.setParams({ maxLift: 0.4, hintOnLoad: false, wallpaper: 'dawn' }); localStorage.setItem(Tuner.STORE_KEY, JSON.stringify(peel.params)); });
  await page.reload(); await sleep(1300);
  const saved = await page.evaluate(() => [peel.params.maxLift, peel.params.hintOnLoad, peel.state, peels[2].params.wallpaper, document.documentElement.dataset.wallpaper]);
  check('values persist after reload (and hint off respected, wallpaper 晨光 restored)', saved[0] === 0.4 && saved[1] === false && saved[2] === 'idle' && saved[3] === 'dawn' && saved[4] === 'dawn', saved.join(','));
  await page.evaluate(() => localStorage.setItem(Tuner.STORE_KEY, '{"maxLift":99,"cornerHit":"x","bogus":1,"paperColor":"red","wallpaper":"neon"}'));
  await page.reload(); await sleep(300);
  const sane = await page.evaluate(() => [peel.params.maxLift, peel.params.cornerHit, 'bogus' in peel.params, peel.params.paperColor, peel.params.wallpaper, document.documentElement.dataset.wallpaper]);
  check('bad saved values are sanitised (unknown wallpaper → 橄榄)', sane[0] === 0.95 && sane[1] === 0.45 && !sane[2] && sane[3] === '#f4ecd8' && sane[4] === 'olive' && sane[5] === 'olive', sane.join(','));
  await page.evaluate(() => localStorage.clear());
  check('no console/page errors (main run)', errs.length === 0, errs.join(' | '));
  await ctx.close();

  // ---- 存储抛错 ----
  const s2 = await setup(browser, () => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('SecurityError: storage disabled'); } });
  });
  await s2.page.goto(URL);
  // 存不了、读不了：用默认值（首次提示是关的）。页面装好后手动掀一下，确认翻角照常工作
  await s2.page.waitForFunction(() => window.peel && document.querySelector('.tn-sheet'), null, { timeout: 5000 }).catch(() => {});
  await sleep(1200);
  const ok2 = await s2.page.evaluate(() => { const idle = peel.state === 'idle' && peel.params.hintOnLoad === false; peel.peek('br'); return [idle && peel.state === 'returning' ? 'returning' : peel.state, !!document.querySelector('.tn-sheet')]; });
  await s2.longPress(await wallSpot(s2.page)); await sleep(600);
  const sl = await s2.page.evaluate(() => { const r = document.querySelector('.tn-slider__track').getBoundingClientRect(); return { x: r.left + r.width * 0.9, y: r.top + 2 }; });
  await s2.tap(sl.x, sl.y);
  const changed = await s2.page.evaluate(() => peel.params.returnDamping);
  check('localStorage throwing: page + panel still work', ok2[0] === 'returning' && ok2[1] && changed < 0.5 && s2.errs.length === 0, `damping ${changed}; errs ${s2.errs.join('|')}`);
  await s2.ctx.close();

  await browser.close();
  console.log(results.join('\n'));
  console.log(`\n${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed`);
})();
