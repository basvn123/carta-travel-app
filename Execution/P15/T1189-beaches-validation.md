# T1189: Beaches external validation (D23)

ROADMAP item **D23** (external validation of every layer, Beaches row), round 2 session S105, batch 6. Builds on T1187 (the runner), T1181 and T1097.

## Date

2026-11-06

## What changed

Beaches is the second layer on the shared validation runner. `scripts/validation/layer_beaches.py` compares the 14,861 sea bathing sites of the EEA WISE register with the 6,618 beaches on the wire: coverage, class agreement, the Poor swim flag, the inland flag, rank and class error, and the 30 largest gaps with a verdict each (`data/reports/validation/beaches/gap_reviews.json`). `layer_beaches_blueflag.py` is the Blue Flag loader on the same matcher; it waits for an owner export (see Research). The full run needs no network because the register is already in `cache/` (git-lfs, `git lfs pull`). The runner's `LAYERS` gained two names; the admin snapshot `validationScorecard.json` was regenerated so its agreement test passes.

## Research

A research subagent (hosts unreachable from the container, so its claims are from memory and marked unverified) compared the references:

| Reference | Terms | Choice |
|---|---|---|
| EEA WISE Bathing Water Directive status (Discodata, Data Hub) | EEA content, CC BY 4.0 (to confirm on the dataset page); attribute the EEA | Primary reference. Already harvested by `harvest_bathing_water.py`; the committed 322-site sample keeps its rows unchanged with attribution. |
| Blue Flag (FEE, blueflag.global) | Copyright reserved, no open list or API | Not scraped, not stored. Only a Wikidata (CC0) export as a soft hint, supplied by the owner. |
| England EA bathing water API | OGL v3 | Freshness check for England later (T1189-e). |
| France data.gouv.fr contrôle sanitaire | Licence Ouverte 2.0 | Cross-check for France later. |
| Italy Portale Acque, German Länder portals | Terms unconfirmed or mixed | Not used; the EEA carries those sites. |

Choice: the EEA register, because it is official, open, and the only list that covers all member states with classes. Caveat: Carta's spine is built from the same register, so coverage of spine-made rows is partly by construction. The `open` share (matched by a row not from the register) isolates the independent part.

## Files touched

Created: `scripts/validation/layer_beaches.py`, `scripts/validation/layer_beaches_blueflag.py`, `tests/test_validation_beaches.py`, `data/reports/validation/beaches/` (`2026-11-06.json`, `baseline.json`, `reference_sample.json`, `gap_reviews.json`), this report.
Modified: `scripts/validation/runner.py` (the `LAYERS` line only), `data/reports/validation/scorecard.json`, `continent-app/src/components/admin/validationScorecard.json` (generated snapshot), `docs/HANDBOOK.md` (item 7 of the validation section), `ROADMAP.md` (D23 status), `Execution/_OPEN.md` (rows appended).

## Commands run

```
git lfs pull --include=cache/eea_bathing_water.json
python3 -I scripts/validation/runner.py beaches --now 2026-11-06T12:00:00Z --write-baseline --write --no-snapshot --check
python3 -m pytest -q tests/test_validation_beaches.py tests/test_validation_runner.py tests/test_quality_engine.py tests/test_trails_external.py
ruff check scripts/validation/layer_beaches.py scripts/validation/layer_beaches_blueflag.py scripts/validation/runner.py tests/test_validation_beaches.py
python3 -I scripts/quality/engine.py
```

## Config and secrets set

None.

## Before/after measurements

Not measured before (the layer is new). First run, wire of 2026-10-29, register of 22,289 sites (14,861 sea):

| Metric | Value |
|---|---|
| Coverage (matched by name or place) | 3,512 of 14,861 (23.6%, Wilson 23.0 to 24.3) |
| A published beach within 3 km | 7,454 (50.2%) |
| Matched by a row not from the register (`open`) | 544 of 3,512 (15.5%) |
| Matched beach in the rated tier | 2,100 of 3,512 (59.8%) |
| Class agreement | 3,385 of 3,461 (97.8%, Wilson 97.3 to 98.2); 17 of the 76 misses are last season's class |
| Poor sites printed Poor or unclassified | 7 of 9 (77.8%, thin) |
| Inland flag agrees | 3,512 of 3,512 |
| Rank agreement (class against beach score) | Kendall tau-b 0.050, Spearman 0.061 (2,078): none |
| Class error | MAE 0.023 steps (3,461) |
| Run time | about 1.2 s |
| Committed sample (322 sites) | coverage 25.8%, class 82 of 82 |

Reading: the 97.8% agreement says the water class join is sound where a beach exists. The low coverage is the finding: 7,407 of the 14,861 sea sites (49.8%) have no Carta beach within 3 km. Part are extra sampling points of one beach (the 150 m dedupe), the rest are designated sites the export dropped.

## Gap review (30 largest, `gap_reviews.json`)

| Group | Count | Verdict |
|---|---|---|
| Excellent sea sites with no beach within 3 km (FR, ES, IT, GR, DE, HR, BE, PL, CY, DK) | 19 | Real hole. Lost at the name test, dedupe, stretch quota or PUBLISH_MAX; the cause is not logged (T1189-c). |
| Cyrillic registry name (BG Shkorpilovtsi) | 1 | Real defect: the name test drops non-Latin names. |
| Class mismatch where several register sites lie on one beach (FR Bonnegrace, ES Massamagrell, PT Cabedelo and Amoreira, IT Corniglia, AL Durres, Velipoja, Kavaje) | 10 | Join choice: Carta prints one site's class. Decide worst or each (T1189-d). |

Also found outside the 30: Albania Kavaje is Poor in the register and prints Sufficient (the only swim flag miss besides a duplicate; check the site pair and year on the box, T1189-f). No score was edited.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| First coverage read 19.6% | Lake and river sites (7,428) compared with the beaches layer | Sea sites by default, `inland` option kept |
| Gap list was 20 Albanian and Austrian sites | Ties broke alphabetically | At most 3 per country, stable hash on ties |
| `ruff --fix` touched `trails_external.py` | Ran on the whole folder | Reverted; not part of this task |
| Quality test failed on a 9-item warning | `fact.poor` needed 10 items | `min_n` 5 |

## Screens checked

None (no screen changed). The admin snapshot now lists two layers; the end check should look at Admin, Data health, External validation.

## What is still open

Register rows T1189-a to T1189-j.

## Owner steps (for the checklist)

- [T1189-h] Refresh the register and rerun beaches on the box | the committed run uses the register cached on 2026-10-29 and the D2 gate reads the latest result | `python3 pipeline/harvest_bathing_water.py --sites-only`; `python3 -I scripts/validation/runner.py beaches --write --check`; if coverage moved on purpose rerun with `--write-baseline` and say why; commit `data/reports/validation/beaches/` | `scripts/validation/layer_beaches.py`, `docs/HANDBOOK.md`
- [T1189-i] Export the Wikidata Blue Flag list and run it | the Blue Flag layer has no reference until then; FEE's own list must not be scraped | run a SPARQL query on query.wikidata.org for beaches with award received Blue Flag (id, name, lat, lon, country code) and save as CSV to `data/reports/validation/beaches/blueflag_wikidata.csv`; `python3 -I scripts/validation/runner.py beaches_blueflag --write --write-baseline` | `scripts/validation/layer_beaches_blueflag.py`
- [T1189-j] Confirm the EEA licence text and the download URL | the research could not reach eea.europa.eu | open the Data Hub item "Bathing water directive, status of bathing water", confirm CC BY 4.0 and the Discodata table, add the attribution line to `docs/tos/` if needed | `docs/HANDBOOK.md` (Beaches)

## Rollback procedure

`git revert` of the T1189 commits. The result and baseline are files in git; `engine.py --no-validation` skips the gate for one run.
