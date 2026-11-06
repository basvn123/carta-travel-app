// T1152 (ROADMAP F3): the taste chips on My trips, Your Europe tab, at a
// phone and a desktop width. DOM checks, no screenshots unless SHOTS is set:
//   1. With the seam's saves and trips plus three saved beach towns, chips
//      render, each with an evidence line, a Yes and a No of at least 44 px.
//   2. Yes marks the chip (aria-pressed, the tick) and survives a reload.
//   3. No hides the chip; it appears under Hidden, and Show again brings it
//      back. The verdicts persist in carta.taste.v1.
//   4. No horizontal scroll at 390 px.
// Needs a dev server with the seams: VITE_E2E_SEAMS=1 npx vite --port 5231
// Run from continent-app/:  CARTA_PORT=5231 node scripts/verify_taste_profile.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const PORT = Number(process.env.CARTA_PORT) || 5231;
// Three more beach towns saved (the shortlist rides the address, `fav`).
const SEED_FAVS = ['dest:NCE', 'dest:FAO', 'dest:MLA'];
const URL_ = `http://127.0.0.1:${PORT}/?tab=trips&savedmock=1&fav=${SEED_FAVS.join('.')}`;
const SHOTS = process.env.SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

let failed = 0;
const fail = (msg) => { console.error('FAIL:', msg); failed += 1; };
const ok = (msg) => console.log('  ok:', msg);


async function openEurope(page) {
  await page.goto(URL_, { waitUntil: 'domcontentloaded' });
  await page.locator('.saved-trips-panel').waitFor({ timeout: 30000 });
  await page.locator('.mytrips [role="tab"]').nth(2).click();
  await page.locator('[data-taste-profile]').waitFor({ timeout: 15000 });
  await page.waitForTimeout(400);
}

async function run(width, height, label) {
  console.log(`${label} (${width} x ${height})`);
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });

  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await openEurope(page);

  const chips = page.locator('.tp-chip');
  const n = await chips.count();
  if (n < 1) fail(`${label}: no taste chips (${await page.locator('[data-taste-profile]').innerText()})`);
  else ok(`${n} chips: ${(await page.locator('.tp-chip-label > span:first-of-type').allInnerTexts()).join(', ')}`);
  for (let i = 0; i < n; i += 1) {
    const ev = (await chips.nth(i).locator('.tp-ev').innerText()).trim();
    if (!ev) fail(`${label}: chip ${i} has no evidence`);
    for (const sel of ['.tp-yes', '.tp-no']) {
      const box = await chips.nth(i).locator(sel).boundingBox();
      if (!box || box.width < 44 || box.height < 44) fail(`${label}: ${sel} on chip ${i} is ${box?.width}x${box?.height}`);
    }
  }
  if (n) ok(`every chip has evidence and 44 px Yes and No (first: "${(await chips.first().locator('.tp-ev').innerText()).replace(/\n/g, ' / ')}")`);
  if (SHOTS) await page.locator('[data-taste-profile]').screenshot({ path: `${SHOTS}/taste-${label}.png` });

  if (n >= 2) {
    const first = await chips.nth(0).getAttribute('data-node');
    const second = await chips.nth(1).getAttribute('data-node');
    await chips.nth(0).locator('.tp-yes').click();
    await page.waitForTimeout(200);
    const pressed = await page.locator(`.tp-chip[data-node="${first}"] .tp-yes`).getAttribute('aria-pressed');
    if (pressed !== 'true') fail(`${label}: Yes did not mark ${first}`); else ok(`Yes marks ${first}`);
    await page.locator(`.tp-chip[data-node="${second}"] .tp-no`).click();
    await page.waitForTimeout(200);
    if (await page.locator(`.tp-chip[data-node="${second}"]`).count()) fail(`${label}: No did not hide ${second}`);
    else ok(`No hides ${second}`);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('carta.taste.v1') || 'null'));
    if (stored?.verdicts?.[first]?.v !== 'accept' || stored?.verdicts?.[second]?.v !== 'reject') fail(`${label}: verdicts not stored ${JSON.stringify(stored)}`);
    else ok('verdicts stored in carta.taste.v1');

    await openEurope(page);
    const after = await page.locator(`.tp-chip[data-node="${first}"] .tp-yes`).getAttribute('aria-pressed').catch(() => null);
    if (after !== 'true') fail(`${label}: accepted chip lost after reload`); else ok('accept survives a reload');
    if (await page.locator(`.tp-chip[data-node="${second}"]`).count()) fail(`${label}: rejected chip back after reload`);
    await page.locator('.tp-foot button', { hasText: /Hidden/ }).click();
    const row = page.locator(`.tp-hidden-row[data-node="${second}"]`);
    if (!(await row.count())) fail(`${label}: ${second} not under Hidden`); else ok(`${second} listed under Hidden`);
    await row.locator('button').click();
    await page.waitForTimeout(200);
    if (!(await page.locator(`.tp-chip[data-node="${second}"]`).count())) fail(`${label}: Show again did not restore ${second}`);
    else ok('Show again restores it');
  }
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (sideways > 1) fail(`${label}: page scrolls sideways by ${sideways}px`); else ok('no sideways scroll');
  if (errors.length) fail(`${label}: page errors ${errors.join(' | ')}`);
  await browser.close();
}

await run(390, 844, 'phone');
await run(1440, 900, 'desktop');
if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
console.log('taste profile: all checks passed');
