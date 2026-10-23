# T619: css-routes --check passes again

## Task ID

T619

## Date

2026-10-23

## What changed

`node scripts/css-routes.mjs --check dist/assets` (T474, CSS per route) reported 7 problems on app master after the home page merge, and T618's deploy shipped with them. Six date from the Explore work before that merge: rules in a route sheet whose classes the main bundle also names. The seventh came with T606: the trip wizard's `.trip-wizard-modal .wstay-route-i`, in the planners' route sheet, now loads after the home page's `.hv-voices-tabs [role="tab"]`, which the check counts as a rule that could override it. The check's own repair, `--hold` (T481), moved all seven into the held sheets that load last in the main sheet: `.itin .fare-prov-est`, `.day-guide-rec.picked`, `.trip-wizard-modal .wstay-route-i` and the two `.party-row` rules into `planners-held.css`, and `.cycle-surface` and `.cycle-bike` into `items-held.css`.

One of them was not only a check failure. `SettingsLine`'s people rows on Explore (eager code) share the class `.party-row` with the planners' `PartyEditor`, and the planners' rule draws a bordered card row. Held as written, it would have boxed Explore's people rows on every first paint; it already did on production once a planner had loaded, since the route sheet then stays in the page. The held rule is now `.party > .party-row`, which matches only `PartyEditor`'s rows (they sit directly in `.party`). In the planners its specificity still beats `77-settings-v2.css`'s `.party-row`, and `.party.is-compact .party-row` still beats it, so the planners look as before.

## Files touched

App (continent-app, branch p15-css-routes-hold, commit d040727), mirrored into the root's continent-app/:

**Modified:**
- src/styles/planners-held.css
- src/styles/items-held.css
- src/styles/planners/12-guided-trip.css
- src/styles/planners/19-guide-ratings.css
- src/styles/planners/67-v6-tripplanner.css
- src/styles/items/25-feature-pages.css

Root:

**Created:**
- Execution/P15/T619-css-routes-hold.md

**Modified:**
- Execution/_OPEN.md (row T619-a)

## Commands run

```bash
npx vite build --config ../vite.t606nopub.mjs
node scripts/css-routes.mjs --check ../.dist-t606/assets --hold
npx vite build --config ../vite.t606nopub.mjs
node scripts/css-routes.mjs --check ../.dist-t606/assets
npm test
```

The end check ran Playwright against production and the local dev server: Explore's people popover (desktop) and settings sheet (phone), the trip wizard's first step with its `PartyEditor`, and probe elements for each moved selector on the trip tab.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| css-routes --check problems | 7 | 0 (2312 route selectors, all route-only, none overridable) | -7 |
| First paint CSS (index-*.css) | 782,704 B raw, 127,739 B gzip | 783,565 B raw, 127,874 B gzip | +861 B raw, +135 B gzip |
| Explore people row, 390 and 1440 px | 52 px, hairline, no fill | 52 px, hairline, no fill | none |
| Wizard party row, 390 and 1440 px | 64 px min, 8 by 16 px padding, 1 px border, 16 px radius, white | the same | none |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The held `.party-row` would box Explore's people rows on every first paint | The planners' card rule and SettingsLine's rows share the class | Held as `.party > .party-row`, PartyEditor's rows only |
| Three numbersPage tests fail in the app worktree | The worktree has no public/boot.json | Environmental; they pass in the main checkout (T618) |

## What is still open

`npm run build:pages`, the deploy build, does not run `css-routes --check`; only `npm run ci` does, so a deploy can ship with route sheet problems, as T618's did. Wiring the check into `scripts/build-pages.mjs` (fail the build on a problem) is outside this task's files. Register row T619-a.

## Rollback procedure

`git revert d040727` in the app and revert the T619 commit in the root. The route rules return to the route sheets and the check reports the 7 problems again; nothing else depends on the change.
