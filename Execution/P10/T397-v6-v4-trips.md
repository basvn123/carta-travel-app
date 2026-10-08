# T397: design wave V4, Trips (visual and dynamic)

## Task ID

T397 (design wave V4, surface key 'trips'; plan in `docs/design-v6/plans/V4-trips.md`).

## Date

2026-10-08

## What changed

The trips surface now answers the traveller's input instead of sitting still. Moving the Lifestyle slider or switching the length changes every receipt figure at once, set to the cent, with one short opacity dip on each figure that changed; the old 240 ms count-up that showed a run of wrong, rounded figures is gone (row T380-b). The day in view on the day track is now the selected day of the whole week: its bar in the week shape turns terracotta, a terracotta marker slides to its column in the climb profile, and every day number under the week shape is a button that brings that day onto the track. Switching between the short version and the full week fades the new set of days in, starting on Day 1. A trip card answers a press at once (it shrinks to 0.97 and its caption band turns ink), and opening a week grows the card's photograph into the page's photograph where the browser has View Transitions. The accent is spent once: the slider's track and thumb, the climb profile and the fold header icons on the journey page are ink now, and the exit cards underline on hover instead of turning terracotta. Mono carries figures only: "From €255 a person, 7 days" on a style card, the range on a trip card and the strip's "€850 to €1,200 a person" set the figure in mono and the words in sans, and the day's stats line keeps "12 km" and "1,300 m" in mono and "ascent" and "hours" in sans. The nearest town's receipt on a one-base week now passes `hideStay` and `seedMonth` (the first good month still ahead) to FirstRunReceipt, the trips half of row T387-c; the props are landing's, added by T392 on its own branch, which merges first.

How it works, for the next person. `SettledEur` in `LifestyleSlider.jsx` renders the figure through `eurCents()` (`lib/lifestyleSlider.js`, Intl.NumberFormat with two decimals) and calls `useSettledFigure()` from `lib/figureChange.js`, which is the shell's shared dip and does nothing under reduced motion. The selected day lives in `JourneyPage.jsx`: DayTrack is the shell's and offers no `onSelect`, so a MutationObserver on the day block reads which of the track's dots carries `is-on` (DayTrack keeps that dot on the card in view), and `pickDay()` scrolls the track to the card `#jday-<n>` the way DayTrack's own buttons do; DayTrack's scroll handler then updates its counter. `WeekShapeBlock` and `JourneyRoute` take `sel` (a day number), and WeekShapeBlock takes `onPick`. The profile marker is `.jroute-sel`, a column-wide box over the shared `WeekProfile` chart, moved by `transform` between columns in `--dur-2` with `--ease-in-out`; the chart itself is outdoor's and is untouched. The figure-and-word split is `figureRuns()` (a measured line) and `splitAround()` (a translated sentence around one figure, so word order stays the catalogue's) in `lib/journeys.js`. The shared-element open is `openShared()` in the trip card's click and `claimShared()` as the page hero's ref, both from the shell's `lib/sharedElement.js`. The length crossfade remounts the day track under a key that counts length changes, so the first open does not fade and a change always does.

Design decisions taken unattended, under the owner's instruction of 2026-10-07 to proceed; each keeps Carta's palette, type and identity. The map of the week (brief V4.1) was not built: the journeys wire carries no coordinates for a day or its places, only bold names in prose, and 61 trips are still pinned at a country capital (T102-b), so a map would draw lines the data does not support; the selected day shared by the track, the week shape and the climb profile is what this surface's files could build honestly, under the existing rules "Data drawings" (one committed item in accent, the profile's scrub marker) and "Selected state". The receipt's interpolated figures stay whole euros as `lib/lifestyleSlider.js` computes them from whole-euro authored ranges, and are now printed with two decimals ("€1,083.00") rather than given invented cents. The fold header icons were made ink on the journey page only, from the v6 sheet: the `.dsec` rules sit in `25-feature-pages.css`, which this surface owns, but every detail page renders them, so changing them in place would restyle other surfaces' pages in this wave (row T397-d). The composed page's day photos stay a two-column grid inside the day card (row T387-i closed with that decision; the rule line is row T397-i).

Impeccable: context loaded once (as in V3 it resolved the root to the app worktree and so found no PRODUCT.md or DESIGN.md; both were read directly, init was not run). The critique of the V3 result ran as two isolated subagents: Assessment A, a design review over the source and fourteen "before" screenshots, scored 25 of 40; Assessment B, the detector and the design lint, found 0 and 194 of 194 in the baseline. The plan was committed before the first app edit. Questions were skipped (unattended run).

## Files touched

App repo (continent-app, branch p10-v6-visual-trips), every path owned by 'trips' in docs/design-v6/OWNERSHIP.md or one of the six catalogues:

**Modified:**
- src/browse/JourneyPage.jsx, src/browse/JourneysSection.jsx, src/browse/LifestyleSlider.jsx, src/browse/WeekPlan.jsx, src/browse/JourneyRoute.jsx
- src/lib/journeys.js (`figureRuns`, `splitAround`), src/lib/lifestyleSlider.js (`eurCents`)
- src/styles/66-v6-trips.css (a T397 section and the `.jcap-fig` rule changed in place), src/styles/25-feature-pages.css (`.jpage-day-stats` and the `.jpage-exit` hover, in place), src/styles/35-lifestyle-slider.css (`accent-color`, in place)
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (two new keys each: `journey.weekPickAria`, `journey.weekPickDay`)

No file was created in src/, so OWNERSHIP.md needed no row; `node scripts/check_ownership.mjs ../T397/docs/design-v6/OWNERSHIP.md` printed "OK: every file under src/ is owned by exactly one surface." No harness assertion needed changing.

Root repo (branch p10-v6-visual-trips):

**Created:**
- docs/design-v6/plans/V4-trips.md (the plan, committed before the first app edit)
- Execution/P10/T397-v6-v4-trips.md (this report)

**Modified:**
- Execution/_OPEN.md (rows T380-b, T387-c and T387-i closed by T397; rows T397-a to T397-i added)

## Commands run

In the app worktree. A Vite build of the merged base and `vite preview` on 5207 with a cache directory in `wt/_scratch/T397` (the shared node_modules must not take a session's Vite cache), the "before" walk (`_scratch/T397/crit.mjs`), the two critique subagents, then the edits. After them: eslint on the changed files, the six-catalogue parse of session rule 8, a fresh Vite build and preview on 5207, the after walk (`_scratch/T397/after.mjs` on Pixel 5, iPhone 13 WebKit, 360 x 740, 1280 x 800, iPhone 13 landscape WebKit and 1280 x 800 with reduced motion), `node scripts/verify_pack_grid.mjs`, `CARTA_PORT=5207 node scripts/verify_journeys.mjs`, `CARTA_PORT=5207 node scripts/verify_trips.mjs`, `node scripts/verify_trip_page.mjs`, `node scripts/verify_keyboard.mjs --port 5207`, `node scripts/verify_quality_floor.mjs t397 --port=5207 --only=pages --out=<scratch>`, `npm run lint`, `node scripts/ci/design-lint.mjs`, `node scripts/check_ownership.mjs`, `impeccable detect --json` over every changed file, `npm test`, and `npm run build`. dist/ and dist-data/ were deleted after the last build, the `keyboard-audit/` folder the keyboard harness writes was deleted, the preview verify_trip_page leaves on 4209 (row T387-k) was stopped, and every server and browser this session started is stopped.

## Config and secrets set

None.

## Before/after measurements

Before is the merged V3 state (app master e2d9e1e) as walked by this session, or T387's report where marked; after is this session's walk on a preview build of the branch.

| Metric | Before | After |
|---|---|---|
| Receipt figures that count up | 5 on a priced week (4 lines and the total, via MovingEur) | 0; each settles in place with one dip |
| Receipt figure format | whole euros ("€1,083", "€2,166") | two decimals ("€1,083.00", "€2,166.00") |
| Text read 0 ms and 400 ms after one slider step | not measured (the count-up runs 240 ms) | identical on all five devices ("€967.00") |
| Terracotta items in the journey page's week group, phone | the climb profile's line and fill across all 7 days | 2 (the selected day's bar and its profile marker) |
| Lifestyle slider track and thumb | `--accent` | `--ink-fill` (rgb 43, 52, 70) |
| Fold header icons on the journey page | `--accent` | `--ink-soft` |
| Mono runs that carry words, per hiking card | 1 of 1 figure lines | 0 |
| Strip cost cell set in mono | the whole cell | the range only |
| Day stats line, Stubai Day 1 | wholly mono | sans with 3 mono figure runs (12 km, 1,300 m, 4.5-5.5) |
| Controls that select a day | 2 (Previous, Next) | 2 plus one per day under the week shape (7 on a week), 44 px on a phone, 32 px on a fine pointer |
| Drawings that follow the day track | 0 | 2 (week shape, climb profile) |
| Card press feedback on touch | none | scale 0.97 and the band in `--ink-fill`, in `--dur-1` |
| List to page | hard swap | shared-element open where View Transitions exist (Chromium and this WebKit both report it) |
| Length change | days swap with no sign | the track fades in over `--dur-2` (animation `jpage-days-in`; none under reduced motion) |
| impeccable detect over the changed files | 0 | 0 |
| Design lint | 194, 194 baseline | 194, 194 baseline, 0 new |
| verify_journeys | 42 of 42 (T387) | 42 of 42 |
| verify_trips | 42 of 42 (T387) | 42 of 42 |
| verify_trip_page | 61 of 61 (T387) | 61 of 61 |
| verify_pack_grid | pass, 0 bad of 253 | pass, 0 bad of 253 |
| verify_keyboard | 20 of 20 | 20 of 20 |
| Quality floor, journey screens | phone small 1 | phone small 1 (the shell's cost bar segment, 39 px wide), monoProse 0 |
| npm test | 341 of 341 (T387) | 367 of 367 |
| npm run lint | 0 errors | 0 errors, 61 warnings (none in the changed files) |

The quality floor run exited 1 because its desktop destination page timed out (not this surface); its desktop journey count of 17 small targets is the fine-pointer 32 px exception the rule allows, 7 of them the new day buttons.

## The phone (T414)

Pixel 5, iPhone 13 (WebKit), 360 x 740 and iPhone 13 landscape (844 x 390, WebKit): no sideways scroll on the journey page on any of them; every check of the after walk above held on all four. Tap only: the press state is `:active`, every new hover rule is inside `@media (hover: hover)`, and nothing on the surface opens or selects on hover. The on-screen keyboard: nothing in this change takes text; the page's only text fields are the town receipt's date fields (landing's), unchanged. Safe areas and dvh: no fixed or sticky bar was added; the hero caps (40dvh, 60dvh) are V3's and hold. Thumb reach: the day numbers sit in the middle of the week group, inside the content; the page's one primary is unchanged. Tap targets: the day buttons are 44 px high on a coarse pointer (measured 44 on Pixel 5, iPhone 13, 360 and landscape) and 32 px under `pointer: fine`; the walk found no control under 44 px inside the page on any phone. A swipe is never the only way: the day buttons and the track's Previous and Next do what a swipe does. What only a real phone can prove is row T397-g.

Screenshots (after set, JPEG 80, viewport only, ten) in `design-v6-shots/trips/`: V4-styles-android, V4-list-android, V4-page-android, V4-receipt-android, V4-days-android, V4-page-iphone, V4-days-iphone, V4-styles-desktop, V4-receipt-desktop, V4-days-desktop.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The strip's cost cell read "€850 To €1,200 A Person" | `.jstrip-word` capitalises style words and only its `.mono` variant turned that off; the cell is no longer `.mono` once the figure is split from its words | `.jpage .jstrip-word:has(.mono) { text-transform: none; }` in the v6 sheet |
| ESLint warned that LifestyleSlider.jsx exported a function | `eurCents` sat beside the components (react-refresh rule) | Moved to `lib/lifestyleSlider.js` |
| A sed edit turned JourneyPage.jsx into a whole-file diff | sed dropped the file's CRLF line ends | Restored CRLF before the first commit; later edits went through a script that keeps the file's line ends |
| The first dev-server walk timed out | Seven sessions on one machine: an unbundled Vite dev server took a minute per page load | Walked a production build through `vite preview` instead |

## Carta-design's seven questions

1. No hex value: the diff uses tokens only (design lint 0 new).
2. No gradient, no new colour, no second saturated hue: the change removes accent rather than adding it; the one new accent use is the selected day (bar and profile marker), the "live item" of rule "Accent marks".
3. Ochre, teal and `--danger` are untouched.
4. Mono now carries figures only in every touched line: the card figure lines, the strip cost cell and the day stats line split figure from word; numbers in the receipt stay in mono columns. Left for the shell: "Day 1 of 7" (row T397-c).
5. One primary per view: no button was made primary; the day buttons are quiet chrome with the ink-fill selected state.
6. The two new strings are a label ("Pick a day to show on the day track") and a button name ("Show day {n}"), verb first; no em dash, en dash, middot or banned word in the diff.
7. Removed: the count-up, the terracotta from the slider, the climb profile, the fold icons and the exit hover, and the mono on the words of four lines.

## What is still open

Each item is also a row in Execution/_OPEN.md.

The map of the week is not built, for want of day coordinates in the data and two other surfaces' hand-offs (T397-a). The selected-day wiring reads DayTrack's dots and scrolls its track from outside because DayTrack has no `onSelect` (T397-b). The day track's counter sets "Day 1 of 7" wholly in mono (T397-c). Fold header icons are still terracotta on every page but the journey page (T397-d). The destinations surface's own difficulty words still say "Easy" (T397-e). Native review of the two new strings (T397-f) and real-phone checks (T397-g) are the owner's. The star on the card's photo corner waits on the destinations hand-off of T387-b (T397-h). DIRECTION.md needs one line on photos inside a day-track card (T397-i). Still open from earlier and not repeated: the journey address boot reader (T387-a), the 360 px list target held by the tab chrome (T387-d), the back control's focus ring after a pointer open (V5 item 3 with T387-g), verify_trip_page's leaked preview (T387-k).

## Rollback procedure

App: before the merge, delete the branch p10-v6-visual-trips; after it, `git -C continent-app revert` the two T397 commits (the main change and the strip case fix). Root: revert the plan commit and the report commit; the register rows can stay with their history. No data, migration or deploy was touched. If only the selected-day wiring misbehaves, removing `daysNode`, `selIdx` and `pickDay` from JourneyPage.jsx and passing no `sel` or `onPick` returns the week shape and the profile to their V3 drawing without touching the rest.
