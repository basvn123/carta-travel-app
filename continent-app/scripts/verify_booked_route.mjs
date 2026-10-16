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
// BASE_URL points the walk at a running dev server (T458).
const BASE = (process.env.BASE_URL || `http://127.0.0.1:${PORT}`).replace(/\/$/, '');
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
  const card = page.locator('.wstays-add');
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
      localStorage.setItem('continent.homeSeen.v1', '1');
      localStorage.setItem('carta.fareNoticeSeen', '1');
      localStorage.setItem('carta.welcomeSeen', '1');
      localStorage.setItem('continent.onboardingSeen.v1', '1');
    });
    await page.goto(`${BASE}/?tab=trip&o=CRL&paymock`);

    // T432 made the booked question three kit tiles (travel, beds, nothing
    // yet) and T458 put Who before When, so with beds booked the flow is:
    // Booked, Who, When, Stays, Getting there, Finish.
    const tiles = page.locator('.wbook-tile');
    await tiles.first().waitFor({ timeout: 90000 });
    if (await tiles.count() !== 3) fail(`${size.name}: expected three booked tiles, got ${await tiles.count()}`);
    await page.locator('.wbook-tile', { hasText: /places to sleep/i }).click();
    await page.waitForTimeout(400);
    if (size.width >= 769) {
      const railNames = await page.locator('.wiz-step-name').allInnerTexts();
      if (railNames.length !== 6) fail(`${size.name}: expected six steps with stays booked, got ${railNames.length} (${railNames.join(', ')})`);
      if (railNames.some((x) => /^where$/i.test(x.trim()))) fail(`${size.name}: the country step is still on the rail`);
    } else {
      const mini = await page.locator('.wiz-mini-now').innerText().catch(() => '');
      if (!/of 6/.test(mini)) fail(`${size.name}: expected six steps with stays booked (${mini})`);
    }
    for (let i = 0; i < 2; i += 1) {
      await page.locator('.guide-next:visible').first().click();
      await page.waitForTimeout(900);
    }

    // A date range, then on to the stays.
    const days = page.locator('.cal-day:not(.outside):not(.disabled)');
    await days.nth(2).click();
    await page.waitForTimeout(300);
    await days.nth(8).click();
    await page.waitForTimeout(400);
    await page.locator('.guide-next:visible').first().click();
    await page.locator('.wstays-add').waitFor({ timeout: 30000 });

    // Two Italian stops and one across the water, so the no-road hop is
    // exercised too.
    const a = await addStop(page, 'Naples');
    const b = await addStop(page, 'Bari');
    const c = await addStop(page, 'Dubrovnik');
    console.log(`${size.name}: stops`, a, b, c);

    const shape = await page.evaluate(() => ({
      stops: document.querySelectorAll('.wstay').length,
      indexes: [...document.querySelectorAll('.wstay-index')].map((e) => e.textContent),
      ranges: [...document.querySelectorAll('.wstay-sub')].map((e) => e.textContent.trim()),
      steppers: document.querySelectorAll('.wstay .fstepper').length,
      finds: [...document.querySelectorAll('.wstay a.wrev-find')].map((e) => e.getAttribute('href')),
    }));
    console.log(`${size.name}:`, JSON.stringify({ ...shape, finds: shape.finds.length }));
    if (shape.stops !== 3) fail(`${size.name}: expected 3 stay cards, got ${shape.stops}`);
    if (shape.indexes.join(',') !== '1,2,3') fail(`${size.name}: stop numbering is ${shape.indexes}`);
    if (shape.steppers !== 3) fail(`${size.name}: every stay needs the kit stepper (${shape.steppers})`);
    // Dates chain: each stay starts the day the one before it ends.
    const pairs = shape.ranges.map((r) => r.split(' to '));
    if (pairs.some((p) => p.length !== 2)) fail(`${size.name}: a stay is missing its dates (${shape.ranges})`);
    for (let i = 1; i < pairs.length; i += 1) {
      if (pairs[i][0] !== pairs[i - 1][1]) fail(`${size.name}: stay ${i + 1} does not start when stay ${i} ends (${shape.ranges})`);
    }
    // "Find a place" carries the stay's own dates and the party.
    if (shape.finds.length !== 3) fail(`${size.name}: expected a find link on each unpaid stay, got ${shape.finds.length}`);
    if (shape.finds[0] && !/checkin=\d{4}-\d{2}-\d{2}.*checkout=/.test(shape.finds[0])) fail(`${size.name}: the find link lacks dates (${shape.finds[0]})`);
    await page.screenshot({ path: `${SHOTS}/booked-stays-${size.name}.png`, fullPage: true });

    // The stepper moves the nights, and every later stay moves with it.
    const firstStay = page.locator('.wstay').first();
    await firstStay.locator('.fstepper-btn').nth(1).click();
    await page.waitForTimeout(400);
    const moved = await page.locator('.wstay-sub').nth(1).textContent();
    if (moved.trim() === shape.ranges[1]) fail(`${size.name}: adding a night did not move the next stay (${moved})`);

    // A price paid for a bed replaces the estimate and hides the find link.
    await firstStay.locator('.plan-paid-add').click();
    const bed = firstStay.locator('.plan-paid-input');
    await bed.fill('210');
    await bed.press('Enter');
    await page.waitForTimeout(400);
    if (await firstStay.locator('a.wrev-find').count()) fail(`${size.name}: a paid stay still offers to find a place`);

    // Taking a stop out removes its card.
    await page.locator('.wstay-remove').last().click();
    await page.waitForTimeout(500);
    if (await page.locator('.wstay').count() !== 2) fail(`${size.name}: removing a stop did not remove its card`);
    await addStop(page, 'Dubrovnik');

    // On to Getting there: one leg per hop, plus the way there and home.
    await page.locator('.guide-next:visible').first().click();
    await page.locator('.tlegs').waitFor({ timeout: 30000 });
    const legs = await page.locator('.tleg').count();
    if (legs !== 4) fail(`${size.name}: expected four legs (out, two hops, home), got ${legs}`);

    // The sea crossing: name it a flight and say what it cost.
    const seaLeg = page.locator('.tleg', { hasText: /Dubrovnik/i }).first();
    const seaHead = seaLeg.locator('.tleg-head');
    if ((await seaHead.getAttribute('aria-expanded')) !== 'true') await seaHead.click();
    await seaLeg.locator('.tleg-mode', { hasText: /^flight$/i }).click();
    const fare = seaLeg.locator('.plan-paid-input');
    await fare.fill('184');
    await fare.press('Enter');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/booked-legs-${size.name}.png`, fullPage: true });

    // Hand it over: the flight, its price and the bed price survive into the trip.
    await page.locator('.guide-next:visible').first().click();
    await page.waitForTimeout(1500);
    await page.locator('.guide-next:visible').first().click();
    await page.locator('.trip-planner-screen.is-planned').waitFor({ timeout: 30000 });
    await page.waitForTimeout(2000);
    const sheet = await page.locator('.trip-planner-screen').innerText();
    if (!/184/.test(sheet)) fail(`${size.name}: the fare entered for the crossing never reached the trip`);
    if (!/210/.test(sheet)) fail(`${size.name}: the bed price never reached the trip`);
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
