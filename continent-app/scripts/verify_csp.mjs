// Headless CSP violation gate (T276, rebuilt by T1090 for ROADMAP C5).
//
// Serves a build under the real Content-Security-Policy from public/_headers,
// walks every top-level screen at phone and desktop width, and fails on ANY
// securitypolicyviolation (any directive, inline style included). It also
// covers the two documents the app writes itself, both under the same policy:
// the print view's popup (tripExport.js) and a prerendered page spliced into
// the shell the way functions/[[path]].js does it.
//
//   node scripts/verify_csp.mjs [--dist DIR] [--url URL] [--csp VALUE] [--only NAME,...] [--reference]
//
//   --dist  the build to serve (default dist/). A path missing there is served
//           from public/, so the fast build (publicDir off) works:
//             FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs
//             node scripts/verify_csp.mjs --dist ../.fastbuild
//   --url   test a running server instead (a preview deploy, say); the policy
//           is then whatever that server sends, and the two written documents
//           are skipped unless the server is this script's own.
//   --csp   override the policy the local server sends.
//   --only  a comma list of screen names.
//   --reference  also run the policy without the Wikimedia and Geograph image
//           hosts, to show what removing them would cost (row T052-f). Not a
//           pass criterion.
//
// Exit 0 when the real policy produced no violation on any screen; 1 otherwise.
// A screen that never painted the app counts as a failure too, so a blank page
// cannot pass vacuously.
//
// Chromium logs every refusal to the console as well ("Refused to apply inline
// style ..."), so a violation in a document whose listeners were reset (the
// popup's document.open) is still caught there.

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dir, '..');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 && i + 1 < args.length ? args[i + 1] : null; };
const cspArg = opt('--csp');
const urlArg = opt('--url');
const distDir = path.resolve(appRoot, opt('--dist') || 'dist');
const publicDir = path.join(appRoot, 'public');
const only = opt('--only') ? new Set(opt('--only').split(',')) : null;
const reference = args.includes('--reference');
const PORT = 4175;

// The real header, read from public/_headers. Production is on Cloudflare
// Pages since T293 and the "/*" stanza of that file is what it sends, so this
// harness cannot drift from the shipped policy (T276-a).
async function readRealCsp() {
  const text = await fs.readFile(path.join(publicDir, '_headers'), 'utf8');
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === '/*');
  if (start < 0) throw new Error('public/_headers has no "/*" stanza');
  for (let i = start + 1; i < lines.length && /^\s/.test(lines[i]); i++) {
    const m = lines[i].match(/^\s+Content-Security-Policy:\s*(.+?)\s*$/);
    if (m) return m[1];
  }
  throw new Error('the "/*" stanza of public/_headers has no Content-Security-Policy line');
}

function withoutWikimedia(csp) {
  return csp
    .split(/\s+/)
    .filter((tok) => !/^https:\/\/(upload|thumb|commons)\.wikimedia\.org;?$|^https:\/\/s[0-3]\.geograph\.org\.uk;?$/.test(tok))
    .join(' ');
}

// The screens. `hash` is opened on the shell; `click` then presses the first
// visible button whose text matches; `fresh` skips the first-visit flags so
// the home page shows.
const SCREENS = [
  { name: 'home', hash: '', fresh: true },
  // T1209 (G14): the new home behind its flag, previewed by its query.
  { name: 'home-g14', hash: '?home=g14', fresh: true },
  { name: 'map', hash: '' },
  { name: 'trip-planner', hash: '', click: /trip planner/i },
  { name: 'day-planner', hash: '', click: /day planner/i },
  { name: 'dest-city', hash: '#dest=FCO' },
  { name: 'dest-gem', hash: '#dest=gem%3Abled' },
  { name: 'region', hash: '#region=COAST:BE-BELGIAN-COAST' },
  { name: 'trail', hash: '#trail=176172&tc=ES' },
  { name: 'beach', hash: '#beach=es-cala-rovira-Q24021830&bc=ES' },
  { name: 'lake', hash: '#lake=si-lake-bled-Q648902&lc=SI' },
  { name: 'mountain', hash: '#mtn=ch-jungfrau-Q15312&mc=CH' },
  { name: 'cycle', hash: '#cycle=10&cc=LU' },
  { name: 'tour', hash: '#tour=de-ammer-amper-radweg-balanced' },
  { name: 'trips-active', hash: '#trips=active&bc=CH' },
  { name: 'trips-bike', hash: '#trips=bike&bc=AT' },
  { name: 'journeys', hash: '#journeys=index' },
  { name: 'journey', hash: '#journey=es-pilgrim-camino-sarria-santiago' },
  { name: 'itinerary', hash: '#itin=at-salzburg-vienna-chain-6d' },
  { name: 'prerendered', path: '/spain/trails/176172-estels-del-sud', local: true },
  { name: 'print-view', hash: '', print: true, local: true },
];
const VIEWPORTS = [
  { label: 'phone', width: 390, height: 844 },
  { label: 'desktop', width: 1280, height: 800 },
];

// The prerendered page: a fixture rendered by the real renderer and spliced
// into the built shell by the real splice, as the Function serves it.
async function prerenderedHtml(shell) {
  const { renderPage } = await import(pathToFileURL(path.join(appRoot, 'scripts/prerender/html.mjs')).href);
  const { spliceShell } = await import(pathToFileURL(path.join(appRoot, 'src/lib/prerenderShell.js')).href);
  const page = renderPage({
    path: '/spain/trails/176172-estels-del-sud',
    title: 'Estels del Sud, a walk in Catalonia | Carta',
    description: 'A fixture page for the CSP check.',
    h1: 'Estels del Sud',
    crumbs: [{ name: 'Spain', path: '/spain' }, { name: 'Walks', path: '/spain/trails' }],
    lead: ['A loop through the Ports massif.', 'Second paragraph.'],
    receipt: { head: 'A day here', lines: [{ label: 'Bed', value: '40 EUR' }], totalLabel: 'Total', total: '40 EUR' },
    facts: [{ label: 'Distance', value: '12 km' }],
    sections: [{ h2: 'Nearby', paras: ['Text.'], links: [{ name: 'Another walk', path: '/spain/trails/1-x' }] }],
    credits: ['OpenStreetMap contributors'],
  });
  const out = spliceShell(shell, page);
  if (!out) throw new Error('spliceShell refused the built shell');
  return out;
}

// The print view: the real tripPrintHtml on a small trip, written into a popup
// opened by the app's own page, exactly as downloadTripPdf does.
async function printHtml() {
  const { tripPrintHtml } = await import(pathToFileURL(path.join(appRoot, 'src/lib/tripExport.js')).href);
  const stop = (city, a, d) => ({ dest: { city, country: 'Austria' }, arriveDate: a, departDate: d, nights: 2 });
  return tripPrintHtml({
    label: 'CSP fixture trip',
    stopDetails: [stop('Salzburg', '2026-06-01', '2026-06-03'), stop('Vienna', '2026-06-03', '2026-06-05')],
    dayPlan: [{ dayNum: 1, stop: stop('Salzburg', '2026-06-01', '2026-06-03'), date: '2026-06-01', activities: ['Old town'] }],
    stayCosts: [{ accomTotal: 180, groundTotal: 90 }, { accomTotal: 200, groundTotal: 100 }],
    legs: [{ mode: 'train', ground_total: 35 }],
    grandTotal: 605,
    groupSize: 1,
    extras: { notes: 'Bring a jacket.', checklist: [{ text: 'Passport', done: true }] },
  });
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm',
  '.pbf': 'application/x-protobuf', '.xml': 'application/xml',
};

let currentCsp = null;

async function readFirst(rel) {
  for (const base of [distDir, publicDir]) {
    const file = path.join(base, rel);
    if (!file.startsWith(base)) return null;
    try {
      const stat = await fs.stat(file);
      if (stat.isFile()) return { file, body: await fs.readFile(file) };
    } catch { /* try the next root */ }
  }
  return null;
}

function startLocalServer() {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      const send = (status, type, body) => {
        res.setHeader('Content-Type', type);
        if (currentCsp) res.setHeader('Content-Security-Policy', currentCsp);
        res.writeHead(status);
        res.end(body);
      };
      try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (pathname === '/spain/trails/176172-estels-del-sud') {
          const shell = await fs.readFile(path.join(distDir, 'index.html'), 'utf8');
          return send(200, TYPES['.html'], await prerenderedHtml(shell));
        }
        const hit = await readFirst(pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, ''));
        if (!hit) return send(404, 'text/plain', 'Not found');
        return send(200, TYPES[path.extname(hit.file)] || 'application/octet-stream', hit.body);
      } catch (e) {
        return send(500, 'text/plain', String(e.message));
      }
    });
    server.listen(PORT, () => resolve(server));
  });
}

const STUB_STYLE = (base) => JSON.stringify({
  version: 8,
  glyphs: `${base}/__glyphs/{fontstack}/{range}.pbf`,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#eeeae2' } }],
});

const REFUSED = /Refused to|Content Security Policy/i;

async function checkScreen(browser, screen, vp, base, printDoc) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const found = [];
  await context.addInitScript((fresh) => {
    window.__cspViolations = [];
    const keep = (e) => window.__cspViolations.push({
      directive: e.violatedDirective, blocked: e.blockedURI, sample: e.sample, source: `${e.sourceFile || ''}:${e.lineNumber || ''}`,
    });
    window.addEventListener('securitypolicyviolation', keep, true);
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.mapGuideDismissed.v1', '1');
      if (!fresh) localStorage.setItem('continent.homeSeen.v1', '1');
    } catch { /* storage unavailable */ }
  }, !!screen.fresh);
  let page;
  const watch = (p, where) => p.on('console', (m) => {
    if (m.type() === 'error' && REFUSED.test(m.text())) found.push({ directive: 'console', blocked: where, sample: m.text().slice(0, 160) });
  });
  // Every tab of the context, the screen's own and the print popup.
  context.on('page', (p) => watch(p, 'tab'));
  // Hermetic: nothing leaves this machine. A CSP check runs before the
  // request, so aborting a remote image still records a refused host. The
  // basemap style gets a stub, so every MapLibre map finishes loading and adds
  // its markers, popups and controls with or without a network.
  await context.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    if (/cartocdn\.com\/.*style\.json/.test(u)) return route.fulfill({ contentType: 'application/json', body: STUB_STYLE(base) });
    return route.abort();
  });
  page = await context.newPage();
  let painted = false;
  try {
    const url = screen.path ? `${base}${screen.path}` : `${base}/${screen.hash}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    if (screen.click) {
      const buttons = page.getByRole('button', { name: screen.click });
      const n = await buttons.count();
      for (let i = 0; i < n; i++) {
        if (await buttons.nth(i).isVisible().catch(() => false)) { await buttons.nth(i).click({ timeout: 4000 }).catch(() => {}); break; }
      }
      await page.waitForTimeout(3000);
    }
    // Scroll the main column so lazy sections mount and run their styling.
    await page.evaluate(async () => {
      for (const el of [document.scrollingElement, ...document.querySelectorAll('main, [class*="scroll"], [class*="panel"]')]) {
        if (el && el.scrollHeight > el.clientHeight) { el.scrollTop = el.scrollHeight; await new Promise((r) => setTimeout(r, 300)); el.scrollTop = 0; }
      }
    }).catch(() => {});
    await page.waitForTimeout(1000);
    painted = await page.evaluate(() => (document.getElementById('root')?.children.length || 0) > 0);
    if (screen.print) {
      const [popup] = await Promise.all([
        context.waitForEvent('page', { timeout: 5000 }),
        page.evaluate((html) => {
          const w = window.open('', '_blank', 'width=760,height=900');
          w.document.write(html);
          w.document.close();
        }, printDoc),
      ]);
      await popup.waitForTimeout(800);
      // The print stylesheet must have applied: body max-width is 640px there.
      const maxW = await popup.evaluate(() => getComputedStyle(document.body).maxWidth);
      if (maxW !== '640px') found.push({ directive: 'print-style-not-applied', blocked: 'popup', sample: `body max-width ${maxW}` });
      found.push(...await popup.evaluate(() => window.__cspViolations || []).catch(() => []));
    }
    if (screen.path) {
      // The reading column's inline stylesheet must have applied.
      const pad = await page.evaluate(() => { const m = document.querySelector('.pr'); return m ? getComputedStyle(m).maxWidth : 'no .pr'; });
      if (pad !== '760px' && pad !== 'no .pr') found.push({ directive: 'prerender-style-not-applied', blocked: 'page', sample: `.pr max-width ${pad}` });
    }
    found.push(...await page.evaluate(() => window.__cspViolations || []));
  } catch (e) {
    found.push({ directive: 'load-error', blocked: '', sample: e.message.slice(0, 160) });
  }
  await context.close();
  return { found, painted };
}

async function run(csp, label, base, printDoc) {
  currentCsp = csp;
  // CHROMIUM_PATH: a browser other than the one this playwright version
  // downloads (a container with a preinstalled Chromium, say).
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const rows = [];
  try {
    for (const screen of SCREENS) {
      if (only && !only.has(screen.name)) continue;
      if (screen.local && urlArg) continue;
      for (const vp of VIEWPORTS) {
        const { found, painted } = await checkScreen(browser, screen, vp, base, printDoc);
        rows.push({ screen: screen.name, vp: vp.label, found, painted });
        const flag = found.length ? 'FAIL' : painted ? 'ok' : 'BLANK';
        console.log(`  ${flag.padEnd(5)} ${screen.name} @ ${vp.label}: ${found.length} violation(s)`);
        for (const f of found.slice(0, 6)) console.log(`        ${f.directive} ${f.blocked || ''} ${f.sample ? JSON.stringify(f.sample) : ''} ${f.source || ''}`);
      }
    }
  } finally {
    await browser.close();
  }
  const total = rows.reduce((n, r) => n + r.found.length, 0);
  const blank = rows.filter((r) => !r.painted).map((r) => `${r.screen}@${r.vp}`);
  console.log(`\n${label}: ${total} violation(s) over ${rows.length} screen loads${blank.length ? `; never painted: ${blank.join(', ')}` : ''}`);
  return { total, blank };
}

async function main() {
  console.log('CSP gate: every screen under the shipped policy');
  let server = null;
  if (!urlArg) {
    await fs.access(path.join(distDir, 'index.html')).catch(() => { throw new Error(`no build at ${distDir} (run the fast build, then pass --dist)`); });
    server = await startLocalServer();
  }
  const base = urlArg ? urlArg.replace(/\/$/, '') : `http://localhost:${PORT}`;
  try {
    const real = urlArg ? null : (cspArg || await readRealCsp());
    if (real) console.log(`policy: ${real.slice(0, 160)}...`);
    const printDoc = await printHtml();
    const result = await run(real, 'Real header', base, printDoc);
    if (reference && real) await run(withoutWikimedia(real), 'Reference: without the Wikimedia and Geograph hosts', base, printDoc);
    if (result.total === 0 && result.blank.length === 0) {
      console.log('\nSUCCESS: no CSP violation on any screen.');
      process.exitCode = 0;
    } else {
      console.log('\nFAILURE: CSP violations, or a screen that never painted.');
      process.exitCode = 1;
    }
  } finally {
    if (server) server.close();
  }
}

main().catch((e) => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
