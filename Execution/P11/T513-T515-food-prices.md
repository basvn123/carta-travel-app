# T513 to T515: food and drink prices for every destination

Batch report (CLAUDE.md "Batches"): one section per task, one browser check at the end. The plan this batch followed is `Execution/P11/T513-T515-food-prices-PLAN.md`.

## Task ID

T513 (the food price layer, pipeline), T514 (food costs follow the Lifestyle everywhere, app), T515 (the Food and drink fold on the destination page, app).

## Date

2026-10-21

## Branches

- Root: `p11-food-costs` from main 802266c21 (T510). Commits 3773fc4d0 and 07077c73f (T513), plus this report.
- App (`continent-app`, its own repo): `p11-food-costs` from master c135d9c, in the worktree `C:\Users\Gebruiker\Documents\Portfolio\wt\T513-app`. One commit for T514 and one for T515.

Neither branch is merged or pushed, and nothing is deployed. The root branch does not mirror the app commits yet; see "Merging".

## What changed

### T513: the food price layer

Before this batch, 3,868 places shared 90 food and drink baskets:

- 3,487 carried a national average.
- 381 carried one of 22 city baskets, copied onto towns up to 40 km from the city. Porto's basket priced 38 places.
- All of it came from a Numbeo harvest of June 2026 that ended in a Cloudflare 429 ban.
- No live pipeline step rebuilt it. New places copied their anchor's basket.

Now every place is priced by `price = country base x local tilt` and rolled to the latest month of Eurostat data (September 2026).

**Inputs.** `pipeline/harvest_food_prices.py` fetches five sources, needs no keys and runs in 19 s (51 s when it also downloads the dumps):

- Eurostat price level indices (`prc_ppp_ind`): restaurants, food, drinks, alcohol; 39 geos.
- Monthly HICP, ECOICOP 2 (`prc_hicp_minr`): 44 geos, to 2026-09.
- Monthly euro exchange rates (`ert_bil_eur_m`): 15 currencies.
- NUTS3 income per head in PPS (`nama_10r_3gdp`): 1,729 regions.
- The Open Food Facts Open Prices daily dump (ODbL). It is condensed into a matched-product shop index: each price is compared only with the same barcode, or the same loose product per kg, elsewhere in the same country. That gives 112,101 matched prices in 1,898 shops.

**The model.** `pipeline/apply_food_prices.py` builds the country base from four kinds of anchor:

- **Measured (24 countries):** the June 2026 basket.
- **City-anchored (8):** a Europe reference price times the Eurostat price level, blended by geometric mean with what the country's measured cities imply once their own tilt is divided out.
- **Modelled (5):** the Europe reference price times the price level alone.
- **Legacy (5 microstates and Moldova):** the June basket.

Every base is rolled forward by the local HICP through the exchange rate, so a moving zloty or forint moves the euro price.

The local tilt multiplies four drivers. Each driver is capped, and their product is capped to 0.80 to 1.60:

- regional income, with elasticity 0.15 for eating out, 0.08 for chains and 0.05 for groceries;
- tourist pressure: the 62 curated premiums, otherwise +4% or +8% in the top 15% or 5% of NUTS3 regions by tourist nights per km2;
- town size;
- for groceries only, the shop index within 15 km, shrunk toward 1.

A place within 15 km of one of the 25 measured cities keeps that city's prices. Those are the 22 June baskets, plus Vienna, Prague and Split, which `fix_data.py` had written onto the whole of Austria, Czechia and Croatia.

The same eight `costs` keys are written, so every reader in the app stays unchanged. `meta.food_model` carries the method and its own validation, and `meta.food_country` carries the country bases. The new monthly task `food` in `run_pipeline.py` runs harvest then apply.

### T514: food costs follow the Lifestyle everywhere

Food and drink was already in every total. `groundSpendPerPerson()` prices the Lifestyle's dinners, lunches, quick bites, drinks, coffees, nights out and cooking days, and `priceTrip()` adds it as the "Food and drink" line. So T514 closed only the gaps:

- The wizard's country briefs priced a day of eating out at the default lifestyle. They now use the traveller's, like the town cards beside them.
- The Lifestyle panel's "Fine tune the counts" gains a seventh stepper, "Coffees a day", in six languages. It sets `coffees_per_day`, which the formula always used but nothing could set.

### T515: the Food and drink fold

The destination page's Practical tab gains a fifth fold after Where to sleep. It is `DestFood.jsx` with its own stylesheet, `74-dest-food.css`.

- **"What you spend a day".** The traveller's day at their Lifestyle as five receipt lines under one 8 px cost bar on the `--kind` ramp:
  - dinners out;
  - casual meals and fast food;
  - drinks and nights out;
  - coffees;
  - groceries for cooking.

  The sum is the price card's food figure for one person and one day. A quiet button naming the profile ("Easygoing") opens the one Lifestyle panel.
- **"What things cost in {city}".** Seven label-over-value prices: dinner, casual meal, fast food, beer, cappuccino, cocktail, groceries for a day.
- **Estimate marks.** Every figure carries the estimate mark unless the place is priced from a measured city.
- **What the page leaves out.** There is no method line. Carta-design makes the estimate mark the whole pedigree, so the method moved to `/about/numbers`, whose food sentences now describe the v2 model in all six languages (plus a new `cost.foodRegion`).
- **Wire.** It drops the model's provenance fields (`drivers`, `n_rcpt`, `city`); they stay in the master for audit.

The owner answered two design calls before the build:

- No "versus Europe" comparison marker on the prices.
- No dining level in the Lifestyle panel in this batch.

## Files touched

**Root repo, created:**
- `pipeline/harvest_food_prices.py`
- `pipeline/apply_food_prices.py`
- `tests/test_food_prices.py`
- `Execution/P11/T513-T515-food-prices-PLAN.md`
- `Execution/P11/T513-T515-food-prices.md`

**Root repo, modified:**
- `run_pipeline.py` (task `food`)
- `docs/SCHEMA.md` (the costs block, section "Food price model v2")
- `Execution/_OPEN.md` (rows T513-a to T515-b)

**App repo, created:**
- `src/browse/DestFood.jsx`
- `src/styles/74-dest-food.css`

**App repo, modified:**
- `src/browse/DestPractical.jsx`, `src/browse/DestinationPage.jsx` (the fold and its Lifestyle door)
- `src/browse/LifestylePanel.jsx` (the coffee stepper)
- `src/lib/countryBrief.js`, `src/planner/GuidedTripWizard.jsx` (briefs at the traveller's Lifestyle)
- `src/i18n/{en,de,es,fr,it,nl}.js` (new keys `lifestyle.coffeesPerDay`, `food.*`, `cost.foodRegion`; `cost.foodCity`, `cost.foodCountry`, `cost.foodScaled` rewritten)
- `scripts/explainer/numbers.mjs` (`FOOD_KEYS`)
- `scripts/sync-data.mjs` (`DEAD_WIRE_FIELDS`)
- `src/lib/bootIndex.js`: changed in T514 and restored in T515, so it has no net change.

**Data (generated, not committed):**
- `cache/food_price_inputs.json` (272 KB)
- `cache/open_prices/*.jsonl.gz` (23 MB)
- `cache/food_prices_pre_v2.<folder>_app_data.json` (the rollback snapshot, written on the first real apply)

## Commands run

```
python pipeline/harvest_food_prices.py --refresh
python pipeline/apply_food_prices.py --report app_data/app_data.json
python pipeline/apply_food_prices.py <app worktree>/public/app_data.json
node scripts/sync-data.mjs --split-only          (in the app worktree)
python -m pytest tests/test_food_prices.py -q    (10 passed)
npm test                                         (app: 558 of 558)
npx eslint <touched files>                       (0 errors)
node scripts/ci/design-lint.mjs                  (1 new, in Logo.jsx from T510, not this batch)
impeccable detect --json src/browse/DestFood.jsx src/styles/74-dest-food.css   ([])
```

The real data apply on the main checkout has NOT been run; see "Merging".

## Config and secrets set

None. All sources are keyless.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Distinct food baskets | 90 | 1,122 | +1,032 |
| Places at city / region / country level | 381 / 0 / 3,487 | 21 / 3,277 / 561 (+9 Faroe Islands unchanged) | |
| Month the prices describe | June 2026 | September 2026 | 3 months fresher |
| Mean error on a held-out country, six eating-out items | 17.9% (old Belgium baseline x price level, `meta.cost_validation`) | 15.4% (leave one measured country out) | -2.5 pp |
| Same, per item | | dinner 11.3, casual meal 15.6, fast food 12.7, beer 24.2, cocktail 14.7, coffee 14.0, groceries 10.8, club 9.2 (%) | |
| Eating-out level of the 11 measured cities against their country | 12.2% off with the flat national price | 7.7% off with the local tilt | -4.5 pp |
| Places where shop receipts moved groceries | 0 | 38 | |
| Median food a person a day, default Lifestyle | 52.9 euro | 48.9 euro | -4.0 |
| Day bands (cheapest to dearest), entire place | 585 / 678 / 1,922 / 540 / 143 | 689 / 946 / 1,698 / 464 / 71 | dearer bands thinner |
| `costs` blocks on the wire, gzip | 16.8 KB | 41.2 KB | +24.4 KB |
| First-paint rank file, gzip | 405 KB | 429 KB | +6% |
| Pipeline run time | none (no live step) | harvest 19 to 51 s, apply 10 s per target | |

Food a person a day at each Lifestyle, before and then after:

| Profile | Krakow | Lisbon | Zurich | Paris CDG | Munich | Samos | Hallstatt | London LHR |
|---|---|---|---|---|---|---|---|---|
| Backpacker | 23, then 23 | 26, then 26 | 51, then 49 | 30, then 35 | 30, then 35 | 26, then 24 | 40, then 34 | 31, then 32 |
| Easygoing | 39, then 42 | 42, then 42 | 94, then 91 | 50, then 62 | 49, then 61 | 44, then 39 | 71, then 59 | 58, then 62 |
| Nightlife | 43, then 46 | 42, then 42 | 95, then 93 | 56, then 71 | 52, then 64 | 50, then 44 | 76, then 63 | 63, then 67 |

The pattern is the intended one:

- Measured cities move only by inflation and currency (Lisbon, Zurich).
- Big expensive cities rise above the national average they used to carry (Paris, Munich).
- Small and low-income places fall (Samos, Hallstatt's modelled Austria).

**Shape of the two error figures.** The 17.9% and the 15.4% are both "scale a reference by Eurostat's price level and compare with the measured countries", but on different reference prices. Read them as like for like in method, not as the same experiment.

**Elasticity sweep.** Income elasticity for eating out was swept from 0 to 0.3 against the measured cities: mean error 8.5% at 0, 9.0% at 0.15, 9.6% at 0.25. Those cities are all big, where size and tourism already push, so the sweep cannot see the rural end. 0.15 was kept between the sweep and the regional price literature.

**Bar drinks.** Blending the alcohol price level into bar drinks cut the cocktail error from 17.8% to 15.8% but raised beer from 25.5% to 29.1%. So it applies to cocktails only.

## Browser check (English, desktop 800 px and phone 375 px)

Krakow, Practical tab:

- The fold shows "Food and drink ~€46 est. a person a day" closed.
- Opened, it shows dinners €20.43 (5 a week at €28.60), casual meals €9.05, drinks €9.84, coffees €4.05 and groceries €2.77. These sum to €46.14, and the price card's food line is €646.10 for 7 nights and 2 people, which is €46.15. The cent is rounding: the fold sums its rounded lines, as a receipt must.
- Switching to Backpacker from the fold's own button repriced it to €23.46, and the coffee line left.
- The new stepper set 2 coffees, which added €8.10 and persisted in the URL (`ls=...,2,...`).
- On the phone: no horizontal scroll, a 44 px target on the Lifestyle button, prices two across.

The German check did not complete. With 0.6 to 1.4 GB of free memory and other sessions running, the dev server took 45 s to serve the 2.6 MB rank file, and the page stayed on its loading screen through two reloads in both English and German. The German file parses and is served (HTTP 200) and all six locales load in Node. The strings were not seen on screen. Row T515-a.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The worktree started from T011 (September) | The desktop app branched it from a stale `main` ref | New branch `p11-food-costs` from main 802266c21; no work was lost |
| Austria, Czechia and Denmark fell 15 to 25% in the first run | `fix_data.py`'s Vienna, Prague and Split prices live only in the app data, not in `cache/costs.json`, and Denmark and Finland have measured capitals but no national basket | Measured cities now anchor their country (city-anchored, 8 countries) and the three corrections became cities again |
| Copenhagen and Athens tilts overshot | Capital-region income ratios are extreme | Elasticity 0.25 to 0.15, measured above |
| Both default targets would share one rollback snapshot | Both files are named `app_data.json` | The snapshot name carries the folder |
| The rank tier grew 33 KB | Provenance fields rode in the first-paint file | `drivers`, `n_rcpt` and `city` are stripped from the wire (nothing reads them) |
| `LifestylePanel.jsx` committed as a whole-file diff | Git Bash `sed -i` dropped its CRLF line endings | Staged the exact CRLF bytes with `hash-object --no-filters` and amended the unpushed commit |
| A regex edit failed on the first locale | The bash heredoc ate the backslashes | Ran the edit from a script file; nothing had been written |
| `passSubscription.test.mjs` failed in the worktree | The test imports `../supabase`, absent beside a worktree | Junction `wt\supabase` to the main checkout's `supabase` (outside both repos) |

## What is still open

These are T513-a to T515-b in `_OPEN.md`:

- **T513-a.** The published food accuracy figure (`src/lib/accuracy.js`, 88% within 6 euros, run of 1 October) was measured on the June data. The benchmark scores food against the Eurostat price level, which is now a model input, so it must exclude the modelled and city-anchored countries before it can be re-run honestly. Until then the page states a figure about the old data.
- **T513-b.** There is no regional income for the UK (526 places), Switzerland, Iceland, Bosnia and the microstates. ONS ITL3 income for the UK is the obvious next source.
- **T513-c.** Draught beer is the weakest item (24% error on a held-out country). It needs a beer-specific source; bar prices follow alcohol duty and local custom more than restaurant wages.
- **T513-d.** The Faroe Islands (9 places) have no basket and no Eurostat level; they keep their old copied figure.
- **T513-e.** Numbeo stays only as the June 2026 calibration anchor already in `cache/costs.json`. Replacing it needs a lawful measured source for restaurant prices (owner call).
- **T514-a.** The day bands shift cheaper because the countryside no longer carries capital prices (dearest band 143 to 71 places). Owner decides whether to re-cut `CUTS` in `costIndex.js`.
- **T514-b.** A "dining level" (cheap eats, local restaurants, fine dining) in the Lifestyle panel, deferred by the owner on 2026-10-21.
- **T515-a.** German, and the other four languages, not seen on screen.
- **T515-b.** Merge steps: the root mirror of the app commits, and the real data apply.

`useExploreCatalog`'s fallback (`computeCosts(data.destinations)` with no Lifestyle) was left alone. It only runs when App passes no index, and App always passes one priced at the Lifestyle.

## Merging (T515-b)

1. Merge app `p11-food-costs` into master, then mirror it into root: `git add` the two new files as well as `-u` (the mirror trap in the waves notes).
2. Merge root `p11-food-costs` into main. `run_pipeline.py` and `docs/SCHEMA.md` may conflict with the accommodation and flight sessions; their changes are additive.
3. In the main checkout, with no other pipeline python running, apply the data:

   ```
   python run_pipeline.py --only food
   node continent-app/scripts/sync-data.mjs
   ```

   That writes `app_data/app_data.json`, `continent-app/public/app_data.json` and the shards, and leaves the rollback snapshots in `cache/`.
4. Check that `node scripts/css-routes.mjs --check dist/assets` passes after the build: the new stylesheet is imported by the fold's component.

## Rollback procedure

- **Data:** `python pipeline/apply_food_prices.py --restore` puts back every block the first apply replaced, from `cache/food_prices_pre_v2.<folder>_app_data.json`, and removes `meta.food_model` and `meta.food_country`. Then run `node continent-app/scripts/sync-data.mjs`. The next quarterly `lodging` run re-applies the curated tourist premium to restored country blocks, as before.
- **Code:** revert the two root commits and the two app commits, or drop the branches if they were never merged. Remove the `food` task from `run_pipeline.py` with the root revert.
- There is no schema migration and no Supabase change. Nothing is one-way.
