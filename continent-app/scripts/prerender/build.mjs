#!/usr/bin/env node
/**
 * build.mjs, the static prerender (T221).
 *
 * Reads the wire (the same files the app reads) and writes one HTML page per
 * indexable content path, keyed as the Pages Function will look it up
 * (src/lib/prerenderShell.js prerenderKey). The output goes to R2, never into
 * dist/: the Pages deploy stays a few dozen files under its 20,000 ceiling.
 *
 *   node scripts/prerender/build.mjs --data <wire dir> [--out dist-prerender]
 *        [--country AT,CH] [--only trail,beach] [--sample 20] [--cards]
 *
 *   --data     the wire: continent-app/public after sync-data, or the R2
 *              staging copy (dist-data/data). Default: public/.
 *   --out      where pages land. Default: dist-prerender/ (delete it after the
 *              upload; it is about 32,000 files).
 *   --country  only these countries (a quick run); trips and journeys follow.
 *   --only     only these page kinds (country, section, dest, cost, days,
 *              trail, cycle, tour, beach, lake, mountain, region, trip, journey).
 *   --sample   at most N pages of each kind, for a check run.
 *   --cards    also render each page's share card (scripts/og) to og/<key>.png
 *              and point og:image at it; slow, about 0.7 s a card.
 *
 * Two passes. The first reads every layer file once and keeps the light rows
 * (no geometry), so any page can link any other page and only ever links a
 * page that exists. The second writes the pages. _manifest.json beside them
 * lists every page with its canonical, lastmod and page-floor result, and the
 * last step turns it into sitemaps/ and _sitemap.json (sitemap.mjs, T222).
 *
 * What is prerendered is the rated tier: every row the app rates (t 'r'), the
 * 43 countries, their section lists, the NUTS2 regions, the composed trips
 * and the curated journeys. T224 adds a cost page per priced destination
 * (/spain/malaga/cost) and the country and trip-length pages (/spain/4-days,
 * /spain/4-days/under-60) that floor.mjs daysPlan() lets through. Listed rows, coast and range regions have no page:
 * the page floor (floor.mjs, T205-d) counts them but does not build them, and
 * they are served the app shell with a 404. A rated page that fails the floor
 * is still written, with noindex, and stays out of the sitemap.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COUNTRY_SLUGS, paths, parsePath } from '../../src/lib/urlScheme.js';
import { prerenderKey } from '../../src/lib/prerenderShell.js';
import { computeCosts } from '../../src/lib/costIndex.js';
import * as C from '../../src/lib/cycleStory.js';
import { renderPage, clean, ORIGIN } from './html.mjs';
import * as P from './pages.mjs';
import { pageFloor, listedFloor, newTally, addToTally, daysPlan } from './floor.mjs';
import { haversineKm } from '../../src/lib/runtime_pricing.js';
import { writeSitemaps } from './sitemap.mjs';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const has = (k) => argv.includes(k);

const DATA = path.resolve(APP, arg('--data', 'public'));
const OUT = path.resolve(APP, arg('--out', 'dist-prerender'));
const ONLY = arg('--only', '') ? new Set(arg('--only').split(',')) : null;
const SAMPLE = Number(arg('--sample', 0)) || 0;
const CARDS = has('--cards');
const COUNTRIES = (arg('--country', '') ? arg('--country').toUpperCase().split(',') : Object.keys(COUNTRY_SLUGS))
  .filter((cc) => COUNTRY_SLUGS[cc]);

const readJson = (rel) => {
  const f = path.join(DATA, rel);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
};
const list = (rel) => (fs.existsSync(path.join(DATA, rel)) ? fs.readdirSync(path.join(DATA, rel)) : []);
const byScore = (k) => (a, b) => (b[k] ?? -1) - (a[k] ?? -1);

if (!fs.existsSync(path.join(DATA, 'dossier'))) {
  console.error(`[prerender] no wire at ${DATA} (dossier/ missing). Pass --data <continent-app/public after sync-data>.`);
  process.exit(1);
}

const t0 = Date.now();
// ------------------------------------------------------------ pass one
const W = { trails: {}, cycling: {}, beaches: {}, lakes: {}, mountains: {}, trips: {} };
const strip = ({ geometry, ...rest }) => rest; // eslint-disable-line no-unused-vars
// The page floor counted over the rows that have no page (t 'l'), by kind, from the wire.
const LISTED = { trail: newTally(), cycle: newTally(), beach: newTally(), lake: newTally(), mountain: newTally() };
const tally = (kind, rows) => { for (const r of rows || []) if (r.t !== 'r') addToTally(LISTED[kind], listedFloor(kind, r)); };
for (const cc of COUNTRIES) {
  const tr = readJson(`trails/${cc}.json`);
  tally('trail', tr?.listed);
  if (tr) W.trails[cc] = { gen: tr.generated_at, rated: (tr.trips || []).filter((r) => r.t === 'r').map(strip), listed: tr.n_listed ?? (tr.listed || []).length };
  const cy = readJson(`cycling/${cc}.json`);
  tally('cycle', cy?.listed);
  if (cy) W.cycling[cc] = { gen: cy.generated_at, rated: (cy.routes || []).filter((r) => r.t === 'r').map(strip), listed: (cy.listed || []).length, tours: (cy.tours || []).map(strip) };
  for (const layer of ['beaches', 'lakes', 'mountains']) {
    const f = readJson(`${layer}/${cc}.json`);
    tally({ beaches: 'beach', lakes: 'lake', mountains: 'mountain' }[layer], f?.listed);
    if (f) W[layer][cc] = { gen: f.generated_at, rated: (f[layer] || []).filter((r) => r.t !== 'l'), listed: (f.listed || []).length };
  }
  const tp = readJson(`trips/${cc}.json`);
  if (tp) W.trips[cc] = { gen: tp.generated_at, rated: tp.trips || [], listed: 0 };
}

// Indexes the pages link through.
const trailIdx = new Map(); // `${cc}/${id}` -> row
const trailByName = new Map(); // `${cc}|${lower name}` -> row
const families = new Map(); // `${cc}|${fam.k}` -> rows
for (const [cc, w] of Object.entries(W.trails)) {
  for (const r of w.rated) {
    trailIdx.set(`${cc}/${r.id}`, r);
    trailByName.set(`${cc}|${clean(r.name).toLowerCase()}`, r);
    if (r.fam?.k && r.fam.size > 1) {
      const k = `${cc}|${r.fam.k}`;
      if (!families.has(k)) families.set(k, []);
      families.get(k).push(r);
    }
  }
}
const cycleIdx = new Map();
for (const [cc, w] of Object.entries(W.cycling)) for (const r of w.rated) cycleIdx.set(`${cc}/${r.id}`, r);
const layerIdx = { beach: new Set(), lake: new Set(), mountain: new Set() };
for (const [kind, layer] of [['beach', 'beaches'], ['lake', 'lakes'], ['mountain', 'mountains']]) {
  for (const w of Object.values(W[layer])) for (const r of w.rated) layerIdx[kind].add(r.id);
}

// Regions: NUTS2 files only (coast and range regions wait for the floor).
const regions = new Map(); // id -> file
// Coast (COAST_*) and range (GMBA_*) regions have no page builder; counted for the floor line.
const floorRegions = { total: list('region').filter((f) => /^(COAST|GMBA)_.*\.json$/.test(f)).length };
for (const f of list('region')) {
  if (!/^[A-Z]{2}[0-9A-Z]{1,3}\.json$/.test(f)) continue;
  const r = readJson(`region/${f}`);
  if (r?.region?.kind === 'nuts2' && COUNTRY_SLUGS[r.region.country] && COUNTRIES.includes(r.region.country)) regions.set(r.region.id, r);
}

// Destinations: costs over the whole catalogue (the national medians need every row).
const destRows = {};
for (const f of list('dest')) if (f.endsWith('.json')) Object.assign(destRows, readJson(`dest/${f}`));
const costs = computeCosts(destRows, {});
const dossierFiles = list('dossier').filter((f) => f.endsWith('.json'));
const dests = new Map(); // id -> { id, slug, name, cc, score, dayEur, measured, lat, lon, built, week, perDay }
const destByCity = new Map();
for (const f of dossierFiles) {
  const d = readJson(`dossier/${f}`);
  if (!d?.slug || !d.place?.iso2 || !COUNTRY_SLUGS[d.place.iso2]) continue;
  const cost = costs.get(d.id);
  // The week receipt (T224) is the figure the cost and trip-length pages use,
  // so a town's week and its four days come from the same printed lines.
  const week = P.weekReceipt(cost, destRows[d.id]);
  const row = {
    id: d.id, slug: d.slug, name: clean(d.place.name), cc: d.place.iso2, score: d.verdict?.score ?? null,
    dayEur: cost?.dayEur ?? null, measured: cost?.stayLevel === 'city', file: f,
    lat: d.place.lat, lon: d.place.lon, built: d.built_at || null,
    week: week ? week.total : null, perDay: week ? week.perDay : null, hasCost: Boolean(week && paths.cost(d.slug)),
  };
  dests.set(d.id, row);
  destByCity.set(`${row.cc}|${row.name.toLowerCase()}`, row);
  const city = destRows[d.id]?.city;
  if (city) destByCity.set(`${row.cc}|${clean(city).toLowerCase()}`, row);
}

// Priced places per country, cheapest day first, and the trip-length pages
// each country gets (T224).
const pricedBy = new Map();
const NEAR_KM = 150;
for (const d of dests.values()) {
  if (!d.hasCost) continue;
  if (!pricedBy.has(d.cc)) pricedBy.set(d.cc, []);
  pricedBy.get(d.cc).push(d);
}
for (const rows of pricedBy.values()) rows.sort((a, b) => a.perDay - b.perDay || a.name.localeCompare(b.name));
const daysBy = new Map();
for (const [cc, rows] of pricedBy) {
  daysBy.set(cc, daysPlan(rows.map((d) => d.perDay), P.DAY_LENGTHS, P.DAY_BANDS)
    .map((e) => ({ ...e, path: paths.days(cc, e.days, e.band) })));
}

const journeys = list('journeys/journey').filter((f) => f.endsWith('.json')).map((f) => readJson(`journeys/journey/${f}`)).filter(Boolean);

const SECTION_SRC = { trails: 'trails', beaches: 'beaches', lakes: 'lakes', mountains: 'mountains', cycling: 'cycling', trips: 'trips' };
const ONE = { trails: 'walk', beaches: 'beach', lakes: 'lake', mountains: 'mountain', cycling: 'cycling route' };
const ctx = {
  regionName: (n2) => (n2 && regions.get(n2) ? clean(regions.get(n2).region.name) : null),
  trailByName: (cc, name) => trailByName.get(`${cc}|${clean(name).toLowerCase()}`) || null,
  familyOf: (cc, k) => (k ? families.get(`${cc}|${k}`) || [] : []),
  topTrails: (cc, n2, not, n) => (W.trails[cc]?.rated || []).filter((r) => r.id !== not && (!n2 || r.rg?.n2 === n2)).sort(byScore('rating')).slice(0, n),
  trailById: (cc, id) => trailIdx.get(`${cc}/${id}`) || null,
  isTrail: (cc, id) => trailIdx.has(`${cc}/${id}`),
  topCycles: (cc, not, n) => (W.cycling[cc]?.rated || []).filter((r) => r.id !== not).sort(byScore('score')).slice(0, n),
  cycleById: (cc, id) => cycleIdx.get(`${cc}/${id}`) || null,
  isCycle: (cc, id) => cycleIdx.has(`${cc}/${id}`),
  destById: (id) => dests.get(id) || null,
  destByCity: (cc, city) => destByCity.get(`${cc}|${clean(city).toLowerCase()}`) || null,
  costOf: (id) => costs.get(id) || null,
  destRow: (id) => destRows[id] || null,
  pricedOf: (cc) => pricedBy.get(cc) || [],
  daysOf: (cc) => daysBy.get(cc) || [],
  // Up to n places in the country, within NEAR_KM, whose week is cheaper than perDay, nearest first.
  cheaperNear: (id, cc, lat, lon, perDay, n) => (pricedBy.get(cc) || [])
    .filter((d) => d.id !== id && d.perDay < perDay && Number.isFinite(d.lat) && Number.isFinite(lat))
    .map((d) => ({ d, km: haversineKm(lat, lon, d.lat, d.lon) }))
    .filter((x) => x.km <= NEAR_KM)
    .sort((a, b) => a.km - b.km).slice(0, n)
    .map(({ d, km }) => ({ name: `${d.name}, ${Math.round(km)} km away`, path: paths.cost(d.slug), meta: `${d.measured ? '' : '~'}€${Math.round(d.week).toLocaleString('en-GB')}`, metaNum: true })),
  // Composed trips of exactly n days, best first, one per set of stops (the
  // catalogue holds several paces of the same Barcelona week).
  tripsOfLength: (cc, n, k) => {
    const seenStops = new Set();
    return (W.trips[cc]?.rated || []).filter((x) => x.days === n).sort(byScore('score')).filter((x) => {
      const stops = (x.cities || []).map((c) => c.city).join('|');
      if (seenStops.has(stops)) return false;
      seenStops.add(stops);
      return true;
    }).slice(0, k);
  },
  destsOf: (cc) => [...dests.values()].filter((d) => d.cc === cc),
  isLayer: (kind, id) => Boolean(layerIdx[kind]?.has(id)),
  topLayer: (kind, cc, n2, not, n) => (W[{ beach: 'beaches', lake: 'lakes', mountain: 'mountains' }[kind]][cc]?.rated || [])
    .filter((r) => r.id !== not && (!n2 || r.rg?.n2 === n2)).sort(byScore('score')).slice(0, n),
  layerPath: (x) => {
    const cc = x.cc || x.country;
    if (x.layer === 'trail') return trailIdx.has(`${cc}/${x.id}`) ? paths.trail(cc, x.id, x.name) : null;
    if (x.layer === 'cycling') return cycleIdx.has(`${cc}/${x.id}`) ? paths.cycle(cc, x.id, C.routeTitle(x, P.t) || x.name || x.ref) : null;
    return layerIdx[x.layer]?.has(x.id) ? paths[x.layer](cc, x.id) : null;
  },
  coverage: (section, cc) => {
    const w = W[SECTION_SRC[section]]?.[cc];
    if (!w || !ONE[section]) return null;
    const many = { walk: 'walks', beach: 'beaches', lake: 'lakes', mountain: 'mountains', 'cycling route': 'cycling routes' }[ONE[section]];
    const where = P.countryName(cc);
    const r = w.rated.length;
    if (!r && !w.listed) return `Carta has no ${many} in ${where} in its catalogue yet.`;
    const head = `Carta publishes ${r.toLocaleString('en-GB')} rated ${r === 1 ? ONE[section] : many} in ${where}`;
    return w.listed ? `${head} and lists ${w.listed.toLocaleString('en-GB')} more that do not have enough measured facts to be rated yet.` : `${head}.`;
  },
  generatedAt: (section, cc) => W[SECTION_SRC[section]]?.[cc]?.gen || null,
  topTrips: (cc, not, n) => (W.trips[cc]?.rated || []).filter((x) => x.id !== not).sort(byScore('score')).slice(0, n),
  journeysOfType: (slug, not, n) => journeys.filter((j) => j.tripTypeSlug === slug && j.id !== not).slice(0, n),
  journeysOf: (cc) => journeys.filter((j) => j.countryCode === cc),
  hasSection: (cc, s) => ctx.sectionsOf(cc).some((x) => x.section === s),
  sectionsOf: (cc) => sectionRows(cc).map(({ section, rows }) => ({ section, n: rows.length })),
  regionsOf: (cc) => [...regions.values()].filter((r) => r.region.country === cc)
    .map((r) => ({ id: r.region.id, name: clean(r.region.name) })).sort((a, b) => a.name.localeCompare(b.name)),
  isRegion: (id) => regions.has(id),
  regionCountry: (id) => regions.get(id)?.region.country,
};

const sectionCache = new Map();
function sectionRows(cc) {
  if (sectionCache.has(cc)) return sectionCache.get(cc);
  const km = (m) => `${(m / 1000).toFixed(1)} km`;
  const sc = (v) => (typeof v === 'number' ? v.toFixed(1) : '');
  const out = [
    ['trails', [...(W.trails[cc]?.rated || [])].sort(byScore('rating')).map((r) => ({ name: clean(r.name), path: paths.trail(cc, r.id, r.name), meta: km(r.distance_m), metaNum: true }))],
    ['beaches', [...(W.beaches[cc]?.rated || [])].sort(byScore('score')).map((r) => ({ name: clean(r.name), path: paths.beach(cc, r.id), meta: sc(r.score), metaNum: true }))],
    ['lakes', [...(W.lakes[cc]?.rated || [])].sort(byScore('score')).map((r) => ({ name: clean(r.name), path: paths.lake(cc, r.id), meta: sc(r.score), metaNum: true }))],
    ['mountains', [...(W.mountains[cc]?.rated || [])].sort(byScore('score')).map((r) => ({ name: clean(r.name), path: paths.mountain(cc, r.id), meta: typeof r.ele === 'number' ? `${r.ele.toLocaleString('en-GB')} m` : '', metaNum: true }))],
    ['cycling', [
      ...(W.cycling[cc]?.tours || []).map((x) => ({ name: clean(x.title), path: paths.tour(cc, x.slug), meta: `${x.days} days`, metaNum: true })),
      ...[...(W.cycling[cc]?.rated || [])].sort(byScore('score')).map((r) => ({ name: clean(C.routeTitle(r, P.t) || r.name || r.ref), path: paths.cycle(cc, r.id, C.routeTitle(r, P.t) || r.name || r.ref), meta: `${r.km.toFixed(1)} km`, metaNum: true })),
    ]],
    ['regions', ctx.regionsOf(cc).map((r) => ({ name: r.name, path: paths.region(cc, r.id, r.name) }))],
    ['trips', [...(W.trips[cc]?.rated || [])].sort(byScore('score')).map((x) => ({ name: clean((x.cities || []).map((c) => c.city).join(', ')), path: paths.trip(x.id), meta: `${x.days} days`, metaNum: true }))],
  ].filter(([, rows]) => rows.length).map(([section, rows]) => ({ section, rows }));
  sectionCache.set(cc, out);
  return out;
}

console.log(`[prerender] pass one ${((Date.now() - t0) / 1000).toFixed(1)} s: ${trailIdx.size} trails, ${cycleIdx.size} cycling, `
  + `${layerIdx.beach.size} beaches, ${layerIdx.lake.size} lakes, ${layerIdx.mountain.size} mountains, ${dests.size} destinations, `
  + `${regions.size} regions, ${journeys.length} journeys`);

// ------------------------------------------------------------ pass two
fs.mkdirSync(OUT, { recursive: true });
const manifest = [];
const counts = {};
const seen = new Map();
const problems = [];
const unreadable = [];
let cardJobs = [];

function emit(page, card) {
  if (!page || !page.path) return;
  if (ONLY && !ONLY.has(page.kind)) return;
  counts[page.kind] = (counts[page.kind] || 0) + 1;
  if (SAMPLE && counts[page.kind] > SAMPLE) { counts[page.kind] -= 1; return; }
  const key = prerenderKey(page.path);
  if (!key) { problems.push(`no key for ${page.path}`); return; }
  // A cross-border trip is filed under each of its countries: one page.
  if (seen.get(key) === page.path) { counts[page.kind] -= 1; return; }
  if (seen.has(key)) { problems.push(`duplicate key ${key}: ${seen.get(key)} and ${page.path}`); return; }
  // The path must read back as what it is. A trail whose title folds to an
  // empty slug and whose id has four digits or fewer reads as a list page
  // (/greece/trails/1234); it is held back and counted, not served wrong.
  const back = parsePath(page.path);
  if (!back || back.kind !== page.kind) { counts[page.kind] -= 1; unreadable.push(page.path); return; }
  seen.set(key, page.path);
  if (CARDS && card) {
    const png = `og/${key.replace(/\.html$/, '.png')}`;
    page.card = { src: `${ORIGIN}/og/p/${key.replace(/\.html$/, '.png')}`, w: 1200, h: 630, alt: null, file: png };
    cardJobs.push({ page, card, file: png });
    return; // written after its card exists, so og:image never names a missing file
  }
  write(page, key);
}

const wireRow = (page) => {
  const p = parsePath(page.path);
  if (page.kind === 'trail') return trailIdx.get(`${p.cc}/${p.id}`);
  if (page.kind === 'cycle') return cycleIdx.get(`${p.cc}/${p.id}`);
  return null;
};

function write(page, key) {
  // The page floor (T205-d): a catalogue page that cannot carry a title,
  // coordinates, a licensed image and three facts is written with noindex and
  // stays out of the sitemap.
  const floor = pageFloor(page, wireRow(page));
  if (floor && !floor.ok) page.noindex = true;
  const file = path.join(OUT, key);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, renderPage(page));
  manifest.push({
    path: page.path, canonical: page.canonical || page.path, key, kind: page.kind,
    lastmod: page.lastmod || null, indexable: !page.noindex,
    ...(floor ? { floor } : {}),
  });
}

for (const cc of COUNTRIES) {
  emit(P.countryPage(cc, ctx));
  for (const e of ctx.daysOf(cc)) emit(P.daysPage(cc, e.days, e.band, ctx));
  for (const { section, rows } of sectionRows(cc)) {
    const pages = Math.ceil(rows.length / P.PAGE_SIZE);
    for (let p = 1; p <= pages; p += 1) emit(P.sectionPage(cc, section, rows, p, ctx));
  }
  for (const r of W.trails[cc]?.rated || []) emit(P.trailPage(r, ctx), { type: 'trail', row: r });
  for (const r of W.cycling[cc]?.rated || []) emit(P.cyclePage(r, ctx));
  for (const x of W.cycling[cc]?.tours || []) emit(P.tourPage(x, ctx));
  for (const [kind, layer] of [['beach', 'beaches'], ['lake', 'lakes'], ['mountain', 'mountains']]) {
    for (const r of W[layer][cc]?.rated || []) emit(P.layerPage(kind, r, ctx), { type: kind, row: r });
  }
  for (const x of W.trips[cc]?.rated || []) emit(P.tripPage(x, ctx));
}
for (const r of regions.values()) emit(P.regionPage(r, ctx));
for (const d of dests.values()) {
  if (!COUNTRIES.includes(d.cc)) continue;
  if (ONLY && !ONLY.has('dest') && !ONLY.has('cost')) break;
  if (SAMPLE && (counts.dest || 0) >= SAMPLE && (counts.cost || 0) >= SAMPLE) break;
  const dos = readJson(`dossier/${d.file}`);
  emit(P.destPage(dos, ctx), { type: 'destination', key: d.id });
  emit(P.costPage(dos, ctx));
}
for (const j of journeys) if (!arg('--country', '') || COUNTRIES.includes(j.countryCode)) emit(P.journeyPage(j, ctx));

if (cardJobs.length) {
  const { renderCards } = await import('./cards.mjs');
  const done = await renderCards(cardJobs, { out: OUT, data: DATA, destRows, onFallback: (job) => { job.page.card = null; } });
  for (const job of done) write(job.page, prerenderKey(job.page.path));
  cardJobs = [];
}

manifest.sort((a, b) => a.key.localeCompare(b.key));
const coverageDate = readJson('coverage.json')?.generated_at || null;
const manifestDoc = {
  generated_at: new Date().toISOString(), data: DATA, coverage_date: coverageDate, counts, unreadable,
  floor_listed: { rows: LISTED, regions: floorRegions }, pages: manifest,
};
fs.writeFileSync(path.join(OUT, '_manifest.json'), JSON.stringify(manifestDoc, null, 0));
const smap = writeSitemaps(manifestDoc, OUT, { coverageDate });
console.log(`[sitemap] ${smap.files.length} files, ${smap.urls} URLs: ${smap.files.map((f) => `${f.name} ${f.urls}`).join(', ')}`);
console.log(`[sitemap] ${smap.floor_line}`);
const total = manifest.length;
console.log(`[prerender] ${total} pages in ${((Date.now() - t0) / 1000).toFixed(1)} s to ${OUT}`);
if (unreadable.length) console.log(`[prerender] ${unreadable.length} paths held back because they do not read back as their kind, first: ${unreadable.slice(0, 5).join(' ')}`);
console.log(`[prerender] by kind: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
if (problems.length) {
  console.error(`[prerender] ${problems.length} problems, first ten:\n  ${problems.slice(0, 10).join('\n  ')}`);
  process.exit(1);
}
