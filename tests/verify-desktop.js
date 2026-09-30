/*
 * 电脑（鼠标）上的检查：各种窗口大小、调参侧边栏、窄窗口和手机上的底部面板。测的是打包好的网站（dist/）：
 *   npm run build
 *   (cd dist && python3 -m http.server 8780) &      # 端口被占用就换一个，再用 PORT=… 告诉脚本
 *   PORT=8780 node tests/verify-desktop.js
 */
const { execSync } = require('child_process');
const { chromium } = require(`${execSync('npm root -g').toString().trim()}/playwright`);
const OUT = (process.env.OUT || require('path').join(require('os').tmpdir(), 'peel-shots')) + '/';
require('fs').mkdirSync(OUT, { recursive: true });
const PORT = process.env.PORT || 8780;
const URL = `http://localhost:${PORT}/index.html`;
const results = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  (' + extra + ')' : ''}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rectOf = (page, sel) => page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, sel);
const overlap = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
const isOpen = (page) => page.evaluate(() => document.querySelector('.tn-sheet').classList.contains('is-open'));
// 调参面板的隐藏入口：在壁纸空白处按住鼠标 ≈1 秒（0.9 秒生效）。空白处 = 中号卡片左边、屏幕一半高的地方
const wallSpot = (page) => page.evaluate(() => { const r = document.getElementById('stack').getBoundingClientRect(); return { x: Math.max(8, r.left / 2), y: innerHeight / 2 }; });
async function longPress(page, p, ms = 1150) {
  if (!p) p = await wallSpot(page);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await sleep(ms); await page.mouse.up();
}

async function setup(browser, w, h, initScript) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://localhost:${PORT}` });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  page.on('pageerror', (e) => errs.push(String(e)));
  if (initScript) await page.addInitScript(initScript);
  await page.addInitScript(() => {
    const rec = (e) => { const st = document.getElementById('stack'); if (!st) return; const r = st.getBoundingClientRect(); window.__ev = { type: e.type, cx: e.clientX, cy: e.clientY, rl: r.left, rt: r.top }; if (e.type === 'pointerdown') window.__down = window.__ev; };
    addEventListener('pointerdown', rec, true); addEventListener('pointermove', rec, true);
  });
  return { ctx, page, errs };
}

// 从卡片的某个角（按屏幕上的位置）按下、往里拖，检查抓到的是不是这个角、纸角是不是跟着鼠标
async function peelCorner(page, name, tag) {
  const R = await rectOf(page, '#stack');
  const pts = { tl: [R.l + 5, R.t + 5], tr: [R.r - 5, R.t + 5], br: [R.r - 5, R.b - 5], bl: [R.l + 5, R.b - 5] };
  const [x, y] = pts[name];
  const tx = R.l + R.w / 2, ty = R.t + R.h / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(x + (tx - x) * i * 0.06, y + (ty - y) * i * 0.06); await sleep(16); }
  const fx = x + (tx - x) * 0.6, fy = y + (ty - y) * 0.6;
  const s = await page.evaluate(() => ({ state: peel.state, c: peel.C && Geometry.corners(peel.W, peel.H).find((c) => c.x === peel.C.x && c.y === peel.C.y).name, P: peel.P, C: peel.C, down: window.__down, clip: peel.top.style.clipPath.slice(0, 7), W: peel.W, H: peel.H, ev: window.__ev }));
  const R2 = await rectOf(page, '#stack');
  // 纸角尖（P）按「最后一次移动那一刻」的卡片位置换回屏幕坐标，应当离鼠标 ≈ 7px（按下点离角尖 5,5）
  const sx = s.ev.rl + s.P.x, sy = s.ev.rt + s.P.y;
  const off = Math.hypot(sx - s.ev.cx, sy - s.ev.cy);
  // 按下那一刻：鼠标在卡片坐标里离角尖多远（卡片在动时会比 5,5 远一些）
  const grab = Math.hypot(s.C.x - (s.down.cx - s.down.rl), s.C.y - (s.down.cy - s.down.rt));
  await page.mouse.up();
  // grab 的上限 = 角落感应范围（卡片在滑动时，按下那一刻卡片可能已经挪开几十 px；只要还在感应范围里就该抓得住。
  // 以前写死 50px，机器一忙、卡片多滑了一点就会误报）
  const ok = s.state === 'dragging' && s.c === name && s.clip === 'polygon' && Math.abs(off - grab) < 0.5 && grab < s.H * 0.45 && Math.abs(s.W - R2.w) < 0.5 && Math.abs(s.H - R2.h) < 0.5;
  check(`${tag}: peel ${name} corner lines up`, ok, `state ${s.state}, corner ${s.c}, tip-vs-mouse ${off.toFixed(1)}px = grab offset ${grab.toFixed(1)}px, W ${s.W}/${R2.w}`);
  await sleep(1300);
}

async function desktop(browser, w, h) {
  const tag = `${w}x${h}`;
  const { ctx, page, errs } = await setup(browser, w, h);
  await page.goto(URL);
  await sleep(2600);
  const sb = await rectOf(page, '.tn-sheet');
  check(`${tag}: sidebar open by default on first visit`, await isOpen(page));
  check(`${tag}: sidebar full height, right side, 340-380 wide`, sb.t <= 13 && sb.b >= h - 13 && Math.abs(sb.r - (w - 12)) < 1 && sb.w >= 340 && sb.w <= 380, JSON.stringify(sb));
  const st = await rectOf(page, '#stack');
  const dots = await rectOf(page, '#dots');
  const dock = await rectOf(page, '.dock');
  const pill = await rectOf(page, '.search-pill');
  const apps = await rectOf(page, '.apps');
  const smallA = await rectOf(page, '#stackSmallA');
  const smallB = await rectOf(page, '#stackSmallB');
  const allDots = await page.evaluate(() => [...document.querySelectorAll('.dots, .widget__name')].map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; }));
  check(`${tag}: sidebar overlaps nothing (stack, small stacks, all dots + names, icons, 搜索, dock)`, ![st, smallA, smallB, dots, dock, pill, apps, ...allDots].some((r) => overlap(r, sb)) && Math.max(...allDots.map((d) => d.r)) + 12 <= sb.l, `stack r ${st.r.toFixed(0)}, dots r ${dots.r.toFixed(0)}, sidebar l ${sb.l.toFixed(0)}`);
  // 窗口矮于 730 时那排 App 图标省掉（放不下），其余照常
  check(`${tag}: everything fits on screen (dock at the bottom, icons only when tall enough)`, dock.b <= h - 15 && dock.b >= h - 18 && smallA.b < pill.t && (h >= 730 ? apps.h > 60 && apps.t > smallA.b && apps.b < pill.t : apps.h === 0) && Math.abs((dock.l + dock.r) / 2 - (st.l + st.r) / 2) < 1, `dock ${dock.t.toFixed(0)}–${dock.b.toFixed(0)}, apps h ${apps.h.toFixed(0)}`);
  const pad = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.home')).paddingRight));
  const mid = (16 + (w - pad)) / 2;
  check(`${tag}: stack centred in remaining space`, Math.abs((st.l + st.r) / 2 - mid) < 1, `stack centre ${((st.l + st.r) / 2).toFixed(1)} vs region centre ${mid.toFixed(1)}`);
  check(`${tag}: no prototype UI (no hint text, no 调参 button)`, await page.evaluate(() => !document.querySelector('.hint, #tunerOpen, .tuner-open')));
  check(`${tag}: no horizontal overflow`, (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) === 0);
  check(`${tag}: labels say 收起 / 左边`, await page.evaluate(() => document.querySelector('.tn-close').textContent === '收起' && document.querySelector('.tn-sub').textContent.includes('左边') && document.querySelector('.tn-sub').textContent.includes('长按壁纸') && document.querySelector('.tn-sheet').getAttribute('role') === 'complementary'));
  await page.screenshot({ path: `${OUT}desktop-${tag}-open.png` });

  // 每个角（侧边栏开着）
  for (const c of ['tl', 'tr', 'br', 'bl']) await peelCorner(page, c, `${tag} open`);

  // 鼠标上下拖卡片中间：切换（每一叠都试，往上换下一张、往下换回来），侧边栏开着也一样
  for (const [i, id] of [[0, 'stack'], [1, 'stackSmallA'], [2, 'stackSmallB']]) {
    const S = await rectOf(page, `#${id}`);
    const cx = S.l + S.w / 2, cy = S.t + S.h / 2;
    const info = () => page.evaluate((i) => { const p = peels[i]; const w = p.el.closest('.widget'); return { index: p.index, sw: p.swiper.state, label: w.querySelector('.widget__name').textContent, dot: [...w.querySelectorAll('.dots span')].findIndex((d) => d.classList.contains('is-active')) }; }, i);
    const mouseSwipe = async (dy) => { await page.mouse.move(cx, cy); await page.mouse.down(); for (let k = 1; k <= 10; k++) { await page.mouse.move(cx, cy + dy * k / 10); await sleep(16); } await page.mouse.up(); await sleep(900); };
    await mouseSwipe(-110);
    const a = await info();
    await mouseSwipe(110);
    const b = await info();
    check(`${tag}: mouse swipe on ${id} switches and back (dots + name follow)`, a.index === 1 && a.dot === 1 && a.sw === 'idle' && b.index === 0 && b.dot === 0 && a.label !== b.label, JSON.stringify({ a, b }));
  }
  const sbAfter = await rectOf(page, '.tn-sheet');
  const stacksAfter = await page.evaluate(() => peels.map((p) => { const r = p.el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; }));
  check(`${tag}: sidebar never covers a stack (after swipes)`, !stacksAfter.some((r) => overlap(r, sbAfter)));

  // 点页面空白处 / 卡片中间都不收起
  await page.mouse.click(30, h - 30); await sleep(100);
  await page.mouse.click(st.l + st.w / 2, st.t + st.h / 2); await sleep(100);
  check(`${tag}: clicking the page does not close the sidebar`, await isOpen(page));

  // 收起：记录过渡期间卡片的位置，检查是平滑移动
  const closeBtn = await rectOf(page, '.tn-close');
  await page.evaluate(() => { window.__xs = []; const f = (t) => { window.__xs.push(document.getElementById('stack').getBoundingClientRect().left); if (window.__xs.length < 40) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await page.mouse.click(closeBtn.l + closeBtn.w / 2, closeBtn.t + closeBtn.h / 2);
  // 过渡中途按住角：应当抓得住，对得上
  await sleep(150);
  await peelCorner(page, 'br', `${tag} mid-close-transition`);
  const xs = await page.evaluate(() => window.__xs);
  const steps = xs.slice(1).map((x, i) => x - xs[i]);
  check(`${tag}: stack slides smoothly (monotonic, no jumps)`, steps.every((d) => d >= -0.01) && Math.max(...steps) < 60 && xs[xs.length - 1] - xs[0] > 100, `from ${xs[0].toFixed(0)} to ${xs[xs.length - 1].toFixed(0)}, max step ${Math.max(...steps).toFixed(1)}px`);
  const sbC = await page.evaluate(() => { const s = document.querySelector('.tn-sheet'); return { l: s.getBoundingClientRect().left, vis: getComputedStyle(s).visibility }; });
  check(`${tag}: 收起 hides the sidebar`, !(await isOpen(page)) && sbC.l >= w && sbC.vis === 'hidden', JSON.stringify(sbC));
  const st2 = await rectOf(page, '#stack');
  check(`${tag}: closed → stack centred in full width`, Math.abs((st2.l + st2.r) / 2 - w / 2) < 1, `${((st2.l + st2.r) / 2).toFixed(1)}`);
  await page.screenshot({ path: `${OUT}desktop-${tag}-closed.png` });
  for (const c of ['tl', 'tr', 'br', 'bl']) await peelCorner(page, c, `${tag} closed`);

  // 长按壁纸是开关（电脑上）。按住不到 0.9 秒不算
  await longPress(page, null, 400); await sleep(300);
  check(`${tag}: short press on the wallpaper does nothing`, !(await isOpen(page)));
  await longPress(page);
  await sleep(40);
  // 刚打开、还在动画：马上按角
  await peelCorner(page, 'tl', `${tag} right after reopening`);
  check(`${tag}: long-press on the wallpaper reopens`, await isOpen(page));
  await longPress(page); await sleep(600);
  check(`${tag}: long-press toggles closed`, !(await isOpen(page)));
  await longPress(page); await sleep(600);
  check(`${tag}: long-press toggles open again`, await isOpen(page));
  for (const c of ['br', 'tr']) await peelCorner(page, c, `${tag} after toggling`);

  await page.evaluate(() => localStorage.clear());
  check(`${tag}: no console/page errors`, errs.length === 0, errs.join(' | '));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  await desktop(browser, 1594, 830);
  await desktop(browser, 1280, 720);
  await desktop(browser, 900, 700);

  // ---- 侧边栏里所有控件（1280×720，鼠标） ----
  {
    const { ctx, page, errs } = await setup(browser, 1280, 720);
    await page.goto(URL); await sleep(2500);
    const probe = {
      paperOpacity: () => getComputedStyle(document.querySelector('.peel-flap__paper')).backgroundColor,
      flapBlur: () => getComputedStyle(document.querySelector('.peel-flap__front')).filter,
    };
    const ctls = await page.evaluate(() => Tuner.SECTIONS.flatMap((s) => s.items).filter((c) => !c.type).map((c) => ({ key: c.key, label: c.label })));
    for (const { key, label } of ctls) {
      const info = await page.evaluate((label) => {
        const el = [...document.querySelectorAll('.tn-slider')].find((v) => v.getAttribute('aria-label') === label);
        el.scrollIntoView({ block: 'center' });
        const tr = el.querySelector('.tn-slider__track').getBoundingClientRect();
        const th = el.querySelector('.tn-slider__thumb').getBoundingClientRect();
        return { tl: tr.left, tw: tr.width, y: tr.top + 2, thx: th.left + th.width / 2 };
      }, label);
      await sleep(80);
      const before = await page.evaluate((k) => peel.params[k], key);
      const pb = probe[key] ? await page.evaluate(`(${probe[key]})()`) : null;
      const target = info.thx > info.tl + info.tw / 2 ? info.tl + info.tw * 0.1 : info.tl + info.tw * 0.9;
      await page.mouse.move(info.thx, info.y); await page.mouse.down();
      for (let i = 1; i <= 8; i++) { await page.mouse.move(info.thx + (target - info.thx) * i / 8, info.y); await sleep(16); }
      if (key === 'cornerHit') check('sidebar: cornerHit slider shows zones on the stack', await page.evaluate(() => document.querySelector('.tn-zones').classList.contains('is-visible') && parseFloat(getComputedStyle(document.querySelector('.tn-zones')).getPropertyValue('--r')) > 100));
      await page.mouse.up();
      const after = await page.evaluate((k) => peel.params[k], key);
      const pa = probe[key] ? await page.evaluate(`(${probe[key]})()`) : null;
      check(`sidebar slider ${label} changes value`, before !== after && pb === pa ? !probe[key] : before !== after, `${before} -> ${after}${pa ? '; ' + pb + ' -> ' + pa : ''}`);
    }
    await page.evaluate(() => document.querySelector('.tn-swatch[aria-label="黑"]').scrollIntoView({ block: 'center' }));
    await page.click('.tn-swatch[aria-label="黑"]');
    check('sidebar: paper colour swatch applies', await page.evaluate(() => peel.params.paperColor === '#1c1c1e'));
    const sws = [await page.$('.tn-switch[aria-label="打开时自动提示"]'), await page.$('.tn-switch[aria-label="几何辅助线"]')];
    const hint0 = await page.evaluate(() => peel.params.hintOnLoad);
    await sws[0].scrollIntoViewIfNeeded(); await sws[0].click();
    check('sidebar: hint-on-load switch toggles', hint0 === false && (await page.evaluate(() => peel.params.hintOnLoad)) === true);
    await sws[1].click();
    check('sidebar: geometry overlay switch toggles', await page.evaluate(() => peel.debug && document.getElementById('stack').classList.contains('show-debug')));
    // 辅助线开着时掀角截图
    const R = await rectOf(page, '#stack');
    await page.mouse.move(R.r - 5, R.b - 5); await page.mouse.down();
    for (let i = 1; i <= 12; i++) { await page.mouse.move(R.r - 5 - i * 14, R.b - 5 - i * 6); await sleep(16); }
    await page.screenshot({ path: `${OUT}desktop-1280x720-debug-peel.png` });
    check('sidebar: debug overlay draws while peeling', await page.evaluate(() => peel.debugSvg.innerHTML.includes('掀起')));
    await page.mouse.up(); await sleep(1300);
    await page.evaluate(() => peel.setDebug(false));
    // 底部按钮
    await page.click('.tn-foot .tn-btn:nth-child(2)'); // 恢复默认
    check('sidebar: 恢复默认 restores defaults', await page.evaluate(() => JSON.stringify(peel.params) === JSON.stringify(PeelStack.DEFAULTS)));
    await sleep(1700);
    await page.click('.tn-foot .tn-btn:nth-child(1)'); await sleep(80);
    check('sidebar: 试一下 peeks a corner', (await page.evaluate(() => peel.state)) === 'returning');
    await sleep(1500);
    await page.click('.tn-foot .tn-btn--primary'); await sleep(250);
    const toast = await page.evaluate(() => { const e = document.querySelector('.tn-toast'); const r = e.getBoundingClientRect(); const s = document.querySelector('.tn-sheet').getBoundingClientRect(); return { text: e.textContent, vis: e.classList.contains('is-visible'), inside: r.left >= s.left && r.right <= s.right && r.bottom <= s.bottom }; });
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    let parsed = null; try { parsed = JSON.parse(clip); } catch (e) {}
    check('sidebar: 复制参数 copies JSON (21 keys, incl. wallpaper) + toast inside sidebar', toast.text === '已复制' && toast.vis && toast.inside && parsed && Object.keys(parsed).length === 21 && parsed.wallpaper === 'olive', JSON.stringify(toast));
    await page.screenshot({ path: `${OUT}desktop-1280x720-toast.png` });
    await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('no')); document.execCommand = () => false; });
    await page.click('.tn-foot .tn-btn--primary'); await sleep(250);
    const man = await page.evaluate(() => { const m = document.querySelector('.tn-manual'); return [getComputedStyle(m).display, m.querySelector('textarea').value.length]; });
    check('sidebar: clipboard failure shows manual-copy box', man[0] === 'flex' && man[1] > 50, man.join(','));
    await page.screenshot({ path: `${OUT}desktop-1280x720-manual.png` });
    await page.click('.tn-manual .tn-btn');
    check('sidebar: manual box dismisses', (await page.evaluate(() => getComputedStyle(document.querySelector('.tn-manual')).display)) === 'none');
    const targets = await page.evaluate(() => [...document.querySelectorAll('.tn-close, .tn-foot .tn-btn, .tn-slider')].map((e) => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); }));
    check('sidebar: tap targets >= 44px', Math.min(...targets) >= 44, `min ${Math.min(...targets)}`);
    // 面板内滚动
    await page.mouse.move(1100, 400); await page.mouse.wheel(0, 600); await sleep(300);
    check('sidebar: panel scrolls with wheel', (await page.evaluate(() => document.querySelector('.tn-body').scrollTop)) > 100);
    check('sidebar controls: no console/page errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  // ---- 记住开关 + 宽窄切换 ----
  {
    const { ctx, page, errs } = await setup(browser, 1280, 720);
    await page.goto(URL); await sleep(600);
    await page.click('.tn-close'); await sleep(600);
    check('persist: closing stores 0', (await page.evaluate(() => localStorage.getItem('peel-tuner-sidebar'))) === '0');
    await page.reload(); await sleep(600);
    check('persist: stays closed after reload', !(await isOpen(page)));
    const x0 = await page.evaluate(() => document.getElementById('stack').getBoundingClientRect().left);
    await longPress(page); await sleep(600);
    await page.reload(); await sleep(20);
    const firstFrame = await page.evaluate(() => [document.querySelector('.tn-sheet').classList.contains('is-open'), getComputedStyle(document.querySelector('.home')).transitionDuration]);
    await sleep(600);
    check('persist: stays open after reload, no slide-in on load', firstFrame[0] && (await isOpen(page)), JSON.stringify(firstFrame));
    // 变窄：侧边栏收起，不变成盖住下半屏的底部面板；再变宽：恢复
    await page.setViewportSize({ width: 800, height: 720 }); await sleep(700);
    const narrow = await page.evaluate(() => [document.querySelector('.tn-sheet').classList.contains('is-open'), document.querySelector('.tn-close').textContent, document.querySelector('.tn-sheet').getAttribute('role')]);
    check('resize to narrow: sidebar closes, becomes sheet', narrow[0] === false && narrow[1] === '完成' && narrow[2] === 'dialog', narrow.join(','));
    check('resize to narrow: remembered preference untouched', (await page.evaluate(() => localStorage.getItem('peel-tuner-sidebar'))) === '1');
    await page.setViewportSize({ width: 1280, height: 720 }); await sleep(700);
    check('resize back to wide: sidebar reopens', await isOpen(page));
    const st = await rectOf(page, '#stack');
    const W = await page.evaluate(() => [peel.W, peel.H]);
    check('resize back: peel re-measured', Math.abs(W[0] - st.w) < 0.5 && Math.abs(W[1] - st.h) < 0.5);
    await peelCorner(page, 'bl', 'after resize');
    await page.evaluate(() => localStorage.clear());
    check('persist/resize: no errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  // ---- 窄的电脑窗口 800：底部面板，行为和以前一样 ----
  {
    const { ctx, page, errs } = await setup(browser, 800, 700);
    await page.evaluate; await page.goto(URL); await page.evaluate(() => localStorage.setItem('peel-tuner-sidebar', '1')); await page.reload(); await sleep(2500);
    check('800: sheet NOT auto-opened even if desktop pref is open', !(await isOpen(page)));
    await longPress(page); await sleep(600);
    const sh = await rectOf(page, '.tn-sheet'); const st = await rectOf(page, '#stack');
    check('800: bottom sheet opens below the card', (await isOpen(page)) && sh.t > st.b + 10 && sh.b === 700 && sh.w === 560, JSON.stringify(sh));
    check('800: labels unchanged (完成 / 上面)', await page.evaluate(() => document.querySelector('.tn-close').textContent === '完成' && document.querySelector('.tn-sub').textContent.includes('上面')));
    await page.screenshot({ path: `${OUT}desktop-800x700-sheet.png` });
    await peelCorner(page, 'tr', '800 sheet open');
    await page.mouse.click(30, 30); await sleep(600);
    check('800: clicking outside closes sheet', !(await isOpen(page)));
    await longPress(page); await sleep(600);
    check('800: long-press on the wallpaper opens the sheet again', await isOpen(page));
    await page.click('.tn-close'); await sleep(600);
    check('800: 完成 closes sheet', !(await isOpen(page)));
    check('800: pref not overwritten by sheet use', (await page.evaluate(() => localStorage.getItem('peel-tuner-sidebar'))) === '1');
    await page.evaluate(() => localStorage.clear());
    check('800: no errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  // ---- 手机：记着「电脑上开着」也不自动弹出 ----
  {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    await page.goto(URL); await page.evaluate(() => localStorage.setItem('peel-tuner-sidebar', '1')); await page.reload(); await sleep(2600);
    check('phone: sheet closed on load', !(await isOpen(page)));
    await page.screenshot({ path: `${OUT}phone-393x852-closed.png` });
    // 手指长按壁纸空白处（App 图标那排和「搜索」之间）
    const cdp = await ctx.newCDPSession(page);
    const spot = await page.evaluate(() => { const a = document.querySelector('.apps').getBoundingClientRect(); const s = document.querySelector('.search-pill').getBoundingClientRect(); return { x: innerWidth / 2, y: (a.bottom + s.top) / 2 }; });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: spot.x, y: spot.y, id: 1 }] });
    await sleep(1150);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(700);
    await page.screenshot({ path: `${OUT}phone-393x852-open.png` });
    const sh = await rectOf(page, '.tn-sheet');
    // 面板停在最下面那排小组件的名字下面（会盖住 App 图标和程序坞）：
    // 68（顶边，没有安全区时）+ 158 + 37u + 158 + 6u + 14u + 16，u = 338 / 349.67
    const lowest = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.stack, .widget__name')].map((e) => e.getBoundingClientRect().bottom)));
    check('phone: long-press opens the sheet; geometry (stops below the small row)', Math.round(sh.t) === 455 && sh.t >= lowest + 8 && sh.l === 0 && sh.w === 393 && sh.b === 852, JSON.stringify(sh) + ` lowest ${lowest.toFixed(1)}`);
    check('phone: no errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  // ---- 存储抛错（电脑）----
  {
    const { ctx, page, errs } = await setup(browser, 1280, 720, () => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('SecurityError: storage disabled'); } });
    });
    await page.goto(URL);
    // 存储读不了：用默认值（首次提示默认关）。等页面装好，再手动掀一下，确认翻角照常工作
    await page.waitForFunction(() => window.peel && document.querySelector('.tn-sheet'), null, { timeout: 5000 }).catch(() => {});
    await sleep(1200);
    const s = await page.evaluate(() => { const idle = peel.state === 'idle' && peel.params.hintOnLoad === false; peel.peek('br'); return [idle && peel.state === 'returning' ? 'returning' : peel.state, document.querySelector('.tn-sheet').classList.contains('is-open')]; });
    await sleep(1500);
    await page.click('.tn-close'); await sleep(600);
    const closed = !(await isOpen(page));
    await longPress(page); await sleep(600);
    await peelCorner(page, 'br', 'storage throws');
    check('storage throwing (desktop): page works, sidebar defaults open and toggles', s[0] === 'returning' && s[1] && closed && (await isOpen(page)) && errs.length === 0, `${s} ${closed} ${errs.join('|')}`);
    await ctx.close();
  }

  await browser.close();
  console.log(results.join('\n'));
  console.log(`\n${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed`);
})();
