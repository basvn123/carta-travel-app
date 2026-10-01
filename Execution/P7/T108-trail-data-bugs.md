# T108 Fix the five user-visible trail data bugs

## Task ID

T108 (mind-map number T104).

## Date

2026-10-01

## What changed

All five bugs in spec 6.8 now have a fix in code and a regression test. The tests are built on the two Mount Korab rows as the wire carried them. Three of the five are fully fixed inside the files this task could touch. The other two, the region and the highlight names, are fixed in logic, but a reader sees them only after one more line in a file outside this task's scope. Nothing was written to data. The published wire changes after the next pipeline run.

Direction. A one-way route is stored in whatever direction its mapper drew it. Mount Korab (9) was drawn summit to village, so it carries 7 m of ascent and 1,423 m of descent. attributes.py now has uphill(). If a line's net drop is at least 300 m and at least twice its climb, it was drawn downhill. Every grade and suitability term then reads the climb a walker faces from the bottom. Korab (9) goes from effort "easy" with a beginner chip to effort "hard", grade "hard" and no beginner chip. The geometry is not reversed. Reversing it would move every along_m (highlights, photos, water points), break the md5 that ties a trip_repairs row to its source line, and swap the elevation start and end. So I took the spec's second option instead: keep the stored line and show both numbers. grade_parts now carries stored_downhill, climb_m and drop_m. The trail page already prints Ascent and Descent side by side. trailStory.js has trailClimb() with the same rule, for any surface that prints one number. The rule is copied by hand into regionize.py, regression.py and the app, because importing attributes.py would pull psycopg's Jsonb into passes that do not need it. A test checks that the three Python copies agree.

Two grades. The wire carries validate.py's three-value `difficulty` beside attributes.py's five-value `f.g`. The facts strip printed f.g, but the story sentence below it read `difficulty`. So Korab (9/1) said "Very hard" in the strip and "Real climbing in places, but nothing technical" underneath. trailStory.js now reads the grade through trailGrade(): f.g first, and `difficulty` only on a row attributes.py has not reached. very_hard and alpine use the hard sentence. On purpose, attributes.py does not overwrite `difficulty`. validate.py treats that column as the tagged grade and compares it with its own effort class. An overwrite could trip tagged_difficulty_mismatch, cost the row 65 quality points and get it demoted by regression.py.

Region. The page subtitle is the nearest catalogue destination to the bbox centre, with no border check. For Korab (9/1) that is Mavrovo National Park, 22 km away across the ridge in North Macedonia. regionize.py now places the trailhead as well as the midpoint. The trailhead is the start of the line, or its end when the line was drawn downhill. It writes rg.s3 and rg.sc, but only where the trailhead's level 3 region or country differs from the owner's. The wire grows only on those rows. The midpoint still owns the route for the quota, the region pages and verify(), so none of those move. trailStory.js has trailheadCountry() and trailPlace(). trailPlace() names the nearest town only when it is in the trailhead's country, and otherwise names the trailhead's country alone. TrailPage.jsx still renders assoc.dest directly, so readers see the fix only once that line calls trailPlace() (T108-a).

Highlight names. names.py has display_name(). It picks name:en first. Then a Latin `name`. Then the local language's Latin name, from LOCAL_LANGS, which covers the Balkans, Greece, Cyprus, Turkey, Ukraine and Moldova. Then int_name and any other Latin name:*. Only then a name in another script. Title rung 2 (source_name) now goes through it, and landmark_title() goes through feature_name(), so titles and highlights share one order. The highlight names themselves come from scenic.py, which keeps only the plain `name` tag at harvest. The Cyrillic stays until scenic.py stores display_name(tags, country) and is re-run (T108-c).

Comfortable day. rate.py picks "dayOut" from distance alone (6 to 22 km). trailReasons() now drops that line unless isComfortableDay() agrees. The climb, read uphill, must be at most 800 m, which is rate.py's own BIG_CLIMB_M. The walking time must be at most six hours, where the story already says to set aside a full day. When no trip record is passed, a bigClimb reason in the same list stands in for the climb. That covers Korab (9/1) as TrailPage calls it today. Rows that fail only on time or direction need TrailPage to pass the record (T108-b).

Watch. regression.py now counts the five bugs on every row it checks, through display_bugs(), and writes the counts to trails_freshness.json under display_bugs. It never demotes anything. This is the check that catches the bugs reappearing on new rows.

## Files touched

Modified:
- pipeline/trails/attributes.py (uphill, oriented, derive reads the route uphill, descent_m fetched, run summary)
- pipeline/trails/regionize.py (trailhead, trailhead_block, rg.s3 and rg.sc, endpoints in MIDPOINTS_SQL)
- pipeline/trails/names.py (display_name, LOCAL_LANGS, feature_name; source_name and landmark_title use them)
- pipeline/trails/regression.py (display_bugs, display_rollup, report section)
- continent-app/src/lib/trailStory.js (trailClimb, trailGrade, trailheadCountry, trailPlace, isComfortableDay, dayOut gate, grade sentence)

Created:
- tests/test_trail_data_bugs.py (16 tests)
- continent-app/tests/trailStory.test.mjs (4 tests)
- Execution/P7/T108-trail-data-bugs.md

Register: Execution/_OPEN.md, rows T108-a to T108-g.

## Commands run

python -m pytest tests/test_trail_data_bugs.py tests/test_trail_titles.py -q gives 43 passed, so the 27 T107 title tests still hold. node --test tests/trailStory.test.mjs gives 4 passed. npx eslint on the changed app files reports nothing. The measurements come from a read-only script. It loads the main checkout's public/trails country files, all 17,404 hike detail files, public/app_data.json and the level 0 layer of cache/regions/regions.gpkg, then runs the new functions over them.

## Config and secrets set

None.

## Before/after measurements

Measured on the 17,404 hike rows of the published wire. "After" is what the new code gives on the same rows. A pipeline column changes on the wire only after the next run.

| Metric | Before | After | Delta |
|---|---|---|---|
| One-way rows drawn downhill and graded on their stored ascent | 488 | 0 once attributes.py runs | -488 |
| Of those, rows whose effort grade changes | not applicable | 283 | |
| Of those, rows carrying a beginner or family chip today | 114 | re-judged on the climb | |
| Rows whose story sentence contradicts the grade chip | 11,003 | 0 | -11,003 |
| Rows where the wire's difficulty differs from f.g | 11,596 | 11,596 (no longer printed by the story) | 0 |
| Rows whose subtitle names a country other than the trailhead's | 1,308 | 0 through trailPlace(), once TrailPage calls it | pending T108-a |
| Rows whose trailhead is outside the row's country (gain rg.sc) | 294 | 294 tagged on the next regionize run | |
| Rows with a highlight or reason name in a non-Latin script | 799 | 799 until scenic.py uses display_name | pending T108-c |
| Rows saying "a comfortable day out" over 800 m of climb or 6 h | 1,083 | 0 with the trip record; about 477 still shown until T108-b | about -606 now |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| trailStory.js showed as a whole-file diff | The app repo stores it with CRLF and the edit wrote LF | Rewrote it with CRLF; the diff is 93 lines |
| Two lines in regression.py joined into one | The shell heredoc used for the edit dropped the line-continuation backslashes | Restored them |

## What is still open

The pipeline half reaches users only after regionize.py --refresh, attributes.py, export_wire.py and the wire build run on trailslab, which is a data write and out of scope here (T108-g). Four wiring steps sit in files this task could not touch. TrailPage.jsx should render its subtitle through trailPlace() (T108-a) and pass the trip record to trailReasons() (T108-b). scenic.py should store display_name(tags, country) as each feature's name and be re-run (T108-c). Several places print a single stored ascent: the card in DestinationsTab.jsx, the KML fact line, AroundHere.jsx and destinationPdf.js. They should print trailClimb().up or both numbers (T108-d). rate.py still picks bigClimb and dayOut from the stored ascent and from distance alone. It should read the uphill climb and apply the same comfort check at the source (T108-e). export_wire.py still ships `difficulty` beside f.g, and AroundHere and destinationPdf read it. It should be dropped or set to the grade wherever a grade exists (T108-f).

## Rollback procedure

git revert the T108 commit in the root repo and the T108 commit in continent-app, both on p7-trail-data-bugs. Nothing was written to data. If regionize.py has already run with this code, rg carries extra s3 and sc keys that only trailStory.js reads, and a regionize.py --refresh with the old code removes them. If attributes.py has run, re-running the old version restores grades and suitability, because both are recomputed in full on every run.
