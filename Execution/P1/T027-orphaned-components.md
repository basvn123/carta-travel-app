# T027 Delete orphaned frontend components, keep the URL logic

## Task ID

T027

## Date

2026-09-23

## What changed

Six dead component modules (821 lines total) were removed from the codebase. FlightPickerMap.jsx, TrailsNearby.jsx, MapLegend.jsx, PlaceSizeToggle.jsx, ExploreFilterSheet.jsx, and ReachFilter.jsx were not imported anywhere and appear to be remnants of earlier feature iterations. No modules in the codebase reference them. The URL parameter handling for reachHours (the rh query string parameter) was preserved in urlState.js because it is live functionality, independent of any component. CSS rules specific to ExploreFilterSheet that are not used by its successor PlacesFilterSheet (fsheet-band, fsheet-note, fsheet-nums, fsheet-readout, fsheet-to) remain in styles.css as candidates for future cleanup, but are not used by any live component today. The two stale comments that mentioned these components (PlacesFilterSheet line 28 saying its markup mirrors ExploreFilterSheet, and urlState.js line 92 saying "see ReachFilter") were left unchanged to comply with the no-edit requirement.

## Files touched

**Deleted:**
- continent-app/src/map/FlightPickerMap.jsx
- continent-app/src/components/TrailsNearby.jsx
- continent-app/src/map/MapLegend.jsx
- continent-app/src/components/PlaceSizeToggle.jsx
- continent-app/src/browse/ExploreFilterSheet.jsx
- continent-app/src/components/ReachFilter.jsx

**Created:**
- Execution/P1/T027-orphaned-components.md (this report)

## Commands run

Root repository (two commits, one per repo):

```bash
git checkout -b p1-orphaned-components
git rm \
  continent-app/src/map/FlightPickerMap.jsx \
  continent-app/src/components/TrailsNearby.jsx \
  continent-app/src/map/MapLegend.jsx \
  continent-app/src/components/PlaceSizeToggle.jsx \
  continent-app/src/browse/ExploreFilterSheet.jsx \
  continent-app/src/components/ReachFilter.jsx
```

Inner repository (continent-app/.git):

```bash
cd continent-app
git checkout -b p1-orphaned-components
git rm --quiet --force \
  src/map/FlightPickerMap.jsx \
  src/components/TrailsNearby.jsx \
  src/map/MapLegend.jsx \
  src/components/PlaceSizeToggle.jsx \
  src/browse/ExploreFilterSheet.jsx \
  src/components/ReachFilter.jsx
git commit -m "T027: Delete six orphaned frontend components"
```

Verification commands:

```bash
grep -r "from.*FlightPickerMap\|import.*FlightPickerMap" src --include="*.jsx" --include="*.js"
grep -r "from.*TrailsNearby\|import.*TrailsNearby" src --include="*.jsx" --include="*.js"
grep -r "from.*MapLegend\|import.*MapLegend" src --include="*.jsx" --include="*.js"
grep -r "from.*PlaceSizeToggle\|import.*PlaceSizeToggle" src --include="*.jsx" --include="*.js"
grep -r "from.*ExploreFilterSheet\|import.*ExploreFilterSheet" src --include="*.jsx" --include="*.js"
grep -r "from.*ReachFilter\|import.*ReachFilter" src --include="*.jsx" --include="*.js"
npm run lint
npm run build
node test-rh-roundtrip.mjs
du -sh dist/assets/
find dist/assets -name "*.js" -exec du -b {} + | awk '{total+=$1} END {print total}'
find src -name "*.jsx" | wc -l
```

## Config and secrets set

None.

## Before/after measurements

The rh (reachHours) parameter round-trips correctly before and after deletion. The test encodes a state with reachHours=5, decodes it, and confirms the value survives the round-trip. It also confirms that ?rh=5 decodes directly to reachHours=5, and tests values 1, 3, 10, 24, and 48. All tests pass both before and after the deletion.

The bundle size (JavaScript assets only) shows no change, because the six deleted modules were never bundled. They were dead code.

| Metric | Before | After | Delta |
|---|---|---|---|
| .jsx files in src | 129 | 123 | -6 |
| Total lines in six files | 821 | 0 | -821 |
| JS bundle size (dist/assets/*.js) | 4.27 MB | 4.27 MB | 0 |
| rh parameter round-trip | passes | passes | no change |

## What broke and how it was fixed

No issues. Lint and build both succeeded with no new errors. The rh parameter round-trip test passed both before and after deletion. The bundle size stayed exactly the same, confirming that the deleted modules were never imported or bundled.

## What is still open

Three loose ends are documented but not addressed, per the task scope.

First, the verify_reach_filter.mjs Playwright harness in continent-app/scripts/verify_reach_filter.mjs is a test harness written for the ReachFilter component. The component is now deleted and the harness cannot mount it. Running the harness will fail because the element it drives no longer exists on any page. The harness itself was not deleted, because the task names only the six modules. If the harness is ever needed, it will be deleted or rewritten as a separate task.

Second, the comment in PlacesFilterSheet.jsx at line 28 says "The shell (portal, focus trap, swipe to dismiss) is deliberately the same as ExploreFilterSheet's, down to the class names, so the two sheets are one surface with two contents." ExploreFilterSheet is now deleted, so this comment is stale. It should be updated in a future cleanup task to remove the reference to the deleted component, or rewritten to describe the intended pattern without naming a defunct example.

Third, the comment in urlState.js at line 92 says "(see ReachFilter)", referring to the ReachFilter component which is now deleted. This comment is stale. Leaving it in place keeps the rh parameter handling intact and functional, but the reference is no longer valid. A future documentation task can remove or rewrite the comment.

Last, the CSS rules for fsheet-band, fsheet-note, fsheet-nums, fsheet-readout, and fsheet-to remain in src/styles.css. These were used only by ExploreFilterSheet and are now unused. They should be removed in a future CSS cleanup task, not in this one, because the task scope does not include stylesheet edits.

## Rollback procedure

Revert both commits and restore the files.

```bash
git checkout p1-git-history-rewrite
git branch -D p1-orphaned-components
cd continent-app
git checkout p1-cloudflare-pages
git branch -D p1-orphaned-components
cd ..
git checkout HEAD~2 -- \
  continent-app/src/map/FlightPickerMap.jsx \
  continent-app/src/components/TrailsNearby.jsx \
  continent-app/src/map/MapLegend.jsx \
  continent-app/src/components/PlaceSizeToggle.jsx \
  continent-app/src/browse/ExploreFilterSheet.jsx \
  continent-app/src/components/ReachFilter.jsx
cd continent-app
git checkout HEAD~1 -- \
  src/map/FlightPickerMap.jsx \
  src/components/TrailsNearby.jsx \
  src/map/MapLegend.jsx \
  src/components/PlaceSizeToggle.jsx \
  src/browse/ExploreFilterSheet.jsx \
  src/components/ReachFilter.jsx
git add .
git commit -m "Restore six components"
cd ..
rm Execution/P1/T027-orphaned-components.md
```

Then delete the branch.

```bash
git branch -D p1-orphaned-components
```

## Appendix: How the rh parameter works

The reachHours parameter is stored in the URL as rh and is handled entirely in src/lib/urlState.js, independent of any component. The encodeState function at line 93 writes the parameter: if reachHours is a finite number greater than 0, it sets q.set('rh', String(Math.round(reachHours))). The decodeState function at lines 158-160 reads it back: if the rh query parameter exists, it parses it as an integer and validates it (must be finite, greater than 0, and at most 48). The OWN_KEYS list at line 204 includes 'rh' so the parameter survives the persistState function, which synchronizes the URL with a localStorage mirror.

This separation of URL parameter handling from component code is intentional. The ReachFilter component was a UI control that let users pick from predefined reachHours values, but the parameter itself is a first-class part of the app's shared state. Deleting the component does not delete the parameter, because they are separate concerns. The parameter can still be set via a shared link (e.g., ?rh=5) even though the UI control to pick it is gone. This pattern keeps URL contracts stable and decoupled from the components that happen to expose them.
