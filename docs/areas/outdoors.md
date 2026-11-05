# Beaches, lakes, mountains, nature

Area doc for the MAP.md row "Beaches, lakes, mountains, nature". Template: ROADMAP item B2. Built by T1073 from MAP.md, the handbook headings and the real test folders; the rules and numbers live in the handbook, not here.

## Purpose

Beach, lake, mountain and other nature pages on one shared pattern.

Screens: Beach page, Lake page, Mountain page.

## How it works

Pipeline layers (beaches, lakes, mountains, outdoor derive) write wire files per country; the app pages share OutdoorParts; nature items sit on the same rating ladder as places.

Full rules, formulas and thresholds (read these, do not copy them):

- [Beaches](../HANDBOOK.md#beaches)
- [Lakes](../HANDBOOK.md#lakes)
- [Mountains and peaks](../HANDBOOK.md#mountains-and-peaks)
- [Shared outdoor page pattern](../HANDBOOK.md#shared-outdoor-page-pattern)
- [Nature ratings on the place ladder (beaches, lakes, peaks, walks, cycle routes)](../HANDBOOK.md#nature-ratings-on-the-place-ladder-beaches-lakes-peaks-walks-cycle-routes)

## Files

App: continent-app/src/browse/BeachPage.jsx, continent-app/src/browse/LakePage.jsx, continent-app/src/browse/MountainPage.jsx, continent-app/src/browse/OutdoorParts.jsx

Pipeline and backend: pipeline/beaches/, pipeline/lakes/, pipeline/mountains/, pipeline/outdoor/derive_outdoor_pages.py

MAP.md handbook column: Outdoors; docs/LAKES.md (read by pipeline/lakes/check_doc.py). Latest tasks: T1031-T1033, T918-T922.

## Data read and written

Each linked handbook section has a "Data behind it" paragraph that names the files and keys. Wire fields are in [../SCHEMA.md](../SCHEMA.md); the data index is [../data/README.md](../data/README.md). Field level lineage is ROADMAP item B5 and does not exist yet.

## Logic IDs used

None yet. Rule IDs and `docs/logic/` arrive with ROADMAP item B3.

## Quality checks

App tests matched by file name: `continent-app/tests/outdoorV3.test.mjs`.

DOM checks: `continent-app/scripts/verify_beaches.mjs`, `continent-app/scripts/verify_lakes.mjs`, `continent-app/scripts/verify_mountains.mjs`.

Python tests matched by file name: none matched by name (not verified whether another test covers this area).

Name matching is a guide, not proof of coverage. CI workflows are listed in [../architecture/README.md](../architecture/README.md).

## Metrics

Not measured by this doc. Figures for this area sit in the latest task reports named above.

## Security notes

Source licences: see docs/data/README.md.

The threat model and controls live in `docs/security/` (Track C); this doc does not restate them.

## Known limits

Each linked handbook section ends with a "Limits" paragraph; read those first. docs/LAKES.md is read by pipeline/lakes/check_doc.py and was written before many later changes; rewrite is open (see the report).

## Open items

The register is the truth. Find this area's open rows with:

```
grep -i -E "beach|lake|mountain" Execution/_OPEN.md
```

## History

- 2026-11-05, T1073: first written from MAP.md and the handbook. Earlier history: the task reports named above and `Execution/P*/_DIGEST.md`.

## Last verified

2026-11-05 (T1073): paths exist (checked by a script), handbook links resolve against the handbook headings. Behaviour was not re-run.
