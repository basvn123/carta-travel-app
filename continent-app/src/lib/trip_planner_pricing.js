/**
 * trip_planner_pricing.js
 *
 * Multi-stop trip pricing, built on top of runtime_pricing.js's single-destination
 * data rather than any new fare source:
 *   1. combineTripLegs   - fly into one destination, out of another, using each
 *      destination's own real (already-fetched) one-way-equivalent Ryanair fares.
 *      No open-jaw fare fetching, both legs must share a common origin airport.
 *   2. interCityGroundEstimate, a distance-based cost/time estimate for getting
 *      between two stops overland (train/bus/rideshare). No free live pricing API
 *      for intercity ground transport exists, so this is always clearly flagged
 *      as an estimate, never presented as a bookable fare.
 *   3. suggestNextStops, candidate next stops for an itinerary: destinations that
 *      share an origin airport with the current stop (the binding constraint for
 *      combineTripLegs to work at all), ranked by distance + beauty.
 */

import { haversineKm, cityCoords, planeReachIndex, airportLastLeg } from './runtime_pricing.js';
import { round2 } from './math.js';


/** Ryanair-style hold/cabin baggage add-ons, priced PER PERSON, PER ONE-WAY
 *  flight (a round trip pays each fee twice). The stored seat fares are the
 *  bare "seat only" price, so without this a two-bag family looks ~€140
 *  cheaper than it really books. Fees swing wildly by route and date, so these
 *  are deliberately round mid-estimates, always flagged as such in the UI.
 */
export const BAGGAGE_OPTIONS = [
  { key: 'cabin', label: 'Cabin bag only', per_leg_eur: 0, hint: 'One small bag under the seat - included free' },
  { key: 'priority', label: 'Priority + 10 kg', per_leg_eur: 20, hint: 'Priority boarding and a 10 kg cabin bag' },
  { key: 'checked', label: 'Checked 20 kg bag', per_leg_eur: 35, hint: 'A 20 kg bag in the hold' },
];

const BAGGAGE_BY_KEY = Object.fromEntries(BAGGAGE_OPTIONS.map((o) => [o.key, o]));

/** Per-person, per-one-way baggage fee for a chosen option (0 for cabin-only
 *  or an unknown key). */
export function baggageFeePerLeg(key) {
  return BAGGAGE_BY_KEY[key]?.per_leg_eur ?? 0;
}

/** Traveller-facing name for a baggage option, for receipts and the export. */
export function baggageLabel(key) {
  return BAGGAGE_BY_KEY[key]?.label ?? 'Cabin bag only';
}

/** Real fares for flying into `destA` and out of `destB`, combined from each
 *  destination's own routes data, not a new open-jaw fare lookup. Both legs
 *  must resolve from the SAME origin airport (BRU or CRL); picks whichever
 *  shared origin is cheaper when both work.
 *
 *  Returns `{ combinable: false, reason }` when no valid combo exists:
 *    - 'no_shared_origin': destA and destB don't fly from any common origin.
 *    - 'no_fare_for_date': a shared origin exists, but one leg has no fare
 *      stored for the requested date.
 *
 *  `preferOrigin` is the departure airport the traveller already picked in the
 *  guided wizard. When it yields a valid combo it WINS over a marginally
 *  cheaper alternative, so the overview prices the very flight they chose
 *  instead of silently swapping BRU for CRL (or vice versa). It's only a
 *  preference: an origin that has no fare on these dates falls back to the
 *  cheapest shared origin.
 */
export function combineTripLegs(destA, arriveDate, destB, departDate, groupSize = 1, baggage = 'cabin', preferOrigin = null, opts = {}) {
  if (!destA || !destB || !arriveDate || !departDate) {
    return { combinable: false, reason: 'missing_input' };
  }

  // The same three steps planeFare takes for a single destination: (1) a
  // stored day at the destination's own airport, (2) a served airport within
  // PLANE_REACH_KM when the destination has no fares of its own (needs
  // opts.allDests, the whole catalogue), (3) the model's month band
  // (opts.estimates). cheapestStartDates passes neither, so it stays on
  // stored days only.
  const allDests = opts.allDests || null;
  const wantBands = opts.estimates === true;
  const reachA = resolveFareDest(destA, allDests);
  const reachB = resolveFareDest(destB, allDests);
  const routesA = reachA.dest.routes || {};
  const routesB = reachB.dest.routes || {};
  const sharedOrigins = Object.keys(routesA).filter((o) => routesB[o]);
  if (!sharedOrigins.length) {
    return { combinable: false, reason: 'no_shared_origin' };
  }

  let best = null;      // cheapest combo across all shared origins
  let preferred = null; // the wizard-picked origin's combo, if it prices out
  for (const origin of sharedOrigins) {
    const rA = routesA[origin];
    const rB = routesB[origin];
    let intoFare = rA.outbound_fare?.[arriveDate];
    let outOfFare = rB.return_fare?.[departDate];
    let estimated = false;
    if (intoFare == null || outOfFare == null) {
      // Both directions must be covered by the band: a half-known round trip
      // would be a guess wearing an estimate's label.
      const eInto = wantBands ? rA.outbound_estimate?.[arriveDate.slice(0, 7)] : null;
      const eOut = wantBands ? rB.return_estimate?.[departDate.slice(0, 7)] : null;
      if (eInto == null || eOut == null) continue;
      intoFare = eInto;
      outOfFare = eOut;
      estimated = true;
    }

    const combinedFare = intoFare + outOfFare;
    const intoCarrier = estimated ? null : (rA.outbound_carrier?.[arriveDate] || null);
    const outCarrier = estimated ? null : (rB.return_carrier?.[departDate] || null);
    // Last leg from a nearby served airport into an unserved town, on the
    // same scale as planeFare (zero when the place needs a car anyway).
    const viaIn = reachA.via ? airportLastLeg(destA, reachA.via.straight_km) : null;
    const viaOut = reachB.via ? airportLastLeg(destB, reachB.via.straight_km) : null;
    const cand = {
      origin,
      estimated,
      combined_fare: combinedFare,
      into_fare: intoFare,
      out_of_fare: outOfFare,
      into_anchor: rA.anchor_airport || reachA.dest.iata,
      out_anchor: rB.anchor_airport || reachB.dest.iata,
      into_ground_eur: viaIn ? viaIn.eur_pp_one_way : (rA.ground_transport_one_way_eur || 0),
      into_ground_minutes: viaIn ? viaIn.minutes : (rA.ground_transport_minutes || 0),
      out_ground_eur: viaOut ? viaOut.eur_pp_one_way : (rB.ground_transport_one_way_eur || 0),
      out_ground_minutes: viaOut ? viaOut.minutes : (rB.ground_transport_minutes || 0),
      // Dep/arr local times of the exact flights priced above ('HH:MM/HH:MM'),
      // when the times harvest covers this origin. Display-only; a band has
      // no flight behind it.
      into_time: estimated ? null : (rA.outbound_time?.[arriveDate] || null),
      out_of_time: estimated ? null : (rB.return_time?.[departDate] || null),
      // Which airline each priced day belongs to (untagged = Ryanair).
      into_carrier: intoCarrier || 'FR',
      out_of_carrier: outCarrier || 'FR',
      // Per-direction provenance bag in the wire's short keys (s source,
      // o epoch day last confirmed, e estimate), read by flightProv().
      into_prov: legProv(rA, intoCarrier, estimated),
      out_of_prov: legProv(rB, outCarrier, estimated),
    };
    if (origin === preferOrigin) preferred = cand;
    if (best == null || combinedFare < best.combined_fare) best = cand;
  }

  // Honour the traveller's picked origin when it genuinely prices out.
  best = preferred || best;
  if (!best) return { combinable: false, reason: 'no_fare_for_date' };

  const group = Math.max(1, groupSize || 1);
  const groundPerPerson = best.into_ground_eur + best.out_ground_eur;
  // Baggage is paid on each one-way leg (into + out of) for every traveller.
  const bagPerLeg = baggageFeePerLeg(baggage);
  const bagPerPerson = bagPerLeg * 2;

  return {
    combinable: true,
    origin: best.origin,
    into_anchor: best.into_anchor,
    out_anchor: best.out_anchor,
    into_fare_eur: round2(best.into_fare),
    out_of_fare_eur: round2(best.out_of_fare),
    into_time: best.into_time,
    out_of_time: best.out_of_time,
    into_carrier: best.into_carrier,
    out_of_carrier: best.out_of_carrier,
    into_prov: best.into_prov,
    out_of_prov: best.out_of_prov,
    fare_estimated: best.estimated,
    into_via: reachA.via,
    out_via: reachB.via,
    fare_per_person: round2(best.combined_fare),
    fare_total: round2(best.combined_fare * group),
    into_ground_eur: round2(best.into_ground_eur),
    into_ground_minutes: best.into_ground_minutes,
    out_ground_eur: round2(best.out_ground_eur),
    out_ground_minutes: best.out_ground_minutes,
    ground_per_person: round2(groundPerPerson),
    ground_total: round2(groundPerPerson * group),
    baggage,
    bag_per_leg_eur: round2(bagPerLeg),
    bag_per_person: round2(bagPerPerson),
    bag_total: round2(bagPerPerson * group),
    grand_total: round2(best.combined_fare * group + groundPerPerson * group + bagPerPerson * group),
  };
}

/** The money a combineTripLegs result carries for the flight itself: the
 *  seat fares, the bag add-on and their sums, and the per-direction fare
 *  provenance. unpricedFlight drops exactly these. */
const FLIGHT_MONEY_KEYS = [
  'into_fare_eur', 'out_of_fare_eur', 'fare_per_person', 'fare_total', 'fare_estimated',
  'into_prov', 'out_of_prov', 'bag_per_leg_eur', 'bag_per_person', 'bag_total', 'grand_total',
];

/** A planner flight with its price taken out (T273). Carta does not price
 *  flights (owner decision, 2026-10-02): the stored fares are frozen
 *  snapshots, so a figure built from them is neither a quote nor a fair
 *  estimate. What stays is the route the trip flies (origin, the two
 *  airports, carrier and times as plan facts) and the airport transfers,
 *  which are ground costs Carta does price. `priced: false` marks it, and no
 *  surface shows or sums a flight figure for it; the only flight figure in a
 *  total is one the traveller typed (the `own` flight in useTripPlanner). */
export function unpricedFlight(flight) {
  if (!flight?.combinable) return flight;
  const out = { ...flight, priced: false };
  for (const k of FLIGHT_MONEY_KEYS) delete out[k];
  return out;
}

/** The destination whose fares price a leg: itself when it carries routes,
 *  else the nearest served airport within PLANE_REACH_KM (planeReachIndex),
 *  else itself with nothing to price from. `via` describes the hop. */
function resolveFareDest(dest, allDests) {
  if (Object.keys(dest.routes || {}).length > 0 || !allDests) return { dest, via: null };
  const near = planeReachIndex(allDests)?.get(dest.id);
  if (!near) return { dest, via: null };
  return {
    dest: near.airport,
    via: {
      id: near.id,
      city: near.airport.city,
      iata: near.airport.iata,
      straight_km: near.straight_km,
    },
  };
}

/** Provenance bag for one priced direction: an estimate band is source EST
 *  with no observation age; a stored day carries the day's carrier tag (else
 *  the record's source) and the record's last-confirmed epoch day. */
function legProv(rec, carrier, estimated) {
  if (estimated) return { s: 'EST', e: 1 };
  const bag = {};
  const s = carrier || rec.s;
  if (s != null) bag.s = s;
  if (rec.o != null) bag.o = rec.o;
  return bag;
}

// Why a trip's round flight couldn't be priced, in plain traveller language.
// Shared so every surface that shows a trip (the planner's Trip total, the
// planned Overview, the export) explains a missing flight plan identically, // never a message in one place and a silent gap in another.
const FLIGHT_REASON_LABELS = {
  no_shared_origin: "These two stops don't share a departure airport with stored budget fares, so there's no single flight plan connecting them. Try a different first or last stop, or fly home and out again.",
  no_fare_for_date: 'No fare is stored for one of these exact dates yet. Try nudging the trip dates.',
  missing_input: 'Pick your travel dates and at least one stop to price the flights.',
};

/** The traveller-facing explanation for a non-combinable flight result, or a
 *  sensible default. Pass `flight.reason` from combineTripLegs. */
export function flightReasonLabel(reason) {
  return FLIGHT_REASON_LABELS[reason] || 'Flights for this trip could not be priced.';
}

const GROUND_DETOUR_FACTOR = 1.3;   // road km vs straight-line km (mirrors car_layer.py / apply_airport_anchors.py)
const GROUND_EUR_PER_KM = 0.15;     // rough European train/bus fare per road km
const GROUND_FLOOR_EUR = 10;        // no realistic intercity fare is cheaper than this
const GROUND_KMH = 65;              // average effective speed including stops/transfers
const GROUND_LONG_HAUL_KM = 800;    // beyond this, ground transport stops being a realistic recommendation

/** Estimated cost/time to get from `destA` to `destB` overland (train/bus/
 *  rideshare), not a live fare, since no free universal pricing API for
 *  intercity ground transport exists. Uses the same road-detour-factor
 *  approach as the app's existing airport-transfer and driving estimates, but
 *  WITHOUT their short-transfer EUR cap (that cap is tuned for ~city<->airport
 *  distances, not city-to-city legs that can run into the hundreds of km).
 *  Returns null when either endpoint isn't road-connected (islands / sea
 *  crossings, same signal `drivingEstimate()` uses).
 */
export function interCityGroundEstimate(destA, destB, groupSize = 1) {
  if (!destA || !destB || destA.lat == null || destB.lat == null) return null;
  const ltA = destA.local_transport || {};
  const ltB = destB.local_transport || {};
  if (ltA.road_connected === false || ltB.road_connected === false) return null;

  // City-to-city ground legs run between town centres: airport-tier stops
  // keep the runway in lat/lon (Skavsta sits 90 km from Stockholm), which
  // would skew every distance here.
  const a = cityCoords(destA);
  const b = cityCoords(destB);
  const straightKm = haversineKm(a.lat, a.lon, b.lat, b.lon);
  if (straightKm == null) return null;
  const roadKm = straightKm * GROUND_DETOUR_FACTOR;
  const group = Math.max(1, groupSize || 1);
  const perPerson = Math.max(GROUND_FLOOR_EUR, GROUND_EUR_PER_KM * roadKm);
  const minutes = Math.round((roadKm / GROUND_KMH) * 60);

  return {
    estimated: true,
    note: 'Estimated ground transport (train/bus), not a live fare.',
    straight_km: Math.round(straightKm),
    road_km: Math.round(roadKm),
    minutes,
    hours: Math.round((minutes / 60) * 10) / 10,
    long_haul: roadKm > GROUND_LONG_HAUL_KM,
    ground_eur_per_person: round2(perPerson),
    ground_total: round2(perPerson * group),
  };
}

/** How many activities/things-to-do we've catalogued for a destination. */
function activityCount(d) {
  return d?.activities && Array.isArray(d.activities.items) ? d.activities.items.length : 0;
}

/** A "how special is this place" score in roughly a 0-16 range, tuned to lift
 *  the genuinely beautiful, characterful spots that a plain beauty.score buries.
 *
 *  beauty.score alone is dominated by beach/nature/iconic components, so a
 *  charming UNESCO village like Alberobello (trulli), Hallstatt or Giethoorn
 *  scores low even though it's exactly the kind of stop people plan a trip
 *  around. We add back the signals that make a place a destination in its own
 *  right: our curated "gem" tier, World Heritage status, a rich things-to-do
 *  list, and a small-historic-place category bonus. Exported so the map/cards
 *  can show the same ranking the recommender uses.
 */
export function gemScore(d) {
  if (!d) return 0;
  const b = d.beauty || {};
  // The v14 traveller rating already blends beauty, POI depth and fame, use
  // it as the base when present (beauty score as the pre-v14 fallback).
  let s = d.rating?.score ?? b.score ?? 0;
  if (d.rating?.hidden_gem) s += 1.6;                   // underrated - surface it
  else if (!d.rating && d.tier === 'gem') s += 2.6;     // pre-v14 fallback
  if (b.unesco) s += 1.4;                               // World Heritage pull
  s += Math.min(activityCount(d), 12) / 12 * 1.6;       // lots to actually do
  const cats = d.categories || [];
  if (cats.includes('village')) s += 1.0;               // charming small places
  else if (cats.includes('oldtown') || cats.includes('town')) s += 0.5;
  return Math.round(s * 100) / 100;
}

const EVOCATIVE_CATEGORIES = [
  'fairytale', 'iconic', 'alps', 'lake', 'coast', 'island', 'medieval',
  'wine', 'countryside', 'village', 'oldtown', 'beach', 'mountains',
];

/** A short, human "why go" chip for a suggestion card. */
function suggestionReason(d) {
  const cats = d.categories || [];
  const evocative = EVOCATIVE_CATEGORIES.find((c) => cats.includes(c));
  if (d.rating?.hidden_gem) return 'Hidden gem';
  if (d.rating?.tier === 3) return 'Worth the journey';
  if (d.beauty?.unesco && evocative) return `UNESCO ${evocative}`;
  if (d.beauty?.unesco) return 'UNESCO site';
  if (evocative) return evocative.charAt(0).toUpperCase() + evocative.slice(1);
  return null;
}

/** Candidate next stops for a multi-city itinerary currently ending at
 *  `fromDest`, ranked to put the most beautiful, characterful places first.
 *
 *  Reachability: a good next stop is either (a) drivable/train-able overland
 *  from the current stop (a real ground leg), or (b) shares a Ryanair origin
 *  with the FIRST stop so that, if it becomes the new last stop, the round
 *  flight still combines. We no longer require sharing an airport with the
 *  *current* stop specifically, that filtered out most of the beautiful
 *  villages you reach by ground, which is exactly what this tab is for.
 *
 *  Ranking is gemScore-led (see above) with a gentle distance preference and
 *  small boosts for a confirmed same-day fare and flight-combinability, so
 *  places like Alberobello, Matera or Hallstatt rise above generic airport
 *  cities that merely happen to be nearby.
 *
 *  @param fromDest   the current (last) stop's destination record
 *  @param allDests   data.destinations (object id->record)
 *  @param arriveDate ISO date the traveller would arrive at the next stop, or null
 *  @param opts.firstDest  the first stop's record (for flight-combinability), optional
 *  @param opts.maxKm  straight-line cutoff (default 500km)
 *  @param opts.limit  how many to return (default 6)
 *  @param opts.excludeIds        destination ids already on the itinerary
 *  @param opts.excludeCountries  countries already on the itinerary, suggest
 *                                somewhere NEW, not more of the same country
 *  @returns [{ id, city, country, iso2, lat, lon, km, gems, rating, beauty, gem_score,
 *              image, reason, shared_origin, ground_reachable, fare_that_day_eur }]
 */
export function suggestNextStops(fromDest, allDests, arriveDate, {
  firstDest = null, maxKm = 500, limit = 6, excludeIds = null, excludeCountries = null,
  transport = null,
} = {}) {
  if (!fromDest || !allDests || fromDest.lat == null) return [];
  const anchor = firstDest || fromDest;
  const anchorOrigins = new Set(Object.keys(anchor.routes || {}));
  const fromRoadConnected = (fromDest.local_transport || {}).road_connected !== false;

  const out = [];
  for (const [id, d] of Object.entries(allDests)) {
    if (id === fromDest.id || d.lat == null) continue;
    if (d.city === fromDest.city) continue; // same place, different airport
    if (excludeIds && excludeIds.has(id)) continue;
    if (excludeCountries && excludeCountries.has(d.country)) continue;

    // Town-to-town distance (and pin), not runway-to-runway: airport-tier
    // rows keep the airport in lat/lon and the centre in city_lat/city_lon.
    const fromC = cityCoords(fromDest);
    const dC = cityCoords(d);
    const km = haversineKm(fromC.lat, fromC.lon, dC.lat, dC.lon);
    if (km == null || km > maxKm || km < 4) continue;

    const sharedOrigin = Object.keys(d.routes || {}).find((o) => anchorOrigins.has(o));
    const dRoadConnected = (d.local_transport || {}).road_connected !== false;
    // A ground leg only exists when both ends are road-connected (no sea crossing).
    const groundReachable = fromRoadConnected && dRoadConnected && km <= 450;
    // On a car trip (rental or the traveller's own), the next stop must be one
    // you can actually drive to, a shared flight origin is no help when
    // there's no fixed road link (islands).
    if (transport === 'car' || transport === 'owncar') {
      if (!groundReachable) continue;
    } else if (!sharedOrigin && !groundReachable) {
      continue;
    }

    const fareThatDay = (arriveDate && sharedOrigin)
      ? d.routes[sharedOrigin]?.outbound_fare?.[arriveDate] ?? null
      : null;

    out.push({
      id,
      city: d.city,
      country: d.country,
      iso2: d.iso2,
      lat: dC.lat,
      lon: dC.lon,
      km: Math.round(km),
      gems: d.beauty?.gems ?? null,
      rating: d.rating ?? null,
      beauty: d.beauty?.score ?? 0,
      gem_score: gemScore(d),
      image: d.image?.url || null,
      reason: suggestionReason(d),
      shared_origin: sharedOrigin || null,
      ground_reachable: groundReachable,
      fare_that_day_eur: fareThatDay,
    });
  }

  // Higher = better: mostly gemScore, softened by distance, nudged by a real
  // same-day fare and by staying flight-combinable.
  out.sort((a, b) => {
    const rankA = a.gem_score - a.km / 130 + (a.fare_that_day_eur != null ? 1.2 : 0) + (a.shared_origin ? 0.4 : 0);
    const rankB = b.gem_score - b.km / 130 + (b.fare_that_day_eur != null ? 1.2 : 0) + (b.shared_origin ? 0.4 : 0);
    return rankB - rankA;
  });
  return out.slice(0, limit);
}
