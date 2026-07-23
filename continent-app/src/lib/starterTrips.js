/**
 * starterTrips.js, Carta's ready-made trips per country (or pair of
 * countries): "Most beautiful", "Best value for money", "Cheap but lovely"
 * and "Hidden gems". Not hand-written lists: every itinerary is derived live
 * from the same research signals the rest of the app trusts (the curated
 * 0-10 traveller rating, hidden-gem flags, real accommodation anchors), so
 * all 43 countries get honest trips without 43 hand-curated files.
 *
 * Each trip is a normal wizard-shaped selection ({ stops: [{ destinationId,
 * nights }], label }) so the planner opens it like any wizard result and the
 * traveller can modify everything afterwards.
 */
import { haversineKm, accommodationPerPerson, cityCoords } from './runtime_pricing.js';

const TRIP_NIGHTS = 8;   // a comfortable week-plus; nights stay editable
const MAX_STOPS = 4;
// How hard distance pulls against a candidate's quality when extending the
// route: quality points lost per 100 km from the previous stop. Keeps a
// "most beautiful Italy" from pairing the Dolomites with Sicily.
const DIST_PENALTY_PER_100KM = 0.9;
const MAX_HOP_KM = 420;

/** Whole-group per-night stay price, the same model the receipt uses. */
function nightlyFor(dest, groupSize) {
  const a = accommodationPerPerson(dest, 2, null, null, groupSize);
  return a && a.total > 0 ? (a.total * groupSize) / 2 : null;
}

/** Greedy compact route: seed with the best candidate, then keep adding the
 *  best quality-minus-distance neighbour of the LAST stop. */
function buildRoute(cands, quality, maxStops) {
  const pool = [...cands].sort((a, b) => quality(b) - quality(a));
  if (!pool.length) return [];
  const route = [pool.shift()];
  while (route.length < maxStops && pool.length) {
    const last = route[route.length - 1];
    const lc = cityCoords(last.d);
    let best = null;
    let bestScore = -Infinity;
    for (const cand of pool) {
      const cc = cityCoords(cand.d);
      const km = haversineKm(lc.lat, lc.lon, cc.lat, cc.lon);
      if (km == null || km > MAX_HOP_KM) continue;
      const s = quality(cand) - (km / 100) * DIST_PENALTY_PER_100KM;
      if (s > bestScore) { bestScore = s; best = cand; }
    }
    if (!best || bestScore <= 0) break;
    route.push(best);
    pool.splice(pool.indexOf(best), 1);
  }
  return route;
}

/** Spread TRIP_NIGHTS over the route, weighted by rating, min 2 per stop. */
function spreadNights(route) {
  const weights = route.map(({ d }) => Math.max(1, d.rating?.score ?? 5));
  const total = weights.reduce((s, w) => s + w, 0);
  const nights = route.map((_, i) => Math.max(2, Math.round((weights[i] / total) * TRIP_NIGHTS)));
  // Trim/pad to exactly TRIP_NIGHTS, adjusting the highest-rated stop.
  let diff = TRIP_NIGHTS - nights.reduce((s, n) => s + n, 0);
  const top = weights.indexOf(Math.max(...weights));
  nights[top] = Math.max(2, nights[top] + diff);
  return nights;
}

const THEMES = [
  {
    key: 'beautiful',
    title: 'Most beautiful',
    desc: 'The highest-rated places, strung into one route',
    eligible: (c) => (c.d.rating?.score ?? 0) >= 6,
    quality: (c) => c.d.rating?.score ?? 0,
  },
  {
    key: 'value',
    title: 'Best value for money',
    desc: 'Strong ratings for the fewest euros per night',
    eligible: (c) => (c.d.rating?.score ?? 0) >= 5.8 && c.nightly != null,
    quality: (c) => (c.d.rating?.score ?? 0) - (c.nightly / 60),
  },
  {
    key: 'cheap',
    title: 'Cheap but lovely',
    desc: 'The cheapest stays that are still genuinely worth the trip',
    eligible: (c) => (c.d.rating?.score ?? 0) >= 5.2 && c.nightly != null,
    quality: (c) => 10 - (c.nightly / 18) + ((c.d.rating?.score ?? 0) - 5.2) * 0.6,
  },
  {
    key: 'gems',
    title: 'Hidden gems',
    desc: 'Highly rated, hardly famous: the under-the-radar route',
    eligible: (c) => c.d.rating?.hidden_gem || (c.d.tier === 'gem' && (c.d.rating?.score ?? 0) >= 6),
    quality: (c) => (c.d.rating?.score ?? 0) + (c.d.rating?.hidden_gem ? 1 : 0),
  },
];

/**
 * Ready-made trips for one or two countries.
 * @param destinations  the app's { id: dest } map
 * @param countries     array of 1-2 country names
 * @returns [{ key, title, desc, label, stops:[{destinationId, nights}],
 *             cities:[{id, city, score, nightly}], avgScore, nightlyTotal }]
 */
export function starterTripsFor(destinations, countries, { groupSize = 2 } = {}) {
  const wanted = new Set(countries || []);
  if (!wanted.size) return [];
  const all = Object.entries(destinations || {})
    .map(([id, d]) => ({ id, d }))
    .filter(({ d }) => d && wanted.has(d.country) && d.lat != null);
  // Multi-airport cities ("Rome (Fiumicino)" / "(Ciampino)") are ONE city:
  // keep a single entry per base name, whichever rates best, or a "most
  // beautiful Italy" opens with Rome twice.
  const byBase = new Map();
  for (const c of all) {
    const key = `${(c.d.city || '').replace(/\s*\(.*\)\s*$/, '')}|${c.d.country}`;
    const cur = byBase.get(key);
    if (!cur || (c.d.rating?.score ?? 0) > (cur.d.rating?.score ?? 0)) byBase.set(key, c);
  }
  const cands = [...byBase.values()].map((c) => ({ ...c, nightly: nightlyFor(c.d, groupSize) }));
  if (cands.length < 2) return [];

  const trips = [];
  const seenRoutes = new Set();
  for (const theme of THEMES) {
    const route = buildRoute(cands.filter(theme.eligible), theme.quality, MAX_STOPS);
    if (route.length < 2) continue;
    const routeKey = route.map((c) => c.id).sort().join('|');
    if (seenRoutes.has(routeKey)) continue; // tiny countries: themes converge
    seenRoutes.add(routeKey);
    const nights = spreadNights(route);
    const avgScore = Math.round(
      (route.reduce((s, c) => s + (c.d.rating?.score ?? 0), 0) / route.length) * 10,
    ) / 10;
    const nightlyKnown = route.filter((c) => c.nightly != null);
    const nightlyTotal = nightlyKnown.length
      ? Math.round(route.reduce((s, c, i) => s + (c.nightly ?? 0) * nights[i], 0))
      : null;
    trips.push({
      key: theme.key,
      title: theme.title,
      desc: theme.desc,
      label: `${theme.title}: ${countries.join(' + ')}`,
      stops: route.map((c, i) => ({ destinationId: c.id, nights: nights[i], activities: [] })),
      cities: route.map((c, i) => ({
        id: c.id,
        // The airport suffix is flight-speak; trip cards talk about towns.
        city: (c.d.city || '').replace(/\s*\(.*\)\s*$/, ''),
        nights: nights[i],
        score: c.d.rating?.score ?? null,
        nightly: c.nightly,
      })),
      avgScore,
      nightlyTotal,
    });
  }
  return trips;
}
