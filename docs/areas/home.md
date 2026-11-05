# Home

Area doc for the MAP.md row "Home". Template: ROADMAP item B2. Built by T1073 from MAP.md, the handbook headings and the real test folders; the rules and numbers live in the handbook, not here.

## Purpose

The first-visit page: a film of real places, the true cost of a week, a product tour and the plans.

Screens: Home.

## How it works

A first visit (no query, no hash, no earlier visit mark) opens the film hero and the Ask field; later visits go to Explore. Day prices come from the price engine.

Full rules, formulas and thresholds (read these, do not copy them):

- [Home page](../HANDBOOK.md#home-page)

## Files

App: continent-app/src/browse/home/HomePage.jsx, continent-app/src/browse/home/HomeHero.jsx, continent-app/src/lib/homeVisit.js

Pipeline and backend: none (app only)

MAP.md handbook column: Discover. Latest tasks: T998, T988.

## Data read and written

Each linked handbook section has a "Data behind it" paragraph that names the files and keys. Wire fields are in [../SCHEMA.md](../SCHEMA.md); the data index is [../data/README.md](../data/README.md). Field level lineage is ROADMAP item B5 and does not exist yet.

## Logic IDs used

None yet. Rule IDs and `docs/logic/` arrive with ROADMAP item B3.

## Quality checks

App tests matched by file name: `continent-app/tests/home.test.mjs`, `continent-app/tests/homeVisit.test.mjs`.

DOM checks: `continent-app/scripts/verify_home.mjs`.

Python tests matched by file name: none matched by name (not verified whether another test covers this area).

Name matching is a guide, not proof of coverage. CI workflows are listed in [../architecture/README.md](../architecture/README.md).

## Metrics

Not measured by this doc. Figures for this area sit in the latest task reports named above.

## Security notes

No account data; the Ask field sends the typed question to Ask Carta only on submit.

The threat model and controls live in `docs/security/` (Track C); this doc does not restate them.

## Known limits

Each linked handbook section ends with a "Limits" paragraph; read those first.

## Open items

The register is the truth. Find this area's open rows with:

```
grep -i -E "home" Execution/_OPEN.md
```

## History

- 2026-11-05, T1073: first written from MAP.md and the handbook. Earlier history: the task reports named above and `Execution/P*/_DIGEST.md`.

## Last verified

2026-11-05 (T1073): paths exist (checked by a script), handbook links resolve against the handbook headings. Behaviour was not re-run.
