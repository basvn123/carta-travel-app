# Place page and PDF

Area doc for the MAP.md row "Place page and PDF". Template: ROADMAP item B2. Built by T1073 from MAP.md, the handbook headings and the real test folders; the rules and numbers live in the handbook, not here.

## Purpose

One place in full: overview, photos, price card, things to do, day trips, nearby outdoors, and the PDF.

Screens: Place page, Place PDF.

## How it works

The page reads the per-place dossier and the country shard; the PDF is built in the browser from the same dossier.

Full rules, formulas and thresholds (read these, do not copy them):

- [Place page](../HANDBOOK.md#place-page)
- [Place photos](../HANDBOOK.md#place-photos)
- [Day trips](../HANDBOOK.md#day-trips)
- [Nearby outdoors (Around)](../HANDBOOK.md#nearby-outdoors-around)
- [Place PDF](../HANDBOOK.md#place-pdf)

## Files

App: continent-app/src/browse/DestinationPage.jsx, continent-app/src/browse/PlaceOverview.jsx, continent-app/src/lib/dossier.js, continent-app/src/lib/destinationPdf.js

Pipeline and backend: pipeline/dossier/build_dossier.py, pipeline/place_layer.py

MAP.md handbook column: Discover. Latest tasks: T1019, T1022.

## Data read and written

Each linked handbook section has a "Data behind it" paragraph that names the files and keys. Wire fields are in [../SCHEMA.md](../SCHEMA.md); the data index is [../data/README.md](../data/README.md). Field level lineage is ROADMAP item B5 and does not exist yet.

## Logic IDs used

None yet. Rule IDs and `docs/logic/` arrive with ROADMAP item B3.

## Quality checks

App tests matched by file name: `continent-app/tests/destOverview.test.mjs`, `continent-app/tests/destPrice.test.mjs`, `continent-app/tests/namedPlaces.test.mjs`, `continent-app/tests/placeOverview.test.mjs`, `continent-app/tests/placeSearch.test.mjs`, `continent-app/tests/pricePlace.test.mjs`, `continent-app/tests/urlPlaces.test.mjs`.

DOM checks: `continent-app/scripts/verify_day_overview.mjs`, `continent-app/scripts/verify_destination_page.mjs`, `continent-app/scripts/verify_destinations.mjs`, `continent-app/scripts/verify_item_pdf.mjs`, `continent-app/scripts/verify_place_classes.mjs`, `continent-app/scripts/verify_places_search.mjs`, `continent-app/scripts/verify_places_tab.mjs`.

Python tests matched by file name: `tests/test_place_taste_profile.py`.

Name matching is a guide, not proof of coverage. CI workflows are listed in [../architecture/README.md](../architecture/README.md).

## Metrics

Not measured by this doc. Figures for this area sit in the latest task reports named above.

## Security notes

jspdf was raised to 4.2.1 by T1065 to clear advisories; see that report.

The threat model and controls live in `docs/security/` (Track C); this doc does not restate them.

## Known limits

Each linked handbook section ends with a "Limits" paragraph; read those first.

## Open items

The register is the truth. Find this area's open rows with:

```
grep -i -E "place page|dossier|pdf" Execution/_OPEN.md
```

## History

- 2026-11-05, T1073: first written from MAP.md and the handbook. Earlier history: the task reports named above and `Execution/P*/_DIGEST.md`.

## Last verified

2026-11-05 (T1073): paths exist (checked by a script), handbook links resolve against the handbook headings. Behaviour was not re-run.
