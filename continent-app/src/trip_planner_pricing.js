/**
 * trip_planner_pricing.js
 *
 * Multi-stop trip pricing, built on top of runtime_pricing.js's single-destination
 * data rather than any new fare source:
 *   1. combineTripLegs   - fly into one destination, out of another, using each
 *      destination's own real (already-fetched) one-way-equivalent Ryanair fares.
 *      No open-jaw fare fetching - both legs must share a common origin airport.
 *   2. interCityGroundEstimate - a distance-based cost/time estimate for getting
 *      between two stops overland (train/bus/rideshare). No free live pricing API
 *      for intercity ground transport exists, so this is always clearly flagged
 *      as an estimate, never presented as a bookable fare.
 *   3. suggestNextStops - candidate next stops for an itinerary: destinations that
 *      share an origin airport with the current stop (the binding constraint for
 *      combineTripLegs to work at all), ranked by distance + beauty.
 */

import { haversineKm } from './runtime_pricing.js';

function round2(v) {
  return v == null ? null : Math.round(v * 100) / 100;
}

/** Real fares for flying into `destA` and out of `destB`, combined from each
 *  destination's own routes data - not a new open-jaw fare lookup. Both legs
 *  must resolve from the SAME origin airport (BRU or CRL); picks whichever
 *  shared origin is cheaper when both work.
 *
 *  Returns `{ combinable: false, reason }` when no valid combo exists:
 *    - 'no_shared_origin': destA and destB don't fly from any common origin.
 *    - 'no_fare_for_date': a shared origin exists, but one leg has no fare
 *      stored for the requested date.
 */
export function combineTripLegs(destA, arriveDate, destB, departDate, groupSize = 1) {
  if (!destA || !destB || !arriveDate || !departDate) {
    return { combinable: false, reason: 'missing_input' };
  }

  const routesA = destA.routes || {};
  const routesB = destB.routes || {};
  const sharedOrigins = Object.keys(routesA).filter((o) => routesB[o]);
  if (!sharedOrigins.length) {
    return { combinable: false, reason: 'no_shared_origin' };
  }

  let best = null;
  for (const origin of sharedOrigins) {
    const rA = routesA[origin];
    const rB = routesB[origin];
    const intoFare = rA.outbound_fare?.[arriveDate];
    const outOfFare = rB.return_fare?.[departDate];
    if (intoFare == null || outOfFare == null) continue;

    const combinedFare = intoFare + outOfFare;
    if (best == null || combinedFare < best.combined_fare) {
      best = {
        origin,
        combined_fare: combinedFare,
        into_fare: intoFare,
        out_of_fare: outOfFare,
        into_anchor: rA.anchor_airport || destA.iata,
        out_anchor: rB.anchor_airport || destB.iata,
        into_ground_eur: rA.ground_transport_one_way_eur || 0,
        into_ground_minutes: rA.ground_transport_minutes || 0,
        out_ground_eur: rB.ground_transport_one_way_eur || 0,
        out_ground_minutes: rB.ground_transport_minutes || 0,
      };
    }
  }

  if (!best) return { combinable: false, reason: 'no_fare_for_date' };

  const group = Math.max(1, groupSize || 1);
  const groundPerPerson = best.into_ground_eur + best.out_ground_eur;

  return {
    combinable: true,
    origin: best.origin,
    into_anchor: best.into_anchor,
    out_anchor: best.out_anchor,
    into_fare_eur: round2(best.into_fare),
    out_of_fare_eur: round2(best.out_of_fare),
    fare_per_person: round2(best.combined_fare),
    fare_total: round2(best.combined_fare * group),
    into_ground_eur: round2(best.into_ground_eur),
    into_ground_minutes: best.into_ground_minutes,
    out_ground_eur: round2(best.out_ground_eur),
    out_ground_minutes: best.out_ground_minutes,
    ground_per_person: round2(groundPerPerson),
    ground_total: round2(groundPerPerson * group),
    grand_total: round2(best.combined_fare * group + groundPerPerson * group),
  };
}

const GROUND_DETOUR_FACTOR = 1.3;   // road km vs straight-line km (mirrors car_layer.py / apply_airport_anchors.py)
const GROUND_EUR_PER_KM = 0.15;     // rough European train/bus fare per road km
const GROUND_FLOOR_EUR = 10;        // no realistic intercity fare is cheaper than this
const GROUND_KMH = 65;              // average effective speed including stops/transfers
const GROUND_LONG_HAUL_KM = 800;    // beyond this, ground transport stops being a realistic recommendation

/** Estimated cost/time to get from `destA` to `destB` overland (train/bus/
 *  rideshare) - not a live fare, since no free universal pricing API for
 *  intercity ground transport exists. Uses the same road-detour-factor
 *  approach as the app's existing airport-transfer and driving estimates, but
 *  WITHOUT their short-transfer EUR cap (that cap is tuned for ~city<->airport
 *  distances, not city-to-city legs that can run into the hundreds of km).
 *  Returns null when either endpoint isn't road-connected (islands / sea
 *  crossings - same signal `drivingEstimate()` uses).
 */
export function interCityGroundEstimate(destA, destB, groupSize = 1) {
  if (!destA || !destB || destA.lat == null || destB.lat == null) return null;
  const ltA = destA.local_transport || {};
  const ltB = destB.local_transport || {};
  if (ltA.road_connected === false || ltB.road_connected === false) return null;

  const straightKm = haversineKm(destA.lat, destA.lon, destB.lat, destB.lon);
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

/** Candidate next stops for a multi-city itinerary starting from `fromDest`:
 *  destinations that share at least one origin airport with `fromDest` (the
 *  binding constraint for combineTripLegs to find a real combined fare at
 *  all), within `maxKm` straight-line, ranked by distance + beauty - with a
 *  boost for stops that have a confirmed fare on `arriveDate` specifically.
 *
 *  Deliberately not a reuse of nearbyTrips() (runtime_pricing.js), which is
 *  tuned for "day trip from a single base" at a 160km cutoff - a next stop on
 *  a multi-city trip can reasonably be much farther, as long as it's
 *  reachable from the same origin airport.
 *
 *  @param fromDest  the current stop's destination record
 *  @param allDests  data.destinations (object id->record)
 *  @param arriveDate ISO date the traveller would arrive at the next stop, or null
 *  @param opts.maxKm  straight-line cutoff (default 400km)
 *  @param opts.limit  how many to return (default 6)
 *  @returns [{ id, city, country, iso2, km, gems, beauty, image, shared_origin, fare_that_day_eur }]
 */
export function suggestNextStops(fromDest, allDests, arriveDate, { maxKm = 400, limit = 6 } = {}) {
  if (!fromDest || !allDests || fromDest.lat == null) return [];
  const fromOrigins = new Set(Object.keys(fromDest.routes || {}));
  if (!fromOrigins.size) return [];

  const out = [];
  for (const [id, d] of Object.entries(allDests)) {
    if (id === fromDest.id || d.lat == null) continue;
    if (d.city === fromDest.city) continue; // same place, different airport

    const sharedOrigin = Object.keys(d.routes || {}).find((o) => fromOrigins.has(o));
    if (!sharedOrigin) continue;

    const km = haversineKm(fromDest.lat, fromDest.lon, d.lat, d.lon);
    if (km == null || km > maxKm || km < 4) continue;

    const fareThatDay = arriveDate ? d.routes[sharedOrigin].outbound_fare?.[arriveDate] : null;

    out.push({
      id,
      city: d.city,
      country: d.country,
      iso2: d.iso2,
      km: Math.round(km),
      gems: d.beauty?.gems ?? null,
      beauty: d.beauty?.score ?? 0,
      image: d.image?.url || null,
      shared_origin: sharedOrigin,
      fare_that_day_eur: fareThatDay ?? null,
    });
  }

  out.sort((a, b) => {
    const scoreA = a.km - a.beauty * 6 - (a.fare_that_day_eur != null ? 20 : 0);
    const scoreB = b.km - b.beauty * 6 - (b.fare_that_day_eur != null ? 20 : 0);
    return scoreA - scoreB;
  });
  return out.slice(0, limit);
}
