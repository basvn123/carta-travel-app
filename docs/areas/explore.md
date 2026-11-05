# Explore (map, cards, filters, rails)

Area doc for the MAP.md row "Explore (map, cards, filters, rails)". Template: ROADMAP item B2. Built by T1073 from MAP.md, the handbook headings and the real test folders; the rules and numbers live in the handbook, not here.

## Purpose

The catalogue of places as a photo grid and a map, with filters, rails, sort and the search dock.

Screens: Explore (grid and map), Search dock (phone), start dialog.

## How it works

One row per destination from the boot index and country shards; day price and way-there are computed in the browser from the price engine and the flight sweep; filters and sort live in the URL.

Full rules, formulas and thresholds (read these, do not copy them):

- [Explore (map, cards, filters, rails, sort)](../HANDBOOK.md#explore-map-cards-filters-rails-sort)
- [Search dock](../HANDBOOK.md#search-dock)
- [Month and "any time" selection](../HANDBOOK.md#month-and-any-time-selection)
- [From town](../HANDBOOK.md#from-town)
- [Destinations search](../HANDBOOK.md#destinations-search)
- [Shortlist (saving places)](../HANDBOOK.md#shortlist-saving-places)

## Files

App: continent-app/src/browse/ExploreTab.jsx, continent-app/src/browse/ExploreMap.jsx, continent-app/src/browse/ExploreCards.jsx, continent-app/src/browse/ExploreRails.jsx

Pipeline and backend: pipeline/explore_overlay.py, pipeline/guided_search_layer.py

MAP.md handbook column: Discover. Latest tasks: T980-T983, T968.

## Data read and written

Each linked handbook section has a "Data behind it" paragraph that names the files and keys. Wire fields are in [../SCHEMA.md](../SCHEMA.md); the data index is [../data/README.md](../data/README.md). Field level lineage is ROADMAP item B5 and does not exist yet.

## Logic IDs used

None yet. Rule IDs and `docs/logic/` arrive with ROADMAP item B3.

## Quality checks

App tests matched by file name: `continent-app/tests/budgetSearch.test.mjs`, `continent-app/tests/explore.spec.mjs`, `continent-app/tests/explore_t498.test.mjs`, `continent-app/tests/flightSearch.test.mjs`, `continent-app/tests/placeSearch.test.mjs`, `continent-app/tests/taxonomy.test.mjs`.

DOM checks: `continent-app/scripts/verify_explore.mjs`, `continent-app/scripts/verify_guided_search.mjs`, `continent-app/scripts/verify_places_search.mjs`, `continent-app/scripts/verify_shortlist.mjs`.

Python tests matched by file name: none matched by name (not verified whether another test covers this area).

Name matching is a guide, not proof of coverage. CI workflows are listed in [../architecture/README.md](../architecture/README.md).

## Metrics

Not measured by this doc. Figures for this area sit in the latest task reports named above.

## Security notes

Recent searches stay on this device (localStorage, per the handbook).

The threat model and controls live in `docs/security/` (Track C); this doc does not restate them.

## Known limits

Each linked handbook section ends with a "Limits" paragraph; read those first.

## Open items

The register is the truth. Find this area's open rows with:

```
grep -i -E "explore|search dock|T96" Execution/_OPEN.md
```

## History

- 2026-11-05, T1073: first written from MAP.md and the handbook. Earlier history: the task reports named above and `Execution/P*/_DIGEST.md`.

## Last verified

2026-11-05 (T1073): paths exist (checked by a script), handbook links resolve against the handbook headings. Behaviour was not re-run.
