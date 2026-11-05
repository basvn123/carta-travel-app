# Tests and checks

Area doc for the MAP.md row "Tests and checks". Template: ROADMAP item B2. Built by T1073 from MAP.md, the handbook headings and the real test folders; the rules and numbers live in the handbook, not here.

## Purpose

The unit, browser and CI checks that guard everything else.

Screens: None (developer).

## How it works

continent-app/tests holds node unit tests and browser specs; scripts/verify_*.mjs hold DOM checks; tests/ holds the Python tests; 13 workflows run in GitHub Actions.

Full rules, formulas and thresholds (read these, do not copy them):

- [CI and checks](../HANDBOOK.md#ci-and-checks)

## Files

App: continent-app/tests/ (`*.test.mjs` unit, `*.spec.mjs` browser), continent-app/scripts/ (`verify_*.mjs`), .github/workflows/

Pipeline and backend: tests/ (`test_*.py`)

MAP.md handbook column: Platform. Latest tasks: none named.

## Data read and written

Each linked handbook section has a "Data behind it" paragraph that names the files and keys. Wire fields are in [../SCHEMA.md](../SCHEMA.md); the data index is [../data/README.md](../data/README.md). Field level lineage is ROADMAP item B5 and does not exist yet.

## Logic IDs used

None yet. Rule IDs and `docs/logic/` arrive with ROADMAP item B3.

## Quality checks

App tests matched by file name: none matched by name (not verified whether another test covers this area).

DOM checks: none matched by name (not verified whether another test covers this area).

Python tests matched by file name: none matched by name (not verified whether another test covers this area).

Name matching is a guide, not proof of coverage. CI workflows are listed in [../architecture/README.md](../architecture/README.md).

## Metrics

Not measured by this doc. Figures for this area sit in the latest task reports named above.

## Security notes

secret-scan.yml scans every push.

The threat model and controls live in `docs/security/` (Track C); this doc does not restate them.

## Known limits

Each linked handbook section ends with a "Limits" paragraph; read those first. Python tests listed in tests/quarantine.txt are skipped in CI; the list may only shrink.

## Open items

The register is the truth. Find this area's open rows with:

```
grep -i -E "test|ci|check" Execution/_OPEN.md
```

## History

- 2026-11-05, T1073: first written from MAP.md and the handbook. Earlier history: the task reports named above and `Execution/P*/_DIGEST.md`.

## Last verified

2026-11-05 (T1073): paths exist (checked by a script), handbook links resolve against the handbook headings. Behaviour was not re-run.
