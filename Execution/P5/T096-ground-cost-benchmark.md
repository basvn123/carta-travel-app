# T096 Ground-cost benchmark

## Task ID

T096 (mind-map T331)

## Date

2026-10-01

## What changed

The repository now has a repeatable suite, `tools/benchmark/`, that scores the cost engine's bed and food figures against data the engine never read and writes an accuracy figure with a 95% confidence interval. Nothing in the engine, the pipeline or the app changed. The first run is committed as the figure of record in `tools/benchmark/results/2026-10-01.md` and `.json`.

The honest outcome is that the statement the task aimed at, a mid-range week predicted within 40 euro for 80% of destinations, cannot be made today. The food half of the week passes that bar: 88.2% of country-priced destinations land within 40 euro a week of the Eurostat-implied basket, 95% interval 79.4% to 93.2% when countries are resampled. The stay half fails it where it is actually tested: among towns the engine prices from a national prior, only 2 of 12 land within 6 euro a night, and the combined week lands within 40 euro for 2 of 11 towns. That hold-out is small and skewed towards Mallorca resorts, so it is evidence that the Spanish national prior underprices resort coast rather than a verdict on the catalogue, but it is the only stay hold-out the data on disk allows. The report says what a larger one needs.

## How the suite works

The suite never re-implements the engine. `predict.mjs` imports `computeCosts` from `continent-app/src/lib/costIndex.js`, the function the Explore cards, the receipt and the day planner all price from, and writes one row per destination for the default lifestyle, the entire-place tier and a party of one. That configuration is Carta's "mid-range" traveller and the only one the suite scores. Each row carries the euro figures, their provenance (`inside_airbnb_city`, `inside_airbnb_country+pop`, `airbnb_pli_scaled`, `numbeo_direct`, `pli_scaled` and so on), the food split into eating out and groceries, the city centre coordinate and the seasonality curve the runtime would apply. The script needs the main checkout's `node_modules` because `dates.js` imports React, so it is pointed at the main checkout's app directory and reads `app_data/app_data.json` from there. It writes only into `tools/benchmark/work/`, which is ignored.

`benchmark.py` then runs three checks.

Stay. Of the 3,868 destinations, 1,000 carry a city-level stay price (measured from an Inside Airbnb snapshot within 20 km) and 2,868 a country-level one. The country-level towns are the hold-out: the engine priced them from a national prior, so any Inside Airbnb listing within 10 km of their centre is a measurement the engine never saw. The suite parses the 39 cached snapshots in `cache/iab` with the harvester's own `parse_listings`, so the filters (entire homes, two to eight sleepers, a positive price) are identical, converts to euro with the harvester's FX table, and for every town with at least 30 listings inside 10 km takes the 1 to 99% trimmed median whole-home ask over the median capacity. That is the statistic `harvest_accommodation.py` stores, so prediction and observation are the same quantity. The engine's annual figure is lifted to the snapshot's capture month with the curve the runtime uses, the town's own if it has one, else the global model curve. A snapshot whose median falls outside the 12 to 2,000 euro band that `apply_accommodation_anchors.py` trusts is dropped as a broken harvest, not an observation; Geneva is the one case, its prices parse to 0.16 euro. The same listings are also scored around the 1,000 city-level towns and reported apart as in-sample, because those towns inherit the anchor's median and the 10 km listings are mostly the anchor's own.

Food. Eurostat's price level indices (`prc_ppp_ind`, indicator `PLI_EU27_2020`, categories A0111 restaurants and hotels, A0101 food and non-alcoholic beverages) are relative levels, EU27 = 100, not euros. The suite turns each country's index into euros with a scale fitted on every other scored country, leave-one-out, so a country never sets its own scale and a basket that is wrong for that country shows up as error. Eating out is scaled on restaurants and hotels, groceries on food and beverages, and the two are summed to an implied euro-per-day. The engine's country basket is the median of its country-level destinations; 3,260 destinations draw their food basket from Numbeo anchors, an independent source, so the comparison is not circular. The 227 destinations whose basket was itself scaled from the same Eurostat index (`pli_scaled`: AL, BA, BG, CY, DK, EE, FI, ME, MK and others) are excluded as circular, countries with no index (AD, FO, LI, MC, MD) are skipped, and an index older than 2023 is treated as stale; the United Kingdom stops at 2020 and is excluded for that reason. This test can see whether the cross-country shape of the baskets is right. It cannot see a basket that is uniformly too high or too low across Europe.

Hotels. `samples/hotels.csv` takes hand-sampled real bookings, one per row, and scores each as a per-person nightly for a double room against the engine's entire-place nightly for the same month. The file ships with a header and no rows; T095 is the task that fills it. It is a different product from a whole home, so it is reported but never folded into the headline.

The headline is the weekly ground cost, seven nights plus seven days, and the share of hold-out towns where the engine lands within 40 euro. Every summary prints two 95% bootstrap intervals, one resampling destinations and one resampling countries. Errors inside a country share a national prior, so destinations are not independent evidence and the country interval is the one to quote. With two or three countries that interval is near meaningless (10% to 100%), which is itself the finding: the stay hold-out needs more countries before anyone quotes it. The bootstrap is seeded, so two runs give the same interval.

`fetch_eurostat.py` snapshots the indices into `data/eurostat_pli.json` (fetched 2026-10-01, dataset updated 2025-07-10, 38 geos per category) with the year each figure comes from. The benchmark reads the file and never the API, so a run is reproducible offline. Eurostat's reuse policy is CC BY 4.0 compatible; the licence ledger already carries Eurostat rows and the cost layer already scales from `prc_ppp_ind`, so no new row was needed. Inside Airbnb is CC BY 4.0, ledger row 87.

Why it was built this way. The task's own warning was that benchmarking against bookings no one made is circular. Every number the suite compares against is either a listing the engine did not read (the country-level towns) or a basket from a different source (Eurostat against Numbeo-seeded baskets). The two places where the sources do touch, inherited anchors and `pli_scaled` baskets, are either reported apart or excluded. The parameters that could flatter the result (10 km radius, 30 listings) are the harvester's own thresholds and are exposed as flags only for sensitivity checks; a run with 5, 15 or 20 km moves the stay hold-out between 12% and 30% within tolerance and does not change the conclusion.

## Files touched

**Created:**
- tools/benchmark/README.md
- tools/benchmark/benchmark.py
- tools/benchmark/predict.mjs
- tools/benchmark/fetch_eurostat.py
- tools/benchmark/data/eurostat_pli.json
- tools/benchmark/samples/hotels.csv
- tools/benchmark/results/2026-10-01.json
- tools/benchmark/results/2026-10-01.md
- tools/benchmark/.gitignore (ignores `work/`, the suite's scratch output; the root .gitignore is untouched)
- Execution/P5/T096-ground-cost-benchmark.md

**Modified:**
- Execution/_OPEN.md (four rows appended)

Nothing in continent-app changed; there is no app commit.

## Commands run

From the worktree, with `$R` the main checkout:

    python tools/benchmark/fetch_eurostat.py
    node tools/benchmark/predict.mjs --app "$R/continent-app" --data "$R/app_data/app_data.json" --out tools/benchmark/work/predictions.json
    python tools/benchmark/benchmark.py --root "$R"

The third command writes `results/<today>.json` and `.md`. The run of record was repeated once end to end at the close of the task (`--out-dir tools/benchmark/work/results --tag verify`) and produced byte-identical summaries and rows. Sensitivity runs used `--radius-km 5|15|20` and `--min-listings 20` into `work/sens/`; they are scratch and not committed. A run takes about a minute, nearly all of it parsing the 39 listing snapshots.

## Config and secrets set

None. The suite reads `cache/iab`, `pipeline/` and `app_data/app_data.json` from the main checkout and writes only under `tools/benchmark/`.

## Before/after measurements

Before this task no accuracy figure existed anywhere: no suite, no run, no claim in the app copy. After, one committed run on engine data generated 2026-06-07 (schema 17, 3,868 destinations):

| Metric | Before | After | Delta |
|---|---|---|---|
| Weekly ground cost within 40 euro, hold-out towns (n = 11, 2 countries) | none | 18.2%, 95% CI 0.0% to 45.5% by destination, 10.0% to 100.0% by country | new |
| Weekly ground cost, median absolute error, hold-out towns | none | 179.83 euro, mean signed error minus 169.65 (engine low) | new |
| Stay per person per night within 5.71 euro, hold-out towns (n = 12, 3 countries) | none | 16.7%, CI 0.0% to 41.7% by destination | new |
| Stay per person per night within 5.71 euro, in-sample towns (n = 155, 14 countries) | none | 54.2%, CI 46.3% to 72.6% by country, median absolute error 5.44 | new |
| Food per day within 5.71 euro, country baskets (n = 2,673, 24 countries) | none | 88.2%, CI 86.9% to 89.5% by destination, 79.4% to 93.2% by country, median absolute error 2.45 | new |
| Weekly food within 40 euro, same rows | none | 88.2%, CI 79.4% to 93.2% by country | new |
| Hotel sample rows | none | 0 | none |

The twelve stay hold-out towns are ten in Spain (eight on Mallorca or the Girona and Basque coast, plus Vitoria-Gasteiz and Laguardia), Wigan and Sintra. The engine's Spanish prior is 32.63 to 38.73 euro per person per night; the listings say 43 to 91. Sintra is within 2 euro and Wigan is 19 euro over. The signed errors are not noise around zero, they are the national prior meeting resort coast.

The defensible statement today is the food one: for 24 countries with an independent Eurostat index, the engine's daily food basket sits within 6 euro a day of the Eurostat-implied level for 88% of destinations, with a country-level 95% interval of 79% to 93%. The stay statement waits on a wider hold-out.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Two earlier sessions were cut off before committing | Session limits | This session reviewed the untracked folder, re-ran the suite to confirm the committed figure reproduces, and committed in two parts so a further interruption loses less |
| Geneva snapshot scored a 0.16 euro median | The harvester's CHF price parse yields fractions for that snapshot | Dropped on the pipeline's own 12 to 2,000 euro band and listed in the results file; the parse itself is open (T096-c) |
| The hotel sample and docs referred to task T330 | T330 is the mind-map number; in `_ORDER.md` the hand-pricing task is T095 | Three references changed to T095 |

## What is still open

The stay hold-out is too small and too skewed to quote. Inside Airbnb publishes where Airbnb is dense, so beyond the anchored cities its reach is resort coast, and only three countries contribute. The 775 destinations priced by `airbnb_pli_scaled` (countries with no snapshot at all) can never enter this hold-out. The route to a real figure is T095's hand sample in `samples/hotels.csv`, which the suite already scores; the owner has to price the rooms (T096-a).

The engine's Spanish national prior underprices resort towns by 17 to 56 euro per person per night. Whether the fix is a coast or resort adjustment to the prior, a wider inheritance radius on islands, or more snapshots, belongs to a cost-layer task (T096-b).

The Geneva snapshot parses to a median of 0.16 euro, which means the engine's Geneva anchor is either absent or wrong; a pipeline task should check `parse_listings` on the CHF snapshot (T096-c).

T097 publishes the accuracy figure in the product. It should publish the food figure with its country interval and not the weekly headline until the stay hold-out grows; the row says so (T096-d).

The food test cannot detect a uniform level bias across Europe; only a hand sample of menu prices can, and that is part of T095 too. It is folded into T096-a rather than a row of its own.

## Rollback procedure

Two commits on `p5-ground-cost-benchmark`, root repo only. `git revert` both, or delete `tools/benchmark/` and the report and remove the four T096 rows from `Execution/_OPEN.md`. No data, schema, app or config was changed, so there is nothing else to undo.
