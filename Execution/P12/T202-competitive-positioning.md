# T202 Competitive positioning against the four categories

## Task ID

T202 (mind-map M02)

## Date

2026-10-02

## What changed

Carta now has a written comparison against the ten products the mind map names, in four categories, with an honest column for what each does better, a column for what each cannot do, and one sentence per product that says where Carta stands. Nothing in the app changed. The research corrected one assumption the mind map carried: the "priced leg from the user's own airport to a specific trail, beach or summit" is the right distinguishing claim, but it is not shipped. The Destinations tab turns the priced chrome off for trails, beaches, lakes and mountains on purpose (`continent-app/src/browse/DestinationsTab.jsx` lines 100 to 103 and 2279 to 2293: "no priced-from origin, no stay tier, no price sort"), and a hike's page offers a town link and a GPX, not a leg from the traveller's airport. The spec already knew this: Part 13 of carta-destinations-enhancement-spec.md calls it "the one thing I would add next that is not in here". So the comparison below is written on what ships today, with the airport leg kept as the claim to build towards, in the same conditional form T201 used.

## The comparison

Prices were checked on 2026-10-02 from the vendors' pages and current reviews. They are a snapshot and will rot; the register row T202-b says when to re-check them.

| Product | They are better at this | They cannot do this | The sentence |
|---|---|---|---|
| Komoot (Premium EUR 4.99 a month or about EUR 60 a year; since 2025-03 new accounts need Premium to sync a route to a device) | Route planning on a sport-specific router, turn-by-turn navigation, elevation profiles, a community of 40 million users whose tours and photos fill every valley in Europe. | Say what the night in the valley costs, what a day there costs per person, or that its coverage of a region is thin. Its API is embed-only, so nobody can build on it. | Komoot gets you round the loop; Carta tells you what the weekend around the loop costs, and says where the figure came from. |
| AllTrails (AllTrails+ about USD 36 a year, often discounted to USD 18) | The largest review corpus for walks, with difficulty, conditions and photos crowd-sourced per trail, a strong US and UK catalogue, and offline maps. | Price anything. Its reviews are closed to reuse and its site is bot-protected, so its opinion of a walk never leaves AllTrails. Its European coverage east of Austria is thin and it does not say so. | AllTrails ranks the walk; Carta prices the bed and the day at the trailhead town and prints the coverage status for the region. |
| Outdooractive (Pro EUR 2.50 a month, Pro+ EUR 5.00 a month, billed yearly) | Official tourist-board routes for the German-speaking Alps, expert topographic maps, a route API that can be bought with fixed attribution. | Price the stay or the day, compare towns, or plan beyond the walk itself. Outside the DACH and Alpine core its catalogue thins fast. | Outdooractive is the official walk; Carta is the whole priced day, with the walk as one of 17,605 routes next to a town it has measured. |
| Rome2Rio (free, part of Omio since 2019) | Every mode between any two points on earth, 20,000 operators, a map that answers "how do I get from A to B" for a place nobody else lists. | Say what B costs once you are there. It has no idea what a bed, a meal or a day in B costs, and no catalogue of what is around B. | Rome2Rio prices the leg; Carta prices the leg, the stay and the day in one chain, labels which part is a quote, and hands the leg back to Rome2Rio to book. |
| Omio (free to use, commission on the ticket) | Live fares and one checkout for 2,300 rail, coach and ferry operators across 45 countries, mobile tickets, live journey updates. | Price the destination. A ticket is a fact about one date; Omio has no figure for the place the ticket arrives in, and no view across 3,868 of them. | Omio sells the seat; Carta decides which town the seat should go to by what a day there costs, then sends the click to Omio. |
| Skyscanner Everywhere (free) | The cheapest fare from your airport to anywhere, by month, from live airline and agent feeds. On the fare itself it beats Carta by a wide margin today, since Carta's fares are a frozen snapshot shown as estimates. | Say what the place costs after landing, label a figure as measured or national, or know that the cheap fare lands 40 km from the town. Its destinations are airports, not places. | Skyscanner finds the cheap flight; Carta finds the cheap week, and its FAQ sends the flight to Skyscanner. |
| Kiwi.com Explore (free; "anywhere to anywhere" map and date ranges) | Virtual interlining: it stitches carriers that do not sell together, and its map search takes week or month ranges. | Price the ground. It sells one leg with a self-transfer guarantee and has no catalogue, no day price, no provenance. Its low base fares omit the bag and the transfer. | Kiwi stitches the cheapest route; Carta adds the cabin bag, the airport transfer, the bed and the day, and marks each as quote or estimate. |
| Google Flights Explore map (free) | A world map of fares from one origin for flexible dates, fast, with price history and alerts. Carta's own map was built in its image. | Price anything but the flight. Some carriers are missing, ghost fares appear, and the map stops at the airport; it has no day price, no stay tier, no trail or beach. | Google maps the fare; Carta maps the trip total at your stay tier, and labels every line of it for where it came from. |
| Wanderlog (free tier; Pro USD 5.99 a month or USD 49.99 a year, about EUR 5.20 a month) | Collaborative itineraries, drag-and-drop days, place import from Google Maps, offline maps and route optimising in Pro. Its free tier already covers most of a group's planning. | Price a place it has not been told about. Every cost is what the user types; it has no measured day price, no provenance and no coverage statement. | Wanderlog organises the places you already chose; Carta starts from a priced catalogue so the day is costed before you type a number. |
| TripIt (free; Pro USD 49 a year after a 30-day free trial) | Turning forwarded booking emails into one itinerary, flight alerts, seat and refund tracking. The best record of a trip once it is booked. | Help choose the trip. It has no catalogue, no prices before booking, no map of what a week in Europe costs. It begins where Carta ends. | TripIt keeps the bookings you made; Carta prices the trip before there is anything to book. |

## How the four categories fall out

The ten products split along one line: five of them price a leg (Rome2Rio, Omio, Skyscanner, Kiwi, Google Flights) and five of them never price anything (Komoot, AllTrails, Outdooractive, Wanderlog, TripIt). Nobody in either half prices the place. That is the gap T201's sentence sits in, "what a day costs, per person, in 3,868 places", and the comparison confirms it holds against every row.

Route and trail products are the hardest to beat on their own ground and the easiest to position against. Carta's trail layer is smaller than any of theirs and its pipeline deliberately refuses their data (docs/TRAILS.md "What this layer is for": no public API, reviews forbidden for reuse). The trail page therefore does not compete on the walk; it hands the GPX to Komoot or AllTrails through the share sheet (`TrailPage.jsx` line 472) and competes on the town beside the walk, which carries a measured day price and a coverage status. Where the Destinations tab reaches the "around 20 km" fold on a destination page, Carta can say what the three nearest hikes, the beach and the summit cost to base yourself near. None of the three can.

Journey planners are partners before they are rivals. `continent-app/src/lib/transportLinks.js` and `lib/omio.js` send every leg to Skyscanner, Trainline, Rome2rio or Omio, and the affiliate click is one of the two revenue lines in CARTA_UNIT_ECONOMICS.md section 5. The positioning against them is a division of labour, not a contest: they price and sell the seat, Carta prices the place the seat goes to. The FAQ (`account.faq2A`) already says this in the product's own voice.

Flight-price discovery is where honesty costs the most. Carta's map was built in the image of Google Flights Explore and Skyscanner Everywhere, and since 2026-10-01 it cannot match them on the fare: no harvest is live and every stored fare is an estimate. The comparison says so in the table. The three sentences for this category all put the fare on the other side and the week on Carta's side, which is also what T201 decided. If the owner brings a fare source back (T201-a) the sentences do not change; the "beats Carta by a wide margin today" clause in the Skyscanner row goes.

Itinerary planners set the price floor, which is why the mind map flagged them. TripIt's 30-day free trial and Wanderlog's month at about EUR 5.20 (USD 5.99 today) are both still true, so the pricing.js reasoning that put the Trip Pass at EUR 6.99 rather than under both still stands. Against them Carta is a different kind of thing: they organise a trip the user has already priced in their head, Carta prices it first. The sentence per product follows from that, and so does the pass: what the pass sells is not storage or collaboration but planned days drawn from a priced catalogue, which neither competitor can offer at any price.

## The claim none of them can copy, and its status

The mind map's WHY and Part 13's closing note agree on the one thing no competitor can copy: the priced leg from the traveller's own airport to a specific trail, beach or summit, with the cost of staying near it. It is the right claim because it needs all three of Carta's assets at once, the departure airport, the measured ground price and the open-data layers, and no row in the table has more than one of them.

It is not shipped, and this report does not pretend otherwise. Today a hike card carries the nearest town's name; a city-day card carries the town's "from EUR x /pp" trip price from the map's origin (`TrailPage.jsx` line 893, via `priceById` in `DestinationsTab.jsx` line 1416); a beach, lake or summit card carries neither. The departure airport exists in state and drives the destination page's "Getting there" fold, but it is not joined to the outdoors layers. Building that join is the trips spec's item I1 plus Part 13's suggestion, and it should be scoped as one task once T201-a has decided whether the leg is a harvested fare or a labelled estimate. Until then every distinguishing sentence above is written on the day price and the coverage statement, which do ship, and the airport leg is kept as the sentence to add rather than a sentence to retract.

## Files touched

**Modified:**
- Execution/_OPEN.md (two register rows appended)

**Created:**
- Execution/P12/T202-competitive-positioning.md

## Commands run

```
python Execution/_queue/xmind_prompt.py T202
sed -n 1,80p continent-app/src/lib/pricing.js
sed -n 835,860p "additional docs/Carta/Plan/Data Quality/carta-destinations-enhancement-spec.md"
sed -n 232,268p "additional docs/Carta/Plan/Finance/CARTA_UNIT_ECONOMICS.md"
grep -rniE "komoot|alltrails|outdooractive|rome2rio|omio|skyscanner|kiwi\.com|wanderlog|tripit" continent-app/src docs "additional docs/Carta/Plan" -l
```

All reads were made in the main checkout; the sparse worktree holds no `continent-app/`. Vendor prices came from web searches and fetches of the vendors' pages and 2026 reviews on 2026-10-02 (mysubscriptioncost.eu and bikeradar for Komoot, outdooractive.com plans page, tripstone.app for Wanderlog, monkeyeatingmango and tripit.com for TripIt, going.com for Google Flights Explore, Wikipedia and similarweb for Omio and Rome2Rio).

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Competitors with a written "they are better at this" entry | 0 | 10 of 10 | +10 |
| Distinguishing sentences per competitor | 0 | 10 | +10 |
| Competitive floor figures in pricing.js re-verified | 0 of 2 | 2 of 2 still true (TripIt 30-day trial, Wanderlog about EUR 5.20 a month) | +2 |
| Products in the set that price the destination | 0 | 0 | 0 |

## What broke and how it was fixed

No code ran, so nothing broke. One assumption in the mind map broke on inspection: the airport-to-trail leg is described as Carta's uncopyable asset and it is not built. It is recorded as the open item below rather than papered over in the sentences.

## What is still open

The airport-to-outdoors leg needs a task and a decision. The Destinations tab turns the origin and the price off for trails, beaches, lakes and mountains by design, so the one claim no competitor can copy is unshipped. Once the owner has settled T201-a (harvested fare or labelled estimate for the flight leg), one task should join the remembered departure airport to the outdoors layers and put "how far from where you fly in, and what the leg costs" on the card and the page, as Part 13 of the destinations spec and item I1 of the trips spec describe. The owner also needs to decide whether that leg is worth building while every fare is an estimate. T202-a.

The vendor prices in the comparison are a 2026-10-02 snapshot. The two that govern the Trip Pass floor (TripIt trial length, Wanderlog monthly price) are repeated in the pricing.js header, and the comparison should be re-read whenever that header's "WHY THESE NUMBERS" block is next revised, or in twelve months, whichever is first. The comparison itself should move next to T201's positioning when T201-d carries both into PRODUCT.md; this task was not allowed to touch that file. T202-b.

## Rollback procedure

Delete Execution/P12/T202-competitive-positioning.md and remove the two T202 rows from Execution/_OPEN.md, or `git revert` the single commit on branch p12-competitive. No app, pipeline or data file changed.
