# Flip-Mac-Card-Component

Owner: Boxi (BOXI687). Before anything else, use the `boxi-collab` skill and read Boxi's profile, learning map and lessons from the private repo BOXI687/claude-profile. Boxi has zero coding background: confirm before any change (「直接改」 counts as confirmation), explain in Chinese with English terms. Refer to Boxi by name; no pronouns have been stated.

## What this is

A web prototype of iOS home-screen widget stacks (Smart Stack) laid out like a home screen: one Medium stack on top and two Small stacks side by side below, each with its app-name label under it and page dots on the right.

- Medium stack (6): 电池 Batteries, 世界时钟 World Clock, 天气 Weather, 播客·待播清单 Podcasts Up Next, 健身·活动 Fitness, 备忘录 Notes.
- Small A (4): 电池, 天气, 日历 Calendar, 时钟 (London). Small B (4): 日历, 时钟 (Beijing), 电池, 天气.
- **Vertical swipe** in the middle of a stack switches the top card (up = next, down = previous). It wraps around (iOS Smart Stacks loop; that is from memory, not checked on a device), moves at most one card per gesture (rubber band beyond one card), follows the finger, snaps with a spring, and can be re-grabbed mid-snap. A release faster than 220 px/s goes to the next card in the flick direction; otherwise it snaps to the nearest card (past half = switch). Dots and label update when the card passes halfway.
- **Corner drag** peels the top card back like paper to **peek** at the next card in order (index + 1, wrapping); releasing always springs back. It must never swap the cards (Boxi decided peek-only). The corner hit test runs first at pointerdown; anything else goes to the swipe. While a swipe is moving, corners can't peel (a press re-grabs the swipe instead).
- Each stack is independent. Real WidgetKit widgets can't do drag gestures, which is why this is a web page that Boxi adds to an iPhone home screen.

**Tech: React 19 + Vite (JSX).** Boxi approved moving from the old zero-dependency / classic-`<script>` / double-click-`index.html` setup to React + Vite (Boxi is learning React). Keep dependencies minimal: react, react-dom, vite, @vitejs/plugin-react. Anything else needs Boxi's OK. Double-clicking `index.html` no longer works; use `npm run dev` or the built site.

Architecture rule: the fold math and gesture engines stay framework-agnostic ES modules in `src/engine/`. React renders cards, dots and labels and mounts the engines with `useRef` + `useEffect`. Per-frame animation is imperative DOM writes, never React state. The engines only tell React when the top card changes. The peel layers (flap clone, shadows, debug SVG, tuner's corner-zone preview) live in an empty `.peel-layers` div that React renders but never fills, so React never manages the cloned card. The clone is static (its clock doesn't tick during a peel, which is fine). SVG `id`s inside widgets must come from `useId()`: hidden cards are `visibility: hidden`, and a duplicate id resolving to a hidden card's mask makes the shape vanish.

## Files

| File | Role |
| --- | --- |
| `index.html` | Vite entry; `<html data-variant data-variant-label>`; PWA meta; `<div id="root">` |
| `src/main.jsx` | Mounts `<App>` in StrictMode; exposes `window.Geometry / PeelStack / Tuner` for tests and console; `?eruda` loads a phone console |
| `src/App.jsx` | Home-screen layout (three `<PeelStack>`), fake-glass wallpaper alignment, mounts the tuner, hint peek; exposes `window.peel` (medium) and `window.peels` (all three) |
| `src/data.js` | Widget data (all invented, public site) and `STACKS` (which widgets in which order) |
| `src/components/PeelStack.jsx` | One stack: cards + `.peel-layers` + dots + name; creates the peel engine and swiper, `setIndex` state for dots/label |
| `src/components/widgets/*.jsx` | Battery, WorldClock (medium/small), Weather (medium/small, hourly row from the real clock, sunrise/sunset slot, night variant), Calendar (small; lunar day via `Intl` `zh-CN-u-ca-chinese`), Podcasts, Fitness, Notes (medium only) |
| `src/hooks/useNow.js` | Shared 1-second ticker aligned to whole seconds (`useSyncExternalStore`) |
| `src/engine/geometry.js` | Pure fold math: crease = perpendicular bisector of corner→finger, half-plane clip, reflection matrix; `squirclePolygon` = iOS continuous-corner outline that every clip is cut from |
| `src/engine/peel.js` | `PeelStack` engine: gestures, clip-path, mirrored flap, curl shading, projected shadow, spring return, max-lift rubber band, `index` / `under` / `setIndex`, `destroy()`. **Tunable defaults are in `DEFAULTS` at the top** (including the swipe spring) |
| `src/engine/swipe.js` | `StackSwiper`: vertical swipe engine (slop 6px, gap 8px between cards, flick 220 px/s, rubber band, spring from `swipeResponse` / `swipeDamping`); clips the stack to the squircle while moving and shifts the battery card's fake-glass wallpaper so it stays aligned |
| `src/engine/tuner.js` | 调参 panel (imperative, mounted from App). Desktop ≥900px: right sidebar that pushes content aside (open by default, state remembered). Phone: bottom sheet that stops below the lowest widget row. Params apply to every stack; persisted in localStorage, keyed per variant; 复制参数 exports 14 keys; `destroy()` for unmount |
| `src/styles/style.css` | Layout, cards, glass rim, peel layers, tuner. Widget sizes/radius/material from Apple's HIG table and iOS 27 UI Kit, sources (OFFICIAL / MEASURED / INFERRED) in comments |
| `src/styles/widgets.css` | Each widget's look, in `--u` (design pt) units, with sources in comments |
| `public/` | `manifest.webmanifest`, `icons/` (copied as-is) |
| `tests/` | Playwright suites (see below); `tests/package.json` marks them CommonJS |
| `docs/TUTORIAL.md` | Beginner tutorial (Chinese), describes the **pre-React** version |

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
PORT=8780 node tests/verify-phone.js         # iPhone 393×852 touch: 96 checks (peel, swipe on every stack, corner-vs-swipe, peek = next card, panel)
PORT=8780 node tests/verify-desktop.js       # desktop sizes + sidebar + mouse swipe + phone sheet: 144 checks
PORT=8780 node tests/verify-gestures.js      # release matrix: 121 checks
```

- Playwright is installed globally (`npm root -g`); Chromium only; never run `playwright install`. Screenshots go to `$OUT` (default: `<tmpdir>/peel-shots/`). Look at them.
- The old desktop suite once failed 1 check in 7 runs (never captured). If a suite fails, rerun once. If it fails again, find the check and fix it; don't ignore it.
- `verify-gestures.js` is the CLAUDE-required release test: peel slow release, fast flick, pause-then-release, and re-grab mid-return, on all 4 corners of the Medium and one Small stack, with default and extreme tuning (returnDamping 0.35). The lifted area after release must never exceed the lifted area at release (guards the "whole card flashes out" bug from spring overshoot past the corner; `displayP()` prevents it). Swipe: slow 30% / 70%, short flick, pause-then-release, over-drag, re-grab mid-snap, up and down, default and swipeDamping 0.4. Run it for any change to release/spring/swipe behaviour.
- Also check dev mode (`npm run dev`) once after engine changes: StrictMode mounts effects twice, so engines and the tuner must clean up fully (one sheet, one set of layers per stack, one click toggles the sidebar).
- Time-dependent widgets: Playwright `page.clock.setFixedTime(...)` plus `timezoneId` give reproducible day/night screenshots.
- After pushing, verify the live URL yourself. Boxi's "it's broken" reports were twice caused by browser cache and once by a real bug.
- To open live URLs from a cloud session, Chromium needs the proxy CA in NSS: `apt-get install -y libnss3-tools && certutil -A -d sql:$HOME/.pki/nssdb -n ccr-agent-proxy -t "C,," -i /root/.ccr/agent-proxy-ca.crt`.

## Open threads

- The React rewrite, swipe switching and the five new widgets have not been tried on a real iPhone. Nor has version A or the wallpaper-band fix. Performance claims are unverified on device.
- Visual sources. Batteries and World Clock: Apple's iOS 27 UI Kit (Sketch share linked from developer.apple.com/design/resources, readable with Sketch's web Inspect; the Figma file "iOS and iPadOS 27" is readable only through the Figma connector, figma.com itself returns 403 from cloud sessions) plus Apple support-page images. Weather (medium/small), Calendar, Podcasts Up Next, Fitness and Notes: measured from Boxi's own iPhone screenshots (iOS 26/27, not in the repo; 810 px medium width = 349.67 pt). INFERRED: Small Batteries 2×2, Small Clock layout, Batteries medium percent size, the Weather night gradient, the page-dot style, the 8 px gap between cards while swiping, and Smart Stack wrap-around.
- Fonts: this Linux Chromium has no SF Pro / PingFang (falls back to DejaVu Sans + WenQuanYi Zen Hei), so screenshots look bolder and wider, and there's no light weight for the big temperatures. Vertical offsets were tuned against the reference in this environment, so on an iPhone text may sit ±1–2 pt off.
- The Batteries glass is a fake (wallpaper copy aligned by `App.jsx` and shifted by `swipe.js` while swiping), because cards must stay opaque.
- Hashed assets: an `index.html` cached before a deploy points to old asset names that the new deploy removed. Usually the old assets are cached along with it (unverified); if Boxi sees a blank page right after a deploy, reload.
