// Headless check of My trips (rebuilt in T434: Trips, Shortlist, Visited on
// the kit). What it walks:
//   1. Fresh device, desktop: three section tiles in the side panel wired to
//      one tabpanel; the selected tile wears the light select tint, never a
//      dark fill; each empty tab is one line and one way forward, no map.
//   2. Seeded day plans: the upcoming one is a row on Trips, Remove runs at
//      once with Undo; the finished one is on Visited with the map, a pin and
//      the figures band.
//   3. The ?savedmock seam: the next trip is the one focal card with its
//      countdown and its price for the party, marked as an estimate; a later
//      trip is a row; the statement of reasons still opens and contests; the
//      record runs by year with a year filter; the shortlist prices like
//      Explore and offers "Plan a trip"; countries can be marked by hand.
//   4. Phone width: no sideways scroll on any tab, 44 px tiles, nothing
//      functional under 11 px and no figure under 12 px.
// Run from inside continent-app/:  node scripts/verify_saved.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = Number(process.env.CARTA_PORT) || 4191;
const BASE = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;
const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

const isUp = async () => {
  try { return (await fetch(BASE)).ok; } catch { return false; }
};
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

const iso = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const DAY_PLANS = [
  { id: 'v1', label: 'Bruges', startDate: iso(-10), stops: [{ destinationId: 'gem:bruges', days: 2 }] },
  { id: 'v2', label: 'Lisbon and Porto', startDate: iso(28), stops: [{ destinationId: 'LIS', days: 3 }, { destinationId: 'OPO', days: 2 }] },
];

const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };
const ok = (msg) => console.log('  ok:', msg);

const enterApp = async (page) => {
  try { await page.getByRole('button', { name: 'Continue without an account' }).click({ timeout: 12000 }); } catch { /* no gate */ }
  for (const label of ['Explore the map', 'Open the app', 'Got it']) {
    try { await page.getByRole('button', { name: label }).first().click({ timeout: 2500 }); } catch { /* not shown */ }
  }
  await page.waitForTimeout(500);
};
const openSaved = async (page) => {
  const btn = page.locator('.header-nav-item, .bottom-nav-item').filter({ hasText: /^(Saved trips|My trips)$/ }).locator('visible=true').first();
  await btn.waitFor({ timeout: 25000 });
  await btn.click();
  await page.locator('.mytrips .saved-trips-panel').waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
};
// The section tiles are drawn twice (side panel on desktop, under the title
// on a phone); :visible picks whichever this width shows.
const tab = (page, name) => page.locator('[role="tab"]:visible').filter({ hasText: name }).first();
const pick = async (page, name) => { await tab(page, name).click(); await page.waitForTimeout(500); };

// Text sizes: nothing functional under 11 px, no figure under 12 px.
const smallText = (page) => page.evaluate(() => {
  const root = document.querySelector('.mytrips');
  const bad = [];
  root?.querySelectorAll('*').forEach((el) => {
    if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const px = parseFloat(getComputedStyle(el).fontSize);
    const txt = el.textContent.trim();
    if (px < 11 || (/\d/.test(txt) && px < 12)) bad.push(`${txt.slice(0, 24)} ${px}px`);
  });
  return bad;
});

try {
  await waitForServer();
  const browser = await chromium.launch();

  // ---- 1. Fresh device, desktop ----
  console.log('1. fresh device');
  const ctx1 = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const empty = await ctx1.newPage();
  await empty.addInitScript(() => localStorage.setItem('continent.homeSeen.v1', '1'));
  await empty.goto(BASE);
  await enterApp(empty);
  await openSaved(empty);
  const tabs = await empty.locator('.saved-side [role="tab"]').count();
  if (tabs !== 3) fail(`expected 3 section tiles in the side panel, got ${tabs}`);
  const controls = await empty.locator('.saved-side [role="tab"]').first().getAttribute('aria-controls');
  if (!controls || !(await empty.locator(`#${controls}[role="tabpanel"]`).count())) fail('the section tiles do not point at a tabpanel');
  const onBg = await empty.locator('.saved-side [role="tab"][aria-selected="true"]').evaluate((el) => getComputedStyle(el).backgroundColor);
  const tint = await empty.evaluate(() => { const p = document.createElement('div'); p.style.background = 'var(--select-bg)'; document.body.appendChild(p); const c = getComputedStyle(p).backgroundColor; p.remove(); return c; });
  if (onBg !== tint) fail(`the selected section is ${onBg}, not the --select-bg tint ${tint}`);
  if (!(await empty.locator('.mt-empty').count())) fail('Trips shows no empty line');
  if (!(await empty.getByRole('button', { name: 'Plan a trip' }).count())) fail('the empty Trips tab offers no "Plan a trip"');
  const caption = await empty.locator('.mytrips').innerText();
  if (/find them back|stays on this device|Shape a day/i.test(caption)) fail('a retired caption is still on the page');
  await empty.locator('.mytrips').screenshot({ path: `${SHOTS}/saved-empty-trips.png` });
  await pick(empty, 'Shortlist');
  if ((await empty.locator('.mt-empty').count()) !== 1) fail('the empty Shortlist should be one line');
  await pick(empty, 'Visited');
  if (await empty.locator('.mt-map').count()) fail('an empty record should not draw a map of nothing');
  if (await empty.locator('.mt-band').count()) fail('an empty record should not show a zeroed figures band');
  ok('fresh device: tiles, tabpanel, tint, one-line empties');
  await ctx1.close();

  // ---- 2. Seeded day plans ----
  console.log('2. seeded day plans');
  const ctx2 = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const full = await ctx2.newPage();
  await full.addInitScript((plans) => {
    localStorage.setItem('continent.homeSeen.v1', '1');
    localStorage.setItem('carta.savedTripsTab', 'planned');
    localStorage.setItem('carta.dayplans.v1', JSON.stringify(plans));
  }, DAY_PLANS);
  await full.goto(BASE);
  await enterApp(full);
  await openSaved(full);
  const rowTitles = await full.locator('.mt-row .card-title').allInnerTexts();
  if (!rowTitles.some((s) => /Lisbon and Porto/.test(s))) fail(`the upcoming day plan is not a row: ${JSON.stringify(rowTitles)}`);
  await full.locator('.mt-row .mt-menu button').first().click();
  await full.locator('.mt-menu-item.is-danger').click();
  await full.locator('.undo-toast').waitFor({ timeout: 4000 });
  if ((await full.locator('.mt-row .card-title').filter({ hasText: 'Lisbon and Porto' }).count())) fail('Remove left the day plan on the list');
  await full.locator('.undo-toast').getByRole('button', { name: 'Undo' }).click();
  if (!(await full.locator('.mt-row .card-title').filter({ hasText: 'Lisbon and Porto' }).count())) fail('"Undo" did not put the day plan back');
  await pick(full, 'Visited');
  const past = await full.locator('.mt-year .mt-row .card-title').allInnerTexts();
  if (!past.some((s) => /Belgium|Bruges/.test(s))) fail(`the finished day plan is not on the record: ${JSON.stringify(past)}`);
  await full.locator('.mt-map canvas').waitFor({ timeout: 20000 }).catch(() => fail('record map canvas never appeared'));
  await full.locator('.mt-map .trip-pin').first().waitFor({ timeout: 20000 }).catch(() => fail('record map never drew a pin'));
  const band = await full.locator('.mt-band dd').allInnerTexts();
  if (band[0] !== '1') fail(`the figures band should count 1 country, got ${JSON.stringify(band)}`);
  const hint = await full.locator('.maplibregl-cooperative-gesture-screen').count();
  if (hint) fail('the record map still asks for Ctrl to zoom');
  ok('seeded: day plan row with undo, record row, map with pin, band');
  await full.locator('.mytrips').screenshot({ path: `${SHOTS}/saved-visited-full.png` });
  await ctx2.close();

  // ---- 3. The mock seam ----
  console.log('3. ?savedmock');
  const ctx3 = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const mock = await ctx3.newPage();
  await mock.addInitScript(() => { localStorage.setItem('carta.savedTripsTab', 'planned'); localStorage.removeItem('carta.visitedCountries.v1'); });
  await mock.goto(`${BASE}/?savedmock`);
  await enterApp(mock);
  await openSaved(mock);
  if ((await mock.locator('.mt-hero').count()) !== 1) fail('the next trip is not the one focal card');
  const heroTitle = await mock.locator('.mt-hero-title').innerText();
  if (!/Portugal/.test(heroTitle)) fail(`the focal card should headline the country, got "${heroTitle}"`);
  if (!/Lisbon.*Porto/.test(await mock.locator('.mt-hero-sub').innerText())) fail('the focal card does not list its cities');
  const chip = await mock.locator('.mt-hero-top .ui-chip').first().innerText();
  if (!/In \d+ days/.test(chip)) fail(`countdown unexpected: "${chip}"`);
  const cost = await mock.locator('.mt-hero .mt-price').innerText().catch(() => '');
  if (!/^~.*est\..*for 2/.test(cost.replace(/\s+/g, ' '))) fail(`the trip cost should read "~€N est. for 2", got "${cost}"`);
  if (!/ to /.test(await mock.locator('.mt-hero-dates').innerText())) fail('the dates are not written "to"');
  const primaries = await mock.locator('.mt-panel .btn-primary:visible').count();
  if (primaries !== 1) fail(`Trips should have one primary, got ${primaries}`);
  if ((await mock.locator('#mt-later .mt-row, .mt-section:has(#mt-later) .mt-row').count()) !== 1) fail('the later trip is not one row');
  const onPhoto = await mock.locator('.mt-hero-media').evaluateAll((els) => els.filter((e) => e.innerText.trim()).length);
  if (onPhoto) fail('the focal photo carries text');
  await mock.locator('.mytrips').screenshot({ path: `${SHOTS}/saved-mock-trips.png` });

  // The statement of reasons under the trip still works.
  const note = mock.locator('.modnote').first();
  await note.waitFor({ timeout: 8000 }).catch(() => fail('the planned trip carries no statement of reasons'));
  if (await mock.locator('.modnote').count()) {
    const toggle = note.locator('.modnote-toggle').first();
    if (await toggle.getAttribute('aria-expanded') !== 'false') fail('the statement opens before it is asked for');
    await toggle.click();
    if (await toggle.getAttribute('aria-expanded') !== 'true') fail('the statement toggle does not open');
  }

  // Shortlist.
  await pick(mock, 'Shortlist');
  const shortRows = await mock.locator('.mt-panel .mt-row').count();
  if (shortRows !== 3) fail(`expected 3 shortlist rows, got ${shortRows}`);
  const prices = await mock.locator('.mt-panel .mt-row .xprice').allInnerTexts();
  if (prices.length < 1) fail('shortlist rows carry no day price');
  if (prices.some((p) => /national/i.test(p))) fail('a shortlist price still says "national"');
  if (!(await mock.getByRole('button', { name: /Plan a trip in Portugal/ }).count())) fail('the shortlist offers no "Plan a trip in Portugal"');
  await mock.locator('.mt-panel .mt-row').first().locator('button[aria-pressed="true"]').click();
  await mock.locator('.undo-toast').waitFor({ timeout: 4000 });
  if ((await mock.locator('.mt-panel .mt-row').count()) !== 2) fail('the bookmark did not let the place go');
  await mock.locator('.undo-toast').getByRole('button', { name: 'Undo' }).click();
  if ((await mock.locator('.mt-panel .mt-row').count()) !== 3) fail('"Undo" did not bring the place back');
  await mock.locator('.mytrips').screenshot({ path: `${SHOTS}/saved-mock-shortlist.png` });

  // Visited: years, the record, the map, countries by hand.
  await pick(mock, 'Visited');
  const years = await mock.locator('.saved-side .mt-chips [role="radio"]').allInnerTexts();
  if (years.length < 3) fail(`expected a year filter with at least two years, got ${JSON.stringify(years)}`);
  const recTitles = await mock.locator('.mt-year .card-title').allInnerTexts();
  if (!recTitles.some((s) => s.includes('Flanders'))) fail(`the record misses the labelled plan: ${JSON.stringify(recTitles)}`);
  if (!recTitles.some((s) => /Austria|Salzburg/.test(s))) fail(`the record misses Salzburg: ${JSON.stringify(recTitles)}`);
  await mock.locator('.mt-map .trip-pin').first().waitFor({ timeout: 20000 }).catch(() => fail('mock record map never drew a pin'));
  if ((await mock.locator('.mt-map .trip-pin').count()) < 3) fail('the record map should pin every visited city');
  const before = Number((await mock.locator('.mt-band dd').first().innerText()).trim());
  await mock.getByRole('button', { name: /^(Edit|Add countries)$/ }).click();
  const sheetChip = mock.locator('.mt-country-grid button', { hasText: 'Iceland' });
  await sheetChip.waitFor({ timeout: 5000 });
  if ((await mock.locator('.mt-country-grid button[disabled]').count()) < 3) fail('countries already on the record are not fixed in the sheet');
  await sheetChip.click();
  await mock.getByRole('button', { name: 'Done' }).click();
  await mock.waitForTimeout(300);
  const after = Number((await mock.locator('.mt-band dd').first().innerText()).trim());
  if (after !== before + 1) fail(`marking Iceland should add one country (${before} to ${after})`);
  if (!(await mock.locator('.mt-flag', { hasText: 'Iceland' }).count())) fail('Iceland is not among the flags');
  const y2025 = mock.locator('.saved-side .mt-chips [role="radio"]').filter({ hasText: /^20\d\d$/ }).last();
  await y2025.click();
  await mock.waitForTimeout(300);
  const filtered = await mock.locator('.mt-year').count();
  if (filtered !== 1) fail(`one year chosen should show one year group, got ${filtered}`);
  await mock.locator('.mytrips').screenshot({ path: `${SHOTS}/saved-mock-visited.png` });
  ok('mock: focal card priced for the party, row, statement, shortlist, years, countries by hand');
  await ctx3.close();

  // ---- 4. Phone ----
  console.log('4. phone');
  const ctx4 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mob = await ctx4.newPage();
  await mob.addInitScript((plans) => {
    localStorage.setItem('carta.savedTripsTab', 'planned');
    localStorage.setItem('carta.dayplans.v1', JSON.stringify(plans));
  }, DAY_PLANS);
  await mob.goto(`${BASE}/?savedmock`);
  await enterApp(mob);
  await openSaved(mob);
  for (const which of ['Trips', 'Shortlist', 'Visited']) {
    await pick(mob, which);
    const over = await mob.evaluate(() => document.querySelector('.saved-trips-panel').scrollWidth - document.querySelector('.saved-trips-panel').clientWidth);
    if (over > 1) fail(`${which} scrolls sideways on a phone by ${over}px`);
    const tileH = await tab(mob, which).evaluate((el) => el.getBoundingClientRect().height);
    if (tileH < 44) fail(`the ${which} tile is ${tileH}px tall`);
    const small = await smallText(mob);
    if (small.length) fail(`${which}: text under the floor: ${small.slice(0, 5).join(' | ')}`);
    await mob.screenshot({ path: `${SHOTS}/saved-mobile-${which.toLowerCase()}.png` });
  }
  ok('phone: no sideways scroll, 44 px tiles, text floors');
  await ctx4.close();

  await browser.close();
  console.log(process.exitCode ? 'done with failures' : 'all checks passed');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  if (srv) srv.kill();
}
