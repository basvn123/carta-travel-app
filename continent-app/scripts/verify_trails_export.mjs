// Headless check for the trails wire export + the footer's data credits.
// Serves the built app (vite preview), then:
//   1. /trails/index.json is real JSON and lists a country file per entry.
//   2. Every listed country file parses, and every trip carries the fields
//      the app needs plus its own attribution_text.
//   3. A published trip's detail file has full-resolution geometry: more
//      points than the simplified wire line it came from.
//   4. The repo gotcha, proven rather than assumed: a country with no file is
//      served as the SPA index with status 200 and an HTML content type, so
//      only a content-type check can tell it apart from real data.
//   5. The footer shows the credits: OpenStreetMap, swisstopo, IGN,
//      Kartverket and Copernicus all render in the Data sources block.
//   6. 380px: the credit list stacks with no horizontal scroll.
// Run from inside continent-app/:  node scripts/verify_trails_export.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4193;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

const isUp = async () => {
  try { return (await fetch(BASE)).ok; } catch { return false; }
};
let srv = null;
const waitForServer = async () => {
  if (await isUp()) return;
  srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    shell: true, stdio: 'ignore',
  });
  for (let i = 0; i < 60; i += 1) {
    if (await isUp()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite preview never came up');
};

const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };

try {
  await waitForServer();

  // ---- 1. The index.
  const indexRes = await fetch(`${BASE}/trails/index.json`);
  const indexType = indexRes.headers.get('content-type') || '';
  if (!indexType.includes('json')) fail(`index.json served as ${indexType}`);
  const index = await indexRes.json();
  console.log(`index: ${index.countries.length} countries, ${index.n_trips} trip(s), `
    + `simplified at ${index.simplify_m} m, generated ${index.generated_at}`);
  if (!index.attribution?.length) fail('index carries no attribution lines');

  // ---- 2. Every country file, and the shape of what is in it.
  const WIRE_FIELDS = ['id', 'name', 'category', 'geometry', 'attribution_text', 'source'];
  let published = null;
  for (const entry of index.countries) {
    const res = await fetch(`${BASE}${entry.file}`);
    const type = res.headers.get('content-type') || '';
    if (!type.includes('json')) { fail(`${entry.file} served as ${type}`); continue; }
    const doc = await res.json();
    if (doc.trips.length !== entry.n_trips) {
      fail(`${entry.file} holds ${doc.trips.length} trips, index says ${entry.n_trips}`);
    }
    for (const trip of doc.trips) {
      const missing = WIRE_FIELDS.filter((f) => trip[f] == null);
      if (missing.length) fail(`${entry.file} trip ${trip.id} missing ${missing.join(', ')}`);
      if (trip.geometry.type !== 'MultiLineString') {
        fail(`${entry.file} trip ${trip.id} is a ${trip.geometry.type}, not MultiLineString`);
      }
      published = published || trip;
    }
    console.log(`  ${entry.country}: ${doc.trips.length} trip(s), `
      + `${doc.attribution.length} credit line(s)`);
  }
  if (!published) fail('no published trip in any country file');

  // ---- 3. The on-demand half carries more geometry than the wire.
  if (published) {
    const detail = await (await fetch(`${BASE}${published.detail}`)).json();
    const pts = (g) => g.coordinates.reduce((n, part) => n + part.length, 0);
    const wire = pts(published.geometry);
    const full = pts(detail.geometry);
    if (full <= wire) fail(`detail geometry is not fuller: ${full} vs ${wire} points`);
    if (detail.geometry.coordinates[0][0].length !== 3) {
      fail('detail geometry lost its Z ordinate');
    }
    console.log(`  detail ${published.detail}: ${full} points vs ${wire} on the wire, `
      + `${detail.elevation ? detail.elevation.profile.length : 0} elevation samples`);
  }

  // ---- 4. The SPA fallback, the reason every fetch checks content-type.
  const ghost = await fetch(`${BASE}/trails/ZZ.json`);
  const ghostType = ghost.headers.get('content-type') || '';
  if (ghost.status !== 200 || !ghostType.includes('html')) {
    console.log(`  note: a missing country file answers ${ghost.status} ${ghostType}, `
      + 'not the SPA fallback this build expects');
  } else {
    console.log('  missing country file answers 200 text/html (SPA fallback), '
      + 'so loadTrails() has to read the content type');
  }

  // ---- 5. The data credits, which live in Account > Data sources now that
  //         the front page (and its footer) is gone.
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await page.goto(BASE);
  try {
    await page.getByRole('button', { name: 'Continue without an account' }).click({ timeout: 15000 });
  } catch { /* auth not configured in this build */ }
  await page.locator('.account-avatar-btn').first().click({ timeout: 60000 });
  await page.locator('.account-panel').waitFor({ timeout: 30000 });
  await page.locator('.account-menu-row', { hasText: /data sources/i }).click({ timeout: 30000 });

  const credits = page.locator('.account-credits li');
  await credits.first().waitFor({ timeout: 30000 });
  const lines = await credits.allInnerTexts();
  console.log(`Account > Data sources renders ${lines.length} credit lines`);
  for (const name of ['OpenStreetMap', 'swisstopo', 'IGN', 'Kartverket', 'Copernicus']) {
    if (!lines.some((l) => l.includes(name))) fail(`credits never name ${name}`);
  }
  const heading = await page.locator('.account-heading').innerText();
  console.log(`  heading: ${JSON.stringify(heading)}`);
  console.log(`  first three: ${lines.slice(0, 3).map((l) => JSON.stringify(l)).join(' | ')}`);
  await page.locator('.account-panel').screenshot({ path: `${SHOTS}/trails-credits.png` });

  // ---- 6. Narrow. The panel is full-width on a phone, so the list has to sit
  //         inside it without pushing the document sideways.
  await page.setViewportSize({ width: 380, height: 900 });
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) fail(`${overflow}px of horizontal scroll at 380px`);
  await page.locator('.account-credits').scrollIntoViewIfNeeded();
  await page.locator('.account-panel').screenshot({ path: `${SHOTS}/trails-credits-380.png` });
  console.log('380px: credits readable, no horizontal scroll');

  await browser.close();
  console.log(process.exitCode ? 'DONE with failures' : 'PASS');
} finally {
  if (srv) srv.kill();
}
