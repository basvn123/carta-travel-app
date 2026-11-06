# T1143: provenance and freshness per field (ROADMAP D3, round 2 session S59)

## Date

2026-11-06

## What changed

Every key block on the wire now says where it comes from and how fresh it is. Schema 20: each of the 18 object-valued destination keys of `docs/wire.schema.json` (`costs`, `accommodation`, `local_transport`, `beauty`, `image`, `activities`, `rating`, `taste`, `transfer`, `climate`, `place`, `driving_toll`, `bathing_water`, `crowding`, `geonames`, `nature`, `guide`, `wikidata`) carries `_src` (a source id) and `_asof` (the `YYYY-MM-DD` date its layer last built it). On the shipped `continent-app/public/app_data.json` that is 49,328 of 49,328 key blocks, up from 0. The registry `pipeline/config/sources.yaml` holds 24 sources, each with kind (primary, or derived with its inputs), SPDX licence, EU frequency cadence, `run_pipeline.py` tasks, owner and its rows in the licence ledger, plus which source and writers stand behind each block. `pipeline/provenance_sources.py` generates `docs/data/sources.md` and the schema's `_src` enum from it; `--check` (run by pytest, so by CI) fails on a stale doc or enum and on a registry that disagrees with the ledger, `run_pipeline.py`, the writers on disk or the schema. `pipeline_io.atomic_write_json` stamps every unstamped block of the master and the served wire before it writes (a fresh block gets today, a kept block keeps its date), so every layer writer is covered without its own call; the two writers that edit a block in place call `provenance.touch()`. The contract requires both keys on every key block, so the pipeline guard, the sync guard and the CI gate reject a missing stamp. The app's loader lifts the stamps off the blocks into a side table (`src/lib/provenance.js`, `provenanceOf(record, block)`), so all 3,868 records hydrate identically from the v19 and the v20 wire, and the rank tier is byte for byte the same size. The shipped wire was migrated with `provenance.py --backfill`, dating every block by its own `meta.generated_at` (2026-06-07), so no block claims to be fresher than it is. The master on the build box is the owner's step.

## Research

A research subagent compared the conventions (its note: w3.org and datapackage.org were not reachable from the container, so PROV, DCAT and schema.org ranges are from the specs as known; the Frictionless and EU frequency points were confirmed by search).

| Question | Options | Choice and why |
|---|---|---|
| `_asof` format | ISO 8601 date `YYYY-MM-DD` (DCAT `dct:modified` and schema.org `dateModified` accept it); RFC 3339 timestamp (PROV `prov:generatedAtTime`, Frictionless `created`) | Date: no block changes within a day, it sorts as a string, and it is 10 bytes instead of about 20 on roughly 49,000 blocks. The full build time stays in `meta.generated_at`. https://www.w3.org/TR/vocab-dcat-3/#Property:resource_update_date, https://www.w3.org/TR/prov-o/#generatedAtTime |
| Licence ids | free text (the ledger today); SPDX ids; Open Definition ids (Frictionless) | SPDX (`ODbL-1.0`, `CC-BY-4.0`, `CC0-1.0`), `LicenseRef-<name>` where SPDX has none; the full text stays in the ledger rows each source names. https://spdx.org/licenses/ |
| Cadence vocabulary | run_pipeline.py's own words; Dublin Core frequency; EU Publications Office frequency table | EU table codes (`WEEKLY`, `MONTHLY`, `QUARTERLY`, `ANNUAL`, `IRREG`), a superset of Dublin Core; the check maps run_pipeline.py's cadences onto it. https://op.europa.eu/en/web/eu-vocabularies/concept-scheme/-/resource?uri=http://publications.europa.eu/resource/authority/frequency |
| Registry fields | Frictionless `sources`/`licenses`; DCAT `dct:license`, `dct:accrualPeriodicity`, `dcat:contactPoint` | Frictionless and DCAT names in spirit: id, title, licence, cadence, owner, plus ledger, tasks and inputs for this repo. https://datapackage.org/standard/data-package/ |
| Inline keys or a side table | inline per block (the ROADMAP's shape); one side map per record or per file | Inline on the wire, as the ROADMAP fixes, with a leading underscore so a filter rule is simple; the app moves them into a side table at load so no screen that walks a block's keys sees them. A wire side table would save about 1 to 2% gzipped and could drift from the blocks. |
| Doc generator | plain Python with PyYAML (already a dependency); frictionless CLI; an mkdocs plugin | Plain Python with a deterministic `--check`: the frictionless CLI validates packages but renders no doc, and there is no docs site for a plugin. https://pyyaml.org/wiki/PyYAMLDocumentation |
| Where stamps are written | one call per layer writer; a hook in `atomic_write_json`; a diff against the file on disk | The hook: one place covers all 25 block writers and any future one. A diff against the old file would date in-place edits exactly but means reading the 100+ MB master twice per write; instead the two in-place writers call `touch()` and the rest is a register row (T1143-c). |

## Files touched

- Created: `pipeline/config/sources.yaml`, `pipeline/provenance.py`, `pipeline/provenance_sources.py`, `docs/data/sources.md` (generated), `continent-app/src/lib/provenance.js`, `continent-app/tests/provenance.test.mjs`, `tests/test_provenance.py`, this report.
- Modified, pipeline: `pipeline/pipeline_io.py` (the stamp hook), `pipeline/apply_rating_layer.py` (schema version from `provenance.SCHEMA_VERSION`), `pipeline/apply_tourist_premium.py` and `pipeline/apply_airport_anchors.py` (`touch()` on the in-place edits).
- Modified, contract: `docs/wire.schema.json` (version 20; `_src`, `_asof` required on each key block; `$defs.src` enum and `$defs.asof`), `docs/SCHEMA.md` (header line, new "Schema v20" section), `continent-app/scripts/ci/check-contract.mjs` (seeded break `v20-block-date-dropped`), `continent-app/scripts/ci/fixtures/contract-min.json` (version 20), `tests/fixtures/wire_contract_cases.json` (4 new shared cases, the version case and the rating and taste values updated), `tests/test_wire_contract.py`, `continent-app/tests/wire-contract.test.mjs` (version 20).
- Modified, app: `continent-app/src/lib/catalogue.js` (lift stamps as a shard arrives), `continent-app/src/lib/bootIndex.js` (rank tier drops stamps), `continent-app/scripts/sync-data.mjs` (carries stamps across the four blocks its wire diet rebuilds; without this the next sync from a stamped master stops at its own guard, so it is the one file outside the named list, and only that).
- Data migration: `continent-app/public/app_data.json` (backfilled, schema 20).
- Docs and register: `docs/HANDBOOK.md` (data wire section: version 20, new "Provenance per field" part), `ROADMAP.md` (D3 status), `Execution/_OPEN.md` (rows T1143-a to h appended).
- Not touched: `continent-app/scripts/ci/contract.mjs`. It reads the version and the per-block rules from the schema, so it needed no change.

## Commands run

```
git fetch origin && git checkout -b p15-s59-provenance origin/p15-round2
python3 pipeline/provenance.py --count continent-app/public/app_data.json            # before: 0 / 49,328
python3 -I pipeline/provenance_sources.py                                           # writes docs/data/sources.md and the enum
python3 pipeline/provenance.py --backfill continent-app/public/app_data.json --compact
python3 -I pipeline/provenance_sources.py --check
python3 -m pytest tests -q -p no:cacheprovider $(quarantine deselects)              # here and on a clean base worktree
cd continent-app && npm ci && npm test
CARTA_CONTRACT_DERIVE_SPLIT=1 node scripts/ci/check-contract.mjs
node scripts/ci/design-lint.mjs
npx eslint src/lib/provenance.js src/lib/catalogue.js src/lib/bootIndex.js tests/provenance.test.mjs tests/wire-contract.test.mjs
ruff check <touched Python>; ruff check --select E9,F63,F7,F82 pipeline src scripts run_pipeline.py tests
python3 -I scripts/docs/build_lineage.py --check --strict; python3 -I scripts/docs/drift.py
node <scratch>/measure.mjs <wire>       # split, rank tier and catalogue load on the v19 copy and the v20 wire
node <scratch>/same.mjs <v19> <v20>     # records after hydration, deep equal
```

End to end in a scratch worktree of the base with this branch's files copied in and the stamped wire as `app_data/app_data.json`: `node continent-app/scripts/sync-data.mjs` wrote `public/app_data.json` through `assertWire` with 0 provenance problems (BRU `geonames` and `guide`, both rebuilt by the diet, kept `_src` and `_asof`); the run then stopped later on a Git LFS pointer in `app_data/` (environment, not this change). With the `restoreProvenance` line removed, the same run stopped with `destinations.BRU.geonames._src is missing`. The scratch worktree was removed afterwards.

## Config and secrets set

None. No Supabase migration: nothing in the database reads the wire's blocks, so number 071 stays free.

## Before/after measurements

Key blocks stamped on the shipped wire (`python pipeline/provenance.py --count`), per layer block:

| Block (layer writer) | Before | After |
|---|---|---|
| costs (apply_food_prices, apply_tourist_premium) | 0 / 3,868 | 3,868 / 3,868 |
| accommodation (stays/apply_stays) | 0 / 3,353 | 3,353 / 3,353 |
| local_transport (apply_car_layer) | 0 / 3,868 | 3,868 / 3,868 |
| beauty (apply_beauty_layer) | 0 / 3,868 | 3,868 / 3,868 |
| image (harvest_images, audit_hero_images) | 0 / 3,841 | 3,841 / 3,841 |
| activities (harvest_activities, harvest_pois_overture, score_significance) | 0 / 3,868 | 3,868 / 3,868 |
| rating (apply_rating_layer) | 0 / 3,855 | 3,855 / 3,855 |
| taste (place_taste_profile) | 0 / 3,855 | 3,855 / 3,855 |
| transfer (apply_airport_anchors) | 0 / 126 | 126 / 126 |
| climate (apply_climate) | 0 / 3,868 | 3,868 / 3,868 |
| place (apply_place_layer) | 0 / 3,868 | 3,868 / 3,868 |
| driving_toll (apply_toll_layer) | 0 / 566 | 566 / 566 |
| bathing_water (harvest_bathing_water) | 0 / 898 | 898 / 898 |
| crowding (harvest_tourism_density, harvest_uk_crowds) | 0 / 3,289 | 3,289 / 3,289 |
| geonames (harvest_geonames) | 0 / 3,783 | 3,783 / 3,783 |
| nature (harvest_protected_areas_osm) | 0 / 1,478 | 1,478 / 1,478 |
| guide (apply_wikivoyage) | 0 / 1,033 | 1,033 / 1,033 |
| wikidata (carried forward, no writer) | 0 / 43 | 43 / 43 |
| **all key blocks** | **0 / 49,328** | **49,328 / 49,328** |

| Metric | Before | After | Delta |
|---|---|---|---|
| Schema version (wire, schema, SCHEMA.md, fixture) | 19 | 20 | +1 |
| Sources in a machine-readable registry | 0 | 24 | +24 |
| Key blocks with a named source | 0 of 18 | 18 of 18 | +18 |
| `app_data.json` raw | 14,385,023 B | 16,419,749 B | +2,034,726 B (+14.1%) |
| `app_data.json` gzip -9 | 2,518,297 B | 2,582,896 B | +64,599 B (+2.6%) |
| Country shards (split as sync-data does) | 250 files, 14,081,435 B, 2,548,282 B gzipped | 261 files, 16,087,157 B, 2,644,205 B gzipped | +11 files, +95,923 B gzipped (+3.8%) |
| Rank tier `_rank.json` | 4,663,120 B, 578,755 B gzipped | 4,663,120 B, 578,755 B gzipped | 0 |
| Boot index | 234,361 B | 234,375 B | +14 B |
| Records equal after hydration, v19 vs v20 wire | n/a | 3,868 of 3,868 | none differ |
| Blocks with readable provenance after load | 0 | 49,328 (0 stamps left on a block) | +49,328 |
| Shared seeded contract cases (pytest and npm test) | 20 | 24 | +4 |
| Contract gate catalogue breaks rejected | 6/6 | 7/7 | +1 |
| pytest minus quarantine | 617 passed, 3 failed (base) | 639 passed, 3 failed | +22 passed, same 3 pre-existing failures (base fails the same three in a full run) |
| npm test | 1,649 tests, 0 fail (base) | 1,664 tests, 0 fail | +15 |
| design-lint | 0 new | 0 new | same |
| Backfill run time on the shipped wire | n/a | 1.7 s | new |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A sync from a stamped master would stop at its own guard | `sync-data.mjs` rebuilds `guide`, `nature`, `geonames` and `climate` as new objects, dropping `_src` and `_asof` | Stamps are taken before the diet and put back on the rebuilt blocks (`provenanceOfBlocks`, `restoreProvenance`); proven by a run, and by the negative run without it |
| The rank tier would grow and pool worse | It pools blocks by their JSON, so two baskets that differ only in `_asof` would be two entries | `projectField` drops the stamps; the tier is the same size to the byte |
| A WeakMap keyed by the record lost the stamps | `mergeCatalogue` builds a new record object on every snapshot | Keyed by the block object, which every copy shares by reference |
| Three cadences in the first draft of sources.yaml were wrong | The draft said `IRREG` where a scheduled task rebuilds the source (climate, commons, poi_mix) | The check found them; set to the most frequent task's cadence |
| The rating and taste cases in the shared fixture failed on the new required keys | Their seeded values were whole blocks without stamps | The values carry stamps now; four new cases cover a missing source, a missing date, a bad date and an unknown source |
| A missing stamp is filled, not refused, by a pipeline write | By design: `atomic_write_json` stamps before it checks | The shared cases mark those two as `pipeline_fills`; the pipeline write test skips them, the validators and the gate still reject them |
| `tests/test_sea_temp_fixture.py` fails in a full run | Order dependent, a JSON decode on a Git LFS pointer in `cache/`; fails the same on the base | Not this task; same as T1133-g |

## Screens checked

None in a browser: no screen reads `provenanceOf` yet and every record a screen gets is deep equal to the v19 one (checked on all 3,868 by loading both wires through the real catalogue with the real split). The end check of the batch needs no screen for this task; if it runs one, the Explore map and a place page at phone and desktop width are where a hydration fault would show.

## What is still open

- T1143-a (owner): migrate the master on the build box once; until then `npm run data` stops at the sync guard with `... ._src is missing`, which is the guard working.
- T1143-b: the other wire files carry no provenance yet.
- T1143-c: four writers may edit `activities` or `image` in place and keep the old date.
- T1143-d: `_asof` is the build date, not the source vintage; G9 must choose.
- T1143-e: MAP.md and the docs indexes do not name the new files.
- T1143-f: the path-triggered contract workflow does not watch the registry files (pytest in ci.yml does).
- T1143-g (owner): confirm the `LicenseRef` licences against the ledger rows marked verify.
- T1143-h: block writers are listed in both lineage-fields.json and sources.yaml.

## Rollback procedure

`git revert` the T1143 commits. That restores the v19 wire file, the schema and the code together; the migration of the shipped wire is undone with it (the v19 file is in git). On the box the backfill is reversible only through the backup the owner step takes first: copy `app_data/app_data.v19.json` back over `app_data/app_data.json`. Without that copy it is one-way in practice (a v19 schema rejects the stamps on `rating` and `taste`).

## Owner steps (for the checklist)

- [T1143-a] Migrate the master to schema 20 | the box's `app_data/app_data.json` has no stamps, so the next `npm run data` stops at the sync guard and no layer run can ship | on the box pull the branch; copy `app_data/app_data.json` to `app_data/app_data.v19.json` (the rollback); `python pipeline/provenance.py --count app_data/app_data.json` (expect 0 stamped); `python pipeline/provenance.py --backfill app_data/app_data.json`; run `--count` again (expect every block stamped); `cd continent-app && npm run data` and check it passes the guard; then the next scheduled layer runs date their blocks today | `pipeline/provenance.py`, `docs/HANDBOOK.md` (data wire, Provenance per field)
- [T1143-g] Confirm the custom licence ids | sources.yaml names UNESCO, Numbeo, the stays scrape, Commons and US Government data with `LicenseRef` ids, and the ledger marks some as verify | open `docs/data/sources.md`; for each `LicenseRef` row read its ledger row in `docs/tos/data_licenses.md`; correct the id or the ledger in `pipeline/config/sources.yaml` or `src/ingestion/core/registry.py`; run `python -I pipeline/provenance_sources.py` | `pipeline/config/sources.yaml`
