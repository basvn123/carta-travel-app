/**
 * Ship the real pipeline dataset into the app's served location, split for the
 * wire so `vite dev` and `vite build` serve the full catalogue efficiently:
 *
 *   app_data/app_data.json  (master, untouched)
 *     ├─> public/app_data.json          core dataset, with the two heavy,
 *     │                                 rarely-needed-at-boot parts removed:
 *     │                                   - activities.items_full  (~40 POIs/dest)
 *     │                                   - image.hires            (never read)
 *     └─> public/activities_full.json   { destId: items_full } — lazy-fetched
 *                                       by the Day planner when it needs pins
 *
 *   app_data/country_insights.json ──> public/country_insights.json (verbatim,
 *   lazy-fetched by the planners/detail panel when a country's intel is shown)
 *
 * Runs automatically via the `predev` / `prebuild` npm hooks. Safe by hand:
 *   npm run data
 *
 * If the master dataset is missing, this warns and leaves whatever is already
 * in public/ in place (so a fresh clone without the pipeline output builds).
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { stripDashes } from '../src/lib/format.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));   // continent-app/scripts
const repoRoot = resolve(scriptDir, '..', '..');             // repo root
const publicDir = resolve(scriptDir, '..', 'public');
const src = resolve(repoRoot, 'app_data', 'app_data.json');
const insightsSrc = resolve(repoRoot, 'app_data', 'country_insights.json');
const airportsCache = resolve(repoRoot, 'cache', 'ryanair_airports.json');

const kb = (s) => `${Math.round(s.length / 1024)} KB`;

// House style: the app must never render an em/en dash. The pipeline can still
// emit them (harvested POI names, ferry routes, date ranges), so we scrub every
// shipped string here - one choke point, since the app only ever reads public/.
function sanitizeDeep(o) {
  if (Array.isArray(o)) {
    for (let i = 0; i < o.length; i++) {
      if (typeof o[i] === 'string') o[i] = stripDashes(o[i]);
      else sanitizeDeep(o[i]);
    }
  } else if (o && typeof o === 'object') {
    for (const k of Object.keys(o)) {
      if (typeof o[k] === 'string') o[k] = stripDashes(o[k]);
      else sanitizeDeep(o[k]);
    }
  }
  return o;
}

if (!existsSync(src)) {
  console.warn(`[sync-data] real dataset not found at ${src} - keeping existing public/app_data.json`);
  process.exit(0);
}

const data = JSON.parse(readFileSync(src, 'utf-8'));

// Split out the heavy parts the app doesn't need at boot.
const activitiesFull = {};
for (const [id, d] of Object.entries(data.destinations || {})) {
  if (d?.activities?.items_full) {
    activitiesFull[id] = d.activities.items_full;
    delete d.activities.items_full;
  }
  if (d?.image?.hires) delete d.image.hires; // shipped-but-never-read
}

// Origin airport metadata for the "flying from" picker, from the harvested
// Ryanair airports cache. Only the origins actually priced (meta.all_origins,
// written by harvest_all_origins.py's patch step) are shipped, keyed by IATA.
if (data.meta?.all_origins && existsSync(airportsCache)) {
  const air = JSON.parse(readFileSync(airportsCache, 'utf-8'));
  const origins = {};
  for (const code of data.meta.all_origins) {
    const a = air[code];
    if (!a) continue;
    origins[code] = { name: a.name, city: a.city, country: a.country, lat: a.lat, lon: a.lon };
  }
  data.meta.origins = origins;
  console.log(`[sync-data] origin airports -> meta.origins (${Object.keys(origins).length} of ${data.meta.all_origins.length})`);
} else if (data.meta?.all_origins) {
  console.warn('[sync-data] meta.all_origins present but no airports cache - origin picker will show bare IATA codes');
}

// Scrub em/en dashes from every shipped string (see sanitizeDeep above).
sanitizeDeep(data);
sanitizeDeep(activitiesFull);

const core = JSON.stringify(data);
const acts = JSON.stringify(activitiesFull);
writeFileSync(resolve(publicDir, 'app_data.json'), core);
writeFileSync(resolve(publicDir, 'activities_full.json'), acts);

const n = Object.keys(data.destinations || {}).length;
console.log(`[sync-data] core dataset -> public/app_data.json (${n} destinations, is_mock=${data.meta?.is_mock}, ${kb(core)})`);
console.log(`[sync-data] full POI lists -> public/activities_full.json (${Object.keys(activitiesFull).length} destinations, ${kb(acts)})`);

if (existsSync(insightsSrc)) {
  const ins = JSON.parse(readFileSync(insightsSrc, 'utf-8'));
  sanitizeDeep(ins);
  writeFileSync(resolve(publicDir, 'country_insights.json'), JSON.stringify(ins));
  console.log(`[sync-data] country insights -> public/country_insights.json (${Object.keys(ins.countries || {}).length} countries)`);
} else {
  console.warn('[sync-data] no app_data/country_insights.json found - country intel will be unavailable');
}
