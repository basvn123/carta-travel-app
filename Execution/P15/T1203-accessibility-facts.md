# T1203: Accessibility facts (ROADMAP D21, session S119)

## Date

2026-11-07

## What changed

The place page can now show an "Access, as mapped" card in Practical: the nearest station mapped step-free (or partly, or not), how many accessible toilets are mapped in the centre, and how many mapped museums and sights are step-free, all taken from OpenStreetMap `wheelchair` and `toilets:wheelchair` tags. A fact exists only where a tag exists, every line says "mapped as", and the card ends with the source, the month and a line that it is not a guarantee. The pipeline half is a new quarterly task `access_facts` (`harvest_access.py`, then `export_destinfo.py`) that adds an `access` row, with `_src` and `_asof`, to the existing `public/destinfo/{CC}.json` wire. The Overpass run is an owner step: the container cannot reach Overpass, so no real `access` rows exist yet and the card shows nowhere today.

## Research

The data source is fixed by D21 (OpenStreetMap tags). The method was chosen by reuse, not a new survey: the repo's Overpass batch harvest pattern (`harvest_parking.py`, resumable cache, 20 destinations a query) against a Geofabrik regional extract with osmium. Overpass won because it needs no multi-GB downloads, the pipeline already ships and monitors that pattern, and the volume (about 3,900 places, tagged features only) is small. A web comparison was not possible in this container (no outbound access beyond package registries). The wire reuses destinfo rather than adding a file, so there is no new fetch, no schema version change and no new R2 prefix.

## Files touched

Created: `pipeline/harvest_access.py`, `tests/test_access_facts.py`, `continent-app/src/lib/accessFacts.js`, `continent-app/tests/accessFacts.test.mjs`, this report.
Modified: `pipeline/export_destinfo.py` (`pick_access`, index count), `run_pipeline.py` (task `access_facts`, before `photo_sources` and `trailslab_worker`), `continent-app/src/browse/DestPractical.jsx` (the card), `continent-app/src/components/Icons.jsx` (`AccessIcon`), `continent-app/src/styles/88-place-template.css` (`.pcard-note`), `continent-app/src/i18n/{en,nl,de,fr,es,it}.js` (`access.*`, 10 keys each), `docs/HANDBOOK.md`, `docs/SCHEMA.md`, `ROADMAP.md` (D21), `Execution/_OPEN.md`, generated `docs/reference/{app-lib,python,tasks}.md` and `docs/architecture/lineage.md`.

## Commands run

```
python -m pytest tests/test_access_facts.py -q
python -m ruff check pipeline/harvest_access.py tests/test_access_facts.py run_pipeline.py
cd continent-app && npm ci && node --test tests/accessFacts.test.mjs && npx eslint <touched> && node scripts/ci/design-lint.mjs && npm test
python -I scripts/docs/build_reference.py; python -I scripts/docs/build_lineage.py
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Destinations with accessibility facts on the wire | 0 | 0 (no harvest run yet; 4 fixture cases pass) | 0 |
| i18n keys per language | n | n + 10 | +10 |

The coverage number (how many of the destinations get a row) is only known after the owner step.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Whole `npm test` failed on the first run | `node_modules` was absent in the container | `npm ci` |

## Screens checked

Static and unit checks only (card text on fixtures, eslint, design-lint 0 new). The place page card was not looked at in a browser at phone and desktop width, because no destinfo row carries `access` until the harvest runs. The end check should open a place with a fixture `access` row at 390 and 1280 px and look at the Practical cards.

## What is still open

See the register rows T1203-a to T1203-c.

## Rollback

`git revert` of the T1203 commits. The wire change is additive; removing the task leaves `access` rows in shipped files harmlessly unread.

## Owner steps (for the checklist)

- [T1203-a] Run the accessibility harvest | the card shows nowhere until OSM tags are harvested | on the box run `python run_pipeline.py access_facts` (about 150 Overpass queries); check the printed count of destinations with accessibility facts; publish the destinfo files the way parking is published (push-data) | pipeline/harvest_access.py, run_pipeline.py task access_facts
- [T1203-b] Look at the Access card on a real place | a screen change was only checked on fixtures | after the run open two places with tags and one without at 390 and 1280 px; the card must be absent for the untagged one | continent-app/src/browse/DestPractical.jsx
