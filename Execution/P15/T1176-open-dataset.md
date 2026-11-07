# T1176: Open dataset export (ROADMAP K8)

## Date

2026-11-07

## What changed

Carta can now build a CC BY 4.0 subset of its destination catalogue with one script. `scripts/open_data/export_open_dataset.py` reads the wire, keeps 39 columns (place identity, GeoNames population and settlement class, Eurostat crowding, EEA bathing water class, NASA POWER monthly high and rain) and writes CSV, JSON and an attribution file for 3,868 destinations. Each column is tied to a source id; the script and a test resolve that source's licence from `pipeline/config/sources.yaml` (derived sources take their inputs' licences, recursively) and fail if any is outside CC-BY-4.0, CC0, public domain or US Government work. Ratings, prices, accommodation, transport, images, guide text and designations stay out, because their inputs are ODbL, CC BY-SA or non-open. The datasheet (`scripts/open_data/DATASHEET.md`) is generated from the same table and CI checks it is current. A README, `docs/data/open-dataset.md` and a Show HN draft are written. Nothing is published.

## Research

None chosen as a tool: Python stdlib `csv`/`json` and the PyYAML already in the stack. The method choice (an allowlist of licences, derived sources resolved to their least open input, ODbL and CC BY-SA excluded because they cannot be relicensed under CC BY) follows the ledger's own rules in `docs/tos/data_licenses.md`. No external research subagent was run: the cloud container cannot reach outside sources and nothing external was selected.

## Files touched

New: `scripts/open_data/export_open_dataset.py`, `scripts/open_data/README.md`, `scripts/open_data/DATASHEET.md`, `tests/test_open_dataset.py`, `docs/data/open-dataset.md`, `Execution/P15/T1176-show-hn-draft.md`, this report. Modified: `.github/workflows/data-licences.yml` (paths, pyyaml, three export steps), `.gitignore` (`scripts/open_data/out/`), `Execution/_OPEN.md`, `ROADMAP.md` (K8 status).

## Commands run

```
python scripts/open_data/export_open_dataset.py
python scripts/open_data/export_open_dataset.py --datasheet
python -m pytest tests/test_open_dataset.py -q
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Open dataset columns | 0 | 39 | +39 |
| Rows exported from the shipped wire | 0 | 3,868 | +3,868 |
| Output size (CSV / JSON) | n/a | 0.66 MB / 3.4 MB | |
| Tests for the licence gate | 0 | 45 | +45 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Full pytest: 2 failures, 883 passed | `test_rating_inputs::test_beauty_v2_reads_no_register` and `test_rating_stability::test_adding_places_moves_nobody_else` fail on a JSON decode of a cache file in this container; they touch none of my files | Not mine, not fixed here |
| First test run failed | My assertion matched "rating" inside `bathing_rating` | Compare against the split header |

## Screens checked

None; nothing a traveller sees changed.

## What is still open

- T1176-a: provenance of gem `id`, `name`, `lat`, `lon` (GeoNames or OpenStreetMap) must be confirmed by the owner before publishing.
- T1176-b: the run on the box and the GitHub upload are the owner's.
- T1176-c: the Show HN post waits for the free part to need no signup.
- T1176-d: UK crowding and Wikidata ids are not exported yet.

## Owner steps (for the checklist)

- [T1176-a] Confirm gem identity provenance | an ODbL-only name or coordinate would break the CC BY promise | check how gem names and lat/lon were sourced (GeoNames match vs OpenStreetMap); if OSM only, drop those columns for those rows in `FIELDS`; rerun the tests | scripts/open_data/DATASHEET.md, Known gaps
- [T1176-b] Build and publish the dataset | publishing is the owner's | run `python scripts/open_data/export_open_dataset.py` on the box; read the output; create a public GitHub repo and upload `scripts/open_data/out/`, README.md, DATASHEET.md | scripts/open_data/README.md
- [T1176-c] Post the Show HN | only once the free part needs no signup | confirm the free part has no signup; fill the repo link; post the draft | Execution/P15/T1176-show-hn-draft.md

## Rollback procedure

`git revert` the `T1176:` commits. Nothing live, no data migration.
