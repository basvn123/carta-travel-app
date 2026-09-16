/**
 * appData.js, data-file loading, shared across the app.
 *
 * The main dataset download starts the moment the bundle is evaluated (module
 * scope), so it runs in parallel with React booting instead of waiting for the
 * first component effect. The heavier, rarely-needed data is lazy:
 *   - /poi/{destId}.json      full POI list for one town (Day planner, detail)
 *   - /country_insights.json  per-country travel intel (planners + detail)
 */

import { faresUrl } from './fareFile.js';
import { shardName } from './poiShard.js';

function fetchJson(path) {
  return fetch(path).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });
}

/** Started at module-eval time; every consumer shares the same promise. */
export const appDataPromise = fetchJson('/app_data.json');
// Swallow the module-scope rejection so it never surfaces as an unhandled
// rejection before useAppData attaches its own catch. Consumers still get
// the real error from their own .then/.catch chains.
appDataPromise.catch(() => {});

// Per-origin fare slices (public/fares/{IATA}.json, written by sync-data.mjs;
// faresUrl() escapes the handful of codes Windows reserves, see fareFile.js).
// Cached per origin; resolves null on failure so useAppData can tell "no such
// file / offline" apart from "empty but valid" and fall back gracefully.
const faresPromises = new Map();
export function fetchFares(origin) {
  if (!origin || !/^[A-Z0-9]{3,4}$/.test(origin)) return Promise.resolve(null);
  if (!faresPromises.has(origin)) {
    faresPromises.set(origin, fetchJson(faresUrl(origin)).catch(() => null));
  }
  return faresPromises.get(origin);
}

const poiShardPromises = new Map();
/**
 * The POI list for ONE destination, from public/poi/<id>.json.
 *
 * There used to be a single 33 MB activities_full.json holding every town's
 * list, fetched whole the moment the day planner mounted. A traveller
 * planning one day in one city downloaded 157,775 items to read 47 of them,
 * and parsing it froze the main thread for 4-8 seconds on a phone. The
 * shards are written by sync-data.mjs and average 8.6 KB. Resolves to [] on
 * failure, so a caller can render without it.
 */
export function fetchDestPois(destId) {
  const name = shardName(destId);
  if (!name) return Promise.resolve([]);
  if (!poiShardPromises.has(name)) {
    poiShardPromises.set(name, fetchJson(`/poi/${name}.json`)
      .then((j) => (Array.isArray(j) ? j : []))
      .catch(() => []));
  }
  return poiShardPromises.get(name);
}

let countryInsightsPromise = null;
/** Per-country travel insights (country name -> record). Cached; {} on failure. */
export function fetchCountryInsights() {
  if (!countryInsightsPromise) {
    countryInsightsPromise = fetchJson('/country_insights.json').catch(() => ({}));
  }
  return countryInsightsPromise;
}

/**
 * POI lists for MANY destinations, as the `{ destId: items }` map the day
 * planner reads. Backed by the same per-destination shards and the same
 * cache as fetchDestPois, so a town fetched for the picker is not fetched
 * again for the explore map.
 *
 * Every shard is already-resolved-or-in-flight in `poiShardPromises`, so
 * repeat calls with overlapping id sets cost nothing. HTTP/2 multiplexes the
 * handful of parallel requests a plan actually needs (1 for a single-city
 * day, up to ~35 for the landing explore map).
 */
export function fetchDestPoiMap(ids) {
  const want = [...new Set((ids || []).filter(Boolean))];
  if (!want.length) return Promise.resolve({});
  return Promise.all(want.map((id) => fetchDestPois(id).then((items) => [id, items])))
    .then((pairs) => Object.fromEntries(pairs));
}
