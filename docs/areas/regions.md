# Regions, countries, coverage

Area doc for the MAP.md row "Regions, countries, coverage". Template: ROADMAP item B2. Built by T1073 from MAP.md, the handbook headings and the real test folders; the rules and numbers live in the handbook, not here.

## Purpose

Regions, countries and the coverage contract.

Screens: Region page, Country page.

## How it works

pipeline/regions assigns a region id to every published row; pipeline/intake/coverage.py writes the coverage contract the CI gate reads; the app has Region and Country pages.

Full rules, formulas and thresholds (read these, do not copy them):

- [Region page](../HANDBOOK.md#region-page)
- [Country page](../HANDBOOK.md#country-page)

## Files

App: continent-app/src/browse/RegionPage.jsx, continent-app/src/browse/CountryPage.jsx, continent-app/src/lib/regions.js

Pipeline and backend: pipeline/regions/ (coverage.py writes the coverage contract, coverage_gate.py is the CI gate; see T1051-b), pipeline/intake/

MAP.md handbook column: Discover; docs/REGIONS.md (read by app/scripts/verify_regions.mjs). Latest tasks: T450, T456.

## Data read and written

Each linked handbook section has a "Data behind it" paragraph that names the files and keys. Wire fields are in [../SCHEMA.md](../SCHEMA.md); the data index is [../data/README.md](../data/README.md). Field level lineage is ROADMAP item B5 and does not exist yet.

## Logic IDs used

None yet. Rule IDs and `docs/logic/` arrive with ROADMAP item B3.

## Quality checks

App tests matched by file name: `continent-app/tests/countryCompare.test.mjs`, `continent-app/tests/countryCovers.test.mjs`, `continent-app/tests/countryMatch.test.mjs`, `continent-app/tests/coverageEmpty.test.mjs`, `continent-app/tests/regions_t498.test.mjs`.

DOM checks: `continent-app/scripts/verify_country_brief.mjs`, `continent-app/scripts/verify_country_cards.mjs`, `continent-app/scripts/verify_regions.mjs`.

Python tests matched by file name: none matched by name (not verified whether another test covers this area).

Name matching is a guide, not proof of coverage. CI workflows are listed in [../architecture/README.md](../architecture/README.md).

## Metrics

Not measured by this doc. Figures for this area sit in the latest task reports named above.

## Security notes

Public data only.

The threat model and controls live in `docs/security/` (Track C); this doc does not restate them.

## Known limits

Each linked handbook section ends with a "Limits" paragraph; read those first. docs/REGIONS.md is read by app/scripts/verify_regions.mjs and has not been rewritten; open item.

## Open items

The register is the truth. Find this area's open rows with:

```
grep -i -E "region|coverage|country" Execution/_OPEN.md
```

## History

- 2026-11-05, T1073: first written from MAP.md and the handbook. Earlier history: the task reports named above and `Execution/P*/_DIGEST.md`.

## Last verified

2026-11-05 (T1073): paths exist (checked by a script), handbook links resolve against the handbook headings. Behaviour was not re-run.
