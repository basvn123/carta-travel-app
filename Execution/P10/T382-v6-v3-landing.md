# T382: structure, information and flow, the landing page and the first run (design wave V3)

## Task ID

T382 (design wave V3, session 2 of 10; surface key `landing`). Branch `p10-v6-build-landing` in both repos.

## Date

2026-10-08

## What changed

The landing page now prices the same trip the rest of the app prices. Its three inputs (people, nights, stay) read and write the app's shared choices through `FirstRunContext`, the way the first-run receipt already did, so a visitor who sets one person in a dorm bed in Porto and presses "Open Porto" finds the destination page's receipt at one person, a dorm bed and the same total to the cent (harness: 422.25 on both pages). The receipt card is now one component, `src/components/ReceiptCard.jsx`, drawn by the landing page and by the first-run receipt on the destination and trip pages, so the two cannot drift again: both show the visible "est." tag, the per-person line keeps its tilde under an estimated total (register row T371-b), the strip labels are `--ui` on both strips, and the landing's own card rules (the `.lp-receipt` family, about 110 lines of `39-landing.css`) are gone. The first-run orientation sentence is chosen by what the receipt measured (`receiptMix`: all, bed, food, none) instead of always saying "own rates"; a stay tier the town does not measure says "not measured here" in both stay selects (`tierMeasured`); both receipts print one flight sentence and one exclusions sentence. On the landing page the order is now the order a first visitor needs it: the claim, one instrument line read from the catalogue (measured beds 1,000 of 3,868, food 381, the catalogue's date), the three demo towns each with a metadata line read from its own receipt ("Bed measured", "National figures", "All measured", rule R7), the strip, the receipt with "Open {city}" in its head, then the one primary directly under the receipt, then the dates note and the two shared sentences, then a priced list of the five cheapest towns to walk from (rule R1), read from the same cost index as the Explore cards. From 900 px the claim spans the top and the receipt and the side column (primary, notes, list) sit beside each other, so DOM order equals reading order at every width. A harness for the surface, `scripts/verify_landing.mjs`, passes 31 of 31 checks at 380 x 800 and 1280 x 800.

## Files touched

**Modified (app repo, `continent-app/`):**
- src/browse/LandingPage.jsx
- src/components/FirstRunReceipt.jsx
- src/lib/firstRun.js (receiptMix, tierMeasured)
- src/lib/landing.js (receiptOpts, cheapestToWalk, catalogueFacts.asOf)
- src/styles/38-first-run.css
- src/styles/39-landing.css
- src/styles/61-v6-landing.css
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js
- tests/firstRun.test.mjs, tests/landing.test.mjs

**Created (app repo):**
- src/components/ReceiptCard.jsx
- scripts/verify_landing.mjs

**Modified (root repo):**
- docs/design-v6/OWNERSHIP.md (one row: ReceiptCard.jsx to landing; the landing table now 9 files)
- Execution/_OPEN.md

**Created (root repo):**
- docs/design-v6/plans/V3-landing.md (the plan, committed before the first app edit)
- Execution/P10/T382-v6-v3-landing.md (this report)

**Deleted:** none. i18n keys retired in all six catalogues: `landing.lede`, `landing.orient`, `landing.noFlight`, `landing.notIn`, `receipt.orientDefault` (grep finds none of them in `src/` or `scripts/`). Keys added in all six: `landing.instrument`, `landing.instrumentNoDate`, `landing.datesPicked`, `landing.walkTitle`, `landing.walkSub`, `landing.walkNational`, `receipt.orientAll`, `receipt.orientBed`, `receipt.orientFood`, `receipt.orientNone`, `receipt.mixAll`, `receipt.mixBed`, `receipt.mixFood`, `receipt.mixNone`, `receipt.tierNotHere`, `receipt.flightNone`.

## Commands run

Planning step, from the root worktree:

    sh "C:/Users/Gebruiker/Documents/Portfolio/Travel App/.claude/skills/impeccable/scripts/impeccable" context --target ../T382-app/src/browse/LandingPage.jsx

The shared `node_modules` in the main checkout was broken when this session began building (see What broke), so the app worktree's `node_modules` junction was pointed at a private install, outside both repos:

    cd wt/_scratch/T382/deps; cp <app>/package.json <app>/package-lock.json .; npm ci --prefer-offline --no-audit --no-fund --ignore-scripts
    npm i --no-save --no-audit --no-fund --ignore-scripts --prefer-offline playwright@1.63.0 playwright-core@1.63.0
    New-Item -ItemType Junction -Path wt/T382-app/node_modules -Target wt/_scratch/T382/deps/node_modules

Checks, in the app worktree (`node node_modules/...` because the private install is reached through the junction):

    node --test --test-concurrency=1 "tests/*.test.mjs"                  # 345 of 345
    node node_modules/eslint/bin/eslint.js src                           # 0 errors, 70 warnings, none in a T382 file
    node scripts/ci/design-lint.mjs                                      # 213 of 213 in the baseline, 0 new
    node scripts/check_ownership.mjs ../T382/docs/design-v6/OWNERSHIP.md # OK
    for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
    node node_modules/vite/bin/vite.js --port 5202 --strictPort --host 127.0.0.1   # dev server for the harness and the shots
    node scripts/verify_landing.mjs --port=5202                          # 31 of 31
    node node_modules/vite/bin/vite.js build                             # built in 2 m 9 s
    node node_modules/vite/bin/vite.js preview --port 5202 --strictPort --host 127.0.0.1
    node scripts/verify_keyboard.mjs --port 5202 --out <scratch>         # 20 of 20
    node scripts/verify_quality_floor.mjs t382 --port=5202 --only=pages --out=<scratch>
    node scripts/verify_trip_landing.mjs http://127.0.0.1:5202/          # fails, tripplanner (T382-g)
    node scripts/verify_receipt.mjs                                      # blocked, tripplanner (T382-g)
    sh ".../impeccable" detect --json <the eight changed src files>      # []
    rm -rf dist dist-data shots

`npm run build` was not used because its `prebuild` hook runs `sync-data.mjs`, which rewrites `public/` from the root `app_data/` that the sparse root worktree does not hold; `vite build` directly builds the same bundle. Every server started here was stopped; `dist/` and `dist-data/` were deleted.

## Config and secrets set

None. The app worktree's `node_modules` junction now points at `wt/_scratch/T382/deps/node_modules` instead of the main checkout's; it is gitignored and disappears with the worktree.

## Before/after measurements

Before is the V1 walk in `docs/design-v6/briefs/landing.md` (main checkout, app commit 3b3e5a8, 380 x 800 and 1280 x 800); after is this branch on the dev server at the same sizes, measured with `getBoundingClientRect`.

| Metric | Before | After | Delta |
|---|---|---|---|
| Phone 380 x 800: top of the one primary | 973 px (below the fold) | 663 px (bottom 707, nav top 714) | 310 px higher, above the nav |
| Phone 380 x 800: bottom of the receipt's footer line | 726 px (under the nav) | 654 px | 72 px higher, above the nav |
| Desktop 1280 x 800: top of the primary | 343 px | 222 px | 121 px higher |
| Desktop: empty band in a column, first viewport | the left column empty from about 400 px down | none over 20 px (left column ends at 692, right at 708) | gone |
| Desktop focus order vs reading order | primary after the demo but drawn above it | DOM order equals reading order | fixed |
| Inputs that carry to the destination page | 0 of 3 | 3 of 3 (people, stay, nights), total equal to the cent | +3 |
| Receipt card implementations | 2 (landing markup, first-run markup) | 1 (ReceiptCard) | -1 |
| Visible "est." on the landing receipt | no | yes | fixed |
| Per-person figure without its tilde under an estimate | first-run receipt | none | fixed |
| Stay tiers offered silently where not measured (Chamonix) | 5 of 6 | 0 (each says "not measured here") | fixed |
| Flight sentences / exclusion sentences across the two receipts | 2 / 2 | 1 / 1 | merged |
| Notes between the receipt and the primary (phone) | 3 | 0 (they follow the primary) | -3 |
| Landing controls | 3 towns, 3 selects, Open {city}, primary, 1 link | the same, plus 5 priced list rows | +5 |
| Harness checks for this surface | 0 | 31 (verify_landing, 31 of 31) | +31 |
| Unit tests in landing, firstRun and homeVisit | 25 | 29 | +4 |
| impeccable detect findings on the changed files | 0 | 0 | 0 |
| Design lint | 213 of 213 baseline, 0 new | 213 of 213, 0 new | 0 |
| verify_keyboard | 20 of 20 | 20 of 20 | 0 |

Phone checks on the device descriptors (T414), from a scratch Playwright script outside both repos:

| Device | Viewport | Horizontal scroll | Total visible without scrolling | Primary visible without scrolling |
|---|---|---|---|---|
| iPhone 13, WebKit | 390 x 664 visible | 0 | no: the sum row ends at 619, the nav starts at 578 | no (bottom 707) |
| Pixel 5, Chromium | 393 x 727 visible | 0 | yes (sum row ends 619, nav 641) | no (bottom 707) |
| Small Android, Chromium | 360 x 740 | 0 | yes (ends 631, nav 654) | no (bottom 719) |
| 380 x 800 (the brief's measure) | 380 x 800 | 0 | yes | yes (707 against 714) |
| iPhone 13 landscape, WebKit | 750 x 342 visible | 0 | no: 199 px of content between the top bar and the 86 px nav | no |
| Desktop, Chromium | 1280 x 800 | 0 | yes | yes |

The other phone checks. Tap only: nothing on the surface depends on hover; the two `:hover` rules T382 wrote or touched sit inside `@media (hover: hover)`. Keyboard: the landing has no text input, only three selects; with each focused and the viewport 40 percent shorter (360 x 444) the select stayed visible (288 to 320 px) and the nav top (358 px) did not ride over it. Safe areas: the page keeps the existing `env(safe-area-inset-bottom)` in its wrap padding; the bars are the shell's. Height: the landing is an absolutely positioned scroller between the top bar and the nav, not a `100vh` layout. Thumb reach: at 380 x 800 the primary sits at 663 to 707 px, in the lower half. Tap targets: every button on the surface is at least 44 px; the three strip selects are 32 px inside 44 px cells (register row T382-d). No swipe exists on the surface. What only a real phone can prove is listed in register row T382-f.

After screenshots (JPEG, quality 80, viewport only) in `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\landing\`: `V3-home-iphone.jpg`, `V3-home-android.jpg`, `V3-home360-android.jpg`, `V3-home-desktop.jpg`, `V3-list-android.jpg`, `V3-firstresult-iphone.jpg`, `V3-firstresult-desktop.jpg`, `V3-landscape-iphone.jpg` (eight). The V1 "before" set uses the 380 and 1280 names; this wave adds the device names the T414 rule asks for.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `npx eslint` and `vite` would not start ("Cannot find native binding", "Cannot find module '@eslint-community/eslint-utils'") | The main checkout's shared `node_modules` lost its `.bin`, every `@eslint` and `@babel` package and the `package.json` of rolldown's binding at about 04:20 on 2026-10-08, while other sessions were running; files held open by running servers survived, the rest went | Private `npm ci` in `wt/_scratch/T382/deps` and the worktree's junction pointed there (T381 and T384 did the same); the shared install is left alone (rule 4) and raised as T382-h |
| Playwright could not launch Chromium from the private install | The lock pins playwright 1.61.1, whose browser build 1228 is not in the Playwright cache (1217 and 1243 are) | `playwright@1.63.0 --no-save` in the private install only; package.json and the lock are untouched |
| The i18n catalogues showed every line changed after the first edit | The script read the CRLF files in text mode and wrote LF | Line endings restored to match each HEAD blob (the catalogues and the CSS are CRLF in the index); the diff is now 21 lines per catalogue |
| The landing receipt's figures rendered in the sans | `.frr .mono` was scoped to the first-run section, and the landing's card is not inside `.frr` | The rule also matches `.frr-card .mono` |
| At 380 x 800 the primary ended 102 px under the nav after the first pass | The receipt head held a three-line sub beside the button; the instrument line ran three lines | Head as a row (title and "Open {city}") over a one-line sub; a shorter instrument line; the arithmetic and its provenance words on one row; tighter phone rhythm inside the card (in 61-v6-landing.css only) |
| The "(Carta's dates)" sub wrapped once the sub was in mono | The parenthesis made the line too long for 12 px mono at 380 px | The sub is the plain `receipt.sub`; "The dates are Carta's" became the first note under the primary (`landing.datesPicked`) |
| A harness check "the list reprices after one person and a dorm" failed | The five cheapest towns to walk from are national figures with no measured dorm, so their day figures do not move with the stay | The check now asserts the list is still five or fewer, cheapest first, after the change (comment in the harness says why) |

## What is still open

Brief V3 item 13 (reconcile `docs/ONBOARDING_AND_EMPTY_STATES.md` with the home page) was not done: the session notes give this session only the landing files, and that root document is not one of them. Register row T194-d already carries it.

The priced list rows are buttons, because no destination page has a URL in `src/` yet; rule R1's "each a real link" waits for the shell's navigation rule (T382-a). The list ranks the catalogue's `hiking` category (200 places in the shipped catalogue) by the cost index's `dayEur`; the five that come up first are all national figures in the Western Balkans and Romania, each wearing its tilde, "est." and "national". The figures are printed to the cent (`eurExact`), while the Explore card prints the same `dayEur` rounded to whole euros (`eurDay` in `costIndex.js`): the same number, two precisions. Register row T380-b already asks the trips surface to stop rounding; Explore's own card is the explore surface's.

The phone fold is met at the brief's 380 x 800 but not in the visible viewport of the iPhone 13 descriptor (390 x 664, Safari's bars included), where the total ends 41 px under the nav and the primary 129 px. Getting there needs about 130 px more than this pass found without breaking a rule: the candidates are a compact receipt head on a phone (the town name and "Open {city}" take 44 px plus the sub), moving the instrument line under the primary on a phone (DOM order then differs from desktop unless the desktop composition changes too), and showing the towns label to screen readers only. Each is a direction call, so none was built (T382-b). The raised plus of the bottom nav also sits over the lower centre of the primary at 380 x 800 (T382-c, shell).

The strip controls stay under `--tap` on a coarse pointer and WebKit draws the landing selects as grey native boxes (T382-d, brief V5 item 1). `verify_trip_landing` and `verify_receipt` fail on tripplanner screens this task does not touch (T382-g). `verify_prerender` was not run: it needs a prerender build (`build:pages`), which the RAM on this laptop did not allow beside four other sessions, and nothing in this task touches the prerender. Changing the nights on the landing page moves the shared return date, and the destination page then treats the dates as the visitor's own and drops "Set your dates" (T382-i). The 16 new strings need a native read (T382-e), and a real phone has to prove the bar collapse, the native pickers and landscape (T382-f). The shared `node_modules` needs repair (T382-h).

Impeccable's interview and decision steps were not run: the owner told every session of this run to proceed without asking (2026-10-07). Where impeccable would have asked, these calls were taken, each keeping Carta's palette, type and identity: "Open {city}" sits in the receipt head rather than under the sum (it costs the fold nothing and stays inside the card it opens); the lede is replaced by the instrument line rather than stacked with it (prefer the figure to the claim); the orientation became a one-line dates note under the primary rather than a parenthesis in the mono sub line; the list heading is "Where a walking day costs least" (a verb, no number in Fraunces); "towns to walk from" means the catalogue's `hiking` category. Impeccable context resolved the app repo as the project root (the target lives in the app's own git tree) and found no PRODUCT.md or DESIGN.md there; both were read directly from the root worktree.

carta-design's seven questions, answered on the diff:

1. No hex value outside `:root`: the new and touched rules use tokens only.
2. No gradient, no colour outside DESIGN.md, no second saturated hue: the only accent is the existing primary and the focus ring; the list has no accent, badge or highlighted row.
3. Ochre, teal and `--danger` are not used anywhere in the diff.
4. Mono carries figures only: the receipt figures, the arithmetic row, the list's day figures and the existing date sub line. The strip labels moved from mono to `--ui`. The quality floor's INFO list still names the receipt's sub line ("7 Nov to 14 Nov 2026, 7 nights, 2 people") as prose in mono; it was mono before this task on both receipts and is a timetable line of dates and counts.
5. One primary per view: "Find a town to walk from" on the landing page, "Set your dates" on the first-run receipt; harness and quality floor both count one.
6. Every new heading carries a verb or a number ("Where a walking day costs least"; the receipt heads are place names, as before); no em dash, en dash, middot or banned word in the diff (grepped).
7. Removed: the lede (the instrument line says the same thing with figures), the landing's second receipt implementation, the orientation paragraph, the duplicate flight and exclusions sentences, and the tier word on the landing stay line where the strip already shows the tier.

Register rows raised: T382-a to T382-i. Closed by this task: T371-a (settled in DIRECTION.md part 9 before this build), T371-b, T371-c, T371-d and T209-a.

## Rollback procedure

App repo: `git -C continent-app revert <the T382 merge or commit aab6913>`; nothing else in the app depends on `ReceiptCard.jsx`, `receiptMix`, `tierMeasured`, `receiptOpts` or `cheapestToWalk`. Root repo: revert the T382 commits (the plan, the OWNERSHIP.md row, and this report with its register rows); reverting the OWNERSHIP.md row together with the app commit keeps `check_ownership.mjs` passing. No data, migration or deploy is involved. Before the merge, deleting the branch `p10-v6-build-landing` in both repos undoes everything.
