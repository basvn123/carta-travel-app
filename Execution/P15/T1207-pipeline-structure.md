# T1207: Pipeline structure (ROADMAP A2)

Round 3 session S123, batch 15. Branch `p15-s123-pipeline-structure`, from `p15-round3` at `6b9ef6fa`.

## Date

2026-11-07

## What changed

`run_pipeline.py` keeps the CLI, the planner and the runner (3,573 to 1,195 lines). Its task table now lives in `pipeline/tasks/`, one module per domain (catalogue, outdoor, prices, trails, cycling, backfill, images, destinfo, pois, explore_fill, content, search, ops, last), joined in the `DOMAINS` order of `pipeline/tasks/__init__.py` by `pipeline/tasks/registry.py`; `last` holds photo_sources and trailslab_worker. Paths, the log, `run_cmd` and the guards used by more than one domain are in `pipeline/tasks/_base.py`; each domain's own steps and guards sit next to its tasks. The readers that parse the table without importing it (both doc generators, the licence registry, two tests) read it through `pipeline/tasks/source.py`. Nothing in the plan changed: the 91 tasks, their order, every field and the names of their functions match a snapshot taken from the single-file table (`tests/test_pipeline_tasks_registry.py`), every moved function compiles to the same bytecode as before (the one intended difference is `main` setting `_base._LOG_FH`), and `--help`, `--list` and `--dry-run` print the same output. Following A-R1, flat files are grouped by domain with their stage prefix kept: 17 of the 107 flat files moved, in three folders and one commit each, `pipeline/audit/` (8), `pipeline/blog/` (2) and `pipeline/pois/` (7), with every import, test, script path, config, licence registry row and doc updated. The other 90 stay where they are. The order for moving them is below and in the register.

## Research

A-R1 had no answer, so a research subagent compared three layouts. Some pages were blocked by the network, so it worked from search summaries of them.

| Option | For this repo | Against |
|---|---|---|
| Flat by prefix (as today) | No work; running by path works ([PyPA, src vs flat](https://packaging.python.org/discussions/src-layout-vs-flat-layout/)) | 107 files beside about 30 domain folders: two systems at once; one rating change spans harvest_, apply_ and audit_ files; ruff and mypy guess package roots ([ruff#6114](https://github.com/astral-sh/ruff/issues/6114)) |
| By stage (harvest, enrich, apply, audit) | Matches the prefixes and dbt's staging, intermediate, marts ([dbt](https://docs.getdbt.com/best-practices/how-we-structure/1-guide-overview)) | Clashes with the existing domain folders; dbt itself splits by business area inside each layer; a task touches 3 or 4 folders |
| By domain | Matches the existing folders, MAP.md's area rows, Kedro's one pipeline per folder ([Kedro](https://docs.kedro.org/en/stable/nodes_and_pipelines/modular_pipelines.html)), Dagster's advice to use the team's own language ([Dagster](https://docs.dagster.io/guides/build/projects/structuring-your-dagster-project)) | Every path-run script moves; shared libraries need one import route |

Choice: group by domain and keep the stage prefix in the file name, so `pipeline/**/harvest_*.py` still finds every harvester. The research's end state is a regular `pipeline` package run with `python -m` and shared libraries in `pipeline/core/` (also [CCDS v2](https://github.com/drivendata/cookiecutter-data-science), [Hynek on src layout](https://hynek.me/articles/testing-packaging/), rejected for an application). This task does not take that step: switching every invocation (Task Scheduler, the box, about 300 import sites) to `-m` is a change of its own (row T1207-a). For now the shared libraries stay at the top of `pipeline/`, and a script in a domain folder puts `pipeline/` on `sys.path`, the route `pipeline/beaches/export_beaches.py` already used. Split of the task table: domain modules in run order, not one module per cadence, because list order is run order and the domains follow the table's own section comments.

## Files touched

- `run_pipeline.py`: the table, the domain steps and guards and the shared helpers moved out; it reads `TASKS` from the registry and re-exports the names tests and `infra/hetzner/cron/schedule.py` read.
- New `pipeline/tasks/`: `__init__.py` (DOMAINS), `registry.py`, `source.py`, `_base.py`, 14 domain modules.
- New `tests/test_pipeline_tasks_registry.py`, `tests/fixtures/pipeline_tasks.json` (snapshot of the pre-split table, then updated only by the moved command paths).
- Readers: `scripts/docs/build_lineage.py`, `scripts/docs/reference_sql_tasks.py`, `src/ingestion/core/registry.py` (also `GROUPED_HARVEST_DIRS`), `tests/test_no_laptop_steps.py`, `tests/test_pipeline_code_fixes.py`; workflows `data-licences.yml`, `docs-site.yml` (path trigger `pipeline/tasks/**`).
- Moved with `git mv`: `pipeline/audit/{audit_gaps,audit_quality,audit_hero_images,check_why_translations,verify_skip_flags,validate_rubric_scores,external_check,link_health}.py`, `pipeline/blog/{blog_drafts,blog_drafts_more}.py`, `pipeline/pois/{harvest_poi_wikidata,harvest_pois_overture,harvest_pois_wikidata_images,enrich_must_descs,normalize_poi_kinds,dedupe_pois,harvest_poi_fees}.py`.
- Their references: `pipeline/photos/correctness.py`, `pipeline/score_significance.py`, `pipeline/mountains/harvest_lift_hours.py`, `pipeline/dossier/common.py`, `pipeline/trips/export_trips.py`, `pipeline/oneoff/followup_20260722_landmarks_descs_images.py`, `pipeline/config/{sources,link_health}.yaml`, `scripts/blog/{check_draft,monthly_pr}.py`, `scripts/quality/rules.yaml`, `scripts/validation/layer_ratings.py`, `tests/test_link_health.py`, `tests/test_blog_drafts.py`, `tests/test_blog_drafts_more.py`, `continent-app/scripts/audit-trip-heroes.mjs`, `continent-app/scripts/audit-trail-photos.mjs`, `continent-app/src/components/admin/LinkHealth.jsx` (comment and admin hint text only), `prompts/blog-intro/v1.md`, `prompts/registry.json`, `content/blog/README.md`, `.semgrep/baseline.json`, `README.md`.
- Docs: `MAP.md`, `docs/data/pipeline.md`, `pipeline/README.md` (new Layout section), `docs/HANDBOOK.md`, `docs/data/{photos,sources}.md`, `docs/logic/rating.md`, `docs/architecture/lineage-fields.json`; regenerated `docs/reference/{python,tasks}.md`, `docs/architecture/lineage.md`, `docs/tos/data_licenses.md`.
- `ROADMAP.md` (A2 status), `Execution/_OPEN.md` (rows T1207-a to T1207-i).

## Commands run

```
python tests/test_pipeline_tasks_registry.py --write      # only to refresh the snapshot; first taken from the old file
python -m pytest tests -q $(quarantine deselects)
python -m ruff check --select E9,F63,F7,F82 pipeline src scripts run_pipeline.py tests   # ruff 0.14.3
python -I scripts/docs/build_reference.py; python -I scripts/docs/build_lineage.py
python -I scripts/docs/build_reference.py --check; build_lineage.py --check; config_reference.py --check; drift.py; check_entry_points.py
python -m src.ingestion.core.ledger --write; python -m src.ingestion.core.ledger --check
python -I pipeline/provenance_sources.py --check
node scripts/prompts/registry.mjs check --base origin/p15-round3 --no-eval
cd continent-app && npm ci && npm test && npm run lint
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| `run_pipeline.py` lines | 3,573 | 1,195 | -2,378 |
| Tasks in the plan (`--list`) | 91 | 91, same order, same fields | 0 |
| Functions with changed bytecode (66 compared) | n/a | 1 (`main`, the log handle) | |
| `--help` flags | 10 | 10, identical text | 0 |
| `--dry-run --ship none` output (167 lines) | baseline | identical apart from timings | 0 |
| Generated `docs/reference/tasks.md` after the split | baseline | byte-identical (changes later only by the moved paths) | 0 |
| Flat `.py` files in `pipeline/` | 107 | 90 | -17 |
| pytest (minus quarantine) | 1,107 passed, 2 failed | 1,107 passed (+5 new), 2 failed (same two) | 0 new failures |
| App `npm test` | n/a | 1,963 pass, 0 fail | |
| Docs checks (reference, lineage, config, drift, entry points, ledger, provenance, prompt registry) | green | green | |

The two pytest failures (`test_rating_inputs.py::test_beauty_v2_reads_no_register`, `test_rating_stability.py::test_adding_places_moves_nobody_else`) fail the same way on an untouched `p15-round3` worktree in this container: they need data files the cloud checkout does not have. Not caused by this task, not fixed here (row T1207-h).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `explore_fill.py` failed to import | it uses `guard_beaches` and `guard_mountains`, which live with the outdoor tasks | imported from `pipeline.tasks.outdoor` |
| Two `# noqa: F401` presence probes (`geopandas`, `h3` in `guard_regions`) lost their comment | my cleanup sed stripped every trailing `# noqa: F401` | restored exactly as before |
| Bytecode of 5 moved functions differed | names bound by `from ... import` lose the compiler's method-call fast path (an extra `PUSH_NULL`) | no behaviour difference; checked with an instruction diff that ignores `PUSH_NULL` and jump offsets |
| The first path-rewrite script ran for over 10 minutes | it ran regexes over every tracked file, `cache/` included | rewrote it to skip data folders and pre-filter by file name (1.5 s) |
| `--dry-run` probes wrote `cache/hero_image_meta.json`, `data/derived/freshness_report.json`, `data/reports/hero_images_audit.json` | the hero audit probe and the freshness report write files even in a dry run | restored with `git checkout`, never committed |

Gotcha for the next session: a task added or changed in `pipeline/tasks/` fails `test_table_matches_the_snapshot` until the snapshot is refreshed (`python tests/test_pipeline_tasks_registry.py --write`); that diff is the record of what the change does to the plan. A `harvest_*.py` moved into a new folder needs the folder in `GROUPED_HARVEST_DIRS` (`src/ingestion/core/registry.py`) and a ledger rewrite.

## Screens checked

None in a browser. The only app edits are a comment and a path inside an admin hint string in `LinkHealth.jsx` and two path strings in app audit scripts; eslint gives 0 errors on the three files and `npm test` passes.

## What is still open

- T1207-a: the research's end state (a regular `pipeline` package, `pipeline/core/` for the shared libraries, every script run with `python -m`) is a change to every invocation and about 300 import sites; not done here.
- T1207-b to T1207-f: the 90 flat files left, one folder per row, in the order below (fewest importers first, rating last):
  - b `images/`: harvest_images, harvest_image_licenses, enrich_images_commons, enrich_images_web, apply_image_dims.
  - c `climate/`: apply_climate, harvest_climate_power, derive_sunshine, harvest_sea_temp, heat_fire, harvest_bathing_water, harvest_seasons. `prices/`: apply_food_prices, harvest_food_prices, apply_tourist_premium, price_alerts, harvest_tourism_density, harvest_uk_crowds, harvest_urban_fabric.
  - d `transport/`: airport_access, airport_categories, apply_airport_anchors, apply_airport_categories, car_layer, apply_car_layer, toll_layer, apply_toll_layer. `destinfo/`: export_destinfo, explore_overlay, harvest_events, harvest_parking, harvest_access, harvest_emergency, harvest_swim_bans, entry_rules, practical_layer.
  - e `guide/`: harvest_wikivoyage, apply_wikivoyage, harvest_wikivoyage_listings, harvest_activities, enrich_activities, poi_descriptions. `search/`: ask_index_layer, ask_lexicon, search_index_layer, guided_search_layer. `places/`: build_place_candidates, harvest_place_signals, score_place_candidates, promote_place_candidates, apply_new_gems, catalogue_gaps, harvest_geonames, harvest_unesco_whc, harvest_protected_areas_osm, apply_overrides, merge_curation, backfill_landmarks, gem_category_overrides, apply_gem_categories, gen_mock_data.
  - f `rating/` (most imported, last): rating_layer, apply_rating_layer, rating_fact_cards, rating_shadow_report, beauty_layer, apply_beauty_layer, place_layer, apply_place_layer, place_taste_profile, nature_tiers, score_significance, poi_labels, harvest_pageviews, resolve_dest_articles, apply_designations, country_context_layer, member_layer. The shared libraries (pipeline_io, rating_config, pricing_config, provenance, provenance_sources, wire_contract, wire_stamp, ai_gateway, prompt_registry, env_local, place_registries, appeal_scale) wait for T1207-a. The three `.ps1` helpers (finish_run, launch_detached, watch_and_finish) can go to `ops/` in any of these.
- T1207-g: ROADMAP A2 also names a `pyproject.toml` with ruff and mypy scoped to the new packages; the brief did not list that file, so it is not added.
- T1207-h: the two pytest failures above need the data files they read, or a fixture.
- T1207-i: the owner's local Task Scheduler `logs/run_*.cmd` files are gitignored, so this session could not check them for the 17 moved paths.

## Owner steps (for the checklist)

- [T1207-i] Check the laptop's scheduled .cmd files for moved scripts | logs/run_*.cmd are not in git, so a .cmd that names a moved script by path would fail on its next run | open logs/run_*.cmd; search for pipeline\audit_, pipeline\link_health, pipeline\blog_drafts, pipeline\harvest_poi, pipeline\harvest_pois, pipeline\enrich_must_descs, pipeline\normalize_poi_kinds, pipeline\dedupe_pois; replace each with its new folder (audit\, blog\, pois\) as listed in pipeline/README.md, Layout | Execution/P15/T1207-pipeline-structure.md

## Rollback procedure

`git revert` the T1207 commits on the branch, newest first (docs, pois, blog, audit, split). All five are code and docs only; no data, migration or deploy. Reverting the pois commit also restores the old ledger rows; re-run `python -m src.ingestion.core.ledger --check` after.
