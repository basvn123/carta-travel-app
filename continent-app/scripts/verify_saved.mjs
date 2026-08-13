// Headless look at the redesigned Saved-trips panel, in the states reachable
// without an account:
//   1. Fresh device: segmented Favorites / Planned tabs, empty invitations.
//   2. Seeded day plans: one upcoming (card + mini map + caption) and one
//      finished (past record row + travel ledger), filed by their own dates.
//   3. Mobile width: no sideways scroll, both tabs.
// Run from inside continent-app/:  node scripts/verify_saved.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4191;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

// Reuse an already-running preview on this port; only spawn when nothing
// answers. (Not port 4190: it is on the fetch spec's blocked-port list.)
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

// Dates relative to today so the classification under test never goes stale:
// one plan safely finished, one safely ahead.
const iso = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const DAY_PLANS = [
  { id: 'v1', label: 'Bruges', startDate: iso(-10), stops: [{ destinationId: 'gem:bruges', days: 2 }] },
  {
    id: 'v2',
    label: 'Lisbon and Porto',
    startDate: iso(28),
    stops: [{ destinationId: 'LIS', days: 3 }, { destinationId: 'OPO', days: 2 }],
  },
];

const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };

// Past the entry gate and any first-run coach marks, into the app proper.
const enterApp = async (page) => {
  try {
    await page.getByRole('button', { name: 'Continue without an account' }).click({ timeout: 12000 });
  } catch { /* auth not configured in this build */ }
  for (const label of ['Explore the map', 'Open the app', 'Got it']) {
    try { await page.getByRole('button', { name: label }).first().click({ timeout: 3000 }); } catch { /* not shown */ }
  }
  await page.waitForTimeout(600);
};

// "Saved" lives in the header on desktop ("Saved trips") and in the bottom
// nav on mobile ("My trips").
const openSaved = async (page) => {
  const btn = page.locator('.header-nav-item, .bottom-nav-item')
    .filter({ hasText: /^(Saved trips|My trips)$/ }).locator('visible=true').first();
  await btn.waitFor({ timeout: 25000 });
  await btn.click();
  await page.locator('.saved-trips-panel').waitFor({ timeout: 10000 });
  await page.waitForTimeout(600);
};

const pickTab = async (page, which) => {
  await page.locator('.saved-tabs button').nth(which === 'favorites' ? 0 : 1).click();
  await page.waitForTimeout(400);
};

try {
  await waitForServer();
  const browser = await chromium.launch();

  // ---- 1. Fresh device: tabs up top, invitations instead of dead ends.
  const empty = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await empty.goto(BASE);
  await enterApp(empty);
  await openSaved(empty);
  const tabs = await empty.locator('.saved-tabs button').count();
  if (tabs !== 2) fail(`expected 2 segmented tabs, got ${tabs}`);
  const dashed = await empty.evaluate(() => [...document.querySelectorAll('.saved-empty')]
    .map((el) => getComputedStyle(el).borderStyle).filter((s) => s.includes('dashed')).length);
  if (dashed) fail(`${dashed} empty state(s) still drawn with a dashed border`);
  const plannedEmpties = await empty.locator('.saved-empty').count();
  if (plannedEmpties < 1) fail('planned tab shows no empty invitation');
  // The mini map is always on: with nothing to pin it rests on Europe with
  // one quiet line underneath, never a missing section.
  await empty.locator('.saved-map .trip-map canvas').waitFor({ timeout: 15000 }).catch(() => fail('resting mini map never appeared on a fresh device'));
  if (!(await empty.locator('.saved-map-empty').count())) fail('empty map is missing its caption line');
  await empty.waitForTimeout(900);
  console.log('planned tab, fresh device: empty shelves =', plannedEmpties, '+ resting map');
  await empty.locator('.saved-trips-panel').screenshot({ path: `${SHOTS}/saved-empty-planned.png` });
  await pickTab(empty, 'favorites');
  const favEmpty = await empty.locator('.saved-empty').count();
  if (favEmpty !== 1) fail(`favorites tab should show exactly one state block, got ${favEmpty}`);
  await empty.locator('.saved-trips-panel').screenshot({ path: `${SHOTS}/saved-empty-favorites.png` });

  // ---- 2. Seeded day plans: the dates do the filing.
  const full = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await full.addInitScript((plans) => {
    localStorage.setItem('carta.savedTripsTab', 'planned');
    localStorage.setItem('carta.dayplans.v1', JSON.stringify(plans));
  }, DAY_PLANS);
  await full.goto(BASE);
  await enterApp(full);
  await openSaved(full);

  const upTitles = await full.locator('.saved-card .saved-card-title').allInnerTexts();
  if (upTitles.length !== 1 || !upTitles[0].includes('Lisbon')) {
    fail(`expected one upcoming day-plan card (Lisbon and Porto), got: ${JSON.stringify(upTitles)}`);
  }
  const pastTitles = await full.locator('.past-row-title').allInnerTexts();
  if (pastTitles.length !== 1 || !pastTitles[0].includes('Bruges')) {
    fail(`expected Bruges in the past record, got: ${JSON.stringify(pastTitles)}`);
  }
  // The mini map pins the upcoming trip and the caption names it.
  await full.locator('.saved-map .trip-map canvas').waitFor({ timeout: 15000 }).catch(() => fail('mini map canvas never appeared'));
  const caption = (await full.locator('.saved-map-caption').innerText().catch(() => '')).replace(/\s+/g, ' ');
  if (!/Lisbon/i.test(caption)) fail(`map caption does not name the next trip: "${caption}"`);
  console.log('caption:', caption);
  // The ledger adds up the finished plan: 1 country, 1 city, signed out.
  const ledgerNums = await full.locator('.saved-ledger-num').allInnerTexts();
  if (ledgerNums.length !== 2) fail(`expected 2 ledger tiles, got ${ledgerNums.length}`);
  console.log('ledger:', ledgerNums.map((s) => s.replace(/\s+/g, ' ')));
  await full.locator('.saved-ledger-tile').first().click();
  const chips = await full.locator('.saved-ledger-chip').count();
  if (chips < 1) fail('countries tile opened no chips');
  await full.waitForTimeout(700);
  await full.locator('.saved-trips-panel').screenshot({ path: `${SHOTS}/saved-planned-full.png` });

  // The card menu still opens, and Remove still asks first.
  await full.locator('.saved-card .saved-card-more').first().click();
  await full.locator('.saved-card-pop').waitFor({ timeout: 4000 });
  await full.locator('.saved-card-pop-item.danger').click();
  await full.locator('.saved-card-confirm').waitFor({ timeout: 4000 });
  await full.locator('.saved-trips-panel').screenshot({ path: `${SHOTS}/saved-confirm.png` });
  await full.locator('.saved-card-confirm-keep').click();
  if ((await full.locator('.saved-card .saved-card-title').count()) !== 1) fail('"Keep" did not put the card back');

  // ---- 2b. The account-only shapes, through the ?savedmock seam: the
  // favorites photo grid, the big upcoming trip card, and the past record.
  const mock = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await mock.addInitScript(() => localStorage.setItem('carta.savedTripsTab', 'planned'));
  await mock.goto(`${BASE}/?savedmock`);
  await enterApp(mock);
  await openSaved(mock);
  const upCards = await mock.locator('.uptrip-card').count();
  if (upCards !== 1) fail(`expected 1 upcoming trip card, got ${upCards}`);
  const upTitle = await mock.locator('.uptrip-title').innerText();
  if (!/Lisbon.*Porto/.test(upTitle)) fail(`upcoming card title unexpected: "${upTitle}"`);
  const chip = await mock.locator('.uptrip-when').innerText();
  if (!/In \d+ days/.test(chip)) fail(`countdown chip unexpected: "${chip}"`);
  const mockPast = await mock.locator('.past-row-title').allInnerTexts();
  if (!mockPast.some((s) => s.includes('Flanders'))) fail(`past record misses the finished plan: ${JSON.stringify(mockPast)}`);
  await mock.waitForTimeout(900);
  await mock.locator('.saved-trips-panel').screenshot({ path: `${SHOTS}/saved-mock-planned.png` });
  await pickTab(mock, 'favorites');
  const favs = await mock.locator('.fav-card').count();
  if (favs !== 3) fail(`expected 3 favorite cards, got ${favs}`);
  await mock.waitForTimeout(600);
  await mock.locator('.saved-trips-panel').screenshot({ path: `${SHOTS}/saved-mock-favorites.png` });
  // Letting a favorite go still asks first, in place.
  await mock.locator('.fav-card-mark').first().click();
  await mock.locator('.fav-card-ask').waitFor({ timeout: 4000 });
  await mock.locator('.saved-card-confirm-keep').first().click();
  if ((await mock.locator('.fav-card').count()) !== 3) fail('"Keep" removed the favorite anyway');

  // Mock seam, mobile width.
  const mockMob = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mockMob.addInitScript(() => localStorage.setItem('carta.savedTripsTab', 'planned'));
  await mockMob.goto(`${BASE}/?savedmock`);
  await enterApp(mockMob);
  await openSaved(mockMob);
  await mockMob.waitForTimeout(900);
  const mockOverflow = await mockMob.evaluate(() => {
    const p = document.querySelector('.saved-trips-panel');
    return p ? p.scrollWidth - p.clientWidth : -1;
  });
  if (mockOverflow > 1) fail(`mock panel scrolls sideways on mobile by ${mockOverflow}px`);
  await mockMob.screenshot({ path: `${SHOTS}/saved-mock-mobile-planned.png` });
  await pickTab(mockMob, 'favorites');
  await mockMob.waitForTimeout(500);
  await mockMob.screenshot({ path: `${SHOTS}/saved-mock-mobile-favorites.png` });

  // ---- 3. Mobile width, both tabs, no sideways scroll.
  const mob = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mob.addInitScript((plans) => {
    localStorage.setItem('carta.savedTripsTab', 'planned');
    localStorage.setItem('carta.dayplans.v1', JSON.stringify(plans));
  }, DAY_PLANS);
  await mob.goto(BASE);
  await enterApp(mob);
  await openSaved(mob);
  await mob.waitForTimeout(900);
  const overflow = await mob.evaluate(() => {
    const p = document.querySelector('.saved-trips-panel');
    return p ? p.scrollWidth - p.clientWidth : -1;
  });
  if (overflow > 1) fail(`saved panel scrolls sideways on mobile by ${overflow}px`);
  await mob.screenshot({ path: `${SHOTS}/saved-mobile-planned.png` });
  await pickTab(mob, 'favorites');
  await mob.screenshot({ path: `${SHOTS}/saved-mobile-favorites.png` });

  await browser.close();
  console.log(process.exitCode ? 'done with failures' : 'all checks passed');
} finally {
  if (srv) srv.kill();
}
