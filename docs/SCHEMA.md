# app_data schema

Live master: `meta.schema_version` = 18. The `Schema vN` sections further down
are the additive changelog of layers (their numbering ran ahead of the meta
field; treat the sections as history, `meta.schema_version` as the contract).

CI reads this file. The version on the line above and the "Wire contract" table
at the end are checked against the shipped `public/app_data.json` by
`continent-app/scripts/ci/check-contract.mjs` (T082), so a renamed, added or
dropped top-level field fails the build until the table says so.

The pipeline and the React app share one contract. A trip is priced three ways,
all from real data:

1. **Getting there**, either the cheapest Ryanair round-trip for the chosen
   dates, OR (for destinations within `max_drive_km` road km of home and road-
   reachable) the fuel + tolls to drive there and back. The app lets you switch
   between the two; the map can be re-priced for either mode.
2. **Accommodation**, an Airbnb entire-home nightly estimate, adjusted for
   season, length-of-stay discount, and the cleaning + service fees a traveller
   actually pays.
3. **On-the-ground**, the user's lifestyle (dinners, casual meals, fast food,
   bar drinks, club nights, coffees, self-catered days) priced at the
   destination's real local rates.

A fourth layer, **a car at the destination**, is added when a destination needs
one (`local_transport.car_needed`) AND you arrive by plane: an economy rental,
scaled by nights and group size. If you drove there, you already have a car, so
no rental is added.

`run_pipeline.py` (the orchestrator, driving the scripts in `pipeline/`) writes
`app_data.json`; `continent-app/scripts/sync-data.mjs` splits it for the wire and
the app reads it via `runtime_pricing.js`. Cost data originally came from
notebook `03_costs` (Numbeo anchors + Eurostat PLI) and accommodation from
`03b_accommodation` (Inside Airbnb anchors + Eurostat PLI); those v1 notebooks
are archived in `archive/notebooks/`. Since schema v18 (T530-T536) the live
accommodation path is `pipeline/stays/` (see "Schema v18" below).

## app_data.json

```jsonc
{
  "meta": {
    "generated_at": "ISO-8601",
    "schema_version": 7,
    "currency": "EUR",
    "origins": ["BRU", "CRL"],
    "home_city": "Brussels",
    "home": { "lat": 50.8466, "lon": 4.3528 },
    "start_date": "2026-05-12",
    "end_date": "2026-08-31",
    "categories": ["city", "beach", ...],   // controlled vocabulary, for filters
    "defaults": {
      "group_size": 7,
      "trip_length_days": 7,
      "baggage": "priority_10kg",
      "lifestyle": {                          // per person; lifestyle slider starts
        "dinners_per_week": 5,
        "lunches_per_week": 4,
        "fastfood_per_week": 2,
        "drinks_per_week": 7,
        "club_nights_per_week": 1,
        "coffees_per_day": 1,
        "self_catered_days_per_week": 2
      }
    },
    "baggage_options": {
      "small":         { "label": "Small cabin (free)", "per_direction_eur": 0.0 },
      "priority_10kg": { "label": "10 kg priority",      "per_direction_eur": 25.0 },
      "checked_20kg":  { "label": "20 kg checked",       "per_direction_eur": 42.0 }
    },
    "cost_basket": {                          // item -> human label
      "meal_mid_eur":    "mid-range restaurant meal, per person",
      "meal_cheap_eur":  "inexpensive restaurant meal, per person",
      "fastfood_eur":    "fast food / street meal (McMeal combo)",
      "drink_out_eur":   "domestic draught beer 0.5L at a bar",
      "cocktail_eur":    "club / premium drink (~imported beer x 2.4)",
      "coffee_eur":      "cappuccino",
      "grocery_day_eur": "one person, one day of self-catering groceries",
      "club_entry_eur":  "nightclub cover charge (estimate)"
    },
    "cost_validation": { "overall_mae_pct": 17.9, "per_item_mae_pct": {...} },
    "stays": {                                // v18: bed prices (pipeline/stays)
      "v": 1, "built": "2026-11-02T05:41:10Z",
      "url": "https://data.carta-europetravel.com/data/stays-live/v1/",  // monthly refresh
      "fees": { "service_fee_pct": 14, "cleaning_fee_frac_of_night": 0.5,
                "weekly_discount_pct": 8, "min_nights_for_weekly": 7 },  // Airbnb, entire place
      "tiers": ["dorm", "private", "room", "home", "hotel2", "hotel3", "hotel4", "hotel5"]
    },
    "car_model": {                            // drive-vs-fly + rental parameters
      "consumption_l_per_100km": 6.5,         // compact car, mixed driving
      "fuel_price_eur_per_l": 1.81,           // EU-27 average petrol, fallback
      "fuel_price_by_iso2": { "BE": 1.91, "FR": 2.16, ... },  // petrol EUR/L per country
      "road_detour_factor": 1.3,              // road km / straight-line km
      "toll_eur_per_100km": 2.2,              // motorway toll / vignette allowance
      "avg_speed_kmh": 90,                    // for the drive-time estimate
      "car_capacity": 4,                      // seats per car (fuel & rental split)
      "max_drive_km": 3500,                   // offer driving to any road-connected European destination
      "rental_eur_per_day_by_iso2": { "PT": 28, ... }, // economy rental/day per country
      "rental_eur_per_day_default": 42,
      "rental_weekly_discount_pct": 15.0      // rentals of 7+ days
    },
    "n_destinations": 450,
    "is_mock": false
  },
  "destinations": {
    "<id>": {
      "id": "MAD",
      "tier": "airport",            // "airport" | "gem"
      "iata": "MAD",                // null for gems
      "city": "Madrid",
      "country": "Spain",
      "iso2": "ES",
      "lat": 40.4168,              // for airport tier this is the AIRPORT
      "lon": -3.7038,
      "city_lat": 40.4165,          // v13: actual city centre. For gems == lat/lon;
      "city_lon": -3.7026,          //   for airport tier the median of its POIs (the
                                    //   airport can be 90 km out, e.g. Stockholm/Skavsta).
                                    //   Use for "distance to the town" (day-trip advice,
                                    //   day-planner map centring, POI radii), not fares.
      "categories": ["city", "art"],
      "tags": [],
      "blurb": null,
      "no_ryanair_route": false,
      "anchor_airport": "MAD",      // Ryanair-served airport used for fares; null if none
      "routes": {
        "<origin>": {               // one per origin (BRU, CRL) that has fares
          "anchor_airport": "MAD",
          "ground_transport_one_way_eur": 0,    // gems only; 0 for airports
          "ground_transport_minutes": 0,        // gems only; 0 for airports
          "outbound_fare": { "2026-06-07": 29.99, ... },  // date -> cheapest EUR (daily)
          "return_fare":   { "2026-06-07": 29.99, ... },  // date -> cheapest EUR (daily)
          "fare_model": "interpolated_monthly_cheapest"   // see meta.flight_model
        }
      },
      "costs": {                    // per-person local prices (EUR); null if unknown
        "meal_mid_eur": 25.0,
        "meal_cheap_eur": 15.0,
        "fastfood_eur": 10.0,
        "drink_out_eur": 3.0,
        "cocktail_eur": 7.7,
        "coffee_eur": 2.12,
        "grocery_day_eur": 11.62,
        "club_entry_eur": 9.76,
        "level": "region",          // "city" | "region" | "country" (see Food price model v2)
        "price_source": "carta_food_v2",  // older data: numbeo_city | numbeo_direct | pli_scaled
        "drivers": {"inc": 1.03, "tour": 1.04, "size": 1.03, "rcpt": 0.99},  // optional
        "n_rcpt": 312,              // optional: matched shop prices within 15 km
        "city": "Porto"             // level "city" only: whose measured basket
      },
      "accommodation": {            // v18 bed prices (EUR, annual medians); absent if none
        "beds": {
          "dorm": 26,                    // one hostel bed, per person
          "private": 71,                 // hostel or guesthouse private double, per room
          "bnb_room": 64,                // Airbnb private room, per room
          "bnb_home": { "2": 98, "4": 113, "6": 143, "8": 161 },  // entire place by sleepers
          "hotel2": 66, "hotel3": 84, "hotel4": 115, "hotel5": 190  // double room by star
        },
        "q": "measured",                 // measured | nearby | modelled (best of the beds)
        "captured": "2026-10-21",        // newest observation behind the figures
        "supply": { "hostel": true, "hotel": true, "hotel5": true, "bnb": true },
        "neighbourhoods": [              // Inside Airbnb medians, towns with 300+ listings
          { "name": "Oia", "night_eur": 320, "cap": 4, "n": 200 }
        ]
      },
      "local_transport": {          // "do I need a car here?" (category estimate)
        "car_needed": false,             // true -> a rental is added when you fly in
        "transit_quality": "excellent",  // excellent | good | limited | poor
        "reason": "Compact and well served by public transport, skip the car.",
        "rental_eur_per_day": 48,        // economy rental/day for this country
        "road_connected": true           // false for islands / sea-separated (no drive option)
      },
      "beauty": {                   // schema v9 "Beauty Index" (beauty_layer.py)
        "score": 5.2,                    // 0-10 composite (display)
        "gems": 3,                       // 1-5, dataset quantiles (meta.beauty_model.gem_cutoffs)
        "unesco": true,                  // a WHS within ~60 km (powers the UNESCO filter)
        "top_beach": false,              // strong, well-flagged beach (Top-beaches filter)
        "components": { "heritage": 0.96, "nature": 0.0, "iconic": 0.12, "beach": 0.0 }
      },
      "image": {                    // schema v10 (harvest_images.py), null if none
        "url": "https://upload.wikimedia.org/.../900px-...jpg",  // sized hero (~900px)
        "hires": "https://upload.wikimedia.org/.../...jpg",      // full-res original
        "credit": "Bruges",              // Wikipedia article title
        "page": "https://en.wikipedia.org/wiki/Bruges",          // attribution link
        "source": "wikipedia"
      },
      "activities": {               // schema v10 (harvest_activities.py), null if none
        "source": "wikivoyage",          // opentripmap | wikivoyage | wikipedia_geosearch
        "items": [                       // up to 8 real named attractions
          { "name": "Grote Markt", "kind": "Square" },
          { "name": "Groeninge Museum", "kind": "Museum", "link": "https://..." }
        ],
        "items_full": [                  // schema v11, OpenTripMap-sourced dests ONLY;
                                          // absent otherwise. Up to 40 sights + up to 12
                                          // "get active" POIs, WITH coordinates, Day
                                          // Planner's pool for day-by-day assignment and
                                          // map pins. Falls back to `items` (name-only,
                                          // no coordinates) when this key is missing.
          {
            "name": "Grote Markt", "kind": "Square", "lat": 51.208, "lon": 3.225,
            "rate": 3,                    // v15.1 (2026-08): recalibrated composite
                                          // significance 0..3 (score_significance.py):
                                          // pageviews + Wikidata sitelinks/heritage +
                                          // Wikivoyage See/Do listings + old-rate prior,
                                          // blended per-dest/catalogue percentile, local
                                          // quota (~top 12% = 3, next ~28% = 2). Was
                                          // raw OTM importance before v15.1. Drives the
                                          // Day planner's must-see gradation.
            "dup": true,                  // v15.1: near-duplicate of a richer entry in
                                          // this list (dedupe_pois.py). Kept in place so
                                          // saved-plan indices stay valid; scoring quotas
                                          // and exports skip it. (optional)
            "noise": 1,                   // v15.1: commercial noise demoted by
                                          // normalize_poi_kinds.py; rate forced 0. (optional)
            "heritage": true,             // v12: on a cultural-heritage register (optional)
            "active": true,               // v12: "get active" POI (sport/amusements/natural;
                                          // optional, sights omit it)
            "img": "https://upload.wikimedia.org/...400px-...jpg",  // v12: Wikipedia thumb
            "desc": "Central square of Bruges",                      // v12: one-line summary
            "wiki": "https://en.wikipedia.org/wiki/...",             // v12: article link
                                          // img/desc/wiki only when the POI name resolves to
                                          // a Wikipedia article within 30 km (top 24 sights
                                          // + all actives are attempted; see enrich())
            "pop": 1370                   // v12.1: avg daily Wikipedia pageviews over the
                                          // last 12 months (int, enrich_activities.py).
                                          // Only on items with a resolved article. The Day
                                          // planner orders same-rate sights by this fame
                                          // signal (must-see tier, deck ranking).
          }
        ]
      }
    }
  }
}
```

## How the app prices a trip

- **Flights (plane mode):** look up `outbound_fare[departDate]` +
  `return_fare[returnDate]` for the cheapest origin, add round-trip baggage,
  multiply by group size.
- **Airport transfer:** when the flight lands at an `anchor_airport` rather than
  the destination itself (curated gems, and auto-anchored places, see below),
  `ground_transport_one_way_eur` is a per-person one-way bus/shuttle fare. The app
  counts it **round-trip, per person** and includes it in the plane total
  (`transfer_total`). It is 0 for destinations you fly straight into, and skipped
  in car mode.
- **Driving (car mode):** only when `road_connected` and the road distance
  (`haversine(home, dest) * road_detour_factor`) is `<= max_drive_km`. Number of
  cars = `ceil(group / car_capacity)`. Cost = `cars * 2*road_km *
  (consumption/100) * fuel_price[iso2]` (fuel) `+ cars * 2*road_km/100 *
  toll_per_100km` (tolls). No baggage, no per-person multiply, it is already a
  group total. Drive time = `road_km / avg_speed_kmh`.
- **Rental at the destination:** added only in plane mode when
  `local_transport.car_needed`. Cost = `cars * nights * rental_eur_per_day[iso2]`,
  with `rental_weekly_discount_pct` off for stays of 7+ nights. In car mode you
  brought your own car, so this is skipped.
- **Accommodation (per person):** start from `per_person_night_eur`, scale by the
  depart-month `seasonality`, apply the weekly discount when
  `nights >= min_nights_for_weekly`, add the per-booking `cleaning_per_person_eur`,
  then add `service_fee_pct` on the subtotal:
  `((per_person_night*season*N*los) + cleaning) * (1 + service_fee_pct/100)`,
  then multiply by group size.
- **On-the-ground (per person):** for a trip of `N` nights (`weeks = N/7`):
  `dinners_per_week*weeks*meal_mid + lunches_per_week*weeks*meal_cheap +
  fastfood_per_week*weeks*fastfood + drinks_per_week*weeks*drink_out +
  club_nights_per_week*weeks*(club_entry + 3*cocktail) + coffees_per_day*N*coffee +
  self_catered_days_per_week*weeks*grocery_day`, then multiply by group size.
  (A club night = cover charge + 3 premium drinks.)
- **Total** = flights + accommodation + on-the-ground. The map shows this; the
  detail panel breaks it down; Skyscanner verifies the flight.

## Flight data provenance (legacy notebook 02_flights, now archive/notebooks/, + fix_data.py)

- The Ryanair harvest (`02_flights`) stored the **cheapest fare per calendar
  month** per route (~4 anchor dates). `fix_data.py` then **densifies** this into
  a daily calendar: each day is linearly interpolated between the real
  monthly-cheapest anchors (anchor days keep their exact API price), with a small
  weekend uplift on filled days, and past dates dropped. So every served route
  prices on any chosen date. `meta.flight_model` records the method and every
  touched route carries `fare_model: "interpolated_monthly_cheapest"`. To replace
  these with true daily API fares, re-run `02_flights` with a full per-day walk.
- `no_ryanair_route` is True only for destinations reachable by **neither** a
  Ryanair flight **nor** a drive (road_connected and within `max_drive_km`).
- **Auto-anchored destinations (`apply_airport_anchors.py`):** places with no
  Ryanair route that are not drivable but sit within 50 km of a served airport
  (and are not islands), i.e. that airport basically *is* the city's airport
  (Venice Marco Polo/Treviso, Rome Ciampino/Fiumicino), are given that airport's
  fare calendar plus an estimated transfer (`anchor_airport`,
  `ground_transport_one_way_eur` from ~0.15 EUR/road-km, floored 10 / capped 60).
  Such dests are flagged `anchor_estimated: true` and `no_ryanair_route: false`.
  Idempotent: a re-run resets prior auto-anchors first. Everything farther stays
  `no_ryanair_route: true`, the app still shows those, flagged unreachable via
  Ryanair (muted map dot + a separate list section), it just doesn't price them.

## Food price model v2 (T513, `pipeline/apply_food_prices.py`)

Replaces the 90 copied baskets with a price per place, rolled to the latest
month. Run monthly by `run_pipeline.py --only food` (harvest, then apply, ~1 min,
no keys). `price = country base x local tilt`.

- **Country base.** The June 2026 country basket (`cache/costs.json`) where it was
  measured (24 countries, `meta.food_country[cc].anchor = "measured"`); else a Europe
  reference price x the Eurostat price level of the item's category (`modelled`, 5);
  blended by geometric mean with what the country's measured cities imply once their
  own tilt is divided out (`city-anchored`, 8: AT, BG, CZ, DK, EE, FI, HR, RS); else the
  June basket (`legacy`: microstates and Moldova). Every base is rolled from
  its period to the latest month by the local HICP (ECOICOP 2: CP111 eating out, CP011
  food) through the monthly euro exchange rate.
- **Local tilt** (`costs.drivers`, product capped to 0.80 to 1.60): regional income per
  head (NUTS3, elasticity 0.15 eating out, 0.08 chains, 0.05 groceries), tourist pressure
  (the curated `apply_tourist_premium.PREMIUM_TIERS`, else +4% / +8% eating out in the
  top 15% / 5% of NUTS3 regions by tourist nights per km2), town size (GeoNames), and
  for groceries the Open Food Facts Open Prices matched-product index within 15 km
  (needs 40 prices, shrunk by n / (n + 80)). A driver equal to 1 is left out.
- **Measured cities.** A place within 15 km of one of the 25 measured cities (the 22
  June baskets plus Vienna, Prague and Split from `fix_data.py`, which had written them
  onto whole countries) keeps that city's prices, rolled forward, untilted (`level:
  "city"`, `costs.city`); items the city never measured come from its country.
- **`level`**: `region` when any driver moved the price, `country` when none did, `city`
  as above.
- **Meta.** `meta.food_model` (version, `asof` month, Europe reference prices,
  elasticities, sources, validation: leave-one-country-out error per item and the
  measured-city check) and `meta.food_country` (country base per item plus its anchor).
- **Inputs.** `cache/food_price_inputs.json` (Eurostat price levels, HICP, FX, NUTS3 income;
  the Open Prices shop index), from `pipeline/harvest_food_prices.py`.
- **Rollback.** The first apply saves the blocks it replaces to
  `cache/food_prices_pre_v2.<folder>_<file>.json`; `apply_food_prices.py --restore` puts
  them back exactly.
- `apply_tourist_premium.py` still runs in `lodging`, but only bumps `level == "country"`
  blocks. A curated place always has a tourism driver, so it is never `country` here
  and is never bumped twice.

## Cost data provenance (legacy notebook 03_costs, now archive/notebooks/)

- Real **Numbeo** euro prices for **23 anchor countries + 22 cities** (June 2026,
  cached in `cache/numbeo_raw.json`), covering 6 dining/drink items per location.
- `cocktail_eur` (= imported beer x 2.4) and `club_entry_eur` (Belgium-anchored,
  PLI-scaled) are estimates, Numbeo has no direct item; see `meta.estimated_items`.
- Long-tail countries are scaled from the Belgium baseline by **Eurostat 2024
  Price Level Indices** (restaurants & hotels for dining/drinks, food for
  groceries). The notebook validates the scaling against the Numbeo anchors and
  records the per-item error in `meta.cost_validation` (meals ~15-20%; cafe/bar
  items noisier). Anchored countries and cities use real prices directly.
- Collection note: the June 2026 harvest was cut short by a Numbeo IP rate-limit
  (reset ~2026-07-01); re-run the collection agents after that to replace any
  remaining PLI-scaled locations with real anchors in `numbeo_raw.json`.
- `fix_data.py` corrected the three most-affected estimated countries against live
  Numbeo (Austria=Vienna, Croatia=Split, Czechia=Prague, June 2026), promoting
  them from `pli_scaled` to `numbeo_direct`. Czechia had been the most off (cheap
  meal +49%, beer +35%). 37 long-tail locations remain `pli_scaled`.

## Accommodation provenance (legacy notebook 03b_accommodation, now archive/notebooks/)

- Real **Inside Airbnb** listing-level medians (CC-BY 4.0, captured June 2026) for
  ~30 European cities, filtered to entire homes and capacity-matched, then divided
  by capacity to a per-person nightly. Used directly for covered cities/countries.
- Long-tail countries are scaled from the Belgium baseline by the **Eurostat 2024
  restaurants & hotels PLI** (closest official lodging proxy). Validated against
  the anchors; error recorded in `meta.accommodation_validation` (~17%).
- Five accuracy adjustments make the figure match real checkout prices: median
  (not mean), capacity-matched per person, summer seasonality, a weekly discount,
  and the cleaning + service fees. Season/discount/fees live in
  `meta.accommodation_model` and are applied at runtime. Refresh the anchors with
  the `compute_anchor_from_csv` helper in `03b_accommodation` on a fresh download.

---

## Schema v14 (added 2026-07-14)

Four layers on top of v13; every one has an `apply_*.py` and is idempotent.

### 1. Traveller rating, `dest.rating` (rating_layer.py + apply_rating_layer.py)

```jsonc
"rating": {
  "score": 9.5,                  // 0-10, one decimal, ABSOLUTE (no percentile
                                 // re-spreading): 8+ genuinely outstanding
  "tier": 3,                     // 3 "Worth the journey" (>=8.5) | 2 "Worth a
                                 // detour" (>=7.5) | 1 "Worth a visit" (>=6.8) | 0
  "label": "Worth the journey",  // Michelin Green Guide idiom
  "hidden_gem": false,           // highly rated + low fame, or curator-flagged gem
  "fame": 4029,                  // avg daily Wikipedia pageviews, last 12 months
  "components": { "beauty": 0.73, "things_to_do": 0.94, "appeal": 0.85 },
  "source": "rating_v2"
}
```

rating_v2 blend (rating_layer.py, replaced v1's 45/20/35 fame-led mix in
2026-07): curated appeal 70% (`app_data/curated_appeal.json`, a hand-scored
0-10 traveller-appeal judgement per destination, anchors Rome 10 ...
Charleroi 2.5) + beauty 15% (the v9 Beauty Index) + things-to-do 15%
(rate-weighted saturating POI count over `items_full`). Fame (pageviews) no
longer moves the score at all; it only decides `hidden_gem`. Tier cutoffs
8.5/7.5/6.8, absolute scale.
Multi-airport cities are unified and hold ONE slot in the distribution.
`meta.rating_model` documents everything. The UI (RatingBadge.jsx) shows the
score chip + 1-3 tier diamonds everywhere the old 1-5 gem row lived; the
FilterBar's Beauty filter became a min-tier Rating filter (`mt` URL param, old
`mb` links map across).

### 2. Per-country tolls, `dest.driving_toll` (toll_layer.py + apply_toll_layer.py)

Replaces the flat 2.2 EUR/100 km: the home->destination corridor is sampled
along the great circle, classified per country (Natural Earth 50m polygons in
`cache/ne_50m_admin0.geojson`), and priced with real 2026 rates, France ~8,
Italy ~6.5 EUR/100 km, vignettes (AT/CH/SI/CZ/SK/HU/RO/BG) once per trip, plus
fixed crossings (Brenner, Tauern, Storebaelt, Oresund). Stored round-trip PER
CAR: `{ toll_rt_eur, vignettes_eur, crossings_eur, total_rt_eur, countries,
vignettes[], crossings[], source }`. `runtime_pricing.drivingEstimate()`
prefers it (exposes `toll_notes` for the detail panel) and falls back to the
flat rate when absent; `transport.js` per-leg car costs use the per-country
rates of the leg's endpoints and now multiply by cars needed.
`meta.car_model.toll_model` holds the tables.

### 3. Tourist premium, `costs.tourist_premium` / `accommodation.tourist_premium`
(apply_tourist_premium.py)

~57 curated honeypots (Santorini, Amalfi, Venice, Zermatt, Ibiza, Hallstatt...)
get a three-tier markup over their country basket, extreme +40% dining /
+45% lodging, high +25%, mild +12% (groceries move half as much), applied
ONLY while the block still carries `level: "country"`; real city data wins and
strips it. Originals live under `premium_base`, so reruns recompute cleanly.
`meta.tourist_premium_model` documents tiers and sources.

### 4. Real city anchors + occupancy (harvest_accommodation.py +
apply_accommodation_anchors.py)

Every Inside Airbnb city/region snapshot currently published (June-2026,
CC BY 4.0) is harvested - ~40 anchors across ~32 datasets. Booking.com was
evaluated and rejected as a source: no public API, ToS forbid scraping,
Cloudflare/AWS-WAF enforcement, Inside Airbnb covers the same need legitimately.
`accommodation.n_listings`/`captured` record provenance.

The harvest v2 is specific on three axes, all stored per destination (optional
fields, runtime falls back cleanly when absent):
- **where** each anchor is a real listing-level median for that city/island;
  `apply_accommodation_anchors.py` assigns it ONLY to destinations that sit on the
  city (<= 20 km of its centre, `inside_airbnb_city`, `level: "city"`). A town that
  merely sits near a covered city is NOT given that city's rate - borrowing a
  neighbour's number is the same fake-specificity as copying it; those keep the
  honest country/PLI(+pop) estimate instead.
- **when** `accommodation.seasonality` is that city's OWN 12-month curve, derived
  from its review history (`reviews.csv`; Inside Airbnb dropped forward prices from
  `calendar.csv`, so the monthly review histogram - real stays, no booking-curve
  bias - is the signal, damped to a price-like amplitude), overriding the one
  global summer curve, so Santorini's steep peak and Berlin's flat one differ.
- **what** `accommodation.capacity_buckets` are OBSERVED whole-home nightlies per
  group size (2..8), replacing the modelled occupancy^0.55 curve when present;
  `accommodation.neighbourhoods` carry per-neighbourhood medians (city matches).

### 4b. Long-tail settlement tier (apply_longtail_granularity.py)

Markets with no Inside Airbnb coverage (PL, HR, Nordics, Baltics, Balkans...)
keep a country median / PLI estimate. There is no open sub-national lodging-price
dataset, so within-country variation is added from the one honest signal present
- `dest.geonames.population`: a gentle, capped (+-15%) tier multiplier (metro
+15% ... village -12%) applied ONLY to `level: "country"` blocks, recorded as
`settlement_tier`/`pop_factor`, source suffixed `+pop`, base stashed under
`longtail_base` for idempotent reruns. Modelled, not measured, and marked so.

## Schema v15, non-Wikipedia data sources (added 2026-07-16)

Two independent open datasets now sit alongside the Wikipedia / Wikivoyage /
OpenTripMap pipeline (`harvest_osm_wikidata.py`, since superseded and moved to
`archive/`; idempotent + resumable via
`cache/osm_wikidata.json`). `meta.data_sources` records provenance/licence.

### 1. OpenStreetMap (Overpass API), thin-POI top-up
Destinations whose `activities.items_full` had `< 6` POIs (OpenTripMap/Wikivoyage
covered them barely, e.g. Gallipoli 0, Kerry 0) are topped up with real OSM POIs
(tourism=attraction|viewpoint|museum, historic=castle|monument|ruins|
archaeological_site, natural=beach|peak|cave, waterway=waterfall, leisure=
nature_reserve). Each added item carries `lat`/`lon` and `src: "osm"`, `rate`
capped at 2 (never the OTM-only rate-3 "must see" tier); a POI OSM has linked to
Wikidata/Wikipedia is ranked first. `activities.osm_filled` counts the top-up.
Licence: ODbL 1.0, (c) OpenStreetMap contributors.

### 2. Wikidata (Special:EntityData), independent notability signal
`dest.wikidata = { qid, sitelinks, heritage, protected, image_p18, source }`
(added to the 2026-07c gem batch). `sitelinks` (count of language Wikipedias) is
a fame proxy that does NOT depend on pageviews, a cross-check for the rating
layer's fame component; `heritage` (P1435) / `protected` (P3018) validate the
beauty layer's UNESCO/heritage signals; `image_p18` is an independent image
backstop. Licence: CC0 1.0.

### v15 catalogue additions
43 new gems (2026-07c batch, `new_gems_2026_07c.json` + `add_appeal_2026_07c.py`)
took the catalogue from 685 -> 728: 12 beaches/coast (Lefkada, Bol/Zlatni Rat,
Tarifa, Vieste, Villasimius, La Maddalena, Sagres, Comporta, Ios, Carvoeiro,
Gallipoli, Otranto), 15 nature/walks (Snowdonia, Brecon Beacons, Peak District,
Yorkshire Dales, Dartmoor, Cairngorms, Loch Lomond, Ordesa, Camargue, Kranjska
Gora, Titisee, Transfagarasan, Jurassic Coast, Samaria Gorge, Preikestolen,
Millau) and 16 towns (Malbork, Bacharach, Aachen, Vicenza, Padua, Parma,
Chartres, Figueres, Peniscola, Trento, Portovenere, Langhe, Bergamo Alta,
Erfurt, Potsdam). All carry image, activities, beauty, rating, tolls, costs.

---

`meta.accommodation_model` also gains `occupancy_exponent: 0.55` +
`occupancy_ref_capacity: 4`: whole-home prices grow ~capacity^0.55, so the
runtime rescales the stored 4-sleeper per-person nightly to the real group
(x1.37 for a couple, x0.78 for seven), fixes couples paying for half a house.

Day planner (client-side, dayDraft.js): `poiScore()` = rate + heritage +
Wikipedia presence + log-scaled `pop` (now filled on 6,294 POIs); the
"Must see" shelf keeps only the top ~18% (max 8) of rate-3 sights, and every
"Must see" badge uses `isMustSee()` (rate 3 AND corroborating evidence)
instead of the old rate>=3, which had badged 57% of all POIs.

Pipeline order (updated; scripts live in `pipeline/`, run from the repo root -
`run_pipeline.py` automates the scheduled subset):
    apply_car_layer -> apply_airport_anchors -> apply_airport_categories
    -> apply_beauty_layer -> harvest_pageviews -> apply_rating_layer
    -> apply_toll_layer -> harvest_accommodation -> apply_accommodation_anchors
    -> apply_tourist_premium -> harvest_hostelworld + harvest_hotels_liteapi
    -> apply_stay_tiers -> enrich_activities apply -> sync-data (build)

## Stay tiers (added 2026-07-28): hostels + hotels beside the Airbnb anchor

`accommodation.tiers` (see the destination schema above) lets a traveller pick
how expensive to sleep: dorm bed, private hostel room, entire place (the
classic anchor), 3-star or 4/5-star hotel. Two new harvesters feed it:

- `harvest_hostelworld.py` - Hostelworld Partner API (affiliate credentials in
  `HW_CONSUMER_KEY`/`HW_CONSUMER_SECRET`; apply at partners.hostelworld.com).
  Per city, 4 date probes spread over the year; median per-property cheapest
  dorm (HOSTEL) and cheapest private (HOSTEL+GUESTHOUSE), de-seasoned into an
  annual figure. -> `cache/hostel_city_anchors.json`
- `harvest_hotels_liteapi.py` - LiteAPI v3 (`LITEAPI_KEY`, self-service at
  liteapi.travel; picked after Amadeus Self-Service shut down 2026-07-17).
  Star-rated hotel list per city, then 4 rate probes for a 2-adult double;
  medians per star bucket (3.0-3.5 vs 4.0-5.0). -> `cache/hotel_city_anchors.json`
- `apply_stay_tiers.py` assigns anchors city-only (<=20 km, no regional
  borrowing, same rule as the Airbnb anchors) onto `accommodation.tiers` of
  both app_data targets. Idempotent (strips old tiers first). REFUSES
  src="fixture" anchors unless `--allow-fixtures` (dev chain:
  `pipeline/oneoff/make_stay_fixtures.py` -> `harvest_* --fixtures`).

Runtime (`runtime_pricing.js`): `choices.stay_tier` ('home' default, URL param
`st`). Dorms price per bed; private/hotel rooms are doubles, ceil(g/2) rooms
split across the group. Non-home tiers keep the seasonality curve but charge
no cleaning fee, no service fee and no weekly discount. A tier with no
measurement falls back to the entire-home price with `tier_fallback: true`,
surfaced in the breakdown ("no measured dorm price here"). Booking links
follow the tier: Hostelworld search (dorm/private), KAYAK hotels (hotel
tiers), Airbnb (home).

## Schema v16, bathing-water quality (added 2026-07-18)

A third independent open data layer (`harvest_bathing_water.py`), from the
European Environment Agency's WISE Bathing Water Quality database (Bathing
Water Directive 2006/7/EC), the official Excellent/Good/Sufficient/Poor
classification of ~22,000 EU + EEA bathing sites (coastal, lake and river),
pulled from the EEA discomap ArcGIS REST service (2025 season, cached in
`cache/eea_bathing_water.json`). Idempotent + resumable; re-download with
`--refresh`. `meta.data_sources.eea_bathing_water` records provenance.

For every destination within `radius_km` (15 km) of one or more official sites:

```jsonc
"bathing_water": {
  "rating": "Excellent",        // median Directive class of the nearby sites (headline)
  "excellent_pct": 89,          // share of nearby sites rated Excellent (latest season)
  "n_sites": 19,                // classified bathing sites inside the radius
  "counts": { "Excellent": 17, "Good": 2 },   // per-class tallies (zeros dropped)
  "water_types": ["Coastal"],   // any of Coastal / Lake / River / Transitional
  "nearest": {                  // closest classified site (a "which beach" hint)
    "name": "PLAYA DE LA BARCELONETA PM1",   // EEA name, ALL CAPS, title-cased in the UI
    "class": "Good", "dist_km": 1.0, "type": "Coastal",
    "profile": "https://..."    // national bathing-water profile deep link (may be null)
  },
  "trend": "improving",         // vs three seasons earlier: improving | stable | declining
  "radius_km": 15, "year": 2025, "source": "eea_wise_2025"
}
```

898 destinations carry a block (inland cities near no official site get none).
The data is attached to all of them, but the UI only SHOWS it for swim-relevant
places (`swimRelevant()` in `components/WaterQualityBadge.jsx`, categories
beach/coast/island/lake/surf/diving/sailing/fjord), so an inland city near a
new river bathing site (e.g. the Seine at Paris) does not get a scary pill.
`WaterQualityBadge` renders the colour-coded pill in the DetailPanel rating row
(labelled) and the ResultsList sub-row (icon-only); `knownForFacts` adds a
"Water quality" fact row. Class words use the official Directive translations
(`water.*` i18n keys, 6 languages). `useDestinationSearch` copies
`bathing_water` onto the priced row so the list badge can read it.

Pipeline: run `harvest_bathing_water.py` any time after the catalogue is built
(it only reads coords), then `npm run data` / dev / build ships it.

## Schema v17, regional crowding / tourism density (added 2026-07-18)

The JRC European Tourism Dashboard's Tourism Density indicator
(`harvest_tourism_density.py`), from two official Eurostat open sources:

- `tour_occ_nin3`, nights spent at tourist accommodation per NUTS 3 region
  (Eurostat JSON API; latest available year per region, cached in
  `cache/eurostat_nights_nuts3.json`).
- GISCO NUTS 3 2021 boundaries (1:10M GeoJSON, `cache/nuts3_2021.geojson`) -
  used for point-in-polygon (shapely STRtree) AND to compute each region's land
  area with a spherical-polygon formula (no projection dependency).

density = nights / area_km2; regions ranked into four tiers by the log-density
distribution (25/50/75 percentiles). Each destination is placed in its NUTS 3
region by point-in-polygon (with a small nearest-region fallback for coastal
points just outside the generalised boundary):

```jsonc
"crowding": {
  "nights_per_km2": 5343,       // regional tourism density (int)
  "tier": 3,                    // 0 quiet | 1 moderate | 2 busy | 3 crowded
  "label": "Crowded",
  "nuts3": "ES511",             // region code
  "region": "Barcelona",        // region name
  "year": 2024,                 // reference year of the nights figure
  "source": "jrc_eurostat_nuts3"
}
```

1389 destinations carry a block. `meta.crowding_model` holds the tier cutoffs.
**UK destinations get no block**, the UK stopped reporting tourism nights to
Eurostat post-Brexit (honest gap, not faked). NUTS 3 is province-level, so a
famous village in a large rural province can read lower than it feels (e.g.
Hallstatt = Busy, not Crowded), inherent to regional data.

UI: `components/CrowdingBadge.jsx`. To keep the DetailPanel header uncluttered
the pill shows only the actionable extremes, Quiet (dodge the crowds) and
Crowded (a heads-up) via `crowdBadgeWorthShowing()`; all four tiers appear in
the `knownForFacts` "Crowds" row. i18n `crowd.*` keys, 6 languages.
`useDestinationSearch` copies `crowding` onto the priced row.

Pairs with (but is independent of) `rating.hidden_gem` (fame-based) and the
curated `tourist_premium` honeypots: crowding is an objective regional measure.

## POI expansion, lifting the 52-cap (built 2026-07-18, apply pending)

`activities.items_full` is capped at 52 (40 OpenTripMap sights + 12 active).
Measured, that truncates a real 3-9x of available sightseeing POIs (Barcelona
52 -> 465 net-new named OSM POIs, Rome 475). Two harvesters were built to lift
it; both keep the sightseeing taxonomy only (no restaurants/shops), cap OSM/
Overture rate at 2 (never the rate-3 must-see tier), and dedup vs existing
items_full by folded name. No UI work needed, existing items_full consumers
(day-planner pins, DetailPanel) just get more entries.

- `harvest_pois_osm.py` (superseded by the Overture path, moved to `archive/`),
  per-destination Overpass (node-only, explicit historic
  values; the catch-all `[historic]` + ways times out in cities). Fine for a few
  hundred dests; does NOT scale to the full 24k catalogue (ban risk).
- `harvest_pois_overture.py`, THE scalable path. `extract` runs one DuckDB
  query over the Overture Maps places GeoParquet (release 2026-06-17.0) for the
  Europe bbox, sightseeing categories + named + confidence>=0.5, to
  `cache/overture_pois_eu.parquet` (807,130 POIs, 26 MB, done). `assign` KD-tree
  matches every dest to POIs within 5 km, merges to a 150 cap. Adds
  `items_full[].src: "overture"` and `activities.overture_added`. Needs
  duckdb + scipy.

APPLY IS DEFERRED: a concurrent session expanded the catalogue (1570 -> 24803
GeoNames dests) mid-session and re-patches app_data.json. Run the real
`python harvest_pois_overture.py assign` + `npm run data` only once that
harvest is finished, or it will be clobbered.

## Flight prices (T511 to T518, added 2026-10-21)

This replaces "Fare provenance, contract A" (2026-08-05) and "Flight-cost
input" (T058, T267, T273). T511 removed the per-origin fare slices
(`public/fares/<ORIGIN>.json`), the master `data.fares` table, the
`e_out`/`e_ret` estimate bands and every reader of them; the old contract is
in git history and in the Execution reports. Flight prices are now Google
Flights' prices, read by Carta's own Worker and published to R2. None of
these files is in `public/`; the app reads them from the data host
(`src/lib/flights/flightData.js`).

### Route list (T512)

`pipeline/flights/build_routes.py`, the monthly `flight_routes` task in
`run_pipeline.py`. Sources: Eurostat `avia_par_{cc}` (monthly passenger
flights per airport pair, CC BY 4.0) and OurAirports (public domain) for
ICAO to IATA and airport positions. A pair is kept when it has at least 4
departures in at least 2 of the last 12 months; the return direction is
filled in (the UK stopped reporting after 2019); partners outside Europe are
dropped.

- `data/flights/_routes.json`: `{ built, through, reporters, source, routes:
  { ORIGIN: { DEST: monthMask } } }`, one entry per one-way route, where
  `monthMask` is a 12-bit mask of the calendar months it flies (bit 0 =
  January, 4095 = all year) and `through` is the last Eurostat month used.
  Uploaded to R2 `carta/data/flights/_routes.json`, where the sweep Worker
  reads it.
- `data/flights/_airports.json`: per IATA code `name`, `city`, `country`,
  `lat`, `lon`. `continent-app/scripts/sync-data.mjs` reads it for the origin
  picker (`meta.origins`).

### Per-airport price file (T514)

Written hourly by the `flight-sweep` Worker to R2 `data/flights/{IATA}.json`,
one file per home airport, both directions:

```jsonc
{
  "v": 1,
  "from": "BRU",                 // the home airport
  "checked": "2026-10-21T21:07:00Z", // when the file was published
  "to": {                        // home -> DEST
    "<DEST>": {
      "2026-11-18": [87, "VY", "21:55", "23:59", 0, 29355847],
      "2026-11-19": null        // searched, no flight that day
    }
  },
  "back": { "<DEST>": { } }      // DEST -> home, same shape
}
```

Per day: `[price, airline, dep, arr, stops, checkedMinute]`, the cheapest
flight's price on Google Flights (EUR, one adult, one way), the airline's
IATA code, local departure and arrival, the number of stops and the minute
it was checked (minutes since 1970). `null` means searched with no flight;
a missing date was not searched. Writer: `workers/flight-sweep/src/publish.mjs`.

`data/flights/_index.json`: `{ checked, origins: { IATA: n }, airlines:
{ code: { name, logo } } }`, the airports that have a file and every airline
the sweep has seen. `data/airlines/{code}.png` is the airline's logo, copied
once from Google's 70 px logos.

### Live search (T515)

`continent-app/functions/api/flights.js`: `GET /api/flights?o=&d=&date=`
returns every flight of that day for one route, cached at the edge for one
hour; 502 when Google refuses the search.

### What the app shows (T517, T518)

Per direction, the first that exists wins:

1. A fare the traveller typed in (`ownFlight`, `ownLegs` in the planner),
   shown as theirs.
2. In the trip planner, the live search for the exact day, filtered by the
   chosen hours (any, morning, afternoon, evening).
3. The sweep's price for the same day; on pages priced at the app's dates,
   the nearest day within 3 days, and the flight then shows its own date.
4. Nothing.

A price checked more than 3 days ago is never shown. A flight price is
Google Flights' figure, not Carta's estimate, so it carries no tilde; it
always shows the airline, the times, when it was checked and a link to
Google Flights with "prices may have changed". Bag fees per airline (10 kg
cabin, 20 kg checked, `src/lib/flights/bagFees.js`) are Carta's estimates and
carry the tilde and "est.". The airport transfers stay ground costs Carta
prices.

## Served data split (added 2026-07-12)

The master `app_data/app_data.json` is unchanged, but `continent-app/scripts/sync-data.mjs`
now splits it for the wire at dev/build time:

- `public/app_data.json`: core dataset; `activities.items_full` and `image.hires` removed
- `public/activities_full.json`: `{ destinationId: items_full }`, lazy-fetched by the Day planner
- `public/country_insights.json`: copy of `app_data/country_insights.json` (schema v1):
  `{ generated_at, schema_version, countries: { <Country Name>: { iso2, currency, languages,
  budget_level, daily_budget_eur:[lo,hi], best_months, best_time_note, rail{operator,url,note},
  bus{operators,url,note}, driving{side,vignette,tolls,warnings,car_recommended_for,car_not_needed_in},
  must_see:[{name,region,why}], insights:[..], food:[..], events:[..], sources:[..] } } }`

## Wire contract, checked in CI (T082)

This table is the contract for the top level of `public/app_data.json`, and
`continent-app/scripts/ci/check-contract.mjs` parses it on every run (locally
in `npm run ci`, and in `.github/workflows/schema-contract.yml`). The payload
must match it both ways. A key the payload carries and this table does not
list fails, so a renamed field cannot ship under its new name unnoticed. A
listed key the payload lacks fails too: a `meta` key must be present, a
`destination` key marked `every` must be on every record (its value may be
null), and one marked `some` must be on at least one record. To change the
wire, change this table in the same commit, and if `meta.schema_version` moves,
change the header line above and `EXPECTED_SCHEMA_VERSION` in
`continent-app/scripts/ci/contract.mjs` with it.

Only the top level is pinned; the keys inside a block (`rating.score`,
`costs.meal_mid_eur`) are described in the sections above and not yet checked.
`routes`, described in the first block, is not on the wire. Since T511 there
are no fare slices; flights come from the sweep files ("Flight prices" above).

The column after the presence says where this file describes the field.
"Not yet described" marks a field that ships and is read but has no section
here yet.

| Key | Block | Presence | Described |
|---|---|---|---|
| `schema_version` | meta | required | header line; read on boot |
| `currency` | meta | required | app_data.json block; read on boot |
| `start_date` | meta | required | app_data.json block; read on boot |
| `end_date` | meta | required | app_data.json block; read on boot |
| `defaults` | meta | required | app_data.json block; read on boot |
| `baggage_options` | meta | required | app_data.json block; read on boot |
| `generated_at` | meta | required | app_data.json block |
| `origins` | meta | required | app_data.json block |
| `home_city` | meta | required | app_data.json block |
| `home` | meta | required | app_data.json block |
| `categories` | meta | required | app_data.json block |
| `cost_basket` | meta | required | app_data.json block |
| `cost_validation` | meta | required | app_data.json block |
| `stays` | meta | required | app_data.json block |
| `car_model` | meta | required | app_data.json block; Schema v14 section 2 |
| `n_destinations` | meta | required | app_data.json block |
| `is_mock` | meta | required | app_data.json block |
| `beauty_model` | meta | required | app_data.json block (`beauty.gems`) |
| `flight_model` | meta | required | app_data.json block (`fare_model`) |
| `data_sources` | meta | required | Schema v16 |
| `crowding_model` | meta | required | Schema v17 |
| `activities_model` | meta | required | not yet described |
| `all_origins` | meta | required | not yet described |
| `climate_model` | meta | required | not yet described |
| `climate_period` | meta | required | not yet described |
| `country_context_model` | meta | required | not yet described |
| `designation_model` | meta | required | not yet described |
| `fares_model` | meta | required | not yet described |
| `fares_model_est` | meta | required | not yet described |
| `fares_model_tp` | meta | required | not yet described |
| `fares_model_volotea` | meta | required | not yet described |
| `fares_model_vueling` | meta | required | not yet described |
| `fares_model_wizz` | meta | required | not yet described |
| `image_model` | meta | required | not yet described |
| `member_model` | meta | required | not yet described |
| `origin_coverage` | meta | required | not yet described |
| `place_model` | meta | required | not yet described |
| `rating_model` | meta | required | Schema v14 section 1 |
| `tourist_premium_model` | meta | required | Schema v14 section 3 |
| `id` | destination | every | app_data.json block; the record's key |
| `tier` | destination | every | app_data.json block |
| `iata` | destination | every | app_data.json block |
| `city` | destination | every | app_data.json block |
| `country` | destination | every | app_data.json block |
| `iso2` | destination | every | app_data.json block |
| `lat` | destination | every | app_data.json block |
| `lon` | destination | every | app_data.json block |
| `categories` | destination | every | app_data.json block |
| `tags` | destination | every | app_data.json block |
| `blurb` | destination | every | app_data.json block |
| `no_ryanair_route` | destination | every | app_data.json block |
| `anchor_airport` | destination | every | app_data.json block |
| `costs` | destination | every | app_data.json block |
| `accommodation` | destination | every | app_data.json block; Schema v18 |
| `local_transport` | destination | every | app_data.json block |
| `beauty` | destination | every | app_data.json block |
| `image` | destination | every | app_data.json block (`hires` stripped on the wire) |
| `activities` | destination | every | app_data.json block (`items_full` moved to `poi/`) |
| `rating` | destination | every | Schema v14 section 1 |
| `transfer` | destination | every | not yet described (minutes and euros one way from the anchor airport) |
| `climate` | destination | every | not yet described (twelve monthly rows and the best months) |
| `place` | destination | every | not yet described (place class and visit hours, `apply_place_layer.py`) |
| `country_rank` | destination | every | not yet described (`country_context_layer.py`) |
| `country_n` | destination | every | not yet described (`country_context_layer.py`) |
| `country_percentile` | destination | every | not yet described (`country_context_layer.py`) |
| `country_badge` | destination | every | not yet described (`country_context_layer.py`) |
| `class_percentile` | destination | every | not yet described (`country_context_layer.py`) |
| `city_lat` | destination | some | app_data.json block |
| `city_lon` | destination | some | app_data.json block |
| `driving_toll` | destination | some | Schema v14 section 2 |
| `bathing_water` | destination | some | Schema v16 |
| `crowding` | destination | some | Schema v17 |
| `geonames` | destination | some | Schema v14 section 4b (`geonames.population`) |
| `designations` | destination | some | not yet described (heritage and award registries, `apply_designations.py`) |
| `nature` | destination | some | not yet described (nearest protected area, `harvest_protected_areas_osm.py`) |
| `guide` | destination | some | not yet described (Wikivoyage lead and link, `apply_wikivoyage.py`) |
| `members` | destination | some | not yet described (towns grouped under this one, `member_layer.py`) |
| `wikidata` | destination | some | Schema v15 section 2 |
| `anchor_estimated` | destination | some | Flight data provenance (auto-anchored destinations) |

## Schema v18 (added 2026-10-21, T530-T536): bed prices for every bed type and month

Replaces the v16/v17 accommodation layer (Inside Airbnb anchors scaled by
country price level and population, and the fixture hotel/hostel tiers). The
old scripts are in `pipeline/archive/`.

- **Sources (all free):** Xotelo (TripAdvisor-based, dated per-OTA prices for a
  few anchor properties per destination, monthly), Inside Airbnb (CC BY 4.0,
  entire place by capacity, private room), the owner's twice-yearly Booking.com
  and Hostelworld list scrape (star class, dorm beds, gaps), OpenStreetMap
  (supply, stars), Eurostat (HICP CP112 drift, price level, nights). Only
  medians per destination are published.
- **`dest.accommodation`** carries the annual medians (above). The **stays wire**
  `stays/v1/{iso2}.json` carries, per destination: `month[bed][12]` (EUR per
  unit, measured per month), `weekend` (Friday and Saturday factor), `peak`
  (`xmas`, `easter`, `aug15` factors), `single.hotel` (1-adult room ratio),
  `season_q` (one letter per month: `m` measured, `f` filled), `src[bed]`
  (`q`, `from`, `km`, `n`, `scaled`). The app keeps the newer of the baked copy
  (`public/stays/v1/`) and the monthly refresh (`meta.stays.url`).
- **Runtime:** `continent-app/src/lib/stayPrice.js` `bedPrice()` prices night by
  night (each night its month, weekend and peak factors), sizes rooms to the
  party (dorm per bed, rooms `ceil(people / 2)`, the smallest home that sleeps
  the group) and adds `meta.stays.fees` on an entire place only.
- **Refresh:** `.github/workflows/stays-refresh.yml` (weekly Xotelo slice,
  monthly build and gated publish), `scripts/stays_scrape.bat` (owner's laptop,
  March and September), `run_pipeline.py` tasks `stays` and `stays_discover`.
