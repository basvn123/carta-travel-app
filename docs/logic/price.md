# Price logic (PRICE)

What a day, a stay, a flight, a car and a whole trip cost in Carta, and how every screen gets the same figure from one price request and one price configuration. Main code: `continent-app/src/lib/price/` (all files), `continent-app/config/pricing.json`, `continent-app/src/lib/stayPrice.js`, `continent-app/src/lib/flights/`, with the helpers they call in `continent-app/src/lib/costIndex.js`, `continent-app/src/lib/party.js` and `continent-app/src/lib/runtime_pricing.js`; pipeline `pipeline/pricing_config.py`, `pipeline/apply_food_prices.py`. HANDBOOK pointer: "## Prices and logistics" (docs/HANDBOOK.md). Last verified against the code: 2026-11-06 (T1132).

IDs are catalogue IDs only for now: the `// LOGIC: <ID>` / `# LOGIC: <ID>` tags in code and `scripts/docs/logic_check.py` are the second half of ROADMAP B3 and not yet done. Line numbers are as of 2026-11-06 and will drift; the constant name is the stable handle.

## Rules

### PRICE-001 One price configuration
- Decides: every number that moves a price comes from one file, so the app and the pipeline can never price the same thing two ways; a typo in a key stops the build instead of pricing with nothing.
- Rule: `rule(key)` returns `pricing.json` `rules[key].value` and throws on an unknown key (app); `rule(key)` raises `KeyError` (pipeline). Each rule carries value, unit, kind, source, date, review date and a test file. No price module may keep a number of its own (invariant V13).
- Constant: `rule` in `continent-app/src/lib/price/config.js:16`
- Constant: `rule` in `pipeline/pricing_config.py:25`
- Test: `continent-app/tests/priceConfig.test.mjs` :: "V13: an unknown rule fails loudly"
- Test: `continent-app/tests/priceConfig.test.mjs` :: "V13: every rule has a value, unit, kind, source, date, review date and a test that exists"
- Test: `continent-app/tests/priceConfig.test.mjs` :: "V13: no price module keeps a number of its own"

### PRICE-002 The default price request
- Decides: what every price assumes before the traveller chooses anything (owner decision B5).
- Rule: 2 adults, 0 children, 0 babies; stay `home` (an entire place); the Easygoing lifestyle; `when` any time; 7 nights; transport `any`; bag `priority_10kg` (the 10 kg cabin bag; the planner's word for it is `priority`); view `pp`; nothing excluded; no activities. A choice that is not in the request must not move a price anywhere.
- Constant: `DEFAULT_PRICE_REQUEST` in `continent-app/src/lib/price/request.js:47`
- Constant: `request.default_nights` in `continent-app/config/pricing.json:377` = 7
- Constant: `request.default_bag` in `continent-app/config/pricing.json:386` = "priority_10kg"
- Constant: `PLANNER_BAG` in `continent-app/src/lib/price/request.js:37` = "priority"
- Test: `continent-app/tests/priceEngine.test.mjs` :: "B5: the default request is two people, an entire place, Easygoing, any time"
- Test: `continent-app/tests/priceTrip.test.mjs` :: "the planner's bag is the app's bag tier"

### PRICE-003 Date modes never mix, and the nights
- Decides: whether a bed and a flight are priced for the traveller's exact days, a month, or the year.
- Rule: `when.kind` is `exact` (own dates with a valid pair), `month` (the Explore month filter wins app-wide while on, B7; `ym` is the depart month when it matches, else the next occurrence of that month from today, this month counting) or `any`. The bed reads `start` only in `exact` and `month` only in `month` (`costChoices`). Nights are the date pair's nights in every mode (at least 1), else 7. `atDates` re-prices a request at a screen's own exact dates (a day planner stop).
- Constant: `priceRequest`, `nextYm`, `atDates`, `costChoices` in `continent-app/src/lib/price/request.js:79`, `:66`, `:119`, `:147`
- Test: `continent-app/tests/priceEngine.test.mjs` :: "V7: a month or any time never reads an exact date, for the bed or the flight"
- Test: `continent-app/tests/priceEngine.test.mjs` :: "B7: the Explore month filter wins over the traveller's dates while it is on"

### PRICE-004 Party limits and seats
- Decides: how many people a price can hold and who takes a seat.
- Rule: seats = adults + children (at least 1); babies sit on a lap, take no seat and no bed. App party (`partyOf`): seats default 2, clamped 1 to 20; children 0 to seats minus 1; babies 0 to 4. Planner (`quoteTrip`, `tripRequest`): adults 1 to 20, children and babies clamped to the seats left under 20.
- Constant: `party.limits` in `continent-app/config/pricing.json:349` = { default_seats: 2, max_seats: 20, max_babies: 4 }
- Constant: `partyOf` in `continent-app/src/lib/party.js:28`; `seatsOf` in `continent-app/src/lib/price/request.js:133`; `MAX_PARTY` in `continent-app/src/lib/price/trip.js` (from `party.limits.max_seats`)
- Test: `continent-app/tests/priceConfig.test.mjs` :: "T691: one group cap and one baby cap"
- Test: `continent-app/tests/priceEngine.test.mjs` :: "one group: children count apart, babies take no seat (lib/party.js)"
- Test: `continent-app/tests/tripTotal.test.mjs` :: "the party is capped where the planner caps it"

### PRICE-005 Child and baby shares
- Decides: children eat less and pay less for trains and buses; planes charge a child the full fare.
- Rule: food share a seat = (adults + 0.6 x children + 0.15 x babies) / seats (`foodShare`); ticket share a seat = (adults + 0.5 x children) / seats (`ticketShare`). The food line and the local transport line take these shares; flights do not.
- Constant: `party.shares` in `continent-app/config/pricing.json:327` = { child_food: 0.6, baby_food: 0.15, child_ticket: 0.5 }
- Constant: `foodShare`, `ticketShare` in `continent-app/src/lib/party.js:36`, `:42`
- Test: `continent-app/tests/priceTrip.test.mjs` :: "children pay the configured shares, the same on a stop as on the day price"
- Test: `continent-app/tests/tripTotal.test.mjs` :: "children take a bed, eat their share and ride at their fare; babies take no bed and eat theirs"

### PRICE-006 Lifestyle presets
- Decides: how often the traveller eats out, drinks, goes clubbing and cooks, which moves the food figure and the band cut points.
- Rule: per week (coffees per day), dinners / lunches / fast food / drinks / club nights / coffees / self-catered days: Backpacker 1/3/4/4/0/0/5; Easygoing (default) 5/4/2/7/1/1/2; Foodie 7/5/0/5/0/1/0; Cafe & culture 3/5/1/3/0/1/2; Nightlife 3/2/4/12/3/1/1; Family 2/4/3/2/0/1/5. A club night is the entry plus 3 cocktails.
- Constant: `lifestyle.default` in `continent-app/config/pricing.json:230`; `lifestyle.profiles` in `:248`; `lifestyle.club_drinks_per_night` in `:318` = 3
- Constant: `DEFAULT_LIFESTYLE`, `CLUB_DRINKS_PER_NIGHT` in `continent-app/src/lib/runtime_pricing.js:35`, `:38`
- Test: `continent-app/tests/tripPrice.test.mjs` :: "the habits run from the thriftiest preset to the most generous"
- Test: `continent-app/tests/priceGolden.test.mjs` :: "the baseline: every screen, every request, in cents (V10)"

### PRICE-007 Food and drink a day
- Decides: the food line on every card, page, trip and day plan.
- Rule: with periods = nights / 7 (weekly cadence; nights for a daily cadence): dinners x meal_mid + lunches x meal_cheap + fast food x fastfood + drinks x drink_out + self-catered days x grocery_day + club nights x (club_entry + 3 x cocktail), each times periods, plus coffees a day x nights x coffee; each part rounded to cents. The day food is that total for 1 night times the party's food share. No `costs` block or a total of 0 gives no food price, never a zero.
- Constant: `groundSpendPerPerson` in `continent-app/src/lib/runtime_pricing.js:255`; `foodPerDay` in `continent-app/src/lib/costIndex.js:202`
- Test: `continent-app/tests/priceEngine.test.mjs` :: "the food breakdown sums to the food line"
- Test: `continent-app/tests/priceGolden.test.mjs` :: "the baseline: every screen, every request, in cents (V10)"

### PRICE-008 Stay tiers, what a town offers, and the fallback
- Decides: which stay types a place can price, and what the traveller gets when the chosen one is not there.
- Rule: tiers cheapest first: dorm, private, room, home, hotel2, hotel3, hotel4, hotel5; old ids hotel, bnb_home, bnb_room read as hotel3, home, room; an unknown id reads as home. A tier is offered only with an annual rate and no supply flag against it (`hostel` false drops dorm, `hotel` false drops every hotel, `hotel5` false drops hotel5, `bnb` false drops home and room). A tier not offered falls back to home, else the first offered, and says so (`fallback`, `tierFallback`).
- Constant: `STAY_TIERS`, `normaliseTier`, `tiersAt` in `continent-app/src/lib/stayPrice.js:36`, `:55`, `:73`
- Test: `continent-app/tests/stayPrice.test.mjs` :: "tiers: aliases, and a town only offers what it has"
- Test: `continent-app/tests/stayPrice.test.mjs` :: "a tier the town cannot price falls back to the entire place and says so"

### PRICE-009 Bed units for the party
- Decides: how many beds, rooms or places a party books.
- Rule: dorm: one bed a sleeper, a child weighs 0.5 bed (adults + ceil(children x 0.5)); rooms (private, room, hotels): ceil(people / 2); entire place: the smallest measured place in caps 2, 4, 6, 8 that sleeps the group, else the largest, booked ceil(people / cap) times. One traveller in a hotel pays base x min(1, single.hotel) where a single-room ratio was measured.
- Constant: `stay.people_per_room` in `continent-app/config/pricing.json:33` = 2
- Constant: `stay.dorm_child_weight` in `continent-app/config/pricing.json:42` = 0.5
- Constant: `stay.home_caps` in `continent-app/config/pricing.json:19` = [2, 4, 6, 8]
- Constant: `nightFor`, `homeBucket` in `continent-app/src/lib/stayPrice.js:138`, `:88`
- Test: `continent-app/tests/stayPrice.test.mjs` :: "rooms are sized to the party; a dorm is per bed; a solo hotel guest gets the single rate"
- Test: `continent-app/tests/priceEngine.test.mjs` :: "V6 (bed): a bigger party never pays more a head, unless it needs another room or a bigger place"

### PRICE-010 Night by night: month, weekend and peak weeks
- Decides: a stay in August costs more than one in November, and a Saturday or Christmas night more than a Tuesday.
- Rule: each night takes its own month's measured price (an entire place scales the 4-sleeper curve to the chosen size), else the annual median. With a date, a Friday or Saturday night (UTC weekday 5, 6) is multiplied by the place's weekend factor when above 1; a night in a peak window by its measured peak factor when above 1. Peaks: Christmas 12-23 to 01-01, mid August 08-12 to 08-17, Easter Sunday minus 3 to plus 1 day. Without dates: the month (Explore filter) or the annual figure.
- Constant: `stay.weekend_nights` in `continent-app/config/pricing.json:60` = [5, 6]
- Constant: `stay.peaks` in `continent-app/config/pricing.json:72` = { xmas: 12-23 to 01-01, aug15: 08-12 to 08-17, easter: 3 days before, 1 after }
- Constant: `nightFor`, `peakOf` in `continent-app/src/lib/stayPrice.js:138`, `:115`
- Test: `continent-app/tests/stayPrice.test.mjs` :: "a night takes its own month: August is dearer than November"
- Test: `continent-app/tests/stayPrice.test.mjs` :: "a stay across 31 July pays July and August, night by night"
- Test: `continent-app/tests/stayPrice.test.mjs` :: "weekend and peak factors apply on their nights only"

### PRICE-011 Entire-place fees
- Decides: an entire place carries cleaning and service fees and a weekly discount; a hotel does not.
- Rule: for tier home and nights above 0: 7 nights or more take 8% off the lodging; cleaning = 0.5 x one annual night for the party's size; service = 14% x (lodging + cleaning). A `fees` argument overrides the defaults key by key. Per person per night = total / heads / nights.
- Constant: `stay.fees` in `continent-app/config/pricing.json:5` = { service_fee_pct: 14, cleaning_fee_frac_of_night: 0.5, weekly_discount_pct: 8, min_nights_for_weekly: 7 }
- Constant: `DEFAULT_FEES`, `bedPrice` in `continent-app/src/lib/stayPrice.js:47`, `:197`
- Test: `continent-app/tests/stayPrice.test.mjs` :: "an entire place is sized to the group and carries Airbnb's fees; a hotel does not"
- Test: `continent-app/tests/stayPrice.test.mjs` :: "one stay, one price: the Explore card times the nights is the planner's Beds line"

### PRICE-012 Bed sanity bounds
- Decides: a broken harvest (a zero, a typo) is not shown as a bargain or a fortune.
- Rule: a bed per person per night outside its tier's bounds is rejected: dorm EUR 6 to 150, hotel5 EUR 6 to 900, every other tier EUR 6 to 500.
- Constant: `stay.bounds_pp_night` in `continent-app/config/pricing.json:94` = { dorm: [6, 150], hotel5: [6, 900], default: [6, 500] }
- Constant: `BOUNDS`, `inBounds` in `continent-app/src/lib/costIndex.js:78`
- Test: `continent-app/tests/priceEngine.test.mjs` :: "the country repair: a bed outside its bounds borrows its country's median, marked"

### PRICE-013 Country repair of an out-of-bounds bed
- Decides: a scraped bed that failed the bounds shows its country's typical figure, labelled as borrowed; a place the scrape never reached shows no bed price ("Not available yet").
- Rule: only a bed with `outOfBounds` borrows; it takes the median (the upper middle value, `arr[len >> 1]`) of its country's in-bounds beds for the same tier, party, dates and nights; `stayLevel` becomes `region`, `stayRepaired` true, source fields null. Medians are cached per catalogue and request (cleared above 24 requests) and drop when a stays file arrives.
- Constant: `stay.repair` in `continent-app/config/pricing.json:116` = { method: "country_median_same_request" }
- Constant: `countryStayMedians`, `costRow` in `continent-app/src/lib/costIndex.js:253`, `:337`
- Test: `continent-app/tests/priceEngine.test.mjs` :: "the country repair: a bed outside its bounds borrows its country's median, marked"

### PRICE-014 Thin bed
- Decides: a bed price that rests on few scraped listings says "few listings measured"; the figure does not move.
- Rule: thin when the tier's observation count `src[tier].n` is 2 or fewer; unknown is not thin. The destination calculator's stay line inherits the flag.
- Constant: `stay.thin_obs` in `continent-app/config/pricing.json:51` = 2
- Constant: `THIN`, `isThin` in `continent-app/src/lib/price/priceDay.js:34`, `:41`
- Test: `continent-app/tests/priceThin.test.mjs` :: "the rule: 2 observations or fewer is thin, unknown is not"
- Test: `continent-app/tests/priceThin.test.mjs` :: "the bed line is thin at 2 observations, not at 3, and the figure is unchanged"
- Test: `continent-app/tests/priceThin.test.mjs` :: "the card's stay line inherits thin; a well measured bed carries no flag"

### PRICE-015 The day price and its lines
- Decides: the headline "a day costs a person" figure on cards, pins and the place page.
- Rule: lines bed, food, transport, car, activities, events, each with `status` (included, optional, not_included, excluded), `eur` a person a day in whole cents and `quality` (measured, modelled, missing). Bed is measured only when its level is city and not repaired; food is measured when its level is city. `dayEur` = sum of included lines, and null when any included line has no figure (never counted as zero). Car hire is never in the day (status not_included; a hire is a trip choice). Activities and events are optional and off. Total for any stay = dayEur x seats x nights.
- Constant: `linesOf`, `answer`, `bedQuality` in `continent-app/src/lib/price/priceDay.js:98`, `:134`, `:43`
- Test: `continent-app/tests/priceEngine.test.mjs` :: "V3: the lines add up; the day is the total over the seats and the nights"
- Test: `continent-app/tests/priceEngine.test.mjs` :: "an item without data is missing, never zero (rule 8)"
- Test: `continent-app/tests/priceEngine.test.mjs` :: "T702: a car hire is never in the day, going by car or not"
- Test: `continent-app/tests/priceEngine.test.mjs` :: "the catalogue map and a single place agree to the cent"

### PRICE-016 Switched-off items
- Decides: a part the traveller switches off leaves the total; switching it back gives the reference amount.
- Rule: `excluded` holds only known items (bed, food, transport, car, activities, events, flight); an excluded line keeps its figure but gets status excluded and leaves `dayEur` and every receipt built from it.
- Constant: `PRICE_ITEMS` in `continent-app/src/lib/price/request.js:32`
- Test: `continent-app/tests/priceEngine.test.mjs` :: "an excluded item leaves the sum and is marked, never deleted (rule 9)"
- Test: `continent-app/tests/priceDisplay.test.mjs` :: "V9: an item switched off and on again gives back the reference amount, and the amount is the sum of the items that are on"
- Test: `continent-app/tests/priceDisplay.test.mjs` :: "rule 9: the switched-off items are a setting with a URL key and only known items count"

### PRICE-017 Local transport a day
- Decides: getting around town joins the day price once a place has a fare.
- Rule: only euro fares count. Adult day = min(ride_eur x rides, day_pass_eur), either alone when only one exists; rides a day by place class metro 3, city 2, town 1, village 1, area 1 (unknown class as town). A seat pays adult day x ticket share. No fare: eur null, quality missing, status not_included, so the day is bed and food.
- Constant: `transport.rides_per_day` in `continent-app/config/pricing.json:362` = { metro: 3, city: 2, town: 1, village: 1, area: 1 }
- Constant: `transportLine` in `continent-app/src/lib/price/priceDay.js:78`
- Test: `continent-app/tests/priceTransport.test.mjs` :: "without a fare the line is missing and the day is bed and food (rule 8)"
- Test: `continent-app/tests/priceTransport.test.mjs` :: "with a fare the day holds it: rides by kind of place, capped by a day pass"
- Test: `continent-app/tests/priceTransport.test.mjs` :: "children ride at their ticket share"

### PRICE-018 The five price bands
- Decides: the word beside a price (Very cheap, Cheap, Mid-priced, Pricey, Very pricey) and the map colour.
- Rule: band = the first cut the figure is below (cut x scale), else 4. Cuts a person a day: day 65 / 80 / 100 / 125, stay 22 / 30 / 40 / 55, food 40 / 50 / 62 / 78. Scales: food = refDayFood(lifestyle) / refDayFood(default) at the frozen reference prices; stay = ref_stay[tier] / ref_stay.home (31.25); day = the two blended at food's default share, foodRef / (foodRef + 31.25); each clamped to 0.25 to 4.
- Constant: `bands.cuts` in `continent-app/config/pricing.json:127`
- Constant: `bands.ref_prices` in `continent-app/config/pricing.json:155` = { meal_mid 32.8, meal_cheap 15, fastfood 10, drink_out 5, cocktail 12, coffee 3.45, grocery_day 12.42, club_entry 11.08 }
- Constant: `bands.ref_stay` in `continent-app/config/pricing.json:173` = { home 31.25, dorm 28.98, private 38.81, room 36, hotel 50, hotel2 40, hotel3 50, hotel4 70, hotel5 120 }
- Constant: `bands.scale_clamp` in `continent-app/config/pricing.json:192` = [0.25, 4]
- Constant: `bandFor`, `bandScale`, `refDayFood` in `continent-app/src/lib/costIndex.js:160`, `:149`, `:131`
- Test: no test

### PRICE-019 Price feel on Eat and drink
- Decides: whether eating out at a place reads cheaper or dearer than usual, and which items stand out.
- Rule: each priced food item gets ratio = price / frozen catalogue median minus 1. More than 10% off is cheaper or dearer; at most 4 such items, furthest first, then cheapest to dearest; within 10% is "about usual". A bar fills its half width at 50% off. Fewer than 3 priced items shows the verdict only. Verdict = the food band at the traveller's lifestyle; the pin sits at (band + 0.25 + frac x 0.5) / 5, where `bandPos` lets the open end bands borrow their neighbour's width.
- Constant: `bands.feel` in `continent-app/config/pricing.json:216` = { gap: 0.1, rows: 4, min_items: 3, reach: 0.5 }
- Constant: `priceFeel`, `bandPos` in `continent-app/src/lib/costIndex.js:398`, `:171`
- Test: `continent-app/tests/priceFeel.test.mjs` :: "T1018: Rome splits into cheaper, dearer and about usual"
- Test: `continent-app/tests/priceFeel.test.mjs` :: "T1018: the verdict is the Explore card's food band"
- Test: `continent-app/tests/priceFeel.test.mjs` :: "T1018: the pin stays inside the scale at both open ends"
- Test: `continent-app/tests/priceFeel.test.mjs` :: "T1018: no prices, no feel; no food day, no verdict"

### PRICE-020 Per person or total view
- Decides: whether prices read a person a day or for the whole group and stay; filters and sorts keep the same places in the same order either way.
- Rule: the engine prices per person per day; the total view only multiplies: a day figure x seats x nights, a way there x seats; whole cents; null stays null.
- Constant: `viewFactor`, `wayFactor`, `shownDay`, `shownWay` in `continent-app/src/lib/price/display.js:21`, `:33`
- Test: `continent-app/tests/priceDisplay.test.mjs` :: "V16: the total is the per-person figure times the group (and the nights for a day), to the cent"
- Test: `continent-app/tests/priceDisplay.test.mjs` :: "V15 and V16: a filter compares the shown figure with the shown threshold, and both views keep the same places in the same order"

### PRICE-021 Price notes and the day sentence
- Decides: when a price says "Bed price: few listings measured" or "Local transport: not yet measured", and which parts the short "includes" line names.
- Rule: `priceNotes(row | rows)`: thinBed when any row's bed line is thin; unmeasured = the transport line when its quality is missing and it is not excluded, once each over all rows; a row without lines says nothing; notes never move a number. The day sentence names every included line with an amount among bed, food, transport, in line order (bed and food when there are no lines).
- Constant: `priceNotes` in `continent-app/src/lib/price/notes.js:16`; `unmeasuredParts`, `bedIsThin`, `includedParts` in `continent-app/src/lib/price/display.js:59`, `:66`, `:79`
- Test: `continent-app/tests/priceNotes.test.mjs` :: "the one rule: thin bed and the missing transport fare, once each, never invented"
- Test: `continent-app/tests/priceThin.test.mjs` :: "a fare removes the gap; a part the traveller switched off is not a gap"
- Test: `continent-app/tests/priceDisplay.test.mjs` :: "B11: the day sentence names the items that are in the price, from the engine's lines"

### PRICE-022 Do-prices (things to do)
- Decides: what an entry, a lift or a lido shows as its price.
- Rule: only euro records with a finite value of 0 or more count; any other currency is not converted and shows nothing. A zero shows "Free" only for sight, beach and activity; elsewhere a zero shows nothing. An unknown price is null (the page shows its placeholder), never "EUR 0".
- Constant: `FREE_IS_NEWS` in `continent-app/src/lib/price/doPrice.js:26` = { sight, beach, activity }
- Constant: `doPriceEur`, `doPriceOf` in `continent-app/src/lib/price/doPrice.js:19`
- Test: `continent-app/tests/pricePlace.test.mjs` :: "V11: a do-price record reads as euros, free or nothing"
- Test: `continent-app/tests/pricePlace.test.mjs` :: "V11: a thing to do never says EUR 0"

### PRICE-023 The destination calculator total
- Decides: the trip total on the place page's price card ("What a day costs").
- Rule: nights and people whole and at least 1. Way there, first that applies: a picked train, bus or car (`way.total`, estimate), a typed fare above 0 (the traveller's own, never an estimate), Carta's swept return (`carta.total`). Then stay = bed x nights x people and food = food x nights x people (unless excluded; estimate unless the level is city), the included car and local transport lines x nights x people, switched-on activities = sum x people. Each line rounded to cents; total = sum of the rounded lines; `each` = total / people only when people > 1. Null when the row has no bed or no food figure.
- Constant: `quoteNights` in `continent-app/src/lib/price/nights.js:47`
- Test: `continent-app/tests/destPrice.test.mjs` :: "the total is the day figure times the nights and the party"
- Test: `continent-app/tests/destPrice.test.mjs` :: "the total is the sum of the rounded lines"
- Test: `continent-app/tests/destPrice.test.mjs` :: "a typed fare is added first, as the traveller's own figure"
- Test: `continent-app/tests/destPrice.test.mjs` :: "a picked way there stands where the flight would (T1026)"
- Test: `continent-app/tests/destPrice.test.mjs` :: "a row without a bed or a food figure prices nothing"
- Test: `continent-app/tests/priceTransport.test.mjs` :: "V9: an activity switched on adds exactly its price times the party; off is the reference"

### PRICE-024 The flight follows the bed's date mode
- Decides: Explore's card and the place page price the same return flight for one request.
- Rule: no flight when the destination airport is the home airport. Exact: the swept leg nearest each date (PRICE-026), home after out. Month: the cheapest return of that month (PRICE-027). Any: the cheapest return over every month. The quote is both legs' `legCost` for the paying seats with the request's bag (default `priority_10kg`); `checked` is the older leg's check time.
- Constant: `flightLegs`, `flightQuote` in `continent-app/src/lib/price/flight.js:15`, `:29`
- Test: `continent-app/tests/priceEngine.test.mjs` :: "V7: a month or any time never reads an exact date, for the bed or the flight"

### PRICE-025 Fare freshness
- Decides: a stale fare is never shown as current.
- Rule: a swept fare is ignored when older than: 5 days for a date up to 14 days ahead, 16 days for later dates, 32 days for dates more than 181 days ahead.
- Constant: `flights.max_age_days` in `continent-app/config/pricing.json:1038` = { near: 5, far: 16, far_after_days: 14, late: 32, late_after_days: 181 }
- Constant: `maxAgeMs` in `continent-app/src/lib/flights/flights.js:39`
- Test: `continent-app/tests/flights.test.mjs` :: "a price older than its sweep cycle is never shown: 5 days near, 16 days far (T692, T780)"
- Test: `continent-app/tests/flights.test.mjs` :: "a late date (past day 181, from the box every 4 weeks) may be 32 days old (T798)"
- Test: `continent-app/tests/flights.test.mjs` :: "a fare at day 300, from the late tier's last weeks, is kept and found near its day (T805)"

### PRICE-026 The swept day nearest a wanted day
- Decides: which day's fare stands for the traveller's date; the screen shows the leg's own date.
- Rule: search outward 0, then minus 1 and plus 1, up to 4 days either side; at the first distance with a fresh leg, take the cheaper; a way home must fall after the way out's date. None within 4 days: null.
- Constant: `flights.nearest_day_spread` in `continent-app/config/pricing.json:1053` = 4
- Constant: `sweptNear` in `continent-app/src/lib/flights/flights.js:245`
- Test: `continent-app/tests/flights.test.mjs` :: "near the wanted day: the cheapest within four days, with its own date"
- Test: `continent-app/tests/flights.test.mjs` :: "T1019: near the dates, the way home is still after the way out"

### PRICE-027 The cheapest return in a month or any time
- Decides: the "from" flight price for a month or for whenever is cheapest.
- Rule: the cheapest pair with the way out in the month and the way home in that month or the next, home strictly after out; per way out the cheapest later way home, the earliest of equal prices; of equal pair prices, the shorter trip. Any time: the cheapest such pair over every month the file holds.
- Constant: `cheapestReturn`, `cheapestReturnAnyMonth` in `continent-app/src/lib/flights/flights.js:189`, `:219`
- Test: `continent-app/tests/flights.test.mjs` :: "the cheapest return in a month"
- Test: `continent-app/tests/flights.test.mjs` :: "T1019: the cheapest return never flies home before it flies out"
- Test: `continent-app/tests/flights.test.mjs` :: "T1019: of equal prices, the shorter trip"

### PRICE-028 Live first, then swept, within hours and preferences
- Decides: which flight the planner prices for an exact day.
- Rule: with a live answer, the first flight in rank order (PRICE-029) that fits the hours band and the trip's preferences; a live answer with no flights at all means no flight (null). Otherwise the swept leg of that day if it fits; a day searched with no flight is null; a day not searched or stale is unknown. Hours bands: any 0 to 24, morning 5 to 12, midday 12 to 17, evening 17 to 24. Preferences: direct only drops flights with a stop; after / before whole hours bound the departure.
- Constant: `HOURS` in `continent-app/src/lib/flights/flights.js:45`; `fitsPrefs`, `sweptDay`, `pickLeg` in `:59`, `:82`, `:141`
- Test: `continent-app/tests/flights.test.mjs` :: "live beats swept, and the hours filter picks inside the window"
- Test: `continent-app/tests/flights.test.mjs` :: "hours bands"
- Test: `continent-app/tests/flights.test.mjs` :: "a swept day is a leg, a searched day with no flight is null, an unsearched one undefined"
- Test: `continent-app/tests/changeFlight.test.mjs` :: "fitsPrefs: direct only, and a departure window in whole hours"

### PRICE-029 Flight rank: price, balanced, comfort
- Decides: whether the planner picks the cheapest flight or a direct one at a decent hour.
- Rule: score = fare + stops x stop cost + (unsocial ? hour cost : 0); price 0 / 0 (arrival order kept), balanced EUR 35 a stop and EUR 25 an unsocial hour, comfort EUR 120 and EUR 70; ties keep the cheaper. Unsocial: departs before 07:00 or from 22:00, or lands before 06:30 or from 23:30.
- Constant: `RANK_COST` in `continent-app/src/lib/flights/flights.js:115` = { price: 0/0, balanced: 35/25, comfort: 120/70 } (inline, not in pricing.json)
- Constant: `unsocial` in `continent-app/src/lib/flights/flights.js:108`
- Test: `continent-app/tests/flights.test.mjs` :: "rankFlights: price keeps the cheapest, comfort takes the direct flight at a decent hour"

### PRICE-030 Leg cost and bag fees
- Decides: what one flight leg costs the party, bags included.
- Rule: leg = fare x paying seats + bag fee x paying seats; perSeat = fare + bag. Bag keys: priority_10kg, priority, cabin10 are the cabin tier; checked_20kg, checked, checked20 the checked tier; anything else no bag (0). Fee a person a direction: the airline's row (FR 20/35, W6 25/35, U2 15/30, VY 18/25, V7 15/25, HV, TO, DY, EW, BT 15/30, PC 0/25, LS 0/40, XQ 0/30, 4U 0/30); a full-service airline (SN, KL, AF, LH, BA and 25 more) 0 cabin and 35 checked; an unknown airline 0 with `known` false ("bags may cost extra").
- Constant: `flights.bag_fees` in `continent-app/config/pricing.json:1077` (airlines table, full_service_checked = 35)
- Constant: `FULL_SERVICE`, `bagTier`, `bagFee` in `continent-app/src/lib/flights/bagFees.js:26`, `:33`, `:44` (the full-service list is inline)
- Constant: `legCost` in `continent-app/src/lib/flights/flights.js:164`
- Test: `continent-app/tests/flights.test.mjs` :: "bags: per person per way, by airline, full-service cabin bag included"
- Test: `continent-app/tests/priceConfig.test.mjs` :: "T691: one default bag, priced the same by every flight helper"

### PRICE-031 Baby lap fee
- Decides: babies fly on a lap for a small fee.
- Rule: EUR 30 a baby a leg. In the planner it is added to each priced leg (`cost.lap`); on Explore a return seat carries it spread over the seats: perSeat + babies x 30 x 2 / seats (`flightPerSeat`).
- Constant: `party.baby_lap_fee_leg` in `continent-app/config/pricing.json:340` = 30
- Constant: `BABY_LAP_FEE_LEG`, `flightPerSeat` in `continent-app/src/lib/party.js:20`, `:48`; lap in `continent-app/src/lib/price/trip.js:287`
- Test: `continent-app/tests/recommendFlight.test.mjs` :: "babies fly on a lap for the configured fee a leg (row T713-a)"

### PRICE-032 Flight answer caches
- Decides: how long a live search is reused and when a flight file is fetched again.
- Rule: a live answer for one origin, destination and date is shared by every screen for 10 minutes; a failed search is not kept (the planner falls back to the swept price). A home airport's swept file is fetched once per origin per session (only a three-letter code) and forgotten on failure so the next switch retries; the airline index is read once.
- Constant: `HOLD_MS` in `continent-app/src/lib/flights/useLiveFlights.js:11` = 10 minutes (inline)
- Constant: `loadFlightFile` in `continent-app/src/lib/flights/flightData.js:35`
- Test: no test

### PRICE-033 Car hire
- Decides: what a hire car adds to a trip.
- Rule: rate a car a day = `car.rental_by_country[iso2]` else 39, times the start month's seasonality (no date: 1); total = rate x days x cars, cars = ceil(party / 4); 7 days or more take 15% off. The day price carries it a person a day but never includes it (PRICE-015); the planner adds it only for transport car hire (days = max(1, planned nights), cars count babies); Places adds it to a plane trip only where `car_needed`.
- Constant: `car.model` in `continent-app/config/pricing.json:395` = { rental_eur_per_day_default: 39, rental_weekly_discount_pct: 15, car_capacity: 4, rental_seasonality: Jan 0.85, Feb 0.85, Mar 0.9, Apr 0.95, May 1.05, Jun 1.15, Jul 1.25, Aug 1.25, Sep 1.1, Oct 0.98, Nov 0.88, Dec 0.9 }
- Constant: `car.rental_by_country` in `continent-app/config/pricing.json:1237`
- Constant: `rentalEstimate`, `carHire` in `continent-app/src/lib/price/car.js:27`; `needHire` in `continent-app/src/lib/price/compose.js:24`
- Test: `continent-app/tests/priceTrip.test.mjs` :: "V6 (car): a hire for seven is two cars, and the car is in the trip only when hired"
- Test: `continent-app/tests/priceEngine.test.mjs` :: "V6 (car): a bigger party never pays more a head for the car, unless it fills another car"

### PRICE-034 The trip total
- Decides: the planner's grand total and its per-person figure.
- Rule: parts, each rounded to cents: travel (what was typed for there and home), flights (Carta's legs not typed, bags and lap fees in), airport (home to the airport and back, only when a leg is priced or typed), transfers (runway to bed and back plus a named arrival), drive (own car, legs not typed), between (stop to stop), car (hire plus vignettes), daytrips, beds, days. grandTotal = sum of parts; perPerson = grandTotal / (adults + children). The trip keeps its own price request (`tripRequest`) so a saved trip prices again for the question it was planned with.
- Constant: `quoteTrip` in `continent-app/src/lib/price/trip.js:129`; `parts`, `grandTotal` at `:560`, `:584`; `tripRequest` in `continent-app/src/lib/price/stay.js:27`
- Test: `continent-app/tests/tripTotal.test.mjs` :: "the receipt lines always add up to the total, across the budget matrix"
- Test: `continent-app/tests/priceTrip.test.mjs` :: "a saved trip keeps its own request"

### PRICE-035 A stop in a trip
- Decides: a stop costs what the place page says for the same question, times the seats and nights.
- Rule: each stop is the day price at the stop's own arrival and departure dates: accomTotal = bed x nights x seats, groundTotal = (food + included local transport) x nights x seats. A 0-night pass-through stop costs nothing. A stop's own stay tier prices only that stop's beds. A bed typed as paid replaces Carta's bed for that stop and keeps the days.
- Constant: `quoteStay` in `continent-app/src/lib/price/stay.js:51`; `stayCosts` in `continent-app/src/lib/price/trip.js`
- Test: `continent-app/tests/priceTrip.test.mjs` :: "V1 (trip): a stop costs the destination page's day, times the nights and the seats"
- Test: `continent-app/tests/priceTrip.test.mjs` :: "a pass-through stop costs nothing"
- Test: `continent-app/tests/stayPerStop.test.mjs` :: "a stop's own stay type prices that stop's beds only"
- Test: `continent-app/tests/tripTotal.test.mjs` :: "an own price for a bed replaces the bed estimate and keeps the days"

### PRICE-036 Typed money
- Decides: how a fare, a ticket or a bed the traveller typed is read.
- Rule: "120,50" and "120.50" read as 120.5; blank, zero, negative or not a number reads as 0 (not typed); capped at EUR 99,999 and rounded to cents. An own price for a hop between stops (fly, ferry, train, bus, car) replaces Carta's estimate for that mode and keeps the other modes priced.
- Constant: `paidEur` in `continent-app/src/lib/price/trip.js:59`; `OWN_LEG_MODES` in `continent-app/src/lib/price/trip.js`
- Test: `continent-app/tests/tripTotal.test.mjs` :: "money typed with a comma or as text reads as euros, blanks as nothing"
- Test: `continent-app/tests/tripTotal.test.mjs` :: "an own price for a leg replaces Carta's estimate, never adds to it"

### PRICE-037 Carta's flight in a trip
- Decides: which flight and which home airport the planner prices, and when Carta's fare stays out.
- Rule: no Carta flight for an own-car trip, a typed total covering both ways, a flight the traveller booked, or an own trip by train, bus, ferry or car; a direction typed on its own leaves only that direction out. A held leg (the traveller's pick, else the trip finder's priced leg) prices its direction when it matches the trip's day and home airport and fits the hours and preferences; else `pickLeg`. Home airport: the pinned one, else the cheapest fully priced door to door (fare plus the way to the airport with parking), else the first airport the sweep covers, else the nearest.
- Constant: `heldLeg` in `continent-app/src/lib/price/trip.js:111`; `cartaFlight` at `:242`; home airport pick at `:306`
- Test: `continent-app/tests/tripTotal.test.mjs` :: "a fare the traveller typed is in the total once, as theirs"
- Test: `continent-app/tests/finderFlightHold.test.mjs` :: "T855: a held leg holds only its own day and home; a pick beats the finder's leg; its airport wins"
- Test: `continent-app/tests/doorToDoor.test.mjs` :: "the finder flies from the cheapest ticked airport door to door, the way there in the flight's figure"
- Test: `continent-app/tests/doorToDoor.test.mjs` :: "without the reach answered nothing moves: one origin, no way-to-the-airport line"

### PRICE-038 Getting around in a trip
- Decides: what hops between stops, day trips, airport transfers, the own-car drive and vignettes add.
- Rule: train, bus, ferry and public fares are scaled by the party's ticket share; cars and taxis are not. A day trip is the hop there and back (2 x the chosen mode); a place with no ground route prices nothing. A runway transfer with no measured km is estimated at 42 km an hour of transfer time, else EUR 0.15 a km. A train, bus or ferry there takes no airport transfer. Own car there and home: each way is half the round-trip estimate, and a direction the traveller typed replaces only that half. Vignettes: one a car (ceil(seats / 4)) for every country a car hop touches, minus the first and last country for an own-car trip.
- Constant: `halfFor` in `continent-app/src/lib/price/trip.js:152`; `kmOf` at `:430` (42 km/h and 0.15 EUR/km inline); day trips at `:391`; vignettes at `:531`
- Test: `continent-app/tests/stayPerStop.test.mjs` :: "a day trip from a base is priced there and back in Getting around"
- Test: `continent-app/tests/tripTotal.test.mjs` :: "a train or a bus there takes no airport transfer"
- Test: `continent-app/tests/tripTotal.test.mjs` :: "an own car typed one way keeps Carta's drive estimate for the other"

### PRICE-039 The four cost tiles
- Decides: the trip's cost in four tiles that always add up to the total.
- Rule: Flights or Driving = travel + flights + airport (+ drive when driving); Getting around = transfers + between + car + daytrips (+ drive when flying); Stay = beds; Food = days. The travel tile is `missing` when a way there or home has no figure (not driving, not a legacy typed pair, nothing typed, no Carta cost, no typed own fare); a tile at 0 that is not missing is `empty` ("not needed"), never EUR 0.
- Constant: `costTiles`, `tileOfLine` in `continent-app/src/lib/price/tiles.js:14`
- Test: `continent-app/tests/costTiles.test.mjs` :: "tiles add up to the total: ${name}"
- Test: `continent-app/tests/costTiles.test.mjs` :: "no flight found marks the travel tile missing, never as a €0 price"
- Test: `continent-app/tests/costTiles.test.mjs` :: "a drive trip's first tile is driving and holds the drive"

### PRICE-040 The composed trip on Places
- Decides: what a place costs in the Places list and map for the traveller's dates and way there.
- Rule: stay = the day price at the dates x nights x group (null day: unpriced). Plane total = swept return for the group (bags in) + airport transfer (route `ground_eur` one way x 2 x group) + hire where `car_needed` + stay; without a fare the flight is left out and `flight` is null. Car = fuel and tolls there and back + stay. Mode: a chosen train or bus prices that way or nothing; `any` weighs the ways on door-to-door time and cost (`chooseWay`), and a route with no fare is picked only when nothing else reaches; `plane` falls back to the car when nothing flies, `car` falls back to the plane when not drivable.
- Constant: `quoteComposed` in `continent-app/src/lib/price/compose.js:54`; mode pick at `:133`
- Test: `continent-app/tests/wayChoice.test.mjs` :: "Places (any way): a route with no fare in the sweep is not the cheapest way by leaving the flight out"
- Test: `continent-app/tests/priceTrip.test.mjs` :: "V1 (trip): the composed Places trip and the calculator read the same day"

### PRICE-041 A stored draft prices like the planner
- Decides: the day planner and the trip planner show the same total for one draft.
- Rule: the draft's own stay tier wins over the app's; its eating habits hold while the app's Lifestyle is the one they were set against, else the app's (else the default); picked flights become live answers and win over a live answer for the same leg.
- Constant: `draftLifestyle`, `draftQuoteState` in `continent-app/src/lib/price/draftState.js:12`, `:24`
- Test: `continent-app/tests/draftState.test.mjs` :: "a pick wins over a live answer for the same leg"
- Test: `continent-app/tests/draftState.test.mjs` :: "the trip's own stay tier wins over the app's"
- Test: `continent-app/tests/draftState.test.mjs` :: "a finder trip's eating habits hold until the app's Lifestyle moves"

### PRICE-042 A typical night of a stay type
- Decides: the "a night costs about" figure for each stay type.
- Rule: the median over places (the trip's countries when given) of the engine's bed a person a night at that tier, any time of year, for the party (default 2 adults, 7 nights); places that fall back to another tier or have no bed are left out; null when none.
- Constant: `typicalNight` in `continent-app/src/lib/price/priceDay.js:208`
- Test: `continent-app/tests/stayTypes.test.mjs` :: "a typical night for the party, a person and for the group, narrowed by country"

### PRICE-043 Month rows, cheapest months and "a bed from"
- Decides: the month price bars, the two cheapest months to stay, the season shape and the "a bed from" fact.
- Rule: month rates are the tier's measured month prices, else the annual figure. Cheapest months: the two lowest of a complete 12-month measured curve (the tier, else hotel3, else the entire place), in month order. Season curve: only when at least 6 months were measured; each month over the year's mean (entire place, else hotel3, else the first). A bed from: the minimum of a dorm bed and half a private room, Airbnb room, 2 or 3 star room or 2-sleeper place, annual.
- Constant: `monthRates`, `cheapestMonths`, `seasonCurve`, `bedFromPerPerson` in `continent-app/src/lib/stayPrice.js:273`, `:286`, `:298`, `:263`
- Test: `continent-app/tests/stayPrice.test.mjs` :: "month rows and the cheapest months come from the measured curve"
- Test: `continent-app/tests/stayPrice.test.mjs` :: "a bed from: the cheapest per person of two"

### PRICE-044 Food prices per place (pipeline)
- Decides: each place's own dinner, lunch, fast food, beer, cocktail, coffee, groceries and club entry prices.
- Rule: price = country base x local tilt. Base: measured June 2026 country basket, or Europe reference x Eurostat price level, or a city-anchored blend, or the legacy basket; rolled to the latest month by the local HICP and exchange rate. Tilt per group (eat, chain, shop): income (ratio clipped 0.6 to 2.0) ^ 0.15 / 0.08 / 0.05; tourism hand-set premium, else top 5% of NUTS3 by tourist nights per km2 x1.08 eat, x1.04 chain, x1.02 shop, top 15% x1.04 / 1.02 / 1.01; size eat x1.06 at 1M people or more, x1.03 at 300k or more, x0.96 under 5k, shop x1.03 under 5k; receipts (shop only) 1 + (weighted median minus 1) x n / (n + 80) clipped 0.85 to 1.20, only with n of 40 or more within 15 km; product clipped 0.80 to 1.60. A place within 15 km of a measured city takes that city's rolled basket (level city); with no driver the level is country, else region. Meals, fast food, groceries, club entry and cocktail round to 0.1, beer and coffee to 0.01.
- Constant: `ELASTICITY`, `INC_CLIP`, `TOUR_DENSITY`, `SIZE`, `TILT_CAP`, `CITY_KM`, `RCPT_MIN`, `RCPT_PRIOR`, `RCPT_CLIP` in `pipeline/apply_food_prices.py:135` to `:146` (inline, not in pricing.json)
- Constant: `tilt_for`, `price_all`, `round_price` in `pipeline/apply_food_prices.py:388`, `:451`, `:180`
- Test: `tests/test_food_prices.py` :: "test_tilt_income_size_and_tourism"
- Test: `tests/test_food_prices.py` :: "test_tilt_is_capped"
- Test: `tests/test_food_prices.py` :: "test_receipts_need_enough_prices_and_shrink"
- Test: `tests/test_food_prices.py` :: "test_curated_premium_wins_over_density"
- Test: `tests/test_food_prices.py` :: "test_roll_follows_inflation_and_currency"
- Test: `tests/test_food_prices.py` :: "test_price_all_is_idempotent"

### PRICE-045 Food publish gate
- Decides: a monthly food run that would move a country's prices too far is stopped before it ships.
- Rule: per country, the median basket (the eight items summed) may move at most 25% against what the target holds, unless `pipeline/stays/gate_explain.json` lists `food:CC` with a new value within 2% of the result.
- Constant: `gate.food` in `continent-app/config/pricing.json:1301` = { jump: 0.25, tolerance: 0.02 }
- Constant: `FOOD_JUMP`, `FOOD_TOLERANCE`, `food_gate` in `pipeline/apply_food_prices.py:92`, `:93`, `:580`
- Test: `tests/test_price_gates.py` :: "test_food_basket_jump_is_blocked_unless_explained"

## Rules with no test

PRICE-018, PRICE-032

## HANDBOOK disagreements

| HANDBOOK says | Code does | Where |
|---|---|---|
| Day price lines carry `quality` `live`, `measured`, `modelled` or `missing` | The engine's lines are only `measured`, `modelled` or `missing`; no line is ever `live` (live stays were removed in T1074) | `continent-app/src/lib/price/priceDay.js:19` and `linesOf` (`:98`) |
| Entire-place fees: the pipeline's `meta.stays.fees` wins over the defaults | Only `computeCosts` with app choices passes it (`choices.accommodation_model`); the price engine builds its choices with `costChoices`, which drops it, so every engine price (`priceDay`, trips, cards) uses the `stay.fees` defaults | `continent-app/src/lib/price/request.js:147`, `continent-app/src/lib/costIndex.js:319` |
| Party limits: at most 4 babies, "one cap for every screen" | `partyOf` caps babies at 4, but the planner (`quoteTrip`) and `tripRequest` clamp babies only to the seats left under 20 | `continent-app/src/lib/price/trip.js` (party block), `continent-app/src/lib/price/stay.js:27` |
