# Licences and data credits

Area doc for the MAP.md row "Licences and data credits". Template: ROADMAP item B2. Built by T1073 from MAP.md, the handbook headings and the real test folders; the rules and numbers live in the handbook, not here.

## Purpose

Data licences and the credits shown to travellers.

Screens: Data sources screen (Account).

## How it works

src/ingestion/core/registry.py is the single source for what runs and what each source's licence requires; docs/tos/data_licenses.md is generated from it and attribution.js is derived from the ledger.

Full rules, formulas and thresholds (read these, do not copy them):

- [Licensed photo sources and credits](../HANDBOOK.md#licensed-photo-sources-and-credits)

## Files

App: continent-app/src/data/attribution.js

Pipeline and backend: src/ingestion/core/registry.py, docs/tos/data_licenses.md (generated)

MAP.md handbook column: Platform. Latest tasks: T078.

## Data read and written

Each linked handbook section has a "Data behind it" paragraph that names the files and keys. Wire fields are in [../SCHEMA.md](../SCHEMA.md); the data index is [../data/README.md](../data/README.md). Field level lineage is ROADMAP item B5 and does not exist yet.

## Logic IDs used

None yet. Rule IDs and `docs/logic/` arrive with ROADMAP item B3.

## Quality checks

App tests matched by file name: none matched by name (not verified whether another test covers this area).

DOM checks: none matched by name (not verified whether another test covers this area).

Python tests matched by file name: `tests/test_data_licences.py`, `tests/test_gate_attribution.py`.

Name matching is a guide, not proof of coverage. CI workflows are listed in [../architecture/README.md](../architecture/README.md).

## Metrics

Not measured by this doc. Figures for this area sit in the latest task reports named above.

## Security notes

CI runs the ledger check (.github/workflows/data-licences.yml).

The threat model and controls live in `docs/security/` (Track C); this doc does not restate them.

## Known limits

Each linked handbook section ends with a "Limits" paragraph; read those first. The handbook has no section for the licence ledger itself (not verified); it is covered here and in docs/data/README.md.

## Open items

The register is the truth. Find this area's open rows with:

```
grep -i -E "licence|license|attribution" Execution/_OPEN.md
```

## History

- 2026-11-05, T1073: first written from MAP.md and the handbook. Earlier history: the task reports named above and `Execution/P*/_DIGEST.md`.

## Last verified

2026-11-05 (T1073): paths exist (checked by a script), handbook links resolve against the handbook headings. Behaviour was not re-run.
