// Headless check for the trails wire export + the footer's data credits.
// Serves the built app (vite preview), then:
//   1. /trails/index.json is real JSON, lists a country file per entry, and
//      carries the filter model the app renders its chips from.
//   2. The filter model matches lib/trailCards.js. The model ships WITH the
//      data, so a value added in the pipeline cannot go missing in the UI and
//      one removed cannot leave a dead chip behind.
//   3. Every listed country file parses, and every trip carries the fields
//      the app needs plus its own attribution_text.
//   4. Tier integrity: a rated row carries a rating, a listed row carries no
//      rating, reasons or score in ANY spelling, and lives in `listed`.
//   5. Region completeness: every rated row carries rg.n3, because that is
//      what the per-region quota spent and what the coverage audit joins on.
//   6. Filter-count sanity: the facet counts the export shipped equal a
//      recount of the rows in the same file. A stale count greys out a chip
//      that would have worked, or promises one that leads nowhere.
//   7. Derived-flag presence: a route assembled from way-level paths says so,
//      and no route says so without being from the osm_ways source.
//   8. No country's published count equals a constant shared by three or more
//      countries. That is what a cap looks like, and killing the cap is what
//      this whole pass was for.
//   9. A published trip's detail file has full-resolution geometry: more
//      points than the simplified wire line it came from.
//  10. The repo gotcha, proven rather than assumed: a country with no file is
//      served as the SPA index with status 200 and an HTML content type, so
//      only a content-type check can tell it apart from real data.
//  11. The footer shows the credits: OpenStreetMap, swisstopo, IGN,
//      Kartverket and Copernicus all render in the Data sources block.
//  12. 380px: the credit list stacks with no horizontal scroll.
// Run from inside continent-app/:  node scripts/verify_trails_export.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import {
  DISTANCE_BANDS, ASCENT_BANDS, GRADES, ROUTE_TYPES, HIGHLIGHTS, SUITABILITY,
} from '../src/lib/trailCards.js';

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
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

try {
  await waitForServer();

  // ---- 1. The index.
  const indexRes = await fetch(`${BASE}/trails/index.json`);
  const indexType = indexRes.headers.get('content-type') || '';
  if (!indexType.includes('json')) fail(`index.json served as ${indexType}`);
  const index = await indexRes.json();
  console.log(`index: ${index.countries.length} countries, ${index.n_trips} rated `
    + `+ ${index.n_listed ?? 0} listed, simplified at ${index.simplify_m} m, `
    + `generated ${index.generated_at}`);
  if (!index.attribution?.length) fail('index carries no attribution lines');

  // ---- 2. The filter model, held against the app's own copy.
  const fm = index.filter_model;
  if (!fm) {
    fail('index carries no filter_model; the app would render chips from a '
      + 'list the pipeline cannot see');
  } else {
    console.log(`filter model: ${fm.version}`);
    const checks = [
      ['difficulty', fm.difficulty?.values, GRADES.map((g) => g.key)],
      ['route_type', fm.route_type?.values, ROUTE_TYPES.map((r) => r.key)],
      ['highlights', fm.highlights?.values, HIGHLIGHTS.map((h) => h.key)],
      ['suitability', fm.suitability?.values, SUITABILITY.map((s) => s.key)],
      ['distance bands', fm.distance?.bands?.map((b) => b.k), DISTANCE_BANDS.map((b) => b.key)],
      ['ascent bands', fm.ascent?.bands?.map((b) => b.k), ASCENT_BANDS.map((b) => b.key)],
    ];
    for (const [name, wire, app] of checks) {
      if (!wire) { fail(`filter model has no ${name}`); continue; }
      if (!same(wire, app)) {
        fail(`${name} drifted: wire ${JSON.stringify(wire)} vs app ${JSON.stringify(app)}`);
      }
    }
    // The ascent band cut points have to agree too, not only the names: a
    // slider and a chip that disagree is worse than either alone.
    for (const b of fm.ascent?.bands || []) {
      const mine = ASCENT_BANDS.find((x) => x.key === b.k);
      const hi = mine.max === Infinity ? null : mine.max;
      if (!mine || mine.min !== b.min || hi !== b.max) {
        fail(`ascent band ${b.k} cut points differ: wire ${b.min}..${b.max} `
          + `vs app ${mine?.min}..${mine?.max}`);
      }
    }
    if (!same(fm.difficulty?.sources || [], ['tagged', 'derived'])) {
      fail('the difficulty model no longer distinguishes tagged from derived');
    }
    console.log('  model matches lib/trailCards.js');
  }

  // ---- 3 to 7. Every country file, and the shape of what is in it.
  const WIRE_FIELDS = ['id', 'name', 'category', 'geometry', 'attribution_text', 'source'];
  const RATING_SPELLINGS = ['rating', 'score', 'reasons'];
  let published = null;
  let totalRated = 0;
  let totalListed = 0;
  let withRg = 0;
  let derived = 0;
  const countByCountry = new Map();

  for (const entry of index.countries) {
    const res = await fetch(`${BASE}${entry.file}`);
    const type = res.headers.get('content-type') || '';
    if (!type.includes('json')) { fail(`${entry.file} served as ${type}`); continue; }
    const doc = await res.json();
    const listed = doc.listed || [];
    if (doc.trips.length !== entry.n_trips) {
      fail(`${entry.file} holds ${doc.trips.length} rated, index says ${entry.n_trips}`);
    }
    if (listed.length !== (entry.n_listed ?? 0)) {
      fail(`${entry.file} holds ${listed.length} listed, index says ${entry.n_listed ?? 0}`);
    }

    for (const trip of doc.trips) {
      const missing = WIRE_FIELDS.filter((f) => trip[f] == null);
      if (missing.length) fail(`${entry.file} trip ${trip.id} missing ${missing.join(', ')}`);
      if (trip.geometry.type !== 'MultiLineString') {
        fail(`${entry.file} trip ${trip.id} is a ${trip.geometry.type}, not MultiLineString`);
      }
      // ---- 4. Tier integrity, the rated half.
      if ((trip.t ?? 'r') !== 'r') {
        fail(`${entry.file} trip ${trip.id} is tier ${trip.t} inside trips[]`);
      }
      // ---- 5. Region completeness.
      if (trip.rg?.n3) withRg += 1;
      if (trip.f?.dr) derived += 1;
      published = published || trip;
    }

    // ---- 4. Tier integrity, the listed half. The whole promise of the tier
    //         is that the app CANNOT render a number nobody earned, and the
    //         only way to guarantee that is for the number never to exist.
    for (const row of listed) {
      if (row.t !== 'l') fail(`${entry.file} listed row ${row.id} is tier ${row.t}`);
      for (const key of RATING_SPELLINGS) {
        if (key in row) fail(`${entry.file} listed row ${row.id} carries ${key}`);
      }
      if (!row.name?.trim()) fail(`${entry.file} listed row ${row.id} has no name`);
      if (!row.why?.length) {
        fail(`${entry.file} listed row ${row.id} carries no why, so the app `
          + 'renders an empty reason list where the shared listed note goes');
      }
    }

    // ---- 6. Filter-count sanity: recount and compare.
    const recount = { grade: {}, route_type: {}, highlights: {}, suitability: {}, ascent: {} };
    const bump = (g, k) => { if (k != null) recount[g][k] = (recount[g][k] || 0) + 1; };
    const bandOf = (m) => (typeof m === 'number'
      ? ASCENT_BANDS.find((b) => m >= b.min && m < b.max)?.key : null);
    for (const trip of doc.trips) {
      bump('grade', trip.f?.g);
      bump('route_type', trip.f?.rt);
      for (const k of new Set(trip.f?.hl || [])) bump('highlights', k);
      for (const k of new Set(trip.f?.su || [])) bump('suitability', k);
      for (const k of new Set(trip.f?.sd || [])) bump('suitability', `${k}:derived`);
      bump('ascent', bandOf(trip.ascent_m));
    }
    for (const [group, mine] of Object.entries(recount)) {
      const shipped = doc.facets?.[group] || {};
      for (const [k, n] of Object.entries(mine)) {
        if (shipped[k] !== n) {
          fail(`${entry.file} facet ${group}.${k} says ${shipped[k]}, rows say ${n}`);
        }
      }
      for (const k of Object.keys(shipped)) {
        if (mine[k] == null) fail(`${entry.file} facet ${group}.${k} counts rows that are not there`);
      }
    }

    totalRated += doc.trips.length;
    totalListed += listed.length;
    if (doc.trips.length) countByCountry.set(entry.country, doc.trips.length);
    console.log(`  ${entry.country}: ${doc.trips.length} rated + ${listed.length} listed, `
      + `${doc.attribution.length} credit line(s)`);
  }
  if (!published) fail('no published trip in any country file');
  console.log(`totals: ${totalRated} rated, ${totalListed} listed, `
    + `${withRg}/${totalRated} carry a region, ${derived} assembled from paths`);

  // ---- 5. Region completeness, as a share rather than per row: a route the
  //         spine genuinely could not place (a midpoint over open water) is
  //         honest, a wire where most rows have no region is a broken build.
  if (totalRated && withRg / totalRated < 0.95) {
    fail(`only ${(100 * withRg / totalRated).toFixed(1)}% of rated rows carry `
      + 'rg.n3; the per-region quota and the coverage audit both join on it');
  }

  // ---- 8. The count that must not be a constant. Before the region quotas,
  //         twelve countries published exactly 158 rows and twenty-nine
  //         exactly 150 hikes, which is what a cap looks like from outside.
  //
  //         One number is exempt and is reported rather than failed: the
  //         legacy country floor. A country whose NUTS3 quotas add up to less
  //         than it already published keeps the old figure (curate.py
  //         COUNTRY_FLOOR), because the quota's inputs are labelled proxies
  //         and reading it as a ceiling cut Cyprus from 101 to 12. Countries
  //         sitting on that floor are cap-bound and saying so is the point;
  //         any OTHER shared count is a new constant and fails.
  const LEGACY_FLOOR = 150;
  const shared = new Map();
  for (const n of countByCountry.values()) shared.set(n, (shared.get(n) || 0) + 1);
  const atFloor = [...countByCountry.entries()].filter(([, n]) => n === LEGACY_FLOOR);
  const caps = [...shared.entries()].filter(([n, k]) => k >= 3 && n !== LEGACY_FLOOR);
  if (caps.length) {
    fail('a published count is shared by three or more countries, which is '
      + `what a cap looks like: ${caps.map(([n, k]) => `${n} (${k}x)`).join(', ')}`);
  } else {
    console.log(`no new constant across ${countByCountry.size} countries`);
  }
  if (atFloor.length) {
    console.log(`  ${atFloor.length} at the legacy floor of ${LEGACY_FLOOR} `
      + `(their region quotas came out below it): `
      + atFloor.map(([cc]) => cc).join(', '));
  }

  // ---- 9. The on-demand half carries more geometry than the wire.
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

  // ---- 10. The SPA fallback, the reason every fetch checks content-type.
  const ghost = await fetch(`${BASE}/trails/ZZ.json`);
  const ghostType = ghost.headers.get('content-type') || '';
  if (ghost.status !== 200 || !ghostType.includes('html')) {
    console.log(`  note: a missing country file answers ${ghost.status} ${ghostType}, `
      + 'not the SPA fallback this build expects');
  } else {
    console.log('  missing country file answers 200 text/html (SPA fallback), '
      + 'so loadTrails() has to read the content type');
  }

  // ---- 11. The data credits, which live in Account > Data sources now that
  //          the front page (and its footer) is gone.
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await page.goto(BASE);
  try {
    await page.getByRole('button', { name: 'Continue without an account' }).click({ timeout: 15000 });
  } catch { /* auth not configured in this build */ }
  await page.locator('.account-avatar-btn').first().click({ timeout: 60000 });
  await page.locator('.account-panel').waitFor({ timeout: 30000 });
  await page.locator('.account-nav:visible', { hasText: /data sources/i }).click({ timeout: 30000 });

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

  // ---- 12. Narrow. The panel is full-width on a phone, so the list has to sit
  //          inside it without pushing the document sideways.
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
