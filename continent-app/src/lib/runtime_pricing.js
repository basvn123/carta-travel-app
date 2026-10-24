/**
 * runtime_pricing.js, schema v7
 *
 * Three layers, all from real data:
 *   1. Getting there: which airport the trip lands at and the ground leg from
 *      it (dest.routes, rebuilt per origin by origins.js). No flight fare: the
 *      old fare data went in T511; the flight module (T517) adds it back.
 *   2. Accommodation, the chosen bed (hostel, Airbnb room or place, hotel by
 *      star) priced night by night from measured monthly prices (schema v18,
 *      lib/stayPrice.js), with Airbnb's fees on an entire place.
 *   3. On-the-ground, the user's lifestyle (dinners/lunches/drinks/coffees/
 *      self-catered days) priced at the destination's real local rates
 *      (dest.costs). See SCHEMA.md for the contract.
 */

import { round2 } from './math.js';
import { buildAviasalesLink } from './affiliate.js';
import { bedPrice, STAY_TIERS as STAY_TIER_LIST } from './stayPrice.js';
import { rule } from './price/config.js';

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
// T692: config/pricing.json lifestyle.default, the Easygoing preset with one
// coffee a day (owner decision B8, 2026-10-24; it was 0).
export const DEFAULT_LIFESTYLE = rule('lifestyle.default');

// A club night = cover charge + this many premium drinks (config/pricing.json).
export const CLUB_DRINKS_PER_NIGHT = rule('lifestyle.club_drinks_per_night');

// Fallback car model if app_data.meta.car_model is missing. Mirrors car_layer.py:
// drives the "compare car vs plane" estimate (fuel + tolls to get there) and the
// "rent a car at the destination" estimate. See SCHEMA.md.
// Day-rates are annual midpoints; rental_seasonality multiplies them by the
// depart month so summer trips land near each range's top. Overridden by
// meta.car_model. T690: config/pricing.json car.model; the country tables
// come from the wire (meta.car_model, dest.local_transport).
export const DEFAULT_CAR_MODEL = {
  ...rule('car.model'),
  fuel_price_by_iso2: {},
  rental_eur_per_day_by_iso2: {},
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

const isPoint = (p) => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lon);

/** Is the app still waiting on the "where do you drive from?" answer?
 *
 *  A drive starts at the traveller's own door, not at a runway. The departure
 *  AIRPORT is a flight input, and quietly reusing it as the drive origin priced
 *  a journey nobody was taking ("Charleroi to Nuremberg" for someone who lives
 *  in Ghent). So in car mode the town is required: without it driveOrigin()
 *  hands composeTrip nothing, every destination comes back undrivable, and the
 *  Map tab holds its results back until the question is answered.
 */
export function needsDriveHome(choices) {
  // T577: the From picker names the start for every way, and without a named
  // town the home airport's town stands in, so only a missing both waits.
  return (choices?.transport_mode === 'car') && !isPoint(choices?.drive_home) && !isPoint(choices?.home);
}

/** Where a drive starts. The town the traveller named always wins; the origin
 *  airport is the fallback only in plane mode, where the drive is just the
 *  comparison offered when no fare exists. */
export function driveOrigin(choices) {
  if (isPoint(choices?.drive_home)) return choices.drive_home;
  return isPoint(choices?.home) ? choices.home : null;
}

/** Cost of *driving there and back* for the whole group, or null if the trip is
 *  not road-reachable or beyond `max_drive_km`. Fuel + a motorway-toll allowance,
 *  multiplied by the number of cars the group fills. Comparable to the plane fare.
 */
// How near the corridor's start a drive must begin for the corridor to count.
const TOLL_FROM_KM = rule('car.toll_corridor_start_km');

export function drivingEstimate(dest, home, choices, model, tollFrom = null) {
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
  if (roadKm > (m.max_drive_km || DEFAULT_CAR_MODEL.max_drive_km)) return null;

  const group = Math.max(1, choices.group_size || 1);
  const cars = carsForGroup(group, m.car_capacity);
  const rtKm = roadKm * 2;                            // round trip
  const fuelPrice = (m.fuel_price_by_iso2 && m.fuel_price_by_iso2[dest.iso2]) || m.fuel_price_eur_per_l;
  const fuel = cars * rtKm * ((m.consumption_l_per_100km || 0) / 100) * fuelPrice;
  // Tolls: prefer the per-country corridor estimate (dest.driving_toll, toll
  // layer v14: real peage/vignette/bridge rates per country crossed); the flat
  // per-100km allowance remains the fallback for unmapped destinations.
  // T716 (plan F10, row T471-f): the corridor is measured from the pipeline's
  // start (meta.home, `tollFrom`), so it counts only for a drive that starts
  // there; from anywhere else the flat allowance prices the tolls of the
  // traveller's own road, never Brussels' corridor and its notes.
  const fromCorridor = tollFrom && haversineKm(home.lat, home.lon, tollFrom.lat, tollFrom.lon) <= TOLL_FROM_KM;
  const dt = fromCorridor ? dest.driving_toll : null;
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

// Beds (schema v18, T534): every bed price comes from lib/stayPrice.js. The
// names below stay for the screens and tests that import them; each is a thin
// wrapper over bedPrice(), so the planner, Explore, budget search and the
// wizard can no longer disagree about one stay.
export { STAY_TIERS } from './stayPrice.js';

/** The tiers worth offering in a picker: those some destination in the
 *  dataset can price (meta.stays.tiers, written by apply_stays.py). 'home'
 *  is always there. A town that cannot price the chosen tier falls back to
 *  'home' and says so (tier_fallback). */
export function offeredStayTiers(meta) {
  const have = meta?.stays?.tiers;
  if (!Array.isArray(have) || have.length === 0) return ['home'];
  return STAY_TIER_LIST.filter((t) => t === 'home' || have.includes(t));
}

/** Per-person accommodation cost for the trip, broken down, or null when the
 *  destination has no bed price. A wrapper over bedPrice() kept for its
 *  callers (composeTrip, the planner's stop costs, the wizard).
 *
 *    dest, nights, departDate ('YYYY-MM-DD' of the first night or null),
 *    model (meta.stays.fees or the old accommodation_model), groupSize,
 *    stayTier (a STAY_TIERS id; 'hotel' reads as hotel3)
 *
 *  `total` is per person, for all nights, with Airbnb's fees on an entire
 *  place; hostel beds and rooms are booked at their listed rate. */
export function accommodationPerPerson(dest, nights, departDate, model, groupSize, stayTier) {
  const g = Math.max(1, groupSize || 1);
  const fees = model?.fees || model || null;
  const b = bedPrice({ dest, tier: stayTier, adults: g, nights, start: departDate || null, fees });
  if (!b) return null;
  const lodging = b.total - b.cleaning - b.service;
  const hoods = dest?.accommodation?.neighbourhoods;
  let hoodRange = null;
  if (Array.isArray(hoods) && hoods.length >= 2) {
    const nis = hoods.map((h) => h.night_eur).filter((v) => v > 0);
    if (nis.length >= 2) hoodRange = { min: Math.min(...nis), max: Math.max(...nis) };
  }
  return {
    nightly_pp: b.nightlyPp,
    lodging: round2(lodging / g),
    cleaning: round2(b.cleaning / g),
    service: round2(b.service / g),
    season: b.season,
    season_basis: b.basis,             // 'dated' | 'month' | 'annual'
    nightly_basis: 'stay_tier',
    neighbourhood_range: hoodRange,
    los: b.weeklyDiscount ? 1 - ((fees?.weekly_discount_pct ?? 8) / 100) : 1,
    tier: b.tier,
    tier_requested: b.tierRequested,
    tier_fallback: b.fallback,
    tier_rate_eur: b.rate,
    tier_rooms: b.unit === 'room' ? b.units : null,
    q: b.q,
    from: b.from,
    total: round2(b.total / g),
  };
}

/** The air route into this destination from the chosen origin, or null.
 *  dest.routes holds one record per origin whose last leg Carta can price
 *  (origins.js); there is no fare in it (T511: fares removed; T517 adds
 *  flights back). */
export function pickAirRoute(dest, originPref = 'auto') {
  const routes = dest.routes || {};
  const origins = originPref && originPref !== 'auto'
    ? (routes[originPref] ? [originPref] : [])
    : Object.keys(routes);
  const o = origins[0];
  if (!o) return null;
  const r = routes[o];
  return {
    origin: o,
    anchor_airport: r.anchor_airport || dest.iata,
    ground_eur: r.ground_transport_one_way_eur || 0,
    ground_minutes: r.ground_transport_minutes || 0,
  };
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
 * an air route from the chosen origin, sits within PLANE_REACH_KM of it. You
 * land there and finish the last leg from arrivals.
 *
 * The build pipeline (apply_airport_anchors.py) already anchors a destination
 * to a nearby airport in dest.routes, but only within 60 km. Everything
 * from 60 km out to PLANE_REACH_KM is resolved here, at runtime, against the
 * live catalogue, so widening the radius needs no data rebuild.
 */
export const PLANE_REACH_KM = rule('ground.plane_reach_km');

// Last-leg model. Same scale the pipeline uses for its baked-in anchors, so a
// transfer costs the same whether it was baked at build time or computed here.
// config/pricing.json ground.transfer_public, the one copy (T690).
const TRANSFER = rule('ground.transfer_public');
const LEG_DETOUR     = TRANSFER.detour;       // straight-line km -> road km
const LEG_EUR_PER_KM = TRANSFER.per_km_eur;   // per person, one way
const LEG_FLOOR_EUR  = TRANSFER.floor_eur;
const LEG_CAP_EUR    = TRANSFER.cap_eur;
const LEG_KMH        = TRANSFER.kmh;

// Built once per catalogue object, coordinates never change, so the index is
// pure. Keyed weakly so reloading the catalogue drops the old index with it.
const reachCache = new WeakMap();

/** destId -> { id, airport, straight_km } for the nearest served airport within
 *  PLANE_REACH_KM. Only destinations that carry no route of their own are
 *  indexed: everything else already flies in directly, or was anchored at build
 *  time. Islands are skipped, there is no road leg from the mainland.
 */
export function nearbyAirportIndex(allDests) {
  if (!allDests) return null;
  const cached = reachCache.get(allDests);
  if (cached) return cached;

  // Served airports go into a coarse lat/lon grid so each unserved town only
  // measures the airports in its neighbourhood. The old all-pairs scan was
  // O(unserved x served) haversines, which grows quadratically with the
  // catalogue and dominated the whole first paint at full scale; the grid
  // keeps the result identical (every airport within PLANE_REACH_KM is still
  // considered) at a fraction of the distance calls.
  const CELL_DEG = 2; // 2 deg latitude = ~222 km per cell
  const grid = new Map();
  for (const [id, d] of Object.entries(allDests)) {
    if (d.lat == null || !d.iata) continue;
    if (!d.routes || Object.keys(d.routes).length === 0) continue;
    const key = `${Math.floor(d.lat / CELL_DEG)}|${Math.floor(d.lon / CELL_DEG)}`;
    let cell = grid.get(key);
    if (!cell) { cell = []; grid.set(key, cell); }
    cell.push([id, d]);
  }

  const index = new Map();
  for (const [id, d] of Object.entries(allDests)) {
    if (d.lat == null) continue;
    if (d.routes && Object.keys(d.routes).length > 0) continue;        // flies in already
    if ((d.local_transport || {}).road_connected === false) continue;  // island: no road leg
    const { lat, lon } = cityCoords(d);            // measure from the town...
    const gy = Math.floor(lat / CELL_DEG);
    const gx = Math.floor(lon / CELL_DEG);
    // Longitude degrees shrink towards the poles; widen the scan accordingly
    // (cos taken a cell poleward of the town, so edge cases stay covered).
    const kmPerLonDeg = 111 * Math.max(0.1, Math.cos((Math.min(Math.abs(lat) + CELL_DEG, 84) * Math.PI) / 180));
    const kLon = Math.ceil(PLANE_REACH_KM / (kmPerLonDeg * CELL_DEG));
    // Latitude spans a fixed 111 km/deg, but the scan still has to widen with
    // the radius: hardcoding one cell each way silently stops covering
    // PLANE_REACH_KM the moment it exceeds a cell's 222 km height.
    const kLat = Math.ceil(PLANE_REACH_KM / (111 * CELL_DEG));
    let best = null;
    for (let y = gy - kLat; y <= gy + kLat; y += 1) {
      for (let x = gx - kLon; x <= gx + kLon; x += 1) {
        const cell = grid.get(`${y}|${x}`);
        if (!cell) continue;
        for (const [aid, a] of cell) {
          if (aid === id) continue;
          const km = haversineKm(lat, lon, a.lat, a.lon);   // ...to the runway
          if (km == null || km > PLANE_REACH_KM) continue;
          if (!best || km < best.straight_km) best = { id: aid, airport: a, straight_km: km };
        }
      }
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
/** The airport->town ground-leg scale behind airportLastLeg, on the same
 *  scale as the pipeline's baked anchor transfers, so the same journey never
 *  shows two different prices depending on where it was computed. */
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

/** How the trip flies in: this destination's own air route, or, when it has
 *  none, the route into a served airport within PLANE_REACH_KM, with the last
 *  leg priced in. Returns { route, via }, either of which may be null.
 */
export function airRoute(dest, choices, allDests) {
  const own = pickAirRoute(dest, choices.origin_pref);
  if (own) return { route: own, via: null };

  const near = allDests ? nearbyAirportIndex(allDests)?.get(dest.id) : null;
  if (near) {
    const nearRoute = pickAirRoute(near.airport, choices.origin_pref);
    if (nearRoute) {
      const leg = airportLastLeg(dest, near.straight_km);
      return {
        route: {
          ...nearRoute,
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
  }
  return { route: null, via: null };
}

// Flight booking deeplink, the one external service the app links to.
// `origin` must be the SAME airport the displayed fare departs from (e.g. CRL for
// a Charleroi/Ryanair fare, not Brussels BRU) so the search matches the price we
// show. The search is always per-person, the app shows a per-person fare, and
// both providers otherwise report a group total that won't line up.
//
// Offers BOTH comparison sites, because they don't return the same set: budget
// carriers are sold direct and each aggregator covers a different slice of
// them, so a fare that looks missing on one often shows up on the other. `links` is ordered with the
// affiliate-tagged one first (that click is the app's only revenue) and falls
// back to Skyscanner alone when no marker is configured, so a marker-less dev
// build behaves exactly as it did before.
export function buildFlightLinks({ origin, destIata, departDate, returnDate, subId = '' }) {
  if (!origin || !destIata || !departDate || !returnDate) {
    return { links: [], skyscanner: null };
  }
  const fmt = (d) => d.replaceAll('-', '').slice(2); // YYMMDD
  const skyscanner =
    `https://www.skyscanner.net/transport/flights/${origin.toLowerCase()}/${destIata.toLowerCase()}/` +
    `${fmt(departDate)}/${fmt(returnDate)}/?adultsv2=1&cabinclass=economy&rtn=1`;
  const aviasales = buildAviasalesLink({ origin, destIata, departDate, returnDate, subId });
  const links = [];
  if (aviasales) links.push({ provider: 'Aviasales', href: aviasales });
  links.push({ provider: 'Skyscanner', href: skyscanner });
  return { links, skyscanner };
}

/** Stay search deeplink for the destination, prefilled with dates and guests.
 *  The accommodation price is an estimate; this lets the user verify/book real
 *  listings. Provider follows the stay tier: hostel tiers go to Hostelworld
 *  (city search, they have no stable per-property deeplink we can know),
 *  hotel tiers to KAYAK hotels (city only in the path: KAYAK mis-geocodes a
 *  "City, Country" string, the same trap as the car links), and the default
 *  entire-home tier to Airbnb city search.
 */
export function buildAccommodationLink({ city, country, departDate, returnDate, groupSize = 1, stayTier = 'home' }) {
  if (!city || !departDate || !returnDate) return null;
  const adults = Math.max(1, groupSize | 0);
  if (stayTier === 'dorm' || stayTier === 'private') {
    const q = encodeURIComponent([city, country].filter(Boolean).join(', '));
    return (
      `https://www.hostelworld.com/search?search_keywords=${q}` +
      `&date_from=${departDate}&date_to=${returnDate}&number_of_guests=${adults}`
    );
  }
  const stars = { hotel2: 2, hotel3: 3, hotel4: 4, hotel5: 5 }[stayTier];
  if (stars || stayTier === 'hotel') {
    // KAYAK takes the star floor as a path segment, so a star tier opens
    // already filtered to the class its price was measured at.
    const starPath = stars ? `/${stars}stars` : '';
    return `https://www.kayak.com/hotels/${encodeURIComponent(city)}/${departDate}/${returnDate}/${adults}adults${starPath}`;
  }
  const where = encodeURIComponent([city, country].filter(Boolean).join(', '));
  return (
    `https://www.airbnb.com/s/${where}/homes` +
    `?checkin=${departDate}&checkout=${returnDate}` +
    `&adults=${adults}&room_types[]=${stayTier === 'room' ? 'Private%20room' : 'Entire%20home%2Fapt'}`
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
