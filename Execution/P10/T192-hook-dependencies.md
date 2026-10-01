# T192 Hook dependencies and memoisation thrashing

## Task ID

T192 (mind-map number T345). Branch p10-hook-deps in both repos.

## Date

2026-10-02

## What changed

The trip planner no longer redraws its map on renders that do not move a pin. TripPlannerTab built the array of map stops inline, so every render handed TripMap a new `stops` prop, and TripMap answers a new `stops` by clearing every pin, rebuilding them and gliding the camera to refit the route. On the planned-trip editor that happened on every nights bump and every stop select: 15 full redraws in the scripted walk, now none. The array is now memoised on a string of what the map actually draws (coordinates and names), because `stopDetails` itself legitimately changes on every nights bump. Main-thread long tasks in that phase fell from 11.8 s to 4.9 s.

The line the mind map pointed at, `data?.destinations || {}` at TripPlannerTab.jsx:307, has the same shape in useTripPlanner and GuidedTripWizard. It only bites before the catalogue has loaded (once data is there, `data.destinations` is a stable reference), but while it bites it invalidates every memo that reads destinations, so all three now fall back to one shared frozen empty object. The bigger thrash in the wizard was a different line: `originPoint` was rebuilt as a new object on every render whenever the origin came from the chosen airport, and it feeds the country scorer and the nearby-airport list, so both re-ran on every render. It is now a memo. The wizard's `nightlyFor` and `passesStayFilters` became callbacks so the memos that call them can list them; this also fixes a real staleness bug, because the stay map list's hand-written dependency list never included the stay tier, so switching tier left it on old prices.

App passed DayPlannerTab two inline arrows (`onPlanTrip`, `onOpenDest`), which meant its React.memo never held and the whole day planner re-rendered on every App render. They are now the existing `openDetail` and a new stable `planTripFromDay`. DayPlannerTab keys its saved-plan fetch on the account id, shares one empty day array and memoises its gap ideas on the one number it reads from the schedule. The rest are lint-only: TripMap reads its focus point by value instead of through a complex expression, DateField's `isDisabled` is a callback, the two pin maps hold their pin Map directly in the effect cleanup, and App and useAccountSync now list the useState setters they close over (stable, so nothing re-runs). Nine stale `eslint-disable` comments were removed and one was added, on the deliberately value-keyed map-stops memo, with its reason on the line.

The meter is scripts/measure-planner-renders.mjs. It installs a bare React DevTools hook before the app loads, which puts the dev build into profiling mode, then drives a fixed walk through the trip wizard, the planned trip and its editor, and the day builder through the ?paymock seam. Per phase it reports commits, React render time, main-thread long tasks (where effect work such as MapLibre redraws shows up, which React timings never include) and the number of TripMap pins built, which is an exact count of map redraws. Render and long-task times are wall clock and swing with machine load; with ten sessions sharing this machine they swung by a factor of two between batches, so the figures below come from a back-to-back A/B on the same server, three runs each, medians.

## Files touched

All in continent-app (app repo, branch p10-hook-deps).

Modified: src/planner/TripPlannerTab.jsx, src/hooks/useTripPlanner.js, src/planner/GuidedTripWizard.jsx, src/planner/DayPlannerTab.jsx, src/App.jsx, src/hooks/useAccountSync.js, src/map/TripMap.jsx, src/map/CityPickerMap.jsx, src/map/DayExploreMap.jsx, src/components/DateField.jsx.

Created: scripts/measure-planner-renders.mjs.

Root repo: this report and four rows in Execution/_OPEN.md.

## Commands run

From continent-app (the worktree wt/T192-app):

```
npx eslint src -f json -o lint.json
npx vite --port 5209 --strictPort --host 127.0.0.1
node scripts/measure-planner-renders.mjs --url=http://127.0.0.1:5209/ --runs=3 --out=after.json
git checkout HEAD~3 -- src     # A side of the A/B, then: git checkout HEAD -- src
npm test
```

## Config and secrets set

None.

## Before/after measurements

Lint, whole of src: react-hooks/exhaustive-deps warnings 42 before, 1 after (the one left is in i18n, see below). Unused exhaustive-deps disable directives 10 before, 1 after (also outside scope).

Planner walk, A/B medians of three runs each, same Vite server, back to back:

| Phase | Metric | Before | After | Delta |
|---|---|---|---|---|
| planned-edit (4 stop selects, 10 nights bumps) | TripMap pins built | 60 | 0 | 15 redraws gone |
| planned-edit | main-thread long tasks | 11,792 ms | 4,857 ms | -59% |
| planned-edit | React render time | 293 ms | 218 ms | -26% |
| wizard-where | React render time | 68 ms | 28 ms | -59% |
| wizard-trips | React render time | 254 ms | 154 ms | -39% |
| wizard-finish | React render time | 67 ms | 23 ms | -66% |
| wizard-quiz | React render time | 291 ms | 310 ms | noise |
| wizard-when (10 nights bumps) | React render time | 31 ms | 30 ms | noise |
| day-flow and day-build | React render time | 216 ms, 81 ms | 259 ms, 52 ms | noise |

Render counts per component were identical before and after in every phase, so the gain is cheaper renders and skipped effects, not fewer renders. The day planner figures did not move because the scripted walk never re-renders App while the day tab is open; the inline-arrow fix pays off when App re-renders behind a mounted day tab (a lifestyle slider, a search keystroke), which the walk does not exercise. The remaining planned-edit long tasks are mostly native WebGL time in headless Chromium (software GL) from the stop-select camera eases, which are wanted.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| First baseline run timed out on the trip walk | Cold Vite compile took over 240 s | Discarded; took a fresh five-run baseline on the warm server, then the A/B |
| Restarting Vite failed on port 5209 | The first Vite outlived its killed background shell and still held the port | Kept using it (same worktree, confirmed by its command line), stopped it by PID at the end |
| Stay map list showed stale nightly prices after a stay tier switch | Its hand-written dependency list omitted effectiveStayTier, hidden by an eslint-disable on the wrong line | Fixed by passesStayFilters becoming a callback that carries the tier |

## What is still open

The one exhaustive-deps warning left is i18n/index.jsx:125, where the provider's value memo lists `loaded`, which the rule calls unnecessary. It is deliberate: CATALOGS is a module object filled in when a language file arrives, and `loaded` is the only signal that rebuilds `t()` around it, so removing it would ship untranslated strings. This session was told not to touch i18n, so the fix (a disable comment on that line carrying the reason) is left for a task that may (T192-a).

Lint clean is only lint clean while the rule stays a warning. Once T192-a lands, eslint.config.js can promote react-hooks/exhaustive-deps to error so a regression fails the build; that file was outside this task's scope (T192-b).

browse/CategoryRail.jsx:41 carries an unused exhaustive-deps disable directive, outside the planners (T192-c).

76 `eslint-disable` comments for this rule remain in src. They keep lint quiet but each hides a hand-picked dependency list, which is exactly how the stay-tier bug above survived. Most are deliberate value keys (TripMap's fillsKey and poisKey, the route key in TripPlannerTab), but they have never been audited, and at 25,000 destinations a wrong one is either a stale screen or a full catalogue scan per render. The worth-it next step is an audit, starting with GuidedTripWizard and DayPlannerTab (T192-d). Separately, useTripPlanner's suggestNextStops and cheapestStartDates re-run on every nights bump because they truly depend on the dates; they are the next cost to look at as the catalogue grows, and belong to that same audit.

## Rollback procedure

In continent-app, revert the four commits, newest first: `git revert b47955b 00d736a fef51e7 11c4b9e`. Nothing outside the app source and the new script changed; no data, schema or config was touched. In the root repo, revert the report commit.
