# T1193: Cycling external validation (D23)

ROADMAP item **D23** (Cycling row), round 2 session S109, batch 12. Builds on T1187 (runner), T1189 (beaches).

## Date

2026-11-07

## What changed

Cycling is a layer on the shared runner. `scripts/validation/layer_cycling.py` compares Carta's 16,973 cycle routes with one reference item per EuroVelo route and country (119 items from a seed list): coverage, fragmentation, and, when owner files exist, length against the official km and geometry agreement (500 m samples within 250 m of a matched line). A national network loader (`national.csv`) is built and tested. The 30 largest gaps have a provisional verdict each (`data/reports/validation/cycling/gap_reviews.json`). The runner's `LAYERS` got one line.

## Research

A research subagent (no web access, so all claims from memory and unverified) compared references:

| Reference | Use | Terms (unverified) |
|---|---|---|
| EuroVelo (ECF) | Route list and official lengths: the coverage reference | GPX personal use only; keep geometry out of git; derived numbers are low risk |
| France data.gouv schema national des veloroutes | Open geometry candidate | Licence Ouverte 2.0 |
| UK Sustrans NCN, Swiss opendata, Danish dataforsyningen | Open geometry candidates | OGL / OGD, confirm |
| D-Netz, AF3V, Bicitalia | Lists only | Not open |

Method choice: sampled-point distance with a grid index (stdlib), tolerance 250 m (90 m wire simplification plus reference error). Buffer share is the same in practice; Hausdorff and Frechet rejected (outlier driven, too slow). Reverse direction (spurious Carta geometry) not built.

## Files touched

Created: `scripts/validation/layer_cycling.py`, `tests/test_validation_cycling.py`, `data/reports/validation/cycling/` (`2026-11-07.json`, `baseline.json`, `gap_reviews.json`, `reference/eurovelo.csv`, `reference/README.md`), this report.
Modified: `scripts/validation/runner.py` (LAYERS line only), `data/reports/validation/scorecard.json`, admin snapshot `validationScorecard.json`, `docs/HANDBOOK.md` (item 10 of validation), `ROADMAP.md` (D23), `Execution/_OPEN.md`.

## Commands run

```
python3 -I scripts/validation/runner.py cycling --now 2026-11-07T12:00:00Z --write --write-baseline
python3 -m pytest -q tests/test_validation_cycling.py tests/test_validation_runner.py tests/test_quality_engine.py
ruff check scripts/validation/layer_cycling.py tests/test_validation_cycling.py
```

## Config and secrets set

None.

## Before/after measurements

New layer, no before. First run on the wire of 2026-10-23, seed reference (unverified), 0.7 s:

| Metric | Value |
|---|---|
| Reference items | 119 route-country pairs, 34 countries |
| Coverage (a Carta route tagged with the EV number in that country) | 50 of 119 (42.0%) |
| Matched but in the rated tier | 21 of 50 (42.0%) |
| Matched, not shattered (12 pieces or fewer) | 43 of 50 (86.0%) |
| Length fact, geometry fact | not measured: need owner files (T1193-b, T1193-c) |

## Gap review (30 largest, provisional)

| Verdict | Count | Meaning |
|---|---|---|
| carta_hole_probable | 13 | Published country with no icn route at all (LT, RO, GR, EE, MK, SE, DK) |
| tagging_or_matcher | 10 | Rows named velo without an EV number (PL 27, LV 18, DE 9) |
| route_absent_in_country | 7 | Country has other icn rows, not this route |

Verdicts are from the wire alone and stay provisional until the reference is verified. No score or data edited.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Geometry fact false on a near line | Segments were indexed only in their end cells | Index every cell along a segment |
| quality engine test fails | Fails on the base branch too | Not touched, register row T1193-g |

## Screens checked

None. The admin snapshot now lists the cycling layer; the end check should look at Admin, Data health, External validation.

## What is still open

Register rows T1193-a to T1193-g.

## Owner steps (for the checklist)

- [T1193-a] Verify the EuroVelo seed list | the whole coverage number rests on a list written from memory | open eurovelo.com route pages; correct names, total km and country lists in `eurovelo.csv`; set verified=yes; rerun `python3 -I scripts/validation/runner.py cycling --write --write-baseline` | `data/reports/validation/cycling/reference/eurovelo.csv`
- [T1193-b] Add official km per country | gives the length fact and error numbers | write `ev,cc,km` rows from the route pages; rerun the layer | `data/reports/validation/cycling/reference/README.md`
- [T1193-c] Add open official tracks | gives the geometry fact | convert open data (France data.gouv, Sustrans, Swiss opendata) to `geom/EV6-AT.geojson` style files after reading their terms; keep EuroVelo GPX out of git; rerun | `scripts/validation/layer_cycling.py`
- [T1193-f] Add national network lists | national cycle networks are not compared yet | fill `national.csv` (id,name,cc,ref,net,km) from portals whose terms allow it; rerun | `data/reports/validation/cycling/reference/README.md`

## Rollback procedure

`git revert` of the T1193 commits. Results and baseline are files in git.
