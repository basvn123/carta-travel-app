# Data wire (pipeline to app)

Area doc for the MAP.md row "Data wire (pipeline to app)". Template: ROADMAP item B2. Built by T1073 from MAP.md, the handbook headings and the real test folders; the rules and numbers live in the handbook, not here.

## Purpose

How the pipeline's master dataset becomes the files the app loads.

Screens: Every screen (as data).

## How it works

run_pipeline.py writes app_data/app_data.json; sync-data.mjs splits it into a boot index, country shards and detail files; scripts/ci/check-contract.mjs checks it against docs/SCHEMA.md.

Full rules, formulas and thresholds (read these, do not copy them):

- [The data wire (pipeline to app)](../HANDBOOK.md#the-data-wire-pipeline-to-app)

## Files

App: continent-app/scripts/sync-data.mjs, continent-app/src/lib/appData.js, continent-app/src/lib/bootIndex.js

Pipeline and backend: run_pipeline.py, pipeline/pipeline_io.py, pipeline/joins/

MAP.md handbook column: Platform; docs/SCHEMA.md (read by CI). Latest tasks: T322, T054.

## Data read and written

Each linked handbook section has a "Data behind it" paragraph that names the files and keys. Wire fields are in [../SCHEMA.md](../SCHEMA.md); the data index is [../data/README.md](../data/README.md). Field level lineage is ROADMAP item B5 and does not exist yet.

## Logic IDs used

None yet. Rule IDs and `docs/logic/` arrive with ROADMAP item B3.

## Quality checks

App tests matched by file name: `continent-app/tests/dataSheet.test.mjs`, `continent-app/tests/deviceData.test.mjs`, `continent-app/tests/pushDataPrune.test.mjs`, `continent-app/tests/wireSplit.test.mjs`.

DOM checks: `continent-app/scripts/verify_data_export.mjs`, `continent-app/scripts/verify_data_host.mjs`, `continent-app/scripts/verify_photo_contract.mjs`.

Python tests matched by file name: `tests/test_data_licences.py`, `tests/test_trail_data_bugs.py`.

Name matching is a guide, not proof of coverage. CI workflows are listed in [../architecture/README.md](../architecture/README.md).

## Metrics

Not measured by this doc. Figures for this area sit in the latest task reports named above.

## Security notes

R2 is public read for the data host; CORS rule in app/scripts/r2/data-cors.json.

The threat model and controls live in `docs/security/` (Track C); this doc does not restate them.

## Known limits

Each linked handbook section ends with a "Limits" paragraph; read those first. Schema 19 changes reach the wire and hydration, so they are slow (CLAUDE.md).

## Open items

The register is the truth. Find this area's open rows with:

```
grep -i -E "wire|schema|contract|data" Execution/_OPEN.md
```

## History

- 2026-11-05, T1073: first written from MAP.md and the handbook. Earlier history: the task reports named above and `Execution/P*/_DIGEST.md`.

## Last verified

2026-11-05 (T1073): paths exist (checked by a script), handbook links resolve against the handbook headings. Behaviour was not re-run.
