# T433: Day planner rebuilt (flow, Carta's questions, builder, planned day, checked routes)

## Task ID

T433

## Date

2026-10-16

## What changed

The day planner now works the way the trip planner does, plans several days, and checks every walk it draws.

**The questions.** They wear the trip planner's own wizard frame: the same classes, a kit `StepRail` and a `DayWizardShell`. That gives the same named rail, "Step x of 5", the phone's one-line bar and steps sheet, and Back beside a primary that says where it goes. The five steps are Start, Days, Ideas, How, and then Carta's questions or Places.
- The copy that repeated each question is gone.
- "Continue a trip" is now "Plan a day of your trip": one compact row per saved trip, named by its towns rather than "Untitled".

**Several days.** Days takes a date and a number of days, from 1 to 7. A trip's stop presets its nights. Picks are cut into days by neighbourhood (`lib/daySpread.js`, `planner/dayBuild.js`). The builder's "Your days so far" previews exactly the days "Open my days" opens.

**The start's name.** The "Elst" bug came from naming the start after the best-rated catalogue town within 30 km, plus a researched town kept on the device forever. The start is now named by its own locality, and the day's town is the nearest one by distance.

**Carta's questions.** They are tiles from the kit and add a step-free answer, an end-of-day indoor option, and an on-foot or transit choice. The last screen says "Carta plans 3 days around Rome" and shows what it costs before the tap. The plan opens straight on the day.
- The AI may only choose catalogue places. Both the app and the function drop anything else.
- Code orders and times every day, not the model.

**Credits.** Every control that spends an AI plan carries a credit chip ("Uses 1 plan, 2 left", "Sign in for 2 free plans", "No plans left").

**The planned day.** On a phone it is a page, the trip planner's pattern:
- A summary card: the time span, stops, km on foot and steps, and the per-person day figure Explore prints for the town (the before critique's P1).
- A day bar with hour ticks.
- A 180 px map card that opens a full map.
- A timeline with clock times, legs in minutes and km, "Check hours" (the catalogue has no opening hours, so the day never claims a place is open), the day kit (tips, notes and files, import) and an export row.
- The PDF is a Figtree booklet, and a `#day=` link opens the plan on another device.

**Route safety.** Every leg is routed on OSRM's footpaths and judged (`lib/dayRoute.js`). A leg with no footpath, a footpath that goes far round, a hop beyond walking range, or a stop more than 350 m from any path becomes a ride with directions. It is never drawn as a walk.
- `verify_day_routes.mjs` builds 1- and 3-day plans in 20 towns and cross-checks every walk on a second router (Valhalla).
- The first runs caught two seabed reserves at Cinque Terre that OSRM snapped to a coastal path.
- The final run passes: 400 legs, 361 walks cross-checked, 0 that Valhalla cannot walk, 0 disagreements.

**The plan-day function.** It now takes `days`, keeps catalogue places only, makes two refines of a paid plan free through a signed token (no migration), and leads with the Flash-Lite models. It needs the owner's deploy (T433-a); until then the app degrades cleanly.

**Critique.** The dual-agent impeccable critique scored the old planner 19/40 and the rebuild 28/40. One fix batch followed on its findings.

## Files touched

App repo (`continent-app/`, branch `p11-day-planner`, commit 0c9ff0d), mirrored into the root repo.

**Created:**
- src/planner/DayWizardShell.jsx (the trip wizard's frame for the day flow)
- src/components/ui/StepRail.jsx (the step rail, mini bar and steps list as a kit piece, exported from ui/index.js)
- src/components/CreditChip.jsx (what an AI action costs, before the tap)
- src/planner/DayOverview.jsx (summary card, day kit, export row)
- src/planner/dayBuild.js (picks to towns and days; the preview clock)
- src/lib/daySpread.js (days by neighbourhood; walk order)
- src/lib/dayRoute.js (every leg routed and judged; map segments; day checks)
- src/lib/dayPdf.js (the booklet, lazy-loaded)
- tests/daySpread.test.mjs, tests/dayRoute.test.mjs, tests/shareLinkDay.test.mjs
- scripts/measure_day_planner.mjs (before and after at 390, 820, 1024 and 1440)
- scripts/verify_day_routes.mjs (two-router route check)

**Modified:**
- src/planner/DayPlannerTab.jsx: the landing in the wizard frame, the Days step, the fork on kit cards, multi-day plan creation for both paths, catalogue-only import that never opens an empty day, the planned day as a page, the route checker, the share link, the PDF hook, shared links opened, and dead code removed (the bottom sheet, map filter card, citytrip, ready-made routes and AI discovery pins).
- src/planner/CartaChatPlanner.jsx: questions as tiles inside the frame, a summary with the cost, catalogue-only, opens straight on the day.
- src/planner/DayExploreBuilder.jsx: the frame, a start named correctly, nothing printed on photos, photo-less places as kit rows, TripMap, and the "Your days so far" preview.
- src/planner/DayPlanPanel.jsx: the timeline, the day bar, judged legs, and the phone's "More" menu on stops.
- src/planner/DayIdeasStep.jsx: no yes/no fork, the strongest places shown with photos, and a time-of-day select.
- src/planner/DayTripCards.jsx: "Plan a day of your trip" as kit rows.
- src/planner/DayAddPanel.jsx: the ready-made "Whole days" mode removed.
- src/planner/DayWorkspaceChrome.jsx: DayTipsBody for the kit; the floating tips panel, tab rail and bot prompt list removed.
- src/planner/AiDayPlanModal.jsx: the credit chip, and refines that carry the free-refine token.
- src/planner/TownPickerStep.jsx and src/planner/MagicImportZone.jsx: the credit chip.
- src/planner/dayFormat.js: fmtKm, in the reader's locale.
- src/lib/routing.js: each leg's own line, and how far each point lay from a path.
- src/lib/shareLink.js: the `#day=` link (whitelisted, clamped, prototype names refused, out-of-range indices dropped).
- src/lib/geocode.js: `locality` on every hit.
- src/map/TripMap.jsx: a grey dashed "ride" line, so a leg Carta could not walk is never drawn in brown.
- src/App.jsx: the cost map and the shared-day link passed to the planner.
- src/components/ui/index.js: exports StepRail.
- src/i18n/en.js, nl.js, de.js, fr.js, es.js and it.js: 104 new keys in each, and "Your days so far".
- src/styles/68-v6-dayplanner.css: the T433 section. Dead rules pruned there and in 13-day-planner.css, 20-day-planner-flow.css, 21-chat-passes.css and 32-day-carousel.css (527 rules).
- scripts/shoot-planners.mjs: the new day walk to the planned day; a kit Card counts as its whole tap area.
- scripts/ai/test_plan_logic.mjs: refine token, cache v6 and model-chain tests.
- scripts/ci/design-lint.baseline.json: shrunk.

**Deleted:**
- src/planner/dayPlanPdf.js (the print-window PDF)

**Root repo:**
- supabase/functions/plan-day/index.ts: days, catalogue-only stops, events kept beside the day, free refines, multi-day without the one-day walking cut.
- supabase/functions/plan-day/logic.mjs: the model chain led by the lite models, signRefineToken and verifyRefineToken, CACHE_KEY_VERSION 6.
- Execution/P11/T433-day-planner.md (this report).
- Execution/P11/T433-shots/: before/ (26 screens), after/ (26 screens), measure/ (before and after at four widths, with the JSON), after-day-booklet.pdf.
- Execution/P11/T433-critique/before.md and after.md.
- Execution/_OPEN.md rows.

## Commands run

```
git -C continent-app checkout -b p11-day-planner master ; git checkout -b p11-day-planner main
npx vite --port 4260 --strictPort                                   # continent-app, the live build
git -C continent-app worktree add ../../wt/t433-before master        # master on 4261 for "before", public/node_modules junctioned
node scripts/shoot-planners.mjs --url=http://localhost:4260/ [--only=day]
node scripts/measure_day_planner.mjs --url=http://localhost:4261/ --label=before --shots=../Execution/P11/T433-shots/measure
node scripts/measure_day_planner.mjs --url=http://localhost:4260/ --label=after  --shots=../Execution/P11/T433-shots/measure
node scripts/verify_day_routes.mjs                                  # OSRM + Valhalla, about 10 minutes
node scripts/ai/test_plan_logic.mjs ; npm test
node scripts/ci/design-lint.mjs [--meter ...] [--update-baseline] ; node scripts/ci/token-contrast.mjs ; node scripts/ci/banned-terms.mjs
npx vite build
impeccable.cmd context ; impeccable.cmd detect --json <13 changed files>   # []
python scratchpad/add_keys.py <keys> src/i18n                        # 6 catalogs
node scripts/_t433_prune.mjs <day css files>                         # temporary, postcss; deleted
```

## Config and secrets set

None. The plan-day function signs refine tokens with the existing `SUPABASE_SERVICE_ROLE_KEY`; no new secret. If `GEMINI_MODEL` or `GEMINI_MODELS` is set on the project, it overrides the new chain order (T433-a).

## Before/after measurements

Before is app master f603b74, run from a worktree. After is this branch. The walk is the same each time: a hotel in Rome, the first offered date, no ideas, Build it myself, three places, open the day.

| Metric | Before | After | Delta |
|---|---|---|---|
| impeccable critique (dual agent) | 19/40 | 28/40 | +9 |
| impeccable detector, changed files | [] | [] | |
| Planned day: per-person day figure in the first screen (phone, iPad, desktop) | absent at every width | present at every width | the before critique's P1 |
| Planned day: map share of the phone's first screen | 83% | 19% | -64 pp |
| Bot plan opens on | an empty "Plan day 1" (outside places dropped) | the planned day(s) | the before critique's P0 |
| Taps from the landing to a planned day | 11 | 10 | -1 |
| Words in the phone's first screen: start, days, ideas, how, builder, planned | 51, 81, 59, 61, 112, 51 | 35, 73, 61, 47, 107, 56 | fewer on 4 of 6 |
| Fixed chrome on the phone's questions | 19 to 24% | 25% | the trip planner's frame (header, rail, footer) |
| Days one plan can hold | 1 | 1 to 7 | |
| Walk legs checked on a second router (verify_day_routes) | none | 361 of 370, 0 unwalkable, 0 disagreeing | |
| Legs drawn as rides instead of walks (same run, 400 legs) | none (all drawn as walks) | 20 detours, 10 off-path places | |
| AI controls showing their cost before the tap | 1 (modal) | 6 (fork, summary, Ask Carta, refines, town AI, Magic Import) | |
| Tap targets under 44 px on 26 day screens (shoot-planners) | 3 | 0 | |
| design-lint raw buttons, planner/Day* plus CartaChatPlanner | 108 + 20 | 37 + 1 | -90 |
| design-lint legacy token reads: 13, 20, 21, 32, 68 | 75, 261, 134, 10, 295 (775) | 10, 141, 102, 4, 183 (440) | -335 |
| design-lint font-size literals in the same five | 31, 99, 55, 4, 101 (290) | 5, 50, 39, 1, 67 (162) | -128 |
| design-lint total violations | 9,068 | 8,527 | -541 |
| Day planner CSS (13, 20, 21, 32, 68) | 6,340 lines | 4,273 lines | -2,067 |
| Tests | 407 | 434 | +27 (spread, route, share link) |
| plan-day logic tests | all pass | all pass, +14 (refine token, v6 key, chain) | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The planned day looped "Maximum update depth exceeded" | With no pickable pins, TripMap reframes when its stops, segments or padding change by identity, and the reframe reports the view back | The three are memoized above the early return |
| The Days step squeezed the whole wizard into 420 px | The shell's modifier class `dayw-when` collided with the calendar grid class | Modifiers are `dayw-on-*` |
| The builder's desktop map drew an empty box | `.trip-map { left: var(--panel-w) }` from 769 px is for the trip planner's side panel | Maps in a card or a sheet set `left: 0` |
| "Check hours" and the trip link were white on paper | `--action-text` is the label colour on a filled button | Text links use `--action` |
| The preview counted a 22 km hop to Lake Albano as 27.9 km on foot | The first leg from the start was always a walk | Past 2.5 km it is a ride, as the planned day draws it |
| A shared link's out-of-range place index became index 0 or 5000 | clampInt on indices | Out of range is dropped (test) |
| Two Cinque Terre seabed reserves were drawn as walks | OSRM snaps a point any distance to the nearest path; the leg looked short | A stop more than 350 m from any path makes its legs unreachable (test, two-router run passes) |
| 9 of 20 test towns had no places | The verifier measured from the airport (the catalogue pins airport towns on the runway) | It reads city_lat/city_lon |
| The phone fork photo stayed 16:9 | `aspect-ratio` yields to an image's intrinsic height | The image is positioned inside a fixed frame |
| The CSS pruner kept dead `.chat-*` and `.day-*` rules | React keys and calendar UIDs written as `chat-${...}` and `day-${...}` looked like class prefixes | Those prefixes ignored on a second pass, both planners re-shot with 0 offenders |
| 20 new raw buttons failed design-lint | Copied rail markup and hand-rolled controls | The rail is a kit piece; the rest are Button, IconButton, Chip, Segmented and Card |
| A heredoc broke on the plan-day patch | Bash quoting | Patch scripts written to the scratchpad |

## What is still open

**The owner's deploy (T433-a).** The plan-day function changed and is not deployed. Until it is:
- The app still plans one day per AI call and fills further days from the catalogue.
- The app drops any place outside the catalogue itself.
- Refines cost a plan as before, because no token comes back.

If a `GEMINI_MODEL` or `GEMINI_MODELS` secret is set, it overrides the new lite-first chain.

**No opening hours (T433-b).** The catalogue holds none for any place (0 of 3,865 POI shards). The day therefore links "Check hours" instead of checking them. The data lane would need `opening_hours` from OSM per POI before a day can say "open when you arrive".

**POIs that are not visitable places (T433-c).** The route check found marine reserves ("Fondali Punta Mesco") listed as nature places. The planner now draws rides to them. The owner's planned POI curation is the real fix.

**The old day harnesses (T433-d).** These drive markup that is gone:
- verify_day_dates, verify_day_ideas, verify_day_landing, verify_day_overview, verify_day_start_point, verify_day_steps, verify_day_workspace
- verify_continue_trip
- scripts/ai/verify_day_flow, verify_day_custom
- the day parts of verify_audit_round2 and verify_keyboard

`shoot-planners`, `measure_day_planner` and `verify_day_routes` cover the flow now. The old ones need repairing onto the new markup or retiring. Two of them were already failing before T433.

**Maps still on DayExploreMap (T433-e).** TownPickerStep (the bot's town question) still uses it, while every other day map is TripMap.

**Native review (T433-f).** The 104 new strings in five languages were written by a session.

**The real-phone pass (T433-g).** The page scroll in the planned day on iOS Safari, the map card's cooperative gestures, the steps and kit sheets over Safari's bar, and the Ideas time select.

**The after critique's open items** (each a row):
- The builder preview and the planned day time a day with two clocks. The preview is straight-line, marked "~"; the day is routed. Usually 10 to 15 minutes apart (T433-h).
- The fork and rail chrome on a phone is about a third of the screen with the bottom nav visible. The trip planner has the same; T432-g asks whether the nav hides in a flow (T433-i).
- Card titles are `h3` under the step's `h1` with no `h2`. The kit Card always renders `h3` (T433-j).
- The trip row's photo shows a broken image when the URL fails. HeroImage has no onError fallback (T433-k).
- Catalogue kinds read "Theatre" for the Colosseum and "Square" for the Forum, and visit times come from the kind: data (T433-l).
- Trail rows sit at the trail's centre, not its trailhead, so their walking distance points to the middle of the route (T433-m).

**Kept as owner calls.**
- The step-free answer shortens legs to 0.9 km and asks the model for level access. The catalogue holds no accessibility data, so "step-free" is advice, not a guarantee (T433-n).
- `routing.openstreetmap.de` (OSRM) is a public FOSSGIS service under a fair-use policy. Launch traffic may need a self-hosted router on the Hetzner box (T433-o).

**Not done from the plan.** impeccable's `generate` and `live` variant modes need the owner in the browser to pick between variants, so the fork cards and the day header were settled by screenshots and the critique instead. ExploreMap.jsx has one pre-existing eslint error (an exhaustive-deps warning raised to error) that this task did not touch. The before worktree's folder `wt/t433-before` is unregistered from git but could not be deleted while a process held it. Nothing is deployed or pushed.

**Closed:** none. T432-f (the calendar's 24 px arrows and greyed middle range day) stays open; the day planner's Days step shows the same.

## Carta-design: the seven questions

1. No hex outside the tokens: design-lint reports 0 new violations, and token-contrast reports 0 pairs under the floor.
2. No gradient and no new colour. Brown is used for actions, the live route and selection. The ride line is `--text-3`, and the "checked" line is `--good-ink` with its words.
3. Selected states are the tint plus a mark (Chip, Tile, the chosen start, the picked builder cards). Sun is not used, and `--danger` is not used.
4. No figure is under 12 px and no functional text under 11 px. Times and figures use tabular numerals. The day figure goes through `<Money>`, and kilometres through Intl.
5. Each view has one primary. "Skip" was made quiet in the fix batch. No text sits on a photograph: "Must see" moved under the name, and the trip status moved into the meta line.
6. Headlines are questions or verbs ("How do you want to plan it?", "Plan a day of your trip"). No dashes, middots or banned words: banned-terms passes and stripDashes runs. "Pick from 84 places" is close to a count; kept, because it tells the traveller what the builder holds.
7. Removed one thing more: the floating Local tips button over the map went into the kit.

## Rollback procedure

App repo: `git -C continent-app revert -m 1 <the T433 merge on master>`, or `git -C continent-app reset --hard f603b74` before anything else lands. Root repo: `git revert -m 1 <the T433 merge on main>`.

Data and storage:
- No data, schema or migration changed.
- Standalone day plans saved by T433 load on the old code: several days are ordinary `stops[].days`, and per-day picks keep `{stopIdx:{dayIdx:[]}}`.
- `#day=` links do nothing on the old code.

The plan-day function is undeployed. If deployed and then rolled back, redeploy the previous version: the `days` and `refineToken` fields are ignored by it, and the v6 cache key just misses the v5 rows.
