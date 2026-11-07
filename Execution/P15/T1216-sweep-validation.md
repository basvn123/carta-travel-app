# T1216: Register follow-up sweep, validation

ROADMAP item: register follow-up (validation), under D23 (External validation of every layer). Round 3 session S132, batch 16.

## Date

2026-11-07

## What changed

The round 2 validation rows (raised by T1187 to T1196) were swept. Of the 45 open `next task` rows in the group, 11 are closed and 34 stay open, each with a reason below; none moved to the owner, and one new owner row (T1216-c) was raised. Three closures are code in `scripts/validation/`: the ratings layer now reads every component point of a serial World Heritage site from `cache/unesco_whc_raw.xml` (1,270 sites, 6,009 points; Hedeby now counts for Dannewerk), which raises the places with a site in reach from 360 to 610 and drops the share that carries the `unesco_whc` tag from 75.6% to 57.0%, so the validation now shows the size of the pipeline's join gap (T1191-a: Wismar, Samos and Charleroi are among the untagged); the beaches name test transliterates Cyrillic and Greek register names with the pipeline's own transliterator (`pipeline/trails/names.transliterate`, T1092) using the site's country, so BG names such as Shkorpilovtsi stop failing the test; and the runner has `--gaps-only`, which keeps per-item results only for the gaps (a sample beaches run: 105.5 KB to 18.0 KB, metrics unchanged). Seven rows were already done by later tasks and are closed with the proof below. The 32 owner rows of the group were not touched.

## Research

None chosen. The transliteration reuses the existing T1092 module (`pipeline/trails/names.py`: Bulgarian streamlined system, the other national Cyrillic tables, Greek by ELOT 743) instead of adding a table or a library. The World Heritage points come from UNESCO's own export that `pipeline/harvest_unesco_whc.py` already caches; the XML is read with the standard library.

## Files touched

- `scripts/validation/layer_ratings.py`: `load_sites` reads the component points of `cache/unesco_whc_raw.xml`, falls back to `cache/unesco_whc.json`; `n_site_points` in the build.
- `scripts/validation/layer_beaches.py`: `translit`, `stratum_cc`; `tokens` and `names_agree` take the register country; `plazh` is a stop word.
- `scripts/validation/runner.py`: `keep_gap_results` and `--gaps-only`.
- `tests/test_validation_ratings.py`, `tests/test_validation_beaches.py`: tests for the three changes.
- `docs/HANDBOOK.md` (External validation runner: `--gaps-only`, beaches transliteration), `ROADMAP.md` (D23 status), `Execution/_OPEN.md`, `Execution/_OPEN-CLOSED.md`, this report.

## Commands run

    git fetch origin && git checkout -b p15-s132-sweep-validation origin/p15-round3
    python -I scripts/validation/runner.py ratings              # before and after, report only
    python -I scripts/validation/runner.py beaches --write --no-snapshot --out <scratch>/v1
    python -I scripts/validation/runner.py beaches --write --no-snapshot --gaps-only --out <scratch>/v2
    python -m pytest tests -q (minus tests/quarantine.txt)
    ruff check (0.14.3) on the touched Python

No result, baseline or scorecard was written to `data/reports/validation/`: in this container `cache/unesco_whc.json`, `cache/eea_bathing_water.json` and other caches are git-lfs pointers, so a written result would not be the box's (owner step T1216-c).

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Validation rows in the group, `next task`, open | 45 | 34 | 11 closed |
| Validation rows in the group, `user`, open | 32 | 33 | +1 (T1216-c, new) |
| Rows moved from `next task` to `user` | | 0 | |
| New rows | | 4 (T1216-a to d) | |
| Ratings: World Heritage sites read / points | 1,364 sites, 1 point each (committed run, unesco_whc.json) | 1,270 sites, 6,009 points (unesco_whc_raw.xml) | |
| Ratings: places with a site in reach (fact.unesco_join n) | 360 | 610 | +250 |
| Ratings: of those, tagged unesco_whc | 272 of 360, 75.6% | 348 of 610, 57.0% | the reference widened, not a regression |
| Dannewerk sees Hedeby | no (10.8 km to the site centre) | yes | |
| Beaches: BG name `ШКОРПИЛОВЦИ-ЦЕНТРАЛЕН ПЛАЖ` tokens | none (dropped whole) | shkorpilovtsi, tsentralen | |
| Beaches: coverage on the committed 322-site sample | 25.78% | 25.78% | 0 (the sample has no matchable BG Cyrillic site; the full register is on the box) |
| Beaches dated result, sample run | 105.5 KB | 18.0 KB with --gaps-only | -83% |
| pytest (validation, quality engine) | | all pass | |

## Rows closed (11)

| Row | Why it is closed |
|---|---|
| T1187-c | No longer true: T1181-h was closed by T1201 (in `_OPEN-CLOSED.md`). |
| T1187-f | No longer true: `runner.py` LAYERS carries beaches, prices (with fares and sample), texts, lakes, mountains, ratings, cycling, climate, sea, crowds, trips and photos. |
| T1187-g | No longer true: the judge is `pipeline/judge` (T1188), Gemini through the gateway or a session, no Claude API; its calibration is the owner row T1188-a. |
| T1188-e | The collector exists (T1196: `texts_sample.py build` for blurbs, trail summaries and trip text, 120 items in `data/reports/validation/texts/items.json`; `texts_backtranslation.py` for translations). Ask answers re-raised as T1216-a; the baseline stays T1196-h. |
| T1189-b | No longer true: `layer_lakes.py` (T1192) validates the 6,211 Lake sites of the register. River sites re-raised as T1216-d. |
| T1189-g | Done here: Cyrillic register names transliterated; `--gaps-only` for a smaller dated file. |
| T1190-f | No longer true: `scorecard.json` and `continent-app/src/components/admin/validationScorecard.json` both carry the prices row and hold the same JSON. |
| T1190-i | Done by the row's second option: drinks are checked only in the soft `fact.level`; no hard check reads them. A010201 is now in `reference_pli.json` but prices alcohol bought in shops, not drinks served, so it is not the right reference for a bar beer. |
| T1191-i | No longer true: both scorecard files carry the ratings row (same check as T1190-f). |
| T1191-k | Done here for the serial sites; the village associations part re-raised as T1216-b (hosts blocked). |
| T1193-g | No longer true: `tests/test_quality_engine.py` passes 14 of 14 on `p15-round3`. |

## Rows still open (34), one line each

- T1187-a: the call belongs in `run_pipeline.py`, outside this sweep's files.
- T1187-b: the eval adapter is `continent-app/scripts/eval/adapters/trails-external.mjs`, outside the files; retiring the old baseline first would break it.
- T1187-d: a rating decision for the next trails rating review (fame weight against v5), not a code change.
- T1187-e: waits for the verified reference list (T1181-a).
- T1188-c: `pipeline/ai_gateway.py` and `continent-app/config/ai_models.json` are outside the files.
- T1188-d: `evals/truth/judge/` is outside the files.
- T1189-a: `run_pipeline.py`, outside the files.
- T1189-c: a log in `export_beaches` is a layer writer change.
- T1189-e: the EA and data.gouv.fr hosts are blocked here.
- T1189-f: `harvest_bathing_water` is a pipeline harvest, outside the files.
- T1190-d: `pipeline/stays/build_stays.py` is a layer writer.
- T1190-e: the baskets live in the pipeline's cost model, outside the files.
- T1190-g: `run_pipeline.py`, outside the files.
- T1191-a: `apply_designations.py` is a layer writer (this task's ratings change now measures its gap: 262 of 610 untagged).
- T1191-b: a re-tune of the rating shares in the pipeline, outside the files.
- T1191-d: `harvest_pageviews.py`, outside the files.
- T1191-e: `place_layer` depth, outside the files.
- T1191-f: a place class fix in the catalogue, outside the files.
- T1192-b to T1192-e: lake harvest and `enrich_lakes` joins, layer writers.
- T1192-f: needs the full mountains export (owner row T1192-a); on the 21-summit seed only Kebnekaise is off.
- T1193-d, T1193-e: the cycling harvest, outside the files.
- T1194-d: no real climate, sea or crowds run exists yet (owner rows T1194-a to c).
- T1195-c, T1195-d: `pipeline/trips/trip_model.py`, outside the files.
- T1196-b: waits for the native reader (owner row T1196-a); the catalogues are outside the files.
- T1196-c, T1196-d, T1196-e: guide match, journey summaries and the trail summary source are outside the files.
- T1196-g: planting subtle faults (word sense, direction, dropped clause) per language is a method choice with its own research and a judge run in a session after T1188-a.
- T1196-h: waits for the judge to count (T1188-a).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| After swapping a first local table for the shared transliterator, `Слънчев бряг` read "slnchev" | Without a country the shared module guesses the scheme and drops the hard sign | `tokens` and `names_agree` take the register's country (`stratum_cc`) |
| A ratings test put the far component next to another fixture town | Fixture towns sit every 0.5 degrees | Moved the point off the grid |
| The ratings run in the container read no sites before this change | `cache/unesco_whc.json` is a git-lfs pointer here | The layer now reads the raw XML, which is present; the box run is T1216-c |

## Screens checked

None. Nothing a traveller sees changed; the admin snapshot was not rewritten.

## What is still open

The 34 rows above, plus T1216-a (Ask answers have no sample), T1216-b (village association lists), T1216-c (owner: the ratings rerun on the box and a deliberate baseline move), T1216-d (river bathing sites).

## Owner steps (for the checklist)

- [T1216-c] Rerun the ratings validation on the box | serial World Heritage sites now count at every component, so fact.unesco_join reads about 57% instead of 75.6% and its soft check warns until the baseline moves | run `python -I scripts/validation/runner.py ratings --write`; check the untagged places it lists against T1191-a; run `python -I scripts/validation/runner.py ratings --write-baseline` once and commit data/reports/validation/ratings/ | Execution/P15/T1216-sweep-validation.md

## Rollback procedure

`git revert` of the T1216 commits on `p15-s132-sweep-validation`. The register move is reverted by the same revert. Nothing is one-way: no result, baseline or live data was written.
