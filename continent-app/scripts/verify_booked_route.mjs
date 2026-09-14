// Headless check of the trip a traveller types in themselves: they say their
// beds are booked, list the cities they hold, and Carta plans the days around
// them. It guards the whole chain rather than the widget:
//   wizard (Stays step) -> travel legs -> loadFromWizard -> legs -> ItinLeg
// including the two things that used to break: a sea crossing with no road,
// and a price entered for a leg surviving into the overview.
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

/** Add a stop by typing its name into the Stays step's search. */
const addStop = async (page, name) => {
  const card = page.locator('.guide-card', { hasText: /add a stop/i });
  await card.locator('input.guide-search').fill(name);
  const hit = page.locator('.guide-city-btn').first();
  await hit.waitFor({ timeout: 15000 });
  const label = ((await hit.locator('.guide-city-name').textContent()) || '').trim();
  await hit.click();
  await page.waitForTimeout(500);
  return label;
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

    // One flow: the planner opens on step one and the first question is what
    // is already held.
    const bits = page.locator('.guide-booked-bit');
    await bits.first().waitFor({ timeout: 30000 });
    if (await bits.count() !== 2) fail(`${size.name}: expected two booked toggles`);
    await page.locator('.guide-booked-bit', { hasText: /where you sleep/i }).click();
    await page.waitForTimeout(400);

    // Booked beds mean Carta does not pick cities, so the country step goes.
    const railSteps = await page.locator('.wiz-step').count();
    if (railSteps !== 3) fail(`${size.name}: expected three steps with stays booked, got ${railSteps}`);

    // A date range, then on to the stays.
    const days = page.locator('.cal-day:not(.outside):not(.disabled)');
    await days.nth(2).click();
    await page.waitForTimeout(300);
    await days.nth(8).click();
    await page.waitForTimeout(400);
    await page.locator('.guide-next').click();
    await page.locator('.guide-card', { hasText: /add a stop/i }).waitFor({ timeout: 30000 });

    // Two Italian stops and one across the water, so the no-road hop is
    // exercised too.
    const a = await addStop(page, 'Naples');
    const b = await addStop(page, 'Bari');
    const c = await addStop(page, 'Dubrovnik');
    console.log(`${size.name}: stops`, a, b, c);

    const shape = await page.evaluate(() => ({
      stops: document.querySelectorAll('.booked-stop').length,
      indexes: [...document.querySelectorAll('.booked-stop-index')].map((e) => e.textContent),
      dates: [...document.querySelectorAll('.booked-stop-date')].map((e) => e.textContent.trim()),
      foot: (document.querySelector('.guide-foot-summary') || {}).textContent || '',
    }));
    console.log(`${size.name}:`, JSON.stringify(shape));
    if (shape.stops !== 3) fail(`${size.name}: expected 3 stop rows, got ${shape.stops}`);
    if (shape.indexes.join(',') !== '1,2,3') fail(`${size.name}: stop numbering is ${shape.indexes}`);
    if (shape.dates.length !== 3) fail(`${size.name}: stops are missing their arrival dates`);
    if (!/3 cities/.test(shape.foot)) fail(`${size.name}: the footer does not count the stops (${shape.foot})`);
    // Dates chain: each stop starts on or after the one before it.
    const iso = shape.dates.map((d) => Date.parse(d));
    if (!(iso[0] < iso[1] && iso[1] < iso[2])) fail(`${size.name}: arrival dates do not chain (${shape.dates})`);
    await page.screenshot({ path: `${SHOTS}/booked-stays-${size.name}.png`, fullPage: true });

    // Taking a stop out puts the nights back.
    await page.locator('.trip-stop-remove').last().click();
    await page.waitForTimeout(500);
    if (await page.locator('.booked-stop').count() !== 2) fail(`${size.name}: removing a stop did not remove its row`);
    await addStop(page, 'Dubrovnik');

    // On to the last step: one leg per hop, plus the way there and home.
    await page.locator('.guide-next').click();
    await page.locator('.tlegs').waitFor({ timeout: 30000 });
    const legs = await page.locator('.tleg').count();
    if (legs !== 4) fail(`${size.name}: expected four legs (out, two hops, home), got ${legs}`);

    // The sea crossing: name it a flight and say what it cost.
    const seaLeg = page.locator('.tleg', { hasText: /Dubrovnik/i }).first();
    await seaLeg.locator('.tleg-mode', { hasText: /^flight$/i }).click();
    await seaLeg.locator('.tleg-input').fill('184');
    await page.waitForTimeout(400);
    const total = await page.locator('.tlegs-total').innerText();
    if (!/184/.test(total)) fail(`${size.name}: the entered fare is not in the travel total (${total})`);
    await page.screenshot({ path: `${SHOTS}/booked-legs-${size.name}.png`, fullPage: true });

    // Hand it over: the flight and its price have to survive into the trip.
    await page.locator('.guide-next', { hasText: /arrange/i }).last().click();
    await page.locator('.trip-sheet').waitFor({ timeout: 30000 });
    await page.waitForTimeout(2000);
    const itin = await page.evaluate(() => ({
      legs: [...document.querySelectorAll('.itin-leg, .trip-leg')].map((e) => e.textContent.trim()),
      sheet: (document.querySelector('.trip-sheet') || {}).textContent || '',
    }));
    console.log(`${size.name}: itinerary`, JSON.stringify(itin.legs.slice(0, 3)));
    if (!/184/.test(itin.sheet)) fail(`${size.name}: the fare entered for the crossing never reached the trip`);
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
