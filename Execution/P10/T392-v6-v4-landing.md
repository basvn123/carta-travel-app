# T392: visual and dynamic, the landing page and the first run (design wave V4)

## Task ID

T392 (design wave V4, session 2 of 10; surface key `landing`). Branch `p10-v6-visual-landing` in both repos.

## Date

2026-10-08

## What changed

The landing page now answers its inputs in place. When the party, the nights, the stay or the town changes, each figure that moved dims once and settles back. This is the house primitive `settleFigure()` from `src/lib/figureChange.js`, at `--dur-2`. It covers the two receipt lines, the total and the five figures in the priced list. Before, the whole list of lines was remounted on every total and faded in by a keyframe with a literal 0.2 s. That keyframe is gone, and so is the remount, so the screen reader's live region on the total is no longer torn down on each reprice. Under reduced motion the figure changes at once and nothing animates.

Both receipts now carry the shared cost bar above their lines. Both means the landing receipt and the first-run receipt on the destination and journey pages. It has one segment per line in receipt order, weighted by the line's euros, in the ink ramp.

On the landing the per-person line now reads "~ €182.61 a person a day". That figure is the title's promise: the total divided by the party and the nights. It replaces "~ €1,278.29 each", which was a seven-night share that appeared nowhere in the title.

Each of the three proof points now carries one live line of the receipt above it, drawn by the same component (rule R8):

| Proof point | Line it carries |
|---|---|
| "It names its source" | The stay line with its provenance |
| "It marks what is estimated" | The total with its tilde and "est.", or one sentence when the town has no estimate (Porto) |
| "It stays the same on every screen" | The food line |

The coverage table's rows each carry a thin bar under "Regions with none": regions with rows against the regions where the layer applies (rule R4).

The type is on the scale. The receipt head is 15 px. The landing's section headings are 22 px on a phone and 26 px from 769 px. Fraunces is measured at 15, 22 and 28 px on a phone and 15, 26 and 40 px on desktop.

Two fold levers have a written rule behind them:

- The running instrument line moved under the primary (DIRECTION.md part 6 gives that order).
- Below 769 px the "Price a stay in" label is read by screen readers only (DIRECTION.md part 7: shorten what sits above the primary).

Together they pay for the cost bar on a phone.

The strip cells now have a `--paper-dim` hover under `(hover: hover)` and a focus ring around the whole cell.

The hero keeps a still, receipt-shaped `--paper-dim` block while no demo town can be priced, so the primary does not move when the figures arrive.

FirstRunReceipt gained two additive props for the trips surface (register row T387-c):

- `hideStay` drops the Stay cell.
- `seedMonth` moves Carta's default dates into a given month while the visitor has not chosen dates. The rule is `seededWindow()` in `src/lib/firstRun.js`.

No page passes them yet; trips does that in its V4 session.

`verify_landing.mjs` passes 45 of 45, up from 31.

## Files touched

**Modified (app repo, `continent-app/`):**

- src/browse/LandingPage.jsx
- src/components/ReceiptCard.jsx. Exports ReceiptLine, ReceiptSum and useSettleChanged, and draws the cost bar.
- src/components/FirstRunReceipt.jsx. Passes `bar`, and adds the `hideStay` and `seedMonth` props.
- src/lib/firstRun.js (seededWindow)
- src/styles/38-first-run.css. The keyframe was removed and the receipt head set to 15 px.
- src/styles/39-landing.css. Covers the h2 scale, the town transition easing, the measure, and the old select focus rule (replaced in the v6 file).
- src/styles/61-v6-landing.css. Covers the bar, the specimens, the coverage bars, the still block, the strip states, the no-stay strip and the phone label.
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js. Two keys each: `landing.eachDay` and `landing.specNoEst`.
- scripts/verify_landing.mjs. Adds 13 checks, an INFO line, and a scope change (see What broke).

**Created (root repo):**

- docs/design-v6/plans/V4-landing.md. This is the critique and the plan, committed before the first app edit (a373ffd14).
- Execution/P10/T392-v6-v4-landing.md, this report.

**Modified (root repo):**

- Execution/_OPEN.md

**Deleted:** none.

## Commands run

Planning, from the root worktree:

    sh "C:/Users/Gebruiker/Documents/Portfolio/Travel App/.claude/skills/impeccable/scripts/impeccable" context --target ../T392-app/src/browse/LandingPage.jsx

The critique ran as two isolated subagents. One did the design review from the source and the V3 shots. The other ran the detector CLI plus the detect.js overlay through `impeccable live-server` on port 8400, which it stopped afterwards.

The shared `node_modules` carries playwright 1.61.1, whose browser builds (chromium 1228, webkit 2311) are not installed. Every Playwright run here therefore went through a scratch preload that points the launcher at the installed chromium-1243 and webkit-2359, from `wt/_scratch/T392/`. Nothing was installed.

In the app worktree:

    node node_modules/vite/bin/vite.js --port 5202 --strictPort --host 127.0.0.1
    node --import file:///.../_scratch/T392/patch.mjs scripts/verify_landing.mjs --port=5202   # 45 of 45 (dev server and preview)
    node --test --test-concurrency=1 "tests/*.test.mjs"                                     # 367 of 367
    node node_modules/eslint/bin/eslint.js src                                              # 0 errors, 61 warnings
    node scripts/ci/design-lint.mjs                                                         # 194 of 194 in the baseline, 0 new
    node scripts/check_ownership.mjs ../T392/docs/design-v6/OWNERSHIP.md                    # OK
    for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
    sh ".../impeccable" detect --json <the seven changed src files>                         # []
    node node_modules/vite/bin/vite.js build                                                # built in 5 m 10 s
    node node_modules/vite/bin/vite.js preview --port 5202 --strictPort --host 127.0.0.1
    node --import ... scripts/verify_keyboard.mjs --port 5202 --out <scratch>               # 18 of 20 (journey, trips' file)
    node --import ... scripts/verify_quality_floor.mjs t392 --port=5202 --only=pages --out=<scratch>
    node --import ... scripts/verify_trip_landing.mjs http://127.0.0.1:5202/                # fails at the planner calendar (T382-g)
    rm -rf dist dist-data

`npm run build` was not used, because its `prebuild` rewrites `public/` from root data that the sparse worktree does not hold; `vite build` builds the same bundle. `verify_receipt` was not run: it starts its own preview on port 4191 through `npx`, and it is blocked on tripplanner screens (T382-g). `verify_prerender` was not run: it needs a `build:pages` prerender build, and nothing here touches the prerender (T209-c stays V5). The Vite dev server, the preview and every browser were stopped, and `dist/` and `dist-data/` were deleted.

## Config and secrets set

None.

## Before/after measurements

"Before" is this branch's base (app master e2d9e1e) on the dev server. "After" is this branch. Positions are `getBoundingClientRect` on a cold first visit with the default inputs (Edinburgh, 2 people, 7 nights, entire place).

| Metric | Before | After | Delta |
|---|---|---|---|
| verify_landing checks | 31 of 31 | 45 of 45 | +14 checks (the fold check still passes, 709 against 714) |
| Receipt keyframes and literal durations on the surface | 1 keyframe, 0.2 s literal | 0 | -1 |
| Figures that settle on a reprice (landing) | 2 lines and the total, by remount | 2 lines, the total, 5 list figures, by settleFigure | +5 |
| Animations under reduced motion on a reprice | the keyframe (killed by the global floor) | 0 (checked) | 0 |
| Cost bar on the receipts | none | both receipts, segments equal to the lines within 0.0 px | +1 drawing |
| Proof points with a live specimen | 0 of 3 | 3 of 3 | +3 |
| Coverage rows with a bar | 0 of 5 | 5 of 5, 0.0 px off | +5 |
| Fraunces sizes on the page, phone | 22, 26, 28 | 15, 22, 28 | the 26 px phone h2 and the 22 px receipt head are retired |
| Per-person figure on the landing receipt | 7-night share ("€1,278.29 each") | per person per day ("€182.61 a person a day") | matches the title |
| Phone 380 x 800: primary bottom / nav top | 707 / 714 | 709 / 714 | +2 px, still above |
| iPhone 13 (390 x 664 visible): sum bottom / primary bottom / nav top | 619 / 707 / 578 | 621 / 709 / 578 | +2 px, total still under the nav |
| Pixel 5 (393 x 727): sum bottom / nav top | 619 / 641 | 621 / 641 | total still visible |
| 360 x 740: sum bottom / nav top | 631 / 654 | 634 / 654 | total still visible |
| Desktop 1280 x 800: primary / sum bottom | 222 to 266 / 648 | 192 to 236 / 695 | primary 30 px higher, sum still in view |
| Instrument line measure, desktop | about 91 characters (detector) | 36em cap | inside 65 to 75 |
| impeccable detect, changed files | 0 | 0 | 0 |
| Design lint new violations | 0 | 0 | 0 |
| Lint errors / warnings | 0 / 61 | 0 / 61 | 0 |
| i18n keys added per catalogue | | 2 | +2 |

Phone checks on the device descriptors (T414):

| Check | Result |
|---|---|
| Horizontal scroll | 0 on every device |
| Landscape (iPhone 13, 750 x 342 visible) | Nav top at 256, so only the title, the towns and the strip fit; the receipt starts at 228 under the nav (as before, T382-c) |
| Tap only | Every hover rule written here sits in `@media (hover: hover)`; the cost bar's segments are taps |
| On-screen keyboard | The landing has no text field, only three selects. With each focused at 393 x 436 (60 percent of the height), the select sits at 212 to 244 and the nav top at 350 |
| Safe areas | The wrap keeps `env(safe-area-inset-bottom)`; the bars are the shell's |
| Height | The page is a scroller between the top bar and the nav, not a `100vh` layout |
| Thumb reach | The primary sits at 665 to 709 on the tall phones, in the lower half |
| Tap targets | Every new control is at least 44 px (the cost bar's segments are 44 px high). The three landing selects are still 32 px inside 44 px cells (T382-d, V5) |
| Swipe | No swipe on the surface |

The quality floor on the pages flow counts 11 phone targets under 44 px:

- 8 are the first-run strip's selects and date inputs (unchanged, T382-d and T385-h).
- 2 are a 39 px wide cost bar segment on the journey page. Trips' data gives Transport a narrow share; the component is the shell's.
- 1 is Change on the destination's cost fold (explore).

Its one contrast failure is the destination's tips summary (T385-h). Its serif check passes with the 15 px receipt head.

After screenshots (JPEG, quality 80, viewport only) are in `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\landing\`. There are nine: `V4-home-iphone.jpg`, `V4-home-android.jpg`, `V4-home360-android.jpg`, `V4-home-desktop.jpg`, `V4-landscape-iphone.jpg`, `V4-list-android.jpg`, `V4-firstresult-iphone.jpg`, `V4-firstresult-desktop.jpg` and `V4-proof-desktop.jpg`. The first eight use the V3 view names; the proof shot is new.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The cost bar sat in a grey 44 px band on the white card | CostBar's track paints `--paper` behind its 44 px hit buttons, which reads as a box on `--bg-card` | `.frr-bar .costbar-track { background: transparent }` in the v6 file; the 1 px gaps then show the card |
| The fold check failed after the bar went in (primary bottom 717 against 714) | The bar and its hint line cost about 62 px on a phone | Tighter padding above the bar and no gap above its hint, on phone only (709) |
| verify_landing's sum check would read the proof specimens | The specimens carry receipt lines inside `.lp-page` | The receipt is read from `.lp-receipt` (comment in the harness) |
| The bar order check failed | Segment labels contain a comma ("Stay, 7 nights"), and the check split on it | Compare with `startsWith(label + ", ")` |
| The reduced-motion pass timed out on its second page | A second visit opens Destinations, not the landing | A fresh context for the iPhone INFO measurement |
| design lint flagged `outline: none` on the strip select | The cell now carries the ring | The select's own ring is drawn transparent (still visible in forced colours) |
| `react-refresh/only-export-components` warning on ReceiptCard | The settle hook is exported beside the components | A disable comment with the reason; the warning count stays 61 |

The `seedMonth` rule was first written as a unit test in `tests/firstRun.test.mjs`. That test was moved into `verify_landing.mjs` as the "logic seedMonth" check, because the session's scope lists harnesses, not `tests/`.

## What is still open

**Rule R3 (V4-5), the receipt carrying into the destination page.** This is not built. `openShared()` in `src/lib/sharedElement.js` only names an `img`, and that file is the shell's. Once it accepts a named element, `LandingPage.jsx` names its card and `FirstRunReceipt.jsx` claims it with `claimShared()`. Both of those are this surface's files (T392-a).

**The iPhone 13 fold.** It is still not met in the visible viewport. The total ends at 621 against a nav top of 578, and the primary at 709. The two levers with a rule paid for the cost bar and no more. What remains needs a direction call or the shell:

- the cost bar's hint line and 44 px hit row on a phone (about 62 px);
- the receipt head's "Open {city}" row (44 px);
- the 86 px bottom nav.

This is T392-b; T382-b stays open with it.

**The brief's "total beside the Explore figure" for the third proof point.** This is not built, because the two figures disagree on screen. Explore prints whole euros, and its bed is a base nightly rate: Edinburgh shows €72.75 a person a night in the cost index against €120.67 a person a night on a seven-night receipt with season and fees. The specimen shows the food line instead, the one figure that is the same on both (57.76, 61.61 and 38.63 for the three demo towns at three parties, checked with `computeCosts` against `priceReceipt`). "No two screens disagree" holds for food but not for the bed (T392-c, related to T374-d).

**The trip page and the new props.** It does not use `hideStay` and `seedMonth` yet; trips passes them in T397. T387-c stays open for that.

**verify_keyboard.** It is 18 of 20. The two failures are the journey page's length control (`button.tl-btn "4 days"`, no focus ring), which is the trips surface's (T392-d).

**Smaller items:**

- Fraunces renders visibly heavier in WebKit than on Chromium; this is a font-face or synthesis check for the shell (T392-e).
- The two new strings need a native read (T392-f).
- A real phone has to prove the settle dip's feel, the bar's tap and VoiceOver on the live total (T392-g).

**Register rows read and left as they are:**

| Row | Why it stays |
|---|---|
| T382-i | Whether a length chosen on the landing counts as chosen dates is a product call, and the flag would live in the shell's date state |
| T381-g and T382-c | The raised plus and the nav height are the shell's |
| T382-d | Tap targets are V5-1 |
| T209-c | The prerender is V5-6 |
| T382-a | Links wait for destination URLs |

None of them was closed.

**Impeccable's interview and decision steps were not run.** The owner told every session to proceed without asking (2026-10-07). These are the calls that impeccable would have asked about, each keeping Carta's palette, type and identity:

- The landing's per-person line shows the per-person-per-day figure, not a seven-night share, because the title promises a day.
- The second proof specimen is the total rather than the first estimated line, because in Edinburgh the only estimated line is food, which the third specimen already shows.
- The coverage bar shows regions with rows against regions where the layer applies, the only count in the row that has a denominator.
- The cost bar is the shell's component used as it is (hint line included), not a slimmer copy.
- The instrument line moved under the primary at every width rather than only on a phone, so DOM order stays reading order.

**carta-design's seven questions, answered on the diff:**

1. Is there any hex outside `:root`? No. The new rules use tokens only.
2. Is there any gradient, any colour outside DESIGN.md, or a second saturated hue? No. The bar and the coverage bars are the ink ramp (`--kind-*` through CostBar, `--ink-soft` and `--rule`), and the only accent is the focus ring.
3. Is ochre, teal or `--danger` used? None of them is used.
4. Does mono carry figures only? Yes: the receipt figures, the arithmetic row and the list figures. The new per-day line, "~ €182.61 a person a day", sits in the sum cell in mono, as the "each" line did before. The labels and the specimen sentence are `--ui`.
5. Is there one primary per view? Yes, and the harness and the quality floor both count one.
6. Do the headings carry a verb or a number, and is the diff free of em dashes, middots and banned words? No heading was added; the new strings carry no dash, no middot and no banned word (grepped).
7. What was removed? The reprice keyframe and the remount, the receipt head's 22 px, the phone's visible towns label, and the old select focus rule, which is now the cell's.

**Register rows raised:** T392-a to T392-g. **Closed by this task:** none.

## Rollback procedure

Before the merge, deleting the branch `p10-v6-visual-landing` in both repos undoes everything.

After the merge:

- App repo: `git -C continent-app revert 121c1ec`, or the merge commit. Nothing outside this surface reads `ReceiptLine`, `ReceiptSum`, `useSettleChanged`, `seededWindow`, `hideStay` or `seedMonth` yet. Reverting removes the cost bar from the destination and journey receipts too, which is the intended state before this task.
- Root repo: revert the plan commit a373ffd14 and the report commit (this file and its seven register rows).

No data, migration or deploy is involved.
