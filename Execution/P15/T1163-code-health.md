# T1163: code health, the six largest app files split (ROADMAP H14)

Round 2 session S79, batch 9. ROADMAP item **H14** (audit P-43, P-44, P-45). Branch `p15-s79-code-health` from `p15-round2`.

## Date

2026-11-07

## What changed

The six god components ranked by churn times size are split into 68 focused modules with no behaviour change, and the dead code is out. `App.jsx` 2,446 to 1,888 lines (its overlays now one `shell/AppOverlays.jsx`, lazy screens, openers and the settings value in `src/shell/`), `DayPlannerTab.jsx` 4,449 to 2,227 (start screen, day body and ten hooks in `planner/days/`), `DestinationsTab.jsx` 4,185 to 2,325 (one hook per layer, the facet groups, the map items and six list components in `browse/destinations/`), `ExploreTab.jsx` 2,027 to 801 (`browse/explore/`), `GuidedTripWizard.jsx` 1,789 to 1,166 (seven hooks in `planner/wizard/`) and `TripPlannerTab.jsx` 1,603 to 680 (`planner/trip/`). Together the six files are 16,499 to 9,087 lines. 26 unreferenced files (3,007 lines) are deleted, each proven absent from the Vite module graph, the tests and the scripts. The trip finder's `TripPage.jsx` is now `FoundTripPage.jsx`, so only the library trip page is called `TripPage`. The 125 react-refresh warnings carry one line-level baseline comment each, so lint now shows 0 of them and a new one stands out. Unit tests, lint (0 errors), the fast build and design lint (0 new) pass; the DOM verify scripts give the same result on the split code as on the base branch. The cost is 1.1% more first-paint JavaScript (16.4 KB raw, 5.4 KB gzip), the plumbing of arguments and props across the new boundaries (row T1163-a).

## Research

A research subagent compared the options (versions checked on registry.npmjs.org on 2026-11-07).

| Need | Options | Choice and why |
|---|---|---|
| Prove files dead | knip 6.44.1 (ISC, plain JS and Vite supported, reads files only); madge 8.0.0 (MIT, cycles, no unused exports); dependency-cruiser 18.7.2 (MIT, orphans, heavier set-up); unimported 1.31.1 (deprecated); ts-prune 0.10.3 (TypeScript only, points to knip); a custom pass over the Vite module graph | knip for the candidate list, cross-checked against the build's own module graph (a throwaway plugin recording `this.getModuleIds()`), then a grep of tests, scripts, CI and the Python side for path strings, because knip misses `vite.ssrLoadModule('/src/...')` and `fetch('/src/...')`. That cross-check saved 7 files knip called dead. https://knip.dev, https://github.com/webpro-nl/knip |
| Split 4,000-line components safely | Hand extraction; jscodeshift 17.4.0 (MIT) codemods | Extraction by a small Babel tool written for this task (scratch only, not committed), because the files are single components (DayPlannerTab was one 4,244-line function) and hand moves of hundreds of closures are where mistakes hide. It computes inputs and outputs from scope analysis and refuses any move that could change behaviour: a value declared after the region (TDZ), a reassigned input, an output reassigned or read before the region, a top-level return in a hook region, `this` or `arguments`, a self-import. Imports stay one way (parent imports child). |
| react-refresh warnings | `allowConstantExport` (already on), `allowExportNames`, `extraHOCs`, per-file disable, moving exports into `.js` modules (eslint-plugin-react-refresh 0.5.7, MIT, https://github.com/ArnaudBarre/eslint-plugin-react-refresh) | Moving every export is a 61-file refactor outside the six files, and `eslint.config.js` is outside this brief. A line-level `eslint-disable-next-line` on exactly the 125 existing exports is a precise baseline: nothing else is hidden, and any new warning shows. The new modules add none (non-component helpers stay unexported, `lazyWithReload` screens live in a `.js` file). |

## Files touched

- Split parents (modified): `continent-app/src/App.jsx`, `continent-app/src/planner/DayPlannerTab.jsx`, `continent-app/src/browse/DestinationsTab.jsx`, `continent-app/src/browse/ExploreTab.jsx`, `continent-app/src/planner/GuidedTripWizard.jsx`, `continent-app/src/planner/TripPlannerTab.jsx`.
- Created (68): `continent-app/src/shell/` (AppOverlays.jsx, TabFallback.jsx, lazyScreens.js, heldPlan.js, useAppOpeners.js, useAppSettingsValue.js); `continent-app/src/browse/explore/` (13: ExploreCard, ExploreContent, ExploreToolbar, OverviewHero, SortMenu, exploreConsts, exploreMapLazy, useExploreAsk, useExploreChips, useExploreLens, useExploreMapView, useExploreRails, useExploreRows); `continent-app/src/browse/destinations/` (19: BeachList, LakeList, MountainList, CycleList, ItineraryList, TrailTripList, DestTabParts, browseMemory, destTabConsts, lazyPages, useBeachLayer, useLakeLayer, useMountainLayer, useCycleLayer, useItineraryLayer, useTrailLayer, useFacetGroups, useDestMapItems, useDescribeFacts); `continent-app/src/planner/days/` (13: DayPlannerStart, DayBody, dayPlannerData, useDayStartData, useDayChatAi, useDayEdits, useDayExports, useDayTrip, useDayMapDecks, useDayAiApply, useDayBuilder, plus the existing folder); `continent-app/src/planner/trip/` (12: MoreMenu, OwnCarFromEditor, Suggestions, KeepTripChoice, TripOverlays, TripPageSummary, TripItineraryView, tripPlannerConsts, useTripSave, useTripMap, useTripPlannerEffects, useTripHistory); `continent-app/src/planner/wizard/` (7: useWizardPricing, useWizardHandOver, useWizardCountries, useWizardTravel, useWizardSelection, useWizardDraftSync, wizardRecapChips).
- Renamed: `continent-app/src/planner/finder/TripPage.jsx` to `FoundTripPage.jsx` (export `FoundTripPage`), its one importer `continent-app/src/planner/finder/FindingTrips.jsx`.
- Deleted (26): `continent-app/src/auth/radioKeys.js`; `continent-app/src/browse/` BathingWater, CrowdCalendar, DerivedModules, FlashDeck, GettingThere, HonestFooters, LifestyleButton, LifestyleSlider, RailFold, RouteFacts, RoutesFromHere, SwimSafety, WaterSheet, WebcamEmbed, WeekPlan (`.jsx`); `continent-app/src/components/` CountryPicker, CrowdingBadge, FactMeter, FavStar, KindGlyph (`.jsx`); `continent-app/src/lib/citytrips.js`; `continent-app/src/planner/WhereQuiz.jsx`, `continent-app/src/planner/flow/BookedDoor.jsx`, `continent-app/src/planner/flow/KnowDoor.jsx`, `continent-app/src/planner/trip/CostTiles.jsx`.
- One baseline comment line added before each of the 125 react-refresh exports in 61 files under `continent-app/src/`.
- `continent-app/scripts/ci/design-lint.baseline.json` (regenerated; see the measurements), `MAP.md`, `ROADMAP.md` (H14 status), `Execution/_OPEN.md` (rows appended), this report.

## Commands run

```
npx -y knip@6.44.1 --include files --reporter json        # candidates
# build graph: a scratch vite config adding generateBundle() { this.getModuleIds() }
git rm <26 files>
node <scratch>/extract.mjs move|hook|jsx|block ...          # one call per extraction, scripted per file
node <scratch>/fixdeps.mjs <original> -- <files>           # see "What broke"
node <scratch>/comments.mjs <original> <parent> <modules>  # every comment kept, per file
git mv src/planner/finder/TripPage.jsx src/planner/finder/FoundTripPage.jsx
node scripts/ci/design-lint.mjs --update-baseline
python -I scripts/docs/check_entry_points.py
npm test; npm run lint; FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs
node scripts/sync-data.mjs --split-only                    # local boot.json and dest/ for the browser checks (gitignored)
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| `App.jsx` lines | 2,446 | 1,888 | -558 |
| `DayPlannerTab.jsx` lines | 4,449 | 2,227 | -2,222 |
| `DestinationsTab.jsx` lines | 4,185 | 2,325 | -1,860 |
| `ExploreTab.jsx` lines | 2,027 | 801 | -1,226 |
| `GuidedTripWizard.jsx` lines | 1,789 | 1,166 | -623 |
| `TripPlannerTab.jsx` lines | 1,603 | 680 | -923 |
| The six together | 16,499 | 9,087 | -7,412 |
| New modules | 0 | 68 files, 8,601 lines | +1,189 lines of imports, parameters and returns |
| Largest new module | | `useDayStartData.js` 510, `DayPlannerStart.jsx` 499 | |
| Dead source files | 26 (3,007 lines; the audit counted 18) | 0 proven dead | -26 |
| Two files named `TripPage.jsx` | 2 | 1 | -1 |
| Lint errors | 0 | 0 | 0 |
| react-refresh warnings | 127 (audit), 127 at start | 0 shown (125 on the line baseline, 2 went with the dead files) | -127 |
| no-unused-vars warnings | 34 | 34 | 0 (33 after the dead files, +1 `TitleTag` false positive in ExploreToolbar, row T1163-h) |
| Other lint warnings (unused disable directives, pre-existing) | 2 | 2 | 0 |
| `npm test` (no local data) | 1,823 pass, 0 fail, 12 skipped | 1,823 pass, 0 fail, 12 skipped | 0 |
| `npm test` with the local boot.json split | not run | 1,826 pass, 4 fail: 3 data tests fail the same on the base branch with the same data (rank tier check fails on this container's data), 1 design lint before the baseline was migrated | |
| Design lint total | 4,614 | 4,595 | -19 (dead files); no rule and text pair grew, 0 new |
| Fast build JS chunks | 133 | 131 | -2 (five small shared chunks folded into the entry, one renamed) |
| Fast build all JS | 8,230,672 B (2,571,454 gzip) | 8,265,066 B (2,584,422 gzip) | +34,394 B (+0.4%) |
| Entry chunk `index` | 836,272 B (267,613 gzip) | 853,225 B (275,397 gzip) | +16,953 B |
| First-paint JS (entry plus modulepreloads) | 1,506,332 B (494,300 gzip), 47 files | 1,522,746 B (499,715 gzip), 45 files | +16,414 B (+1.1%), +5.4 KB gzip |
| `DayPlannerTab` chunk | 251,750 B | 261,881 B | +10,131 |
| `TripPlannerTab` chunk | 445,172 B | 453,295 B | +8,123 |
| Fast build time | about 2 s | about 2 s | 0 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| knip called 33 files dead | It does not see `vite.ssrLoadModule('/src/...')` in tests, `fetch('/src/...')` in `verify_day_dates.mjs`, or the explainer's `imp('src/lib/accuracy.js')` | Cross-checked against the build graph and a path grep; kept 7 (row T1163-b) |
| A moved `lazy(() => import('./ExploreMap.jsx'))` pointed at the wrong folder | Relative dynamic imports move with the code | The tool rewrites `import('./x')` and `new URL('./x', ...)` paths for the new folder; checked by grep and the build |
| A module imported itself after a second move into the same file | A name the parent had imported from that module | The tool drops imports from the target file |
| A trailing `// eslint-disable-line` stayed in the parent, and once a comment was copied twice | Same-line comments sit outside the statement node, and Babel also attaches them to the next statement | Region ends now run to the end of the line; a per-file comment multiset check (original against parent plus modules, whitespace folded) shows 0 lost or duplicated in all six |
| `react-hooks/exhaustive-deps` errors in extracted hooks | `useState` setters and `useRef` objects lose their known-stable status when they arrive as arguments | Added only names proven to be a setter or ref in the original file (ESLint's own suggestion, 39 arrays, never removing a dep). Two memos also read parent functions that are fresh every render; adding them would make the memo recompute each render, so the original deps stay with a commented disable line (`useDestMapItems.js`, `useFacetGroups.js`) |
| `sectionBoundary.test.mjs` failed when the four tab panels moved out of `App.jsx` | The test reads `App.jsx` for each named `SectionBoundary` | Kept the tab panels in `App.jsx`; only the overlays moved |
| Statement anchors matched the wrong statement once (`useAppSettingsValue` took one line) | The anchor window ran past the end of a short statement | The window stops at the statement's end; the App split was replayed from the base file |
| Design lint reported moved violations as new | Its baseline keys on file path | `--update-baseline`, then proved per rule and line text that no count grew (total fell by the 19 in deleted files) |
| Browser checks could not load data | This checkout has no `public/boot.json` or `dest/` (gitignored, built from the master dataset) | `sync-data.mjs --split-only` from `public/app_data.json`; the rank tier check fails on this data, so both sides of every comparison use the same data |
| Playwright in the app wants chromium 1228; the container has 1243 | Version pin | `PLAYWRIGHT_BROWSERS_PATH` to a scratch folder linking 1228 to 1243 |
| Several extracted parts take many arguments (DayPlannerStart 93 props, DayBody 79, AppOverlays 67, ExploreContent 56, useFacetGroups 52) | Mechanical extraction passes every free name | Kept: the 150-prop wizard step canvas, the 104-prop DestinationsTab list switch, the four App tab panels and a 46-input `startOver` hook were rolled back as poor value. Grouping the rest is row T1163-f |

## Screens checked

DOM checks, not screenshots: each `scripts/verify_*.mjs` below ran against the base branch (`origin/p15-round2`, dev server on 4174) and the split code (the committed branch, dev server on 4175), on the same local data, and the PASS and FAIL lines were compared. The scripts cover phone and desktop widths where they define them.

VERIFY_TABLE

Not run here: `verify_core_flow.mjs` and `verify_plan_short.mjs` (they expect a served fast build on port 5871 and a shots folder); `verify_trip_price_consistency.mjs` fails the same 5 checks on both sides (data on this container).

## What is still open

- T1163-a: first-paint JavaScript grew 1.1% (16.4 KB raw, 5.4 KB gzip) from the argument and prop plumbing and five small shared chunks folding into the entry; a follow-up can pass grouped objects or context on the hot paths. Next task, with H12.
- T1163-b: seven files knip flags but the checks still load: `planner/AiDayPlanModal.jsx` and `planner/AiPlanRoute.jsx` (no longer mounted; `verify_day_dates.mjs` and the AI proposal harness read them), and `components/admin/AiCalls.jsx`, `useAiCalls.js`, `SloPanel.jsx`, `hooks/useSloSnapshot.js` (tested, never mounted in the admin page), plus `lib/accuracy.js` (read by the numbers explainer). The owner decides: mount the two admin panels, or delete them with their tests and move the day-dates check to `DayBotChat`.
- T1163-c: CSS for the 26 deleted components is still in the stylesheets (CSS was outside this brief).
- T1163-d: `docs/HANDBOOK.md`, `docs/SCHEMA.md`, `docs/areas/climate-crowds.md` and `docs/areas/trip-library.md` still name deleted files or `planner/finder/TripPage.jsx`.
- T1163-e: the 125 react-refresh baseline comments: work them down by moving non-component exports into `.js` modules, then set the rule to `error` in `eslint.config.js` (outside this brief) so a new one fails CI.
- T1163-f: group the long argument lists of the extracted parts (see the last row of the table above) where a screen is next touched.
- T1163-g: `DestinationsTab.jsx` 2,325, `DayPlannerTab.jsx` 2,227 and `App.jsx` 1,888 are still the largest app files. What is left is mostly render JSX and closures that read state declared further down, which this tool refuses to move (TDZ); the next split reorders declarations by hand first.
- T1163-h: `no-unused-vars` cannot see a destructured prop used only as a JSX tag (`TitleTag` in `OverviewHero.jsx` and now `ExploreToolbar.jsx`); a config change (`argsIgnorePattern` or `react/jsx-uses-vars`) is outside this brief.

## Owner steps (for the checklist)

- [T1163-b] Decide on four unmounted admin and AI files | they are tested but never shown, so they are either a lost feature or dead code | open the admin page and confirm AI calls and SLO panels are not there; choose mount or delete; tell the next task which | Execution/P15/T1163-code-health.md (What is still open)

## Rollback procedure

`git revert` of the T1163 commits on `p15-s79-code-health` (or of the merge). Nothing is one-way: no data, schema or migration changed. The deleted files come back with the revert of the first commit.
