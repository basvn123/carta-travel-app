# Food and drink prices for every destination: plan (T513 to T515)

**Branch:** `p11-food-costs` (root) and `p11-food-costs` (continent-app)
**Base:** root main 802266c21 (T510), app master c135d9c
**Written:** 2026-10-21

## What is true today

- Food and drink is already in every total. `groundSpendPerPerson()` in `lib/runtime_pricing.js` turns the lifestyle (dinners, lunches, quick bites, drinks, coffees, nights out and self-catered days) into euros. `priceTrip()` adds it as the `days` line of every trip total, and `computeCosts()` adds it to the euro-a-day figure on every card. The lifestyle already moves it.
- The prices under it are weak.
  - All 3,868 places share 90 distinct price baskets.
  - 3,487 places carry a national average, and 381 carry one of 22 city baskets.
  - The numbers come from a Numbeo harvest of June 2026 (23 countries, 22 cities). That harvest ended in a Cloudflare 429 ban, and Numbeo's terms do not allow scraping.
  - No live pipeline step rebuilds `dest.costs`. New places copy their anchor's basket.
- Two callers ignore the lifestyle: `countryBrief.js` (`foodPerDay(d)`) and the `useExploreCatalog` fallback (`computeCosts(data.destinations)`).
- The panel has no coffee stepper, although `coffees_per_day` is in the formula.

## What the sources can and cannot do (measured 2026-10-21)

| Source | What it gives | Coverage | Use |
|---|---|---|---|
| Eurostat `prc_ppp_ind` price level indices | Price level per country for restaurants, food, drinks, alcohol | 38 European countries, latest year 2024 (UK 2020) | Country price level |
| Eurostat `prc_hicp_minr` (ECOICOP 2) | Monthly price index per category | EU, EEA and candidate countries, to 2026-09 | Rolls every price forward to last month |
| Eurostat `ert_bil_eur_m` | Monthly euro exchange rates | All currencies, to 2026-09 | Non-euro prices stay right when a currency moves |
| Eurostat `nama_10r_3gdp` | Income per head (PPS) per NUTS3 region | 1,814 regions | Price tilt inside a country |
| Eurostat tourism nights per NUTS3 (already cached) | Tourist pressure per region | All NUTS3 | Tourist premium on eating out |
| GeoNames population (already on 3,783 places) | Town size | 98% of places | Big city and village tilt |
| Open Food Facts Open Prices (ODbL, daily dump, 22 MB) | Shop prices tied to OSM shops | 333k rows, 65% France, 10k loose-produce rows, no restaurants | Local grocery check where receipts are dense; validation |
| Numbeo | Restaurant and grocery prices per city | Large cities | Not harvested again (terms). The June 2026 numbers stay only as the calibration anchor they already are |

The conclusion: no open source has café and restaurant prices for 4,000 towns. The honest system is a **hierarchical model**. It takes measured prices where we have them and official statistics everywhere, and it tilts each place by things we can measure for every town. Every place says how its number was made.

## The model

For each place `p` in country `c` and each item `i` (dinner, lunch, quick bite, beer, cocktail, coffee, groceries a day, club entry):

```
price(p,i) = base(c,i) x local(p,i)
```

**Country base, per month.**

1. Anchor. Where a measured basket exists (23 countries, June 2026), the anchor is that basket. Elsewhere the anchor is the Europe reference price times the country's Eurostat price level for that item's category (restaurants for the six eating-out items, food for groceries). The Europe reference price is calibrated once from the measured countries: the median of `measured / (price level / 100)`.
2. Roll forward. Multiply by the monthly price index of the item's category, from the anchor's month to the latest month (catering services for eating out, food for groceries). Convert through local currency and the monthly exchange rate, so a falling zloty or forint moves the euro price.

**Local tilt**, each factor capped, product capped to 0.80 to 1.40:

- *Regional income*: `(region income / country income) ^ e`, with `e = 0.25` for eating out and `0.08` for groceries. Chains price groceries nationally; restaurant prices follow local wages and rents.
- *Tourist pressure*: +4% on eating out in the top 15% of NUTS3 regions by tourist nights per km2, +8% in the top 5%. The 62 hand-set tourist premiums (Venice, Dubrovnik, Hallstatt...) keep their own value.
- *Town size*: eating out +6% at 1 million or more people, +3% at 300k, and -4% under 5,000. Groceries +3% under 5,000, where small shops replace discounters.
- *Shop receipts*: where Open Prices has at least 40 loose-produce prices within 15 km in the last 24 months, a local grocery index (median of local price / national price per product). It is shrunk toward 1 by `n / (n + 80)`.
- The 22 measured city baskets (381 places) keep their basket, rolled forward. They are not tilted again.

**Every place records how its number was made**: `level` (city, region or country), `asof` (month), `local` (the tilt) and `drivers` (the four factors). The page can then say "Regional estimate, prices of September 2026, 120 shop receipts nearby".

## The tasks

### T513: the food price layer (pipeline)

- `pipeline/harvest_food_prices.py` fetches the four Eurostat tables and the Open Prices dump. It writes `cache/food_price_inputs.json` (small) plus `cache/open_prices/` (the dump). It is resumable, uses one request per table and needs no keys.
- `pipeline/apply_food_prices.py` is modelled on `apply_stay_tiers.py`. It is idempotent, assigns NUTS3 by point in polygon (`cache/nuts3_2021.geojson`), writes `dest.costs` for every place plus `meta.food_model` and `meta.food_country`, and keeps the eight item keys so every reader stays unchanged.
- `run_pipeline.py` gets a monthly `food` task: harvest, then apply.
- `docs/SCHEMA.md` gets the new fields and the provenance. `sync-data.mjs` passes them through.
- Tests: `tests/test_food_prices.py` covers the pure functions (roll-forward, tilt caps, shrinkage, idempotence).
- **Measurements**: the number of distinct baskets (before 90); places at country, region and city level; the leave-one-country-out error of the model against the measured baskets; and Open Prices grocery index against the Eurostat food price level per country; the run time.

### T514: food costs in every total, driven by the lifestyle (app)

- `costIndex.js`: re-freeze `REF_PRICES` to the new medians so the five price bands keep their meaning. Measure the band counts before and after.
- `countryBrief.js` and `useExploreCatalog.js` price with the reader's lifestyle.
- `LifestylePanel.jsx`: a seventh stepper for coffees a day.
- Check that `priceTrip`, `composeTrip`, `firstRun`, `destPrice` and `myTrips` all read the new numbers through `groundSpendPerPerson`, and that the receipt line names food and drink.
- **Measurements**: the euro a day for Krakow, Lisbon, Zurich and a small village before and after, for each of the six presets.

### T515: the food and drink fold (design, impeccable plus carta-design)

- The destination page gets a "Food and drink" fold:
  - The headline is your euro a day at your lifestyle.
  - One bar splits it into dinners, lunches, quick bites, drinks, coffees, groceries and nights out.
  - A short menu board shows the dinner, lunch, coffee, beer and groceries prices, each set against the country and Europe.
  - One provenance line says how the number was made.
- Carta-design wins every call. The seven questions are answered in the report.
- Checked at 380 and 1280 px, in every language.

## Rollback

- Pipeline: `apply_food_prices.py --restore` puts back the June baskets from `cache/costs.json`. Code: revert the branch.
- No schema migration and no Supabase change.

## Open for the owner

- Whether a "dining level" (cheap eats, local restaurants, fine dining) belongs in the lifestyle panel. It is a new design call, so it is not built here.
- Whether Numbeo stays as a calibration anchor or is dropped completely. Dropping it raises the model's error on the measured countries.
