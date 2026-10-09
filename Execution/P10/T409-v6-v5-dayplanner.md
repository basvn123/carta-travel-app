# T409: V5 harden, adapt and polish, Day planner

## Task ID

T409 (design wave V5, session 9 of 10, surface 'dayplanner'; no mind-map prompt exists for it)

## Date

2026-10-09

## What changed

The day planner now works under a thumb, a keyboard and a screen reader, and it speaks the traveller's language. The plan for the wave is `docs/design-v6/plans/V5-dayplanner.md`, committed in the root worktree before the first app edit; it opens with the impeccable audit and critique of the merged V4 build.

Tap targets. On a coarse pointer every control on the surface is now at least 44 px both ways. The census walked ten views (landing, stay results, When, Ideas, the fork, the builder, the returning list, and the workspace with its three tabs and the tips dialog) on the iPhone 13 (WebKit), the Pixel 5 and a 360 x 740 Android, with a ::before hit ring counted as part of a control. Before, the workspace had 17 controls under 44 px, the Add tab 16, Files 6, the tips dialog 20 and the returning list 2 (the plan card's menu button). After, all of them are 0 on all three phones. The three workspace tabs went from 37 to 44 px, the three row tools from 26 to 44, the tips button, the stay buttons, the map chips, the Whole days switch, "Use this day", Browse, the file actions, the tip add buttons and the card menu to 44, and the zoom buttons of the builder map to 44. The brief counted 47 map pins; they already carry a 44 px ring (11-trip-planner.css, T193, and 26-shortlist-extras.css), so nothing was needed there. A fine pointer keeps the compact sizes. The head card gives 4 px back so the 44 px tabs do not push the stops down: the first stop is at 420 px at 360 x 740 (417 before) and two stops still show above the bottom bar at 360 x 640.

Real patterns. The three workspace tabs are a tablist with one tab in the Tab order, arrow keys, Home and End, and `aria-controls` ids that match a labelled tabpanel. The More menu and the plan card's menu take focus into their first item when they open, walk with ArrowUp, ArrowDown, Home and End, and give focus back to their button on Escape; one shared change in `useDismiss` does it for both. The Local tips dialog traps Tab with `useFocusTrap` and returns focus to its button. Every view already had exactly one h1 (checked on the landing steps, the chat, the builder and the workspace); nothing was needed there.

Undo instead of confirm (rule N6). Removing a stop, deleting a file and deleting a day plan run at once and show a toast with "Undo" for six seconds. A stop comes back in its place in the day. A plan or a file is only hidden for those six seconds and deleted for real when they end, when another delete starts or when the panel unmounts, so Undo loses nothing (a plan's picks, notes and files are removed by the same call as before). The delete item on the plan card was already `--danger`. The plan said these were behind confirm dialogs, but the code deleted at once with no way back, so no dialog needed removing.

Strings. In German, Spanish, French, Italian and Dutch, 212 keys of the day planner's own prefixes had no translation and fell back to English; the landing's h1 "Your day plans" was English in German. Now 217 keys are written in each of the five catalogues (the 212, minus three dead keys that hold truncated text, plus eight new keys: Today's walk, the walk length and remove labels, Undo, the three undo lines, and the map failure line, in all six). The five ampersand labels in `day.*` and five in `chat.*` read "and"; `day.depart800` lost its stray backslash; the two banned-word strings (`day.departEasy`, `ai.eventsNeedPass`) were rewritten; three hard-coded English labels on the walk rows and two stored plan names ("Your trip", "Day plan") go through `t()`. "Copied" already had no exclamation mark.

Long words. Names that cannot break (German compounds, long town names) wrap inside the row, tip, card and stats line instead of widening the sheet, and the stay's name shows whole on keyboard focus after truncating on one line. The de and fr walks at 360 px found no label cut off by its own box on any of the ten views.

Failure. When the builder map's style never arrives, the builder says "The map did not load. The places are still listed." in one card over the grey box. The workspace map is tripplanner's TripMap, so its failure line and the skeleton while the 19 MB catalogue loads were not built (rows below).

The keyboard floor has a new case, `day-workspace`, that opens a seeded plan and drives the tab, menu and dialog patterns; all nine of its checks pass at 380 and at 1280.

Design choices made under the unattended run (impeccable's AUTONOMY_DIRECTIVE_CHECK, owner instruction 2026-10-07 to proceed), each keeping Carta's palette, type and identity. The row tools are 44 px wide each, which narrows the name column on a phone so long names wrap to two lines and a row is 76 px instead of 62; the other choice, hiding the reorder buttons, would have made a swipe or a long press the only way to reorder. The undo toast is an ink pill like the shared save toast, at the bottom above the bar, and it covers the lower part of the returning list's primary for six seconds; moving it would have broken the rule that nothing floats over a primary elsewhere. Plan deletion defers the real delete instead of restoring from a copy, because restoring a plan's files from IndexedDB is not possible once they are deleted. The remaining four banned-word strings ("Easy", "Take it easy", "Just me", "Just day {n}") were left because the brief names two.

## Files touched

Root repo (branch p10-v6-polish-dayplanner):

Created:
- docs/design-v6/plans/V5-dayplanner.md
- Execution/P10/T409-v6-v5-dayplanner.md

Modified:
- Execution/_OPEN.md (rows T409-a to T409-k appended)

App repo `continent-app` (branch p10-v6-polish-dayplanner):

Modified:
- src/planner/DayPlanPanel.jsx (useDismiss menu focus and arrows; useUndo and UndoToast)
- src/planner/DayWorkspaceChrome.jsx (tab pattern, tips focus trap)
- src/planner/DayPlannerTab.jsx (tabpanel, undo for stops and plans, three strings and two plan names through t)
- src/planner/DayFilesPanel.jsx (undo for a file)
- src/planner/DayTripCards.jsx (the card menu uses useDismiss)
- src/map/DayExploreMap.jsx (map failure line, stay fallback through t)
- src/styles/68-v6-dayplanner.css (coarse tap targets, undo toast, long names, map failure card)
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (day, dayws, chat, shape, ai prefixes only)
- scripts/verify_keyboard.mjs (the new `day-workspace` case, with a comment on `allowCovered`)

No file was created or deleted under `src/`; the undo hook lives in `DayPlanPanel.jsx` so OWNERSHIP.md needed no new row (`node scripts/check_ownership.mjs` says every file is owned once). Every app path is one OWNERSHIP.md gives to 'dayplanner', plus the shared keyboard floor, to which a surface may add its own case.

Outside both repos, never committed: ten after screenshots in `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\dayplanner\` (V5-landing-iphone, V5-landing-desktop, V5-fork-android, V5-builder-desktop, V5-returning-android, V5-workspace-iphone, V5-workspace-android, V5-workspace-desktop, V5-add-android, V5-undo-iphone), and the walk scripts, JSON and logs in `C:\Users\Gebruiker\Documents\Portfolio\wt\_scratch\T409\`.

## Commands run

Root worktree `C:\Users\Gebruiker\Documents\Portfolio\wt\T409`, app worktree `...\wt\T409-app` (its node_modules a junction to the shared install).

    impeccable context --target continent-app/src/planner/DayPlannerTab.jsx         (root worktree)
    node node_modules/vite/bin/vite.js build; node node_modules/vite/bin/vite.js preview --port 5209 --strictPort
    node census44.mjs, walk5.mjs, base5.mjs, devwalk.mjs, inp.mjs, english.mjs   (scratch walks; DEV=small|android|iphone|desktop, LANG_CODE=en|de|fr)
    node applyi18n.mjs, addkeys.mjs <json>                  (append keys inside the catalogue object, CRLF kept)
    git checkout 592db0d -- <the 14 files>; vite build --outDir dist-base; git checkout HEAD -- <the 14 files>   (the V4 baseline build; every file was committed first; no stash was used)
    sh <scratch>/run-harness.sh v5b                          (six day harnesses at CARTA_PORT=5209)
    node scripts/verify_day_steps.mjs http://localhost:5209/
    node scripts/verify_keyboard.mjs --port 5209
    node scripts/verify_quality_floor.mjs v5b --port=5209 --only=day
    impeccable detect --json <the eight changed src files>
    npx eslint src; npm test; node scripts/ci/design-lint.mjs; node scripts/check_ownership.mjs <root>/docs/design-v6/OWNERSHIP.md
    for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
    rm -rf dist dist-data dist-base quality-floor-audit

## Config and secrets set

None. The app worktree has no `.env`, so every run saw the "accounts are not set up" state.

## Before/after measurements

Before is the merged V4 state (app master 592db0d) built in this worktree as `dist-base`; after is the final build. Phone figures come from `wt\_scratch\T409\walk5\base5-<device>-en-base.json` (before) and `walk5-<device>-en-final.json` (after), counting a control's ::before ring as part of its box; row and INP figures from `inp-base.mjs` and `inp.mjs` at 4x CPU throttle on a 360 px touch device.

| Metric | Before | After | Delta |
|---|---|---|---|
| Controls under 44 px, workspace, 360 x 740 touch | 17 | 0 | -17 |
| Same, Add tab / Files tab / tips dialog | 16 / 6 / 20 | 0 / 0 / 0 | -16 / -6 / -20 |
| Same, returning list | 2 | 0 | -2 |
| Same, all ten views, iPhone 13 and Pixel 5 | tips dialog 20 and 21, the rest as above | 0 on every view | |
| Controls under 44 px, workspace, 1280 mouse | not measured | 60 (map pins at visual size, row tools, tabs) | the coarse rules do not apply to a mouse, so this is unchanged by design |
| First stop top, 360 x 740 / 360 x 640 | 417 / 397 px | 420 / 400 px | +3 / +3 |
| Row height, three tools | 62 px | 76 px | +14 (long names wrap to two lines) |
| Stops fully above the bottom bar, 360 x 640 | 2 | 2 | 0 |
| Day planner keys missing in de, es, fr, it, nl | 212 each | 3 each (dead keys) | -209 |
| Worst interaction latency in a run of taps (tab, tab, remove), three runs, 360 x 640 | 1144, 776, 224 ms | 552, 504, 464 ms | median 776 to 504 |
| Same, 360 x 740 | 536, 760, 472 ms | 448, 392, 344 ms | median 536 to 392 |
| Layout shift in the same taps | 0.004 to 0.008 | 0.003 to 0.011 | within the noise |
| impeccable detect findings, the eight changed files | 0 | 0 | 0 |
| design-lint | 0 new | 0 new (164 found, all in the baseline) | |
| npm run lint, whole app | 0 errors, 61 warnings | 0 errors, 64 warnings | +3 (react-refresh warnings on files that export a hook and a component) |
| npm test | 367 pass | 368 pass, 0 fail | |

`scripts/perf/baseline_vitals.mjs` covers the price map, a destination page and a trip page, not the day planner, so INP and LCP for this surface were read from the walk above; the latency figures are single runs at 4x throttle and vary by a factor of two between runs, so they show no regression, not a gain. LCP was not measured separately.

Harnesses on `vite preview` of the worktree build, ok lines and failures (the final run is `h-v5b`):

| Harness | Before (T399 final) | After | Note |
|---|---|---|---|
| verify_day_landing | 53 ok, 1 fail | 53 ok, 1 fail | the remaining failure is the route-building state, which needs the plan-day function (T389-h) |
| verify_day_start_point | 7 ok, 1 fail | 7 ok, 1 fail | needs a signed-in account (T389-h) |
| verify_day_dates | 8 ok, then stops | 8 ok, then stops | the Barcelona trip chip needs the account (T389-h) |
| verify_day_ideas | 22 ok | 22 ok | |
| verify_day_workspace | 32 ok | 32 ok | |
| verify_day_overview | 16 ok | 16 ok | |
| verify_day_steps | 16 ok, then stops | 16 ok, then stops | still stops at the chat route, which needs plan-day (T389-h) |
| verify_keyboard | 20/20 | 20 of 22 on the first run, 21 of 22 on the last | the two new `day-workspace` cases pass; see below |
| verify_quality_floor, day flow | 16 screens, every floor check passes | 16 screens, every floor check passes | 0 horizontal scroll, one h1 per screen, 0 views with two primaries, 0 phone targets under 44 px, 0 motion under reduced motion, 0 gradients, 0 contrast failures, 0 console errors |

No assertion in a day harness encoded the old design, so none was changed. On the keyboard floor, the new `day-workspace` case at 380 px reports 49 stops covered, because the map's pins sit under the bottom sheet; the case carries `allowCovered` with a comment saying so (row T409-e) and fails on the pattern checks only. `trip-planner` fails one of its two widths on most runs (a `guide-booked-none.on` card with no ring, @380 on the first run, @1280 on the last) and passes on rerun; it is tripplanner's file, and master already holds T408's "ring on selected cards" (row T409-i).

The phone checks (T414), on iPhone 13 (WebKit), Pixel 5 and 360 x 740 (Chromium, touch) and desktop 1280 x 800. No horizontal scroll on any view at any size. Landscape (the phone viewports turned: 740 x 360, 844 x 390 and 851 x 393): the toolbar stays on screen and the first stop sits at 348, 354 and 355 px (`devwalk.mjs`, run before the last 4 px were given back). Tap only: every control works from a tap; the undo toast and the tab arrows need no hover, and the reorder keeps its buttons, so no swipe is the only way. The on-screen keyboard (height cut by 40 percent, stay field focused): the field and Find stay in view and the bottom nav does not cover them on all three phones (`devwalk.mjs`). Safe areas: the undo toast adds `env(safe-area-inset-bottom)` above its 84 px; the bottom nav keeps the shell's padding. Height: nothing new uses `vh`. Thumb reach: "Plan a new day" ends at 549, 565 and 567 px on the three phones. Tap targets: 0 under 44 px on every view on the phones, as above; the sheet's drag grip (18 px) is the one control left under it (row T409-e).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The undo toast never showed on the returning landing | The landing returns its own tree, so the toast I put in the workspace return was not rendered | The toast is rendered in both returns |
| Focus jumped back to the first menu item on every parent render | Callers pass a fresh close function each render, and the focus call sat in the effect that depends on it | Focus-on-open has its own effect keyed on `open` |
| The undo toast wrapped "Day plan deleted" onto two lines | A fixed box with `left: 50%` shrinks to half the width | `width: max-content` |
| The 4 px given back for the tabs had no effect twice | First `.dayws-tabs` (already 0 padding on touch), then `.dayws-daybar` (not used on this surface) | Found the real head, `.trip-topcard` inside `.day-ws`, from a dump of the sheet's box stack |
| One shell command carrying about 1,000 translations failed with ENAMETOOLONG | The command was too long | The translations live in two module files written with the file tool |
| The new keyboard case failed at 380 px | The map pins sit under the bottom sheet, so the walk reports them covered | `allowCovered` on this case, with a comment, and row T409-e |
| An eslint error after moving a label through `t` in a map effect | The effect read `t` without listing it | The fallback label is a string in the component body and in the dependency list |
| Backgrounded build and preview commands died with their shell | The tool moves a long command to the background and ends its children | The preview runs as its own background task, builds run with an until-loop wait |

## What is still open

Native review of the 217 strings written in de, es, fr, it and nl, and the English edits (T409-a).

The map failure line on the workspace map (TripMap, tripplanner's) and the skeleton while the catalogue loads (brief V5-6) were not built; the builder map has its line (T409-b).

The shared icon glyphs carry English labels in every language (Share, Back, More information in `Icons.jsx`), found by the German walk (T409-c).

The ready-made day titles and blurbs, the local tips and the walks' notes are English in the data, so a German traveller reads them in English (T409-d).

The workspace map's focusable pins sit under the phone sheet in the keyboard walk, and the sheet's drag grip is 18 px (T409-e).

The dead CSS and the app-header rules in `13-day-planner.css` (brief V5-7) were not touched: each deletion needs a per-rule grep and a cascade check against seven harnesses (T409-f).

The fork's second card still sits under the bottom bar on a phone (T389-i, brief V5; T409-g).

Real-phone checks (T409-h). The keyboard floor's `trip-planner` ring flake (T409-i). Three dead truncated keys in en.js (T409-j). Four banned-word strings left (T409-k).

## carta-design's seven questions

1. Any hex value outside `:root`? No. The new rules use tokens only.
2. Any gradient, any colour not in DESIGN.md, a second saturated hue? No. The undo toast is `--ink-fill` with `--on-fill`; the map failure card is `--bg-card` on `--rule`.
3. Ochre only for ratings, teal only for gems, `--danger` only for destruction? Yes. Nothing touched ochre or teal; the plan card's delete item stays `--danger`.
4. Mono prose, or a column number in sans? No. Nothing set in mono was added; the new strings are sans.
5. More than one primary in a view? No. The quality floor counts zero views with two filled primaries; the toast's Undo is a text button.
6. Headlines with a verb or a number; no em dashes, no banned words? No headline changed. The five new English strings carry no dash and no banned word; two banned-word strings were removed from `en.js`, and the design lint finds nothing new.
7. Remove one thing: the two confirm steps and the stray backslash in a visible string; and the 26 px row tools that no thumb could hit.

## Rollback procedure

App repo: `git revert d4512f5 62e6120 04d78f9` on the merged branch (or reset the branch to 592db0d before the merge); the three commits are independent, 04d78f9 being the strings alone. Root repo: revert this report's commit and cccb30c30 (the plan), and delete rows T409-a to T409-k from `Execution/_OPEN.md` with that revert. No data, no migration, nothing deployed.
