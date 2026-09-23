/**
 * contract.mjs, the app_data.json contract, written down as code.
 *
 * WHY THIS FILE EXISTS AT ALL
 *
 * There is no runtime validator in the app. src/lib/appData.js fetches
 * /app_data.json and hands the parsed object straight to useAppData, which
 * reads meta.defaults, meta.baggage_options, meta.accommodation_model and
 * meta.car_model with optional chaining and falls back on every one of them.
 * hydrateForOrigin then walks destinations and rebuilds routes. Nothing
 * throws. A payload missing half its keys renders an app with no prices and
 * no error, which is exactly the failure that reaches a user rather than a
 * build log.
 *
 * So the checks below are written from docs/SCHEMA.md's required fields and
 * from what the app actually dereferences, not imported from a validator that
 * does not exist. When somebody writes a real hydration-time validator, this
 * file should import it instead and keep only the checks the validator does
 * not cover.
 *
 * WHAT COUNTS AS REQUIRED
 *
 * Deliberately narrow. A field is required here only when the app is visibly
 * broken without it, not merely thinner. meta.schema_version, the currency,
 * the fare window, the defaults block and the baggage options are all read on
 * the boot path. Per destination: an id, a tier, a city, a country, an iso2
 * and finite coordinates. Everything else (climate, crowding, guide, beauty,
 * dossier joins) is a layer the app degrades through on purpose, and asserting
 * on those would make this gate fail for reasons that are not contract breaks.
 *
 * The version is pinned to what the SHIPPED payload carries, not to what the
 * documentation claims. As of T029 public/app_data.json has
 * meta.schema_version 17 while docs/SCHEMA.md's header still says 15; the
 * document's own later sections go up to "Schema v17", so 15 is stale prose
 * and 17 is the contract. Pinning to the file rather than the doc is the
 * whole point of the gate: a pipeline change that bumps the version has to
 * come here and to SCHEMA.md in the same task, and a tripwire nobody has to
 * touch is a tripwire that is not attached to anything.
 */

export const EXPECTED_SCHEMA_VERSION = 17;

// Top-level keys the boot path reads before it can render a price.
const REQUIRED_META = [
  'schema_version', 'currency', 'start_date', 'end_date',
  'defaults', 'baggage_options',
];

// Per destination, the fields with no fallback anywhere in the app.
const REQUIRED_DEST = ['id', 'tier', 'city', 'country', 'iso2'];

// Mirror of src/lib/fareFile.js. A fare slice for an origin whose IATA code
// collides with a DOS device name ships with a trailing underscore, and the
// escape has to hold on both ends or that origin silently ships no fares.
const RESERVED = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  ...Array.from({ length: 10 }, (_, i) => `COM${i}`),
  ...Array.from({ length: 10 }, (_, i) => `LPT${i}`),
]);

export function fareFileBase(origin) {
  const code = String(origin || '').toUpperCase();
  return RESERVED.has(code) ? `${code}_` : code;
}

const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Validate a parsed app_data payload. Returns an array of problem strings;
 * empty means it passes.
 *
 * `fareFiles` is an optional array of fare slice basenames (no extension) as
 * they exist on disk. When given, every basename must be one fareFileBase()
 * could have produced, because a slice named PRN.json is a file git will not
 * index and the app will never fetch.
 */
export function validateAppData(data, { fareFiles = null } = {}) {
  const problems = [];
  const bad = (m) => problems.push(m);

  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return ['payload is not an object'];
  }

  const meta = data.meta;
  if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) {
    bad('meta is missing or not an object');
  } else {
    for (const k of REQUIRED_META) {
      if (!(k in meta)) bad(`meta.${k} is missing`);
    }
    if ('schema_version' in meta && meta.schema_version !== EXPECTED_SCHEMA_VERSION) {
      bad(`meta.schema_version is ${JSON.stringify(meta.schema_version)}, `
        + `expected ${EXPECTED_SCHEMA_VERSION} (see docs/SCHEMA.md)`);
    }
    if ('currency' in meta && meta.currency !== 'EUR') {
      bad(`meta.currency is ${JSON.stringify(meta.currency)}, expected "EUR"`);
    }
    for (const k of ['start_date', 'end_date']) {
      const v = meta[k];
      if (k in meta && !(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v))) {
        bad(`meta.${k} is not an ISO date: ${JSON.stringify(v)}`);
      }
    }
    if (meta.defaults !== undefined
        && (meta.defaults === null || typeof meta.defaults !== 'object')) {
      bad('meta.defaults is not an object');
    }
    if (meta.baggage_options !== undefined
        && (meta.baggage_options === null || typeof meta.baggage_options !== 'object')) {
      bad('meta.baggage_options is not an object');
    }
  }

  const dests = data.destinations;
  if (dests === null || typeof dests !== 'object' || Array.isArray(dests)) {
    bad('destinations is missing or not an object');
    return problems;
  }

  // Pair the "every destination satisfies P" walk below with a minimum count.
  // Without it an empty destinations map passes every per-destination check
  // vacuously, which is the exact shape of gate this repo has been burned by
  // before. One destination is not a real catalogue either, so the floor is
  // set where a fixture is still allowed but an empty or truncated ship is not.
  const ids = Object.keys(dests);
  if (ids.length < 2) {
    bad(`destinations holds ${ids.length} entries; a valid payload has at least 2`);
  }

  for (const key of ids) {
    const d = dests[key];
    const where = `destinations.${key}`;
    if (d === null || typeof d !== 'object' || Array.isArray(d)) {
      bad(`${where} is not an object`);
      continue;
    }
    for (const f of REQUIRED_DEST) {
      if (d[f] === undefined || d[f] === null || d[f] === '') {
        bad(`${where}.${f} is missing`);
      }
    }
    if (d.id !== undefined && d.id !== key) {
      bad(`${where}.id is ${JSON.stringify(d.id)}, does not match its key`);
    }
    if (d.tier !== undefined && d.tier !== 'airport' && d.tier !== 'gem') {
      bad(`${where}.tier is ${JSON.stringify(d.tier)}, expected "airport" or "gem"`);
    }
    // Coordinates are the field most likely to arrive as a string from a
    // hand-edited or CSV-round-tripped payload, and a string latitude puts a
    // marker at NaN, which is the MapLibre crash this repo already has a
    // memory about. Type is asserted, not coerced.
    for (const f of ['lat', 'lon']) {
      if (!isFiniteNum(d[f])) {
        bad(`${where}.${f} is not a finite number: ${JSON.stringify(d[f])}`);
      }
    }
    if (isFiniteNum(d.lat) && (d.lat < -90 || d.lat > 90)) {
      bad(`${where}.lat out of range: ${d.lat}`);
    }
    if (isFiniteNum(d.lon) && (d.lon < -180 || d.lon > 180)) {
      bad(`${where}.lon out of range: ${d.lon}`);
    }
  }

  if (Array.isArray(fareFiles)) {
    if (fareFiles.length < 1) {
      bad('no fare slices found; the app prices nothing without them');
    }
    for (const base of fareFiles) {
      if (fareFileBase(base.replace(/_$/, '')) !== base) {
        bad(`fare slice "${base}.json" does not match fareFileBase(); `
          + 'a reserved IATA code must ship with its trailing underscore '
          + '(see src/lib/fareFile.js)');
      }
    }
  }

  return problems;
}
