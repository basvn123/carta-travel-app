# T1092: Trail display names and per-day difficulty

ROADMAP item: D7 (Trails and outdoor fill), the display names and difficulty bullets. Audit: P-36. Session S08 of `Execution/P15/_NEXT-50-SESSIONS.md`.

## Date

2026-11-05

## What changed

Trail difficulty now reads one day of the walk instead of the whole route. The new pure module `pipeline/trails/difficulty.py` computes DIN 33466 walking hours (the rule `elevation.py` already uses for `duration_min`). A walk of up to 10 h is one day; a longer one is split into 6 h stages. The effort grade reads one stage's hours and climb against `DAY_LADDER` (very hard over 8 h or 1,500 m, hard over 6 h or 1,000 m, moderate over 3.5 h or 500 m). `attributes.py` takes the harder of this and the terrain grade, as before. The old rule made anything over 40 km "very hard".

A derived (DEM) terrain grade above moderate now also needs 200 m of relief. Without that cap, a London city loop with 44 m of relief graded "hard" from DSM speckle.

The wire ships the days as `f.d` (only for 2 days or more). The app prints "Long" on cards, nearby rows and the PDF, and "Long, 14 days" as the page's grade fact, when the walk takes 2 days or more and its grade is moderate or easier. A long walk on hard ground keeps its grade.

Names: `names.py` now folds network prefixes ("European long distance path E7, Andorra" becomes "E7, Andorra"). It transliterates Cyrillic and Greek by the national system for the country, and only when the tags hold no Latin name. Shortening no longer leaves an open quote, a stripped leading bracket or a dangling "via". The export applies `wire_name()` to every title, and ships the source's own name as `src_name` when it differs. The page shows it under the title as "Also called ...".

The Veluwe Zwerfpad (286 km, 10 m of climb per km) goes from `very_hard` to `moderate` with 14 days, so it reads "Long". The rebuild is an owner step (T1092-a); until then the shipped wire is unchanged.

## Files touched

- Created: `pipeline/trails/difficulty.py`, `tests/test_trail_difficulty_names.py`, `continent-app/tests/trailLong.test.mjs`, this report.
- Modified, pipeline: `pipeline/trails/attributes.py` (effort from difficulty.py, relief cap, `days` in `grade_parts`, country passed to the title ladder), `pipeline/trails/names.py` (`strip_network`, `transliterate`, `readable`, `wire_name`, `source_label`, `cap_title` fixes, `title_ladder(country=)`), `pipeline/trails/export_wire.py` (`name` via `wire_name`, `src_name`, `f.d`, `days_of_trip`, effort floor read uphill per day, filter model text).
- Modified, app: `continent-app/src/lib/trailStory.js` (`trailDays`, `isLongWalk`, `gradeLabelKey`), `continent-app/src/lib/cardFillings.js`, `continent-app/src/browse/TrailPage.jsx`, `continent-app/src/i18n/{en,de,fr,es,it,nl}.js` (3 keys each).
- Modified, tests and docs: `tests/test_trail_data_bugs.py` (Korab stored-direction effort is now moderate, still below uphill), `docs/HANDBOOK.md` (Trail difficulty; new Trail names section), `docs/SCHEMA.md` (two additive keys), `ROADMAP.md` (D7 status), `Execution/_OPEN.md`.

## Commands run

```
pip install pytest psycopg[binary] osmium shapely numpy ruff==0.14.3
python -m pytest tests/test_trail_difficulty_names.py tests/test_trail_titles.py tests/test_trail_data_bugs.py tests/test_trail_climb_consistency.py -q
python -m pytest tests -q <quarantine deselects>
ruff check --select E9,F63,F7,F82 pipeline tests
cd continent-app && npm ci && npx eslint <touched files> && npm test
```

The pipeline itself was not run: the trailslab PostGIS lab is not in the container. The before and after figures below are recomputed offline from the shipped wire. Each detail file carries `grade_parts` (terrain, terrain source) and `elevation`, so the new rule can be replayed row by row. The export builders (`wire_item`, `detail_item`) were run on fixture rows.

## Config and secrets set

None.

## Before/after measurements

Offline replay of the new rule over the 17,619 rated rows of `continent-app/public/trails/` (wire of 2026-09-13). "After" is what the next rebuild will ship.

| Metric | Before | After | Delta |
|---|---|---|---|
| Veluwe Zwerfpad (NL 114362) grade | very_hard | moderate, 14 days, reads "Long" | fixed |
| Thames Path (GB 185706) grade | very_hard | moderate, 14 days, reads "Long" | fixed |
| Rows graded very_hard | 2,865 | 2,085 | -780 |
| Rows graded hard | 4,320 | 2,274 | -2,046 |
| Rows graded moderate | 6,971 | 8,774 | +1,803 |
| Rows graded easy | 2,977 | 4,002 | +1,025 |
| Rows graded alpine | 271 | 269 | -2 |
| Rows whose grade changes | | 5,177 | |
| Rows that read "Long" | 0 | 384 | +384 |
| Rows whose derived terrain is relief-capped | | 3,211 (DE 1,495, GB 268, FR 161) | |
| Names in Cyrillic or Greek | 643 | 1 (a superscript "no" in a Belgian name) | -642 |
| Names with an E-path phrase | 37 | 0 | -37 |
| Names over 42 characters | 1,925 | 0 | -1,925 |
| Names changed by `wire_name` (and so carrying `src_name`) | | 2,523 | |
| Python trail tests | 48 | 63 | +15 |
| App tests (`npm test`) | | 1,290 pass, 0 fail | |

Where the grade changes come from: the relief cap (2,217 rows alone, 823 more with an effort change), single short flat walks becoming easy (1,035), long multi-day walks dropping from very hard (369), and single long days rising to hard or very hard (about 660). That last group is the honest side of the same rule: a 7.4 h day with 900 m of climb is hard even under 25 km.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Veluwe still graded "hard" after the per-day effort fix | One 26% DEM span on a route whose top is 112 m set derived terrain to hard | `DERIVED_HARD_MIN_RELIEF_M = 200` caps derived terrain at moderate on low ground; tagged grades are never capped |
| Korab stored-direction test expected effort "easy" | DIN hours count descent, so the line read downhill is now a 3.9 h moderate day | Assertion updated to moderate, still below the uphill hard reading |
| Shortened names ended on `"Kobyle`, `via`, or lost a leading `[` | `cap_title` stripped brackets on the left and did not balance quotes | Left strip takes separators only; odd quotes and dangling joining words are dropped |
| `tests/test_rating_inputs.py`, `tests/test_rating_stability.py` fail locally | They read LFS JSON this container has not pulled (CI pulls it) | Not this task; untouched |

## Screens checked

None in the browser. The dev server starts, but the app cannot load its travel data in this container: the core shards come from the R2 data host, which the network policy blocks, so the shell shows its load error. The card's "Long" word is covered by `trailLong.test.mjs` through the real `trailFilling` builder. The trail page change is two lines (the grade fact and the subtitle) and is not covered. The end check must look at the Trails list card and the trail page, at phone and desktop width, for Veluwe Zwerfpad (NL) and an E-path stage (AD or PL), after the rebuild (T1092-b).

## What is still open

- T1092-a (user): rebuild the trails wire on the box (`trails_attributes`, then `trails_rate` which exports), check `difficulty_gate.py`, and push the data. Nothing a traveller sees changes before this.
- T1092-b (user): look at the touched screens on a phone after the rebuild.
- T1092-c (next task): the dossier's around and nearby rows and the region cards carry no `f`, so they cannot say "Long" yet; `build_dossier.load_layer_index` should copy `f.d` (or a top-level `days`).
- T1092-d (next task): the relief cap moves 3,211 derived terrain grades; after the rebuild, spot-check 20 capped rows on the map (DE has 1,495) and tune `DERIVED_HARD_MIN_RELIEF_M` if real ravine walks were caught.

## Rollback procedure

`git revert` the T1092 commit. Nothing is one-way: no migration, no data written. After the rebuild, a revert plus a re-export restores the old grades and names.

## Owner steps (for the checklist)

- [T1092-a] Rebuild the trails wire with the new names and per-day difficulty | the code is merged, but the shipped wire still has 2,865 very-hard rows (Veluwe Zwerfpad among them) and 643 Cyrillic or Greek names until the lab reruns | on the box with trailslab up (cd tools/trailslab && docker compose up -d); python run_pipeline.py trails_attributes; python run_pipeline.py trails_rate (exports continent-app/public/trails/); python pipeline/trails/difficulty_gate.py must pass; check NL.json id 114362 has f.g moderate and f.d 14; push data with the next deploy (node scripts/r2/push-data.mjs --live) | Execution/P15/T1092-trail-names.md
- [T1092-b] Look at the trail card and trail page on a real phone after the rebuild | the browser check could not run in the cloud container (data host blocked) | open Explore, Trails, Netherlands, find Veluwe Zwerfpad: the card says Long, the page grade fact says Long, 14 days; open an E-path stage in Andorra or Poland: the title reads E7, Andorra (or E3, Poland (west)) with Also called and the full name under it; repeat at desktop width | Execution/P15/T1092-trail-names.md
