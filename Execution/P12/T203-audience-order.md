# T203 The audience order

## Task ID

T203 (mind-map M03)

## Date

2026-10-02

## What changed

Carta now has a written audience order. The launch speaks to hikers: the person who travels to a town to walk from it, for a day or a weekend first and hut to hut second. The other five audiences the mind map names are ranked behind that one with a reason each, and the ranking is measured from the wire the app ships today, not from the counts the mind map carried. Nothing in the app changed. One thing the measurement turned up changes what the launch can say: the trail GPX and KML are behind the pass (`paywall.require('export')` in `continent-app/src/browse/TrailPage.jsx` lines 492 and 499), while the cycling GPX is free, the trips spec F4 says a free GPX is the whole point, and the unit economics file says "Never paywall GPX or exports". The hiker launch depends on that gate going, and it is the first open item below.

## The decision

The primary audience is hikers, and more precisely the hiker who starts from a town: somebody with a Saturday or a long weekend who picks a place to sleep, walks from it, and wants to know what the bed and the day cost there. Hut-to-hut walkers are the second ring of the same audience, reached through the same pages, and they are not a separate launch.

The sequence for the rest, in the order the launch copy and the search surface take them up:

| Rank | Audience | Role in the launch | What it waits for |
|---|---|---|---|
| 1 | Hikers, day and weekend walks first, hut to hut second | The launch audience. Every landing sentence and the first sitemap wave speak to them | The trail GPX and KML going free (T203-b) |
| 2 | Families looking for beaches | Second wave, timed for spring before the bathing season | A family facet on the wire (shade, steps, shallow water, lifeguard) and the ten-year EEA history; today "families" is a bestFor tag on 67 of 2,746 rated beaches |
| 3 | Cyclists and bikepackers | Third wave, once the rated routes clear the page floor | The extractor fix (Italy, Iceland, Albania, Bosnia and North Macedonia have zero routes) and more than 17 tours; 506 rated routes against 16,460 listed-only rows is too thin to launch on |
| 4 | Budget city-break travellers | Not a wave. They are who Carta is for, and every trail page hands into their destination page; they are not who the launch speaks to | City-level measurement for more than 26 percent of beds and 10 percent of food baskets, and the frozen fare surfaces removed (T272-a) |
| 5 | Car-free travellers | Not a wave. A measured property carried on every page from wave one (the car-free start on a route, the transit grade on a town), never a campaign of its own | Nothing; it ships inside rank 1 |
| 6 | Trail runners | Last. No layer of their own; they read the same trail page and take the same GPX | A runnable-surface fact and a pace on the trail page; today there are 25 journeys and two parkrun rows |

## Why hikers

The catalogue is deepest where the trails are. The wire carries 17,619 rated hikes (15,041 standalone, 1,615 stages, 310 parents, 148 variants, 505 unclassified), each with a page, a continuous line, an elevation profile from a public DEM, a difficulty with its provenance (tagged or derived), a season on 17,404 rows, and a derived sentence for every fact that goes through `t()` in six languages. That is the only layer, with beaches, lakes and mountains, that T205 lets into the second hreflang wave; destinations stay English because the Wikivoyage intro dominates the page. Trails are also the largest sitemap by a factor of five over the next layer, and T205 ranks them with cycling as the pages that will index slowest, which is a reason to start them earliest, not later.

The trail page is the one place where Carta's three assets meet. 3,581 of the 3,868 destination dossiers carry a hiking route in their `routes` key (18,357 route rows in all), so almost every walk has a town beside it with a measured or national day price, and the route row carries the nearest station and a `car_free` flag (1,440 rows, 975 towns). T202 found that none of the ten competitors prices the night in the valley or states its coverage thinly, and that Komoot, AllTrails and Outdooractive are the three hardest to beat on the walk itself and the easiest to position beside. The sentence that does it is already written in T202: Komoot gets you round the loop, Carta tells you what the weekend around the loop costs.

The audience is also the one where a free file buys standing. F4 of the trips spec says the loudest complaint in the Garmin and Wahoo community is a paywalled GPX, and the unit economics file lists "Never paywall GPX or exports" under where not to economise. Carta has that file ready: `trailGpx` and `trailKml` in `src/lib/trailExport.js` write one continuous track with the credit inside, and the share sheet hands it to any hiking app. The only thing in the way is the gate, which has been in `TrailPage.jsx` since the 2026-09-14 baseline and predates both documents.

Hut to hut is the second ring rather than the first because the numbers are smaller and the data is still being stitched. 1,211 rated rows carry a hut highlight, 1,957 are longer than 20 km and 553 longer than 40 km, and the stage hierarchy has 540 orphan families with no parent row (T205, spec 6.3). The pages serve a hut-to-hut walker today through the family list on each stage, and they serve the day walker better, so the day walker leads and the long-distance walker is the second sentence on the same page.

The weakness is known and named. Germany holds 4,674 of the 17,619 rows (spec Part 0.2 calls this a measurement of OSM tagging culture), Italy has 1,276, Turkey has zero, and the geometric dedup has not run. None of that changes the choice, because the fix for it (the registry, the coverage contract, the reason codes) is already the hiking layer's own roadmap, and a launch aimed at hikers is what makes that roadmap pay.

## Why the others wait

Families and beaches are second because the beach pages answer a question nobody else publishes (T205: "is the water at Playa Es Trenc clean", with the EEA class and the named site on 2,112 rated beaches tagged excellent) and because the audience is seasonal and the search for it starts in spring. They wait because the family facts are not on the wire. The bestFor facet names families on 67 rated beaches, shallow water on 7, a lifeguard on 141, and there is no shade, steps or parking fact at all; spec 4.5's "not for you if you need shade in the afternoon" cannot be written from today's row. A family launch on those rows would promise a filter it cannot run. The ten-year bathing history (spec 8.2) is the fact that makes the page unique, and it is specified, not shipped.

Cyclists and bikepackers are third. The cycling GPX is already free, the EuroVelo families (17) have pages, and docs/CYCLING.md states the layer's own acceptance test, "plan me a cycling trip through the nicest part of Scotland". But the published catalogue is 506 rated routes and 17 tours, against 16,460 listed-only rows that T205's page floor will keep out of the sitemap until they carry three measured facts, and five countries have no cycling at all because the extractor does not read `type=superroute` (spec Part 0.3). A bikepacker who searches for Bicitalia or the Alpe Adria and finds Italy at zero does not come back. The audience waits for the extractor fix and for tours in the hundreds, both of which are already specified in Part 7.

Budget city-break travellers are the product's audience, as PRODUCT.md says, and that is exactly why they are not the launch audience. Three facts decide it. First, the measured day price that the positioning rests on is measured at city level for 1,000 of 3,868 beds (`accommodation.level` is `city` on 1,000 rows, `country` on 2,868) and for 381 of 3,868 food baskets; for three towns in four the number is the national figure with a provenance sentence saying so. That is honest, and it is a thin claim to lead a city-break launch with. Second, the owner decided on 2026-10-02 that Carta does not price flights, and the flight is the largest line in a city break; Skyscanner, Kiwi and Google Flights own that query and T202 already hands it to them. Third, the city-break search space is the most crowded in travel, and the acquisition constraint (T204: about EUR 0.17 of allowable spend per visitor) means Carta can only win pages nobody else writes, and "Lisbon city break" is a page everybody writes. The city-break traveller is served anyway, because every trail page links its base town and every base town has a destination page with a receipt. They are the second click, not the first search.

Car-free travellers are a property, not a launch. 1,731 of 3,868 destinations are marked `car_needed: false` and 1,722 have good or excellent transit, the route rows carry a station name and a `car_free` flag, and `transport.js` already tells a planner how many stops are hard without a car. That is a filter and a sentence on every page, and it should ship on the trail page from wave one as "car-free start from {station}", which `RoutesFromHere.jsx` already renders. It is not an audience with its own search intent that Carta can meet better than a rail operator, so it never gets a campaign; it makes the hiker launch stronger and costs nothing. docs/TRAILS.md opens with "Somebody has a Saturday and a car"; the data now supports "or a train ticket", and the launch copy should say so.

Trail runners come last because nothing on the wire speaks to them specifically. Two rated rows carry a parkrun network tag, 25 of the 253 curated journeys are trail-running weeks, and the trail row has no pace, no runnable-surface share and no technicality grade. A runner is served by the same page and the same GPX as a hiker, so the launch does not exclude them, and the spec's E3 elevation profile serves both. They become a named audience when the trail page can say "runnable, 80 percent path, 410 m of climb in 12 km", which is a derivation task on fields the wire already holds (`sf` surface shares and `ascent_m`), not a new layer.

## How the order should be used

The launch copy, the first sitemap wave (T222) and the T205 country and section lists should lead with trails, and every page in that wave should carry the base town's day price and the car-free start. The second wave is beaches with the family facet, timed for March. The third is cycling after the Part 7 extractor fix. The positioning from T201 does not change: "what a day costs, per person, in 3,868 places" stays the sentence, and the hiker is the first person it is said to. PRODUCT.md "Who it is for" should name the launch audience in one sentence once the owner has confirmed this order (T203-c), in the same edit that T201-d carries the positioning into that file.

## Files touched

**Modified:**
- Execution/_OPEN.md (three register rows appended)

**Created:**
- Execution/P12/T203-audience-order.md

## Commands run

```
python Execution/_queue/xmind_prompt.py T203
python - # continent-app/public: rows per layer (trails trips/listed, cycling routes/listed/tours, beaches, lakes, mountains), h.cls, f.hl, net, difficulty, distance bands, bestFor and tags on beaches, journeys/index.json types
python - # app_data/app_data.json: accommodation.level and costs.level counts, local_transport.car_needed and transit_quality counts
python - # continent-app/public/dossier/*.json: routes rows, car_free rows, destinations with a hiking route
grep -n "paywall.require" continent-app/src/browse/TrailPage.jsx continent-app/src/browse/CyclePage.jsx
git -C continent-app log -S"paywall.require('export')" --format="%h %ad %s" --date=short -- src/browse/TrailPage.jsx
```

All reads were made in the main checkout; the sparse worktree holds neither `app_data/` nor `continent-app/`. No code, data or config changed.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Written audience orders in the repo | 0 | 1 primary audience, 5 ranked behind it with a reason each | +1 |
| Audiences named in PRODUCT.md "Who it is for" | 1 undifferentiated ("people counting money") plus 2 secondary by surface | same (T203-c carries the launch audience in after owner approval) | 0 |
| Rated trail pages the launch can point at | 17,619 (measured from `trails/??.json`; the mind map's figure holds) | same | 0 |
| Trail pages with a free GPX | 0 of 17,619 (gated on the pass) | same (T203-b removes the gate) | 0 |
| Cycling route pages with a free GPX | 506 of 506 rated | same | 0 |
| Destinations with a hiking route in the dossier | 3,581 of 3,868 | same | 0 |
| Route rows with a car-free start | 1,440 of 18,357, on 975 destinations | same | 0 |
| Beds priced at city level | 1,000 of 3,868 | same | 0 |
| Rated beaches with a families bestFor tag | 67 of 2,746 | same | 0 |

The mind map's "43,400 ingested routes" is the docs/1.CARTA.md figure for the first four countries ingested and is not a published count; the published count is the 17,619 above and was used instead.

## What broke and how it was fixed

No code ran, so nothing broke. One contradiction was found and recorded rather than fixed: the trail GPX and KML are gated on the pass while the cycling GPX is free and two planning documents say exports are never paywalled. Fixing it touches the paywall and `TrailPage.jsx`, which this task does not name.

## What is still open

The owner confirms the order. The primary audience is a product decision that shapes the launch copy, the sitemap wave order and the next three content waves; it should be confirmed or overruled in writing before T205's wave order, T222's first sitemap and PRODUCT.md take it as given. T203-a.

The trail GPX and KML go free. `TrailPage.jsx` calls `paywall.require('export')` before `trailGpx` and `trailKml`, so a free traveller sees the pass modal instead of the file, while `CyclePage.jsx` downloads its GPX with no gate. The trips spec F4 and CARTA_UNIT_ECONOMICS.md "Where not to economise" both say never paywall the GPX, and the hiker launch rests on the free file. One task removes the gate from the two track exports (the PDF export is a different question and stays as it is), and keeps the KML and GPX credit text inside the file. T203-b, after T203-a.

PRODUCT.md "Who it is for" names the launch audience. One sentence after the first paragraph, in the same edit that T201-d carries the positioning into the file, once T203-a is confirmed. T203-c, after T203-a.

## Rollback procedure

Delete Execution/P12/T203-audience-order.md and remove the three T203 rows from Execution/_OPEN.md, or `git revert` the single commit on branch p12-audience-order. No app, pipeline or data file changed.
