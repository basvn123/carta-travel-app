/**
 * coverageEmpty.js, the facts behind the coverage empty-state module (T124,
 * widened by T367; docs/ONBOARDING_AND_EMPTY_STATES.md "The coverage module",
 * destinations spec 1.6).
 *
 * Two jobs. First, say WHY a list is empty when Carta knows. Second, find the
 * three nearest published rows across the border (or around a searched place),
 * from the same layer wire the list would have read.
 *
 * The reason comes from three sources, in order of trust:
 *   1. The seven microstates of spec 1.6, whose per layer reasons are the
 *      document's own table (CASES below): Monaco has no lake over five
 *      hectares, San Marino is 61 square kilometres.
 *   2. The coverage contract's reason code (pipeline/regions/coverage.py
 *      REASON_CODES), once the wire carries it (T211-c, T160-a).
 *   3. Until then, the region audit the wire has always carried: when every
 *      region of the country is `na` for the layer, the `why` they share
 *      (no coast, no lake over 5 hectares, no relief) is the sentence; when
 *      it is not, the honest sentence is that coverage grows country by
 *      country. No screen invents a reason the wire does not hold.
 *
 * The neighbours come from the catalogue itself: for any country, the four
 * countries whose towns lie closest to its towns (countryGeo). The microstates
 * keep their written table, because a 2 square kilometre country has one town
 * and the table names its real neighbours.
 */
import { loadBeaches } from './beaches.js';
import { loadLakes } from './lakes.js';
import { loadMountains } from './mountains.js';
import { loadCycling } from './cycling.js';
import { loadTrails } from './trails.js';
import { loadTrips } from './trips.js';
import { MICROSTATES, countryGeo, nearestThree, kmBetween } from './coverageCases.js';

// The pure half (reasons, geography, distances) lives in coverageCases.js.
export * from './coverageCases.js';

const LOADERS = {
  beach: (cc) => loadBeaches(cc).then((r) => r || []),
  lake: (cc) => loadLakes(cc).then((r) => r || []),
  mountain: (cc) => loadMountains(cc).then((r) => r || []),
  cycling: (cc) => loadCycling(cc).then((r) => (r ? r.routes : [])),
  trail: (cc) => loadTrails(cc)
    .then((r) => (r || []).filter((x) => x.category !== 'citytrip')),
  itin: (cc) => loadTrips(cc).then((r) => r || []),
};

/** The three nearest published rows of `layer` around `geo` ({lat, lon,
 *  near}), read from the neighbours' country files, rows of `cc` excluded.
 *  With no `geo`, a microstate's own table is used (T124's call). */
export async function loadNearest(layer, cc, geo = null) {
  const g = geo || (MICROSTATES[cc] ? countryGeo(null, cc) : null);
  const load = LOADERS[layer];
  if (!g || !load || !g.near?.length) return [];
  const lists = await Promise.all(g.near.map((n) => load(n)
    .then((rows) => rows.map((r) => ({ ...r, cc: r.cc || r.country || n })))
    .catch(() => [])));
  return nearestThree(lists.flat(), g, cc);
}

/** The nearest published row of `layer` to a page's own row (or a point)
 *  inside one country file, for the one line a detail page section keeps
 *  when it has nothing to show. `skipId` leaves the page's own row out. */
export async function loadNearestIn(layer, cc, from, skipId = null) {
  const load = LOADERS[layer];
  if (!load || !cc || !from) return null;
  const rows = await load(cc).catch(() => []);
  let best = null;
  for (const r of rows) {
    if (skipId != null && String(r.id) === String(skipId)) continue;
    const km = kmBetween(from, r);
    if (km != null && (!best || km < best.km)) {
      best = { row: { ...r, cc: r.cc || r.country || cc }, km, layer };
    }
  }
  return best;
}

/** The nearest row over several layers at once (the destination page's
 *  "around here", which spans five). */
export async function loadNearestOf(layers, cc, from, skipId = null) {
  const hits = await Promise.all(layers.map((l) => loadNearestIn(l, cc, from, skipId)));
  return hits.filter(Boolean).sort((a, b) => a.km - b.km)[0] || null;
}

