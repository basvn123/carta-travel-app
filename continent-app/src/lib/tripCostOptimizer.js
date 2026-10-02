/**
 * tripCostOptimizer.js, "take this trip cheaper" intelligence.
 *
 * One lever, computed from data the client already has:
 *   ORDER: compare the current stop order's total overland distance with a
 *   nearest-neighbour ordering; if reordering meaningfully shortens the
 *   route, estimate the saving in ground cost.
 *
 * The WHEN lever (cheapestStartDates, a sweep of start dates ranked by stored
 * flight fares) was removed in T273: Carta does not price flights (owner
 * decision, 2026-10-02) and the fares it ranked by are frozen snapshots.
 */
import { interCityGroundEstimate } from './trip_planner_pricing.js';
import { legTransportOptions } from './transport.js';
import { haversineKm, cityCoords } from './runtime_pricing.js';

/** Total estimated overland cost of visiting `ids` in that order, priced with
 *  the SAME country-profile leg engine the itinerary shows. The old flat
 *  0.15 EUR/km estimate could promise a saving the receipt then contradicted.
 *  Falls back to the flat estimate only when the leg engine has no answer
 *  (missing coords); a no-road sea leg prices as 0 here, which keeps orders
 *  that need a ferry from looking cheap. */
function groundCost(ids, destinations, groupSize, ctx = {}) {
  let total = 0;
  for (let i = 0; i < ids.length - 1; i++) {
    const a = destinations[ids[i]];
    const b = destinations[ids[i + 1]];
    const opts = legTransportOptions(a, b, groupSize, ctx);
    if (opts && opts.recommended && opts.modes[opts.recommended]) {
      total += opts.modes[opts.recommended].eur_total;
    } else if (!opts) {
      const est = interCityGroundEstimate(a, b, groupSize);
      if (est) total += est.ground_total;
    }
  }
  return total;
}

/** Nearest-neighbour ordering of the stop ids, keeping the first stop fixed
 *  (it's the flight-arrival anchor). Same approach as the planner's optimise. */
function nnOrder(ids, destinations) {
  if (ids.length < 3) return ids;
  // True town-centre distances: raw degree deltas over-weight east-west gaps
  // ~2x at European latitudes, and airport-tier rows keep the runway in
  // lat/lon, both can propose a genuinely worse order.
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
 * last stop can change, which can move the return-flight airport, the flight
 * delta is NOT netted into `saving_eur`. Keep the figure labelled as a ground
 * saving wherever it's surfaced.
 * @returns { saving_eur, ordered_ids, current_eur } or null when the current
 *          order is already (near-)optimal / too short to matter.
 */
export function reorderSavings(stops, destinations, groupSize, {
  minSavingEur = 15, carModel = null, countryInsights = null, hasCar = false,
} = {}) {
  const ids = (stops || []).map((s) => s.destinationId);
  if (ids.length < 3) return null;
  const ctx = { carModel, countryInsights, hasCar };
  const current = groundCost(ids, destinations, groupSize, ctx);
  const orderedIds = nnOrder(ids, destinations);
  if (orderedIds.every((id, i) => id === ids[i])) return null;
  const optimized = groundCost(orderedIds, destinations, groupSize, ctx);
  const saving = Math.round((current - optimized) * 100) / 100;
  if (saving < minSavingEur) return null;
  return { saving_eur: saving, ordered_ids: orderedIds, current_eur: Math.round(current * 100) / 100 };
}
