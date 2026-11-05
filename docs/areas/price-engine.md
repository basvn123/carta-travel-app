# Price engine (bed, food, trip total)

Area doc for the MAP.md row "Price engine (bed, food, trip total)". Template: ROADMAP item B2. Built by T1073 from MAP.md, the handbook headings and the real test folders; the rules and numbers live in the handbook, not here.

## Purpose

Bed, food, local transport and trip total: one price request for every screen.

Screens: Cards, price card, trip total.

## How it works

lib/price takes one request (party, lifestyle, month, nights) and returns day prices and totals; config/pricing.json holds the constants; the pipeline fills the food and bed data.

Full rules, formulas and thresholds (read these, do not copy them):

- [The price request (one question for every screen)](../HANDBOOK.md#the-price-request-one-question-for-every-screen)
- [Group size and the party](../HANDBOOK.md#group-size-and-the-party)
- [Lifestyle levels](../HANDBOOK.md#lifestyle-levels)
- [Food and drink per day](../HANDBOOK.md#food-and-drink-per-day)
- [Bed price per night](../HANDBOOK.md#bed-price-per-night)
- [The day price and the five price bands](../HANDBOOK.md#the-day-price-and-the-five-price-bands)
- [Local transport](../HANDBOOK.md#local-transport)
- [Activities and things to do](../HANDBOOK.md#activities-and-things-to-do)
- [Destination price card ("What a day costs")](../HANDBOOK.md#destination-price-card-what-a-day-costs)
- [Trip total (planner)](../HANDBOOK.md#trip-total-planner)
- [The buffer (Ask budget search)](../HANDBOOK.md#the-buffer-ask-budget-search)
- [Money formatting](../HANDBOOK.md#money-formatting)
- [Food and drink prices (pipeline) and the Eat and drink section](../HANDBOOK.md#food-and-drink-prices-pipeline-and-the-eat-and-drink-section)

## Files

App: continent-app/src/lib/price/, continent-app/config/pricing.json, continent-app/src/lib/stayPrice.js, continent-app/src/browse/DestFood.jsx

Pipeline and backend: pipeline/pricing_config.py, pipeline/apply_food_prices.py

MAP.md handbook column: Prices. Latest tasks: T1018, T714-T716.

## Data read and written

Each linked handbook section has a "Data behind it" paragraph that names the files and keys. Wire fields are in [../SCHEMA.md](../SCHEMA.md); the data index is [../data/README.md](../data/README.md). Field level lineage is ROADMAP item B5 and does not exist yet.

## Logic IDs used

None yet. Rule IDs and `docs/logic/` arrive with ROADMAP item B3.

## Quality checks

App tests matched by file name: `continent-app/tests/budgetSearch.test.mjs`, `continent-app/tests/costTiles.test.mjs`, `continent-app/tests/dayBands.test.mjs`, `continent-app/tests/destPrice.test.mjs`, `continent-app/tests/lifestyleSlider.test.mjs`, `continent-app/tests/planBudget.test.mjs`, `continent-app/tests/priceConfig.test.mjs`, `continent-app/tests/priceDisplay.test.mjs`, `continent-app/tests/priceEngine.test.mjs`, `continent-app/tests/priceFeel.test.mjs`, `continent-app/tests/priceGolden.test.mjs`, `continent-app/tests/priceMonths.test.mjs`, `continent-app/tests/pricePlace.test.mjs`, `continent-app/tests/priceSources.test.mjs` and 4 more.

DOM checks: `continent-app/scripts/verify_lifestyle.mjs`, `continent-app/scripts/verify_trip_price_consistency.mjs`.

Python tests matched by file name: `tests/test_food_prices.py`, `tests/test_price_gates.py`.

Name matching is a guide, not proof of coverage. CI workflows are listed in [../architecture/README.md](../architecture/README.md).

## Metrics

Not measured by this doc. Figures for this area sit in the latest task reports named above.

## Security notes

No personal data; numbers are public estimates.

The threat model and controls live in `docs/security/` (Track C); this doc does not restate them.

## Known limits

Each linked handbook section ends with a "Limits" paragraph; read those first. Every number carries its source in the handbook; estimates are labelled as such in the app.

## Open items

The register is the truth. Find this area's open rows with:

```
grep -i -E "price|food|bed" Execution/_OPEN.md
```

## History

- 2026-11-05, T1073: first written from MAP.md and the handbook. Earlier history: the task reports named above and `Execution/P*/_DIGEST.md`.

## Last verified

2026-11-05 (T1073): paths exist (checked by a script), handbook links resolve against the handbook headings. Behaviour was not re-run.
