// Network-trace proof that no fare is read from a travel API while a user is
// in the app (T056).
//
// WHY THIS EXISTS. Carta's prices are precomputed: the weekly pipeline
// harvests the carriers and the Travelpayouts cache, and the app reads the
// result as static JSON, one slice per departure airport (/fares/{IATA}.json,
// on the data host once VITE_DATA_BASE is set). The only live travel-network
// traffic allowed is the click-out to book, which is a navigation the
// traveller asks for, never a fetch. A single live price call added to a
// planner step would turn the itinerary into a spinner and burn a rate limit
// per user, and nothing else in the harness set would notice. This one does.
//
// Two passes, both must pass:
//
//   1. Static. Every network call site in src/ (fetch, XMLHttpRequest,
//      WebSocket, EventSource, sendBeacon) and in supabase/functions/ is
//      listed and must belong to a module in CALL_SITES, which names what the
//      module talks to. A new call site fails the run until someone adds it
//      here with a reason, so a live fare read cannot arrive unreviewed.
//   2. Trace. dist/ is served on a loopback port and every request the
//      browser makes (page and service worker) is recorded across the
//      user-facing paths in PATHS: Explore on two origins, Destinations, a
//      destination page, the trip planner seeded on a country and walked
//      forward, and the day planner seeded on a city. Every request is
//      classified by host. The run fails on any request to a fare or travel
//      API host, on any request to an unclassified third party, and if no
//      fare slice was read at all (a trace that never loaded a price proves
//      nothing, see the vacuous-gate note in verify_csp.mjs).
//
// Run from continent-app/ after `npm run build`:
//   node scripts/verify_no_runtime_fares.mjs [--port 4392] [--json reports/fare_trace_T056.json]

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dir, '..');
const repoRoot = path.resolve(appRoot, '..');
const DIST = path.join(appRoot, 'dist');

const args = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const PORT = Number(argVal('--port', 4392));
const JSON_OUT = argVal('--json', null);
const ORIGIN = `http://127.0.0.1:${PORT}`;

/* ------------------------------------------------------------ static pass */

// Every module allowed to open a network connection, and what it talks to.
// None of them may reach a fare or travel API; the trace pass checks the
// hosts they actually hit.
const CALL_SITES = {
  'src/lib/appData.js': 'own data files: boot index, country shards, fare slices, POI shards',
  'src/lib/destInfo.js': 'own data files: destinfo',
  'src/lib/dossier.js': 'own data files: dossiers',
  'src/lib/imageCredit.js': 'own data files: poi_credits.json',
  'src/lib/journeys.js': 'own data files: journeys',
  'src/lib/publishedJson.js': 'own data files: layer pages',
  'src/lib/reach.js': 'own data files: reach tables',
  'src/lib/searchIndex.js': 'own data files: search index',
  'src/admin/ContentSection.jsx': 'own data files, admin only',
  'src/lib/destinationPdf.js': 'own fonts for the PDF',
  'src/map/CountryPickerMap.jsx': 'own country_shapes.json',
  'src/map/TripMap.jsx': 'own country_shapes.json',
  'src/lib/geocode.js': 'Nominatim, typed address search on explicit action',
  'src/lib/cityResearch.js': 'Nominatim, Wikipedia, Overpass for an uncatalogued town; prices are never researched',
  'src/lib/routing.js': 'FOSSGIS OSRM walking and driving geometry',
  'src/lib/weather.js': 'Open-Meteo forecast',
  'supabase/functions/plan-day/index.ts': 'Gemini only',
  'supabase/functions/suggest-city/index.ts': 'Gemini only',
  'supabase/functions/parse-booking/index.ts': 'Gemini, and the booking URL the user pasted',
};

const CALL_RE = /\bfetch\s*\(|new\s+XMLHttpRequest|new\s+WebSocket|new\s+EventSource|sendBeacon\s*\(/;

async function walk(dir, exts, out = []) {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') await walk(p, exts, out); }
    else if (exts.includes(path.extname(e.name))) out.push(p);
  }
  return out;
}

async function staticPass() {
  const files = [
    ...(await walk(path.join(appRoot, 'src'), ['.js', '.jsx', '.mjs', '.ts', '.tsx'])),
    ...(await walk(path.join(repoRoot, 'supabase', 'functions'), ['.ts', '.mjs', '.js'])),
  ];
  const sites = [];
  for (const f of files) {
    const rel = path.relative(f.startsWith(appRoot) ? appRoot : repoRoot, f).split(path.sep).join('/');
    const lines = (await fs.readFile(f, 'utf8')).split('\n');
    lines.forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
      if (CALL_RE.test(line)) sites.push({ file: rel, line: i + 1, code: t.slice(0, 120) });
    });
  }
  const unknown = sites.filter((s) => !CALL_SITES[s.file]);
  return { files: files.length, sites, unknown };
}

/* ------------------------------------------------------------- trace pass */

// Hosts that sell or quote travel. A request to any of them during a user
// session is exactly what this task forbids. Click-outs to these hosts are
// navigations and are never followed by this harness.
const FARE_API = [
  /(^|\.)api\.travelpayouts\.com$/, /(^|\.)aviasales\.[a-z.]+$/, /(^|\.)tp\.media$/,
  /(^|\.)ryanair\.com$/, /(^|\.)wizzair\.com$/, /(^|\.)vueling\.com$/, /(^|\.)volotea\.com$/,
  /(^|\.)easyjet\.com$/, /(^|\.)kiwi\.com$/, /(^|\.)skyscanner\.[a-z.]+$/, /(^|\.)amadeus\.com$/,
  /(^|\.)duffel\.com$/, /(^|\.)flixbus\.[a-z.]+$/, /(^|\.)omio\.[a-z.]+$/, /(^|\.)trainline\.[a-z.]+$/,
  /(^|\.)rome2rio\.com$/, /(^|\.)transitous\.org$/, /(^|\.)serpapi\.com$/, /(^|\.)booking\.com$/,
  /(^|\.)airbnb\.[a-z.]+$/, /(^|\.)hostelworld\.com$/, /(^|\.)getyourguide\.[a-z.]+$/,
];
// The Travelpayouts Drive script in index.html (emrldtp.com) loads its own
// code and config, reports errors to sentry.avs.io and rewrites outbound
// links into affiliate links. It is allowed only while none of its requests
// asks for a price.
const PRICE_PATH = /price|fare|cheap|calendar|latest|month-matrix|search|offers?\b/i;

const KNOWN = [
  ['self', (h) => h === '127.0.0.1' || h === 'localhost'],
  ['data host', (h) => h === 'data.carta-europetravel.com' || h === 'cdn.carta-europetravel.com'],
  ['basemap tiles', (h) => /(^|\.)cartocdn\.com$/.test(h) || h === 'tile.openstreetmap.org'],
  ['images', (h) => /(^|\.)wikimedia\.org$/.test(h) || /(^|\.)geograph\.org\.uk$/.test(h) || h === 'flagcdn.com'],
  ['fonts', (h) => h === 'fonts.googleapis.com' || h === 'fonts.gstatic.com'],
  ['geocode', (h) => h === 'nominatim.openstreetmap.org'],
  ['routing', (h) => h === 'routing.openstreetmap.de'],
  ['weather', (h) => /(^|\.)open-meteo\.com$/.test(h)],
  ['wikipedia', (h) => /(^|\.)wikipedia\.org$/.test(h)],
  ['overpass', (h) => h === 'overpass-api.de' || h === 'overpass.kumi.systems'],
  ['supabase', (h) => /(^|\.)supabase\.co$/.test(h)],
  ['affiliate script', (h) => h === 'emrldtp.com' || h === 'www.travelpayouts.com' || h === 'sentry.avs.io'],
];

function classify(url) {
  let u;
  try { u = new URL(url); } catch { return { kind: 'other', host: '' }; }
  if (u.protocol === 'data:' || u.protocol === 'blob:') return { kind: 'inline', host: '' };
  const h = u.hostname;
  if (FARE_API.some((re) => re.test(h))) return { kind: 'FARE API', host: h, path: u.pathname };
  for (const [kind, test] of KNOWN) {
    if (test(h)) {
      if ((kind === 'self' || kind === 'data host') && /^\/(data\/)?fares\//.test(u.pathname)) return { kind: 'fare slice (static)', host: h, path: u.pathname };
      if (kind === 'affiliate script' && PRICE_PATH.test(u.pathname + u.search)) return { kind: 'FARE API', host: h, path: u.pathname };
      return { kind, host: h, path: u.pathname };
    }
  }
  return { kind: 'UNCLASSIFIED', host: h, path: u.pathname };
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.avif': 'image/avif', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
};

function serve() {
  const server = http.createServer(async (req, res) => {
    const clean = decodeURIComponent(new URL(req.url, ORIGIN).pathname);
    let file = path.join(DIST, clean === '/' ? 'index.html' : clean);
    if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
    try {
      if (!(await fs.stat(file)).isFile()) throw new Error('dir');
    } catch {
      // Missing data file: a real 404 so the app's own fallbacks run. Any
      // other path is an SPA route and gets the shell.
      if (path.extname(clean)) { res.writeHead(404); res.end(); return; }
      file = path.join(DIST, 'index.html');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(await fs.readFile(file));
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

// A catalogued destination id and its country, read from the boot index, so
// the paths below do not hard-code an id a later wave might rename.
async function sampleDest() {
  try {
    const boot = JSON.parse(await fs.readFile(path.join(DIST, 'boot.json'), 'utf8'));
    // boot.d rows are positional, in the order boot.cols names.
    const cols = boot.cols || [];
    const at = (row, name) => row[cols.indexOf(name)];
    const row = (boot.d || []).find((r) => at(r, 'id') && at(r, 'cc'));
    if (row) return { id: String(at(row, 'id')), cc: String(at(row, 'cc')).toUpperCase() };
  } catch { /* fall through */ }
  return { id: 'brussels', cc: 'BE' };
}

async function settle(page, ms = 4000) {
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

async function dismiss(page) {
  for (const re of [/continue without an account/i, /got it/i]) {
    const b = page.getByText(re).first();
    if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await page.waitForTimeout(500); }
  }
}

// The trip planner driven through to an itinerary with priced legs, the same
// route verify_planner_v2_flow.mjs takes: Booked, From and When answered,
// Austria and Czechia picked by hand, the first published trip chosen, its
// first leg set to fly, then on to Finish. It is not a flow test; it only has
// to reach the steps that price flights so their requests land in the trace.
// Returns the furthest milestone reached, which the checks below assert on.
async function walkPlanner(page) {
  const reached = [];
  const next = async () => { await page.locator('.guide-next').first().click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(1200); };
  const top = page.locator('button', { hasText: /trip planner/i }).first();
  if (await top.isVisible().catch(() => false)) await top.click();
  else {
    await page.locator('.bottom-nav-plus').click().catch(() => {});
    await page.waitForTimeout(500);
    await page.locator('.plan-chooser-item').first().click().catch(() => {});
  }
  await page.waitForTimeout(1800);
  if (!(await page.locator('.guide-next').count())) return reached;
  reached.push('opened');
  await next();   // Booked
  await next();   // From
  const sel = '.cal-day:not(.disabled):not(.outside)';
  if (await page.locator(sel).count() <= 8) {
    const fwd = page.getByRole('button', { name: 'Next month' }).first();
    if (await fwd.count() && !(await fwd.isDisabled())) { await fwd.click(); await page.waitForTimeout(500); }
  }
  const days = page.locator(sel);
  if (await days.count() > 8) { await days.nth(2).click(); await page.waitForTimeout(300); await days.nth(8).click(); await page.waitForTimeout(400); }
  await next();   // When
  if (await page.locator('.guide-cgrid, .guide-wtabs').count()) reached.push('where');
  await page.locator('.guide-wtabs [role="tab"]').nth(1).click().catch(() => {});
  await page.waitForTimeout(700);
  for (const name of ['Austria', 'Czechia']) {
    const card = page.locator('.guide-ccard').filter({ hasText: name }).first().locator('.guide-ccard-pick');
    if (await card.count()) { await card.scrollIntoViewIfNeeded().catch(() => {}); await card.click().catch(() => {}); await page.waitForTimeout(400); }
  }
  await next();
  await page.waitForTimeout(1500);
  const trip = page.locator('.wtrip').first();
  await trip.waitFor({ timeout: 20000 }).catch(() => {});
  if (!(await trip.count())) return reached;
  reached.push('trips');
  // The card itself opens nothing; its Choose button picks the trip.
  const choose = trip.getByRole('button', { name: /^choose$/i }).first();
  if (await choose.count()) await choose.click().catch(() => {}); else await trip.click().catch(() => {});
  await page.waitForTimeout(2500);
  // Getting there is its own step after the trip is chosen.
  if (!(await page.locator('.tlegs').isVisible().catch(() => false))) { await next(); await page.waitForTimeout(1500); }
  if (await page.locator('.tlegs').isVisible().catch(() => false)) {
    reached.push('getting there');
    await page.locator('.tleg').first().locator('.tleg-mode').first().click().catch(() => {});
    await page.waitForTimeout(800);
  }
  await next();
  await page.waitForTimeout(1500);
  const title = await page.locator('.guide-title').first().innerText().catch(() => '');
  if (await page.locator('.guide-next').count() === 0 || /finish|summary|your trip|last touches/i.test(title)) reached.push('finish');
  return reached;
}

async function tracePass() {
  const dest = await sampleDest();
  const PATHS = [
    { name: 'explore, default origin', url: '/' },
    { name: 'explore, origin STN', url: '/?o=STN' },
    { name: 'explore, origin CRL', url: '/?o=CRL' },
    { name: 'destinations tab', url: '/?tab=places&o=CRL' },
    { name: 'destination page', url: `/?o=CRL#dest=${encodeURIComponent(dest.id)}` },
    { name: 'trip planner, walked to finish', url: '/?o=CRL', planner: true },
    { name: 'day planner, seeded', url: `/?tab=day&dest=${encodeURIComponent(dest.id)}&o=CRL` },
  ];
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const p of PATHS) {
      for (const vp of [{ label: 'desktop', width: 1366, height: 900 }, { label: 'phone', width: 390, height: 844 }]) {
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        await ctx.addInitScript(() => {
          try {
            localStorage.setItem('continent.lang.v1', 'en');
            localStorage.setItem('continent.guestMode.v1', '1');
            localStorage.setItem('carta.welcomeSeen', '1');
            localStorage.setItem('continent.mapGuideDismissed.v1', '1');
          } catch { /* storage unavailable */ }
        });
        const reqs = [];
        ctx.on('request', (r) => reqs.push({ url: r.url(), type: r.resourceType(), ...classify(r.url()) }));
        const page = await ctx.newPage();
        page.on('crash', () => console.log(`  page crashed on ${p.name} [${vp.label}]`));
        console.log(`tracing ${p.name} [${vp.label}]`);
        const t0 = Date.now();
        await page.goto(ORIGIN + p.url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
        await settle(page);
        await dismiss(page);
        let plannerSteps = null;
        if (p.planner) { plannerSteps = await walkPlanner(page); await settle(page, 2500); }
        results.push({ path: p.name, url: p.url, viewport: vp.label, ms: Date.now() - t0, plannerSteps, reqs });
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
  return { dest, results };
}

/* ------------------------------------------------------------------- main */

const stat = await staticPass();
console.log(`static: ${stat.files} files scanned, ${stat.sites.length} network call sites, ${stat.unknown.length} unclassified`);
for (const s of stat.unknown) console.log(`  UNCLASSIFIED call site ${s.file}:${s.line}  ${s.code}`);

try { await fs.stat(path.join(DIST, 'index.html')); } catch {
  console.error('dist/ is missing; run `npm run build` first');
  process.exit(2);
}
const server = await serve();
let trace;
try { trace = await tracePass(); } finally { server.close(); }

const totals = {};
const hostsByKind = {};
let fareApi = 0, unclassified = 0, slices = 0;
for (const r of trace.results) {
  const kinds = {};
  for (const q of r.reqs) {
    kinds[q.kind] = (kinds[q.kind] || 0) + 1;
    totals[q.kind] = (totals[q.kind] || 0) + 1;
    (hostsByKind[q.kind] ||= new Set()).add(q.host);
    if (q.kind === 'FARE API') { fareApi += 1; console.log(`  FARE API ${r.path} [${r.viewport}]  ${q.url.slice(0, 160)}`); }
    if (q.kind === 'UNCLASSIFIED') { unclassified += 1; console.log(`  UNCLASSIFIED ${r.path} [${r.viewport}]  ${q.url.slice(0, 160)}`); }
    if (q.kind === 'fare slice (static)') slices += 1;
  }
  const brief = Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ');
  console.log(`${r.path} [${r.viewport}]${r.plannerSteps ? ` (planner reached: ${r.plannerSteps.join(' > ')})` : ''}: ${r.reqs.length} requests; ${brief}`);
}

console.log('\nhosts by kind:');
for (const [k, set] of Object.entries(hostsByKind)) console.log(`  ${k}: ${[...set].filter(Boolean).join(', ') || '(inline)'}`);

const checks = [
  ['every network call site is classified', stat.unknown.length === 0],
  ['no request to a fare or travel API host', fareApi === 0],
  ['no request to an unclassified host', unclassified === 0],
  ['at least one static fare slice was read (trace is not vacuous)', slices > 0],
  ['the trip planner reached its priced legs in the trace', trace.results.some((r) => (r.plannerSteps || []).includes('getting there'))],
];
console.log('');
for (const [label, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);

if (JSON_OUT) {
  const out = {
    task: 'T056',
    generated: new Date().toISOString(),
    static: { files: stat.files, callSites: stat.sites, unclassified: stat.unknown },
    trace: {
      sampleDest: trace.dest,
      totals,
      hostsByKind: Object.fromEntries(Object.entries(hostsByKind).map(([k, s]) => [k, [...s].filter(Boolean).sort()])),
      paths: trace.results.map((r) => ({
        path: r.path, url: r.url, viewport: r.viewport, ms: r.ms, plannerSteps: r.plannerSteps,
        requests: r.reqs.length,
        fareSlices: r.reqs.filter((q) => q.kind === 'fare slice (static)').map((q) => q.path),
        thirdParty: r.reqs.filter((q) => !['self', 'inline'].includes(q.kind) && q.kind !== 'fare slice (static)').map((q) => `${q.kind}: ${q.host}${q.path || ''}`),
      })),
    },
    checks: Object.fromEntries(checks),
  };
  await fs.mkdir(path.dirname(path.resolve(appRoot, JSON_OUT)), { recursive: true });
  await fs.writeFile(path.resolve(appRoot, JSON_OUT), JSON.stringify(out, null, 2));
  console.log(`\nwrote ${JSON_OUT}`);
}

process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
