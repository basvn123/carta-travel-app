# T1075: Prices completed, the part that is not owner-gated (ROADMAP D10)

## Date

2026-11-05

## What changed

The target list for the bed re-scrape now exists, and the price card says so where a part of the price has no figure or rests on too little. `scripts/missing_beds.py` lists the places with no bed price, grouped by country (515 of 3,868: FR 94, IT 77, GB 56, GR 40, PT 20, DK 18, IE 17, NL 16), and flags thin beds (a tier priced from 2 or fewer scraped properties: 2,684 of 12,696 priced tiers, and 5 places thin in every tier). It reads only the shipped wire, so no data contract changed. In the app the engine's bed line now carries `thin` (rule `stay.thin_obs` = 2, from the wire's `src[tier].n`), the destination price card prints "Few listings measured" under a thin bed figure and a "Local transport: Not yet measured" row for a place with no fare, and neither moves any number. The local transport fare table (T714-b) waits on the owner's source choice and is not built; the actual re-scrape waits on the box run after T1074.

## Files touched

- Created: `scripts/missing_beds.py`, `tests/test_missing_beds.py`, `continent-app/tests/priceThin.test.mjs`, this report.
- Modified: `continent-app/config/pricing.json` (rule `stay.thin_obs`), `src/lib/stayPrice.js` (`bedPrice` returns `n`), `src/lib/costIndex.js` (`stayN`), `src/lib/price/priceDay.js` (`thin`, `basis.observations`, `isThin`), `src/lib/price/nights.js` (stay line `thin`), `src/lib/price/display.js` (`unmeasuredParts`, `bedIsThin`), `src/browse/DestPriceCard.jsx` (the two notes), `src/styles/88-place-template.css` (two rules), the six `src/i18n/*.js` catalogues (`price.notMeasured`, `price.bedThin`), `docs/HANDBOOK.md` (Destination price card steps 7, and Bed price step 10), `Execution/P15/_OPEN-scraper-health.md` (box step 7 to 8).

## Commands run

```
python scripts/missing_beds.py --public <main checkout>/continent-app/public --out <temp>
python -m pytest tests/test_missing_beds.py tests/test_stays_health.py pipeline/stays/tests -q
node --test tests/priceThin.test.mjs
npm test    (continent-app)
```

## Config and secrets set

New rule `stay.thin_obs` = 2 in `continent-app/config/pricing.json` (estimate, review 2027-05-05).

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Places with no bed price, listed by country for the re-scrape | 515, not listed | 515 listed (FR 94, IT 77, GB 56, GR 40, PT 20, DK 18, IE 17, NL 16) | list exists |
| Thin tiers flagged (2 or fewer observations) | not flagged | 2,684 of 12,696 priced tiers (private 566, dorm 648, hotel2 326, hotel3 453, hotel4 411, hotel5 254, entire place 26) | flagged |
| Places thin in every tier | not flagged | 5 (DK, GB, NL, NO, SE, one each) | flagged |
| Any displayed price figure | unchanged | unchanged (flagging adds no arithmetic; a test pins it) | 0 |
| App tests (`npm test`) | 1,236 (baseline) | 1,235 run, 1,223 pass, 12 skipped, 0 fail (T1074 removed 8 live-stays tests, T1075 added 7) | -1 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The destination page hides `.not-yet` (88-place-template.css, "missing data leaves this page", owner 2026-10-30) | the NotYet class would have hidden the new rows | the two notes use their own classes (`tcard-unmeasured`, `tcard-thin`) |

## Screens checked

Not checked in the browser (no dev server in this run). The end check must look at the destination page price card, at 375 and 1440 wide: a place with no local transport fare (almost every place) shows "Local transport / Not yet measured" between the stay and food lines and the total, with the total unchanged; one of the five thin places (a place id from `missing_beds.json` "thin.places") shows "Few listings measured" under its stay figure; a long Dutch, German and French string fits the line without wrapping the figure. Also confirm the card for a place with no bed price still shows only the plan button (T1021).

## What is still open

- T1075-a: the re-scrape of the 515 places waits on the box run after T1074 and on a check of their Booking search terms (T1021-d); the target list is `python scripts/missing_beds.py`.
- T1075-b: local transport fares wait on the owner's choice of source (T714-b); the table for 741 places is not built.
- T1075-c: the thin and not-yet notes show on the destination price card only; the trip page, the Plan trip receipt, Ask and the Explore card do not show them yet.
- T1075-d: the destination page's rule that hides NotYet slots (owner, 2026-10-30) sits against D10's "not yet measured shown honestly"; this report follows D10 on the price card only. The owner may want one rule for the page.

## Register rows to add

| T1075-a | T1075 | Re-scrape the 515 places with no bed price (`python scripts/missing_beds.py`, FR 94, IT 77, GB 56, GR 40) on the box after T1074's steps; check their Booking search terms first (T1021-d) | next task | open | after T1074-c |
| T1075-b | T1075 | Local transport fare table for 741 places: choose the fare source (T714-b), then write the layer; D10's fare half is not built | user | open |  |
| T1075-c | T1075 | Show the thin-bed and not-yet-measured notes on the trip page, the Plan trip receipt, Ask and the Explore card, as the destination price card now does | next task | open |  |
| T1075-d | T1075 | Decide one rule for NotYet slots on the destination page: the page hides them (2026-10-30) while D10 asks for "not yet measured" shown honestly | user | open |  |

## Rollback procedure

`git revert` the T1075 commits. No data and nothing live was touched; the `stay.thin_obs` rule and the two catalogue strings go with the revert.
