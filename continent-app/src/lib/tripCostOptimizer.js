/**
 * tripCostOptimizer.js - "take this trip cheaper" intelligence.
 *
 * Two independent levers, both computed from data the client already has:
 *   1. WHEN: sweep every start date that has a real stored fare for the first
 *      stop, price the whole flight combo (into first stop, out of last) for a
 *      trip of the same length, and surface the cheapest alternatives vs the
 *      currently chosen start.
 *   2. ORDER: compare the current stop order's total overland distance with a
 *      nearest-neighbour ordering; if reordering meaningfully shortens the
 *      route, estimate the saving in ground cost.
 */
import { addDays } from './dates.js';
import { combineTripLegs, interCityGroundEstimate } from './trip_planner_pricing.js';
import { haversineKm, cityCoords } from './runtime_pricing.js';

/**
 * Cheapest start dates for this itinerary, keeping the same stop order and
 * per-stop nights. Only dates with REAL stored fares for both the inbound and
 * outbound leg qualify - so every candidate here is actually bookable.
 *
 * @param stops        [{ destinationId, nights }]
 * @param destinations data.destinations
 * @param totalNights  the trip's total nights (defines the return date)
 * @param groupSize    travellers
 * @param currentStart the currently selected ISO start date (or '')
 * @returns { candidates: [{start, end, fare_total, ground_total, total, origin,
 *            saving_vs_current}], current_total } - candidates ascending by total
 */
export function cheapestStartDates(stops, destinations, totalNights, groupSize, currentStart, { limit = 3 } = {}) {
  if (!stops?.length || !totalNights) return { candidates: [], current_total: null };
  const first = destinations[stops[0].destinationId];
  const last = destinations[stops[stops.length - 1].destinationId];
  if (!first || !last) return { candidates: [], current_total: null };

  const priceFor = (start) => {
    const end = addDays(start, totalNights);
    const combo = combineTripLegs(first, start, last, end, groupSize);
    if (!combo.combinable) return null;
    return { start, end, fare_total: combo.fare_total, ground_total: combo.ground_total, total: combo.fare_total + combo.ground_total, origin: combo.origin };
  };

  const currentPriced = currentStart ? priceFor(currentStart) : null;
  const currentTotal = currentPriced ? currentPriced.total : null;

  const dates = new Set();
  for (const r of Object.values(first.routes || {})) {
    for (const d of Object.keys(r.outbound_fare || {})) dates.add(d);
  }

  const all = [];
  for (const d of dates) {
    if (d === currentStart) continue;
    const priced = priceFor(d);
    if (priced) all.push(priced);
  }
  all.sort((a, b) => a.total - b.total || (a.start < b.start ? -1 : 1));

  const candidates = all.slice(0, limit).map((c) => ({
    ...c,
    saving_vs_current: currentTotal != null ? Math.round((currentTotal - c.total) * 100) / 100 : null,
  }));
  return { candidates, current_total: currentTotal };
}

/** Total estimated overland cost of visiting `ids` in that order. */
function groundCost(ids, destinations, groupSize) {
  let total = 0;
  for (let i = 0; i < ids.length - 1; i++) {
    const est = interCityGroundEstimate(destinations[ids[i]], destinations[ids[i + 1]], groupSize);
    if (est) total += est.ground_total;
  }
  return total;
}

/** Nearest-neighbour ordering of the stop ids, keeping the first stop fixed
 *  (it's the flight-arrival anchor). Same approach as the planner's optimise. */
function nnOrder(ids, destinations) {
  if (ids.length < 3) return ids;
  // True town-centre distances: raw degree deltas over-weight east-west gaps
  // ~2x at European latitudes, and airport-tier rows keep the runway in
  // lat/lon - both can propose a genuinely worse order.
  const nodes = ids.map((id) => ({ id, c: cityCoords(destinations[id] || null) }));
  if (nodes.some((n) => n.c.lat == null)) return ids;
  const ordered = [nodes[0]];
  const remaining = nodes.slice(1);
  let cur = nodes[0];
  while (remaining.length) {
    let bi = 0;
    let bd = Infinity;
    remaining.forEach((n, idx) => {
      const km = haversineKm(cur.c.lat, cur.c.lon, n.c.lat, n.c.lon);
      if (km != null && km < bd) { bd = km; bi = idx; }
    });
    cur = remaining[bi];
    ordered.push(cur);
    remaining.splice(bi, 1);
  }
  return ordered.map((n) => n.id);
}

/**
 * Would reordering the stops save money on ground transport?
 * GROUND-ONLY: the first stop stays fixed (the flight-arrival anchor) but the
 * last stop can change, which can move the return-flight airport - the flight
 * delta is NOT netted into `saving_eur`. Keep the figure labelled as a ground
 * saving wherever it's surfaced.
 * @returns { saving_eur, ordered_ids, current_eur } or null when the current
 *          order is already (near-)optimal / too short to matter.
 */
export function reorderSavings(stops, destinations, groupSize, { minSavingEur = 15 } = {}) {
  const ids = (stops || []).map((s) => s.destinationId);
  if (ids.length < 3) return null;
  const current = groundCost(ids, destinations, groupSize);
  const orderedIds = nnOrder(ids, destinations);
  if (orderedIds.every((id, i) => id === ids[i])) return null;
  const optimized = groundCost(orderedIds, destinations, groupSize);
  const saving = Math.round((current - optimized) * 100) / 100;
  if (saving < minSavingEur) return null;
  return { saving_eur: saving, ordered_ids: orderedIds, current_eur: Math.round(current * 100) / 100 };
}
