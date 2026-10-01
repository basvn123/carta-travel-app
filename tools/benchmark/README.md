# Ground-cost benchmark

Scores the cost engine's bed and food figures against data it never read,
and writes an accuracy figure with a confidence interval. Built by T096; the
report in `Execution/P5/T096-ground-cost-benchmark.md` explains the design
choices and what the first run found.

## What it compares

The engine's own numbers come from `continent-app/src/lib/costIndex.js`,
imported as is (`predict.mjs`), for the default lifestyle, the entire-place
tier and one traveller: Carta's mid-range week.

Stay. For every destination priced from a national prior
(`accommodation.level == "country"`), the Inside Airbnb listings within 10 km
of its centre are a measurement the engine never saw. The suite takes the
trimmed median whole-home ask over the median capacity, the same statistic
the harvester stores, lifts the engine's annual figure to the snapshot month
with the curve the runtime uses, and compares per person per night. Towns
inside 20 km of an anchor inherit that anchor's median; those are scored the
same way but reported as in-sample.

Food. Eurostat's price level indices (`data/eurostat_pli.json`, restaurants
and hotels for eating out, food and non-alcoholic beverages for groceries)
are relative levels, so each country's index is turned into euros with a
scale fitted on every other country and the residual is scored. This tests
the cross-country shape of the baskets, not their absolute level. Countries
whose basket was itself scaled from Eurostat (`price_source pli_scaled`) are
excluded as circular; stale indices (the UK stops at 2020) are excluded too.

Hotels. `samples/hotels.csv` takes hand-sampled bookings (T095). Empty until
someone prices real rooms; the suite scores it when rows exist.

The headline is the share of hold-out destinations where the weekly ground
cost (seven nights plus seven days) lands within 40 euro, with two 95%
bootstrap intervals: one resampling destinations, one resampling countries.
Errors share a national prior inside a country, so the country interval is
the one to quote.

## Running it

From a worktree, point `--root` at the main checkout, which holds
`cache/iab`, `pipeline/` and `app_data/app_data.json`. Nothing is written
there.

    node tools/benchmark/predict.mjs --app "<root>/continent-app" --data "<root>/app_data/app_data.json" --out tools/benchmark/work/predictions.json
    python tools/benchmark/benchmark.py --root "<root>"

Output: `results/<date>.json` (every row) and `results/<date>.md` (the
tables). Commit both when a run is the figure of record; `work/` is scratch.
A run takes about a minute, most of it parsing the 39 listing snapshots.

`python tools/benchmark/fetch_eurostat.py` refreshes the Eurostat snapshot
(CC BY 4.0 compatible, attribution European Union, Eurostat); the benchmark
never calls the API itself.

`--radius-km` and `--min-listings` exist for sensitivity checks; the
committed figure uses the defaults (10 km, 30 listings).

## Reading the numbers

A negative error means the engine is low. The stay hold-out is small and
biased: Inside Airbnb publishes where Airbnb is dense, so the towns it
reaches beyond the anchored cities are mostly resort coast. Say so when
quoting the figure. The food test cannot see a basket that is uniformly too
high or too low across Europe; only a hand sample of menu prices can.
