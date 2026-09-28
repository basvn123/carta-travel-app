/**
 * appData.js, data-file loading, shared across the app.
 *
 * The main dataset download starts the moment the bundle is evaluated (module
 * scope), so it runs in parallel with React booting instead of waiting for the
 * first component effect. It comes in two steps (T054, see bootIndex.js):
 *   - /boot.json              the boot index, from the app host
 *   - /dest/{cc}.json         one file per country, from the data host
 *                             (dataHost.js), merged back into the same
 *                             { meta, destinations } the app always had, by
 *                             the region store in catalogue.js: all of them
 *                             at once, or by viewport (CATALOGUE_MODE below)
 * The heavier, rarely-needed data is lazy:
 *   - /poi/{destId}.json      full POI list for one town (Day planner, detail)
 *   - /country_insights.json  per-country travel intel (planners + detail)
 */

import { faresUrl } from './fareFile.js';
import { shardName } from './poiShard.js';
import { DATA_BASE, dataUrl } from './dataHost.js';
import { createCatalogue } from './catalogue.js';

function fetchJson(path) {
  return fetch(dataUrl(path)).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });
}

// When the shards live on another host, open the connection to it while the
// boot index is still downloading, so the country files do not pay for a
// fresh DNS lookup and TLS handshake after it arrives.
if (DATA_BASE && typeof document !== 'undefined') {
  try {
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = new URL(DATA_BASE).origin;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  } catch { /* a hint only */ }
}

/** The boot index, started at module-eval time (index.html preloads it). */
export const bootIndexPromise = fetchJson('/boot.json');
bootIndexPromise.catch(() => {});

// One country file, retried once: forty-odd parallel requests make a single
// dropped one likely enough on a phone that it should not cost the whole map.
function fetchCountry(cc, hash) {
  const path = `/dest/${encodeURIComponent(cc)}.json?v=${encodeURIComponent(hash || '')}`;
  return fetchJson(path).catch(() => fetchJson(path));
}

// Under node import.meta.env does not exist (see dataHost.js).
const ENV = (import.meta && import.meta.env) || {};

/**
 * How the destination records load (T059), baked in at build time:
 *   'all'       (default) every country file at module-eval time, and the
 *               app renders once all of them are in, as since T054
 *   'viewport'  the first paint needs the boot index and the countries
 *               around the origin; the Explore map then fetches countries
 *               as they come on screen, and a screen that ranks the whole
 *               of Europe asks for the rest when it is shown
 * See catalogue.js and Execution/P3/T059-shard-by-region-viewport.md.
 */
export const CATALOGUE_MODE = ENV.VITE_CATALOGUE === 'viewport' ? 'viewport' : 'all';

/** The one store of destination records, by country file. */
export const catalogue = createCatalogue({
  loadBoot: () => bootIndexPromise,
  loadCountry: fetchCountry,
});

/**
 * The full dataset, { meta, destinations }, exactly as app_data.json used to
 * deliver it. In 'all' mode it is started at module-eval time and every
 * consumer shares the same promise. In 'viewport' mode nothing asks for it
 * up front; loadFullCatalogue() starts the same load on demand.
 */
let fullPromise = null;
export function loadFullCatalogue() {
  if (!fullPromise) {
    fullPromise = catalogue.ensureAll().then(() => catalogue.boot()).then((boot) => {
      const core = catalogue.snapshot();
      const missing = boot.d.length - Object.keys(core.destinations).length;
      if (missing) console.warn(`[appData] ${missing} destinations in the boot index had no record`);
      return core;
    });
    // A failed country is retried by the next ask, so forget the failure.
    fullPromise.catch(() => { fullPromise = null; });
  }
  return fullPromise;
}
export const appDataPromise = CATALOGUE_MODE === 'all' ? loadFullCatalogue() : null;
// Swallow the module-scope rejection so it never surfaces as an unhandled
// rejection before useAppData attaches its own catch. Consumers still get
// the real error from their own .then/.catch chains.
appDataPromise?.catch(() => {});

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
