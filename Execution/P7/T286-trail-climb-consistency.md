# T286 One climb and one difficulty, from source to screen

## Task ID

T286 (register rows T108-d, T108-e and T108-f; no mind-map prompt).

## Date

2026-10-02

## What changed

Every surface that prints a single climb now prints the climb read uphill. The rule is T108's: a one-way line whose net drop is at least 300 m and at least twice its climb was drawn downhill, so a walker starting from the bottom faces the stored descent as the climb. trailStory.js gained trailClimbUp(), and the trail card in DestinationsTab.jsx, AroundHere.jsx and both row lists in destinationPdf.js call it. The country card already carries descent_m (route_schema.py wire_keys adds it), so the card is right on the wire that is live today: Mount Korab (9) went from +7 m to +1423 m in the browser at 380 px and at 1440 px.

The KML fact line was built in TrailPage.jsx from the stored ascent. TrailPage.jsx is not this task's file, so the KML writer in trailExport.js now composes the line itself through the new trailFactLine(), with the climb read uphill and the same formatters TrailPage uses. The line TrailPage still passes is used only when the record has no distance to compose from. The downloaded KML for Korab (9) now says "7.9 km, 3.9 h, +1423 m". The GPX keeps the stored ascent and descent on purpose, because they describe the track in that file, which keeps its mapped direction. Its grade word is now the published grade, not validate.py's class.

AroundHere and the PDF named difficulty through dest.diff.*, which has three keys. They now go through gradeLabelKey(), which maps all five grades (and the three-value class, a subset of them) to the trails.grade* labels the facts strip uses. That matters because of the pipeline half below: once the dossier is rebuilt from the next wire, its difficulty is the grade, and very_hard or alpine would otherwise print a raw key.

rate.py now reads the climb uphill. It imports attributes.uphill() rather than copying the rule a fourth time; rate.py already loads psycopg, which was the reason T108 gave for the copies. bigClimb and steady are chosen from that climb. dayOut, still chosen from distance (6 to 22 km), is now also gated at the source: the climb must be at most 800 m (BIG_CLIMB_M) and the walking time at most 360 minutes, the same two numbers as isComfortableDay() in the app. An unknown walking time does not fail the gate, as in the app. A test reads both constants out of trailStory.js and fails if they drift. FETCH_SQL now selects descent_m and duration_min. The relief score term still reads the stored ascent; changing it moves ratings rather than reasons, so it is left open (T286-c).

export_wire.py ships one difficulty. wire_difficulty() returns the grade where attributes.py has set one, and validate.py's class only where it has not, on the card and in the detail file. The trips.difficulty column is untouched, because validate.py reads it as the tagged grade it checks its own class against, as T108 explained. I chose "set it to the grade" over "drop it" so that rows attributes.py has not reached keep a difficulty, and so that build_dossier.py, which copies `difficulty` into the around and nearby rows, picks up the grade with no change of its own.

The pipeline half is code only. Nothing was run: no rate.py, no export, no wire build, no dossier build, no trailslab. The counts below were taken read-only from the published wire in the main checkout.

## Files touched

Modified, in the app repo (continent-app, branch p7-trail-climb-consistency, commit 69557ea):
- src/lib/trailStory.js (GRADE_LABEL_KEY, gradeLabelKey, trailClimbUp)
- src/lib/trailExport.js (trailFactLine; trailKml composes its own line; GPX grade)
- src/browse/DestinationsTab.jsx (trail card climb)
- src/browse/AroundHere.jsx (row climb and grade label)
- src/lib/destinationPdf.js (around and routes rows: climb and grade label)
- tests/trailStory.test.mjs (two tests)

Modified, in the root repo (branch p7-trail-climb-consistency):
- pipeline/trails/rate.py (uphill climb, comfort gate, FETCH_SQL columns)
- pipeline/trails/export_wire.py (wire_difficulty on card and detail)
- Execution/_OPEN.md (T108-d, T108-e, T108-f closed; T286-a to T286-e appended)

Created, in the root repo:
- tests/test_trail_climb_consistency.py (5 tests)
- Execution/P7/T286-trail-climb-consistency.md

## Commands run

```
python -m pytest tests/test_trail_climb_consistency.py tests/test_trail_data_bugs.py tests/test_trail_titles.py -q
CARTA_APP_DIR=../T286-app python -m pytest tests/test_trail_climb_consistency.py -q
node --test tests/trailStory.test.mjs          (in continent-app)
npm test                                       (in continent-app)
npx eslint src/lib/trailStory.js src/lib/trailExport.js src/lib/destinationPdf.js src/browse/AroundHere.jsx src/browse/DestinationsTab.jsx
npx vite --port 5207 --strictPort              (then a throwaway Playwright script, deleted)
python measure_t286.py; python measure_t286b.py   (read-only, in the session scratchpad)
```

pytest gives 48 passed with the app path set: the 43 T107 and T108 tests plus 5 new ones. Without CARTA_APP_DIR, in a sparse root checkout that has no continent-app, the constants test is skipped and says so, rather than passing on nothing. node gives 6 of 6 trailStory tests; npm test gives 104 passed, 0 failed. eslint reports no errors and three warnings, all on lines this task did not touch.

Browser, phone at 380 x 844 and desktop at 1440 x 900, dev server on 5207, signed out. The Trails list for Albania shows Korab (9) as "7.9 km, 3.9 h, +1423 m" and Korab (9/1) as "12.1 km, 7.0 h, +1568 m". The KML downloaded from the Korab (9) page carries "+1423 m" and no "+7 m". Valbona Valley's Around tab shows trail rows with a grade word and cycling rows with "m up", with no raw key and no NaN. Neither page scrolls sideways at either width, and the console stayed clean. The PDF button opens the pass sheet for a guest, as the owner decided in T275, so the PDF itself was not rendered (T286-e).

## Config and secrets set

None.

## Before/after measurements

Counted on the published wire in the main checkout: 46 country files (17,619 trips and 51 listed rows), 17,404 rated hike detail files and 3,869 dossier files. "After" for the card and the KML is live now; for the rest it is what the new code gives once the data lane runs (T286-a).

| Metric | Before | After | Delta |
|---|---|---|---|
| Hike cards printing the stored ascent of a line drawn downhill | 488 | 0 (live on the current wire) | -488 |
| KML fact line climb, Korab (9) | +7 m | +1423 m (live) | |
| Wire rows whose `difficulty` differs from f.g | 11,629 of 17,670 | 0 after the next export | -11,629 |
| Dossier around trail rows whose difficulty differs from the trail's grade | 15,889 of 24,776 | 0 after export and dossier build | -15,889 |
| Hike rows with a dayOut reason that fails the comfort gate | 1,083 of 10,299 | 0 after the next rate.py run | -1,083 |
| Of those: climb over 800 m read uphill, over 6 h | 758, 717 | | |
| Rows whose climb reason changes (none to steady 260, none to bigClimb 187, steady to bigClimb 9) | 0 | 456 after rate.py | +456 |
| bigClimb reasons whose metre figure changes | 0 | 6 after rate.py | +6 |
| Root pytest, trail suites | 43 | 48 | +5 |
| App trailStory tests | 4 | 6 | +2 |

T108 counted 11,596 disagreeing rows on the hike rows alone; 11,629 is across all 17,670 card and listed rows.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A scripted edit to DestinationsTab.jsx matched nothing | The worktree files are CRLF and my first line-ending check was wrong | Normalised to LF in memory, edited, wrote back CRLF; every diff stays line-sized |
| The first test fixture assumed the card had no descent_m | My first look at the Korab card was truncated before route_schema's keys | Read the whole row: the card carries descent_m; tests and comments corrected |
| The dev server timed out on the first browser run | Dependency optimisation took over two minutes with other sessions running | Longer timeouts; no code change |

## What is still open

The pipeline changes reach readers only after rate.py, export_wire.py, the wire build and build_dossier.py run in the data lane, which the owner starts (T286-a). Until then the dossier's around rows keep validate.py's class (for example "Easy" on rows graded moderate) and the dayOut and climb reasons stay as they are. The app reads both the current wire and the next one, so there is no ordering trap on the app side.

pipeline/dossier/derive_do.py writes the raw `difficulty` code into the English "things to do" detail text. With the grade on the wire it would print "very_hard" with its underscore. It needs a word map before the next dossier build (T286-b). That file is outside this task.

rate.py's relief term still reads the stored ascent per kilometre, so the 488 rows drawn downhill under-score on relief. Changing it moves ratings, and belongs with the rating distribution work (T321) (T286-c).

Other single-number climb readers sit outside this task's files. RoutesFromHere.jsx prints the dossier routes' ascent_m directly (the PDF's routes block now goes through trailClimbUp). CountryBrief.jsx and dayExploreRails.js read ascent_m. trailCards.tripClimbBand and export_wire's ascent facet count file Korab (9) under "flat". TrailPage.jsx still builds a factLine the KML writer no longer needs (T286-d).

The destination PDF was not rendered, because it is behind the pass for a guest. Someone with a pass should download one guide near trails, Valbona Valley for example, and read the around rows (T286-e).

## Rollback procedure

Revert 69557ea in continent-app and the T286 commit in the root repo, both on p7-trail-climb-consistency. Nothing was written to data. If rate.py has already run with this code, re-running the previous rate.py restores the reasons, because they are recomputed in full on every run. If export_wire.py has run, re-running the previous version restores validate.py's class in `difficulty`; the trips.difficulty column was never changed.
