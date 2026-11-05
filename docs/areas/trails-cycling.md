# Trails, cycling, routes

Area doc for the MAP.md row "Trails, cycling, routes". Template: ROADMAP item B2. Built by T1073 from MAP.md, the handbook headings and the real test folders; the rules and numbers live in the handbook, not here.

## Purpose

Walks and cycle routes: finding, routing, rating, difficulty and the trail and cycle pages.

Screens: Trail page, Cycle page, trail lists.

## How it works

The pipeline builds trails and cycling layers (trailslab repairs routes with BRouter); the trail rating is derived at the end of the trails_ chain; the app shows trails in browse pages.

Full rules, formulas and thresholds (read these, do not copy them):

- [Trails: finding and choosing walks](../HANDBOOK.md#trails-finding-and-choosing-walks)
- [Trail routing and repair tools (trailslab, brouter)](../HANDBOOK.md#trail-routing-and-repair-tools-trailslab-brouter)
- [Trail difficulty](../HANDBOOK.md#trail-difficulty)
- [Trail distance, climb and walking time](../HANDBOOK.md#trail-distance-climb-and-walking-time)
- [Trail page](../HANDBOOK.md#trail-page)
- [Cycling routes and the cycle page](../HANDBOOK.md#cycling-routes-and-the-cycle-page)
- [Trail rating (0 to 10)](../HANDBOOK.md#trail-rating-0-to-10)

## Files

App: continent-app/src/browse/TrailPage.jsx, continent-app/src/browse/CyclePage.jsx, continent-app/src/lib/trails.js, continent-app/src/lib/cycling.js

Pipeline and backend: pipeline/trails/, pipeline/cycling/, tools/trailslab/

MAP.md handbook column: Outdoors (rating in Scores). Latest tasks: T918-T922.

## Data read and written

Each linked handbook section has a "Data behind it" paragraph that names the files and keys. Wire fields are in [../SCHEMA.md](../SCHEMA.md); the data index is [../data/README.md](../data/README.md). Field level lineage is ROADMAP item B5 and does not exist yet.

## Logic IDs used

None yet. Rule IDs and `docs/logic/` arrive with ROADMAP item B3.

## Quality checks

App tests matched by file name: `continent-app/tests/trailStory.test.mjs`.

DOM checks: `continent-app/scripts/verify_cycling.mjs`, `continent-app/scripts/verify_trail_free_gpx.mjs`, `continent-app/scripts/verify_trail_page.mjs`, `continent-app/scripts/verify_trails.mjs`, `continent-app/scripts/verify_trails_export.mjs`.

Python tests matched by file name: `tests/test_trail_climb_consistency.py`, `tests/test_trail_data_bugs.py`, `tests/test_trail_photo_credit.py`, `tests/test_trail_titles.py`.

Name matching is a guide, not proof of coverage. CI workflows are listed in [../architecture/README.md](../architecture/README.md).

## Metrics

Not measured by this doc. Figures for this area sit in the latest task reports named above.

## Security notes

tools/trailslab and tools/brouter take hours to rebuild: never delete them.

The threat model and controls live in `docs/security/` (Track C); this doc does not restate them.

## Known limits

Each linked handbook section ends with a "Limits" paragraph; read those first.

## Open items

The register is the truth. Find this area's open rows with:

```
grep -i -E "trail|cycling" Execution/_OPEN.md
```

## History

- 2026-11-05, T1073: first written from MAP.md and the handbook. Earlier history: the task reports named above and `Execution/P*/_DIGEST.md`.

## Last verified

2026-11-05 (T1073): paths exist (checked by a script), handbook links resolve against the handbook headings. Behaviour was not re-run.
