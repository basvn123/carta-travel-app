# T1190: Prices validation on the D23 runner

ROADMAP item D23 (External validation of every layer, Prices row). Round 2 session S106, batch 9.

## Date

2026-11-07

## What changed

Prices are the third layer on the T1187 validation runner, as three scorecard rows. `prices` compares Carta's country price levels for eating out, drinks, groceries and four bed tiers with Eurostat's price level indices (prc_ppp_ind, CC BY 4.0). It runs offline from a committed subset of the indices. 406 of 407 in-scope country items are matched. Turkey's 11 items are out of scope because Carta has no Turkish place. On the 315 items whose Carta number does not itself come from the index, 74.6% agree within tolerance, Kendall tau-b is 0.58, Spearman rho is 0.76, and the median absolute error is 14.2%. Food built from the index itself (13 countries) is kept in the table but left out of the facts, so the check does not just test the arithmetic. The 30 largest gaps were reviewed by hand. 9 are Carta faults: the `private` bed tier reads dearer than a 3 star double in AT, BG, HU, CY and HR, the Slovak basket is about 40% low, and Albania's fast food copies its cheap meal. 10 are Carta right or plausible against a proxy category, 7 are noise from fewer than 10 places, and 4 need the hand check. `prices_fares` (published fare examples against the swept fares) and `prices_sample` (a hand-checked sample of live listings) are built and tested on fixtures. They wait on the owner. The hand sample is drawn: 48 rows, 36 places, 23 countries, stratified by price tercile and place class. Before this task, prices had no outside check on the runner.

## Research

A research subagent compared references and terms (2026-11-07; it could not reach ec.europa.eu, so it marked codes to verify):

| Source | Measures | Terms | Fit |
|---|---|---|---|
| Eurostat prc_ppp_ind, PLI_EU27_2020 ([metadata](https://ec.europa.eu/eurostat/cache/metadata/en/prc_ppp_ind_esms.htm)) | Relative price level per country and category, EU27 = 100 | Reuse with credit, CC BY 4.0 ([notice](https://ec.europa.eu/eurostat/help/copyright-notice)) | Chosen: main reference. Categories A011101 catering, A011102 accommodation (to verify; fall back to A0111), A010101 food, A010201 alcoholic beverages |
| Eurostat HICP ECOICOP 2 (prc_hicp_ainr, prc_hicp_minr; 2025 = 100 since January 2026) | Change over time, not a level | CC BY 4.0 | Not a level reference. The only open air fare signal (CP0733), trend only |
| National statistics (CSO Ireland average prices, ONS price quotes) | Absolute averages, a few countries | Generally open (not confirmed) | Later spot anchors |
| Inside Airbnb ([data](https://insideairbnb.com/get-the-data/)) | City listing prices | CC BY 4.0 per its page | Optional city check of `home`; not used now |
| Booking.com, Hostelworld reports | City averages | All rights reserved; automated access forbidden | By hand only, through the owner's sample |
| Air fares | No open absolute series exists | | Published fare examples, entered by hand |
| [Numbeo](https://www.numbeo.com/common/terms_of_use.jsp), Expatistan | Crowd prices | Numbeo forbids scraping and derived works without a licence; Expatistan's terms are unknown | Not used. See T1190-h |

The method follows the research. Both sides are pivoted to the EU27 countries both have, so only Carta's spread between countries is compared with Eurostat's, never euros with an index. A geometric mean is used on both sides (symmetric in log terms), and the error is the ratio of the two levels. Club entry is left out because no category prices it. Hand sample: stratified 3 terciles x 3 place classes x 4 places, check-in 30 to 60 days out, median of the first 20 results sorted by price, taxes included. Nothing is scraped.

## Files touched

- Created: `scripts/validation/layer_prices.py`, `scripts/validation/layer_prices_fares.py`, `scripts/validation/layer_prices_sample.py`, `tests/test_validation_prices.py`.
- Created: `data/reports/validation/prices/` (`reference_pli.json`, `2026-11-07.json`, `baseline.json`, `errors.json`, `errors.md`, `gap_reviews.json`, `hand_sample.csv`, `fare_examples.csv` (header only)).
- Modified: `scripts/validation/runner.py` (one line: the three layers added to `LAYERS`, needed to run through the runner), `ROADMAP.md` (D23 status), `Execution/_OPEN.md` (rows appended).
- Not touched: `data/reports/validation/scorecard.json` and the admin snapshot `continent-app/src/components/admin/validationScorecard.json`. The runner rewrites both on `--write`, and a test requires them to agree. The snapshot is app code owned by S79 in this batch, so both were run with `--no-snapshot` and the scorecard was restored (T1190-f).

## Commands run

```
git lfs pull --include="cache/food_price_inputs.json"
python -I scripts/validation/layer_prices.py --refresh-reference
python -I scripts/validation/runner.py prices --write-baseline --write --no-snapshot
python -I scripts/validation/layer_prices.py --table
python -I scripts/validation/layer_prices_sample.py --draw
python -I scripts/validation/runner.py prices_fares
python -I scripts/validation/runner.py prices_sample
python -m pytest tests/test_validation_prices.py tests/test_validation_runner.py tests/test_validation_beaches.py -q
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Price layers on the runner | 0 | 3 (prices, prices_fares, prices_sample) | +3 |
| Reference items (country x item) | 0 | 418 (38 countries, 11 items) | +418 |
| Coverage (in-scope items with a Carta price) | none | 99.75% (406 of 407) | |
| Independent items checked | none | 315 | |
| Level within tolerance (fact.level) | none | 74.6% (235 of 315; 95% CI 69.5 to 79.1) | |
| Agreement tau-b / rho | none | 0.576 / 0.757 | |
| Error MdAPE / MAE (index points) | none | 14.2% / 19.3 | |
| Eating out MdAPE, independent (tol 20%) | none | 10.7%, 78.1% within | |
| Drinks MdAPE, independent (tol 25%) | none | 14.8%, 64.6% within | |
| Groceries MdAPE, independent (tol 20%) | none | 6.7%, 95.8% within | |
| Beds MdAPE (tol 30%) | none | 16.7%, 72.1% within | |
| Gaps reviewed with a verdict and cause | 0 | 30 | +30 |
| Hand sample rows drawn | 0 | 48 (36 places, 23 countries) | +48 |

Errors per country and category: `data/reports/validation/prices/errors.md`. Carta's 2026-06 app data was read, with the food model as of 2026-09. Eurostat levels are 2024, harvested 2026-10-22.

Gap verdicts (`gap_reviews.json`): Carta wrong 9 (private tier mix 5, Slovak basket 3, Albanian fast food 1). Carta right or plausible against a proxy 10 (private tier in hostel-shaped countries 6, Balkan apartments 2, Italian coffee 1, Norwegian beer excise 1). Carta plausible 2 (Polish dorms, Alpine dorms). Noise from fewer than 10 places 7. Needs the hand check 2 (GB and PT entire places).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Turkey's 11 items counted as misses (coverage 97.1%) | Eurostat publishes TR; Carta has no Turkish place | A country with no Carta place is out of scope (`matched` None), coverage 99.75% |
| `runner.py prices --write` changed scorecard.json and broke `test_shipped_scorecard_and_admin_snapshot_agree` | The scorecard and the app snapshot must move together, and the snapshot is outside this brief | Restored scorecard.json; the rebuild is row T1190-f |
| Plugins failed to import under `python -I` | `-I` drops the script's folder from sys.path | The sample plugin inserts its own folder, as the runner does |

## Screens checked

None. No traveller-facing change.

## What is still open

- T1190-a (owner): check the 48-row hand sample by hand. Until then nothing checks absolute euros, and a bias common to every country stays invisible to price level indices.
- T1190-b (owner): download the narrow levels (catering A011101, accommodation A011102) and the 2025 year, then refresh the reference. Beds are checked against restaurants and hotels together today.
- T1190-c (owner): enter about 20 published fare examples and copy the sweep files locally, then run `prices_fares`.
- T1190-d: the `private` tier mixes Booking guesthouses for two with Hostelworld privates, so it reads above hotel3 in AT, BG, HU, CY and HR. Fix it at `bed_key` in `pipeline/stays/build_stays.py`.
- T1190-e: the Slovak measured basket is about 40% under its level (beer EUR 1.91), and Albania's fast food equals its cheap meal. Recheck both at the basket.
- T1190-f: rebuild scorecard.json and the admin snapshot after merge (`runner.py prices --write`, which writes both).
- T1190-g: nothing runs `runner.py prices --write --check` in the release run.
- T1190-h (owner): Numbeo's terms forbid reuse without a licence, yet `cache/costs.json` and `meta.cost_validation` cite Numbeo anchors for the June 2026 baskets.
- T1190-i: drinks in NO, IS and SE read 1.4 to 1.5 times the restaurant level because of excise. Check drinks against A010201 once it is in the reference, or keep the drinks fact soft.

## Owner steps (for the checklist)

- [T1190-a] Check the price hand sample | the only check of absolute euros (a bias common to every country is invisible to Eurostat's indices) | open data/reports/validation/prices/hand_sample.csv; for each row open the site by hand (Booking, Hostelworld or Airbnb for beds, the place's own menus for dinner), check-in 30 to 60 days out, one night, two adults for home and hotel3, one for dorm, sort by price and note the median of the first 20 results with taxes in found_eur, plus checked_on, site, n_seen and url; then run `python -I scripts/validation/runner.py prices_sample --write-baseline --write` and commit the sheet and the result | data/reports/validation/prices/hand_sample.csv, Execution/P15/T1190-prices-validation.md
- [T1190-b] Refresh the Eurostat price levels with the narrow categories | beds are checked against restaurants and hotels together until accommodation alone is in | `mkdir -p cache/eurostat_pli`; `for c in A0111 A011101 A011102 A010101 A010201; do curl -sS "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_ppp_ind?format=JSON&lang=EN&na_item=PLI_EU27_2020&ppp_cat=$c&sinceTimePeriod=2022" -o cache/eurostat_pli/$c.json; done`; `python -I scripts/validation/layer_prices.py --refresh-reference --eurostat-dir cache/eurostat_pli`; `python -I scripts/validation/runner.py prices --write --write-baseline` and `python -I scripts/validation/layer_prices.py --table`; commit data/reports/validation/prices/ | scripts/validation/layer_prices.py
- [T1190-c] Enter published fare examples and run the fares check | flights have no open price reference, so the swept fares are not checked at all | add about 20 rows to data/reports/validation/prices/fare_examples.csv (one adult one way EUR fares read by hand from an airline or airport page, routes spread over short, medium and long, columns id,origin,dest,month,fare_eur,cc,source,url,read_on); `mkdir -p cache/flights_wire`; for each origin `curl -sS https://data.carta-europetravel.com/data/flights/<IATA>.json -o cache/flights_wire/<IATA>.json`; `python -I scripts/validation/runner.py prices_fares --write-baseline --write` | scripts/validation/layer_prices_fares.py
- [T1190-h] Decide on the Numbeo anchors | Numbeo's terms forbid copying and derived works without a licence, and the June 2026 food baskets cite Numbeo pages | decide: license Numbeo, or replace the anchored baskets with Eurostat levels and national statistics prices; tell the next prices task | cache/costs.json, pipeline/apply_food_prices.py

## Rollback procedure

`git revert` the T1190 commits on `p15-s106-prices-validation`. Nothing is one-way: no pipeline output, migration or deploy was changed. Removing the three `LAYERS` entries in `runner.py` takes the layers off the runner. `gate_from_disk` then still reads `data/reports/validation/prices/`, so delete that folder as well.
