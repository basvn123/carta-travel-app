# T1202: Seasons and closures (ROADMAP D18)

Round 3 session S118, batch 14. Branch `p15-s118-seasons-closures` from `p15-round3`.

## Date

2026-11-07

## What changed

Carta now knows when a place is shut. A new pipeline step, `pipeline/harvest_seasons.py` (task `seasons`, quarterly), reads OpenStreetMap `opening_hours` month selectors and `seasonal` tags from the Geofabrik extracts the pipeline already keeps, for mountain huts, lifts, ferries and objects named like a place. It gives each destination a `season` block on the wire: the months the place can be visited (`open`, only when the place itself closes: its own hut, lift or lido says so, or every ferry to the island is seasonal), a confidence (high with a check date under three years old, medium without, low for a season word only), the reason (`own` or `ferry`), the check date, up to four seasonal huts, lifts or ferries nearby (`items`), and `_src` `osm_seasons` and `_asof`. The place page's month strip (When to go) draws a shut month as an empty dashed track named Closed, says why in one line with the check date, and lists the seasonal items nearby, in all six languages. The plan flow (`lib/recommend/candidates.js`) never chooses a month the lead place is shut while another month is open, and never puts a place in a trip for a month it is shut at medium or high confidence; a low-confidence season is drawn as "May be closed" and still suggested. The rank tier carries `season.open` and `season.conf` so the rule holds before the country files land. Before: no field, no rule; a seeded island with its ferries running June to September was suggested for May. After: it is not, and it is suggested for July (test). The shipped wire carries no block yet: the run needs the Geofabrik extracts on the box (owner step T1202-a), so the contract lists `season` with a new presence, `pending` (shape checked, absence allowed), to flip to `some` after the first run (T1202-b).

## Research

A research subagent compared sources, parsers and fetch methods for month-level opening data (2026-11-07; taginfo, the OSM wiki and OpenSkiMap were blocked from the container, so usage counts are unverified).

| Option | Licence | Version / date | Fit |
|---|---|---|---|
| OSM `opening_hours` month ranges | ODbL 1.0 | live | The structured signal; common on huts, lifts and beach facilities, sparse on ferries (counts not verified) |
| OSM `seasonal=summer/winter/...` | ODbL 1.0 | live | Weak: `yes` gives no months; season words are rare. Low-confidence fallback only |
| [opening-hours-py](https://github.com/remi-dupre/opening-hours-rs) (Rust core) | MIT or Apache-2.0 | 2.1.5, 2026-11-04 | Best full parser |
| [osm_humanized_opening_hours](https://github.com/rezemika/humanized_opening_hours) | AGPL-3.0 | 0.6.2, 2018 | Avoid: AGPL, paused |
| pyopening_hours, osm-opening-hours (PyPI) | GPLv3, none | 2015, 2016 | Avoid: dead |
| `opening_hours` (npm) | LGPL-3.0 | 3.15.0, 2026-09 | JS only |
| Own month-only reader | ours | | Only months are needed; no dependency |
| Geofabrik PBF plus pyosmium | BSD-2-Clause | osmium 4.3.2 | Already used (`pipeline/beaches/osm_extract.py`), deterministic, no rate limit |
| Overpass API | ODbL data | | Rate-limited at Europe scale; spot checks only |
| [OpenSkiMap data](https://github.com/russellporter/openskidata-format) | ODbL | live | Has a status field but no season dates |
| hut-reservation.org (DAV, OeAV, AVS, SAC) | no open licence found | | Not usable without an agreement |
| [refuges.info](https://www.refuges.info/wiki/licence/en/) | CC BY-SA 2.0 | live | Share-alike, French ranges only; season fields not verified |
| Ferry GTFS (Jadrolinija, Greek lines) | none found | | No open feed on Transitland or the Mobility Database |

Choice: OSM tags read from the Geofabrik extracts with pyosmium (already a dependency, `requirements.txt` osmium>=4.0). For the reader, the subagent recommended opening-hours-py; I chose a small month-only reader inside `harvest_seasons.py` because only twelve booleans are needed and it adds no compiled dependency to the owner's box, and I cross-checked it against opening-hours-py 2.1.5 on the eleven fixture strings (identical months; `tests/test_seasons.py::test_cross_check_with_opening_hours_py`, which skips where the library is absent, as in CI). The reader refuses what it cannot read at month level (week numbers, Easter, nth weekdays) instead of guessing. Operator data stays out: none of it has an open licence today.

## Files touched

Created:
- `pipeline/harvest_seasons.py`
- `tests/test_seasons.py`, `tests/fixtures/seasons/facilities.json`
- `continent-app/src/lib/season.js`
- `continent-app/tests/seasons.test.mjs`, `continent-app/tests/seasonStrip.test.mjs`
- `Execution/P15/T1202-seasons-closures.md`

Modified:
- `run_pipeline.py` (task `seasons`, before `photo_sources` and `trailslab_worker`)
- `pipeline/config/sources.yaml` (source `osm_seasons`, block `season`), `docs/data/sources.md` (generated)
- `docs/wire.schema.json` (`season`, `osm_seasons` in the source enum, the `pending` presence), `docs/SCHEMA.md` (generated table)
- `pipeline/wire_contract.py`, `continent-app/src/lib/wireSchema.js`, `continent-app/scripts/ci/contract.mjs` (the `pending` presence), `continent-app/tests/wire-contract.test.mjs` (the row count now includes pending keys: the test summed the presence sets and a third set is new, so the test was extended, not loosened)
- `continent-app/src/lib/bootIndex.js` (`season: { pick: ['open', 'conf'] }` in the rank tier)
- `continent-app/src/lib/recommend/candidates.js` (the plan flow rule)
- `continent-app/src/browse/DestWhen.jsx`, `continent-app/src/styles/94-when-stay.css` (the month strip)
- `continent-app/src/i18n/{en,nl,de,fr,es,it}.js` (12 `season.*` keys each)
- `docs/architecture/lineage-fields.json`, `docs/architecture/lineage.md`, `docs/reference/{tasks,python,app-lib}.md` (generated)
- `docs/HANDBOOK.md` (new section "Seasons and closures (D18)"), `ROADMAP.md` (D18 status), `Execution/_OPEN.md`

## Commands run

```
python -m pytest tests/test_seasons.py tests/test_wire_contract.py tests/test_provenance.py -q
python -I pipeline/provenance_sources.py
node continent-app/scripts/ci/wire-table.mjs --write
python -I scripts/docs/build_lineage.py ; python -I scripts/docs/build_reference.py
cd continent-app && npm ci && npm test && npm run lint && node scripts/ci/design-lint.mjs
CARTA_CONTRACT_DERIVE_SPLIT=1 node scripts/ci/check-contract.mjs
FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs
CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node scripts/verify_csp.mjs --dist ../.fastbuild
ruff check --select E9,F63,F7,F82 pipeline src scripts run_pipeline.py tests
python -I scripts/docs/build_reference.py --check ; build_lineage.py --check --strict ; config_reference.py --check ; drift.py
sh .claude/skills/impeccable/scripts/impeccable detect --json continent-app/src/browse/DestWhen.jsx continent-app/src/styles/94-when-stay.css
```

The harvest itself was not run on real extracts: the container has no `data/raw/geofabrik/` and cannot reach Geofabrik (owner step T1202-a). The CLI ran on fixtures (`--facilities tests/fixtures/seasons/facilities.json --dry-run`).

## Config and secrets set

None. New module constants in `pipeline/harvest_seasons.py`: `CHECK_FRESH_DAYS` 1095, `OWN_KM` 2.0, `FERRY_KM` 3.0, `ITEM_KM` {hut 8, lift 5, ferry 3, place 2}, `KEEP_ITEMS` 4. App: `SKIP_CONF` ['high', 'medium'] in `continent-app/src/lib/season.js`.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Destinations with a `season` block on the shipped wire | 0 | 0 (no run yet, T1202-a) | 0 |
| Fixture destinations (5 gems, 1 airport): blocks / with open months | no rule | 4 / 2 (island by ferry, place that is the hut) | +4 / +2 |
| Seeded Croatian island (ferries Jun to Sep, high): suggested by the plan flow for May | yes | no (July: yes; low confidence: yes) | rule holds |
| `opening_hours` and `seasonal` values in the container's shipped data (all in `public/trails/trip/`) | not read | 10 read: 7 all year, 1 part year (Nanterre promenade, no October rule mapped), 1 `seasonal=summer` (low, Jun to Aug), 1 `seasonal=yes` (no months) | |
| Month reader against opening-hours-py 2.1.5 on 11 fixtures | n/a | 11 of 11 identical | |
| Wire contract destination keys (every / some / pending) | 26 / 17 / 0 | 26 / 17 / 1 | +1 |
| App tests (`npm test`) | 1913 | 1921 pass, 0 fail, 12 skipped | +8 |
| Python tests for this layer | 0 | 25 | +25 |
| design-lint new violations | 0 | 0 | 0 |
| Fast build `assets/` bytes | not measured | 10,381,262 | no size target in this task |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The contract gate would fail with `season` listed as `some` | `some` requires at least one shipped record, and none exists before the first run | New presence `pending` (shape checked, absence allowed) in the schema, both interpreters and the table check; flip to `some` after the run (T1202-b) |
| `wire-contract.test.mjs` row count off by one | The test summed meta, every and some | `schemaKeySet` now returns `pending`; the sum includes it |
| `checkSchemaTable` crashed on the new set | `parseSchemaContract` had two returns and one lacked `pending` | Both return it |
| "Jun,Jul off" style lists could be split into two rules | The additional-rule comma split ran before the leading month list was taken | The leading selector is matched first, then only a comma after it starts a new rule |
| `npm test` could not start | `node_modules` absent in the container | `npm ci` (no lockfile change) |
| The dev app had no `boot.json` or `dest/` shards | The split wires are gitignored and `npm run data` needs the master | Built the split in memory with `splitCatalogue` in a scratch script and served it through Playwright's route handler; nothing written to `public/` |

## Screens checked

Place page, When to go section, for Vis (`#dest=gem:vis`) with a seeded block (ferries Jun to Sep, high, checked 2026-05; a lift Jun to Aug and a hut May to Oct nearby), at 1440 x 900 and 390 x 844: 8 months drawn as dashed empty tracks with Closed in the key, the line "No ferry Jan to May, Oct to Dec: every ferry here runs part of the year only" with "Checked May 2026", and the two nearby items. Layout holds at both widths. Shots in `Execution/P15/T1202-shots/` (not committed). The impeccable detector found nothing; CSP check: 0 violations over 40 screen loads. Seen and recorded as open: the verdict above the strip still offers closed months (Apr, Oct) as "Quieter and still pleasant" (T1202-c).

Design departures from the defaults: none. The dashed empty track follows the carta-design rule that what is missing is drawn, not only absent; the word Closed carries the meaning, not the colour.

## What is still open

- T1202-a (owner): run the harvest on the box; nothing reaches the wire until then.
- T1202-b: after the first run, flip `season` from `pending` to `some` in `docs/wire.schema.json` and regenerate the table, so a run that drops every block fails CI again.
- T1202-c: the When to go verdict (`whenGuide.js` quieter months), the Explore month filter and rails (`climate.best` only) and the country month verdict do not read closures; outside this task's files.
- T1202-d: measure coverage on the first run (facilities per kind and country, share with a check date) and decide whether to add more kinds (beach resorts, campsites) or relax `OWN_KM`; taginfo was blocked here.
- T1202-e: `docs/logic/seasons-crowds.md` has no rule entries for closures (SEASON catalogue), outside this task's files.

## Owner steps (for the checklist)

- [T1202-a] Run the seasons harvest on the box | until it runs no place carries open months, so the strip shows no closures and the plan flow can still suggest a shut island or hut | check the extracts are on disk with python pipeline/beaches/osm_extract.py --list; run python run_pipeline.py seasons (or python pipeline/harvest_seasons.py --countries AT,CH,IT,HR,GR first to try a few); note the printed blocks, with_open and by_conf counts in the report; cd continent-app and npm run data; open two islands and one hut place in the app and check the strip; commit continent-app/public/app_data.json | run_pipeline.py task seasons, docs/HANDBOOK.md "Seasons and closures (D18)"

## Rollback procedure

`git revert` the T1202 commits on this branch. Nothing is one-way: no data was written, no migration. After a first run, reverting also needs `cache/dest_seasons.json` deleted and `npm run data` re-run so the master and wire drop the `season` blocks (the wire contract would refuse an unknown key otherwise).
