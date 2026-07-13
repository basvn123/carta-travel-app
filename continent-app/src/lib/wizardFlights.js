/**
 * wizardFlights.js - helpers for the guided wizard's period-first flow:
 *   1. monthOptions()        - the months covered by the fare data window, for
 *      the "I'm flexible" month chips.
 *   2. flyInOptions()        - every Ryanair route into the chosen countries,
 *      priced for the chosen period (exact start date, or cheapest date in the
 *      flexible window), sorted cheapest-first. The traveller picks ONE as the
 *      trip's arrival anchor.
 *   3. orderStaysFromAnchor() - nearest-neighbour ordering of the chosen stay
 *      cities, starting from the fly-in airport's city, so Carta hands the
 *      planner a route that already flows sensibly from arrival.
 */
import { haversineKm } from './runtime_pricing.js';
import { gemScore } from './trip_planner_pricing.js';

/** ['2026-07', '2026-08', ...] between two ISO dates (inclusive), with labels. */
export function monthOptions(minIso, maxIso) {
  if (!minIso || !maxIso) return [];
  const NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const out = [];
  let [y, m] = minIso.split('-').map(Number);
  const [ey, em] = maxIso.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push({ key: `${y}-${String(m).padStart(2, '0')}`, label: `${NAMES[m - 1]} ${y}` });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/** Cheapest stored fare in a { date: eur } map, optionally within one month. */
function minFare(fares, monthPrefix) {
  let best = null;
  for (const [date, eur] of Object.entries(fares || {})) {
    if (eur == null) continue;
    if (monthPrefix && !date.startsWith(monthPrefix)) continue;
    if (!best || eur < best.eur || (eur === best.eur && date < best.date)) best = { date, eur };
  }
  return best;
}

/**
 * Ryanair fly-in options for the wizard: destinations in the chosen countries
 * that have real stored outbound fares for the chosen period.
 *
 * @param destinations data.destinations
 * @param countries    Set of country names the traveller picked
 * @param startDate    exact ISO departure date, or '' when flexible
 * @param flexMonth    'YYYY-MM' to constrain a flexible search, or '' for any
 * @returns [{ id, dest, origin, anchor, exact_eur, cheapest: {date, eur}|null,
 *             gem_score }] sorted cheapest-first (exact-date fares before
 *             options with no fare stored on that date)
 */
export function flyInOptions(destinations, countries, { startDate = '', flexMonth = '' } = {}) {
  const out = [];
  for (const [id, d] of Object.entries(destinations || {})) {
    if (!d || !countries.has(d.country)) continue;
    let best = null;
    for (const [origin, r] of Object.entries(d.routes || {})) {
      const exact = startDate ? (r.outbound_fare?.[startDate] ?? null) : null;
      const cheapest = minFare(r.outbound_fare, startDate ? '' : flexMonth);
      if (exact == null && !cheapest) continue;
      const sortEur = exact != null ? exact : cheapest.eur;
      const cand = {
        origin,
        anchor: r.anchor_airport || d.iata || '',
        exact_eur: exact,
        cheapest,
        sort_eur: sortEur,
        has_exact: exact != null,
      };
      // Prefer a route that actually has a fare on the exact date; then price.
      if (!best
        || (cand.has_exact && !best.has_exact)
        || (cand.has_exact === best.has_exact && cand.sort_eur < best.sort_eur)) best = cand;
    }
    if (!best) continue;
    out.push({ id, dest: d, ...best, gem_score: gemScore(d) });
  }
  out.sort((a, b) => {
    if (a.has_exact !== b.has_exact) return a.has_exact ? -1 : 1;
    return a.sort_eur - b.sort_eur || b.gem_score - a.gem_score;
  });
  return out;
}

/** Nearest-neighbour ordering of stay ids, starting from the stay closest to
 *  the fly-in destination (or the first id when there's no anchor/coords). */
export function orderStaysFromAnchor(ids, destinations, anchorDest) {
  if (!ids || ids.length < 2) return ids || [];
  const nodes = ids.map((id) => ({ id, dest: destinations[id] }));
  if (nodes.some((n) => !n.dest || n.dest.lat == null)) return ids;

  let cur = { dest: anchorDest && anchorDest.lat != null ? anchorDest : nodes[0].dest };
  const remaining = [...nodes];
  const ordered = [];
  while (remaining.length) {
    let bi = 0;
    let bd = Infinity;
    remaining.forEach((n, idx) => {
      const km = haversineKm(cur.dest.lat, cur.dest.lon, n.dest.lat, n.dest.lon);
      if (km != null && km < bd) { bd = km; bi = idx; }
    });
    cur = remaining[bi];
    ordered.push(cur);
    remaining.splice(bi, 1);
  }
  return ordered.map((n) => n.id);
}
