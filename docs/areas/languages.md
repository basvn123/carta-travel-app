# Languages (6)

Area doc for the MAP.md row "Languages (6)". Template: ROADMAP item B2. Built by T1073 from MAP.md, the handbook headings and the real test folders; the rules and numbers live in the handbook, not here.

## Purpose

The six app languages and the string checks.

Screens: Every screen.

## How it works

app/src/i18n/index.jsx loads en, de, fr, es, it, nl; scripts live under app/scripts/i18n/ (not verified what each checks); some long text (place intros) shows in English only.

Full rules, formulas and thresholds (read these, do not copy them):

- [Languages](../HANDBOOK.md#languages)

## Files

App: continent-app/src/i18n/index.jsx and en, de, fr, es, it, nl .js (grep, never read whole), continent-app/scripts/i18n/

Pipeline and backend: none (app only)

MAP.md handbook column: Platform. Latest tasks: T158.

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

No personal data.

The threat model and controls live in `docs/security/` (Track C); this doc does not restate them.

## Known limits

Each linked handbook section ends with a "Limits" paragraph; read those first. Never read the language files whole: grep them.

## Open items

The register is the truth. Find this area's open rows with:

```
grep -i -E "language|i18n" Execution/_OPEN.md
```

## History

- 2026-11-05, T1073: first written from MAP.md and the handbook. Earlier history: the task reports named above and `Execution/P*/_DIGEST.md`.

## Last verified

2026-11-05 (T1073): paths exist (checked by a script), handbook links resolve against the handbook headings. Behaviour was not re-run.
