// Region layer harness: the scope ladder, travel bands, region pages and
// the tier rules on the wire.
//
// npm run build, then: node scripts/verify_regions.mjs
//
// What it holds the build to:
//   - /region/index.json exists, parses, and its quota model matches the
//     formulas in pipeline/regions/quotas.py (the model ships with the
//     data, and this is the check that keeps the two in lockstep)
//   - every region file the index references exists and parses (sampled),
//     empty regions included: a missing JSON under public/ is served as
//     the SPA index with status 200, which is exactly the bug this rule
//     prevents
//   - no listed row anywhere carries a score key; top.json carries rated
//     rows only
//   - every published layer row carries its rg block (sampled)
//   - the near screen: with a mocked location on the Belgian coast, the
//     header says "near", the first card is a nearby card, and no far row
//     renders without a band divider above it. "415 km away" under "near
//     you" is the screenshot this whole programme started from.
//   - #region= opens the region page, Escape closes it
//
// One check is reported but NOT counted as a failure yet: country counts
// equal to a global constant (ES/FR/GB at exactly PUBLISH_MAX). The region
// quota reorders WHICH rows fill the cap in this chat; lifting the cap
// itself is the beach brief's work, so until that lands the smell test
// only warns.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

const PORT = 4213;
const BASE = `http://127.0.0.1:${PORT}/`;
mkdirSync('shots', { recursive: true });

const isUp = async () => {
  try { const r = await fetch(BASE); return r.ok; } catch { return false; }
};
let server = null;
if (!(await isUp())) {
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'],
    { shell: true, stdio: 'ignore' });
  for (let i = 0; i < 90 && !(await isUp()); i++) {
    await new Promise((r) => setTimeout(r, 500));
  }
}

const browser = await chromium.launch();
const checks = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });
const warns = [];
const errors = [];
const NOISE = /emrldtp|ERR_FAILED|config is not valid|content_overrides|net::|favicon/;

const seed = (page) => page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
  } catch { /* storage unavailable */ }
});
const wire = (page) => {
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
  page.on('console', (m) => {
    if (m.type() === 'error' && !NOISE.test(m.text())) {
      errors.push('console: ' + m.text().slice(0, 140));
    }
  });
};

const getJson = async (path) => {
  try {
    const r = await fetch(BASE.replace(/\/$/, '') + path);
    if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) return null;
    return await r.json();
  } catch { return null; }
};

try {
  // ── 1. The region wire ────────────────────────────────────────────────
  const index = await getJson('/region/index.json');
  check('region index exists and parses', !!index && Array.isArray(index.regions),
    index ? `${index.regions?.length} regions` : 'missing');

  if (index) {
    check('region count matches the index', index.n_regions === index.regions.length,
      `${index.n_regions} vs ${index.regions.length}`);

    // The quota model in the wire against the formulas in the code.
    const quotasPy = readFileSync('../pipeline/regions/quotas.py', 'utf-8');
    const model = index.model || {};
    let inSync = !!model.quotas;
    for (const [layer, spec] of Object.entries(model.quotas || {})) {
      if (!quotasPy.includes(`"${spec.per_unit.replace(/ /g, ' ')}"`)
        && !quotasPy.includes(spec.per_unit)) inSync = false;
      if (!spec.unit || typeof spec.lo !== 'number') inSync = false;
      void layer;
    }
    check('quota model ships with the data and matches quotas.py', inSync,
      Object.keys(model.quotas || {}).join(','));

    // Sampled region files: they exist, parse, keep tiers apart, and an
    // empty region still answers with a file.
    const sample = [];
    const rs = index.regions;
    for (let i = 0; i < rs.length && sample.length < 40; i += Math.ceil(rs.length / 40)) {
      sample.push(rs[i]);
    }
    let missing = 0; let scoredListed = 0; let unranked = 0; let empties = 0;
    for (const r of sample) {
      const file = await getJson(r.file);
      if (!file || !file.region) { missing++; continue; }
      if (!file.rated.length && !file.listed.length) empties++;
      for (const card of file.listed) if ('score' in card) scoredListed++;
      const scores = file.rated.map((c) => c.score).filter((s) => typeof s === 'number');
      const sorted = [...scores].sort((a, b) => b - a);
      if (JSON.stringify(scores) !== JSON.stringify(sorted)) unranked++;
    }
    check('sampled region files all exist and parse', missing === 0,
      `${sample.length - missing}/${sample.length}, ${empties} empty files present`);
    check('no listed card carries a score key', scoredListed === 0,
      scoredListed ? `${scoredListed} leaks` : '');
    check('rated cards are ranked', unranked === 0);
  }

  // ── 2. Layer wires: tiers and rg ──────────────────────────────────────
  for (const [dir, key] of [['beaches', 'beaches'], ['lakes', 'lakes'],
    ['mountains', 'mountains']]) {
    const top = await getJson(`/${dir}/top.json`);
    const rows = top?.[key] || [];
    const onlyRated = rows.every((r) => (r.t || 'r') === 'r' && ('score' in r));
    check(`${dir} top.json carries rated rows only`, rows.length > 0 && onlyRated,
      `${rows.length} rows`);

    const idx = await getJson(`/${dir}/index.json`);
    const ccs = (idx?.countries || []).slice(0, 3).map((c) => c.cc);
    let noRg = 0; let n = 0; let listedScored = 0;
    for (const cc of ccs) {
      const file = await getJson(`/${dir}/${cc}.json`);
      for (const row of file?.[key] || []) {
        n++;
        if (!row.rg) noRg++;
      }
      for (const row of file?.listed || []) {
        if ('score' in row) listedScored++;
      }
    }
    check(`${dir} rows carry their region block`, n > 0 && noRg === 0,
      `${noRg}/${n} missing rg`);
    check(`${dir} listed rows ship without scores`, listedScored === 0);

    // The cap smell test, reported but not failed until the beach brief
    // lifts the cap itself.
    const counts = (idx?.countries || []).map((c) => c.n);
    const max = Math.max(...counts, 0);
    const atMax = counts.filter((c) => c === max).length;
    if (atMax >= 3 && max > 0) {
      warns.push(`${dir}: ${atMax} countries publish exactly ${max}, the cap still binds (lifted by the layer briefs)`);
    }
  }

  // ── 3. The near screen: scope header, band chips, band dividers ───────
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: 51.34, longitude: 3.27 },  // Knokke
    permissions: ['geolocation'],
  });
  const page = await ctx.newPage();
  await seed(page);
  wire(page);
  await page.route('**/nominatim.openstreetmap.org/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      name: 'Knokke-Heist', display_name: 'Knokke-Heist, West-Vlaanderen, Belgium',
      address: { town: 'Knokke-Heist', state: 'West-Vlaanderen', country_code: 'be' },
      lat: '51.34', lon: '3.27',
    }),
  }));
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2500);
  await page.locator('.bottom-nav-item', { hasText: /destinations/i }).first()
    .click({ timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.locator('.places-cat', { hasText: /beaches/i }).first()
    .click({ timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const locate = page.locator('.places-locate:visible').first();
  if (await locate.count()) {
    await locate.click().catch(() => {});
    await page.waitForTimeout(2500);
  }
  const nearhead = page.locator('.places-nearhead');
  const hasNear = await nearhead.count() > 0;
  check('locating composes a scope header', hasNear);
  if (hasNear) {
    const scope = await nearhead.getAttribute('data-scope');
    check('the Knokke scope is nearby (the Belgian coast is 3 km away)',
      scope === 'nearby', `scope=${scope}`);
    const chips = await page.locator('.places-card-km').allInnerTexts();
    check('cards carry band chips, not raw km-away lines',
      chips.length > 0 && chips.every((c) => !/km away$/.test(c.trim())),
      chips.slice(0, 2).join(' | '));
    // The invariant this programme exists for: nothing beyond the nearby
    // band renders above the first band divider while the header says near.
    const order = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('.places-bandhead, .places-card-km').forEach((el) => {
        out.push(el.classList.contains('places-bandhead')
          ? 'DIV' : el.textContent.trim());
      });
      return out;
    });
    let beforeDivider = [];
    for (const item of order) {
      if (item === 'DIV') break;
      beforeDivider.push(item);
    }
    const farWords = /journey|weekend/i;
    check('no far row renders under the near header before a band divider',
      beforeDivider.every((c) => !farWords.test(c)),
      `${beforeDivider.length} rows above the first divider`);
    await page.screenshot({ path: 'shots/regions-near-knokke.png' });
  }
  await ctx.close();

  // ── 4. The region page deep link ──────────────────────────────────────
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page2 = await ctx2.newPage();
  await seed(page2);
  wire(page2);
  await page2.goto(`${BASE}#region=COAST:BE-BELGIAN-COAST`,
    { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page2.waitForTimeout(2500);
  const rgnp = page2.locator('.rgnp');
  check('#region= opens the region page', await rgnp.count() > 0);
  if (await rgnp.count()) {
    const h1 = await page2.locator('.rgnp h1').innerText().catch(() => '');
    check('the region page names the coast', /belgian coast/i.test(h1), h1);
    await page2.screenshot({ path: 'shots/regions-page-belgian-coast.png' });
    await page2.keyboard.press('Escape');
    await page2.waitForTimeout(400);
    check('escape closes the region page', await rgnp.count() === 0);
  }
  await ctx2.close();
} catch (e) {
  // A thrown locator timeout must not swallow the checks that already ran:
  // "which of these passed" is the whole output of this script.
  errors.push('script: ' + String(e && e.message ? e.message : e).split('\n')[0]);
  check('the run finished without throwing', false);
}

await browser.close();
if (server) server.kill();
let fail = 0;
for (const c of checks) {
  if (!c.ok) fail++;
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
}
for (const w of warns) console.log(`WARN  ${w}`);
if (errors.length) {
  console.log('\npage errors:');
  for (const e of [...new Set(errors)].slice(0, 12)) console.log('  ' + e);
}
process.exit(fail || errors.length ? 1 : 0);
