# Stays (Booking, Hostelworld scrape)

Area doc for the MAP.md row "Stays (Booking, Hostelworld scrape)". Template: ROADMAP item B2. Built by T1073 from MAP.md, the handbook headings and the real test folders; the rules and numbers live in the handbook, not here.

## Purpose

Hotel and hostel prices from the Booking and Hostelworld scrape and live stays.

Screens: Wizard stays step, stays on the trip page.

## How it works

A scrape (pipeline/stays/box_stays.py and the scheduled task scripts/stays_scrape_task.ps1) writes the stays wire; the app reads it through staysData.js. There are no live prices: the Xotelo path was removed in T1074.

Full rules, formulas and thresholds (read these, do not copy them):

- [Stays: the Booking and Hostelworld scrape](../HANDBOOK.md#stays-the-booking-and-hostelworld-scrape)
- [Live stays (Xotelo, tonight's hotel prices)](../HANDBOOK.md#live-stays-xotelo-tonights-hotel-prices)

## Files

App: continent-app/src/lib/staysData.js, continent-app/src/planner/wizard/StepStays.jsx

Pipeline and backend: pipeline/stays/box_stays.py, pipeline/stays/scrape_booking.py, pipeline/stays/scrape_hostelworld.py

MAP.md handbook column: Prices; Execution/P15/_OPEN-stays-box.md. Latest tasks: T1021-T1023.

## Data read and written

Each linked handbook section has a "Data behind it" paragraph that names the files and keys. Wire fields are in [../SCHEMA.md](../SCHEMA.md); the data index is [../data/README.md](../data/README.md). Field level lineage is ROADMAP item B5 and does not exist yet.

## Logic IDs used

None yet. Rule IDs and `docs/logic/` arrive with ROADMAP item B3.

## Quality checks

App tests matched by file name: `continent-app/tests/importStays.test.mjs`, `continent-app/tests/stayPerStop.test.mjs`, `continent-app/tests/stayPrice.test.mjs`, `continent-app/tests/stayTypes.test.mjs`.

DOM checks: `continent-app/scripts/verify_stay_picks.mjs`, `continent-app/scripts/verify_stay_tiers.mjs`.

Python tests matched by file name: none matched by name (not verified whether another test covers this area).

Name matching is a guide, not proof of coverage. CI workflows are listed in [../architecture/README.md](../architecture/README.md).

## Metrics

Not measured by this doc. Figures for this area sit in the latest task reports named above.

## Security notes

Scraping terms and data licences: see docs/tos/data_licenses.md (generated).

The threat model and controls live in `docs/security/` (Track C); this doc does not restate them.

## Known limits

Each linked handbook section ends with a "Limits" paragraph; read those first. Owner steps in Execution/P15/_OPEN-stays-box.md.

## Open items

The register is the truth. Find this area's open rows with:

```
grep -i -E "stays|booking|hostelworld" Execution/_OPEN.md
```

## History

- 2026-11-05, T1073: first written from MAP.md and the handbook. Earlier history: the task reports named above and `Execution/P*/_DIGEST.md`.

## Last verified

2026-11-05 (T1073): paths exist (checked by a script), handbook links resolve against the handbook headings. Behaviour was not re-run.
