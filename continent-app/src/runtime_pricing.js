/**
 * runtime_pricing.js - schema v7
 *
 * Three layers, all from real data:
 *   1. Flights - cheapest Ryanair round-trip for the chosen dates (dest.routes).
 *   2. Accommodation - an Airbnb entire-home nightly estimate (dest.accommodation),
 *      adjusted for season, length-of-stay discount, cleaning + service fees so it
 *      matches what a traveller actually pays. Params: meta.accommodation_model.
 *   3. On-the-ground - the user's lifestyle (dinners/lunches/drinks/coffees/
 *      self-catered days) priced at the destination's real local rates
 *      (dest.costs). See SCHEMA.md for the contract.
 */

// Nights between two ISO date strings (return must be >= depart).
export function tripDaysBetween(departDate, returnDate) {
  if (!departDate || !returnDate) return 0;
  const d1 = new Date(departDate + 'T00:00:00Z');
  const d2 = new Date(returnDate + 'T00:00:00Z');
  return Math.max(0, Math.round((d2 - d1) / 86400000));
}

// Default lifestyle if app_data / choices don't supply one (per person).
// `cadence` ('week' | 'day') is how the user reads/edits the frequencies: the six
// per-period counts below are interpreted per-week or per-day accordingly. Coffees
// are always per-day. Defaults are expressed in the weekly cadence.
export const DEFAULT_LIFESTYLE = {
  cadence: 'week',
  dinners_per_week: 5,
  lunches_per_week: 4,
  fastfood_per_week: 2,
  drinks_per_week: 7,
  club_nights_per_week: 1,
  coffees_per_day: 1,
  self_catered_days_per_week: 2,
};

// A club night = cover charge + this many premium drinks.
export const CLUB_DRINKS_PER_NIGHT = 3;

// Fallback car model if app_data.meta.car_model is missing. Mirrors car_layer.py:
// drives the "compare car vs plane" estimate (fuel + tolls to get there) and the
// "rent a car at the destination" estimate. See SCHEMA.md.
export const DEFAULT_CAR_MODEL = {
  consumption_l_per_100km: 6.5,
  fuel_price_eur_per_l: 1.81,
  fuel_price_by_iso2: {},
  road_detour_factor: 1.3,
  toll_eur_per_100km: 2.2,
  avg_speed_kmh: 90,
  car_capacity: 4,
  max_drive_km: 700,
  rental_eur_per_day_by_iso2: {},
  rental_eur_per_day_default: 42,
  rental_weekly_discount_pct: 15.0,
  // Day-rates are annual midpoints; this multiplies them by the depart month so
  // summer trips (what this app prices) land near each range's top. Mirrors the
  // accommodation seasonality with a gentler peak. Overridden by meta.car_model.
  rental_seasonality: {
    1: 0.85, 2: 0.85, 3: 0.90, 4: 0.95, 5: 1.05, 6: 1.15,
    7: 1.25, 8: 1.25, 9: 1.10, 10: 0.98, 11: 0.88, 12: 0.90,
  },
};

// Great-circle distance in km between two lat/lon points.
export function haversineKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// How many cars a group needs (split by seats used per car).
export function carsForGroup(groupSize, capacity) {
  return Math.max(1, Math.ceil(Math.max(1, groupSize) / Math.max(1, capacity || 4)));
}

/** Cost of *driving there and back* for the whole group, or null if the trip is
 *  not road-reachable or beyond `max_drive_km`. Fuel + a motorway-toll allowance,
 *  multiplied by the number of cars the group fills. Comparable to the plane fare.
 */
export function drivingEstimate(dest, home, choices, model) {
  if (!home || !dest || dest.lat == null || dest.lon == null) return null;
  const m = { ...DEFAULT_CAR_MODEL, ...(model || {}) };
  const lt = dest.local_transport || {};
  if (lt.road_connected === false) return null;      // islands / sea-separated

  const straight = haversineKm(home.lat, home.lon, dest.lat, dest.lon);
  if (straight == null) return null;
  const roadKm = straight * (m.road_detour_factor || 1.3);
  if (roadKm > (m.max_drive_km || 700)) return null;

  const group = Math.max(1, choices.group_size || 1);
  const cars = carsForGroup(group, m.car_capacity);
  const rtKm = roadKm * 2;                            // round trip
  const fuelPrice = (m.fuel_price_by_iso2 && m.fuel_price_by_iso2[dest.iso2]) || m.fuel_price_eur_per_l;
  const fuel = cars * rtKm * ((m.consumption_l_per_100km || 0) / 100) * fuelPrice;
  const tolls = cars * (rtKm / 100) * (m.toll_eur_per_100km || 0);
  const total = fuel + tolls;

  return {
    road_km: Math.round(roadKm),
    straight_km: Math.round(straight),
    cars,
    fuel_price_eur_per_l: round2(fuelPrice),
    fuel_total: round2(fuel),
    toll_total: round2(tolls),
    total: round2(total),
    per_person: round2(total / group),
    drive_hours_one_way: Math.round((roadKm / (m.avg_speed_kmh || 90)) * 10) / 10,
  };
}

/** Cost of *renting a car at the destination* for the stay, or null if the
 *  destination does not need one. Economy day-rate x days x number of cars, with
 *  a summer-season uplift on the day-rate (the stored rate is an annual midpoint)
 *  and a weekly discount for stays of 7+ nights. Scales with trip length & group.
 */
export function rentalEstimate(dest, nights, choices, model, departDate) {
  const lt = dest.local_transport || {};
  if (!lt.car_needed) return null;
  const m = { ...DEFAULT_CAR_MODEL, ...(model || {}) };
  const days = Math.max(1, nights);
  const group = Math.max(1, choices.group_size || 1);
  const cars = carsForGroup(group, m.car_capacity);
  const baseRate = (m.rental_eur_per_day_by_iso2 && m.rental_eur_per_day_by_iso2[dest.iso2])
    || lt.rental_eur_per_day || m.rental_eur_per_day_default;
  // Summer rentals cost more - lift the annual-midpoint day-rate by depart month.
  const month = departDate ? Number(departDate.slice(5, 7)) : null;
  const season = (month && m.rental_seasonality && m.rental_seasonality[month] != null)
    ? m.rental_seasonality[month] : 1;
  const rate = baseRate * season;
  const gross = cars * days * rate;
  const disc = days >= 7 ? (m.rental_weekly_discount_pct || 0) / 100 : 0;
  const total = gross * (1 - disc);
  return {
    cars,
    days,
    rate: round2(rate),            // effective day-rate after season
    base_rate: round2(baseRate),   // stored annual midpoint
    season,
    discount_pct: Math.round(disc * 100),
    total: round2(total),
    per_person: round2(total / group),
  };
}

// Fallback accommodation model if app_data.meta.accommodation_model is missing.
// Mirrors notebook 03b: turns the stored annual-median nightly into what a
// traveller actually pays (fees + season + length-of-stay discount).
export const DEFAULT_ACCOM_MODEL = {
  service_fee_pct: 14.0,
  cleaning_fee_frac_of_night: 0.5, // informational; cleaning is stored per destination
  weekly_discount_pct: 8.0,
  min_nights_for_weekly: 7,
  seasonality: {
    1: 0.82, 2: 0.82, 3: 0.90, 4: 0.98, 5: 1.08, 6: 1.22,
    7: 1.35, 8: 1.35, 9: 1.15, 10: 1.00, 11: 0.85, 12: 0.92,
  },
};

/** Per-person accommodation cost for the trip, broken down. Returns null if the
 *  destination has no accommodation anchor.
 *  Applies, in order: summer seasonality on the nightly, a weekly discount for
 *  stays >= the threshold, then the (per-booking) cleaning fee, then the service
 *  fee on the whole subtotal - the same order Airbnb shows at checkout.
 */
export function accommodationPerPerson(dest, nights, departDate, model) {
  const a = dest.accommodation;
  if (!a || a.per_person_night_eur == null) return null;
  const m = { ...DEFAULT_ACCOM_MODEL, ...(model || {}) };
  const n = Math.max(0, nights);

  // Seasonality keyed by the depart month (string or number keys both work).
  const month = departDate ? Number(departDate.slice(5, 7)) : null;
  const season = (month && m.seasonality && m.seasonality[month] != null)
    ? m.seasonality[month] : 1;

  // Length-of-stay (weekly) discount.
  const los = n >= (m.min_nights_for_weekly || 7)
    ? 1 - (m.weekly_discount_pct || 0) / 100 : 1;

  const nightlyPp = (a.per_person_night_eur || 0) * season;
  const lodging   = nightlyPp * n * los;
  const cleaning  = a.cleaning_per_person_eur || 0;   // once per booking, per person
  const subtotal  = lodging + cleaning;
  const withFees  = subtotal * (1 + (m.service_fee_pct || 0) / 100);

  return {
    nightly_pp: round2(nightlyPp),     // effective per-person nightly after season
    lodging: round2(lodging),
    cleaning: round2(cleaning),
    service: round2(withFees - subtotal),
    season,
    los,
    total: round2(withFees),
  };
}

/** Cheapest origin's outbound+return fare for the given dates, or null. */
export function pickFareForDates(dest, departDate, returnDate, originPref = 'auto') {
  const routes = dest.routes || {};
  const origins = originPref && originPref !== 'auto'
    ? (routes[originPref] ? [originPref] : [])
    : Object.keys(routes);
  let best = null;
  for (const o of origins) {
    const r = routes[o];
    const out = r.outbound_fare?.[departDate];
    const ret = r.return_fare?.[returnDate];
    if (out == null || ret == null) continue;
    const fare = out + ret;
    if (best == null || fare < best.fare) {
      best = {
        fare,
        origin: o,
        out_eur: out,
        in_eur: ret,
        anchor_airport: r.anchor_airport || dest.iata,
        ground_eur: r.ground_transport_one_way_eur || 0,
        ground_minutes: r.ground_transport_minutes || 0,
      };
    }
  }
  return best;
}

/** Per-person on-the-ground spend for the trip, broken down by activity.
 *  Returns null if the destination has no cost basket.
 */
export function groundSpendPerPerson(dest, nights, lifestyle) {
  const c = dest.costs;
  if (!c) return null;
  const ls = { ...DEFAULT_LIFESTYLE, ...(lifestyle || {}) };
  const safeNights = Math.max(0, nights);
  // The six period-counts are read per the chosen cadence: multiply by the number
  // of days (daily cadence) or weeks (weekly cadence). Coffees are always per-day.
  const periods = ls.cadence === 'day' ? safeNights : safeNights / 7;

  const dinners   = (ls.dinners_per_week || 0)           * periods * (c.meal_mid_eur   || 0);
  const lunches   = (ls.lunches_per_week || 0)           * periods * (c.meal_cheap_eur || 0);
  const fastfood  = (ls.fastfood_per_week || 0)          * periods * (c.fastfood_eur   || 0);
  const drinks    = (ls.drinks_per_week || 0)            * periods * (c.drink_out_eur  || 0);
  const coffees   = (ls.coffees_per_day || 0)            * safeNights * (c.coffee_eur  || 0);
  const groceries = (ls.self_catered_days_per_week || 0) * periods * (c.grocery_day_eur|| 0);

  // A club night = cover charge + a few premium drinks.
  const clubCostPerNight = (c.club_entry_eur || 0) + CLUB_DRINKS_PER_NIGHT * (c.cocktail_eur || 0);
  const clubbing  = (ls.club_nights_per_week || 0)       * periods * clubCostPerNight;

  return {
    dinners: round2(dinners),
    lunches: round2(lunches),
    fastfood: round2(fastfood),
    drinks: round2(drinks),
    clubbing: round2(clubbing),
    coffees: round2(coffees),
    groceries: round2(groceries),
    total: round2(dinners + lunches + fastfood + drinks + clubbing + coffees + groceries),
  };
}

/** Full trip cost for these dates + choices. Prices the trip two ways and picks
 *  the one in `choices.transport_mode` ('plane' | 'car'):
 *    - plane: cheapest Ryanair round-trip + baggage; plus a rental car at the
 *      destination when one is needed there.
 *    - car  : fuel + tolls to drive there and back (only if road-reachable and
 *      within max_drive_km); no rental - you brought your own car.
 *  Accommodation + on-the-ground are added the same way for both. Always exposes
 *  plane_grand_total and car_grand_total so the UI can compare. Returns null if
 *  the destination cannot be reached either way for these dates.
 */
export function composeTrip(dest, departDate, returnDate, choices) {
  if (!dest || !departDate || !returnDate || returnDate <= departDate) return null;

  const groupSize = Math.max(1, choices.group_size || 1);
  const nights = Math.max(1, tripDaysBetween(departDate, returnDate));
  const home = choices.home || null;
  const carModel = choices.car_model || null;

  // Accommodation + on-the-ground are the same whichever way you travel.
  const accom = accommodationPerPerson(dest, nights, departDate, choices.accommodation_model);
  const accomPerPerson = accom ? accom.total : 0;
  const accomTotal = accomPerPerson * groupSize;

  const ground = groundSpendPerPerson(dest, nights, choices.lifestyle);
  const groundPerPerson = ground ? ground.total : 0;
  const groundTotal = groundPerPerson * groupSize;

  const stayTotal = accomTotal + groundTotal;

  // --- Plane option: flights + baggage, and a rental if a car is needed there.
  const fare = pickFareForDates(dest, departDate, returnDate, choices.origin_pref);
  const baggageRt = (choices.baggage_per_direction_eur || 0) * 2;
  const rental = rentalEstimate(dest, nights, choices, carModel, departDate); // null if not needed
  const rentalTotal = rental ? rental.total : 0;

  // Airport transfer: for gems / anchored dests the flight lands at an anchor
  // airport and you finish the trip by bus/shuttle. ground_eur is a per-person
  // one-way fare, so count it round-trip and per person. Zero for dests you fly
  // straight into (ground_eur = 0).
  const transferPpOneWay = fare ? (fare.ground_eur || 0) : 0;
  const transferPerPerson = transferPpOneWay * 2;          // there + back
  const transferTotal = transferPerPerson * groupSize;

  let flightPerPerson = null, flightTotal = null, planeGrand = null;
  if (fare) {
    flightPerPerson = fare.fare + baggageRt;
    flightTotal = flightPerPerson * groupSize;
    planeGrand = flightTotal + transferTotal + rentalTotal + stayTotal;
  }

  // --- Car option: drive there & back. You have your car, so no rental.
  const driving = drivingEstimate(dest, home, choices, carModel); // null if not drivable
  const drivable = !!driving;
  const carGrand = drivable ? driving.total + stayTotal : null;

  // --- Pick the effective mode.
  const wantCar = choices.transport_mode === 'car';
  let mode = wantCar && drivable ? 'car' : 'plane';
  if (mode === 'plane' && planeGrand == null) {
    if (drivable) mode = 'car';        // no flight, but we can drive
    else return null;                  // unreachable for these dates
  }

  const grandTotal = mode === 'car' ? carGrand : planeGrand;
  const grandPerPerson = grandTotal / groupSize;
  const lt = dest.local_transport || null;

  return {
    nights,
    transport_mode:     mode,            // the mode actually priced
    requested_mode:     choices.transport_mode || 'plane',
    drivable,

    // Flights (present when a fare exists)
    origin:             fare?.origin || null,
    anchor_airport:     fare?.anchor_airport || null,
    ground_one_way_eur: fare?.ground_eur || 0,
    ground_minutes:     fare?.ground_minutes || 0,
    fare_per_person:    fare ? round2(fare.fare) : null,
    fare_out_eur:       fare ? round2(fare.out_eur) : null,
    fare_in_eur:        fare ? round2(fare.in_eur) : null,
    fare_total:         fare ? round2(fare.fare * groupSize) : null,
    baggage_per_person: round2(baggageRt),
    baggage_total:      round2(baggageRt * groupSize),
    flight_per_person:  flightPerPerson != null ? round2(flightPerPerson) : null,
    flight_total:       flightTotal != null ? round2(flightTotal) : null,

    // Airport->destination transfer (bus/shuttle), round-trip. 0 when you fly
    // straight in (no anchor). Now included in plane_grand_total.
    transfer_one_way_eur: round2(transferPpOneWay),
    transfer_per_person:  round2(transferPerPerson),
    transfer_total:       round2(transferTotal),

    // Driving (present when drivable)
    driving:            driving,         // group-total breakdown (fuel + tolls)

    // Local transport / rental at the destination
    local_transport:    lt,
    rental:             rental,          // group-total breakdown (null if not needed)
    rental_total:       round2(rentalTotal),

    // Accommodation (per person + totals)
    accom_level:        dest.accommodation?.level || null,
    accom_source:       dest.accommodation?.price_source || null,
    accom_entire_home_night_eur: dest.accommodation?.entire_home_night_eur ?? null,
    accommodation:      accom,
    accom_per_person:   round2(accomPerPerson),
    accom_total:        round2(accomTotal),

    // On-the-ground (per person + totals)
    cost_level:         dest.costs?.level || null,
    price_source:       dest.costs?.price_source || null,
    ground:             ground,
    ground_per_person:  round2(groundPerPerson),
    ground_total:       round2(groundTotal),

    // Totals for both options (for the plane/car comparison) + the selected one.
    plane_grand_total:  planeGrand != null ? round2(planeGrand) : null,
    car_grand_total:    carGrand != null ? round2(carGrand) : null,
    grand_total:        round2(grandTotal),
    grand_total_pp:     round2(grandPerPerson),
  };
}

/** Cheapest bookable total for these dates, or null. */
export function cheapestTotal(dest, departDate, returnDate, choices) {
  const b = composeTrip(dest, departDate, returnDate, choices);
  return b ? b.grand_total : null;
}

function round2(v) {
  return v == null ? null : Math.round(v * 100) / 100;
}

// Flight booking deeplink (Skyscanner) - the one external service the app links to.
// `origin` must be the SAME airport the displayed fare departs from (e.g. CRL for
// a Charleroi/Ryanair fare, not Brussels BRU) so the Skyscanner search matches the
// price we show. The search is always per-person (adultsv2=1) - the app shows a
// per-person fare, and Skyscanner otherwise reports a group total that won't line up.
export function buildFlightLinks({ origin, destIata, departDate, returnDate }) {
  if (!origin || !destIata || !departDate || !returnDate) {
    return { skyscanner: null };
  }
  const fmt = (d) => d.replaceAll('-', '').slice(2); // YYMMDD
  const skyscanner =
    `https://www.skyscanner.net/transport/flights/${origin.toLowerCase()}/${destIata.toLowerCase()}/` +
    `${fmt(departDate)}/${fmt(returnDate)}/?adultsv2=1&cabinclass=economy&rtn=1`;
  return { skyscanner };
}

/** Airbnb search deeplink for the destination, prefilled with dates and guests.
 *  The accommodation price is an estimate; this lets the user verify/book real
 *  listings. Searches the city (Airbnb has no per-listing deeplink we can know).
 */
export function buildAccommodationLink({ city, country, departDate, returnDate, groupSize = 1 }) {
  if (!city || !departDate || !returnDate) return null;
  const where = encodeURIComponent([city, country].filter(Boolean).join(', '));
  const adults = Math.max(1, groupSize | 0);
  return (
    `https://www.airbnb.com/s/${where}/homes` +
    `?checkin=${departDate}&checkout=${returnDate}` +
    `&adults=${adults}&room_types[]=Entire%20home%2Fapt`
  );
}

/** Car-rental search deeplink (KAYAK) for the destination, prefilled with pickup
 *  and drop-off dates. Prefers the destination's airport IATA (unambiguous - e.g.
 *  BCN) and falls back to the city name for gems with no airport of their own.
 *  (KAYAK mis-geocodes a "City, Country" string, so never pass the country.)
 *  Lets the user verify/book a real rental - the figure in the breakdown is an
 *  estimate. Offered for every destination, not only the ones a car is needed at.
 */
export function buildCarRentalLink({ city, iata, departDate, returnDate }) {
  if (!departDate || !returnDate) return null;
  const place = iata ? iata.toUpperCase() : (city ? encodeURIComponent(city) : null);
  if (!place) return null;
  return `https://www.kayak.com/cars/${place}/${departDate}/${returnDate}`;
}

/** Link to a smart Google search that surfaces everything a traveller needs to
 *  know about the destination - top attractions, food, neighbourhoods, itinerary
 *  and first-timer tips - rather than a single fixed guide page. The airport
 *  qualifier in some city names ("Warsaw (Chopin)") is stripped so the search
 *  lands on the city, not the airport. Used for the "What to do in X" link.
 */
export function buildGuideLink({ city }) {
  if (!city) return null;
  const clean = city.replace(/\s*\(.*?\)\s*/g, '').trim();
  if (!clean) return null;
  const query = `${clean} travel guide: top attractions, things to do, food and first-timer tips`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

/** "Best trips from here": the closest OTHER destinations in the catalogue that
 *  are realistically reachable as a side-trip - within `maxKm` straight-line of
 *  the selected place. Pure computation over the loaded dataset (no new source),
 *  so each suggestion is already priced and imaged - click to switch to it.
 *
 *  @param dest      the selected destination record
 *  @param allDests  data.destinations (object id->record)
 *  @param opts.maxKm     straight-line cutoff (default 160 km ~ a day trip)
 *  @param opts.limit     how many to return (default 4)
 *  @returns [{ id, city, country, km, beauty, image, gems }]
 */
export function nearbyTrips(dest, allDests, { maxKm = 160, limit = 4 } = {}) {
  if (!dest || dest.lat == null || !allDests) return [];
  const out = [];
  for (const [id, d] of Object.entries(allDests)) {
    if (id === dest.id || d.lat == null) continue;
    if (d.city === dest.city) continue;             // same place, different airport
    const km = haversineKm(dest.lat, dest.lon, d.lat, d.lon);
    if (km == null || km > maxKm || km < 4) continue;
    out.push({
      id,
      city: d.city,
      country: d.country,
      iso2: d.iso2,
      km: Math.round(km),
      gems: d.beauty?.gems ?? null,
      beauty: d.beauty?.score ?? 0,
      image: d.image?.url || null,
    });
  }
  // Closest first, but let a clearly-more-beautiful neighbour edge ahead a little
  // so the suggestions aren't just "the nearest dots" but "the best nearby trips".
  out.sort((a, b) => (a.km - a.beauty * 6) - (b.km - b.beauty * 6));
  return out.slice(0, limit);
}
