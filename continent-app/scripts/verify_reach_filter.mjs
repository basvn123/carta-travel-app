// Headless verify for the "reachable under N hours" filter (ReachFilter.jsx +
// lib/reach.js), against the BRU fixture in public/reach/BRU.json:
//   1. BRU, filter off: full map, the tray offers the hour chips
//   2. BRU, 5h chip: the set narrows to fixture cities under 300 minutes,
//      the rh URL param appears, the tray badge counts the filter
//   3. reload: rh=5 round-trips (chip still on, same narrowed count)
//   4. CRL (no reach artifact) with rh=5 in the URL: filter stays inert
//      (map NOT emptied), the tray shows the quiet no-data note, no badge
//
// Run from inside continent-app/ against a fresh build:
//   npm run build && node scripts/verify_reach_filter.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4194;
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

let failures = 0;
const fail = (msg) => { console.error('FAIL:', msg); failures += 1; process.exitCode = 1; };
const ok = (msg) => console.log('ok  ', msg);

// Every city the fixture puts within 5 hours of BRU (multi-airport cities
// collapse to one row, gateway parentheticals are stripped by the dedupe).
const UNDER_5H = new Set([
  'Ghent', 'Antwerp', 'Lille', 'Bruges', 'Rotterdam', 'Aachen', 'The Hague',
  'Utrecht', 'Amsterdam', 'Eindhoven', 'Maastricht', 'Luxembourg', 'Paris',
  'London', 'Düsseldorf', 'Frankfurt', 'Lyon', 'Bordeaux', 'Nantes',
]);

const browser = await (async () => {
  await waitForServer();
  return chromium.launch();
})();

async function newPage() {
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await page.addInitScript(() => {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('carta.mapGuideDone', '1');
    localStorage.setItem('carta.fareNoticeSeen', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
  });
  return page;
}

const destCount = async (page) => {
  const txt = (await page.locator('.results-count').first().innerText()).trim();
  return parseInt(txt, 10);
};

try {
  // The artifacts themselves: fixture served, missing origin a plain 404.
  const bru = await fetch(`${BASE}/reach/BRU.json`);
  if (!bru.ok) fail(`fixture /reach/BRU.json not served (HTTP ${bru.status})`);
  else {
    const j = await bru.json();
    const n = Object.keys(j.minutes || {}).length;
    if (j.origin !== 'BRU' || n < 30) fail(`fixture malformed (origin ${j.origin}, ${n} entries)`);
    else ok(`fixture serves: ${n} entries for BRU`);
  }
  // A missing artifact is a 404 on static hosting but the SPA fallback (HTML,
  // HTTP 200) under vite preview; either way it must not parse as JSON. The
  // loader treats both as "no data", so the premise check does too.
  const crl = await fetch(`${BASE}/reach/CRL.json`);
  const crlIsJson = (crl.headers.get('content-type') || '').includes('json');
  if (crl.ok && crlIsJson) fail('unexpected real reach artifact for CRL (test premise broken)');
  else ok('no artifact for CRL (404 or SPA fallback), degrade path exercisable');

  const page = await newPage();

  // 1. BRU, filter off.
  await page.goto(`${BASE}/?o=BRU`);
  await page.locator('.result-row').first().waitFor({ timeout: 120000 });
  await page.waitForTimeout(1200);
  const nOff = await destCount(page);
  if (!(nOff > 100)) fail(`baseline count suspiciously low (${nOff})`);
  else ok(`filter off: ${nOff} destinations`);

  await page.locator('.filter-tray-btn').click();
  await page.locator('.filter-tray.is-open').waitFor({ timeout: 5000 });
  const chips = await page.locator('.filter-reach .pill-toggle').count();
  if (chips !== 5) fail(`expected 5 reach chips (Any + 3/5/8/12h), got ${chips}`);
  else ok('reach control renders Any + 4 hour chips for BRU');
  await page.screenshot({ path: `${SHOTS}/reach-off.png` });

  // 2. Click the 5h chip.
  await page.locator('.filter-reach .pill-toggle', { hasText: '5h' }).click();
  await page.waitForTimeout(1200);
  const nOn = await destCount(page);
  if (!(nOn >= 1 && nOn < nOff && nOn <= UNDER_5H.size)) {
    fail(`5h count out of range: ${nOn} (baseline ${nOff}, fixture allows <= ${UNDER_5H.size})`);
  } else ok(`5h filter narrows ${nOff} -> ${nOn}`);

  const cities = await page.locator('.result-row:not(.is-unreachable) .result-city-name')
    .allInnerTexts().catch(() => []);
  const names = cities.map((c) => c.trim().replace(/\s*\(.*\)$/, '')).filter(Boolean);
  const strays = names.filter((c) => !UNDER_5H.has(c));
  if (names.length && strays.length) fail(`rows outside the 5h fixture set: ${strays.join(', ')}`);
  else if (names.length) ok(`every listed city is in the 5h set (${names.length} rows)`);

  const badge = (await page.locator('.filter-tray-badge').innerText().catch(() => '')).trim();
  if (badge !== '1') fail(`tray badge should count the reach filter, reads "${badge}"`);
  else ok('tray badge counts the active reach filter');

  await page.waitForTimeout(600);   // useUrlSync debounce
  if (!page.url().includes('rh=5')) fail(`rh=5 missing from URL: ${page.url()}`);
  else ok('rh=5 written to the URL');
  await page.screenshot({ path: `${SHOTS}/reach-5h.png` });

  // 3. Reload: the param round-trips.
  await page.reload();
  await page.locator('.result-row').first().waitFor({ timeout: 120000 });
  await page.waitForTimeout(1200);
  if (!page.url().includes('rh=5')) fail(`rh=5 lost across reload: ${page.url()}`);
  else ok('rh=5 survives reload');
  const nReload = await destCount(page);
  if (nReload !== nOn) fail(`count changed across reload (${nOn} -> ${nReload})`);
  else ok(`narrowed count identical after reload (${nReload})`);
  await page.locator('.filter-tray-btn').click();
  const fiveOn = await page.locator('.filter-reach .pill-toggle.on', { hasText: '5h' }).count();
  if (fiveOn !== 1) fail('5h chip not re-selected after reload');
  else ok('5h chip re-selected after reload');

  // 4. CRL has no artifact: rh in the URL must NOT empty the map.
  await page.goto(`${BASE}/?o=CRL&rh=5`);
  await page.locator('.result-row').first().waitFor({ timeout: 120000 });
  await page.waitForTimeout(1200);
  const nCrl = await destCount(page);
  if (!(nCrl > 100)) fail(`no-data origin narrowed anyway (${nCrl} destinations)`);
  else ok(`no reach data for CRL: filter inert, ${nCrl} destinations still shown`);
  await page.locator('.filter-tray-btn').click();
  await page.locator('.filter-tray.is-open').waitFor({ timeout: 5000 });
  const note = (await page.locator('.reach-note').innerText().catch(() => '')).trim();
  if (!note) fail('no-data note missing from the tray for CRL');
  else ok(`quiet no-data state: "${note}"`);
  const crlBadge = await page.locator('.filter-tray-badge').count();
  if (crlBadge > 0) fail('tray badge claims a filter is narrowing while reach is inert');
  else ok('no badge while the reach filter cannot bite');
  await page.screenshot({ path: `${SHOTS}/reach-nodata.png` });

  await browser.close();
  console.log(failures ? `verify_reach_filter: ${failures} FAILURES` : 'verify_reach_filter OK');
} catch (err) {
  fail(err.message);
  await browser.close().catch(() => {});
} finally {
  if (srv) srv.kill();
}
