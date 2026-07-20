/**
 * runtime_pricing.js, schema v7
 *
 * Three layers, all from real data:
 *   1. Flights, cheapest Ryanair round-trip for the chosen dates (dest.routes).
 *   2. Accommodation, an Airbnb entire-home nightly estimate (dest.accommodation),
 *      adjusted for season, length-of-stay discount, cleaning + service fees so it
 *      matches what a traveller actually pays. Params: meta.accommodation_model.
 *   3. On-the-ground, the user's lifestyle (dinners/lunches/drinks/coffees/
 *      self-catered days) priced at the destination's real local rates
 *      (dest.costs). See SCHEMA.md for the contract.
 */

import { round2 } from './math.js';
import { addDays } from './dates.js';

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
  coffees_per_day: 0,
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
  max_drive_km: 3500,   // reach any road-connected European destination (islands gated by road_connected)
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

// The city-centre coordinate of a destination. Airport-tier rows store their
// AIRPORT lat/lon (where Ryanair lands); city_lat/city_lon (schema v13) is the
// actual centre. Use this whenever the question is "how far is X from the town
// itself", day-trip travel advice, day-planner map centring, POI radii, not
// "how far did the plane fly" (that legitimately measures to the airport).
// Falls back to the stored coordinate when no city centre is set.
export function cityCoords(dest) {
  if (!dest) return { lat: null, lon: null };
  return {
    lat: dest.city_lat != null ? dest.city_lat : dest.lat,
    lon: dest.city_lon != null ? dest.city_lon : dest.lon,
  };
}

// A shallow copy of a destination with lat/lon swapped for its city centre, so
// existing helpers that read dest.lat/lon measure from the town, not the runway.
export function withCityCoords(dest) {
  if (!dest) return dest;
  const { lat, lon } = cityCoords(dest);
  return { ...dest, lat, lon };
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

  // Drive to the town, not the runway: airport-tier rows keep the airport in
  // lat/lon, but nobody road-trips to Skavsta when the stay is in Stockholm.
  const dc = cityCoords(dest);
  const straight = haversineKm(home.lat, home.lon, dc.lat, dc.lon);
  if (straight == null) return null;
  const roadKm = straight * (m.road_detour_factor || 1.3);
  if (roadKm > (m.max_drive_km || 700)) return null;

  const group = Math.max(1, choices.group_size || 1);
  const cars = carsForGroup(group, m.car_capacity);
  const rtKm = roadKm * 2;                            // round trip
  const fuelPrice = (m.fuel_price_by_iso2 && m.fuel_price_by_iso2[dest.iso2]) || m.fuel_price_eur_per_l;
  const fuel = cars * rtKm * ((m.consumption_l_per_100km || 0) / 100) * fuelPrice;
  // Tolls: prefer the per-country corridor estimate (dest.driving_toll, toll
  // layer v14: real peage/vignette/bridge rates per country crossed); the flat
  // per-100km allowance remains the fallback for unmapped destinations.
  const dt = dest.driving_toll;
  const tolls = dt?.total_rt_eur != null
    ? cars * dt.total_rt_eur
    : cars * (rtKm / 100) * (m.toll_eur_per_100km || 0);
  const total = fuel + tolls;

  return {
    road_km: Math.round(roadKm),
    straight_km: Math.round(straight),
    cars,
    fuel_price_eur_per_l: round2(fuelPrice),
    fuel_total: round2(fuel),
    toll_total: round2(tolls),
    // What the toll figure is made of, for the detail panel ("Austria 10-day
    // vignette", "Brenner pass"...). Null when the flat fallback priced it.
    toll_notes: dt ? [...(dt.vignettes || []), ...(dt.crossings || [])] : null,
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
  // Summer rentals cost more, lift the annual-midpoint day-rate by depart month.
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
  // Whole-home prices grow sub-linearly with capacity (price ~ capacity^0.55),
  // so per-person cost FALLS as the group grows. The stored per-person nightly
  // assumes the typical 4-sleeper; this exponent re-fits it to the real group:
  // a couple books a (pricier per head) 2-person flat, seven friends split a
  // big house cheaply. factor(g) = (g/4)^0.55 * 4/g -> x1.37 for 2, x0.78 for 7.
  occupancy_exponent: 0.55,
  occupancy_ref_capacity: 4,
  seasonality: {
    1: 0.82, 2: 0.82, 3: 0.90, 4: 0.98, 5: 1.08, 6: 1.22,
    7: 1.35, 8: 1.35, 9: 1.15, 10: 1.00, 11: 0.85, 12: 0.92,
  },
};

/** Per-person price factor for a group of `g` vs the stored 4-person
 *  assumption (see occupancy_exponent above). 1 when g == ref capacity. */
export function occupancyFactor(groupSize, model) {
  const m = model || {};
  const exp = m.occupancy_exponent ?? DEFAULT_ACCOM_MODEL.occupancy_exponent;
  const ref = m.occupancy_ref_capacity ?? DEFAULT_ACCOM_MODEL.occupancy_ref_capacity;
  const g = Math.max(1, groupSize || 1);
  return Math.pow(g / ref, exp) * (ref / g);
}

/** Whole-home nightly (in EUR) for a group of `g`, read from OBSERVED capacity
 *  buckets when the anchor carries them: pick the smallest home that still sleeps
 *  the group, or the largest bucket when the group is bigger than any measured
 *  home. Returns { night, cap } or null when there are no usable buckets. */
export function capacityBucketNightly(buckets, groupSize) {
  if (!buckets) return null;
  const entries = Object.entries(buckets)
    .map(([c, night]) => [Number(c), Number(night)])
    .filter(([c, night]) => Number.isFinite(c) && Number.isFinite(night))
    .sort((a, b) => a[0] - b[0]);
  if (entries.length === 0) return null;
  const g = Math.max(1, groupSize || 1);
  const fit = entries.find(([c]) => c >= g) || entries[entries.length - 1];
  return { night: fit[1], cap: fit[0] };
}

/** Per-person accommodation cost for the trip, broken down. Returns null if the
 *  destination has no accommodation anchor.
 *  Applies, in order: summer seasonality on the nightly, a weekly discount for
 *  stays >= the threshold, then the (per-booking) cleaning fee, then the service
 *  fee on the whole subtotal, the same order Airbnb shows at checkout.
 *
 *  Specificity, when the anchor carries it (Inside Airbnb harvest v2):
 *    - a.seasonality  : that CITY's own 12-month curve (from its calendar.csv)
 *                       overrides the one global summer curve.
 *    - a.capacity_buckets : OBSERVED whole-home nightly per group size replaces
 *                       the modelled occupancy^0.55 extrapolation.
 */
export function accommodationPerPerson(dest, nights, departDate, model, groupSize) {
  const a = dest.accommodation;
  if (!a || a.per_person_night_eur == null) return null;
  const m = { ...DEFAULT_ACCOM_MODEL, ...(model || {}) };
  const n = Math.max(0, nights);
  const g = Math.max(1, groupSize || 1);

  // Seasonality: prefer this city's own calendar-derived curve (12 values,
  // index 0 = Jan), fall back to the one global summer curve.
  const month = departDate ? Number(departDate.slice(5, 7)) : null;
  const cityCurve = Array.isArray(a.seasonality) && a.seasonality.length === 12
    ? a.seasonality : null;
  const seasonBasis = cityCurve ? 'city_calendar' : 'global_curve';
  const season = month
    ? (cityCurve
        ? (cityCurve[month - 1] != null ? cityCurve[month - 1] : 1)
        : (m.seasonality && m.seasonality[month] != null ? m.seasonality[month] : 1))
    : 1;

  // Length-of-stay (weekly) discount.
  const los = n >= (m.min_nights_for_weekly || 7)
    ? 1 - (m.weekly_discount_pct || 0) / 100 : 1;

  // Per-person nightly BEFORE season: prefer an observed capacity bucket (a
  // real home sized for the group, split across the real heads); else fall back
  // to the stored 4-sleeper per-person figure re-fitted by the occupancy curve.
  const bucket = groupSize ? capacityBucketNightly(a.capacity_buckets, g) : null;
  const nightlyBasis = bucket ? 'capacity_bucket' : 'occupancy_curve';
  const baseNightlyPp = bucket
    ? bucket.night / g
    : (a.per_person_night_eur || 0) * (groupSize ? occupancyFactor(g, m) : 1);

  const nightlyPp = baseNightlyPp * season;
  const lodging   = nightlyPp * n * los;
  // Cleaning is charged once per BOOKING; the stored per-person figure is the
  // reference 4-sleeper's share. Rebuild the booking fee and split it across
  // the real group, so a couple isn't quietly charged half a fee too little
  // and seven friends almost double.
  const ref = m.occupancy_ref_capacity ?? DEFAULT_ACCOM_MODEL.occupancy_ref_capacity;
  const cleaning = (a.cleaning_per_person_eur || 0)
    * (groupSize ? ref / Math.max(1, groupSize) : 1);
  const subtotal  = lodging + cleaning;
  const withFees  = subtotal * (1 + (m.service_fee_pct || 0) / 100);

  // Neighbourhood spread (measured/city matches only): the whole-home nightly
  // range across a city's neighbourhoods, so the UI can say "€90-€180 depending
  // on where in town you stay" instead of implying one flat price.
  let hoodRange = null;
  if (Array.isArray(a.neighbourhoods) && a.neighbourhoods.length >= 2) {
    const nis = a.neighbourhoods.map((h) => h.night_eur).filter((v) => v > 0);
    if (nis.length >= 2) hoodRange = { min: Math.min(...nis), max: Math.max(...nis) };
  }

  return {
    nightly_pp: round2(nightlyPp),     // effective per-person nightly after season
    lodging: round2(lodging),
    cleaning: round2(cleaning),
    service: round2(withFees - subtotal),
    season,
    season_basis: seasonBasis,         // 'city_calendar' | 'global_curve'
    nightly_basis: nightlyBasis,       // 'capacity_bucket' | 'occupancy_curve'
    neighbourhood_range: hoodRange,    // { min, max } whole-home nightly, or null
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

/** Contiguous windows of dates (union of outbound_fare across this
 *  destination's routes) that actually have a fare, so when the selected
 *  dates come back with nothing, the UI can tell the traveller which periods
 *  do have data instead of just saying no. Ryanair skips days even on routes
 *  it otherwise serves, so fare dates within `mergeGapDays` of each other are
 *  merged into one window rather than reported as separate gaps; a longer
 *  gap (an off-season pause) starts a new window.
 *  Returns [{ start, end }], sorted by start date, or [] if there's no fare
 *  data for this destination at all.
 */
export function fareCoverageRanges(dest, mergeGapDays = 10) {
  const routes = dest?.routes || {};
  const dates = new Set();
  for (const r of Object.values(routes)) {
    for (const d of Object.keys(r.outbound_fare || {})) dates.add(d);
  }
  const sorted = [...dates].sort();
  if (sorted.length === 0) return [];

  const ranges = [];
  let start = sorted[0], end = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i];
    const gapDays = (new Date(d + 'T00:00:00Z') - new Date(end + 'T00:00:00Z')) / 86400000;
    if (gapDays <= mergeGapDays) {
      end = d;
    } else {
      ranges.push({ start, end });
      start = d;
      end = d;
    }
  }
  ranges.push({ start, end });
  return ranges;
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

/* ── Plane reach ───────────────────────────────────────────────────────────
 * A destination counts as reachable by plane when a *served* airport, one with
 * real fares for the chosen dates, sits within PLANE_REACH_KM of it. You land
 * there and finish the last leg from arrivals.
 *
 * The build pipeline (apply_airport_anchors.py) already bakes a nearby airport's
 * fare calendar straight into dest.routes, but only within 60 km. Everything
 * from 60 km out to PLANE_REACH_KM is resolved here, at runtime, against the
 * live catalogue, so widening the radius needs no data rebuild.
 */
export const PLANE_REACH_KM = 100;

// Last-leg model. Same scale the pipeline uses for its baked-in anchors, so a
// transfer costs the same whether it was baked at build time or computed here.
const LEG_DETOUR     = 1.3;    // straight-line km -> road km
const LEG_EUR_PER_KM = 0.15;   // per person, one way
const LEG_FLOOR_EUR  = 10;
const LEG_CAP_EUR    = 60;
const LEG_KMH        = 65;

// Built once per catalogue object, coordinates never change, so the index is
// pure. Keyed weakly so reloading the catalogue drops the old index with it.
const reachCache = new WeakMap();

/** destId -> { id, airport, straight_km } for the nearest served airport within
 *  PLANE_REACH_KM. Only destinations that carry no fares of their own are
 *  indexed: everything else already flies in directly, or was anchored at build
 *  time. Islands are skipped, there is no road leg from the mainland.
 */
export function planeReachIndex(allDests) {
  if (!allDests) return null;
  const cached = reachCache.get(allDests);
  if (cached) return cached;

  const served = [];
  for (const [id, d] of Object.entries(allDests)) {
    if (d.lat == null || !d.iata) continue;
    if (!d.routes || Object.keys(d.routes).length === 0) continue;
    served.push([id, d]);
  }

  const index = new Map();
  for (const [id, d] of Object.entries(allDests)) {
    if (d.lat == null) continue;
    if (d.routes && Object.keys(d.routes).length > 0) continue;        // flies in already
    if ((d.local_transport || {}).road_connected === false) continue;  // island: no road leg
    const { lat, lon } = cityCoords(d);            // measure from the town...
    let best = null;
    for (const [aid, a] of served) {
      if (aid === id) continue;
      const km = haversineKm(lat, lon, a.lat, a.lon);   // ...to the runway
      if (km == null || km > PLANE_REACH_KM) continue;
      if (!best || km < best.straight_km) best = { id: aid, airport: a, straight_km: km };
    }
    if (best) index.set(id, best);
  }
  reachCache.set(allDests, index);
  return index;
}

/** How you get from the arrival airport into town, for a destination reached via
 *  a nearby airport. The destination's own transport profile decides:
 *    - car_needed -> you pick the rental up at arrivals and drive in. The rental
 *      is already charged by rentalEstimate(), so the leg itself adds nothing;
 *      billing a shuttle on top would charge the same journey twice.
 *    - otherwise  -> the place works without a car, so bus/train/shuttle in,
 *      priced per person each way.
 */
/** The shared airport->town ground-leg scale: ONE model for both the
 *  auto-resolved plane fare (airportLastLeg) and the "fly nearby + drive in"
 *  alternatives list (viaNearestAirport), so the same journey never shows two
 *  different prices depending on which surface computed it. */
export function lastLegEstimate(straightKm) {
  const roadKm = straightKm * LEG_DETOUR;
  return {
    road_km: Math.round(roadKm),
    minutes: Math.round((roadKm / LEG_KMH) * 60),
    eur_pp_one_way: Math.round(Math.min(LEG_CAP_EUR, Math.max(LEG_FLOOR_EUR, LEG_EUR_PER_KM * roadKm))),
  };
}

export function airportLastLeg(dest, straightKm) {
  const leg = lastLegEstimate(straightKm);
  const needsCar = !!(dest.local_transport || {}).car_needed;
  return {
    kind: needsCar ? 'rental' : 'shuttle',
    ...leg,
    // car_needed -> the rental (already priced by rentalEstimate) drives this
    // leg; billing a shuttle on top would charge the same journey twice.
    eur_pp_one_way: needsCar ? 0 : leg.eur_pp_one_way,
  };
}

/** The fare to fly to this destination: its own, or, when it has none, the
 *  fare into a served airport within PLANE_REACH_KM, with the last leg priced
 *  in. Returns { fare, via }, either of which may be null.
 */
function planeFare(dest, departDate, returnDate, choices, allDests) {
  const own = pickFareForDates(dest, departDate, returnDate, choices.origin_pref);
  if (own || !allDests) return { fare: own, via: null };

  const near = planeReachIndex(allDests)?.get(dest.id);
  if (!near) return { fare: null, via: null };
  const nearFare = pickFareForDates(near.airport, departDate, returnDate, choices.origin_pref);
  if (!nearFare) return { fare: null, via: null };

  const leg = airportLastLeg(dest, near.straight_km);
  return {
    fare: {
      ...nearFare,
      anchor_airport: near.airport.iata,
      ground_eur: leg.eur_pp_one_way,
      ground_minutes: leg.minutes,
    },
    via: {
      ...leg,
      id: near.id,
      city: near.airport.city,
      iata: near.airport.iata,
      straight_km: Math.round(near.straight_km),
    },
  };
}

/** Full trip cost for these dates + choices. Prices the trip two ways and picks
 *  the one in `choices.transport_mode` ('plane' | 'car'):
 *    - plane: cheapest Ryanair round-trip + baggage, into this destination or an
 *      airport within PLANE_REACH_KM of it; plus the last leg in (shuttle or a
 *      rental car) and a rental at the destination when one is needed there.
 *    - car  : fuel + tolls to drive there and back (only if road-reachable and
 *      within max_drive_km); no rental, you brought your own car.
 *  Accommodation + on-the-ground are added the same way for both. Always exposes
 *  plane_grand_total and car_grand_total so the UI can compare. Returns null if
 *  the destination cannot be reached either way for these dates.
 *
 *  `allDests` (the whole catalogue) is optional but enables the nearby-airport
 *  reach above; without it only destinations with their own baked-in fares can
 *  be flown to.
 */
export function composeTrip(dest, departDate, returnDate, choices, allDests = null) {
  if (!dest || !departDate || !returnDate || returnDate <= departDate) return null;

  const groupSize = Math.max(1, choices.group_size || 1);
  const nights = Math.max(1, tripDaysBetween(departDate, returnDate));
  const home = choices.home || null;
  const carModel = choices.car_model || null;

  // Accommodation + on-the-ground are the same whichever way you travel.
  const accom = accommodationPerPerson(dest, nights, departDate, choices.accommodation_model, groupSize);
  const accomPerPerson = accom ? accom.total : 0;
  const accomTotal = accomPerPerson * groupSize;

  const ground = groundSpendPerPerson(dest, nights, choices.lifestyle);
  const groundPerPerson = ground ? ground.total : 0;
  const groundTotal = groundPerPerson * groupSize;

  const stayTotal = accomTotal + groundTotal;

  // --- Plane option: flights + baggage, and a rental if a car is needed there.
  const { fare, via: viaAirport } = planeFare(dest, departDate, returnDate, choices, allDests);
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

    // Can you actually fly here for these dates? Distinct from transport_mode:
    // in plane mode a flightless destination is quietly priced as a drive, and
    // this is the flag that keeps the UI honest about that.
    plane_reachable:    planeGrand != null,
    // Set only when the flight lands at a *nearby* airport rather than this
    // destination's own: { kind: 'shuttle' | 'rental', city, iata, road_km, ... }
    via_airport:        viaAirport,

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

/**
 * "Fly to the nearest airport, then drive/taxi the last stretch", the honest
 * alternative when a destination has no direct fare from the chosen origin for
 * these dates. Scans the catalogue for nearby airport destinations that DO
 * have a real fare, and prices the ground last leg per road km (shared
 * taxi/bus/rental scale, floor €8, same family as the pipeline's anchor
 * transfers). Returns the best few, cheapest door-to-door first.
 */
export function viaNearestAirport(dest, allDests, departDate, returnDate, choices, { maxKm = 320, limit = 3 } = {}) {
  if (!dest || dest.lat == null || !allDests) return [];
  const destRoad = (dest.local_transport || {}).road_connected !== false;
  if (!destRoad) return [];
  const out = [];
  // Measure town -> runway (like planeReachIndex): the traveller starts the
  // ground leg at the airport and ends in the town, not at another runway.
  const dc = cityCoords(dest);
  for (const [id, d] of Object.entries(allDests)) {
    if (id === dest.id || d.lat == null || d.city === dest.city) continue;
    if (!d.iata) continue; // needs to be a real airport you can fly into
    if ((d.local_transport || {}).road_connected === false) continue;
    const km = haversineKm(dc.lat, dc.lon, d.lat, d.lon);
    if (km == null || km > maxKm || km < 8) continue;
    const fare = pickFareForDates(d, departDate, returnDate, choices.origin_pref);
    if (!fare) continue;
    // Same scale planeFare charges when it auto-resolves this exact journey.
    const leg = lastLegEstimate(km);
    out.push({
      id,
      city: d.city,
      country: d.country,
      iata: d.iata,
      fare_per_person: round2(fare.fare),
      road_km: leg.road_km,
      drive_hours_one_way: Math.round((leg.minutes / 60) * 10) / 10,
      leg_eur_pp_one_way: round2(leg.eur_pp_one_way),
      total_pp_est: round2(fare.fare + leg.eur_pp_one_way * 2),
    });
  }
  out.sort((a, b) => a.total_pp_est - b.total_pp_est);
  return out.slice(0, limit);
}

/** The depart date whose round trip actually resolves for the most destinations,
 *  at a fixed trip length. Ryanair flies specific weekdays, so fares are sparse
 *  per date: the earliest date we hold a fare for, the obvious default, can be
 *  bookable for barely a handful of places, which makes the whole map look empty.
 *  Earlier dates win ties, so the default stays as early as it sensibly can.
 *  `minStart` (optional ISO date) excludes any depart date before it, so the
 *  default never lands on a past day.
 *  Returns { start, end, count }, or null when there are no fares at all.
 */
export function bestFareWindow(allDests, nights, minStart = null) {
  if (!allDests || !nights || nights < 1) return null;

  const perStart = new Map();   // depart date -> destinations bookable round-trip
  for (const d of Object.values(allDests)) {
    const starts = new Set();
    for (const r of Object.values(d.routes || {})) {
      const out = r.outbound_fare || {};
      const ret = r.return_fare || {};
      for (const start of Object.keys(out)) {
        if (minStart && start < minStart) continue;
        if (out[start] != null && ret[addDays(start, nights)] != null) starts.add(start);
      }
    }
    for (const s of starts) perStart.set(s, (perStart.get(s) || 0) + 1);
  }
  if (perStart.size === 0) return null;

  let best = null;
  for (const [start, count] of perStart) {
    if (!best || count > best.count || (count === best.count && start < best.start)) {
      best = { start, count };
    }
  }
  return { start: best.start, end: addDays(best.start, nights), count: best.count };
}

/** How many destinations have a bookable round-trip flight for this exact date
 *  pair (a fare on both the depart and the return day, on the same route).
 *  Ryanair flies specific weekdays, so a date pair restored from a previous
 *  session can land entirely off the fare calendar after a fares refresh; this
 *  cheap probe tells "the map is legitimately empty" apart from "the selected
 *  dates just miss the flying days", so useAppData can re-snap to a real
 *  window instead of pricing every destination as a drive. */
export function countBookableRoundTrips(allDests, departDate, returnDate) {
  if (!allDests || !departDate || !returnDate) return 0;
  let n = 0;
  for (const d of Object.values(allDests)) {
    for (const r of Object.values(d.routes || {})) {
      if (r.outbound_fare?.[departDate] != null && r.return_fare?.[returnDate] != null) {
        n += 1;
        break; // this destination is bookable; don't count its other routes
      }
    }
  }
  return n;
}

/** Cheapest bookable total for these dates, or null. */
export function cheapestTotal(dest, departDate, returnDate, choices, allDests = null) {
  const b = composeTrip(dest, departDate, returnDate, choices, allDests);
  return b ? b.grand_total : null;
}


/** Candidate trip start dates for "Best time to go": the union of outbound_fare
 *  keys across the destination's routes (real, bookable Ryanair days). Car-only
 *  destinations (no route data at all) have no per-day flight signal, so this
 *  falls back to a weekly sweep across the app's priced horizon
 *  (meta.start_date/end_date), accommodation and rental still vary by month,
 *  so the sweep isn't wasted.
 */
function candidateStartDates(dest, meta, allDests = null) {
  // A destination reached through a nearby airport has no fare calendar of its
  // own, so borrow that airport's, otherwise the only candidates left are the
  // coarse weekly sweep below, and the chart disagrees with the price.
  const routes = (dest?.routes && Object.keys(dest.routes).length > 0)
    ? dest.routes
    : (allDests ? planeReachIndex(allDests)?.get(dest?.id)?.airport?.routes : null) || {};
  const outDates = new Set();
  for (const r of Object.values(routes)) {
    for (const d of Object.keys(r.outbound_fare || {})) outDates.add(d);
  }

  const candidates = [...outDates].sort();
  if (candidates.length > 0) return candidates;

  const start = meta?.start_date, end = meta?.end_date;
  if (!start || !end) return [];
  const swept = [];
  for (let d = start; d <= end; d = addDays(d, 7)) swept.push(d);
  return swept;
}

/** The total trip cost for every bookable start date that keeps a fixed trip
 *  length, across the whole fare window this destination's routes cover, the
 *  data "Best time to go" needs to find the cheapest period and chart the rest.
 *  Reuses composeTrip() per candidate date, so it stays consistent with the
 *  currently selected plane/car mode and every other pricing input.
 *
 *  Returns [{ start, end, nights, total, mode }], sorted by start date, or []
 *  if there isn't enough data to say anything.
 */
export function cheapestWindows(dest, nights, choices, meta, allDests = null) {
  if (!dest || !nights || nights < 1) return [];

  const out = [];
  for (const start of candidateStartDates(dest, meta, allDests)) {
    const end = addDays(start, nights);
    const trip = composeTrip(dest, start, end, choices, allDests);
    if (trip) out.push({ start, end, nights, total: trip.grand_total, mode: trip.transport_mode });
  }
  return out;
}

/** Same idea as cheapestWindows(), but for each candidate start date also
 *  tries every trip length within `flexNights` of `baseNights` and keeps
 *  whichever is cheapest, the "Flexible" length option, for a user who cares
 *  more about the total than an exact number of nights.
 *
 *  Returns [{ start, end, nights, total, mode }] (nights varies per entry),
 *  sorted by start date.
 */
export function cheapestFlexibleWindows(dest, baseNights, flexNights, choices, meta, allDests = null) {
  if (!dest || !baseNights || baseNights < 1) return [];
  const minNights = Math.max(1, baseNights - flexNights);
  const maxNights = baseNights + flexNights;

  const out = [];
  for (const start of candidateStartDates(dest, meta, allDests)) {
    let best = null;
    for (let n = minNights; n <= maxNights; n++) {
      const end = addDays(start, n);
      const trip = composeTrip(dest, start, end, choices, allDests);
      if (trip && (!best || trip.grand_total < best.total)) {
        best = { start, end, nights: n, total: trip.grand_total, mode: trip.transport_mode };
      }
    }
    if (best) out.push(best);
  }
  return out;
}

/** Average outbound Ryanair fare by weekday (Mon..Sun), across every origin
 *  and every fetched day, cheapest origin per day. Entries with no data are
 *  null. Surfaces the weekday pattern Ryanair fares reliably have (midweek
 *  cheaper than weekend) without needing a chart of every single day.
 */
export function fareByWeekday(dest) {
  const routes = dest?.routes || {};
  const byDate = new Map();
  for (const r of Object.values(routes)) {
    for (const [d, fare] of Object.entries(r.outbound_fare || {})) {
      if (!byDate.has(d) || fare < byDate.get(d)) byDate.set(d, fare);
    }
  }

  const sums = [0, 0, 0, 0, 0, 0, 0];
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const [d, fare] of byDate) {
    const dow = (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
    sums[dow] += fare;
    counts[dow] += 1;
  }
  return sums.map((s, i) => (counts[i] ? Math.round(s / counts[i]) : null));
}


// Flight booking deeplink (Skyscanner), the one external service the app links to.
// `origin` must be the SAME airport the displayed fare departs from (e.g. CRL for
// a Charleroi/Ryanair fare, not Brussels BRU) so the Skyscanner search matches the
// price we show. The search is always per-person (adultsv2=1), the app shows a
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
 *  and drop-off dates. Prefers the destination's airport IATA (unambiguous, e.g.
 *  BCN) and falls back to the city name for gems with no airport of their own.
 *  (KAYAK mis-geocodes a "City, Country" string, so never pass the country.)
 *  Lets the user verify/book a real rental, the figure in the breakdown is an
 *  estimate. Offered for every destination, not only the ones a car is needed at.
 */
export function buildCarRentalLink({ city, iata, departDate, returnDate }) {
  if (!departDate || !returnDate) return null;
  const place = iata ? iata.toUpperCase() : (city ? encodeURIComponent(city) : null);
  if (!place) return null;
  return `https://www.kayak.com/cars/${place}/${departDate}/${returnDate}`;
}

/** Link to a smart Google search that surfaces everything a traveller needs to
 *  know about the destination, top attractions, food, neighbourhoods, itinerary
 *  and first-timer tips, rather than a single fixed guide page. The airport
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
 *  are realistically reachable as a side-trip, within `maxKm` straight-line of
 *  the selected place. Pure computation over the loaded dataset (no new source),
 *  so each suggestion is already priced and imaged, click to switch to it.
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
