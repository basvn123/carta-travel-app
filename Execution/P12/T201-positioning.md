# T201 Positioning, in one sentence and one paragraph

## Task ID

T201 (mind-map M01)

## Date

2026-10-02

## What changed

Carta now has a written positioning: one sentence, one paragraph and three proof points, each traced to a file in the repository that makes it true today. Nothing in the app changed. The work was excavation, as the mind map predicted, with one correction the mind map did not expect: the claim it wanted written down ("one honest all-in number from your own departure airport, for 1,570 destinations") no longer describes the product. The catalogue is 3,868 destinations, not 1,570, and since 2026-10-01 no flight fare source is live, so the airport leg is a frozen estimate the traveller can overwrite, not a harvested number. The positioning below is written on what ships, and the airport leg is kept as a conditional claim that comes back when a fare source does.

## The positioning

### The sentence

Carta is a price transparency tool for budget travel in Europe: for people who start from "what can I afford", it says what a day costs, per person, in 3,868 places across 43 countries, and labels every figure for where it came from.

### The paragraph

Every travel product shows a price. Carta shows the price and its pedigree. A bed and a day of eating out are priced at the town's own rates where they were measured there, and the receipt says so in words: measured from this many stays, captured on this date, or the national figure standing in because the town has not been measured yet. Flights, trains, buses, ferries and drives follow one chain, real harvested quote, then cached third-party quote, then model estimate, and never a blank; each step is labelled, an estimate wears a tilde and "est." and is never dressed up as a bookable price. The same figures carry through unchanged from the Explore card to the destination receipt, the multi-city planner and the hour-by-hour day planner, so no two screens can disagree about what dinner costs. Around the towns sit 17,605 walking routes, 4,332 beaches, 2,742 lakes, 2,074 summits and 16,916 cycling rows, each with a page, and where a region is thin or empty the page says so rather than showing a blank grid. Carta takes no booking and no commission on travel; it prices, plans and hands the traveller to the operator.

### The three proof points

1. The receipt names its sources. `continent-app/src/components/CostSummary.jsx` prints one of five provenance sentences under every day price (`cost.stayMeasuredN`, `cost.stayMeasured`, `cost.stayNational`, `cost.stayRepaired`, `cost.foodMeasured` in `src/i18n/en.js` lines 3530 to 3535), and `src/lib/costIndex.js` fixes the five price bands at euro cut points so a town keeps its band when the catalogue grows. The bands replaced a percentile that once scored Geneva the cheapest city in Europe on a broken harvest; the header of that file records why.

2. Every fare carries its provenance on the wire. `continent-app/src/components/FareProvenance.jsx` reads the contract-A fields (source, observed day, expiry, estimate flag) and renders "seen {n} days ago", the lapsed-quote warning, the tilde and "est." tag, and the booking note "Prices may have changed, confirm on the booking site" (`prov.*` keys, en.js lines 1796 to 1804). The planner's flight row (`src/planner/TripItinerary.jsx` line 172 and 281) and the Destinations card (`src/browse/DestinationsTab.jsx` line 517) use the same helpers, so an estimate looks like an estimate on every surface.

3. Coverage is stated, not hidden. `continent-app/public/coverage.json` carries a status for all five layers in each of 2,077 regions (ok, thin, empty or na, with quota and floor), and 1.CARTA.md's "Where the numbers come from" table lists the public source for every layer. The product can say "we know of more walks here and cannot map them yet", which the unit economics (CARTA_UNIT_ECONOMICS.md section 5) names as the single most important revenue activity, because organic search is the only channel the contribution per visitor (about EUR 0.17) can pay for.

## How it was derived

The mind map's SOURCE line pointed at two documents. 1.CARTA.md's "The one rule everything follows" supplies the chain (harvested, cached, estimated, never blank) and the labelling rule; it is the paragraph's spine. CARTA_UNIT_ECONOMICS.md section 5 supplies the commercial frame: paid acquisition is off the table at EUR 0.17 a visitor, SEO on honest coverage pages is the acquisition strategy, and the Trip Pass must clear a competitive floor (TripIt free trial, Wanderlog about EUR 5.20 a month, from the `pricing.js` header). That frame is why the positioning leans on the ground figures and the coverage pages rather than on the flight leg: the pages that rank are destination, trail, beach, lake and mountain pages, and those are priced per day, not per flight.

The sentence takes its first clause from PRODUCT.md and 1.CARTA.md ("a price transparency tool for budget travel in Europe"), which both already say, and its audience from PRODUCT.md "Who it is for" (people who start from "what can I afford"). The numbers were measured, not copied: `app_data/app_data.json` `meta.n_destinations` is 3868 and the distinct `iso2` count is 43; `continent-app/public/boot.json` ships the same 3868; the layer rows are the `r + l` sums over `coverage.json`. The 134,657 POI figure in 1.CARTA.md was not re-measured and is left out of the positioning for that reason.

The flight leg needed a decision. `account.faq2A` in en.js ("Does Carta price flights? Not any more.") has been live since before the 2026-09-14 baseline, and `Execution/_OPEN-MASTER.md` stage 1 step 4 shows every stored fare as an estimate because the snapshot is frozen and ageing. Yet PRODUCT.md (T195, 2026-10-01) still opens with "flight out, flight back, cabin bag" and the planner still prices a flight row from the frozen snapshot. The positioning therefore says the flight follows the same labelled chain, which is true, and does not claim a harvested airport fare, which is not. The departure airport itself still does real work the positioning can stand on later: it drives the transfer, the car-versus-plane comparison and the reachability filter, and `TripItinerary.jsx` lets the traveller type what they actually paid (`flight.own`), after which the trip total uses that figure.

## The test against the four competitor categories

M02 (T202) names four categories. The positioning holds against each on a different clause, and T202 should start from these.

Route and trail products (Komoot, AllTrails, Outdooractive) have more routes, richer GPS tooling and a community; they do not price the night or the day in the town the walk starts from, and they do not say which regions they cover thinly. Carta's clause: the trail page carries the town's day price and its own coverage status.

Journey planners (Rome2Rio, Omio) price the leg better, with live operators and booking; they have no idea what the destination costs once you arrive. Carta's clause: one chain prices the leg and the stay and the day together, and labels which part is a quote.

Flight-price discovery (Skyscanner Everywhere, Kiwi Explore, Google Flights map) wins on the fare itself, by a wide margin today, since Carta's fares are frozen. They cannot say what a bed and a day of eating out cost in 3,868 places, and they do not label a figure as measured or national. Carta's clause: the honest day price and its pedigree, which is why the FAQ hands the fare to them.

Itinerary planners (Wanderlog, TripIt) are better at collaboration and at storing bookings; their costs are whatever the user types in. Carta's clause: the day planner starts from a priced catalogue and a provenance-tagged figure, not from a blank budget field.

Each category beats Carta on one axis and none of them can say the second half of the sentence: every figure labelled for where it came from. That is the claim to keep.

## Files touched

**Modified:**
- Execution/_OPEN.md (four register rows appended)

**Created:**
- Execution/P12/T201-positioning.md

## Commands run

```
python Execution/_queue/xmind_prompt.py T201
python Execution/_queue/xmind_prompt.py T202
python -c "import json; d=json.load(open('app_data/app_data.json')); print(d['meta']['n_destinations'], len({x['iso2'] for x in d['destinations'].values()}), len(d['meta']['all_origins']))"
python -c "import json; c=json.load(open('continent-app/public/coverage.json')); ..."   # r + l per layer, status counts
git -C continent-app log -S"Not any more. A fare is a fact" --format="%h %ad" --date=short -- src/i18n/en.js
```

All reads were made in the main checkout; the sparse worktree holds neither `app_data/` nor `continent-app/`.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Written positioning statements in the repo | 0 | 1 sentence, 1 paragraph, 3 proof points | +3 artefacts |
| Destinations in the mind map's claim | 1,570 | 3,868 (measured from app_data meta) | +2,298 |
| Proof points backed by a named file and line | 0 | 3 of 3 | +3 |
| Claims in the mind map's WHY that hold today | 1 of 3 ("every figure labelled") | the same 1, the other two corrected | 0 |

## What broke and how it was fixed

No code ran, so nothing broke. Two source conflicts were found and are recorded as open items rather than fixed here: the catalogue size is stale in three documents, and PRODUCT.md and the live FAQ disagree about whether Carta prices flights.

## What is still open

The flight claim needs the owner. The mind map wants "one honest all-in number from your own departure airport" and the product cannot say it today: fares are frozen and the FAQ says Carta no longer prices flights. The positioning above keeps the airport leg inside the labelled chain and no further. The owner should decide whether a fare source will return (in which case the airport sentence comes back into the paragraph) or whether the FAQ is the truth and PRODUCT.md should drop "flight out, flight back" from its opening. T201-a.

Three documents still say 1,570 destinations: docs/1.CARTA.md (twice), README.md (twice) and the example string in PRODUCT.md "Brand voice". The measured figure is 3,868. The next documentation task should replace the literal with a pointer to `meta.n_destinations`, as PRODUCT.md already asks for UI strings. T201-b.

PRODUCT.md "What Carta is" and `account.faq2A` contradict each other on flights. Whichever way T201-a goes, one of them must change; this is a one-paragraph edit once the decision exists. T201-c.

The positioning lives only in this report. T202 and T205 to T208 read it from here. Once T202 has tested it against the competitor table, it belongs at the top of PRODUCT.md, which this task was not allowed to touch. T201-d.

## Rollback procedure

Delete Execution/P12/T201-positioning.md and remove the four T201 rows from Execution/_OPEN.md, or `git revert` the single commit on branch p12-positioning. No app, pipeline or data file changed.
