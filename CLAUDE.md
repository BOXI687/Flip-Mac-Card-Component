# Flip-Mac-Card-Component

Owner: Boxi (BOXI687). Before anything else, use the `boxi-collab` skill and read Boxi's profile, learning map and lessons from the private repo BOXI687/claude-profile. Boxi has zero coding background: confirm before any change (「直接改」 counts as confirmation), explain in Chinese with English terms. Refer to Boxi by name; no pronouns have been stated.

## What this is

A web prototype of iOS home-screen widget stacks laid out like a home screen: one Medium stack (battery widget on top of a world-clock widget) and below it two Small stacks (battery over clock, clock over battery). Each stack is an independent `PeelStack`. Dragging any corner peels the top card back like paper to **peek** at the widget below; releasing always springs back. It must never swap the cards (Boxi decided peek-only). Real WidgetKit widgets can't do drag gestures, which is why this is a web page that Boxi adds to an iPhone home screen.

Zero dependencies, no build step, classic `<script>` tags (not modules), so double-clicking `index.html` works. Keep it that way unless Boxi agrees to a change. Claude has suggested React once there are 3+ components; Boxi hasn't decided, and tech choice is a learning decision to ask Boxi about.

## Files

| File | Role |
| --- | --- |
| `js/geometry.js` | Pure fold math: crease = perpendicular bisector of corner→finger, half-plane clip, reflection matrix; `squirclePolygon` = iOS continuous-corner outline that every clip is cut from |
| `js/peel.js` | `PeelStack`: gestures, clip-path, mirrored flap, curl shading, projected shadow, spring return, max-lift rubber band. **Tunable defaults are in `DEFAULTS` at the top** |
| `js/tuner.js` | 调参 panel. Desktop ≥900px: right sidebar that pushes content aside (open by default, state remembered). Phone: bottom sheet that stops below the lowest widget row. Params apply to every stack; persisted in localStorage, keyed per variant |
| `js/widgets.js` | Battery rings (SVG dasharray) and world clocks (Intl time zones), Medium and Small layouts |
| `js/main.js` | Wiring; data (`DEVICES`, `CITIES`); version tag from `<html data-variant-label>` |
| `css/style.css` | All styles. Widget sizes/radius/material come from Apple's HIG table and iOS 27 UI Kit; each value's source (OFFICIAL / MEASURED / INFERRED) is in the comments at the top and next to the value |
| `tests/` | Playwright suites (see below) |
| `docs/TUTORIAL.md` | Beginner tutorial (Chinese) |

## Branches and deploy

- `claude/github-cleanup-ux-prototype-541sop` = main line, published at https://boxi687.github.io/Flip-Mac-Card-Component/ (it is the repo's default branch).
- `version-a-opus` → `/a/`, `version-b-emil` → `/b/`. These are A/B variants. Boxi chose A, and A is merged into the main line; B is kept for reference.
- `.github/workflows/pages.yml` builds all three branches into one Pages site and adds `?v=<commit>` to every CSS/JS link to defeat the 10-minute browser cache. Pushes to variant branches trigger it via `variant-push.yml` → `workflow_run`, so every deploy runs from the default branch. That was a precaution: the `github-pages` environment usually only allows the default branch, but this repo's policy couldn't be checked (that API path is blocked from the cloud proxy).
- On a variant branch, `index.html` has `data-variant` and `data-variant-label`, and the app title and manifest `short_name` are changed. When merging a variant into the main line, reset those to empty / `Peel` / `Peel Widget Stack`.
- Everything in these branches is published to the public site, including this file and `tests/`. Never commit secrets or anything from Boxi's employer.
- Don't commit `.claude/worktrees/` (background-agent checkouts). Add it to `.git/info/exclude`.

## Verifying changes

```bash
python3 -m http.server 8780 &          # from repo root
node tests/verify-phone.js             # iPhone 393×852 touch: 57 checks
node tests/verify-desktop.js           # desktop sizes + sidebar + phone sheet: 130 checks
```

- Playwright is installed globally (`npm root -g`); Chromium only; never run `playwright install`. Screenshots go to `$OUT` (default: `<tmpdir>/peel-shots/`). Look at them.
- The desktop suite (then 127 checks) failed 1 check once in 7 runs, and the failing check wasn't captured. If it fails, rerun once. If it fails again, find the check and fix it; don't ignore it.
- For any change to release/spring behaviour, also test: slow release, fast flick, pause-then-release, and re-grab mid-return, on all 4 corners, with default and extreme tuning (returnDamping 0.35). The lifted area after release must never exceed the lifted area at release. This guards against the "whole card flashes out" bug, which comes from spring overshoot past the corner; `displayP()` prevents it.
- After pushing, verify the live URL yourself. Boxi's "it's broken" reports were twice caused by browser cache and once by a real bug.
- To open live URLs from a cloud session, Chromium needs the proxy CA in NSS: `apt-get install -y libnss3-tools && certutil -A -d sql:$HOME/.pki/nssdb -n ccr-agent-proxy -t "C,," -i /root/.ccr/agent-proxy-ca.crt`.

## Open threads

- Widget visuals were matched to Apple's iOS 27 UI Kit (Sketch share linked from developer.apple.com/design/resources, readable with Sketch's web Inspect; the Figma file "iOS and iPadOS 27" is readable only through the Figma connector, figma.com itself returns 403 from cloud sessions) plus measurements from Apple support-page images. Still INFERRED (no Apple image found): Small Batteries with 4 devices as 2×2 rings, Small Clock city layout, Batteries medium percent size. The Batteries glass is a fake (wallpaper copy aligned by `main.js`), because cards must stay opaque.
- In this Linux Chromium, SF Pro isn't installed, so screenshots use a fallback font; type looks wider/bolder than on an iPhone.
- Not yet confirmed that version A (or the wallpaper-band fix) was checked on a real iPhone. Performance claims are unverified on device.
