# Coverage: the audit, the country contract and the CI gate

Written for T1085 (ROADMAP B2) from `pipeline/regions/coverage.py`, `pipeline/regions/coverage_gate.py`, `pipeline/regions/quotas.py` and `.github/workflows/coverage-contract.yml`. The retired `archive/docs-2026-11/COVERAGE.md` was not used as a source.

## Two things share the word "coverage"

| Name | What it is | Code |
|---|---|---|
| Region coverage audit and country contract | Per region and per country, published rows against quota and floor for five layers. This document | `pipeline/regions/coverage.py`, run by task `regions` |
| Catalogue gap analysis (task `coverage`, quarterly, soft) | Which European places the destination catalogue does not hold, ranked per country. Read-only: promotion is manual | `pipeline/build_place_candidates.py`, `pipeline/harvest_place_signals.py`, `pipeline/score_place_candidates.py`; manual step `pipeline/promote_place_candidates.py`. Outputs `data/reports/coverage/` and `data/reports/coverage_gaps.json` |

The `coverage` task note in `run_pipeline.py` points to `docs/COVERAGE.md`, which does not exist.

## How it runs

Task `regions` (quarterly, `writes_wire`, soft, guard `guard_regions`) runs three commands in order:

1. `pipeline/regions/build_regions.py --skip-fetch` (region spine into `cache/regions/regions.gpkg`, opportunity measures into `cache/regions/opportunity.json`)
2. `pipeline/regions/coverage.py`
3. `pipeline/regions/export_regions.py --all`

`guard_regions` needs the module files plus `geopandas` and `h3`. `cache/regions/` is not in this checkout, so the audit cannot run here (not run for this document). By hand: `python pipeline/regions/coverage.py [--layers beach,lake] [--explain <candidate id>] [--strict]`. Default `--layers` is `beach,lake,mountain,trail,cycling`.

Environment: `CARTA_DATA_ROOT` (where caches and wires are read, default the checkout) and `CARTA_OUT_ROOT` (where outputs are written) let a sparse worktree audit real data without writing into the owner checkout.

## Outputs

| File | Content |
|---|---|
| `continent-app/public/coverage.json` | Wire. Per NUTS3 sized region and layer: `r`, `l` (rated, listed counts), `quota`, `floor`, `status` ok / thin / empty / na, `code` beside a non-ok status; `quota_units`; `contract` (per country per layer, without the miss lists). Version string `COVERAGE_VERSION` = `coverage_v1`. Merged, not replaced: a `--layers` run refreshes its layers and carries the rest forward |
| `reports/coverage_contract.json` | The contract with receipts: floors, rules, `reason_codes`, per country cells with the named misses. Version `CONTRACT_VERSION` = `coverage_contract_v1` |
| `reports/coverage_backlog_<layer>_<date>.csv` | Every deficit region joined to the candidates the layer's own gate rejected, replayed over the same caches. Dated files are untracked (`.gitignore`) |
| `reports/coverage.html` | Admin read: counts, dot map, 50 worst regions |
| `reports/coverage_alerts.json` | Regions whose representative point is farther than 60 km (EPSG:3035) from any published row of a layer, and applicable regions at status `empty` |

## Region status

Per region and layer, with `quotas.published_target` and `quotas.floor`:

- `empty`: rows of any tier below the floor
- `thin`: floor met but rated rows below the quota
- `ok`: rated rows at or above the quota
- `na`: `quotas.applicable` is false; reason from `quotas.why_not_applicable` (`no_coast_or_large_lakes`, `no_lakes_over_5ha`, `relief_below_250m`)

Quota model (`pipeline/regions/quotas.py`, `MODEL_VERSION` = `region_quota_v1`): `clamp(round(per_unit), lo, hi)` from the opportunity measures.

| Layer | Unit | `per_unit` | lo | hi |
|---|---|---|---|---|
| beach | coast stretch | `coast_km / 12` | 3 | 60 |
| lake | NUTS3 | `lakes_over_5ha ** 0.5 * 1.5` | 2 | 40 |
| mountain | GMBA range | `peaks_over_p100 ** 0.4 * 2` | 2 | 40 |
| trail | NUTS3 | `4 + 8 * protected_share + 6 * relief_norm` | 3 | 45 |
| cycling | NUTS3 | `2 + route_km / 60` | 2 | 30 |

Floor is 1 row of any tier for an applicable NUTS3 (3 at level 2). Applicability: beach needs `coast_km > 0` or `lakes_over_20ha > 0`; lake needs `lakes_over_5ha > 0`; mountain needs `relief_m > 250`; trail and cycling always. If `cache/regions/opportunity.json` is missing, `quotas.has_data()` is false and callers skip the quota step.

## The country contract

`COUNTRIES` lists 45 ISO codes (the comment says "44 plus Turkey"; the list counts 45). Each country gets one cell per audited layer, `ok`, `fail` or `na`. A non-ok cell must carry a `code` from `REASON_CODES` and a `detail` sentence.

`REASON_CODES`: `no_open_data`, `way_only_not_derived`, `failed_continuity`, `below_quota`, `not_applicable`, `licence_blocked`, `pending_partnership`.

| Constant | Value | Meaning |
|---|---|---|
| `COUNTRY_FLOOR_MIN` | trail 12, cycling 8, beach 10, lake 15, mountain 10 | Minimum published per country; the real floor is the larger of this and the "must" set |
| `TRAIL_FAME_THRESHOLD` | 0.4 | Registry trails (`data/trails/famous_registry.json`) at or above this `fame_score` must publish |
| `TRAIL_REGION_TOP` | 3 | Every NUTS3 publishes its top 3 registry rows (verdicts from `data/reports/trails_coverage.json`) |
| `COASTAL_REGION_MIN` | 5 | Every coastal NUTS3 publishes at least 5 beaches |
| `EEA_SITE_MATCH_KM` | 1.0 | A published beach this near an EEA coastal bathing site (`cache/eea_bathing_water.json`) counts as it |
| `EEA_LAKE_SITE_KM` | 2.0 | An EEA lake site this near anchors a lake as a must |
| `LAKE_ANCHOR_AREA_KM2`, `LAKE_ANCHOR_SITELINKS` | 5.0, 2 | Lake hard anchors beside "protected" and the EEA site |
| `LAKE_CELL_KM`, `LAKE_CELL_MAX` | 50, 3 | At most 3 lakes per 50 km cell |
| `ULTRA_PROM_M`, `RANGE_PEAK_M`, `RANGE_TOP` | 1500, 1000, 3 | Mountain must set: ultras, highpoints, lift-served summits (`SUMMIT_LIFT_KINDS`); each GMBA range with a peak over 1000 m publishes its 3 highest |
| `MICROSTATES` | MC 2, SM 61, LI 160 (km2) | A failing trail or cycling cell there becomes `na` / `not_applicable` |
| `KNOWN_GAPS` | TR trail, TR beach, UA trail | Stated facts that override the derived code on a non-ok cell |

Cycling must set is every route with `net` ncn or icn in the country's own wire, so its pool is bounded by the ingest. Beach, lake and mountain pools are the `rich_<CC>.json` caches under `cache/beaches/`, `cache/lakes/`, `cache/mountains/`; the detail says "pool bounded by the harvested, not the world". These cache folders are absent in this checkout. `build_contract` raises `ValueError` if a cell carries a code outside `REASON_CODES`.

## The CI gate

`pipeline/regions/coverage_gate.py` is standard library only. Rules in `violations()`:

1. A cell is missing or its status is not ok, fail or na.
2. A non-ok cell has no code from the contract's list, or a code with no detail.
3. An ok cell publishes fewer rows than its floor.
4. With a baseline, a cell listed `ok` in the baseline is no longer ok (ratchet; baseline version `coverage_gate_baseline_v1`, file `reports/coverage_gate_baseline.json`).

Commands: `--check <contract>`, `--baseline <file>`, `--write-baseline <file>`, `--require` (missing contract fails instead of warning), `--self-test` (seeds each fault). `coverage.py --strict` calls the same `violations()` against `reports/coverage_gate_baseline.json` when it exists.

Workflow `.github/workflows/coverage-contract.yml` runs on push to `main` and on pull requests that touch `pipeline/regions/coverage.py`, `pipeline/regions/coverage_gate.py`, `reports/coverage_contract.json`, `reports/coverage_gate_baseline.json` or the workflow, and on dispatch. It does a sparse checkout, then `--self-test`, then `--check reports/coverage_contract.json --baseline reports/coverage_gate_baseline.json --require`.

## Current state in this checkout

- `reports/coverage_contract.json` and `reports/coverage_gate_baseline.json` do not exist, so the `--require` step fails when the workflow runs. The workflow header says it stays red until the contract is generated on the build box and committed (open item T1057-b).
- The local `continent-app/public/coverage.json` is dated 2026-09-04, version `coverage_v1`, and has no `contract` key: it predates the contract code.

## Who reads it

`continent-app/src/lib/coverageCases.js` reads `coverage.contract.countries[cc][layer].code` to pick the sentence for an empty or thin page; `continent-app/src/lib/regions.js` and `continent-app/src/lib/footers.js` also load `coverage.json`. Region pages come from `pipeline/regions/export_regions.py` (see `docs/areas/regions.md`).
