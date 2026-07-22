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
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { stripDashes } from '../src/lib/format.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));   // continent-app/scripts
const repoRoot = resolve(scriptDir, '..', '..');             // repo root
const publicDir = resolve(scriptDir, '..', 'public');
const src = resolve(repoRoot, 'app_data', 'app_data.json');
const insightsSrc = resolve(repoRoot, 'app_data', 'country_insights.json');
const airportsCache = resolve(repoRoot, 'cache', 'ryanair_airports.json');
const wizzAirportsCache = resolve(repoRoot, 'cache', 'wizzair_airports.json');
const vuelingAirportsCache = resolve(repoRoot, 'cache', 'vueling_airports.json');

const kb = (s) => `${Math.round(s.length / 1024)} KB`;

// A short, display-ready lead for the Wikivoyage guide: the first sentence or
// two, capped, so the boot payload carries a blurb (shown in the detail panel)
// rather than a whole article. Sentence-boundary trim, so no ellipsis needed.
function guideBlurb(text) {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  let out = '';
  for (const s of clean.split(/(?<=[.!?])\s+/)) {
    if (out && out.length + s.length > 320) break;
    out += (out ? ' ' : '') + s;
    if (out.length >= 220) break;
  }
  return out;
}

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
// airports caches. Only the origins actually priced (meta.all_origins, written
// by the fare patch steps) are shipped, keyed by IATA. Ryanair's cache wins on
// overlap; the Wizz Air and Vueling caches fill in origins Ryanair never flies
// (so those don't show as bare IATA codes).
const anyAirportsCache = existsSync(airportsCache) || existsSync(wizzAirportsCache) || existsSync(vuelingAirportsCache);
if (data.meta?.all_origins && anyAirportsCache) {
  const air = existsSync(airportsCache) ? JSON.parse(readFileSync(airportsCache, 'utf-8')) : {};
  const wizz = existsSync(wizzAirportsCache) ? JSON.parse(readFileSync(wizzAirportsCache, 'utf-8')) : {};
  const vueling = existsSync(vuelingAirportsCache) ? JSON.parse(readFileSync(vuelingAirportsCache, 'utf-8')) : {};
  const origins = {};
  for (const code of data.meta.all_origins) {
    const a = air[code] || wizz[code] || vueling[code];
    if (!a) continue;
    origins[code] = { name: a.name, city: a.city, country: a.country, lat: a.lat, lon: a.lon };
  }
  data.meta.origins = origins;
  console.log(`[sync-data] origin airports -> meta.origins (${Object.keys(origins).length} of ${data.meta.all_origins.length})`);
} else if (data.meta?.all_origins) {
  console.warn('[sync-data] meta.all_origins present but no airports cache - origin picker will show bare IATA codes');
}

// The fares table is ~70% of the core payload, and a session only ever reads
// ONE origin's column of it (lib/origins.js hydrateForOrigin). Invert it into
// per-origin slices - public/fares/CRL.json = { anchor: {out, ret, ...} } -
// fetched lazily when the origin is chosen/changed, and drop the table (plus
// each destination's baked `routes`, which hydration always rebuilds anyway)
// from the boot payload. meta.origin_coverage keeps defaultOrigin() working
// without the table. Older datasets without `fares` ship unchanged.
if (data.fares && Object.keys(data.fares).length) {
  const faresDir = resolve(publicDir, 'fares');
  rmSync(faresDir, { recursive: true, force: true });
  mkdirSync(faresDir, { recursive: true });

  const byOrigin = {}; // origin -> { anchor: rec }
  for (const [anchor, origins] of Object.entries(data.fares)) {
    for (const [origin, rec] of Object.entries(origins || {})) {
      if (!rec) continue;
      (byOrigin[origin] ||= {})[anchor] = rec;
    }
  }
  const coverage = {};
  let faresBytes = 0;
  for (const [origin, slice] of Object.entries(byOrigin)) {
    // Same coverage rule as the old originCoverage(): anchors with real
    // outbound fares stored.
    coverage[origin] = Object.values(slice)
      .filter((rec) => rec?.out && Object.keys(rec.out).length > 0).length;
    // Origin codes are harvested IATA (A-Z only), but never trust that for a
    // file path.
    if (!/^[A-Z0-9]{3,4}$/.test(origin)) continue;
    const out = JSON.stringify(sanitizeDeep(slice));
    faresBytes += out.length;
    writeFileSync(resolve(faresDir, `${origin}.json`), out);
  }
  data.meta.origin_coverage = coverage;
  delete data.fares;
  for (const d of Object.values(data.destinations || {})) delete d.routes;
  console.log(`[sync-data] fares table -> public/fares/ (${Object.keys(byOrigin).length} origins, ${Math.round(faresBytes / 1024)} KB total; core slimmed)`);
}

// Wire diet: the app reads only a fraction of some per-destination blocks, and
// at full-catalogue scale every byte here is multiplied ~25,000x (parse time
// was the dominant load cost in the perf pass, see scripts/perf/). The master
// keeps everything; only the shipped core slims down.
//   - guide / nature / geonames: the app now shows a compact slice of each
//     (a guide blurb + link, the single nearest protected area, and
//     population/settlement) in the detail panel and planner facts. Ship only
//     that slice; the verbose remainder (full Wikivoyage article, every
//     protected-area kind/id, GeoNames ids/timezone/elevation) is dropped.
//   - climate: was 12 months x 5 verbose keys + a source string PER
//     DESTINATION (~1 KB each). The app reads t_high/t_low/precip_mm/comfort
//     and the best-months list, so ship tuples: { m: [[hi,lo,mm,cf] x12],
//     best: [...] }, with the period hoisted to meta once. t_mean and the
//     source string were never read (the credit line is i18n copy).
{
  let before = 0;
  let after = 0;
  let climatePeriod = null;
  for (const d of Object.values(data.destinations || {})) {
    // Wikivoyage guide -> { text: blurb, url }
    if (d.guide !== undefined) {
      before += JSON.stringify(d.guide).length;
      const blurb = guideBlurb(d.guide?.text);
      if (blurb) {
        d.guide = d.guide?.url ? { text: blurb, url: d.guide.url } : { text: blurb };
        after += JSON.stringify(d.guide).length;
      } else {
        delete d.guide;
      }
    }
    // Protected areas -> just the single nearest + a national-park flag (the
    // long OSM/Wikidata URLs and per-kind list are not shown).
    if (d.nature !== undefined) {
      before += JSON.stringify(d.nature).length;
      const nn = d.nature?.nearest;
      if (nn?.name) {
        d.nature = {
          nearest: { name: nn.name, kind: nn.kind, dist_km: nn.dist_km },
          park: !!d.nature.has_national_park,
        };
        after += JSON.stringify(d.nature).length;
      } else {
        delete d.nature;
      }
    }
    // GeoNames -> population + settlement type only.
    if (d.geonames !== undefined) {
      before += JSON.stringify(d.geonames).length;
      const g = d.geonames || {};
      if (g.population != null || g.settlement) {
        d.geonames = { population: g.population ?? null, settlement: g.settlement ?? null };
        after += JSON.stringify(d.geonames).length;
      } else {
        delete d.geonames;
      }
    }
    if (d.climate?.months) {
      before += JSON.stringify(d.climate).length;
      climatePeriod ||= d.climate.period || null;
      d.climate = {
        m: d.climate.months.map((m) => [
          m.t_high ?? null, m.t_low ?? null, m.precip_mm ?? null, m.comfort ?? null,
        ]),
        best: d.climate.summary?.best_months || [],
      };
      after += JSON.stringify(d.climate).length;
    }
  }
  if (climatePeriod) data.meta.climate_period = climatePeriod;
  console.log(`[sync-data] wire diet: ${Math.round(before / 1024)} KB of unread/verbose blocks -> ${Math.round(after / 1024)} KB (compact climate kept)`);
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
