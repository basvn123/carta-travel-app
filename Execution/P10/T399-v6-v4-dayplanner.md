# T399: V4 visual and dynamic, Day planner

## Task ID

T399 (design wave V4, session 9 of 10, surface 'dayplanner'; no mind-map prompt exists for it)

## Date

2026-10-08

## What changed

The day planner now spends its terracotta on one thing per view, draws the day it plans, and answers the traveller's input with motion that says what changed. The plan for the wave is `docs/design-v6/plans/V4-dayplanner.md`, committed in the root worktree before the first app edit; it opens with the impeccable critique of the merged V3 build.

The map shows the route. On both of this surface's maps (the workspace and the builder) catalogue places are now ink: a white label with an ink glyph, an ink dot where pins crowd, an ink tick when picked, a 2 px ink ring when in focus, and no hover lift. The numbered stops and the route line are the only terracotta left on the workspace map. Before, 39 catalogue pins in the Salzburg day were painted in the accent beside the 4 route pins; after, none are. The stay pin on the builder map is ink, its name sits in the UI face on a card instead of in mono in accent text, and its endlessly looping pulse is gone. The ochre rating chip on a town pin stays, because a rating is a measure. These rules are overrides from `68-v6-dayplanner.css` scoped to `.day-ws` and `.dem-map`, because the base pin rules live in tripplanner's `19-guide-ratings.css` and `TripMap.jsx`.

The list stopped repeating the accent. Stop numbers are ink discs inside the photo's lower corner (the thumbnail is 44 px now, and the number no longer hangs over its edge); the active tab is the house selected state, an ink fill, with its count as a count chip; selected chips, segments, toggles and chosen rows in the landing, the chat planner, the ideas step, the builder and the AI proposal went to ink; hovers went to an ink border; "Show N more", the card arrow and the tips' add went ink; the "Now" badge is ink; "Delete day plan" is `--danger`. Tinted tiles behind icons and the pink loading ground behind photos went to transparent and to `--paper-dim`. Caution notes (a place pinned by best effort, a file problem) use the amber tokens instead of the accent. What keeps the accent: each view's one primary, focus rings, the route, and the recommended card's border and badge.

The day has a picture. A thin strip above the stops (rule N4) draws the day from the door to the finish: each stop an ink segment, each stretch between stops a rule segment, every segment as wide as its minutes in the same schedule that prints "done ~14:00" in the head, so the segments add up to that finish. It carries no figure and no legend and is hidden from screen readers, because the rows and the figures line say the same in words. The stop under the pointer, or the one whose pin was just tapped, is outlined. It shows no clock and no leg figure, so it does not pre-empt the owner's answer on legs and arrival times (T378-e).

Motion now states change and nothing else. Moving a stop slides both rows to their new places (a FLIP through the Web Animations API, `--dur-2`, `--ease-in-out`); before, the rows swapped with no motion, and the walk read a computed transform of `none` on every row during the move. A tapped pin rings its row in ink, with no change to padding or margins (before, the row's padding and margins changed, so the list jumped). The figures line ("4 stops 3,000 steps on foot done ~14:00") settles in place through the shared `useSettledFigure()` when a stop is added, moved or removed, and lost its pipe separators for spacing. A tab's content arrives with an 8 px rise in `--dur-2`; the tab fill changes in `--dur-1`. Every literal duration left in `68-v6-dayplanner.css` (six `.14s` transitions moved there in V3) now reads the tokens, and the one that animated `box-shadow` no longer does. Under reduced motion every one of these jumps: the reorder walk at reduced motion reads `none` on every row.

Photographs carry the place without text on them. The saved day plan cards on the landing had their name on the photo over a gradient scrim; the name now sits in Fraunces at the caption size in the solid band under the photo (carta-design caption band), the scrim and its gradient are gone, the photo is 3:2, and pressing a card turns its band ink. The row and stop icons are drawn icons from the one set: the row tools' ↑ ↓ × became the chevron and CloseIcon, the "← Back to all day plans" arrow became ArrowLeftIcon, and the arrow between stop names on a trip card became a chevron.

The PDF prints in Carta's own type. The print window loads the app's own `@font-face` rules (the three self-hosted faces) and reads its palette from the live tokens, so the file holds no hex and names no typeface; before, it named "Inter Tight", which the app does not load, and carried an older palette as hex. The uppercase, letter-spaced accent kicker is now a plain brand line, the uppercase tags and chips are sentence case, and dates, counts, stop numbers and the walking legs are in mono. The day cost on the cover waits on T378-d like the cost line itself.

Design choices made under the unattended run (impeccable's AUTONOMY_DIRECTIVE_CHECK, owner instruction 2026-10-07 to proceed); each keeps Carta's palette, type and identity. The selected tab is an ink-filled tab rather than an ink underline, because carta-design's selected state names a tab and says `--ink-fill`. The time between stops on the strip includes the lunch pause in the rule colour, because N4 has two segment kinds (stops and legs) and a third colour for lunch would need a rule that does not exist. The stop numbers in the list went ink although they echo the accent route pins, because the brief's done check allows the accent only on the primary, focus, the route and the recommended mark, and the number still ties row and pin. The route preview drawing inside the recommended fork card stays in accent, inside the card that already carries the recommended border. The shared wizard step rail, the shared `.ai-plan-badge` tile and the shared `.guide-chip` source were not changed, because other surfaces draw them; rows T399-c to T399-e.

## Files touched

Root repo (branch p10-v6-visual-dayplanner):

Created:
- docs/design-v6/plans/V4-dayplanner.md
- Execution/P10/T399-v6-v4-dayplanner.md

Modified:
- Execution/_OPEN.md (rows T399-a to T399-f appended)

App repo `continent-app` (branch p10-v6-visual-dayplanner):

Modified:
- src/planner/DayPlanPanel.jsx (day strip, row slide, stable row keys, SettledLine, drawn row tools)
- src/planner/DayPlannerTab.jsx (passes the schedule and the focused row to the panel, the settled figures line without pipes, the back arrow icon)
- src/planner/DayTripCards.jsx (caption band, 3:2, chevron between stops)
- src/planner/dayPlanPdf.js (live tokens, the app's font faces, no uppercase)
- src/styles/13-day-planner.css, 20-day-planner-flow.css, 21-chat-passes.css, 68-v6-dayplanner.css
- scripts/verify_day_landing.mjs, scripts/verify_day_steps.mjs (each changed assertion carries a comment saying why)

No i18n key was added or changed, no file was created or deleted under `src/`, and every app path is one OWNERSHIP.md gives to 'dayplanner' or a harness under `scripts/`.

Outside both repos, never committed: ten after screenshots in `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\dayplanner\` under the V3 view names (V4-landing-iphone, V4-landing-desktop, V4-fork-android, V4-builder-desktop, V4-returning-android, V4-workspace-iphone, V4-workspace-android, V4-workspace-desktop, V4-add-android, V4-tray-desktop), and the walk scripts, JSON and logs in `C:\Users\Gebruiker\Documents\Portfolio\wt\_scratch\T399\`.

## Commands run

Root worktree `C:\Users\Gebruiker\Documents\Portfolio\wt\T399`, app worktree `...\wt\T399-app` (its node_modules a junction to the main checkout's install).

    impeccable context --target continent-app/src/planner/DayPlannerTab.jsx         (root worktree)
    node node_modules/vite/bin/vite.js build; node node_modules/vite/bin/vite.js preview --port 5209 --strictPort
    TAG=crit node <scratch>/walk.mjs                       (critique census of the merged V3 build)
    python <scratch>/ed1.py ... ed8.py                     (the edits, keeping each file's CRLF line ends)
    sh <scratch>/run-harness.sh v4c                        (six day harnesses at CARTA_PORT=5209)
    node scripts/verify_day_steps.mjs http://localhost:5209/
    node scripts/verify_keyboard.mjs --port 5209           (then --widths 1280 --only trip-page,trip-planner,day-planner after a browser crash)
    node scripts/verify_quality_floor.mjs v4 --port=5209 --only=day   (then --vp=desktop after a browser crash)
    node <scratch>/devwalk.mjs                             (iPhone 13 WebKit, Pixel 5, 360x740, 1280x800; one device at a time)
    REDUCED=1 node <scratch>/walk.mjs                      (reduced motion)
    impeccable detect --json <the eight changed src files> (and on their e2d9e1e versions for the before)
    npx eslint src; npm test; node scripts/ci/design-lint.mjs
    rm -rf dist dist-data

## Config and secrets set

None. The app worktree has no `.env`, so every run saw the "accounts are not set up" state.

## Before/after measurements

Before is the merged V3 state (app master e2d9e1e) built in this worktree; after is the final build. The accent census counts every visible element painted in `--accent` as text, fill, border or SVG stroke and fill, from `wt\_scratch\T399\walk\walk-crit.json` (before) and `walk-v4a.json` plus `walk-reduced.json` (after); the device figures are from `devwalk\devwalk-<device>.json`.

| Metric | Before | After | Delta |
|---|---|---|---|
| Catalogue map pins painted in accent, Salzburg workspace (Pixel 5 and 1280) | 39 | 0 | -39 |
| Route pins in accent, same view | 4 | 4 | 0 |
| Accent-painted elements, workspace, 1280 (route included) | 47 | 4 (the route pins) | -43 |
| Accent-painted elements, builder, 1280 | 33 | 0 (1 when a pick enables "Open my day", the primary) | -33 |
| `--accent-bg` grounds in the workspace (count chip, loading thumbs) | 5 | 0 | -5 |
| Rows moving during a reorder (transform not none mid-move), 1280 | 0 | 2 (the swapped pair) | +2 |
| Rows moving during a reorder under reduced motion | not measured | 0 | |
| Place names set in mono on the builder map | 1 (the stay) | 0 | -1 |
| Unicode glyphs standing in for icons on the surface (↑ ↓ × ← →) | 5 | 0 | -5 |
| Gradients on the surface's sheets | 1 (plan card scrim) | 0 | -1 |
| First stop top, iPhone 13 / Pixel 5 / 360x740 / 1280 | 380 / 393 / 395 / 315 px (T389 report) | 402 / 415 / 417 / 337 px | +22 px, the day strip; still under the 420 px V3 target |
| "Plan a new day" bottom on a returning visit, Pixel 5 | 546 to 566 px (T389 report) | 567 px | within thumb reach |
| impeccable detect findings, the eight changed files | 0 | 0 | |
| design-lint | 0 new | 0 new (190 found, all in the baseline) | |
| npm run lint, whole app | 0 errors | 0 errors, 61 warnings (the four changed components carry 6 before and 6 after) | |
| npm test | | 367 pass, 0 fail | |
| Strings added or changed | | 0 | |

Harnesses on `vite preview` of the worktree build, ok lines and failures:

| Harness | Before (T389 final) | After | Note |
|---|---|---|---|
| verify_day_landing | 53 ok, 1 fail | 53 ok, 1 fail | On this master the first builder card on a laptop is a town, and the tray rightly counts it as a ride ("1 town, about 1 h 16 min there and back"); the assertion now accepts a ride estimate, with a comment. The remaining failure is the route-building state, which needs the plan-day function (T389-h) |
| verify_day_start_point | 7 ok, 1 fail | 7 ok, 1 fail | needs a signed-in account (T389-h) |
| verify_day_dates | 8 ok, then stops | 8 ok, then stops | the Barcelona trip chip needs the account (T389-h) |
| verify_day_ideas | 22 ok | 22 ok | |
| verify_day_workspace | 32 ok | 32 ok | |
| verify_day_overview | 16 ok | 16 ok | |
| verify_day_steps | 16 ok, then stops | 0 ok on this master, then 16 ok, then stops | the shell's V3 pass made the header tabs links, so the harness found no "Day planner" button; it now looks among links too, with a comment. It still stops at the chat route, which needs plan-day (T389-h) |
| verify_keyboard | 20/20 | 20/20 | the first run crashed one browser tab under memory pressure (seven sessions); the three cases after it passed on a rerun |
| verify_quality_floor, day flow | 16 screens, every floor check passes | 16 screens (8 phone, 8 desktop), every floor check passes | 0 horizontal scroll, one h1 per screen, 0 views with two primaries, 0 phone targets under 44 px, 0 motion under reduced motion, 0 gradients, 0 contrast failures, 0 console errors |

The phone checks (T414), on iPhone 13 (WebKit), Pixel 5 and 360 x 740 (Chromium, touch) and desktop 1280 x 800. No horizontal scroll on any view at any size. Landscape (664 to 740 x 360 to 393): the toolbar stays on screen and the first stop sits at 341 to 348 px. Tap only: every hover rule this wave wrote either sits in `@media (hover: hover)` or only colours a border; the strip's outline follows a tapped pin, not only the pointer. The on-screen keyboard: with the stay field focused and the height cut by 40 percent, the field and Find stay in view and the bottom nav does not cover them on all three phones. Safe areas: the day planner adds no fixed bar; the bottom nav (shell's) pads the bottom inset. Height: nothing this wave wrote uses `vh`. Thumb reach: the toolbar and the Add and Share sheets are unchanged from V3; "Plan a new day" ends at 567 px on the Pixel 5. Tap targets: no new control under `--tap`; the workspace still counts about 60 controls under 44 px (map pins, row tools, tabs), which is V5's brief item 1. Swipe: nothing new depends on a gesture; the reorder has its buttons.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first edit turned two CRLF components into LF, so git showed every line changed | Python's text mode wrote LF; the app worktree's working copies are CRLF | Rewrote both with CRLF; every later edit went through a helper that keeps each file's own line ends |
| The design lint found one new `outline-none` | The picked pin rule removed the focus ring it had just set | Split the picked and the focused rules so nothing sets `outline: none` |
| Selected cards drawn with an inset box-shadow would have tripped the lint's shadow-literal rule | The lint allows only the shadow tokens | Selected cards use an ink outline instead |
| verify_day_steps stopped at its first line | The header tabs are links since the shell's V3 pass | The harness looks among links too |
| A browser tab crashed in verify_keyboard and in the quality floor | Seven sessions on limited RAM | Reran the cases after the crash; all pass |

## What is still open

The ink planning-map pins are overrides from this surface's sheet; the base pin rules and markup are tripplanner's (19-guide-ratings.css and TripMap.jsx), and the 44 px hit box for every pin is brief V5-1. Row T399-a.

The OWNERSHIP rule 5 moves this wave's gate did not allow (it accepts only dayplanner paths): `.daytrip-reco` in 11, the dead `.day-tier-must` in 19, `.day-topcard-trip` and the dead `.day-flow-help` box in 26, and the unused `.day-stat-sep` in 18. Their look is fixed from 68 or they draw nothing, so rows T388-e and T389-f stay open and point to row T399-b.

The wizard step rail the day planner borrows from the trip wizard still marks the current step in accent. Row T399-c.

The `.ai-plan-badge` accent tile heads both the AI modal and PassModal (account). Row T399-d.

The shared `.guide-chip` selected state is accent at its source in 12-guided-trip.css; the day planner overrides it inside its own views. Row T399-e.

What only a real phone can prove: the slide and the tab arrival on iOS Safari and Android Chrome, the ink pins and the 8 px strip in sunlight, the card's pressed band under a thumb, and printing the PDF with the self-hosted faces from the phones' print dialogs. Row T399-f.

Waiting on the owner as before: the day cost and with it the receipt on the PDF cover (T389-a after T378-d), and legs and arrival times (T389-b after T378-e). The four day-harness parts that need the Supabase env or the plan-day function are T389-h. Row T388-h (verify_handoffs' "Back to trip") was looked at: the control renders only for a trip-born plan with a trip handler passed in, so the cause is in the hand-off from the trip planner, not in a day planner rule; it stays open.

## carta-design's seven questions

1. Any hex value outside `:root`? No. The PDF lost its hex palette: it reads the live tokens.
2. Any gradient, any colour not in DESIGN.md, a second saturated hue? No; the plan card's gradient scrim went. The amber on the two caution notes and `--danger` on "Delete day plan" are existing tokens in their jobs.
3. Ochre only for ratings, teal only for gems, `--danger` only for destruction? Yes. The ochre rating chip on town pins stays; `--danger` marks "Delete day plan" only.
4. Mono prose, or a column number in sans? No. The figures line, the stop numbers, the PDF's dates, counts and legs are mono; the stay's name on the builder map moved out of mono.
5. More than one primary in a view? No. The quality floor counts zero views with two filled primaries.
6. Headlines with a verb or a number; no em dashes, no banned words? No headline changed and no string was added; the design lint finds no dash and no banned word.
7. Remove one thing: the looping pulse under the stay pin, and the scrim on every plan card.

## Rollback procedure

App repo: `git -C <app> revert 3755523 a27a0bf cd275b6 758fe88 17e34de a08538a` on the merged branch (or reset the branch to e2d9e1e before the merge); the commits are independent, so any one can be reverted alone (17e34de is the PDF, a27a0bf the plan cards). Root repo: revert this report's commit and 1d59cc910 (the plan), and delete rows T399-a to T399-f with that revert. No data, no migration, nothing deployed.
