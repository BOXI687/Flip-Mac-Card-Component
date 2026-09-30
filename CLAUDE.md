# Flip-Mac-Card-Component

Owner: Boxi (BOXI687). Before anything else, use the `boxi-collab` skill and read Boxi's profile, learning map and lessons from the private repo BOXI687/claude-profile. Boxi has zero coding background: confirm before any change (「直接改」 counts as confirmation), explain in Chinese with English terms. Refer to Boxi by name; no pronouns have been stated.

## What this is

A web prototype of iOS home-screen widget stacks (Smart Stack) laid out like a home screen: one Medium stack on top and two Small stacks side by side below, each with its app-name label under it and page dots on the right.

- Each stack holds only the 3 peek-animated widgets, so every peel shows the gather motion (Boxi's choice, to make reviewing easy): Medium (3): 电池 Batteries, 世界时钟 World Clock, 天气 Weather. Small A (3): 电池, 天气, 时钟 (London). Small B (3): 时钟 (Beijing), 电池, 天气.
- 播客·待播清单 Podcasts Up Next, 健身·活动 Fitness, 备忘录 Notes (medium) and 日历 Calendar (small) are built but not in any stack right now; add them back in `STACKS` in `src/data.js`.
- **Vertical swipe** in the middle of a stack switches the top card (up = next, down = previous). It wraps around (iOS Smart Stacks loop; that is from memory, not checked on a device), moves at most one card per gesture (rubber band beyond one card), follows the finger, snaps with a spring, and can be re-grabbed mid-snap. A release faster than 220 px/s goes to the next card in the flick direction; otherwise it snaps to the nearest card (past half = switch). Dots and label update when the card passes halfway.
- **Corner drag** peels the top card back like paper to **peek** at the next card in order (index + 1, wrapping); releasing always springs back. It must never swap the cards (Boxi decided peek-only). The corner hit test runs first at pointerdown; anything else goes to the swipe. While a swipe is moving, corners can't peel (a press re-grabs the swipe instead).
- **Peek → gather (掀开就聚拢, Boxi approved):** while a corner is peeled, the under card's key info moves into the revealed opening, *scrubbed* by the peel (every pixel of drag moves it, pausing pauses it, the spring-back plays it in reverse, re-grab continues). Engine: `src/engine/reveal.js`, called every frame from `peel.js`'s loop with the fold and the lifted fraction. One style, **换座位** (seat layouts; the old style B 磁铁 was deleted at Boxi's request), switched on/off by the tuner switch 「掀开时信息聚拢」 (`peekGather`, default on): each widget has 2–3 seat layouts; the opening's inscribed corner box decides how big each fits and the engine blends continuously to the next layout when it fits at ≈0.6 × 放大倍数; `either` alternatives (row vs col) are soft-picked by fit (softmax, τ 0.015); when the main elements' home spots are fully inside the opening it blends back to the normal layout; elements start one after another (出发间隔, a target-history delay) with their own springs (damping `peekDamping`, response `peekResponse`); tagged elements that are in no layout stay home and fade. **数字逐位升起** (`peekRoll`, key kept so saved settings still work; default on; only while 聚拢 is on): replaced the old odometer, which showed wrong intermediate digits (e.g. `15:96`) when peeled or released slowly. Boxi's rule: position/scale/opacity may follow the finger, **the number's content must always be correct**. An overlay (`.peek-rise`) puts every character of the hero text (digits, `°`, `%`, `:`) in its own clip window the size of its line box (measured per character with Range, then calibrated so it sits within 0.02px of the original); the window clips only its bottom edge and each glyph rises from one line-height below to 0. Scrubbed by openness (6% → 36%, linear, followed by a critically damped spring of 0.35s that snaps when within 3e-4), left to right with overlapping stagger (each glyph starts when the previous is 30% up), each glyph eased with `cubic-bezier(0.22, 1, 0.36, 1)` and faded in over its first 45%. Covering again sinks them back in reverse. Fully risen glyphs carry no inline transform (crisp). If React changes the text mid-peel (minute tick), a MutationObserver rebuilds with the new characters in the same microtask (no rolling between values). 聚拢 off = old behaviour (the under card stays still; turning it off mid-peel puts everything back). Saved settings from before: `peekStyle` `'a'`/`'b'` load as on, `'off'`/`'关'` as off, a stray `peekPull` is dropped (`loadSaved` in `tuner.js`). `prefers-reduced-motion` → nothing moves. Only transform/opacity; home rects measured once in `begin()` at peel start; `end()` (from `peel.reset()`) clears every style and the overlay. The flap clone is untouched (it clones the top card). Supported: Weather, Batteries, World Clock (medium + small); other widgets have no spec and stay still. Not tried on a real iPhone.
- Each stack is independent. Real WidgetKit widgets can't do drag gestures, which is why this is a web page that Boxi adds to an iPhone home screen.

**Tech: React 19 + Vite (JSX).** Boxi approved moving from the old zero-dependency / classic-`<script>` / double-click-`index.html` setup to React + Vite (Boxi is learning React). Keep dependencies minimal: react, react-dom, vite, @vitejs/plugin-react. Anything else needs Boxi's OK. Double-clicking `index.html` no longer works; use `npm run dev` or the built site.

Architecture rule: the fold math and gesture engines stay framework-agnostic ES modules in `src/engine/`. React renders cards, dots and labels and mounts the engines with `useRef` + `useEffect`. Per-frame animation is imperative DOM writes, never React state. The engines only tell React when the top card changes. The peel layers (flap clone, shadows, debug SVG, tuner's corner-zone preview) live in an empty `.peel-layers` div that React renders but never fills, so React never manages the cloned card. The clone is static (its clock doesn't tick during a peel, which is fine). The reveal engine only touches elements marked `data-peek` on the under card (inline `transform`/`transform-origin`/`opacity`, plus a `.peek-rise` span it appends and removes, and `color: transparent` / `position: relative` on the hero while it is there); React never sets `style` on those elements, so the two don't fight, and React's text updates still land (the digit layer rebuilds, via MutationObserver, when the text changes). SVG `id`s inside widgets must come from `useId()`: hidden cards are `visibility: hidden`, and a duplicate id resolving to a hidden card's mask makes the shape vanish.

## Files

| File | Role |
| --- | --- |
| `index.html` | Vite entry; `<html data-variant data-variant-label>`; PWA meta; `<div id="root">` |
| `src/main.jsx` | Mounts `<App>` in StrictMode; exposes `window.Geometry / PeelStack / Tuner` for tests and console; `?eruda` loads a phone console |
| `src/App.jsx` | Home-screen layout (three `<PeelStack>`), fake-glass wallpaper alignment, mounts the tuner, hint peek; exposes `window.peel` (medium) and `window.peels` (all three) |
| `src/data.js` | Widget data (all invented, public site) and `STACKS` (which widgets in which order) |
| `src/components/PeelStack.jsx` | One stack: cards + `.peel-layers` + dots + name; creates the peel engine and swiper, `setIndex` state for dots/label |
| `src/components/widgets/*.jsx` | Weather / Battery / WorldClock also export a peek spec (`Widget.peek = { medium, small }`, at the end of each file) and mark elements with `data-peek`. Battery, WorldClock (medium/small), Weather (medium/small, hourly row from the real clock, sunrise/sunset slot, night variant), Calendar (small; lunar day via `Intl` `zh-CN-u-ca-chinese`), Podcasts, Fitness, Notes (medium only) |
| `src/hooks/useNow.js` | Shared 1-second ticker aligned to whole seconds (`useSyncExternalStore`) |
| `src/engine/geometry.js` | Pure fold math: crease = perpendicular bisector of corner→finger, half-plane clip, reflection matrix; `squirclePolygon` = iOS continuous-corner outline that every clip is cut from |
| `src/engine/peel.js` | `PeelStack` engine: gestures, clip-path, mirrored flap, curl shading, projected shadow, spring return, max-lift rubber band, `index` / `under` / `setIndex`, `destroy()`. **Tunable defaults are in `DEFAULTS` at the top** (including the swipe spring); they are Boxi's tuned values (warm paper `#f4ecd8` at 0.6, blur 2, highlight 0.75, hint on load off, peekDamping 0.72). `style.css` repeats the paper colour / blur as CSS-variable fallbacks |
| `src/engine/reveal.js` | Peek → gather: `Reveal` class (`begin(card, spec)` / `step(now, geom)` / `end()` / `debug()`), seat layouts (mini flex: `row` / `col` / `over` / `either`, item `scale`), digit-rise overlay. Fixed feel constants at the top (MIN_SCALE 0.2, ENGAGE 1.5–20% openness, RISE 6–36%, RISE_STAGGER 0.3, RISE_FADE 0.45) |
| `src/engine/swipe.js` | `StackSwiper`: vertical swipe engine (slop 6px, gap 8px between cards, flick 220 px/s, rubber band, spring from `swipeResponse` / `swipeDamping`); clips the stack to the squircle while moving and shifts the battery card's fake-glass wallpaper so it stays aligned |
| `src/engine/tuner.js` | 调参 panel (imperative, mounted from App). Desktop ≥900px: right sidebar that pushes content aside (open by default, state remembered). Phone: bottom sheet that stops below the lowest widget row. Params apply to every stack; persisted in localStorage, keyed per variant; 复制参数 exports 20 keys (6 `peek*`); control types: slider (tick = default), switch, color (swatches; the default one, 暖白纸 `#f4ecd8`, has a dot under its name); `destroy()` for unmount |
| `src/styles/style.css` | Layout, cards, glass rim, peel layers, tuner. Widget sizes/radius/material from Apple's HIG table and iOS 27 UI Kit, sources (OFFICIAL / MEASURED / INFERRED) in comments |
| `src/styles/widgets.css` | Each widget's look, in `--u` (design pt) units, with sources in comments |
| `public/` | `manifest.webmanifest`, `icons/` (copied as-is) |
| `tests/` | Playwright suites (see below); `tests/package.json` marks them CommonJS |
| `docs/TUTORIAL.md` | Beginner tutorial (Chinese), describes the **pre-React** version |

## How a widget opts in to peek → gather

1. In the widget's JSX, tag the elements that should move: `data-peek="name"`. Tag each element once, and don't tag both a parent and its child (transforms would stack). Things that should only fade out (other devices, other cities, the hourly row) can share one name, e.g. `"rest"`. An element that should exist only during a peek (World Clock's digital time, Small Batteries' %) also gets `data-peek-only` and `aria-hidden`; `widgets.css` makes it `position: absolute; opacity: 0` and places it where it should emerge from (don't give it a CSS `transform`, the engine owns that).
2. At the end of the widget file, attach the spec (per size):

```js
Weather.peek = { medium: SPEC, small: SPEC };
const SPEC = {
  hero: 'temp',          // optional; default = first element of the first layout
  roll: 'temp',          // optional: element whose characters rise digit by digit (name kept from the old odometer)
  layouts: [             // 换座位: small opening → large; tagged elements in no layout stay home and fade
    'temp',
    { either: [{ row: ['temp', 'icon', 'cond'] }, { col: ['temp', { row: ['icon', 'cond'] }] }] },
    { col: ['temp', { row: ['icon', 'cond'] }, 'hl'] },
  ],
};
```

Layout nodes: `'key'`, `{ key, scale }`, `{ row: [...] }` (vertically centred), `{ col: [...] }` (aligned to the peeled corner's side), `{ over: [...] }` (centred on each other, e.g. ring + icon), `{ either: [...] }` (top level only: alternatives, the one that fits bigger wins), optional `gap` multiplier. Sizes come from each element's measured visible box (Range for text), so no numbers are needed. `PeelStack.jsx` passes `Widget.peek[size]` to the engine; widgets without a spec are left alone.

Current specs: Weather `28° → 28° ☀ 晴朗 → + 最高/最低` (rise temp); Batteries: lowest-charged device (`hero: 'pct'`), `icon + 41% → ring(icon) + 41%` (rise pct; Small renders a peek-only %); World Clock: first city, `15:02 → 15:02 + 北京 → dial + 15:02 + 北京 (+ 时差)` (rise time; digital time and Small's city name are peek-only).

## Commands

```bash
npm install          # once
npm run dev          # local dev server (http://localhost:5173); add -- --host to open it from an iPhone on the same Wi-Fi
npm run build        # production build → dist/
npm run preview      # serve dist/
```

## Branches and deploy

- `claude/github-cleanup-ux-prototype-541sop` = main line, published at https://boxi687.github.io/Flip-Mac-Card-Component/ (it is the repo's default branch).
- `version-a-opus` → `/a/`, `version-b-emil` → `/b/`: the old plain-HTML A/B variants (Boxi chose A, merged before the React rewrite; B kept for reference). They are published as-is.
- `.github/workflows/pages.yml` checks out the main line, runs `npm ci && npm run build` (Node 22) and puts `dist/` at the site root, then clones `/a/` and `/b/` next to it and adds `?v=<commit>` to their CSS/JS links (10-minute Pages cache). The main line needs no `?v=`: Vite puts a content hash in every asset filename. Only `dist/` of the main line is published now, not its source, tests or this file (the repo itself is still public). Pushes to variant branches trigger the deploy via `variant-push.yml` → `workflow_run`, so every deploy runs from the default branch (precaution: the `github-pages` environment usually only allows the default branch; this repo's policy couldn't be checked from the cloud proxy).
- On a variant branch, `index.html` has `data-variant` and `data-variant-label`, and the app title and manifest `short_name` are changed. When merging a variant into the main line, reset those to empty / `Peel` / `Peel Widget Stack`.
- Never commit secrets or anything from Boxi's employer. Never put Boxi's personal screenshots (used as visual references) in the repo.
- Don't commit `.claude/worktrees/` (background-agent checkouts; add it to `.git/info/exclude`), `node_modules/` or `dist/` (both in `.gitignore`). Commit `package-lock.json`.

## Verifying changes

```bash
npm run build
(cd dist && python3 -m http.server 8780 &)   # any free port
PORT=8780 node tests/verify-phone.js         # iPhone 393×852 touch: 101 checks (peel, swipe on every stack, corner-vs-swipe, peek = next card, panel)
PORT=8780 node tests/verify-desktop.js       # desktop sizes + sidebar + mouse swipe + phone sheet: 148 checks
PORT=8780 node tests/verify-gestures.js      # release matrix: 121 checks
PORT=8780 node tests/verify-reveal.js        # peek → gather + digit rise: 80 checks
```

- Playwright is installed globally (`npm root -g`); Chromium only; never run `playwright install`. Screenshots go to `$OUT` (default: `<tmpdir>/peel-shots/`). Look at them.
- The desktop suite used to fail now and then on a loaded machine (also on 09b1ffc): "right after reopening: peel tl corner lines up" (the card slides >50px between reading its rect and the press; the bound is now the corner-hit radius) and "storage throwing (desktop)" (a fixed 1200ms wait for the hint peek; now waits for it). Same fix for the phone suite's "hint peek runs on load" / "localStorage throwing" (the page mounts ~350ms after navigation, so a fixed 1150ms could land before the 900ms hint). Since the hint peek is off by default, the phone suite's main run turns it on through saved settings to test it, and both "storage throwing" checks now expect no hint (defaults) and peek a corner by hand. The gesture suite's "re-grab mid-snap" now records the swipe position inside the page right before and after the engine handles the press (it used to compare two CDP reads, between which the spring kept moving). If a suite fails, rerun once. If it fails again, find the check and fix it; don't ignore it.
- `verify-reveal.js`: Weather Medium, Batteries Small, World Clock Medium × 4 corners: the hero's per-frame motion during a slow peel is continuous (step change < 6px, scale step < 0.08), after a pause the hero's visible centre is inside the lifted polygon, upright (no rotation, not mirrored), opaque; fully peeled, every digit is risen and shows the real value (br, tl); after release every inline style and the overlay are gone. **Digit rise** (Weather Medium °, Batteries Small %, World Clock Medium : × br, tl): a page-side rAF sampler checks every frame of a slow scrubbed peel (0.6% steps, pauses at 8/14/20% openness, slow cover-back, release) that the layer holds exactly one glyph per real character, each glyph's text is the real character at that position, no stray text, and the original text is transparent; pausing holds the digits (±0.002); some glyphs were seen part-way; fully peeled all glyphs are at rest (no inline transform/opacity) within 1px of the original characters; plus one mid-peel text change (World Clock) is rebuilt in the same microtask. Run against the old odometer build these checks fail (the layer contains the 0–9 strips). Plus Weather Small / Batteries Medium / World Clock Small once each, 聚拢 off moves nothing, reduced motion moves nothing, swiping between peels re-measures the new under card, the 掀开时信息聚拢 / 数字逐位升起 switches, sanitising of saved values, and old saved `peekStyle` (a / b / off / 关) + `peekPull` loading correctly. Run it (and `verify-gestures.js`) for any change to `reveal.js`, the peel render loop or a widget's peek spec / `data-peek` tags.
- `verify-gestures.js` is the CLAUDE-required release test: peel slow release, fast flick, pause-then-release, and re-grab mid-return, on all 4 corners of the Medium and one Small stack, with default and extreme tuning (returnDamping 0.35). The lifted area after release must never exceed the lifted area at release (guards the "whole card flashes out" bug from spring overshoot past the corner; `displayP()` prevents it). Swipe: slow 30% / 70%, short flick, pause-then-release, over-drag, re-grab mid-snap, up and down, default and swipeDamping 0.4. Run it for any change to release/spring/swipe behaviour.
- Also check dev mode (`npm run dev`) once after engine changes: StrictMode mounts effects twice, so engines and the tuner must clean up fully (one sheet, one set of layers per stack, one click toggles the sidebar).
- Time-dependent widgets: Playwright `page.clock.setFixedTime(...)` plus `timezoneId` give reproducible day/night screenshots.
- After pushing, verify the live URL yourself. Boxi's "it's broken" reports were twice caused by browser cache and once by a real bug.
- To open live URLs from a cloud session, Chromium needs the proxy CA in NSS: `apt-get install -y libnss3-tools && certutil -A -d sql:$HOME/.pki/nssdb -n ccr-agent-proxy -t "C,," -i /root/.ccr/agent-proxy-ca.crt`.

## Open threads

- The React rewrite, swipe switching and the five new widgets have not been tried on a real iPhone. Nor has version A or the wallpaper-band fix. Performance claims are unverified on device.
- Visual sources. Batteries and World Clock: Apple's iOS 27 UI Kit (Sketch share linked from developer.apple.com/design/resources, readable with Sketch's web Inspect; the Figma file "iOS and iPadOS 27" is readable only through the Figma connector, figma.com itself returns 403 from cloud sessions) plus Apple support-page images. Weather (medium/small), Calendar, Podcasts Up Next, Fitness and Notes: measured from Boxi's own iPhone screenshots (iOS 26/27, not in the repo; 810 px medium width = 349.67 pt). INFERRED: Small Batteries 2×2, Small Clock layout, Batteries medium percent size, the Weather night gradient, the page-dot style, the 8 px gap between cards while swiping, and Smart Stack wrap-around.
- Fonts: SF Pro is installed in this machine's fontconfig and "PingFang SC" maps to Noto Sans CJK SC, so local screenshots are close to the iPhone (Chinese text uses a different but similar face). Vertical offsets were tuned earlier against a DejaVu/WenQuanYi fallback, so on an iPhone text may still sit ±1–2 pt off. A cloud session may not have these fonts; check `fc-match "SF Pro"`.
- The Batteries glass is a fake (wallpaper copy aligned by `App.jsx` and shifted by `swipe.js` while swiping), because cards must stay opaque.
- Peek → gather has not been tried on a real iPhone: performance of per-frame transforms on text (no `will-change`, so text re-rasterises crisply) and Safari's handling of the digit-rise `clip-path` windows (`inset(-0.3em -0.3em 0 -0.3em)`, bottom edge only) are unverified. Digit rise: the hero is tiny or under the flap's curl until ≈15–20% openness, so the range 6–36% was tuned by eye so most of the rise happens while it is readable; during a cover-back the seat can lag the flap so part of the number is briefly hidden under the paper (occlusion by the flap, not a wrong digit; pre-existing behaviour). Nested elements inside the hero text get their font copied, but a nested element with its own `color` would not be hidden (none exist today). Small Batteries never reaches its ring layout (the opening is too small at maxLift 0.65); World Clock and Batteries go back to the normal layout from corners where their home spots get fully revealed. Mid-transition (paused exactly between two seat layouts) elements can briefly overlap; incoming ones stay faint until mostly seated. The digital time is 24-hour `HH:MM` (INFERRED).
- Hashed assets: an `index.html` cached before a deploy points to old asset names that the new deploy removed. Usually the old assets are cached along with it (unverified); if Boxi sees a blank page right after a deploy, reload.
