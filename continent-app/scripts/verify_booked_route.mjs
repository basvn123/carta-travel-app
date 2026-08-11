// Headless check of the booked path's route builder: the numbered stay list,
// the transport connector between each pair of stays, and the fact that a
// flight declared here survives into the overview's itinerary and receipt.
// The hops used to not exist at all, so this guards the whole chain, not the
// widget: wizard -> loadFromWizard -> legs -> ItinLeg.
// Run from inside continent-app/:  node scripts/verify_booked_route.mjs
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4191;
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

// Pick a value in the app's custom dropdown by its visible label.
const pickDropdown = async (page, wrapper, label) => {
  await wrapper.locator('.dropdown-trigger').click();
  const item = page.locator('.dropdown-menu .dropdown-item', { hasText: label }).first();
  await item.waitFor({ timeout: 15000 });
  await item.click();
};

const addStop = async (page, country, cityIndex = 0) => {
  const add = page.locator('.booked-add .trip-add-row');
  if (!(await add.count())) {
    await page.locator('.booked-add-btn').click();
    await page.locator('.booked-add .trip-add-row').waitFor({ timeout: 15000 });
  }
  const row = page.locator('.booked-add .trip-add-row');
  await pickDropdown(page, row.locator('.trip-add-country'), country);
  await row.locator('.trip-add-city .dropdown-trigger').click();
  const city = page.locator('.dropdown-menu .dropdown-item').nth(cityIndex);
  await city.waitFor({ timeout: 15000 });
  const cityName = (await city.textContent() || '').trim();
  await city.click();
  await row.locator('.trip-add-btn').click();
  return cityName;
};

const SIZES = [
  { name: 'laptop', width: 1360, height: 900 },
  { name: 'phone', width: 390, height: 844 },
];

try {
  await waitForServer();
  const browser = await chromium.launch();

  for (const size of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => fail(`${size.name}: page error ${e.message}`));
    await page.addInitScript(() => {
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('carta.fareNoticeSeen', '1');
      localStorage.setItem('carta.welcomeSeen', '1');
      localStorage.setItem('continent.onboardingSeen.v1', '1');
    });
    await page.goto(`${BASE}/?tab=trip&o=CRL`);

    const launch = page.locator('.trip-guide-cta, .trip-launcher-primary').first();
    await launch.waitFor({ timeout: 120000 });
    await launch.click();

    // Path 3: transport and stays booked.
    const paths = page.locator('.guide-path');
    await paths.first().waitFor({ timeout: 30000 });
    const bookedLabel = (await paths.nth(2).locator('b').textContent() || '').trim();
    if (bookedLabel !== 'Transport and stays booked') {
      fail(`${size.name}: path card reads "${bookedLabel}"`);
    }
    if (!(await paths.nth(2).locator('.guide-path-duo svg').count())) {
      fail(`${size.name}: booked path card has no dual glyph`);
    }
    await paths.nth(2).click();
    await page.locator('.booked-route').waitFor({ timeout: 30000 });

    // The removed explainer must be gone, and the canvas must be the wider one.
    const geo = await page.evaluate(() => {
      const canvas = document.querySelector('.trip-wizard-modal .guide-canvas');
      const r = canvas ? canvas.getBoundingClientRect() : null;
      return {
        subs: document.querySelectorAll('.guide-canvas .guide-sub').length,
        canvasW: r ? Math.round(r.width) : 0,
        maxW: canvas ? getComputedStyle(canvas).maxWidth : '',
      };
    });
    if (geo.subs !== 0) fail(`${size.name}: the old explainer paragraph is still rendered`);
    if (size.name === 'laptop' && geo.maxW !== '1060px') {
      fail(`${size.name}: canvas max-width is ${geo.maxW}, expected the mid column`);
    }

    // A date, then three stays: two in one country, one across the water so a
    // no-road hop is exercised too.
    await page.locator('.guide-trip-meta .date-field-trigger').click();
    const day = page.locator('.cal-day:not(.outside):not(.disabled)').first();
    await day.waitFor({ timeout: 15000 });
    await day.click();

    const a = await addStop(page, 'Italy', 0);
    const b = await addStop(page, 'Italy', 1);
    const c = await addStop(page, 'Ireland', 0);
    console.log(`${size.name}: stops`, a, b, c);

    await page.locator('.booked-route-item').nth(2).waitFor({ timeout: 15000 });
    const shape = await page.evaluate(() => ({
      stops: document.querySelectorAll('.booked-stop').length,
      hops: document.querySelectorAll('.booked-hop').length,
      indexes: [...document.querySelectorAll('.booked-stop-index')].map((e) => e.textContent),
      noRoad: document.querySelectorAll('.booked-hop-none').length,
      dates: [...document.querySelectorAll('.booked-stop-date')].map((e) => e.textContent.trim()),
      span: (document.querySelector('.guide-trip-meta-sum') || {}).textContent || '',
      hopModes: [...document.querySelectorAll('.booked-hop-mode .dropdown-label')].map((e) => e.textContent.trim()),
    }));
    console.log(`${size.name}:`, JSON.stringify(shape));
    if (shape.stops !== 3) fail(`${size.name}: expected 3 stop rows, got ${shape.stops}`);
    if (shape.hops !== 2) fail(`${size.name}: expected 2 connectors, got ${shape.hops}`);
    if (shape.indexes.join(',') !== '1,2,3') fail(`${size.name}: stop numbering is ${shape.indexes}`);
    if (shape.dates.length !== 3) fail(`${size.name}: stops are missing arrival dates`);
    if (!/nights, leaving/.test(shape.span)) fail(`${size.name}: no trip span summary (${shape.span})`);
    // Italy -> Ireland has no road, so its connector must not offer a train.
    if (shape.hopModes[1] !== 'Flight') {
      fail(`${size.name}: the sea hop defaulted to "${shape.hopModes[1]}", expected Flight`);
    }
    // No horizontal overflow at either size.
    const overflowX = await page.evaluate(() => {
      const body = document.querySelector('.trip-wizard-modal .guide-body');
      return body ? body.scrollWidth - body.clientWidth : 0;
    });
    if (overflowX > 1) fail(`${size.name}: the route builder overflows sideways by ${overflowX}px`);

    // One rhythm down the stack. These used to run 16 / 0 / 0 / 10: the cards
    // sat flush against their connectors and the creation row touched the
    // last card, so the list read as three unrelated blocks.
    await page.locator('.booked-add-btn').click();
    await page.locator('.booked-add .trip-add-row').waitFor({ timeout: 15000 });
    await page.waitForTimeout(250);
    const rhythm = await page.evaluate(() => {
      const box = (s, i = 0) => {
        const e = document.querySelectorAll(s)[i];
        return e ? e.getBoundingClientRect() : null;
      };
      const stops = [...document.querySelectorAll('.booked-stop')];
      const meta = box('.guide-trip-meta');
      const s1 = box('.booked-stop', 0);
      const s2 = box('.booked-stop', 1);
      const last = stops[stops.length - 1].getBoundingClientRect();
      const hop = box('.booked-hop', 0);
      const addRow = box('.booked-add .trip-add-row');
      const card = document.querySelector('.booked-stop');
      const idx = box('.booked-stop-index');
      const rm = box('.booked-stop .trip-stop-remove');
      const add = {
        country: box('.booked-add .trip-add-country'),
        city: box('.booked-add .trip-add-city'),
        btn: box('.booked-add .trip-add-btn'),
      };
      return {
        metaToStop: Math.round(s1.top - meta.bottom),
        stopToHop: Math.round(hop.top - s1.bottom),
        hopToStop: Math.round(s2.top - hop.bottom),
        stopToAdd: Math.round(addRow.top - last.bottom),
        leftGutter: Math.round(idx.left - card.getBoundingClientRect().left),
        rightGutter: Math.round(card.getBoundingClientRect().right - rm.right),
        fieldSkew: Math.round(Math.abs(add.city.width - add.country.width)),
        cityToBtn: Math.round(add.btn.left - add.city.right),
      };
    });
    console.log(`${size.name}: rhythm`, JSON.stringify(rhythm));
    for (const [k, want] of [['metaToStop', 16], ['stopToHop', 16], ['hopToStop', 16], ['stopToAdd', 24]]) {
      if (Math.abs(rhythm[k] - want) > 1) fail(`${size.name}: ${k} is ${rhythm[k]}px, expected ${want}px`);
    }
    if (Math.abs(rhythm.leftGutter - rhythm.rightGutter) > 1) {
      fail(`${size.name}: card gutters are ${rhythm.leftGutter}px left vs ${rhythm.rightGutter}px right`);
    }
    if (size.name === 'laptop') {
      if (rhythm.fieldSkew > 1) fail(`${size.name}: the add fields differ by ${rhythm.fieldSkew}px`);
      if (rhythm.cityToBtn > 14) fail(`${size.name}: ${rhythm.cityToBtn}px of dead space before Add`);
    }

    // A sea crossing opens on Flight with a place to type the fare, not on
    // "no overland route": Carta cannot price it, the traveller can.
    if (shape.noRoad !== 0) fail(`${size.name}: the sea hop still reads as unroutable`);
    if ((await page.locator('.booked-hop-cost input').count()) !== 1) {
      fail(`${size.name}: the booked hop has nowhere to enter its fare`);
    }

    // Price the flight the traveller says they booked.
    const cost = page.locator('.booked-hop-cost input').first();
    await cost.waitFor({ timeout: 15000 });
    await cost.fill('184');

    // And put the first hop on the train explicitly.
    await pickDropdown(page, page.locator('.booked-hop-mode').first(), 'Train');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${SHOTS}/booked-route-${size.name}.png`, fullPage: true });

    // Into the overview: the answers must survive the hand-over.
    await page.locator('.guide-next').click();
    await page.locator('.itin-leg').first().waitFor({ timeout: 30000 });
    const itin = await page.evaluate(() => ({
      legs: [...document.querySelectorAll('.itin-leg')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
      total: (document.querySelector('.trip-total-row.grand .val') || {}).textContent || '',
    }));
    console.log(`${size.name}: itinerary`, JSON.stringify(itin));
    if (!itin.legs.some((l) => /Train/.test(l))) fail(`${size.name}: the train hop did not reach the itinerary`);
    const flightLeg = itin.legs.find((l) => /Flight/.test(l));
    if (!flightLeg) fail(`${size.name}: the booked flight hop did not reach the itinerary`);
    else if (!/184/.test(flightLeg)) fail(`${size.name}: the flight leg lost its price (${flightLeg})`);
    await page.screenshot({ path: `${SHOTS}/booked-overview-${size.name}.png`, fullPage: true });

    await ctx.close();
  }

  await browser.close();
  if (process.exitCode !== 1) console.log('verify_booked_route OK');
} catch (err) {
  fail(err.stack || err.message);
} finally {
  if (srv) {
    srv.kill();
    if (process.platform === 'win32' && srv.pid) {
      try { spawnSync('taskkill', ['/pid', String(srv.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ }
    }
  }
  process.exit(process.exitCode === 1 ? 1 : 0);
}
