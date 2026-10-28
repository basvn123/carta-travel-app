/**
 * Ship the real pipeline dataset into the app's served location, split for the
 * wire so `vite dev` and `vite build` serve the full catalogue efficiently:
 *
 *   app_data/app_data.json  (master, untouched)
 *     ├─> public/app_data.json          core dataset, with the two heavy,
 *     │                                 rarely-needed-at-boot parts removed:
 *     │                                   - activities.items_full  (~40 POIs/dest)
 *     │                                   - image.hires            (never read)
 *     │                                 The app no longer fetches this file:
 *     │                                 it is the input of the contract
 *     │                                 check and the harnesses, and it is
 *     │                                 split into the two below (T054)
 *     ├─> public/boot.json              boot index: meta plus id, lat, lon,
 *     │                                 country, flags, rating band per
 *     │                                 destination (src/lib/bootIndex.js)
 *     ├─> public/dest/{cc}.json         the rest of each record, one file per
 *     │                                 country, served from the data host
 *     ├─> public/dest/_rank.json        the rank tier: the fields the default
 *     │                                 screens rank and price on, pooled
 *     │                                 (bootIndex.js RANK_FIELDS, T271)
 *     └─> public/poi/{destId}.json     one town's items_full - lazy-fetched
 *                                       by the Day planner and the destination
 *                                       page, one town at a time
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
import { shardName } from '../src/lib/poiShard.js';
import {
  splitCatalogue, mergeCatalogue, buildRankTier, decodeRankTier, RANK_PATH, RANK_FIELDS,
} from '../src/lib/bootIndex.js';
import { createHash } from 'node:crypto';

const scriptDir = dirname(fileURLToPath(import.meta.url));   // continent-app/scripts
const repoRoot = resolve(scriptDir, '..', '..');             // repo root
const publicDir = resolve(scriptDir, '..', 'public');
const src = resolve(repoRoot, 'app_data', 'app_data.json');
const insightsSrc = resolve(repoRoot, 'app_data', 'country_insights.json');
// Every European airport with a scheduled route (T512, from Eurostat).
const flightAirports = resolve(repoRoot, 'data', 'flights', '_airports.json');

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

if (process.argv.includes('--split-only')) {
  writeSplit(readFileSync(resolve(publicDir, 'app_data.json'), 'utf-8'));
  process.exit(0);
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

// Origin airports for the "flying from" picker (T512): every European airport
// with a scheduled route, from pipeline/flights/build_routes.py, so every
// airport is treated the same. The old carrier airport caches and the fare
// model's meta fields went with the old fare logic (T511).
if (existsSync(flightAirports)) {
  data.meta.origins = JSON.parse(readFileSync(flightAirports, 'utf-8'));
  // OurAirports names the town an airport stands in (Zaventem); where the
  // catalogue has the airport's own city (Brussels), the picker says that.
  const cityByIata = {};
  for (const d of Object.values(data.destinations || {})) {
    if (d?.iata && d.city && !d.city.includes("(") && !cityByIata[d.iata]) cityByIata[d.iata] = d.city;
  }
  for (const [code, o] of Object.entries(data.meta.origins)) {
    if (cityByIata[code]) o.city = cityByIata[code];
  }
  console.log(`[sync-data] origin airports -> meta.origins (${Object.keys(data.meta.origins).length})`);
} else {
  console.warn('[sync-data] data/flights/_airports.json missing - run pipeline/flights/build_routes.py; keeping the master meta.origins');
}
for (const k of ['all_origins', 'origin_coverage', 'fares_model', 'fares_model_wizz', 'fares_model_vueling',
  'fares_model_volotea', 'fares_model_tp', 'fares_model_est']) delete data.meta?.[k];

// No fares on the wire (T511): the old per-origin fare files
// (public/fares/{IATA}.json), their date-window sidecar and the per-origin
// coverage counts went with the rest of the old fare logic; the flight module (T517) ships its
// own data. A master that still carries the fares table has it dropped here,
// with each destination's baked `routes` (the app rebuilds routes per origin
// in lib/origins.js), and a leftover public/fares/ folder is cleared.
rmSync(resolve(publicDir, 'fares'), { recursive: true, force: true });
if (data.fares) delete data.fares;
for (const d of Object.values(data.destinations || {})) delete d.routes;

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
//   - the pricing intermediates in DEAD_WIRE_FIELDS: model inputs the app has
//     never read, only the priced outputs they feed.

// Per-destination fields with zero readers anywhere in src/ or scripts/.
// Verified by grep before removal; re-check before adding to this list, since
// a field that IS read will fail silently as a missing value, not an error.
const DEAD_WIRE_FIELDS = [
  ['accommodation', ['longtail_base', 'premium_base', 'pop_factor', 'settlement_tier',
    'calib_base', 'adr_calibration', 'tourist_premium']],
  // drivers / n_rcpt / city: the food model's provenance (T513), kept in the
  // master for audit; the page shows the estimate mark and nothing else.
  ['costs', ['premium_base', 'tourist_premium', 'drivers', 'n_rcpt', 'city']],
  ['rating', ['inputs_present']],
];
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
    // Pricing intermediates: inputs the pipeline's own accommodation and cost
    // models work in, kept in the master for calibration and provenance. The
    // app reads the OUTPUT (per_person_night_eur, the costs block) and has
    // never read any of these. ~320 KB shipped to every visitor for nothing.
    for (const [block, fields] of DEAD_WIRE_FIELDS) {
      const b = d[block];
      if (!b) continue;
      for (const f of fields) {
        if (b[f] === undefined) continue;
        before += JSON.stringify(b[f]).length;
        delete b[f];
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
        // T631: the parallel arrays apply_climate.py adds beside `months`,
        // kept under short names and only when they exist: rd rain days per
        // month, wind mean 10 m wind in m/s, elev the ground elevation (m)
        // the temperatures are lapse corrected to.
        ...(Array.isArray(d.climate.rain_days) ? { rd: d.climate.rain_days } : {}),
        ...(Array.isArray(d.climate.wind_ms) ? { wind: d.climate.wind_ms } : {}),
        ...(Number.isFinite(d.climate.elev_m) ? { elev: d.climate.elev_m } : {}),
        // T641: sun_h twelve monthly sunshine totals in hours (modelled from
        // NASA POWER radiation), water_c twelve monthly sea or lake surface
        // temperatures in C (NASA MUR SST) for a destination on the water.
        ...(Array.isArray(d.climate.sun_h) ? { sun_h: d.climate.sun_h } : {}),
        ...(Array.isArray(d.climate.water_c) ? { water_c: d.climate.water_c } : {}),
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
writeFileSync(resolve(publicDir, 'app_data.json'), core);

const n = Object.keys(data.destinations || {}).length;
console.log(`[sync-data] core dataset -> public/app_data.json (${n} destinations, is_mock=${data.meta?.is_mock}, ${kb(core)})`);

// Schema v19 (T762): the place reasons in the five other languages, one lazy
// file per language, so the main wire carries English only (rating.why). The
// hand reasons (curated_why_i18n.json) win over the rubric's
// (rubric_appeal.json), as they do for the English one. T762 measured inline
// against lazy; the numbers are in Execution/P7/T761-T762-rating-v5-profile.md.
{
  const WHY_LANGS = ['nl', 'de', 'fr', 'es', 'it'];
  const readIf = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {});
  const rubric = readIf(resolve(repoRoot, 'app_data', 'rubric_appeal.json'));
  const curated = readIf(resolve(repoRoot, 'app_data', 'curated_why_i18n.json'));
  const rated = new Set(Object.entries(data.destinations || {})
    .filter(([, d]) => d.rating).map(([id]) => id));
  const whyDir = resolve(publicDir, 'app_data', 'why_i18n');
  mkdirSync(whyDir, { recursive: true });
  for (const lang of WHY_LANGS) {
    const out = {};
    for (const [id, rec] of Object.entries(rubric)) {
      if (rated.has(id) && rec?.why?.[lang]) out[id] = stripDashes(rec.why[lang]);
    }
    for (const [id, rec] of Object.entries(curated)) {
      if (rated.has(id) && rec?.[lang]) out[id] = stripDashes(rec[lang]);
    }
    const body = JSON.stringify(out);
    writeFileSync(resolve(whyDir, `${lang}.json`), body);
    console.log(`[sync-data] reasons (${lang}) -> public/app_data/why_i18n/${lang}.json (${Object.keys(out).length} places, ${kb(body)})`);
  }
}

// The boot index and the per-country records (CARTA_CLOUD_ARCHITECTURE.md
// 5.2, Execution/P3/T054-wire-shards-to-r2.md). The core above grows by
// ~3.2 KB per destination, ~80 MB at the 25,000 the price map targets, and
// the app used to download all of it as one file before its first paint.
// The boot index keeps only what places a destination on the map; the rest
// goes to one file per country on the data host, so a weekly refresh that
// touches one country re-downloads one file, and no single file carries the
// whole catalogue. Each country file is named in the index with a content
// hash, which the app sends as ?v= so an edge or browser cache can never
// pair a new index with an old record.
//
// `node scripts/sync-data.mjs --split-only` runs this step alone, from the
// public/app_data.json already on disk, for a checkout without the master
// dataset (a worktree).
function writeSplit(core) {
  const n = Object.keys(JSON.parse(core).destinations || {}).length;
  const destDir = resolve(publicDir, 'dest');
  rmSync(destDir, { recursive: true, force: true });
  mkdirSync(destDir, { recursive: true });
  const { boot, chunks } = splitCatalogue(JSON.parse(core));
  let destBytes = 0;
  for (const cc of Object.keys(chunks).sort()) {
    const body = JSON.stringify(chunks[cc]);
    boot.chunks[cc] = createHash('sha256').update(body).digest('hex').slice(0, 12);
    writeFileSync(resolve(destDir, `${cc}.json`), body);
    destBytes += body.length;
  }
  // The rank tier (T271, RANK_FIELDS in bootIndex.js): the fields the
  // default screens rank, filter and price on, so they can paint before the
  // shards land. Its key is a hash of the boot rows it is aligned with.
  const rankKey = createHash('sha256').update(JSON.stringify(boot.d)).digest('hex').slice(0, 12);
  const rankBody = JSON.stringify(buildRankTier(boot, Object.assign({}, ...Object.values(chunks)), rankKey));
  writeFileSync(resolve(publicDir, RANK_PATH.slice(1)), rankBody);
  boot.rank = { key: rankKey, hash: createHash('sha256').update(rankBody).digest('hex').slice(0, 12) };
  const bootBody = JSON.stringify(boot);
  writeFileSync(resolve(publicDir, 'boot.json'), bootBody);

  // Prove the split is lossless before anything ships: merge it back the way
  // the browser will and compare with the core, record by record, including
  // destination order. A mismatch fails the build rather than the traveller.
  const { core: merged, missing } = mergeCatalogue(JSON.parse(bootBody), chunks);
  const want = JSON.parse(core);
  // Same key set, and every value equal in the master's own key order.
  const keySet = (o) => Object.keys(o).sort().join(',');
  const wantIds = Object.keys(want.destinations || {});
  const gotIds = Object.keys(merged.destinations);
  let bad = missing + (wantIds.join(',') === gotIds.join(',') ? 0 : 1);
  for (const id of wantIds) {
    const a = want.destinations[id];
    const b = merged.destinations[id];
    if (!b || keySet(a) !== keySet(b) || JSON.stringify(a) !== JSON.stringify({ ...a, ...b })) bad += 1;
  }
  if (JSON.stringify(want.meta) !== JSON.stringify(merged.meta)) bad += 1;
  if (bad) {
    console.error(`[sync-data] boot index round trip FAILED on ${bad} records; not shipping a lossy split`);
    process.exit(1);
  }

  // The same proof for the rank tier: decoded against this boot index, every
  // lite record carries exactly the RANK_FIELDS part of its full record.
  const lite = decodeRankTier(JSON.parse(bootBody), JSON.parse(rankBody));
  const { core: liteCore } = mergeCatalogue(JSON.parse(bootBody), {}, lite);
  let rankBad = lite ? 0 : 1;
  for (const id of wantIds) {
    const a = want.destinations[id];
    const b = liteCore.destinations[id];
    if (!b) { rankBad += 1; continue; }
    for (const [f, how] of Object.entries(RANK_FIELDS)) {
      if (!(f in a)) { if (f in b) rankBad += 1; continue; }
      const full = a[f];
      // T765: a field with a `map` (the compact taste) ships what map returns.
      const exp = how === true || full == null || typeof full !== 'object' || Array.isArray(full)
        ? full
        : how.map ? how.map(full) : Object.fromEntries(Object.entries(full).filter(([k]) => (!how.pick || how.pick.includes(k))
          && (!how.omit || !how.omit.includes(k))));
      if (JSON.stringify(exp) !== JSON.stringify(b[f])) rankBad += 1;
    }
  }
  if (rankBad) {
    console.error(`[sync-data] rank tier check FAILED on ${rankBad} fields; not shipping it`);
    process.exit(1);
  }
  console.log(`[sync-data] boot index -> public/boot.json (${n} destinations, ${kb(bootBody)}); `
    + `detail -> public/dest/ (${Object.keys(chunks).length} country files, ${Math.round(destBytes / 1024)} KB); `
    + `rank tier -> public${RANK_PATH} (${kb(rankBody)}); round trip exact`);
}
writeSplit(core);

// One file per destination, so a page that wants the POIs for ONE place does
// not download 33 MB to read 9 KB of it. There used to be a combined
// activities_full.json as well, which the day planner fetched whole on mount;
// both readers now take shards, so it is no longer written.
rmSync(resolve(publicDir, 'activities_full.json'), { force: true });
{
  const poiDir = resolve(publicDir, 'poi');
  rmSync(poiDir, { recursive: true, force: true });
  mkdirSync(poiDir, { recursive: true });
  let shards = 0;
  let skipped = 0;
  for (const [id, items] of Object.entries(activitiesFull)) {
    const name = shardName(id);
    if (!name) { skipped += 1; continue; }
    writeFileSync(resolve(poiDir, `${name}.json`), JSON.stringify(items ?? []));
    shards += 1;
  }
  console.log(`[sync-data] per-destination POI shards -> public/poi/ (${shards} files`
    + `${skipped ? `, ${skipped} ids not filename-safe` : ''})`);
}

if (existsSync(insightsSrc)) {
  const ins = JSON.parse(readFileSync(insightsSrc, 'utf-8'));
  sanitizeDeep(ins);
  writeFileSync(resolve(publicDir, 'country_insights.json'), JSON.stringify(ins));
  console.log(`[sync-data] country insights -> public/country_insights.json (${Object.keys(ins.countries || {}).length} countries)`);
} else {
  console.warn('[sync-data] no app_data/country_insights.json found - country intel will be unavailable');
}
