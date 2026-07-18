/**
 * wizardFlights.js, helpers for the guided wizard's period-first flow:
 *   1. monthOptions()        - the months covered by the fare data window, for
 *      the "I'm flexible" month chips.
 *   2. flyInOptions()        - every Ryanair route into the chosen countries,
 *      priced for the chosen period (exact start date, or cheapest date in the
 *      flexible window), sorted cheapest-first. The traveller picks ONE as the
 *      trip's arrival anchor.
 *   3. orderStaysFromAnchor(), nearest-neighbour ordering of the chosen stay
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
 * Ryanair fly-in options for the wizard: the real ARRIVAL AIRPORTS you can
 * actually fly into to reach the chosen countries, priced for the chosen
 * period.
 *
 * You never fly "to" a gem like Cuenca, you fly to Madrid (MAD) and drive.
 * So every bookable (origin -> arrival-airport) fare that lands you in the
 * chosen countries is grouped by the airport it lands at, and each airport is
 * emitted once, placed at the airport city itself. The gems and towns reached
 * from that airport are surfaced separately as "interesting places around" it.
 * This keeps the map honest: one plane pin per city you genuinely fly to.
 *
 * @param destinations data.destinations
 * @param countries    Set of country names the traveller picked
 * @param startDate    exact ISO departure date, or '' when flexible
 * @param flexMonth    'YYYY-MM' to constrain a flexible search, or '' for any
 * @returns [{ id, dest, origin, anchor, exact_eur, cheapest: {date, eur}|null,
 *             gem_score }] one per arrival airport, sorted cheapest-first
 *             (exact-date fares before options with no fare stored on that date)
 */
export function flyInOptions(destinations, countries, { startDate = '', flexMonth = '' } = {}) {
  // anchor IATA -> the cheapest way in (across the airport's own routes and any
  // gem/town that routes through it).
  const airports = new Map();
  for (const [, d] of Object.entries(destinations || {})) {
    if (!d || !countries.has(d.country)) continue;
    for (const [origin, r] of Object.entries(d.routes || {})) {
      const anchor = r.anchor_airport || d.iata;
      if (!anchor) continue;
      const exact = startDate ? (r.outbound_fare?.[startDate] ?? null) : null;
      const cheapest = minFare(r.outbound_fare, startDate ? '' : flexMonth);
      if (exact == null && !cheapest) continue;
      const cand = {
        origin,
        exact_eur: exact,
        cheapest,
        sort_eur: exact != null ? exact : cheapest.eur,
        has_exact: exact != null,
      };
      const cur = airports.get(anchor);
      // Prefer a route with a fare on the exact date; then the cheapest fare.
      if (!cur
        || (cand.has_exact && !cur.has_exact)
        || (cand.has_exact === cur.has_exact && cand.sort_eur < cur.sort_eur)) {
        airports.set(anchor, cand);
      }
    }
  }

  // Resolve each arrival airport to its catalogue destination (airports are
  // keyed by their IATA) so the pin has real coords, a name and a rating.
  const out = [];
  for (const [anchor, best] of airports) {
    const airportDest = destinations[anchor]
      || Object.values(destinations).find((x) => x.iata === anchor);
    if (!airportDest || airportDest.lat == null) continue; // can't place a pin
    out.push({ id: airportDest.id, dest: airportDest, anchor, ...best, gem_score: gemScore(airportDest) });
  }
  // Priced-on-the-day first, then cheapest, then the most appealing airport city.
  out.sort((a, b) => {
    if (a.has_exact !== b.has_exact) return a.has_exact ? -1 : 1;
    return a.sort_eur - b.sort_eur || b.gem_score - a.gem_score;
  });
  return out;
}

/** Rough flight distance/duration for a fly-in option: great-circle km from
 *  the origin airport to the destination, at ~780 km/h cruise plus a fixed
 *  taxi/climb/descent overhead. An honest "about 2h05" signal, not a schedule. */
export function flightMeta(option, origins) {
  const o = origins?.[option.origin];
  const d = option.dest;
  if (!o || o.lat == null || !d || d.lat == null) return null;
  const km = haversineKm(o.lat, o.lon, d.lat, d.lon);
  if (km == null) return null;
  return { km: Math.round(km), min: Math.round(30 + km / 13) };
}

/** 125 -> "2h05", 45 -> "45 min". */
export function fmtFlightDuration(min) {
  if (!min || min <= 0) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
}

/** Which options deserve a quality chip: the cheapest fare, the shortest
 *  flight, and Carta's pick (price + duration + how special the place is).
 *  Returns { [optionId]: 'cheapest' | 'fastest' | 'pick' } - a route earns at
 *  most one chip, best label wins in that order of usefulness to a scanner. */
export function flightBadges(options, origins) {
  const out = {};
  if (!options || options.length < 2) return out;
  const metas = new Map(options.map((o) => [o.id, flightMeta(o, origins)]));

  let cheapest = null;
  let fastest = null; // { option, min }
  let pick = null;    // { option, rank }
  for (const o of options) {
    if (!cheapest || o.sort_eur < cheapest.sort_eur) cheapest = o;
    const m = metas.get(o.id);
    if (m && (!fastest || m.min < fastest.min)) fastest = { option: o, min: m.min };
    const rank = o.gem_score * 1.2 - o.sort_eur / 18 - (m ? m.min / 90 : 0) + (o.has_exact ? 0.8 : 0);
    if (!pick || rank > pick.rank) pick = { option: o, rank };
  }
  if (pick) out[pick.option.id] = 'pick';
  if (cheapest && !out[cheapest.id]) out[cheapest.id] = 'cheapest';
  if (fastest && !out[fastest.option.id]) out[fastest.option.id] = 'fastest';
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
