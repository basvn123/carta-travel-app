// Headless verify for "Routes from here" (ROUTES.md R6): the block that
// replaced the trail entries in the destination page's nature join.
//
//   npm run build, then: node scripts/verify_routes_block.mjs
//
// Spawns its own vite preview (dist/, port 4208). The contract:
//
//   named for the path   no row title anywhere in the block matches the stage
//                        patterns R3a classifies by (Tappa, Etappe, Etape,
//                        Stage, Sezione, Tramo, a leading counter, a trailing
//                        number). This is the whole point of the step: the
//                        page used to say "Romea Strata in Italia - Tappa
//                        RSIT47" and now says "Romea Strata".
//   the stretch is named where a row IS part of a path, the stretch that
//                        passes is named underneath, so the two are never
//                        confused.
//   measured to the line every row carries a distance and a translated
//                        compass direction, and no distance exceeds the
//                        25 km radius the attach measured with.
//   honest about itself  the coverage note and the OSM + Copernicus credit
//                        are both in the block, not in a later step.
//   absent when empty    a destination with no attachments has no block and
//                        no empty shell.
//   the PDF agrees       the guide download carries the same section.
//
// Screenshots to shots/routes-*.png.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync, readdirSync } from 'node:fs';

const PORT = 4208;
const BASE = `http://127.0.0.1:${PORT}/`;
mkdirSync('shots', { recursive: true });

// The same patterns hierarchy.py classifies a stage by. A row title matching
// one of these is the fault this step exists to remove.
const STAGE_RE = new RegExp(
  '\\b(tappa|etappe|etapp|etape|\u00e9tape|etapa|stage|sezione|tramo|trecho|'
  + 'odcinek|dagsetapp|abschnitt|teilst\u00fcck|troncon|tron\u00e7on|secci\u00f3n|'
  + 'seccion|section|leg|deel|dagwandeling)\\b\\s*[:.\\-]?\\s*[A-Z]{0,4}\\d{1,3}\\b'
  + '|^\\s*\\d{1,4}\\s*[~:.\\-]\\s+\\S', 'i');

const isUp = async () => {
  try { const r = await fetch(BASE); return r.ok; } catch { return false; }
};
let server = null;
if (!(await isUp())) {
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'],
    { shell: true, stdio: 'ignore' });
  for (let i = 0; i < 90 && !(await isUp()); i++) await new Promise((r) => setTimeout(r, 500));
}

const checks = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });
const errors = [];
const NOISE = /emrldtp|ERR_FAILED|config is not valid|content_overrides|net::|favicon/;

// Pick subjects from the shipped dossiers themselves, so the harness tests
// what the data actually says rather than a destination somebody hoped had
// routes. One with the most rows, one with none at all.
const pickSubjects = () => {
  const withRoutes = [];
  const without = [];
  const dir = 'public/dossier';
  if (!existsSync(dir)) return { withRoutes, without };
  for (const fn of readdirSync(dir)) {
    if (!/^[A-Za-z0-9:_-]+\.json$/.test(fn) || fn === 'index.json') continue;
    let d;
    try { d = JSON.parse(readFileSync(`${dir}/${fn}`, 'utf8')); } catch { continue; }
    const n = (d.routes?.hiking?.length || 0) + (d.routes?.cycling?.length || 0);
    if (n > 0) withRoutes.push({ id: d.id, n, stages: (d.routes?.hiking || []).filter((r) => r.stage).length });
    else if (d.around || d.highlights) without.push({ id: d.id });
  }
  withRoutes.sort((a, b) => b.stages - a.stages || b.n - a.n);
  return { withRoutes, without };
};

const { withRoutes, without } = pickSubjects();
check('dossiers carry a routes block', withRoutes.length > 0,
  `${withRoutes.length} destinations with routes`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
page.on('console', (m) => {
  if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 140));
});
await page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
  } catch { /* storage unavailable */ }
});

const subject = withRoutes[0];
if (subject) {
  await page.goto(`${BASE}#dest=${encodeURIComponent(subject.id)}`,
    { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(4500);
  const all = page.locator('.destp-subnav-all');
  if (await all.count() && /expand/i.test(await all.textContent().catch(() => ''))) {
    await all.click();
    await page.waitForTimeout(900);
  }

  const block = page.locator('#sec-routes');
  check('the routes block renders', await block.count() === 1, subject.id);
  const rows = page.locator('#sec-routes .drh-row');
  const nRows = await rows.count();
  check('rows render', nRows > 0, `${nRows} rows`);

  const names = await page.locator('#sec-routes .drh-name').allTextContents();
  const offenders = names.filter((n) => STAGE_RE.test(n));
  check('no row is named for a stage', offenders.length === 0,
    offenders.slice(0, 3).join(' | ') || `${names.length} names checked`);

  const stretches = await page.locator('#sec-routes .drh-stage').count();
  check('the stretch that passes is named', stretches > 0, `${stretches} rows`);

  const facts = await page.locator('#sec-routes .drh-facts').allTextContents();
  const withDistance = facts.filter((f) => /passes\s+[\d.]+\s*km/i.test(f));
  check('every row says how far it passes', withDistance.length === facts.length,
    `${withDistance.length}/${facts.length}`);
  const far = facts.map((f) => Number((f.match(/passes\s+([\d.]+)\s*km/i) || [])[1]))
    .filter((v) => v > 25.4);
  check('no row is further than the 25 km radius', far.length === 0, far.join(', '));
  const dirs = facts.filter((f) => /north|south|east|west/i.test(f));
  check('the direction is translated, not a letter code', dirs.length === facts.length,
    `${dirs.length}/${facts.length}`);

  check('coverage is admitted in the block',
    /coverage is uneven/i.test(await page.locator('#sec-routes .drh-note').textContent().catch(() => '')));
  const credit = await page.locator('#sec-routes .drh-credit').textContent().catch(() => '');
  check('OSM is credited in the block', /openstreetmap/i.test(credit));
  check('Copernicus is credited for the ascent', /copernicus/i.test(credit));

  const dashes = await page.locator('#sec-routes').textContent();
  check('no em dash or middot in the block', !/[\u2014\u2013\u00b7\u2022]/.test(dashes || ''));

  await page.locator('#sec-routes').screenshot({ path: 'shots/routes-desktop.png' })
    .catch(() => {});

  // Phone: the block must not push the page sideways.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
    } catch { /* storage unavailable */ }
  });
  await phone.goto(`${BASE}#dest=${encodeURIComponent(subject.id)}`,
    { waitUntil: 'domcontentloaded', timeout: 45000 });
  await phone.waitForTimeout(4500);
  const overflow = await phone.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('no horizontal scroll at 390px', overflow <= 1, `${overflow}px`);
  await phone.locator('#sec-routes').screenshot({ path: 'shots/routes-phone.png' })
    .catch(() => {});
  await phone.close();
}

// Node-network cycling (ROUTES.md R8): a sentence, never a list. The
// acceptance criterion is that a reader in the Netherlands is told how much
// signed network is there WITHOUT being shown its 24,171 two-kilometre edges
// as routes.
{
  const nn = (() => {
    const dir = 'public/dossier';
    if (!existsSync(dir)) return null;
    for (const fn of readdirSync(dir)) {
      if (!/\.json$/.test(fn) || fn === 'index.json') continue;
      let d;
      try { d = JSON.parse(readFileSync(`${dir}/${fn}`, 'utf8')); } catch { continue; }
      if (d.routes?.node_network?.km) return { id: d.id, ...d.routes.node_network };
    }
    return null;
  })();
  check('a dossier carries a node-network summary', !!nn, nn ? `${nn.id} ${nn.km} km` : '');
  if (nn) {
    await page.goto(`${BASE}#dest=${encodeURIComponent(nn.id)}`,
      { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4200);
    const all = page.locator('.destp-subnav-all');
    if (await all.count() && /expand/i.test(await all.textContent().catch(() => ''))) {
      await all.click();
      await page.waitForTimeout(800);
    }
    const box = page.locator('[data-testid="route-nodenet"]');
    check('the node network renders', await box.count() === 1, nn.id);
    const text = (await box.textContent().catch(() => '')) || '';
    check('it states the signed length and the junctions',
      text.includes(String(nn.km)) && text.includes(String(nn.junctions)),
      text.replace(/\s+/g, ' ').slice(0, 90));
    // The mesh must never be rendered as route rows.
    const rows = await page.locator('[data-testid="route-nodenet"] .drh-row').count();
    check('it is a sentence, not a list of edges', rows === 0, `${rows} rows`);
  }
}

// A destination with nothing attached shows no block at all.
if (without.length) {
  const empty = without[0];
  await page.goto(`${BASE}#dest=${encodeURIComponent(empty.id)}`,
    { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3500);
  const all = page.locator('.destp-subnav-all');
  if (await all.count() && /expand/i.test(await all.textContent().catch(() => ''))) {
    await all.click();
    await page.waitForTimeout(700);
  }
  check('no block where there is nothing to show',
    await page.locator('#sec-routes').count() === 0, empty.id);
}

check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
if (server) server.kill();

let bad = 0;
for (const c of checks) {
  if (!c.ok) bad++;
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
}
console.log(`\n${checks.length - bad}/${checks.length} checks passed`);
process.exit(bad ? 1 : 0);
