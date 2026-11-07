# Climate, crowds, seasons

Area doc for the MAP.md row "Climate, crowds, seasons". Template: ROADMAP item B2. Built by T1073 from MAP.md, the handbook headings and the real test folders; the rules and numbers live in the handbook, not here.

## Purpose

Climate by month, best months, crowds by month and sea temperature.

Screens: Climate strip, crowd calendar, When to go.

## How it works

The pipeline adds climate, tourism density and sea temperature per place; the app turns them into the climate strip, the crowd calendar and the traveller's month score (lib/when.js).

Full rules, formulas and thresholds (read these, do not copy them):

- [Climate strip and best months](../HANDBOOK.md#climate-strip-and-best-months)
- [When logic (the traveller's month) and When to go](../HANDBOOK.md#when-logic-the-travellers-month-and-when-to-go)
- [Crowds by month and the crowd calendar](../HANDBOOK.md#crowds-by-month-and-the-crowd-calendar)
- [Sea temperature](../HANDBOOK.md#sea-temperature)

## Files

App: continent-app/src/browse/ClimateStrip.jsx, continent-app/src/browse/DestinationPage.jsx (the crowds fact), continent-app/src/lib/crowdMonth.js, continent-app/src/lib/when.js

Pipeline and backend: pipeline/apply_climate.py, pipeline/harvest_tourism_density.py, pipeline/harvest_sea_temp.py

MAP.md handbook column: Scores. Latest tasks: T1022, T667.

## Data read and written

Each linked handbook section has a "Data behind it" paragraph that names the files and keys. Wire fields are in [../SCHEMA.md](../SCHEMA.md); the data index is [../data/README.md](../data/README.md). Field level lineage is ROADMAP item B5 and does not exist yet.

## Logic IDs used

None yet. Rule IDs and `docs/logic/` arrive with ROADMAP item B3.

## Quality checks

App tests matched by file name: `continent-app/tests/priceMonths.test.mjs`, `continent-app/tests/whenGuide.test.mjs`.

DOM checks: `continent-app/scripts/verify_crowd_line_gone.mjs`, `continent-app/scripts/verify_when_step.mjs`.

Python tests matched by file name: none matched by name (not verified whether another test covers this area).

Name matching is a guide, not proof of coverage. CI workflows are listed in [../architecture/README.md](../architecture/README.md).

## Metrics

Not measured by this doc. Figures for this area sit in the latest task reports named above.

## Security notes

Public data only.

The threat model and controls live in `docs/security/` (Track C); this doc does not restate them.

## Known limits

Each linked handbook section ends with a "Limits" paragraph; read those first.

## Open items

The register is the truth. Find this area's open rows with:

```
grep -i -E "climate|crowd|season" Execution/_OPEN.md
```

## History

- 2026-11-05, T1073: first written from MAP.md and the handbook. Earlier history: the task reports named above and `Execution/P*/_DIGEST.md`.

## Last verified

2026-11-05 (T1073): paths exist (checked by a script), handbook links resolve against the handbook headings. Behaviour was not re-run.
