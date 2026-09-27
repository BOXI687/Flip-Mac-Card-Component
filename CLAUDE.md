# Flip-Mac-Card-Component

Owner: Boxi (BOXI687). Before anything else, use the `boxi-collab` skill and read Boxi's profile + lessons from the private repo BOXI687/claude-profile. Boxi has zero coding background: confirm before any change, explain in Chinese with English terms.

## What this is

A web prototype of an iOS home-screen widget stack (battery widget on top of a world-clock widget). Dragging any corner peels the top card back like paper to **peek** at the widget below; releasing always springs back. It must never swap the cards (Boxi decided peek-only). Real WidgetKit widgets can't do drag gestures, which is why this is a web page that Boxi adds to his iPhone home screen.

Zero dependencies, no build step, classic `<script>` tags (not modules), so double-clicking `index.html` works. Keep it that way unless Boxi agrees to a change (React is the planned next step once there are 3+ components).

## Files

| File | Role |
| --- | --- |
| `js/geometry.js` | Pure fold math: crease = perpendicular bisector of corner→finger, half-plane clip, reflection matrix |
| `js/peel.js` | `PeelStack`: gestures, clip-path, mirrored flap, curl shading, projected shadow, spring return, max-lift rubber band. **Tunable defaults are in `DEFAULTS` at the top** |
| `js/tuner.js` | 调参 panel. Desktop ≥900px: right sidebar that pushes content aside (open by default, state remembered). Phone: bottom sheet that stops below the card. Params persisted in localStorage, keyed per variant |
| `js/widgets.js` | Battery rings (SVG dasharray) and world clocks (Intl time zones) |
| `js/main.js` | Wiring; data (`DEVICES`, `CITIES`); version tag from `<html data-variant-label>` |
| `css/style.css` | All styles |
| `tests/` | Playwright suites (see below) |
| `docs/TUTORIAL.md` | Beginner tutorial (Chinese) |

## Branches and deploy

- `claude/github-cleanup-ux-prototype-541sop` = main line, published at https://boxi687.github.io/Flip-Mac-Card-Component/ (it is the repo's default branch).
- `version-a-opus` → `/a/`, `version-b-emil` → `/b/`. These are A/B variants. Boxi chose A, and A is merged into the main line; B is kept for reference.
- `.github/workflows/pages.yml` builds all three branches into one Pages site and adds `?v=<commit>` to every CSS/JS link to defeat the 10-minute browser cache. Pushes to variant branches trigger it via `variant-push.yml` → `workflow_run`, because Pages only accepts deploys from the default branch.
- On a variant branch, `index.html` has `data-variant` and `data-variant-label`, and the app title and manifest `short_name` are changed. When merging a variant into the main line, reset those to empty / `Peel` / `Peel Widget Stack`.
- Don't commit `.claude/worktrees/` (background-agent checkouts). Add it to `.git/info/exclude`.

## Verifying changes

```bash
python3 -m http.server 8780 &          # from repo root
node tests/verify-phone.js             # iPhone 393×852 touch: 46 checks
node tests/verify-desktop.js           # desktop sizes + sidebar + phone sheet: 127 checks
```

- Playwright is installed globally (`npm root -g`); Chromium only; never run `playwright install`. Screenshots go to `$OUT` (default: `<tmpdir>/peel-shots/`). Look at them.
- The desktop suite failed 1 of 127 checks once in 7 runs, and the failing check wasn't captured. If it fails, rerun once. If it fails again, find the check and fix it; don't ignore it.
- For any change to release/spring behaviour, also test: slow release, fast flick, pause-then-release, and re-grab mid-return, on all 4 corners, with default and extreme tuning (returnDamping 0.35). The lifted area after release must never exceed the lifted area at release. This guards against the "whole card flashes out" bug, which comes from spring overshoot past the corner; `displayP()` prevents it.
- After pushing, verify the live URL yourself. Boxi's "it's broken" reports were twice caused by browser cache and once by a real bug.
- To open live URLs from a cloud session, Chromium needs the proxy CA in NSS: `apt-get install -y libnss3-tools && certutil -A -d sql:$HOME/.pki/nssdb -n ccr-agent-proxy -t "C,," -i /root/.ccr/agent-proxy-ca.crt`.

## Open threads

- Boxi feels the widgets still differ from native iOS, mostly in the visuals (continuous corners, type sizes, materials, shadows). Plan: compare against Apple's official iOS UI Kit (Figma / Sketch). The emil `apple-design` skill covers motion, not visual specs.
- Boxi hasn't tested on a real iPhone since version A. Performance claims are unverified there.
