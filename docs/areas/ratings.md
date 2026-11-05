# Ratings and For you

Area doc for the MAP.md row "Ratings and For you". Template: ROADMAP item B2. Built by T1073 from MAP.md, the handbook headings and the real test folders; the rules and numbers live in the handbook, not here.

## Purpose

The Carta rating (0 to 10), appeal, beauty, fame and hidden gems, vibes, and personal match (For you).

Screens: Score, rating sheet, For you.

## How it works

The pipeline writes the rating layer from a frozen calibration (reports/rating_reference_v5.json); the app reads rating.score and applies config/rating.json for display and For you.

Full rules, formulas and thresholds (read these, do not copy them):

- [Place rating (Carta rating v5)](../HANDBOOK.md#place-rating-carta-rating-v5)
- [Appeal: hand scores and the rubric](../HANDBOOK.md#appeal-hand-scores-and-the-rubric)
- [Beauty](../HANDBOOK.md#beauty)
- [Depth](../HANDBOOK.md#depth)
- [Designations and recognition](../HANDBOOK.md#designations-and-recognition)
- [Fame and hidden gems](../HANDBOOK.md#fame-and-hidden-gems)
- [Rating breakdown sheet](../HANDBOOK.md#rating-breakdown-sheet)
- [Country and class standing](../HANDBOOK.md#country-and-class-standing)
- [POI significance and labels (must-see, recommended, worth a look)](../HANDBOOK.md#poi-significance-and-labels-must-see-recommended-worth-a-look)
- [Vibe scores](../HANDBOOK.md#vibe-scores)
- [Place taste profile](../HANDBOOK.md#place-taste-profile)
- [Personal match and "For you"](../HANDBOOK.md#personal-match-and-for-you)

## Files

App: continent-app/src/lib/rating.js, continent-app/config/rating.json, continent-app/src/browse/RatingSheet.jsx, continent-app/src/lib/recommend/rank.js

Pipeline and backend: pipeline/rating_layer.py, pipeline/rating_config.py, pipeline/place_taste_profile.py, reports/rating_reference_v5.json (frozen calibration)

MAP.md handbook column: Scores. Latest tasks: T879-T884, T785-T791.

## Data read and written

Each linked handbook section has a "Data behind it" paragraph that names the files and keys. Wire fields are in [../SCHEMA.md](../SCHEMA.md); the data index is [../data/README.md](../data/README.md). Field level lineage is ROADMAP item B5 and does not exist yet.

## Logic IDs used

None yet. Rule IDs and `docs/logic/` arrive with ROADMAP item B3.

## Quality checks

App tests matched by file name: `continent-app/tests/accuracySignals.test.mjs`, `continent-app/tests/countryMatch.test.mjs`, `continent-app/tests/match.test.mjs`, `continent-app/tests/recommendCompare.test.mjs`, `continent-app/tests/recommendFlight.test.mjs`, `continent-app/tests/recommendKept.test.mjs`, `continent-app/tests/recommendLevers.test.mjs`, `continent-app/tests/recommendRank.test.mjs`, `continent-app/tests/recommendSlots.test.mjs`, `continent-app/tests/recommendTrips.test.mjs`, `continent-app/tests/taste-wiring.test.mjs`, `continent-app/tests/taste.test.mjs`.

DOM checks: `continent-app/scripts/verify_rating_words.mjs`, `continent-app/scripts/verify_taste_onboarding.mjs`.

Python tests matched by file name: `tests/golden_ratings.json`, `tests/test_golden_ratings.py`, `tests/test_place_taste_profile.py`, `tests/test_rating_distribution.py`, `tests/test_rating_inputs.py`, `tests/test_rating_stability.py`, `tests/test_trip_accuracy.py`.

Name matching is a guide, not proof of coverage. CI workflows are listed in [../architecture/README.md](../architecture/README.md).

## Metrics

Not measured by this doc. Figures for this area sit in the latest task reports named above.

## Security notes

The calibration file is frozen (MAP.md); not verified who may change it.

The threat model and controls live in `docs/security/` (Track C); this doc does not restate them.

## Known limits

Each linked handbook section ends with a "Limits" paragraph; read those first. For you is off as a default until the persona gate passes (note in config/rating.json).

## Open items

The register is the truth. Find this area's open rows with:

```
grep -i -E "rating|for you|T879|T785" Execution/_OPEN.md
```

## History

- 2026-11-05, T1073: first written from MAP.md and the handbook. Earlier history: the task reports named above and `Execution/P*/_DIGEST.md`.

## Last verified

2026-11-05 (T1073): paths exist (checked by a script), handbook links resolve against the handbook headings. Behaviour was not re-run.
