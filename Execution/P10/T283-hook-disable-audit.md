# T283 Audit the exhaustive-deps disable comments in the planner

## Task ID

T283 (register row T192-d; no mind-map prompt). Branch p10-hook-disable-audit in both repos.

## Date

2026-10-02

## What changed

The planner now hides ten hand-picked dependency lists instead of thirty-one. T192 left 76 `eslint-disable` comments for react-hooks/exhaustive-deps in src (T192-d), 32 of them in src/planner, and one of those (AiDayPlanModal.jsx) belongs to session 3 of this wave. Of the 31 in scope, 21 are gone and each hook now lists what it reads, and 10 stay with a one-line reason written on the directive itself (`// eslint-disable-line react-hooks/exhaustive-deps -- reason`).

The removals follow one pattern: a helper rebuilt on every render became a callback, or an effect that keyed on a property path now reads that value through a named constant. In GuidedTripWizard, `goStep`, `pointOf`, `airportsFor` and a new `restoreTripPick` (the Trips step's restore handler, which was an inline arrow) are callbacks; the trip pick is read as `tripPickId` and the arrival country as `arrivalCountry`; the nearby-airport list and the Carta route plan now depend on the memoised `originPoint` T192 introduced, rather than its lat and lon. In DayPlannerTab, `customPoisFor`, `itemsForStop` and `passRating` are callbacks, so the activities memo, the duplicate-repair effect and the map pin memo list them; the citytrip lookup keys on the stop's id and iso2. ReadyTripsStep loads trips from its value key `ccKey` directly, DayIdeasStep's distance helper `km` is a callback, ExpenseLedger keys on `userId`, AiPlanRoute's walk fetch lists its memoised `pins`, and TripPlannerTab's road route lists `mapStops` (memoised by T192) and the country-seed effect lists `tp.planned` and `tp.stopDetails.length`.

Two of the removals were stale-closure bugs the disables had been hiding. The Getting there step's open-jaw hint ("Fly into BCN, home from GRO") did not list `t`, so it stayed in the old language after a language switch. The country-seed effect in TripPlannerTab only looked at whether a trip existed when the seed arrived, so a trip that appeared while the seed was still pending never opened the wizard modal.

The ten that stay are deliberate, and the reason is now on each line. Four are one-shot hand-offs (TripPlannerTab's openPlanId and openSharedTrip, DayPlannerTab's openPlanId and daySeed): the helpers they call are rebuilt every render, and a re-run while the async open is still in flight would open the plan twice. The daySeed one also cannot list `resolveNearestTown`, because that const is declared further down the component and naming it in the dependency array would be a temporal dead zone crash. Four are value keys: TripPlannerTab's mapStops (T192's), and DayPlannerTab's road, stay-ride and walking-route fetches, which key on rounded coordinate strings because the point arrays are rebuilt every render and listing them would refetch OSRM on each one. One is DayPlannerTab's town counts for the chat, keyed on the town because `chatDest` depends on `actFull`, and a shard that fails to load would refetch in a loop. The last is the wizard's leg prefill: it must run only when the set of legs changes, because re-running on `quiz` or `drivingThere` would refill a mode the traveller just cleared. Clearing the out leg's prefilled Flight changes `drivingThere`, so this was checked in the browser: the cleared leg stays cleared.

useTripPlanner did not change. Its `nextStopSuggestions` memo has no disable and a correct dependency list, and it re-runs on every nights bump because the dependency is real: suggestNextStops gives a candidate a ranking boost when the snapshot fare exists on the arrival date, and every nights bump moves that date. Measured in Node against public/app_data.json (3,868 destinations), one call from Bologna takes 1.8 to 1.9 ms on a quiet machine (12.1 ms under load from the other sessions). Splitting it into a date-free candidate pool (712 candidates) and a dated rank over the pool gave identical output on 31 dates and cut a call to about 0.6 ms. That saves about 1.2 ms per bump, which is not worth a second memo now, and the split would belong in lib/trip_planner_pricing.js, which is outside this task. The cleaner fix is a product one: if the frozen-fare boost goes (T273 says Carta does not price flights), the memo no longer depends on the date at all (T283-c). `cheapestStartDates`, the other cost the row named, no longer exists in src: only two comments still mention it, because the cheaper-dates rows went with T273.

## Files touched

App repo (continent-app, branch p10-hook-disable-audit):

**Modified:**
- src/planner/GuidedTripWizard.jsx
- src/planner/DayPlannerTab.jsx
- src/planner/TripPlannerTab.jsx
- src/planner/ReadyTripsStep.jsx
- src/planner/DayIdeasStep.jsx
- src/planner/ExpenseLedger.jsx
- src/planner/AiPlanRoute.jsx

Root repo (branch p10-hook-disable-audit):

**Modified:**
- Execution/_OPEN.md (T192-d closed, T283-a to T283-c added)

**Created:**
- Execution/P10/T283-hook-disable-audit.md

## Commands run

From the app worktree (wt/T283-app):

```
grep -rn "exhaustive-deps" src | wc -l
npx eslint src/planner src/hooks/useTripPlanner.js --no-inline-config -f json -o hidden.json
npx eslint src/planner src/hooks/useTripPlanner.js --report-unused-disable-directives
npx eslint src --report-unused-disable-directives -f json -o all.json
npm test
npx vite --config <scratchpad>/vite.t283.mjs --port 5204 --strictPort --host 127.0.0.1
git stash push -- src/planner
node scripts/measure-planner-renders.mjs --url=http://127.0.0.1:5204/ --runs=3
git stash pop
node scripts/measure-planner-renders.mjs --url=http://127.0.0.1:5204/ --runs=3
node <scratchpad>/t283/walk.mjs <scratchpad>/t283/shots
node <scratchpad>/t283/check.mjs <scratchpad>/t283/shots
node <scratchpad>/bench.mjs
```

The `--no-inline-config` run is the audit itself: it prints the warning each disable was hiding. The Vite config in the scratchpad only adds a private `cacheDir`, because node_modules is a link shared by every wave session, so the default cache would be re-optimised under the others. walk.mjs drives the wizard (all seven steps), the planned trip, its editor and the day planner (When, Ideas with a typed search, the workspace and three adds) at 380 by 800 and 1440 by 900, and records page errors. check.mjs clears the out leg's mode on Getting there (one pressed mode before, none 1.5 s later) and counts the geocoder calls while "Colos" is typed a letter at a time (one call, so listing `km` did not undo the debounce). Both walks finished every step at both widths with no page errors and no console errors.

## Config and secrets set

None.

## Before/after measurements

Disable comments for react-hooks/exhaustive-deps (counted with grep in src; every counted line is a directive):

| File | Before | After | Delta |
|---|---|---|---|
| src/planner/GuidedTripWizard.jsx | 10 | 1 | -9 |
| src/planner/DayPlannerTab.jsx | 10 | 6 | -4 |
| src/planner/TripPlannerTab.jsx | 5 | 3 | -2 |
| src/planner/ReadyTripsStep.jsx | 2 | 0 | -2 |
| src/planner/DayIdeasStep.jsx | 2 | 0 | -2 |
| src/planner/ExpenseLedger.jsx | 1 | 0 | -1 |
| src/planner/AiPlanRoute.jsx | 1 | 0 | -1 |
| In scope | 31 | 10 | -21 |
| All of src | 76 | 55 | -21 |

Lint on the touched files: zero exhaustive-deps warnings and zero unused disable directives after (the same before, per the T192 report). Whole of src after: one exhaustive-deps warning (i18n/index.jsx:125, T192-a) and one unused directive (browse/CategoryRail.jsx:41, T192-c), both as T192 left them and both outside this scope.

Planner render meter (scripts/measure-planner-renders.mjs), A/B on the same Vite server, medians of three runs each:

| Phase | Commits before | Commits after | TripMap pins before | After | Render ms before | After |
|---|---|---|---|---|---|---|
| wizard-when | 15 | 15 | 0 | 0 | 32 | 29 |
| wizard-quiz | 10 | 10 | 0 | 0 | 338 | 217 |
| wizard-where | 2 | 2 | 0 | 0 | 22 | 17 |
| wizard-trips | 9 | 9 | 0 | 0 | 164 | 72 |
| wizard-finish | 3 | 3 | 0 | 0 | 19 | 19 |
| planned-view | 3 | 3 | 4 | 4 | 41 | 42 |
| planned-edit | 16 | 16 | 0 | 0 | 291 | 238 |
| day-flow | 18 | 18 | 0 | 0 | 232 | 92 |
| day-build | 8 | 8 | 0 | 0 | 74 | 45 |

Commit counts, map redraws and per-component render counts were identical in every phase, which is the point: the new dependency lists add no renders and no refetch loops. The render times are wall clock on a machine shared with nine other sessions and are not a claim; they are noise in both directions.

suggestNextStops, per call, Node, 3,868 destinations, mean of 50 calls from Bologna: 1.8 to 1.9 ms on three quiet runs, 4.9 and 12.1 ms on two runs under load. Not changed by this task.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Open-jaw hint kept its old language after a language switch | `t` missing from the jawHint memo, hidden by a disable | `t` listed |
| Country seed never opened the wizard modal if a trip appeared while the seed was pending | The effect keyed on the seed alone | Lists `tp.planned` and `tp.stopDetails.length` |
| First Vite start re-optimised the shared dependency cache | node_modules is a link into the main checkout, shared by every session | Restarted with a scratchpad config that sets a private `cacheDir` |
| First Vite page load took 3.5 minutes | Cold compile on a machine running other sessions | Waited; the meter and walk ran on the warm server |

## What is still open

45 exhaustive-deps disable comments remain outside src/planner. The per-file count is in T283-a and T312 takes them. AiDayPlanModal.jsx's one comment is counted there because session 3 owned that file in this wave.

DayIdeasStep.jsx line 348 joins a result's place and walk time with a middot separator, which the copy rules ban. It is a copy change under carta-design, not a hook fix, so it is left (T283-b).

suggestNextStops ranks suggestions with a +1.2 boost for a frozen snapshot fare on the arrival date. That is what makes the memo re-run on every nights bump. T273 removed every flight figure from the screens; whether the ranking may still lean on the snapshot is a question for a task that may touch lib/trip_planner_pricing.js (T283-c). At today's 1.8 ms per call it is not a performance problem.

## Rollback procedure

In continent-app: `git revert 0c4e1bc`. That one commit holds all seven planner files. Nothing else in the app changed: no data, schema, config or dependency. In the root repo, revert the report commit, which also returns T192-d to open and removes T283-a to T283-c.
