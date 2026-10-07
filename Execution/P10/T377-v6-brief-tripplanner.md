# T377: design brief, Trip planner

## Task ID

T377 (design wave V1, session 8 of 10; raised by T369, no mind-map prompt).

## Date

2026-10-08

## What changed

The trip planner now has a written design brief, `docs/design-v6/briefs/tripplanner.md`, which V3, V4 and V5 build from. It holds the seven parts the task asks for: the impeccable setup and the mode (Operate, because the traveller is completing a task with a defined end, a priced and saved route, not being persuaded or reading); a walk of the wizard and the planned trip at 380 and 1280 px from a cold start and a return; an inventory of 154 rows (28 views and states, 116 control rows, 10 visual settings) with a verdict on each; a critique with heuristic scores and a short technical audit; the traveller's job in the research's order of need; a plan of 13 V3 items, 10 V4 items and 9 V5 items, each with files, command and check, ending in a target-state table of every control; and eight proposals that need a carta-design rule before they are built (N1 to N8). No app file changed. Seven "before" screenshots are saved outside both repos.

The brief's main findings, so a reader of this report has them without opening it. The first euro figure of the whole flow appears at step 6 of 7, although value for money is the first thing the research says travellers weigh and Carta has a day cost for every town. When it does appear it disagrees with itself: the wizard's "Estimate so far" said €586 for the walked trip and the planned view one screen later said €771 for the same trip, because the two are computed by different code. The accent is spent on everything: the Trips step showed 12 accent-filled "Choose" buttons at once, and selection is drawn five different ways. On a phone the chrome (header, rail, estimate band, recap band, a two-row footer, the bottom nav) leaves about 380 px of 800 for the step. Three paths lose or mislead: the planned view's close cross deletes an unsaved trip without asking, the Getting there step is empty on every path except the ready-made one, and a reload mid-wizard restores the step number without the answers that decide which step that is. Three strings still promise fare search that Carta stopped doing on 2026-10-02. Five gradients and 18 off-token shadows ship on this surface. The chat planner named in the surface list is mounted only on the Day tab.

## Files touched

**Created:**
- docs/design-v6/briefs/tripplanner.md
- Execution/P10/T377-v6-brief-tripplanner.md

**Modified:**
- Execution/_OPEN.md (rows T377-a to T377-j appended)

Outside the repos, never committed: seven JPEGs in `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\tripplanner\` (V1-booked-380, V1-when-380, V1-where-380, V1-trips-380, V1-getting-380, V1-planned-380, V1-where-1280). V4 saves its "after" set under the same names, plus a 1280 planned view.

## Commands run

From the T377 root worktree:

    sh "C:/Users/Gebruiker/Documents/Portfolio/Travel App/.claude/skills/impeccable/scripts/impeccable" context --target src/planner/TripPlannerTab.jsx

A scratch Playwright script outside the repos (one browser at a time) walked `http://localhost:5199/?tab=trip` at 380 x 800 and 1280 x 800: an empty-storage load, then as an entitled traveller (`?tab=trip&o=CRL&paymock`) through every step of the default path, the country brief, the by-hand grid, the planned trip and a reload at 380, and up to the Where step and the brief at 1280. It saved JPEG quality 80 viewport shots and per-step DOM counts (visible controls, accent-filled controls, scroll heights, small targets).

Two read-only sub-agents ran in parallel, as impeccable's critique asks: an inventory and design read of the 18 surface components and three stylesheets in the app repo main checkout, and Assessment B:

    sh ".../impeccable/scripts/impeccable" detect --json <the 18 surface .jsx files>
    sh ".../impeccable/scripts/impeccable" detect --json <11-trip-planner.css, 12-guided-trip.css, 21-chat-passes.css>
    node scripts/ci/design-lint.mjs    (in the app repo, without --update-baseline; git status clean before and after)

The seven dev-server harnesses ran one after another from a scratch working directory so their screenshots stayed out of the main checkout, each bounded at 420 s:

    node <app repo>/scripts/verify_planner_v2.mjs http://localhost:5199/
    (and verify_planner_v2_flow, verify_planner_t8, verify_where_quiz, verify_when_step, verify_ready_trips, verify_country_brief)

Then `git add` and `git commit` in the T377 worktree, and the merge gate read-only from the main checkout:

    powershell -File Execution/_queue/wave_gate.ps1 -Task T377 -Branch p10-v6-brief-tripplanner

## Config and secrets set

None.

## Before/after measurements

This task builds nothing, so every figure is a "before" for V3 to V5 to move. Sources: the Playwright walk (DOM counts, scratch metrics files), the detector and lint output, the harness logs, and the app source at commit 3b3e5a8.

| Metric | Before (V1) | Target named in the brief |
|---|---|---|
| Step on which the first euro figure appears | 6 of 7 | the first step that has a place |
| Wizard estimate against planned total, same trip | €586 against €771 | one figure |
| Accent-filled controls visible on the Trips step | 12 (plus the primary Next) | 1 |
| Step body scroll height at 380 px: quiz open / Trips | 4,208 / 4,525 px | not set; the first match card and two trip cards in the first screen |
| Planned sheet scroll height at 380 px | 2,546 px | total in the first 400 px |
| Visible controls at 380 px: Booked, When, Where grid, Trips, planned | 12, 32, 102, 51, 71 | not set |
| Room left for the step on a phone (Trips) | about 380 of 800 px | chrome at most 200 px (N7) |
| Gradients on the surface (fills, not masks) | 5 (11:650, 12:633, 12:1140, 12:1199, 19-guide-ratings.css:1312) | 0 |
| Off-token shadows in the three stylesheets | 18 | 0 |
| `border-radius: 999px` in the three stylesheets | 22 | status chips and round icon buttons only |
| Font sizes under 12 px in the three stylesheets | 70 | mono codes only |
| Hard-coded English on the surface | 6 places plus the 103 KB tip file | 0 in components |
| Heuristic score (critique) | 23/40 | not set |
| Audit health score | 10/20 | not set |
| Impeccable detector, 18 JSX files | 0 | 0 |
| Impeccable detector, 3 stylesheets | 3 (11:746 side stripe, 11:232 and 11:250 layout transitions) | 0 |
| Design lint on the surface | 23 baseline entries in the stylesheets, 3 in en.js, 0 new | 0 |
| Load on the dev server: empty storage (splash still showing) / seeded to the first step | 183 s and 141 s at 380; 51 s and 128 s at 1280 | measure on the built app in V5 |

Harness results on the dev server at 5199, 2026-10-08:

| Harness | Result | Reading |
|---|---|---|
| verify_planner_v2 | stopped before its first check | `page.goto` timed out at 45 s |
| verify_planner_v2_flow | 0 of 3 | every pass stopped at `page.goto` (45 s) |
| verify_planner_t8 | 0 of 4 | every pass stopped at `page.goto` (45 s) |
| verify_where_quiz | stopped before its first check | `page.goto` timed out at 45 s |
| verify_when_step | stopped before its first check | `page.goto` timed out at 45 s |
| verify_ready_trips | stopped before its first check | `page.goto` timed out at 45 s |
| verify_country_brief | 0 of 2 | both passes stopped at `page.goto` (45 s) |
| verify_booked_route, verify_handoffs | not run | serve `dist/` through `vite preview`; need a build |
| shoot-planners | not run | four browser contexts; memory |

No harness reached a product check, so this table says nothing about the planner, only about the server.

None of these is a clean baseline. The shared dev server took two to three minutes per load while every harness waits 45 s for the page and then 3 s. `verify_booked_route.mjs` and `verify_handoffs.mjs` serve `dist/` through `vite preview` and need a build, which a docs-only task does not make, so they were not run. `shoot-planners.mjs` was not run either: it walks both planners in four browser contexts, which the laptop's memory did not allow next to the other V1 sessions. V3 reruns all ten on a built app before changing anything (row T377-a).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first "cold" screenshots showed only the splash | The dev server needed 183 s (380) and 51 s (1280) to paint from empty storage, and the script waited for the first button | The cold state was read from the seeded walk and the code; no cold screenshot is in the saved set |
| The first 1280 walk stopped after the Where step | Its reload in the middle of the wizard did not repaint within 240 s on the loaded server, and every later step timed out | Stopped it and started a second 1280 walk without the reload; that run could not load the page within 240 s as the server slowed further, so the 1280 Trips, Stay and planned views and both returning visits are described from the code, and no 1280 planned screenshot was saved |
| The planned-view scroll shots at 380 all showed the top | The script scrolled the wrong container; the sheet scrolls in `.trip-sheet-scroll` | The sheet's content was read from the page text and its height (2,546 px) from the metrics |
| The reload after the planned view showed a blank page | The page had not repainted after the walk's wait | The returning visit is described from the code (`tripDraftStore` stores `planned`) |

## What is still open

T380 has to accept or reject the eight proposals in part 7 of the brief (N1 to N8) before V3 and V4 build anything that depends on them. The cost line on choice cards (N1) and the one selected state (N6) carry the most of the plan.

The harness baseline is not clean (see the table above). V3 starts by running the ten harnesses on a built app and updating, with a comment, the assertions that encode the old design.

Three defects lose or mislead the traveller and are V3 item 1: the planned view's close cross clears an unsaved trip (`src/planner/TripPlannerTab.jsx:430`), Getting there is empty on the build-your-own and booked-beds paths (`src/planner/GuidedTripWizard.jsx:2355`), and the draft restores the step number without `booked`, nights, order, travel values, arrival or pace. The wizard and the planned view compute the trip's total in two places and disagree (€586 against €771 in the walk); that is V3 item 2.

Two items are the owner's decisions. The first is the wording that replaces the three strings that promise fare search (`trip.launcherSub`, `wizard.flexNote`, `wizard.flexPadBtn`). The second is whether "What have you booked already?" stays the first question, or becomes a question inside From.

One item is data work, not design: `src/lib/cheapTips.json` (103 KB of money tips) is English only, so the Travel cheaper section shows English in every language.

Two items are ownership calls for T380's OWNERSHIP.md. The chat planner (CartaChatPlanner, TownPickerStep, RouteBuildingStage and the chat half of 21-chat-passes.css) is mounted only by the Day planner and belongs to that surface. Most of the wizard's control styles live outside the three named stylesheets, in 19-guide-ratings.css, 24-destination-workspace.css, 26-shortlist-extras.css, 17-saved-trips.css, 18-detail-panel.css and 20-day-planner-flow.css.

One small defect for the first build session: the recap chip that links back to a step renders larger than its neighbours and runs off the right edge at 380 px, because `.guide-recap-chip.is-link` sets `font: inherit` (`src/styles/19-guide-ratings.css:2178`).

No string was added in V1, so no native-review row is needed yet; V3 raises it with its strings.

Every item above is a row in `Execution/_OPEN.md`, T377-a to T377-j.

## Rollback procedure

The task added two documents and ten register rows. To undo it, revert the two commits on the branch:

    git revert <report commit> <brief commit>

Or, before the merge, delete the branch p10-v6-brief-tripplanner. The screenshots sit outside both repos and can be deleted with the `tripplanner` folder under design-v6-shots. Nothing in the app, the data or production changed.

## Seven questions

No visual change shipped, so the seven questions apply to the plan and not to a diff:
1. The plan adds no hex and removes five old-accent rgba values.
2. It removes five gradients and adds none, and adds no colour.
3. Ochre stays for ratings only; the plan takes the accent off data (the month strip, counts, the progress bar) and leaves teal and `--danger` untouched, except a destructive item in the N8 menu, which is what `--danger` is for.
4. Mono stays for figures: the plan moves "2 travellers" and "nothing yet" out of mono.
5. One primary per view: the twelve Choose buttons and the second primary on the day tab become secondaries.
6. Every new heading the plan names carries a verb or a number, and the brief has no dash and no banned word.
7. The thing to remove is the estimate band's sweep flash.
