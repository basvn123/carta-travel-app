/**
 * dataHost.js, where each data file the app fetches is served from.
 *
 * The wire is split by access pattern (CARTA_CLOUD_ARCHITECTURE.md 5.2,
 * Execution/P3/T054-wire-shards-to-r2.md):
 *
 *   boot index      /boot.json on the app host (Pages). id, lat, lon,
 *                   country, flags and rating band per destination, plus the
 *                   dataset meta. Small, and the only data the app needs
 *                   before it knows which country files to ask for.
 *   detail shards   everything in R2_TIER below, on the data host (R2 behind
 *                   data.carta-europetravel.com): the per-country destination
 *                   records, POI lists, dossiers, destinfo, regions, the
 *                   layer pages and the catalogue-sized root files.
 *   fare slices     fares/ and reach/, per origin, also on the data host.
 *   pin tiles       deferred to P15.
 *
 * One switch moves every shard: VITE_DATA_BASE, baked in at build time.
 * Unset (dev, and every build until the owner cuts over), every path stays
 * same-origin and the app behaves exactly as before. Set to
 * https://data.carta-europetravel.com/data, every R2_TIER path is fetched
 * from there instead, and scripts/r2/stage-data.mjs moves the same entries
 * out of dist/ so the Pages deploy carries the app shell and the boot index
 * only. The list below is the single source for both halves, which is why
 * the build script imports it from here rather than keeping its own copy.
 */

// Top-level entries of public/ that live on the data host. A directory name
// covers everything under it; a name with an extension is one root file.
// Fixed-size reference files (country_insights, country_shapes, joins) stay
// on the app host with the boot index: they do not grow with the catalogue.
export const R2_TIER = Object.freeze([
  'dest',
  'poi',
  'fares',
  'reach',
  'region',
  'destinfo',
  'dossier',
  'beaches',
  'lakes',
  'mountains',
  'trails',
  'cycling',
  'trips',
  'journeys',
  'coverage.json',
  'poi_credits.json',
  'search_index.json',
]);

const TIER_SET = new Set(R2_TIER);

// Under node (sync-data, the stage script, the tests) import.meta.env does
// not exist, so read it defensively; the base is then simply unset.
const ENV = (import.meta && import.meta.env) || {};

/**
 * The data host base URL with no trailing slash, or '' for same-origin.
 * Only https is accepted, except a loopback http host, which is what the
 * local stand-in harness serves from. Anything else is ignored rather than
 * half-applied, so a typo in the variable can never send some shards to a
 * wrong host while others stay home.
 */
export function normaliseBase(raw) {
  const s = String(raw || '').trim().replace(/\/+$/, '');
  if (!s) return '';
  let u;
  try { u = new URL(s); } catch { return ''; }
  const loopback = u.hostname === '127.0.0.1' || u.hostname === 'localhost';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && loopback)) return '';
  if (u.search || u.hash) return '';
  return s;
}

export const DATA_BASE = normaliseBase(ENV.VITE_DATA_BASE);

/** True when an absolute app path ("/poi/x.json") belongs to the data host. */
export function isDataPath(path) {
  const m = /^\/([^/?#]+)/.exec(String(path || ''));
  return !!m && TIER_SET.has(m[1]);
}

/**
 * The URL to fetch for an app data path. Unchanged when no data base is set
 * or the path is not a shard; otherwise the same path on the data host.
 * `base` is for tests and the stage script; the app always uses DATA_BASE.
 */
export function dataUrl(path, base = DATA_BASE) {
  if (!base || !isDataPath(path)) return path;
  return `${base}${path}`;
}
