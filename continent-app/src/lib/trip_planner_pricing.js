/**
 * trip_planner_pricing.js
 *
 * Multi-stop trip pricing, built on top of runtime_pricing.js's single-destination
 * data:
 *   1. combineTripLegs   - fly into one destination, out of another: which
 *      airports the round flight uses and the transfers from them. No fare
 *      (T511: fares removed; T517 adds flights back).
 *   2. interCityGroundEstimate, a distance-based cost/time estimate for getting
 *      between two stops overland (train/bus/rideshare). No free live pricing API
 *      for intercity ground transport exists, so this is always clearly flagged
 *      as an estimate, never presented as a bookable fare.
 *   3. suggestNextStops, candidate next stops for an itinerary: destinations
 *      reachable overland or sharing an origin airport with the first stop,
 *      ranked by distance + beauty.
 */

import {
  haversineKm, cityCoords, nearbyAirportIndex, airportLastLeg,
  DEFAULT_LIFESTYLE,
} from './runtime_pricing.js';
import { preferredPublicMode } from './transport.js';
import { round2 } from './math.js';
import { rule } from './price/config.js';
import { resolveGroundFare } from './groundFares.js';


/** The round flight's airports for flying into `destA` and out of `destB`,
 *  read off each destination's air route (origins.js), plus the transfers
 *  between those airports and the stops. Carries no fare (T511: fares
 *  removed; T517 adds flights back), so the result is marked `priced: false`.
 *  Both legs must resolve from the SAME origin airport.
 *
 *  Returns `{ combinable: false, reason }` when no valid combo exists:
 *    - 'missing_input': a stop or a date is missing.
 *    - 'no_shared_origin': destA and destB don't fly from any common origin.
 *
 *  `preferOrigin` is the departure airport the traveller already picked in the
 *  guided wizard; it wins when both stops are routed from it. `opts.allDests`
 *  (the whole catalogue) lets a stop with no airport of its own fly into a
 *  served airport within PLANE_REACH_KM (nearbyAirportIndex).
 */
export function combineTripLegs(destA, arriveDate, destB, departDate, groupSize = 1, preferOrigin = null, opts = {}) {
  if (!destA || !destB || !arriveDate || !departDate) {
    return { combinable: false, reason: 'missing_input' };
  }

  const allDests = opts.allDests || null;
  const reachA = resolveRouteDest(destA, allDests);
  const reachB = resolveRouteDest(destB, allDests);
  const routesA = reachA.dest.routes || {};
  const routesB = reachB.dest.routes || {};
  const sharedOrigins = Object.keys(routesA).filter((o) => routesB[o]);
  if (!sharedOrigins.length) {
    return { combinable: false, reason: 'no_shared_origin' };
  }
  const origin = sharedOrigins.includes(preferOrigin) ? preferOrigin : sharedOrigins[0];
  const rA = routesA[origin];
  const rB = routesB[origin];

  // Last leg from a nearby served airport into a town with no airport of its
  // own, on the same scale as composeTrip (zero when the place needs a car).
  const viaIn = reachA.via ? airportLastLeg(destA, reachA.via.straight_km) : null;
  const viaOut = reachB.via ? airportLastLeg(destB, reachB.via.straight_km) : null;
  const intoGround = viaIn ? viaIn.eur_pp_one_way : (rA.ground_transport_one_way_eur || 0);
  const outGround = viaOut ? viaOut.eur_pp_one_way : (rB.ground_transport_one_way_eur || 0);
  const group = Math.max(1, groupSize || 1);
  const groundPerPerson = intoGround + outGround;

  return {
    combinable: true,
    priced: false,
    origin,
    into_anchor: rA.anchor_airport || reachA.dest.iata,
    out_anchor: rB.anchor_airport || reachB.dest.iata,
    into_via: reachA.via,
    out_via: reachB.via,
    into_ground_eur: round2(intoGround),
    into_ground_minutes: viaIn ? viaIn.minutes : (rA.ground_transport_minutes || 0),
    out_ground_eur: round2(outGround),
    out_ground_minutes: viaOut ? viaOut.minutes : (rB.ground_transport_minutes || 0),
    ground_per_person: round2(groundPerPerson),
    ground_total: round2(groundPerPerson * group),
  };
}

/** The airport side of a flight the traveller booked themselves (T278).
 *  Carta does not price their seat, but the trip still lands somewhere and
 *  ends somewhere: `inDest` is the airport they fly into (the wizard's
 *  arrival, else the routed flight's), `outDest` the one they fly home from.
 *  The ids let the planner price the airport-to-stop legs (anchorLegs); the
 *  airport-to-centre hop comes from the routed flight's stored transfer, and
 *  only for a direction whose airport the routed flight also uses, since that
 *  transfer belongs to that airport. Returns the same transfer fields
 *  combineTripLegs carries, so flightTransfer reads both shapes alike. */
export function ownFlightTransfers(routed, inDest, outDest, groupSize = 1) {
  const inId = inDest?.id ?? null;
  const outId = outDest?.id ?? null;
  const ok = Boolean(routed?.combinable);
  const sameIn = ok && inId != null && routed.in_from_id === inId;
  const sameOut = ok && outId != null && routed.out_from_id === outId;
  const intoEur = sameIn ? (routed.into_ground_eur || 0) : 0;
  const outEur = sameOut ? (routed.out_ground_eur || 0) : 0;
  const group = Math.max(1, groupSize || 1);
  return {
    in_from_id: inId,
    out_from_id: outId,
    into_ground_eur: round2(intoEur),
    into_ground_minutes: sameIn ? (routed.into_ground_minutes || 0) : 0,
    out_ground_eur: round2(outEur),
    out_ground_minutes: sameOut ? (routed.out_ground_minutes || 0) : 0,
    ground_per_person: round2(intoEur + outEur),
    ground_total: round2((intoEur + outEur) * group),
  };
}

/** The destination whose air route a leg uses: itself when it carries routes,
 *  else the nearest served airport within PLANE_REACH_KM (nearbyAirportIndex),
 *  else itself with no route. `via` describes the hop. */
function resolveRouteDest(dest, allDests) {
  if (Object.keys(dest.routes || {}).length > 0 || !allDests) return { dest, via: null };
  const near = nearbyAirportIndex(allDests)?.get(dest.id);
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

// Why a trip's round flight couldn't be priced, in plain traveller language.
// Shared so every surface that shows a trip (the planner's Trip total, the
// planned Overview, the export) explains a missing flight plan identically, // never a message in one place and a silent gap in another.
const FLIGHT_REASON_LABELS = {
  no_shared_origin: "These two stops don't share a departure airport, so there's no single flight plan connecting them. Try a different first or last stop, or fly home and out again.",
  missing_input: 'Pick your travel dates and at least one stop to plan the flights.',
};

/** The traveller-facing explanation for a non-combinable flight result, or a
 *  sensible default. Pass `flight.reason` from combineTripLegs. */
export function flightReasonLabel(reason) {
  return FLIGHT_REASON_LABELS[reason] || 'Add your fare in the Trip planner.';
}

// T691: the fare comes from the one ground-fare model (groundFares.js: the
// country network priors and the shipped calibration, config/pricing.json),
// the cheaper of train and bus; before, a flat 0.15 a road km with a EUR 10
// floor that no other screen used. The time model stays here.
const GROUND_DETOUR_FACTOR = rule('ground.overland_floors').detour;   // road km vs straight-line km
const GROUND_KMH = rule('ground.transfer_public').kmh;               // average effective speed including stops/transfers
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
  const fares = ['train', 'bus']
    .map((mode) => resolveGroundFare({ mode, isoA: destA.iso2, isoB: destB.iso2, km: roadKm }))
    .filter((f) => f && f.eur > 0);
  if (!fares.length) return null;
  const perPerson = Math.min(...fares.map((f) => f.eur));
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
 *  from the current stop (a real ground leg), or (b) shares an origin airport
 *  with the FIRST stop so that, if it becomes the new last stop, the round
 *  flight still combines. We no longer require sharing an airport with the
 *  *current* stop specifically, that filtered out most of the beautiful
 *  villages you reach by ground, which is exactly what this tab is for.
 *
 *  Ranking is gemScore-led (see above) with a gentle distance preference and
 *  a small boost for flight-combinability, so
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
 *              image, reason, shared_origin, ground_reachable }]
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
    });
  }

  // Higher = better: mostly gemScore, softened by distance, nudged by staying
  // flight-combinable.
  out.sort((a, b) => {
    const rankA = a.gem_score - a.km / 130 + (a.shared_origin ? 0.4 : 0);
    const rankB = b.gem_score - b.km / 130 + (b.shared_origin ? 0.4 : 0);
    return rankB - rankA;
  });
  return out.slice(0, limit);
}

/**
 * The mode Carta picks for a stop-to-stop leg nobody has chosen yet, shared by
 * the wizard's estimate and the planner (T388): the car when the trip drives,
 * trains and buses when the traveller asked for public transport, and the leg
 * engine's own recommendation otherwise. `opts` is legTransportOptions' row.
 */
export function pickLegMode(opts, { transportPref = 'auto', hasCar = false } = {}) {
  if (!opts || !opts.modes) return null;
  if (hasCar) return 'car';
  if (transportPref === 'public') return preferredPublicMode(opts) || 'bus';
  return opts.recommended || null;
}
