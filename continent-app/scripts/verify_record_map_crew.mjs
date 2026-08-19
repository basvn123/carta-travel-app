// Headless check of the three things the Visited tab just gained:
//   1. One left edge. "Saved trips", the tab pill and the record's map all
//      begin on the same vertical, on a phone and on a desktop.
//   2. The map expands to the whole device, and the big one really is bigger.
//   3. Who came is editable from the card: a plus on the record card adds a
//      name, and the name survives a reload.
// Run from inside continent-app/:  node scripts/verify_record_map_crew.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4191;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

const isUp = async () => { try { return (await fetch(BASE)).ok; } catch { return false; } };
let srv = null;
const waitForServer = async () => {
  if (await isUp()) return;
  srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { shell: true, stdio: 'ignore' });
  for (let i = 0; i < 60; i += 1) {
    if (await isUp()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite preview never came up');
};

const iso = (off) => {
  const d = new Date();
  d.setDate(d.getDate() + off);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
// Two finished trips, so the record has cards and the map has pins.
const DAY_PLANS = [
  { id: 'r1', label: 'Salzburg', startDate: iso(-16), stops: [{ destinationId: 'SZG', days: 2 }] },
  { id: 'r2', label: 'Bruges', startDate: iso(-40), stops: [{ destinationId: 'gem:bruges', days: 2 }] },
];

const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };
const ok = (msg) => console.log('  ok:', msg);

const enterApp = async (page) => {
  try { await page.getByRole('button', { name: 'Continue without an account' }).click({ timeout: 12000 }); } catch { /* auth off */ }
  for (const label of ['Explore the map', 'Open the app', 'Got it']) {
    try { await page.getByRole('button', { name: label }).first().click({ timeout: 3000 }); } catch { /* not shown */ }
  }
  await page.waitForTimeout(600);
};
const openSaved = async (page) => {
  const btn = page.locator('.header-nav-item, .bottom-nav-item')
    .filter({ hasText: /^(Saved trips|My trips)$/ }).locator('visible=true').first();
  await btn.waitFor({ timeout: 25000 });
  await btn.click();
  await page.locator('.saved-trips-panel').waitFor({ timeout: 10000 });
  await page.waitForTimeout(600);
};
const openRecord = async (page) => {
  await page.locator('.saved-tabs button').nth(2).click();
  await page.waitForTimeout(900);
};
const seed = async (page) => {
  await page.goto(BASE);
  await page.evaluate((plans) => {
    localStorage.setItem('carta.dayplans.v1', JSON.stringify(plans));
    localStorage.setItem('carta.welcomeSeen', '1');
  }, DAY_PLANS);
  await page.reload();
  await enterApp(page);
  await openSaved(page);
  await openRecord(page);
};

const left = (page, sel) => page.locator(sel).first().evaluate((el) => el.getBoundingClientRect().left);

try {
  await waitForServer();
  const browser = await chromium.launch();

  const SIZES = [['phone', { width: 390, height: 844 }], ['desktop', { width: 1360, height: 900 }]];
  for (const [name, viewport] of SIZES) {
    // ---- 1. One left edge down the panel.
    const page = await browser.newPage({ viewport });
    await seed(page);
    if (!(await page.locator('.saved-map').count())) { fail(`${name}: the record has no map to align`); continue; }
    const edges = {
      tag: await left(page, '.saved-panel-header .panel-tag'),
      heading: await left(page, '.saved-panel-header .account-heading'),
      pill: await left(page, '.saved-tabs'),
      map: await left(page, '.saved-map'),
      record: await left(page, '.saved-section.is-big .saved-section-title'),
    };
    const spread = Math.max(...Object.values(edges)) - Math.min(...Object.values(edges));
    if (spread > 1.5) fail(`${name}: left edges disagree by ${spread.toFixed(1)}px ${JSON.stringify(edges)}`);
    else ok(`${name}: tag, heading, tabs, map and record share one left edge (${edges.map.toFixed(0)}px)`);

    // ---- 2. The map expands to the whole device.
    const small = await page.locator('.saved-map').boundingBox();
    await page.locator('.saved-map-expand').click();
    await page.waitForTimeout(1600);
    const full = await page.locator('.savedmap-full').boundingBox();
    if (!full) {
      fail(`${name}: the full map never opened`);
    } else {
      if (Math.abs(full.width - viewport.width) > 1 || Math.abs(full.height - viewport.height) > 1) {
        fail(`${name}: full map is ${full.width}x${full.height}, not the ${viewport.width}x${viewport.height} device`);
      } else ok(`${name}: the map covers the whole device`);
      const canvas = await page.locator('.savedmap-full canvas').first().boundingBox();
      if (!canvas || canvas.height < small.height * 1.6) {
        fail(`${name}: the big canvas (${canvas && canvas.height}) is not meaningfully bigger than ${small.height}`);
      } else ok(`${name}: the canvas grew ${(canvas.height / small.height).toFixed(1)}x, so pinching in reaches further`);
      // Portalled out of the transformed panel, or it would be pinned to the column.
      const parent = await page.locator('.savedmap-full').evaluate((el) => el.parentElement.tagName);
      if (parent !== 'BODY') fail(`${name}: the overlay hangs off <${parent}>, not <body>`);
      else ok(`${name}: portalled to body, clear of the panel transform`);
      await page.screenshot({ path: `${SHOTS}/record-map-full-${name}.png` });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(700);
      if (await page.locator('.savedmap-full').count()) fail(`${name}: Escape did not close the big map`);
      else ok(`${name}: Escape closes it`);
    }

    // ---- 3. The plus on a record card adds who came.
    const card = page.locator('.uptrip-card.is-visited').first();
    await card.locator('.uptrip-crew-add').click();
    await page.waitForTimeout(300);
    await card.locator('.uptrip-crew-input').fill('Sofie');
    await card.locator('.uptrip-crew-save').click();
    await page.waitForTimeout(600);
    const line = await card.locator('.uptrip-crew-line').innerText();
    if (!line.includes('Sofie')) fail(`${name}: the card still says "${line}" after adding somebody`);
    else ok(`${name}: the card names who came`);
    const dot = await card.locator('.uptrip-crew-dot').first().innerText();
    if (dot !== 'S') fail(`${name}: avatar reads "${dot}", expected S`);
    await card.screenshot({ path: `${SHOTS}/record-card-crew-${name}.png` });

    // It went to extras.people, the one roster the expense ledger splits by.
    const stored = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.includes('extras') && localStorage[k].includes('Sofie'));
      return key ? JSON.parse(localStorage[key]).people : null;
    });
    if (!stored || stored[0]?.name !== 'Sofie') fail(`${name}: not written to extras.people (${JSON.stringify(stored)})`);
    else ok(`${name}: stored in extras.people, the roster the expense ledger already uses`);

    await page.reload();
    await enterApp(page);
    await openSaved(page);
    await openRecord(page);
    const after = await page.locator('.uptrip-card.is-visited').first().locator('.uptrip-crew-line').innerText();
    if (!after.includes('Sofie')) fail(`${name}: the name did not survive a reload (now "${after}")`);
    else ok(`${name}: still there after a reload`);
    await page.close();
  }

  await browser.close();
  if (!process.exitCode) console.log('all checks passed');
} finally {
  if (srv) srv.kill();
}
