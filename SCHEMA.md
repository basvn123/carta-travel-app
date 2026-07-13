# app_data schema - v13

The pipeline and the React app share one contract. A trip is priced three ways,
all from real data:

1. **Getting there** - either the cheapest Ryanair round-trip for the chosen
   dates, OR (for destinations within `max_drive_km` road km of home and road-
   reachable) the fuel + tolls to drive there and back. The app lets you switch
   between the two; the map can be re-priced for either mode.
2. **Accommodation** - an Airbnb entire-home nightly estimate, adjusted for
   season, length-of-stay discount, and the cleaning + service fees a traveller
   actually pays.
3. **On-the-ground** - the user's lifestyle (dinners, casual meals, fast food,
   bar drinks, club nights, coffees, self-catered days) priced at the
   destination's real local rates.

A fourth layer, **a car at the destination**, is added when a destination needs
one (`local_transport.car_needed`) AND you arrive by plane: an economy rental,
scaled by nights and group size. If you drove there, you already have a car, so
no rental is added.

Notebook `05_export_app` writes `app_data.json`; the app reads it via
`runtime_pricing.js`. Cost data comes from `03_costs` (Numbeo anchors + Eurostat
PLI). Accommodation data comes from `03b_accommodation` (Inside Airbnb anchors +
Eurostat PLI).

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
    "accommodation_model": {                  // applied at runtime per trip
      "service_fee_pct": 14.0,                // Airbnb guest service fee
      "cleaning_fee_frac_of_night": 0.5,      // how the stored cleaning fee was derived
      "weekly_discount_pct": 8.0,             // stays >= min_nights_for_weekly
      "min_nights_for_weekly": 7,
      "seasonality": { "1": 0.82, ..., "7": 1.35, "8": 1.35, ..., "12": 0.92 },
      "assumptions": "entire home/apt; stored value is the annual median ..."
    },
    "accommodation_validation": { "overall_mae_pct": 16.9, "n_checks": 13 },
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
        "level": "country",         // "city" (override) or "country"
        "price_source": "numbeo_direct"  // numbeo_city | numbeo_direct | pli_scaled
      },
      "accommodation": {            // Airbnb anchor (EUR); null if unknown
        "per_person_night_eur": 30.0,    // annual median entire-home base, per head (no fees)
        "cleaning_per_person_eur": 15.0, // cleaning fee per booking, per head
        "entire_home_night_eur": 120,    // headline whole-home median nightly (display)
        "typical_capacity": 4,           // listing capacity the per-head figure assumes
        "level": "city",                 // "city" (override) or "country"
        "price_source": "inside_airbnb_city" // inside_airbnb_city | inside_airbnb_country | airbnb_pli_scaled
      },
      "local_transport": {          // "do I need a car here?" (category estimate)
        "car_needed": false,             // true -> a rental is added when you fly in
        "transit_quality": "excellent",  // excellent | good | limited | poor
        "reason": "Compact and well served by public transport - skip the car.",
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
      "image": {                    // schema v10 (harvest_images.py) - null if none
        "url": "https://upload.wikimedia.org/.../900px-...jpg",  // sized hero (~900px)
        "hires": "https://upload.wikimedia.org/.../...jpg",      // full-res original
        "credit": "Bruges",              // Wikipedia article title
        "page": "https://en.wikipedia.org/wiki/Bruges",          // attribution link
        "source": "wikipedia"
      },
      "activities": {               // schema v10 (harvest_activities.py) - null if none
        "source": "wikivoyage",          // opentripmap | wikivoyage | wikipedia_geosearch
        "items": [                       // up to 8 real named attractions
          { "name": "Grote Markt", "kind": "Square" },
          { "name": "Groeninge Museum", "kind": "Museum", "link": "https://..." }
        ],
        "items_full": [                  // schema v11 - OpenTripMap-sourced dests ONLY;
                                          // absent otherwise. Up to 40 sights + up to 12
                                          // "get active" POIs, WITH coordinates - Day
                                          // Planner's pool for day-by-day assignment and
                                          // map pins. Falls back to `items` (name-only,
                                          // no coordinates) when this key is missing.
          {
            "name": "Grote Markt", "kind": "Square", "lat": 51.208, "lon": 3.225,
            "rate": 3,                    // v12: OTM importance 0..3 (3 = must-see tier).
                                          // Drives the Day planner's must-see gradation.
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
  the destination itself (curated gems, and auto-anchored places - see below),
  `ground_transport_one_way_eur` is a per-person one-way bus/shuttle fare. The app
  counts it **round-trip, per person** and includes it in the plane total
  (`transfer_total`). It is 0 for destinations you fly straight into, and skipped
  in car mode.
- **Driving (car mode):** only when `road_connected` and the road distance
  (`haversine(home, dest) * road_detour_factor`) is `<= max_drive_km`. Number of
  cars = `ceil(group / car_capacity)`. Cost = `cars * 2*road_km *
  (consumption/100) * fuel_price[iso2]` (fuel) `+ cars * 2*road_km/100 *
  toll_per_100km` (tolls). No baggage, no per-person multiply - it is already a
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

## Flight data provenance (notebook 02_flights + fix_data.py)

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
  (and are not islands) - i.e. that airport basically *is* the city's airport
  (Venice Marco Polo/Treviso, Rome Ciampino/Fiumicino) - are given that airport's
  fare calendar plus an estimated transfer (`anchor_airport`,
  `ground_transport_one_way_eur` from ~0.15 EUR/road-km, floored 10 / capped 60).
  Such dests are flagged `anchor_estimated: true` and `no_ryanair_route: false`.
  Idempotent: a re-run resets prior auto-anchors first. Everything farther stays
  `no_ryanair_route: true` - the app still shows those, flagged unreachable via
  Ryanair (muted map dot + a separate list section), it just doesn't price them.

## Cost data provenance (notebook 03_costs)

- Real **Numbeo** euro prices for **23 anchor countries + 22 cities** (June 2026,
  cached in `cache/numbeo_raw.json`), covering 6 dining/drink items per location.
- `cocktail_eur` (= imported beer x 2.4) and `club_entry_eur` (Belgium-anchored,
  PLI-scaled) are estimates - Numbeo has no direct item; see `meta.estimated_items`.
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

## Accommodation provenance (notebook 03b_accommodation)

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

## Served data split (added 2026-07-12)

The master `app_data/app_data.json` is unchanged, but `continent-app/scripts/sync-data.mjs`
now splits it for the wire at dev/build time:

- `public/app_data.json` — core dataset; `activities.items_full` and `image.hires` removed
- `public/activities_full.json` — `{ destinationId: items_full }`, lazy-fetched by the Day planner
- `public/country_insights.json` — copy of `app_data/country_insights.json` (schema v1):
  `{ generated_at, schema_version, countries: { <Country Name>: { iso2, currency, languages,
  budget_level, daily_budget_eur:[lo,hi], best_months, best_time_note, rail{operator,url,note},
  bus{operators,url,note}, driving{side,vignette,tolls,warnings,car_recommended_for,car_not_needed_in},
  must_see:[{name,region,why}], insights:[..], food:[..], events:[..], sources:[..] } } }`
