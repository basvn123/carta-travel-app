# T176 Free GPX on every route, never paywalled

## Task ID

T176 (mind-map number T180).

## Date

2026-10-02

## What changed

The trail page no longer asks for a pass before it hands over a GPX or a KML. The two calls to `paywall.require('export')` in `continent-app/src/browse/TrailPage.jsx` are gone, together with the now unused `usePaywall` import and hook. The cycling GPX in `CyclePage.jsx` was already free, so every route page that can draw a line now downloads its file without a gate. The credit text stays inside both files, because `trailExport.js` writes it and was not touched. The PDF exports and the day-plan and trip KML (the My Maps files in the planner) keep their gate, as the owner decided in T275.

Because the old pass copy promised "map files", it was rewritten in all six locales. `pass.subExport` now says that PDF, calendar and trip map files come with a pass and that trail and route GPX files are always free. The planner's My Maps KML is still gated, which is why the sentence says "trip map files" and does not drop the word.

Two earlier open items on the same page were folded in. The subtitle under the title now goes through `trailPlace()`, so a trailhead across a border from the nearest catalogue town names the trailhead's country alone (T108-a). The country name comes from `Intl.DisplayNames` in the active language, the same fallback `DestinationsTab.jsx` uses. `trailReasons()` now receives the trip record (`detail` or the card's `tr`) as its fourth argument, so the comfortable-day check also reads climb and walking time and no longer relies on a bigClimb reason being present (T108-b).

The task text asks to populate `typeSpecific.gpxReady`. That field exists only on journeys, where it is set on 30 of 253 and nothing reads it, and the notes say journeys wait for the T177-b track wire. Trails and cycling routes carry no such field; a route offers the button when its geometry has loaded. So nothing was populated here, and the journey half stays open.

## Files touched

Modified, in the app repo (`continent-app`, branch p10-free-trail-gpx, commit 5991a00):
- src/browse/TrailPage.jsx
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (one string each, `pass.subExport`)

Modified, in the root repo:
- Execution/_OPEN.md (T203-b, T108-a and T108-b closed; new rows appended)

Created, in the root repo:
- Execution/P10/T176-free-gpx.md

## Commands run

```
git -C wt/T176-app diff --stat
npx eslint src/browse/TrailPage.jsx
node --test tests/trailStory.test.mjs
for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
```

eslint was clean, the four trailStory tests passed, and all six catalogues parse. The page was not opened in a browser in this session, and no build was run.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Trail pages whose GPX and KML sit behind the pass | 17,619 of 17,619 (T203 measurement) | 0 | -17,619 |
| Cycling route pages whose GPX sits behind the pass | 0 | 0 | 0 |
| paywall.require('export') calls in TrailPage.jsx | 2 | 0 | -2 |

The after figure is read from the code, not from a run in the browser.

## What broke and how it was fixed

No issues. The app repo stores these files with CRLF, so the edits were made with a script that preserves line endings and the diff stays at 21 lines in TrailPage.jsx.

## What is still open

The journey GPX of spec F4 is still not wired: it needs the T177-b track wire, and T206-f already carries it (T176-a, pointer). The planner's My Maps KML and the trip PDF stay behind the pass, which is the owner's decision; if the owner later wants the planner KML free as well, that is a separate call (T176-b). The page was not exercised in a browser, so someone should open one loop and one one-way trail on the dev server, press both buttons as a signed-out visitor, and check the subtitle on a border trail such as Korab (9/1) (T176-c). Neither Garmin nor Wahoo import was tried with the file; the file is plain GPX 1.1.

## Rollback procedure

Revert commit 5991a00 on p10-free-trail-gpx in the app repo, which restores the gates, the old subtitle and the old copy, and revert the report commit in the root repo. Nothing in data, schema or the pipeline changed.
