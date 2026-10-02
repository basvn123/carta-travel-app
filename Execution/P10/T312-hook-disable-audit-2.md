# T312 Exhaustive-deps disable audit, the rest of src

## Task ID

T312 (register row T283-a, the remainder of T192-d after T283; no mind-map prompt). Branch p10-hook-disable-audit-2 in both repos.

## Date

2026-10-03

## What changed

Outside src/planner, src now hides 20 hand-picked dependency lists instead of 44, and every one of the 20 carries its reason on the directive (`// eslint-disable-line react-hooks/exhaustive-deps -- reason`). T283 left 45 disable comments outside the planner (row T283-a). One of them, browse/CategoryRail.jsx:41, was the unused directive T282 already removed (T192-c), so 44 were in scope. 24 are gone and each of those hooks now lists what it reads. Across all of src the count is 55 before and 31 after, and all 31 have a written reason (the other 11 are T283's ten in the planner and T282's one in i18n/index.jsx).

The removals use four patterns. First, a dependency the rule could not prove stable is now listed because it is stable: App's useState setters handed through usePanelState and props (goToTab, the friend and guide hand-offs, Explore's URL hydrate and its rails memo), the `init` snapshot and `setChoices` in useAppData, the ref objects passed to useFocusTrap, and AccountPanel's onViewChange (App passes setAccountView). Second, helpers rebuilt on every render became callbacks so the memos that call them can list them: SavedTripsPanel's destCoords, resolveImage, cityCoords and the four plan city and country helpers, all keyed on the catalogue or an index built from it. Third, a value read at event or load time is read through a ref: DestMap's focus pin (restyled in place by its own effect), DestMap's and ExploreMap's load handlers, the focus trap's skipEscapeWhen predicate, and the shared price range seed in useDestinationSearch. Fourth, state that resets when a prop changes is reset during render, which is React's documented pattern for it: useFolds (TripPage, JourneyPage, CountryBrief) and AroundHere's tab reset on a new town. That pattern also removes one frame in which the old subject's folds or tab showed. The rest list a value by name: TrailPage's story memo keys on the nearby town's name and distance, CityPickerMap's recentre on the anchor's latitude and longitude, App's trip_days sync on `choices.trip_days`, and the one-shot link effects (friend, guide, share token, destination) on the state they read, which is either never set again or set only to an empty value that returns early.

Two bugs came out of it. The first is real and visible: a shared Explore filter link lost its App-owned filters. ExploreTab's URL writer was declared before its hydrate effect, effects run in declaration order, and the writer's first run, with gemOnly, unescoOnly, the country filter and the sort still at their defaults, deleted xg, xu, xc and xs from the address bar before the hydrate read them. So `?tab=map&xg=1` opened unfiltered (48 cards, 0 hidden gem badges, on the unchanged base as well). The hydrate now runs first, and the same link opens with 48 cards and 48 hidden gem badges at both widths. The second is latent: ExploreMap seeded its map source from the payload of the render that created the map, while the setData effect skips until the map is ready, so a catalogue that grew between creation and load drew the older payload until the next change. The load handler now reads the current payload. The focus trap's skipEscapeWhen was in the same position (read from the mount render only), but its one caller, DestinationPage, passes a stable callback, so nothing was wrong on screen.

The 20 that stay fall into five kinds, each with its reason on the line. Value keys (9): TripMap's fillsKey and poisKey, DayExploreMap's stay coordinates and markerKey, CityPickerMap's cityKey, useFavoriteItems' wantedSig, neighbours' sig, App's pricingChoices (so a trip_days write does not reprice the catalogue) and SavedTripsPanel's account-id fetch. Request keys (2): TripMap's and DayExploreMap's flyTo.k, so the same place asked twice still moves the map. Built once (2): TripMap and DayExploreMap construct MapLibre with options that cannot change later. Deliberate triggers (3): SavedTripsPanel's memTick (memories live in localStorage), ContentSection's clock read per override list, DestinationPage's ?dm= read per destination. Guarded or one-shot (4): DateField jumps the month on open only, useAppData's date repair runs on a data or origin change only (re-running on the dates would undo a deliberate off-calendar pick), AiDayPlanModal's auto-run is guarded by its autoRan ref, and useUrlSync's spread dependency list is a list the rule cannot read.

## Files touched

App repo (continent-app, branch p10-hook-disable-audit-2):

**Modified:**
- src/App.jsx
- src/auth/AccountPanel.jsx
- src/auth/SavedTripsPanel.jsx
- src/browse/AroundHere.jsx
- src/browse/DestMap.jsx
- src/browse/DestinationPage.jsx
- src/browse/DestinationsTab.jsx
- src/browse/ExploreMap.jsx
- src/browse/ExploreTab.jsx
- src/browse/TrailPage.jsx
- src/browse/useFolds.js
- src/components/DateField.jsx
- src/components/OriginPicker.jsx
- src/components/admin/ContentSection.jsx
- src/hooks/useAppData.js
- src/hooks/useDestinationSearch.js
- src/hooks/useFavoriteItems.js
- src/hooks/useFocusTrap.js
- src/hooks/useUrlSync.js
- src/lib/neighbours.js
- src/map/CityPickerMap.jsx
- src/map/DayExploreMap.jsx
- src/map/TripMap.jsx
- src/planner/AiDayPlanModal.jsx

Root repo (branch p10-hook-disable-audit-2):

**Modified:**
- Execution/_OPEN.md (T283-a closed, T312-a added)

**Created:**
- Execution/P10/T312-hook-disable-audit-2.md

## Commands run

From the app worktree (wt/T312-app):

```
grep -rn "exhaustive-deps" src | wc -l
npx eslint src --no-inline-config -f json -o <scratchpad>/hidden.json
npx eslint src --report-unused-disable-directives
npm test
npx vite --config <scratchpad>/t312/vite.t312.mjs --port 5205 --strictPort --host 127.0.0.1
CARTA_PORT=5205 node scripts/verify_tab_switching.mjs http://127.0.0.1:5205/
CARTA_PORT=5205 node scripts/verify_explore.mjs http://127.0.0.1:5205/
CARTA_PORT=5205 node scripts/verify_places_tab.mjs http://127.0.0.1:5205/
CARTA_PORT=5205 node scripts/verify_trail_page.mjs http://127.0.0.1:5205/
CARTA_PORT=5205 node scripts/verify_saved.mjs
CARTA_PORT=5205 node scripts/verify_account_panel.mjs
node <scratchpad>/t312/verify_destination_page.5205.mjs
node <scratchpad>/t312/walk.mjs http://127.0.0.1:5205/ <scratchpad>/t312/shots
node <scratchpad>/t312/walk2.mjs http://127.0.0.1:5205/ <scratchpad>/t312/shots2
node <scratchpad>/t312/walk3.mjs http://127.0.0.1:5205/ <scratchpad>/t312/shots2
node scripts/measure-planner-renders.mjs --url=http://127.0.0.1:5205/ --runs=3
node <scratchpad>/t312/meter380.mjs --url=http://127.0.0.1:5205/ --runs=1
node <scratchpad>/t312/meter1440.mjs --url=http://127.0.0.1:5205/ --runs=1
git stash   # base side of every A/B, on the same Vite server; then git stash pop
```

The `--no-inline-config` run is the audit: it prints the warning each disable was hiding. The Vite config in the scratchpad only adds a private cacheDir, because node_modules is a link shared by every wave session. verify_destination_page.mjs spawns its own vite preview of dist/ on port 4207, so a scratchpad copy with the port set to 5205 ran it against the dev server instead of building. meter380.mjs and meter1440.mjs are copies of measure-planner-renders.mjs with the viewport changed and one added step that opens and closes the planned trip's origin picker.

walk.mjs, at 380 by 800 and 1440 by 900: #friend opens the account page once, strips the hash and stays closed after closing; #guide opens the guides panel and strips the hash; #shared shows the shared trip view and strips the hash; #dest opens the destination page, its map draws pins, a highlight pin takes the focus, switching the map layer redraws, Around here switches tab, Escape closes it; Explore with xg=1 shows only hidden gems; the Explore map view renders; a shared price range (pr=50.400) survives boot, clamped to 281.400 by the current bounds. walk2.mjs: the pass modal takes focus, holds it through 25 Tab presses and closes on Escape; a country brief in the wizard opens with three folds open, one closes, and another country opens with three again; the Stay step's city map draws 21 pills and survives two taps (the custom build is only reachable from a stored draft today, so the walk flips the stored draft's buildMode and reloads). walk3.mjs: #itin opens the trip page with its eight folds and it stays closed after Escape.

## Config and secrets set

None.

## Before/after measurements

Disable comments for react-hooks/exhaustive-deps (grep in src; every counted line is a directive):

| File | Before | After | Delta |
|---|---|---|---|
| src/App.jsx | 8 | 1 | -7 |
| src/auth/SavedTripsPanel.jsx | 4 | 2 | -2 |
| src/map/TripMap.jsx | 4 | 4 | 0 |
| src/map/DayExploreMap.jsx | 4 | 4 | 0 |
| src/map/CityPickerMap.jsx | 2 | 1 | -1 |
| src/hooks/useAppData.js | 2 | 1 | -1 |
| src/browse/ExploreTab.jsx | 2 | 0 | -2 |
| src/browse/DestMap.jsx | 2 | 0 | -2 |
| 16 files with one each | 16 | 7 | -9 |
| In scope | 44 | 20 | -24 |
| All of src | 55 | 31 | -24 |
| Directives without a written reason, all of src | 44 | 0 | -44 |

The 16 single files: removed in AccountPanel, AroundHere, DestinationsTab, ExploreMap, TrailPage, useFolds, OriginPicker, useDestinationSearch, useFocusTrap; kept with a reason in DestinationPage, DateField, ContentSection, useFavoriteItems, useUrlSync, neighbours, AiDayPlanModal.

Lint, whole of src: 0 errors and 72 warnings before and after, with zero exhaustive-deps warnings and zero unused disable directives after. npm test: 104 of 104 pass.

Explore shared filter link (`?tab=map&xg=1`), cards carrying the hidden gem badge out of cards shown: 0 of 48 before, 48 of 48 after, at both widths.

Planner render meter (scripts/measure-planner-renders.mjs, 1280 by 800), three runs each side on the same Vite server, base with the change stashed:

| Phase | Commits before | Commits after | TripMap pins before | After |
|---|---|---|---|---|
| wizard-when | 15 | 15 | 0 | 0 |
| wizard-quiz | 10 | 10 | 0 | 0 |
| wizard-where | 2 | 2 | 0 | 0 |
| wizard-trips | 9 | 9 | 0 | 0 |
| wizard-finish | 3 | 3 | 0 | 0 |
| planned-view | 3 | 3 | 4 | 4 |
| planned-edit | 16 | 16 | 0 | 0 |
| day-flow | 18 | 18 | 0 | 0 |
| day-build | 8 | 8 | 0 | 0 |

In that final pair, the per-component render counts were identical in all 27 phase runs. Two earlier after batches showed day-flow at 19 or 20 commits in four of five runs, and the extra renders were the day planner reaching its builder in a different phase. One of those batches ran exactly the code of the final batch, so this is timing on a machine shared with the other sessions, not the change. Render milliseconds are wall clock under that load and are not reported as a result.

Browser harnesses, after against base:

| Harness | After | Base (change stashed) |
|---|---|---|
| verify_explore.mjs | 68 of 68 | not rerun |
| verify_places_tab.mjs | all pass | not rerun |
| verify_trail_page.mjs | all pass | not rerun |
| verify_saved.mjs | all pass | not rerun |
| verify_destination_page.mjs (port 5205 copy) | 1 fail: 52 px phone overflow | the same 1 fail |
| verify_tab_switching.mjs | 4 of 69 fail | the same 4 fail |
| verify_account_panel.mjs | stops at "the hub has no profile card" | the same |
| walk.mjs | 38 of 38 | 36 of 38 (the Explore filter link) |
| walk2.mjs, walk3.mjs | 22 of 22, 6 of 6 | not rerun |

The phone overflow is T281-a. The tab-switching and account-panel failures predate this task and are now T312-a. The very first tab-switching run, on a cold server, failed one more check (Destinations to Trip planner, the planner chunk still loading); two warm reruns did not.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A shared Explore link dropped xg, xu, xc and xs | The URL writer effect ran before the hydrate effect and deleted those keys first | Hydrate declared before the writer |
| ExploreMap could draw a stale first payload | The load handler closed over the payload of the render that created the map | Reads the current payload through a ref |
| The first trip_days fix changed more than the dependency list | It replaced the guard with a setState updater that returns prev, which still queues an update on every date change | Back to the guarded write, exactly the old behaviour on a date change, with `choices.trip_days` listed as a named value |
| The first harness runs timed out | Cold Vite compile under load from other sessions | Reran on the warm server |
| The background Vite stopped after 30 minutes | The default background time limit | Restart failed on the port because the old process still served it; kept using it after confirming its command line, then stopped it by PID |
| verify_destination_page.mjs could not reach a server | It spawns vite preview of dist/ on port 4207 | A scratchpad copy pointed at 5205, no build |

## What is still open

verify_tab_switching.mjs fails four checks and verify_account_panel.mjs stops at the guest hub's missing profile card. Both fail the same way on the wave 6 base with this change stashed, so they are not caused by it, but nobody owns them yet and they belong to a harness or app task (T312-a).

The Stay step's city map, the custom build in the trip wizard, cannot be reached from the interface today: GuidedTripWizard.jsx only ever calls setBuildMode('ready'), so only a draft stored with buildMode 'custom' opens it. The walk reached it by editing the stored draft. Whether the step should come back or its code go is a product decision, outside a hook audit (T312-b).

Merge note for the orchestrator: this branch touches App.jsx, useAppData.js, ExploreTab.jsx, ExploreMap.jsx, DestinationPage.jsx and TrailPage.jsx, which other wave 7 sessions may also edit (T271's first paint work in particular). Every change here is a dependency list, a reason comment or a few lines around one hook, so a conflict should resolve by keeping both sides.

## Rollback procedure

In continent-app: `git revert 524a7e7`. That one commit holds all 24 files. No data, schema, config or dependency changed. In the root repo, revert the report commit, which also returns T283-a to open and removes T312-a.
