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

## Explore completeness, routes and peaks (T630, added 2026-10-23)

Additive only: no key renamed or removed. Every key below is absent, not null,
when the pass has nothing to say, and the app shows the shared placeholder
(`components/NotYet.jsx`) for an absent one. "Awaiting run" means the code is
written and a pipeline run has not filled the wire yet.

| Layer | Key | Where | Source | State |
|---|---|---|---|---|
| trails | `sac_scale` | country row `trips[]` | relation tag, else worst member way (`grade_parts.sac_worst`), `export_wire.sac_scale_of` | awaiting run |
| trails | `technique` `{worst, share}` | detail | OSM `hiking_technique` on member ways, worst wins, `way_tags.py` | awaiting run |
| trails | `exposure` `{worst, share}` | detail | OSM `hiking_exposure`, same pattern | awaiting run |
| trails | `sac_segments` `[[from_m, to_m, "T2"]]` | detail | member ways with `sac_scale`, run length coded, positions approximate (member order) | awaiting run |
| trails | `transit` `{rail, bus, ferry}` | country row | stub, `pipeline/field_stubs/t630_routes.py` | stub |
| trails | `duration_min` | row and detail | DIN 33466 (`elevation.py:duration_min_din33466`: 4 km/h, 300 m/h up, 500 m/h down, the smaller of flat and vertical time counted half), with `elevation.duration_rule` | live |
| cycling | `rt` `loop` / `out_back` / `point` | country card and detail | `export_cycling.route_shape`, from the line (roundtrip=yes stays `loop`) | awaiting run |
| cycling | `dur.min`, `dur.rule` = `flat18_climb10` | card and detail | house rule, 18 km/h plus 10 min per 100 m of climb | live |
| mountains | `slopeDeg` | full row | `terrain.easiest_slope`, steepest stretch of the gentlest side; the app warns over 30 | awaiting run |
| mountains | `huts[]` `{name, kind, m, beds, open, phone, web, email, ele}` | full row | OSM tourism=alpine_hut / wilderness_hut near the summit, `enrich_peaks.hut_record` | awaiting run |
| mountains | `rangeRank` `{n, h, p}` | full and stub rows | rank by height and prominence within `range`, across countries, `peak_index.range_ranks` | awaiting run |
| mountains | `lift.price`, `lift.hours` | full row | stub | stub |

Pace multipliers, break time, average grade and the SAC T-grade mapping are
applied in the app (`src/lib/routeEffort.js`) on the stored base time. The app
never recomputes DIN 33466.

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

## Ask Carta search wires (T551, added 2026-10-22)

Written by `pipeline/ask_index_layer.py` (run_pipeline task `ask_index`) and,
for `bm25.json`, `continent-app/scripts/build-ask-bm25.mjs`, into
`public/search/ask/`. Read by the Ask Carta box in the browser (passages,
BM25) and by the Pages Function `functions/api/ask.js` (model and vectors,
through `functions/_lib/askEmbed.js` and `askScore.js`). Built data, not
committed (`.gitignore`); `public/search` is in `R2_TIER`, so the files move
to the data host with the other search wires when `VITE_DATA_BASE` is set.
This is not part of the CI wire contract below, which pins `app_data.json`.

| Wire | Shape |
|---|---|
| `search/ask/manifest.json` | `{version: 1, model, dims, built, sources: {<src>: {n, passages, i8, b1}}, model_files: {vocab, emb, scale}, bm25: {file, fields, boost, sources, n, bytes, gzip, options}}` |
| `search/ask/passages-<src>.json` | `{source, rows: [[pid, destId or null, text, payload]]}`; pid `<src>:<id>`; text 1 to 3 sentences, at most 300 characters, no em or en dashes; payload `{cc, kind, m: [best months], tags, ref: {type, id}, name}`, for `lexicon` `{slot, value, lang}` |
| `search/ask/vectors-<src>.i8` | n x D int8, row order of the passages: each row L2-normalised, x127, rounded |
| `search/ask/vectors-<src>.b1` | n x D/8 bytes: sign bits, dimension i at byte i>>3, bit i&7 |
| `search/ask/model/vocab.json` | `{version, type: "unigram", model, dims, unk_id, normalizer: [steps], metaspace: {replacement, prepend}, max_tokens, pieces: [...], scores: [...]}`: the pruned tokenizer |
| `search/ask/model/emb.i8` | vocab x D int8, one row per piece: the row / its max absolute value x127 |
| `search/ask/model/scale.f32` | vocab float32 little endian: each row's max absolute value |
| `search/ask/bm25.json` | MiniSearch `toJSON()`; id = pid, fields name, tags, text, nothing stored; load with `ASK_BM25_OPTIONS` from `functions/_lib/askTerms.js` |
| `search/ask/lexicon.json` | input, not output: `{version, phrases: [[phrase, lang, slot, value]]}` (T552), indexed as the `lexicon` source when present |

Sources (one adapter each in `SOURCES`): `dest` (every destination: city,
country, blurb or dossier intro, categories, Wikivoyage lead), `highlight`
(dossier highlights with a fact, up to eight per destination), `sight`
(activity items not already a highlight), `trail` (published trails),
`journey` (the curated weeks), `beach`, `lake`, `peak` (the layer files),
`country` (`country_insights.json`), `lexicon`. `ref.type` is what a hit
opens: `dest` for dest, highlight and sight; otherwise `trail`, `journey`,
`beach`, `lake`, `peak` or `country`. `destId` is the destination a hit
belongs to or is nearest (same country, 25 km; 40 km for a journey), or
null.

## Explore completeness, climate, lakes and beaches (T631, added 2026-10-23)

Additive keys only: nothing is renamed or removed, `schema_version` is not
bumped, and the CI contract table below is unchanged (only top-level
`app_data` keys are pinned there). Every key below is optional. The app reads
each with absence tolerated and shows the shared placeholder
(`components/NotYet.jsx`) where it is missing. All of the pipeline code is
written and compiled but NOT run: the "after" coverage of these keys is 0%
until the named step runs.

### Destination climate (`dest.climate`)

The existing tuple `m` (twelve `[t_high, t_low, precip_mm, comfort]`) and
`best` are untouched. Three parallel keys sit beside them.

| Master key (`app_data/app_data.json`) | Wire key (compact, `sync-data.mjs`) | Meaning | Written by |
|---|---|---|---|
| `climate.rain_days` | `climate.rd` | 12 numbers: mean days per calendar month with at least 1 mm (NASA POWER daily PRECTOTCORR, 2001 to 2020) | `harvest_climate_power.py --daily`, then `apply_climate.py` |
| `climate.wind_ms` | `climate.wind` | 12 numbers: mean 10 m wind in m/s (WS10M); the app shows km/h | same |
| `climate.elev_m` | `climate.elev` | ground elevation in metres the temperatures are lapse corrected to (Copernicus DEM via Open-Meteo, `cache/climate_elevations.json`, 3,868 of 3,868) | `apply_climate.py` |

`harvest_climate_power.py --daily` keeps only the twelve monthly aggregates
per destination in `cache/climate_power_daily.json` (resumable) and folds them
into `cache/climate.json`. Run order: `harvest_climate_power.py` (existing),
`harvest_climate_power.py --daily`, `apply_climate.py`, `sync-data.mjs`.

Temperature at altitude is derived in the app (`lib/waterFacts.js
altitudeSeries`), not stored: the valley `m` series minus 6.5 C per 1,000 m
over the difference between the highest mapped peak in the dossier
(`around.mountains[].elev_m`) and `climate.elev`. It needs `climate.elev`, so
it appears after the `apply_climate.py` run, and only where the peak is at
least 150 m above or below the town. It is labelled as derived on the sheet.

NASA POWER has no sunshine duration (only `ALLSKY_SFC_SW_DWN` radiation), so
sunshine hours are a stub (`climate.sun_h`, `pipeline/field_stubs/t631_water.py`).

### Lakes (`public/lakes/{CC}.json`)

| Key | Meaning | Written by |
|---|---|---|
| `water.zones` | `[{n, q, km}]` up to 12 EEA bathing sites on the lake: name, class, km from the lake centre, nearest first. `water.class` is kept as the headline | `enrich_lakes.join_bathing` stores `lake["water"]["zones"]`, `export_lakes.zones_of` exports it. Needs a lake re-enrich, then an export |
| `sports` | water sport codes mapped on or at the shore, in the order windsurfing, sailing, water_ski, canoe, rowing, scuba_diving, surfing, fishing, swimming. From the `sport` counts the Overpass context sweep already caches in `lake["context"]` (`enrich_lakes.py` CONTEXT_CLAUSES), nothing new is fetched | `export_lakes.watersports_of` |
| `ferry` | `{stops: n}` ferry terminals found by the sweep. Counts only; line names are a stub (`ferry.lines`) | `export_lakes.ferry_of` |
| `beaches` | `[{id, n, km}]` up to 8 published beaches marked `inland` within `shore_radius_km(lake) + 0.5` km of the lake centre, nearest first, same country. Distances are from the lake centre. No lake polygon reaches the export, so this is a circle of the same area, not the shore | `export_lakes.beaches_around`, reads `public/beaches/{CC}.json`; run the beach export before the lake export |

Kept as is and shown: `size.areaKm2` (93.1%), `size.depthM` (33.1%), `swim.temps`
(99.8%, a CHELSA model, `swim.est` true), `swim.rule` (100%, 84.3% not
"unknown"), `hazards` (31.8% non-empty), `water.class` (55.0%), the `ferry` tag
in `services` (6.1%).

### Beaches (`public/beaches/{CC}.json`)

All from the OSM tags the harvest keeps on every beach (`osm_tags`) and the
proximity context (`enrich_beaches.py` CONTEXT_CLAUSES). Each key is omitted
when the source says nothing; absence means unknown, never "no".

| Key | Values | Source |
|---|---|---|
| `fee` | `free` (fee=no), `paid` (fee=yes), `mixed` (leisure=beach_resort, or fee=no on a beach_resort) | `export_beaches.access_model` |
| `dog` | `yes`, `leash`, `no`, `seasonal` | OSM `dog`, `export_beaches.dog_rule` |
| `shade` | `yes` (shade=yes, trees, natural, partial), `no` | OSM `shade`, `export_beaches.shade_of` |
| `operator` | string, 80 characters at most | OSM `operator` |
| `pool` | `true` | context bucket `swimming_pool` (leisure=swimming_pool added to the existing leisure clause, plus water_park) |
| `kidsPool` | `true` | context bucket `kids_pool`: a swimming pool whose `pool=` value or name says children |
| `rentals` | `true` | context bucket `sunbed_rental`: a new Overpass clause, `rental` matching umbrella, sunbed, sun_lounger, deckchair or beach |
| `sst` | 12 numbers | forwarded by `v2_fields` when a beach carries it; no source today (stub) |

The context buckets only exist after `enrich_beaches.py` re-runs its Overpass
context pass (two extra lookups per batch), then `export_beaches.py`.
Lifeguard (`lifeguard: true`, 5.8%), `surface` (57.5%), `services` toilets
16.1%, showers 9.3%, food 19.6% and `water` (82.6%) are existing keys.

### Derived in the app, not stored

Water shoes (from `surface`: pebble, shingle, rock, gravel give yes, sand and
fineGravel give no, everything else nothing), the audience tags (family from
`bestFor` families, quiet from `bestFor` seclusion, dog friendly from `dog`;
luxury is a stub), and the slippery-rock warning on trails (SAC T2 or harder
via `sac_scale`, or `f.hl` containing `gorge`, with at least 1 mm of rain in the
next three MET Norway forecast days at the trailhead; nothing is shown when the
forecast is unavailable).

### Field stubs

Fields with a slot on the sheet and no source are listed in
`pipeline/field_stubs/t631_water.py` (sunshine hours, lake wind profile and
thermal winds, water temperature for beaches and destinations, ferry line
names, water sport zones, lake lifeguards, swimming bans, currents, lido prices,
surface at the water entry, walk from pier and centre, luxury audience, gorge
flag). `python pipeline/field_stubs/report.py` lists them.

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
| `food_model` | meta | required | food and drink model v2 (T513): method and validation |
| `food_country` | meta | required | food and drink model v2 (T513): the country bases |
| `car_model` | meta | required | app_data.json block; Schema v14 section 2 |
| `n_destinations` | meta | required | app_data.json block |
| `is_mock` | meta | required | app_data.json block |
| `beauty_model` | meta | required | app_data.json block (`beauty.gems`) |
| `flight_model` | meta | required | app_data.json block (`fare_model`) |
| `data_sources` | meta | required | Schema v16 |
| `crowding_model` | meta | required | Schema v17 |
| `activities_model` | meta | required | not yet described |
| `climate_model` | meta | required | not yet described |
| `climate_period` | meta | required | not yet described |
| `country_context_model` | meta | required | not yet described |
| `designation_model` | meta | required | not yet described |
| `image_model` | meta | required | not yet described |
| `member_model` | meta | required | not yet described |
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
| `rating` | destination | some | Schema v14 section 1; on every record except a gateway (T755), which is rated as its city; `tests/test_one_row_per_city.py` holds "rated or a gateway" |
| `gateway_of` | destination | some | T755: on the other airports of a multi-airport city (CIA, ORY, BVA, STN, LTN, LGW, BGY, LIN, TSF, NYO, BMA, WMI, TRF), the id of the city's row; such a record has no `rating` and ranks nowhere, flight search still reads it |
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
  (`q`, `from`, `km`, `n`, `scaled`), and optional `xk` (T540): up to six Xotelo
  properties for the live price, each `[key, kind, stars, band, typ]` (`kind`
  `h` hotel or `g` guesthouse, `stars` 0 when unknown, `band` the hotel price
  quartile 0 to 3 or -1, `typ` the typical night in EUR; written by
  `pipeline/stays/live_keys.py`). The app keeps the newer of the baked copy
  (`public/stays/v1/`) and the monthly refresh (`meta.stays.url`).
- **Observation contract (T643):** every journal row says `currency`, `unit`
  (`bed`, `person`, `room` or `place`), `tax_included`, `from_or_discount`, and
  keeps the page's `price_text` and `per_text`. `build_stays.py` rejects a row
  with an unknown unit or a currency other than EUR and counts rejections per
  source; rows from before the contract take their source's known behaviour
  (`LEGACY`) and count as legacy. Hostelworld's private prices are per person
  (B4 sample, `scripts/hw_unit_sample.py`) and are doubled into a room.
- **One publish path (T645, T646):** `python run_pipeline.py --only stays`.
  `build_stays.py --gate` runs the gate (contract rejections over 5% per source,
  a country x bed tier median moving over 25% or a destination's bed tier over
  40% against the last published copy unless listed in
  `pipeline/stays/gate_explain.json`, a lost country or measured tier, minimum
  samples, the six test destinations, SerpApi references) and writes
  `cache/stays/gate_report.md`. The manifest carries the stamp:
  `gate.passed`, `gate.hash` (sha256 of the country files) and `build` (its
  first 12 characters), plus `levels` and `cc_cov` per country for the next
  comparison. `apply_stays.py` refuses a build without a passed stamp or whose
  files changed after it; `--override "reason"` is the only way round, and the
  reason lands in `meta.stays.override`. Food prices gate inside
  `apply_food_prices.py` (a country basket moving over 25%, key `food:CC` in the
  same explain file) before anything is written.
- **Versioned fetch (T646):** the app asks for each country file as
  `stays/v1/{cc}.json?b={built}` (the baked copy with `meta.stays.built`, the
  live copy with its manifest's `built`), so a fixed build reaches browsers at
  once despite the hour of `max-age` and the day of `stale-while-revalidate`;
  the live manifest is fetched with `cache: 'no-cache'` and network first in
  the service worker.
- **Live (T540):** `/api/stays?k=keys&n=nights&a=adults` (a Pages Function)
  answers Xotelo's median rate per property and night; `liveStays.js` turns it
  into a factor and `bedPrice()` moves a dated hotel or private-room stay by
  `(factor / model season) ^ 0.6`, marked `q: 'live'`.
- **Runtime:** `continent-app/src/lib/stayPrice.js` `bedPrice()` prices night by
  night (each night its month, weekend and peak factors), sizes rooms to the
  party (dorm per bed, rooms `ceil(people / 2)`, the smallest home that sleeps
  the group) and adds `meta.stays.fees` on an entire place only.
- **Refresh:** `.github/workflows/stays-refresh.yml` (weekly Xotelo slice,
  monthly build and gated publish), `scripts/stays_scrape.bat` (owner's laptop,
  March and September), `run_pipeline.py` tasks `stays` and `stays_discover`.

## Explore completeness, practical, things to do and export (T632, added 2026-10-23)

Additive only. Every key below is optional in the dossier (`SCHEMA = "dossier_v2"`
is unchanged) and the app shows "Not available yet" where a key is absent.

| Key (dossier) | Type | Source | Status |
|---|---|---|---|
| `do[].kind` | string, the normalized POI kind (`Viewpoint`, `Cave`, ...) | `derive_do.facts_of`, from the POI shard `kind` | code written, awaiting dossier rebuild |
| `do[].town` | string, nearest member town within 8 km, or the destination name when it has no members | `derive_do.town_of` | code written, awaiting dossier rebuild |
| `around.trails[]` / `around.cycling[]` / `nearby.*[]` `ascent_m`, `descent_m`, `sac_scale` (trails), `duration_min` (cycling riding time, from the wire's `dur.min`) | number (m), number (m), OSM word (`mountain_hiking`, ...), integer minutes | copied from the country wires by `build_dossier.load_layer_index` (T640, T630-h); a key is omitted when the wire row has none, `sac_scale` appears once `export_wire.py` has run with the T630 way tags | code written, awaiting dossier rebuild |
| `do[].fee` | `"yes"` or `"no"` | OSM `fee` tag, not in the POI shards today | stub `harvest_do_fee` |
| `do[].fee_eur` | number | OSM `charge`, Wikidata P2555 | stub `harvest_do_fee` |
| `do[].duration_min` | integer minutes | Wikivoyage / operator pages | stub `harvest_do_duration` |
| `practical.transit.train` / `.bus` / `.ferry` | list of `{name, from, to, minutes?, operator?, source, date, method}` | open GTFS, OSM ferry relations | wired by T641 (bus still a stub) |
| `practical.local_rules` | list of `{code, text, url}` | none known as open data | stub `harvest_local_rules` |
| `water.bans` | list of `{site, from, to, reason}` | EEA prohibitions, regional notices | stub `harvest_swimming_bans` |
| `practical.emergency` | `{number, hospital}` | 112 and OSM | stub `harvest_emergency_contacts` |

Not new keys, now shown by the app: `parking.web.restricted` and
`parking.web.restricted_note` (the warning slot), `parking.spots`,
`parking.park_ride`. The destination PDF prints, per listed hiking and cycling
route, the URL of its route page, where the GPX downloads. Offline map and
emergency contacts in the PDF are stubs (`build_pdf_offline_map`,
`harvest_emergency_contacts`). Stubs live in
`pipeline/field_stubs/t632_practical.py`.

## Explore data fill, open sources for the field stubs (T641, added 2026-10-23)

Additive only; every key is absent, not null, when its harvest has not run or
the source says nothing (absence means "not mapped", never "none"). Price
fields are records `{value, unit, currency, source, date, quality}`, are not
read by any screen and are not added to any total. Harvests write
`cache/<name>.json` as `{"_meta": {...}, "rows": {id: row}}`
(`pipeline/explore_overlay.py`); the exports and the dossier builder merge the
row for the id they write.

| Layer | Key | Shape | Source and licence | Method | Written by |
|---|---|---|---|---|---|
| destinations | `climate.sun_h` (wire `sun_h`) | 12 numbers, sunshine hours per month | NASA POWER ALLSKY_SFC_SW_DWN (open) through Angstrom-Prescott a=0.25 b=0.50 (FAO-56) | modelled | `derive_sunshine.py`, folded by `apply_climate.py` |
| destinations | `climate.water_c` (wire `water_c`) | 12 numbers, C, only when open water lies within 20 km | NASA JPL MUR SST v4.1 monthly mean 2017 to 2022, via NOAA CoastWatch ERDDAP (public domain) | measured | `harvest_sea_temp.py --dests`, folded by `apply_climate.py` |
| destinations | `practical.transit.train` / `.bus` / `.ferry` | list of `{name, from, to, minutes?, operator?, freq_per_day?, trips?, source, date, method}`; a mode with no line is omitted | train and bus: GTFS feeds in `pipeline/transit/feeds.json` that carry a verified commercial licence (today Trenord, CC BY 4.0); ferry: also OpenStreetMap `route=ferry` (ODbL 1.0). `from` and `to` are a destination or one of its member towns | measured | `transit/gtfs_lines.py`, `transit/osm_ferry_legs.py`, `dossier/derive_practical.py` |
| destinations | `practical.emergency` | `{numbers: ["112", ...], general?: "112", hospital?: {name, km_line, lat, lon, emergency, phone?}, src: {numbers, hospital, date, method}}` | Wikidata P2852 (CC0); OSM `amenity=hospital` (ODbL 1.0). Wikidata does not say which service answers which number, so none is labelled; mountain rescue numbers are not in it and are not invented | measured | `harvest_emergency.py` |
| destinations | `water.bans` | list of `{site, reason, lat, lon, src, date, method}` | OSM `swimming=no`, `bathing=no` within 5 km of the centre or a member town (ODbL 1.0). The EEA bathing water layer has no prohibition field | measured | `harvest_swim_bans.py` |
| destinations | `do[].fee` `"yes"`/`"no"`, `do[].price` | `price` = `{value, unit, currency, source, date, quality: "osm_text"}`; `fee_eur` is NOT written | OSM `fee` and `charge` on the object at the POI (ODbL 1.0) | measured | `harvest_poi_fees.py`, `dossier/derive_do.facts_of` |
| lakes | `ferry.lines` | `[{ref, operator?, stops: [...], min?: [lo, hi], n}]` trips folded by (operator, ref) | OSM `route=ferry` relations within 300 m of the lake shape (ODbL 1.0) | measured | `lakes/harvest_water_detail.py` |
| lakes | `sportZones` | `[{sport, name?, lat, lon}]` up to 40, no geometry | OSM `sport=` windsurfing, kitesurfing, sailing, water_ski, wakeboarding, canoe, kayak, rowing, scuba_diving, surfing within 200 m of the lake shape | measured | same |
| lakes | `lifeguards` | `{n, sites: [{n?, lat, lon}]}` | OSM `lifeguard=yes/seasonal`, `emergency=lifeguard*`, `leisure=swimming_area` + `supervised=yes` | measured | same |
| lakes | `swim.ban` | `{n, sites: [...], src: "osm"}` | OSM `swimming=no`, `bathing=no` | measured | same |
| lakes | `wind.profile` | `{ms: [12], src, m: "modelled"}` mean 10 m wind in m/s | NASA POWER WS10M climatology 2001 to 2020 at the lake centre (open). Thermal winds are not in any open source | modelled | same |
| beaches | `sst` | 12 numbers, C | NASA JPL MUR SST, nearest valid cell within 6 km | measured | `harvest_sea_temp.py --beaches`, `export_beaches.v2_fields` |
| beaches | `walkFrom` | `{centre?: {km, min, town, m}, pier?: {km, min, name?, m}}`, `m` = `modelled` | base town and beach positions, OSM ferry terminals within 4 km; straight line x 1.3 at 4.5 km/h, not a routed path | modelled | `beaches/harvest_beach_walks.py` |
| mountains | `lift.hours` (string), `lift.fare` (price record, not shown) | OSM `opening_hours` string kept unparsed; `charge` when it parses to one amount | OSM aerialway and funicular within 2.5 km of the peak | measured | `mountains/harvest_lift_hours.py`, `export_peaks.py` |
| trails | `transit` `{rail?, bus?, ferry?}` | each true only when found within 500 m of the start of the line; the key is absent when none was found | OSM stations, coach stations, bus stops (`highway=bus_stop`, `public_transport=platform` + `bus=yes`) and ferry terminals in `transit_stops` | measured | `trails/transit_stops.py` (new kinds `ferry`, `bus_stop`), `trails/export_wire.py` |

The transit line shape is the contract T642's car rule reads: `practical.transit.train`,
`practical.transit.bus`, `practical.transit.ferry`, each a list of lines
`{name, from, to, minutes?, operator?, source, date, method}`.

The gorge flag needs no new key: 1,224 of 17,619 trails already carry
`f.hl` = `gorge` (OSM `natural=gorge`), which the wet rock warning reads.

Still stubs (no open source, or no licence that allows it), in
`pipeline/field_stubs/`: lido prices, surface at the water entry, luxury
audience, lake currents, lake thermal winds, bus services, local rules, visit
duration, the lift price, the offline map in the PDF.

## Wrong values fixed at the source (T642, added 2026-10-23)

All additive. Existing keys keep their meaning.

| Key | Shape | Source | Notes |
|---|---|---|---|
| `dest.airports[]` | `{iata, straight_km, road_km, ryanair, options[], transfer_min, transfer_mode, transfer_source}` | `pipeline/airport_access.py` (airport tier rows, GTFS) | up to 4 airports within 110 km, nearest first, the anchor always kept. `options[]` is `{mode, minutes, source}` with source `road_estimate` (mode `car`, haversine x 1.3 at 65 km/h) or `gtfs:<feed>+access_estimate` (mode `train`, median door to door over a Wednesday, 07:00 to 21:00 every 30 min). |
| `dest.transfer.transfer_mode` / `transfer_mode_source` | `"car"` / `"road_estimate"` | `apply_airport_anchors.py` | the existing `transfer_minutes_one_way` is the road estimate, now labelled. |
| `practical.getting_there.airports[]` | `{iata, km, transfer_min, transfer_mode, options[]}` | `build_dossier.py` | read by GettingThere and the Airport key fact. |
| `dest.local_transport.car_basis` | `"category"` or `"transit_lines"` | `car_layer.py` | `transit_lines` when `practical.transit.*` decided the value. |
| `dest.local_transport.car_useful_for` | string | `car_layer.py` | what a car still adds where it is optional (remote valleys, trailheads). |
| `dest.local_transport.parking_hard` | bool | `cache/parking_osm.json` | fewer than 2 public lots within 1.5 km of the centre; absent without a parking harvest. |
| `dest.local_transport.fare` | `{ride_eur, day_pass_eur, currency, source, date, quality}` | not produced yet (price plan F8, T714: a fare source is open) | optional, additive. The app's engine (`lib/price/priceDay.js`) prices local transport a person a day from it, times `config/pricing.json transport.rides_per_day` by `place.class`, capped by the day pass, and puts it in the day price; absent means the day is bed and food, never a zero. `quality` is `measured` or `modelled`. |
| `dest.crowding.monthly` | `{share[12], tier[12], geo, years[], source}` | Eurostat `tour_occ_nin2m` (NUTS 2, else country) | `share` is the month's part of the year's nights; `tier[i]` is the annual tier moved by that month's seasonality (T649, see below; the T642 rule applied the annual cutoffs to density x 12 x share and left almost every place flat). |
| trips `difficulty` | grade, else the old class raised to the distance/ascent ladder and SAC grade | `export_wire.wire_difficulty` | never below the floors `attributes.py` applies. |
| lake `beaches[]` | `{id, n, km}` | `lake_outlines.py`, `cache/lake_outlines.json` | beaches within 400 m of the lake outline, any `inland` value; no outline falls back to the old circle plus `inland`. |

## Crowds by month (T649, added 2026-10-24)

`crowding.monthly.tier[i]` uses the same scale as `crowding.tier`: 0 quiet, 1 moderate, 2 busy, 3 crowded.
`crowding.monthly.rule` is the rule version (`t649-v1`). Shape otherwise unchanged
(`share[12]`, `tier[12]`, `geo`, `years[]`, `source`, `rule`); `meta.crowding_model.monthly_rule` records the constants.

Rule (`harvest_tourism_density.month_tier`): `ratio = share * 12` (1.0 is an even month);
`shift = round(SEASON_GAIN * log2(ratio))`, zero when its size is under `SEASON_DEAD_BAND`, then clamped to
`-SEASON_MAX_DOWN .. +SEASON_MAX_UP`; `tier[i] = clamp(annual tier + shift, 0, 3)`.
Constants: `SEASON_GAIN` 3.0, `SEASON_MAX_UP` 1, `SEASON_MAX_DOWN` 2, `SEASON_DEAD_BAND` 0.5.
Seasonality is regional (NUTS 2, else country), so two places in one region share a share curve and differ
only through their annual tier.


## Mobility score (T650, added 2026-10-24)

Additive. `local_transport.car_needed`, `car_basis`, `car_useful_for` (string) and `parking_hard` keep their T642 meaning;
`car_needed` is read by the price plan's car line and stays.

| Key | Shape | Source | Notes |
|---|---|---|---|
| `dest.local_transport.mobility` | `{car_free, modes[], car_useful_for?[], parking_hard?, basis, source}` | `car_layer.mobility_for`, written by `apply_car_layer.py` | one grade of how well the place works without a car |
| `mobility.car_free` | `"good"`, `"ok"` or `"hard"` | lines, else the category rule | good: rail or ferry plus a second mode (the T642 `transit_service` "served" rule); ok: one mode ("thin"); hard: a remote category (`REMOTE_STRONG`, unless the place is also tagged `city`), an island without a ferry line, or a place the category rule sends to a car and no line contradicts |
| `mobility.modes` | subset of `["train","bus","ferry"]` in that order, may be `[]` | `practical.transit` | `[]` whenever basis is `category`: no line is ever invented |
| `mobility.car_useful_for` | codes from `trailheads`, `lake_villages`, `countryside`, in `USEFUL_FOR` order, every match | categories | omitted when none match; the T642 string next to it is unchanged |
| `mobility.parking_hard` | bool | `cache/parking_osm.json` | omitted when no parking harvest covers the place; true when fewer than 2 public lots lie within 1.5 km of the centre |
| `mobility.basis` | `"transit_lines"` or `"category"` | | `transit_lines` when `practical.transit` lines gave the grade. Without them (every place outside a harvested feed) the grade is the category rule: tagged `city` or transit_quality excellent gives good, any other place the rule does not send to a car gives ok, a place it sends to a car gives hard |
| `mobility.source` | string | | for example `practical.transit (Trenord) + categories`, or `categories (no transit lines for this place)` |

`crowding.monthly` and `local_transport.mobility` reach the app wire unchanged: `sync-data.mjs` has no strip rule for either block.
