# T058 DECIDE the flight-cost input structure

## Task ID

T058

## Date

2026-09-28

## What changed

Nothing in the code or the data. This task writes down the contract that already governs how a flight price reaches the trip planner and the price map, names the two places where the code has drifted from it, and takes the decisions the original mind map left open. The contract is in the section "The contract" below. It is the deliverable. The rest of the report is the evidence for it and the list of what has to change to make the code match it.

The short version. Flight cost enters route optimisation at two points only, the flight into the first stop and the flight home from the last, and it enters as a per-day price for the exact dates chosen. Three sources feed that per-day table and one source stands behind it. The direct Ryanair harvest is the base. Direct Wizz Air, Vueling and Volotea harvests overlay it cheapest-wins with ties going to the direct carrier. The Travelpayouts cache overlays a day only where it is strictly cheaper or where nothing else exists. The estimation model never enters the per-day table at all. It ships as a route-month band, one integer per month per direction, and the app reads it only when no stored day matches the traveller's dates in either direction, and only for months where the Aviasales cache shows an airline outside the harvested families actually flying that route. When there is no such evidence there is no band, and the trip falls to the road or is reported as unpriceable. Provenance travels as four short record fields and one runtime flag, and every surface renders from those.

## How the input works today

The unit of truth is a day. The master fares table, `data.fares[anchor][origin]`, holds for every route two maps, `out` and `ret`, from ISO date to the cheapest one-way euro price on that day. The weekly `patch` step in `pipeline/harvest_all_origins.py` rebuilds the table from the Ryanair cache and stamps every record with `s`, the source that created it, and `o`, the epoch day its prices were last confirmed. The Wizz, Vueling and Volotea patches then merge their own calendars day by day, keeping the cheaper price and tagging the day in `out_c` or `ret_c` when the winner is not Ryanair. The Travelpayouts staging file, contract B in SCHEMA.md, is folded in last. An expired quote or a day outside the fare window is dropped at merge time. A surviving quote wins a day only when no direct price exists or when it is strictly cheaper, and it is tagged `TP`. A direct carrier merge reclaims a `TP` day at equal price, so a cached quote never displaces an equal-or-cheaper direct fare whatever the merge order.

The estimate is a different kind of object and it is kept apart on purpose. `src/estimation/model.py` trains four gradient-boosted models on the snapshot history and exports month-level bands per route and direction, five numbers per month. `merge_est_bands` in the same pipeline file takes only the p50, rounds it to an integer, and attaches it to the record as `e_out` and `e_ret`, keyed by month and restricted to the window. The per-day maps never receive an estimated day, so calendars, best-fare windows and the "take this trip cheaper" sweep never show a flight nobody sells. Before a band month is attached it passes the service gate. `data/derived/tp_service_evidence.json`, built by the Travelpayouts collector from every raw cached itinerary on disk, lists for each route and month the airlines the cache saw operating a direct flight. A month is kept only if one of those airlines is outside the harvested families, because the harvested carriers' stored days are their complete calendars and a gap in them means no flight. If the evidence file is missing, no bands are attached and stale ones are cleared. The invariant is asserted on the shipped slices by `continent-app/scripts/verify_flight_estimates.mjs`.

`continent-app/scripts/sync-data.mjs` ships the table as one slice per origin. Since T057 the per-day observed and expiry maps are stripped at that point, so the wire record carries `out`, `ret`, `out_c`, `ret_c`, `s`, `o`, `e_out` and `e_ret`, plus the departure times where the times harvest covers the origin. `src/lib/origins.js` hydrates a slice onto each destination as `routes[origin]`, renaming to `outbound_fare`, `return_fare`, `outbound_carrier`, `return_carrier`, `outbound_estimate` and `return_estimate`, and copying `s` and `o` verbatim.

Three consumers read that shape. The price map and the destination sheet go through `composeTrip` in `src/lib/runtime_pricing.js`. Its `planeFare` helper tries, in order, a stored day pair on the destination's own routes, a stored day pair into a served airport within `PLANE_REACH_KM` of the destination with the last leg priced in, and only then the band pair, which it marks `estimated`. If all three fail the breakdown falls to the car option when the place is drivable, and `plane_reachable` is false so the map cannot label a drive as a flight. The trip planner's round flight goes through `combineTripLegs` in `src/lib/trip_planner_pricing.js`. It looks up the exact arrival date on the first stop and the exact departure date on the last, across the origins both share, honours the origin the traveller picked in the wizard when it prices out, and otherwise takes the cheapest. It returns a reason, `no_shared_origin` or `no_fare_for_date`, instead of a price when it cannot. The wizard's fly-in and fly-home steps in `src/lib/wizardFlights.js` read the same per-day maps, exact date first and cheapest day in the month when the traveller is flexible. The "take this trip cheaper" sweep in `src/lib/tripCostOptimizer.js` calls `combineTripLegs` over every stored start date and therefore only ever proposes bookable days.

The ordering and night-allocation algorithm in `src/lib/cartaRoute.js` reads no flight price at all. It orders stops by road-scaled straight-line distance and hands out nights by how much there is to do. Legs between stops are priced afterwards by the ground engine, and a flight between two stops is something the traveller books themselves and types in as an own leg. Carta holds no intra-trip flight fares, because the table is keyed by home origin.

Provenance rides on the record. `src/components/FareProvenance.jsx` defines the runtime bag, `{ s, o, x, est }`, and `fareProv` builds it from whatever object it is handed, tolerating the wire's short keys and the ground resolver's `est` and `src` flags. `flightBreakdownProv` forces `EST` with no age whenever the breakdown's `fare_estimated` flag is set, whatever the route record says, and reads the record's `s` and `o` otherwise. The Explore results list builds the same bag in `src/hooks/useDestinationSearch.js`. The renderers prepend a tilde and an "est." tag for an estimate, print "seen n days ago" from `o`, and put a booking note beside every external link.

## The contract

This is the decision. Where the code already does this, the section above is the evidence. Where it does not, the item is listed under What is still open with a task pointer.

Where flight cost enters. Flight cost enters route optimisation at the two ends of a trip only: the flight from the home origin into the first stop's airport and the flight from the last stop's airport back to the home origin. It never enters the interior ordering of stops, the allocation of nights, or the pricing of a leg between two stops. The interior stays on the ground engine. A flight between two stops is an own leg the traveller enters, and its price is the traveller's number, never Carta's. This is a design choice, not a data gap to fill: the fare table is keyed by home origin, intra-European connecting flights would need a second table of the same size per origin, and the road, rail and ferry engine already prices every interior leg with its own provenance.

Granularity. The per-day dated price is the unit of truth. A price is attached to one direction on one calendar date on one route, and it is the cheapest bookable one-way seat that day. All real sources, direct harvests and cached quotes alike, are folded into that one per-day table at pipeline time, so the app sees one map per direction and does not know or care which source filled which day beyond the tag. The route-month band is the only other granularity and it is the estimate's granularity alone. Bands are one integer per month per direction, the model's p50 month median, and they live in separate fields. A band never becomes a day and a day never becomes a band. The p10 and p90 stay in the export on disk, not on the wire, and the app renders an estimate as a single tilde-prefixed figure, not a range, until a design rule for a range exists.

Which source wins, per day. Cheapest wins, with two priorities. A direct carrier harvest beats a cached quote at equal price, whichever was merged last. Any real day, from any source, beats the estimate regardless of price, and the estimate is not consulted at all when a real day exists. In order: the Ryanair harvest is the base; the Wizz Air, Vueling and Volotea harvests overlay it cheapest-wins with ties to the earlier direct source; the Travelpayouts cache overlays a day only when strictly cheaper or when the day was empty, after expired quotes and days outside the window are discarded. The model's band stands behind all of them.

Which source wins, per trip. For a chosen pair of dates the resolution order is fixed and the same on every surface. First, a stored day pair on the destination's own routes, cheapest origin, or the traveller's chosen origin when it prices out. Second, a stored day pair into a served airport within `PLANE_REACH_KM`, with the last leg priced as a shuttle or folded into the rental, because a real fare into a nearby airport still beats estimating this one. Third, the band pair for the two months, and only when both directions have a band, because a half-known round trip is a guess wearing an estimate's label. Fourth, nothing: the flight option is absent, the breakdown says so with `plane_reachable` false or a `no_fare_for_date` reason, and the trip is priced by road if the place is drivable or reported as unpriceable. The optimisation sweeps that propose alternative dates use only the first step, stored days, because their promise is that every candidate is bookable.

What licenses an estimate. A band month ships only when the service evidence shows an airline outside the harvested families flying that route in that direction that month. The harvested families are the ones whose stored days are complete calendars, so a gap in their days is a day nothing flies and an estimate there would invent a flight. The set of harvested families is therefore not a constant but a function of which harvests are actually running: a family leaves the set the week its harvest is retired, and from then on a cached quote from that airline is evidence like any other. No evidence file means no bands anywhere, and stale bands are cleared on every merge.

Fallback when no evidence exists. There is no synthetic price. The chain ends at the road or at an honest absence. In plane mode the map prices a drivable destination as a drive and flags it, and an undrivable one as unreachable. The planner reports the reason instead of a figure. The receipt never carries a flight line that no source stands behind.

Provenance fields, at the wire. A record carries `s`, the source code that created it, one of `FR`, `W6`, `VY`, `V7` or `TP`; `o`, the epoch day the record's prices were last confirmed; `out_c` and `ret_c`, sparse per-day maps of the winning source where it is not the record's base; and `e_out` and `e_ret`, the band maps. The source of a day is the per-day tag, else the record's `s`, else `FR`. The age of a day is the record's `o`. Expiry is enforced at merge time by discarding expired quotes and is not carried on the wire since T057; a cached quote that survives the merge is treated as good until the next weekly refresh replaces it. `EST` is never written by the pipeline. It is reserved for the runtime bag.

Provenance fields, at runtime. Every priced flight object carries or can produce the bag `{ s, o, x, est }` through `fareProv`. `est` is true and `s` is `EST` whenever the figure came from a band, and then `o` is null, because a band has no observation day. Otherwise `s` and `o` come from the route record that priced the day, and `x` is null. The renderers get the bag and nothing else: a tilde and "est." for an estimate, an age line from `o`, a booking note beside every external link. A surface that receives no bag renders as before and shows no chip, which is the tolerant read for legacy data, but no new code path may rely on it.

Age. A stored day is a real quote regardless of age and its age is shown, not gated. This is the honest reading of a weekly batch: the price is what the carrier published on the day in `o`, and the traveller sees that day. Whether a quote older than some threshold should stop counting as real and degrade to estimate-class labelling is a product decision, listed below for the owner.

## Files touched

**Created:**
- Execution/P3/T058-flight-cost-input-decision.md

**Modified:**
- Execution/_OPEN.md (rows T058-a to T058-e)

No pipeline, app or data file changed. The root working tree's pre-existing unstaged modifications to `continent-app/*` files and the untracked directories listed by `git status` at the start were left untouched, as T054 to T057 also recorded.

## Commands run

Read-only, from the repo root unless noted.

```bash
git checkout -b p3-flight-cost-input-decision
# mind map: unzip the xmind, walk content.json for the T312 and Data Architecture nodes
unzip -o -q "additional docs/Carta/Carta-Master-Plan.xmind" -d /tmp/xmind
# shipped slices: source mix, bands, provenance coverage, age, past share
# (node one-liners over continent-app/public/fares/*.json; figures below)
# fallback resolution on sample dates: BRU, CRL, STN 2026-10-10 to 10-14, BRU 11-07 to 11-10 and 12-05 to 12-08
# master meta, estimate export and model metrics
python -c "import json; ..."  # app_data/app_data.json meta, data/models/fare_estimates.json.gz, fare_model_metrics.json
git add Execution/P3/T058-flight-cost-input-decision.md Execution/_OPEN.md
git commit
```

## Config and secrets set

None.

## Before/after measurements

No code or data changed, so before and after are the same state. The task implies no number to move. The figures below are the baseline the contract was written against, so the next task can tell whether the world it inherits is the one described here.

| Metric | Before | After | Delta |
|---|---|---|---|
| Fare slices shipped | 286 | 286 | 0 |
| Route records | 7,596 | 7,596 | 0 |
| Records by creating source, FR / W6 / TP / V7 / VY | 4,785 / 1,515 / 1,092 / 177 / 27 | same | 0 |
| Records with `s` and `o` | 7,596 of 7,596 | same | 0 |
| Records still carrying per-day `out_o` or `out_x` | 0 | 0 | 0 |
| Stored day-prices, both directions | 944,924 | same | 0 |
| Of which `TP`-tagged days | 58,982 | same | 0 |
| Records carrying a band | 1,472 | same | 0 |
| Band route-months on the wire | 4,922 | same | 0 |
| Band months gated off for lack of service evidence | 62,368 | same | 0 |
| Fare window on the wire | 2026-07-22 to 2026-12-19 | same | 0 |
| Stored outbound days already in the past on 2026-09-28 | 235,922 of 479,431 | same | 0 |
| Record age (`o`) on 2026-09-28 | 46 to 54 days | same | 0 |
| Model snapshots behind the bands | 1 (2026-07-22) | same | 0 |
| Model test MAPE / q10-q90 coverage | 34.7% / 78.8% | same | 0 |

How the chain resolves on the shipped wire for a four-day trip 2026-10-10 to 2026-10-14, per origin slice, counting route records by which step prices them:

| Origin | Routes | Stored day pair | Band pair | Band on one side only | No price |
|---|---|---|---|---|---|
| BRU | 18 | 4 | 0 | 1 | 13 |
| CRL | 109 | 46 | 0 | 2 | 61 |
| STN | 138 | 90 | 0 | 0 | 48 |

The band step fires rarely on the current wire. Of 4,922 band route-months, 3,331 are for August and September, months now past, and only 1,591 cover October to December. That is the consequence of bands last being merged on 2026-08-13 with a window that opened in July, not a property of the design. The one-sided rows are wire weight that can never price a trip; noted, not acted on.

## What broke and how it was fixed

No issues. Two findings about the code's fidelity to the contract are recorded as open items rather than fixed, because the files are outside this task's scope.

## What is still open

The planner's round flight does not follow the per-trip chain. `combineTripLegs` stops after the first step: it never tries a served airport within `PLANE_REACH_KM` and never reads the bands, so a trip Explore would price as an estimate is reported by the planner as `no_fare_for_date`. It also attaches no provenance bag. `flightProv` looks for `into_prov` and `out_of_prov` on the flight object and nothing sets them, so the planner's flight rows render without an age line or a source, while the same fare on the map shows both. The fix is to give `combineTripLegs` the same three steps as `planeFare`, mark the band case estimated, and attach a per-direction bag built from the winning record's `s`, `o` and the day's carrier tag. `cheapestStartDates` must stay on stored days only (T058-a).

The harvested-family set must track the harvests that run. T046-l records that the owner retired the Wizz Air, Vueling and Volotea harvests on 2026-09-27. `HARVESTED_FAMILY` in `pipeline/harvest_all_origins.py` and the same set in `src/ingestion/pricing/travelpayouts.py` still list W6, W4, W9, VY and V7, so from the first patch without those harvests the service gate rejects Wizz, Vueling and Volotea quotes as evidence and bands go dark on exactly the routes losing direct coverage. The same patch must also stop carrying forward the stored days those harvests wrote, because a day that no running harvest confirms is no longer a complete calendar and would pass as a real quote at any age. The contract's rule is that a family leaves the set the week its harvest is retired and its days leave the table on the next patch. Do this in the same task that retires the three pipeline tasks (T058-b, ordered after T046-l).

The contract lives only in this report. SCHEMA.md's "Fare provenance, contract A" section and ESTIMATION.md's serving section describe the wire and the bands but not the per-trip resolution order, the two-ends rule, or the harvested-family rule. Both files are outside this task's named scope. A follow-up should add a short "Flight-cost input" subsection to SCHEMA.md that points here and states the resolution order, so the next person reads it beside the field list (T058-c).

The runtime bag still has an `x` slot and `fareExpired` still tests it, but T057 removed the per-day expiry from the wire, so the check can never fire on a real record. Either the slot is dropped from `fareProv` and the ?provmock seam, or expiry is shipped again as a record-level field. The contract above takes the first reading: expiry is a merge-time gate. The header comment of `verify_fare_provenance.mjs` still says no shipped fare carries contract A fields, which has been false since 2026-08-05 (T058-d).

Whether a stored day older than some threshold should stop counting as a real quote is a product decision. Today every record is 46 to 54 days old because the laptop schedule has not completed a refresh since 2026-07-23 (T048-m), and the app shows "seen 52 days ago" beside a price it still presents as a quote. The contract keeps age as shown-not-gated. If the owner wants a cap, the natural form is a record-level rule in the display layer, quote past N days renders with the estimate styling, and the number N is theirs to pick (T058-e).

## Rollback procedure

There is nothing to roll back in the product. To withdraw the decision, revert the commit that carries this report and the five register rows, or delete the branch `p3-flight-cost-input-decision` before it is merged.
