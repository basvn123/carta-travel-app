// Headless look at the three-tab Saved-trips panel, in the states reachable
// without an account:
//   1. Fresh device: Favorites / Planned / Visited tabs, empty invitations.
//   2. Seeded day plans: one upcoming (card + mini map + caption) and one
//      finished (Visited tab: ledger cards + travel-record journey card).
//   3. The ?savedmock seam: favorites with flags and saved dates, the big
//      planned journey card, three visited cards, and no photo fallbacks,
//      every card must resolve an image through the fallback chain.
//   4. Mobile width: no sideways scroll, all three tabs.
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
const ok = (msg) => console.log('  ok:', msg);

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

const TAB_INDEX = { favorites: 0, planned: 1, visited: 2 };
const pickTab = async (page, which) => {
  await page.locator('.saved-tabs button').nth(TAB_INDEX[which]).click();
  await page.waitForTimeout(400);
};

try {
  await waitForServer();
  const browser = await chromium.launch();

  // ---- 1. Fresh device: three tabs up top, invitations instead of dead ends.
  const empty = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await empty.goto(BASE);
  await enterApp(empty);
  await openSaved(empty);
  const tabs = await empty.locator('.saved-tabs button').count();
  if (tabs !== 3) fail(`expected 3 segmented tabs, got ${tabs}`);
  const dashed = await empty.evaluate(() => [...document.querySelectorAll('.saved-empty')]
    .map((el) => getComputedStyle(el).borderStyle).filter((s) => s.includes('dashed')).length);
  if (dashed) fail(`${dashed} empty state(s) still drawn with a dashed border`);
  const plannedEmpties = await empty.locator('.saved-empty').count();
  if (plannedEmpties < 1) fail('planned tab shows no empty invitation');
  // The map belongs to the record now: nothing on Planned, and nothing on an
  // empty Visited tab either (a map of no visits says nothing).
  if (await empty.locator('.saved-map').count()) fail('planned tab still carries the mini map');
  await empty.waitForTimeout(900);
  console.log('planned tab, fresh device: empty shelves =', plannedEmpties);
  await empty.locator('.saved-trips-panel').screenshot({ path: `${SHOTS}/saved-empty-planned.png` });
  await pickTab(empty, 'favorites');
  const favEmpty = await empty.locator('.saved-empty').count();
  if (favEmpty !== 1) fail(`favorites tab should show exactly one state block, got ${favEmpty}`);
  await empty.locator('.saved-trips-panel').screenshot({ path: `${SHOTS}/saved-empty-favorites.png` });
  await pickTab(empty, 'visited');
  const visEmpty = await empty.locator('.saved-empty').count();
  if (visEmpty !== 1) fail(`visited tab should show exactly one state block, got ${visEmpty}`);
  if (await empty.locator('.ledger2').count()) fail('empty visited tab should not show a zeroed ledger');
  if (await empty.locator('.saved-map').count()) fail('empty visited tab should not show a map of nothing');
  await empty.locator('.saved-trips-panel').screenshot({ path: `${SHOTS}/saved-empty-visited.png` });

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
  if (await full.locator('.saved-map').count()) fail('planned tab still carries the mini map');
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

  // Visited tab: the finished Bruges day plan became a journey card, and the
  // ledger adds it up: 1 European country out of the whole flag catalogue.
  await pickTab(full, 'visited');
  const visCards = await full.locator('.uptrip-card.is-visited').count();
  if (visCards !== 1) fail(`expected 1 visited journey card, got ${visCards}`);
  const visTitle = await full.locator('.uptrip-card.is-visited .uptrip-title').innerText();
  if (!/Belgium|Bruges/.test(visTitle)) fail(`visited card title unexpected: "${visTitle}"`);
  // The record's own map: Bruges pinned, Belgium painted.
  await full.locator('.saved-map .trip-map canvas').waitFor({ timeout: 15000 }).catch(() => fail('record map canvas never appeared'));
  // Pins are drawn on the style's load event, which is a network round trip
  // after the canvas exists.
  await full.locator('.saved-map .trip-pin').first().waitFor({ timeout: 20000 }).catch(() => fail('record map never drew a pin'));
  const visPins = await full.locator('.saved-map .trip-pin.trip-pin-plain').count();
  if (visPins < 1) fail(`record map pinned nothing, got ${visPins} pins`);
  const numbered = await full.locator('.saved-map .trip-pin-no').allInnerTexts();
  if (numbered.some((s) => s.trim())) fail(`record pins should carry no numbers: ${JSON.stringify(numbered)}`);
  const shapesRes = await full.evaluate(() => fetch('/country_shapes.json').then((r) => r.ok));
  if (!shapesRes) fail('country_shapes.json is not being served');
  const ledgerNums = await full.locator('.ledger2-num').allInnerTexts();
  if (ledgerNums.length !== 2) fail(`expected 2 ledger cards, got ${ledgerNums.length}`);
  if (!/1\s*\/\s*43/.test(ledgerNums[0].replace(/\s+/g, ' '))) {
    fail(`countries ledger should read 1 / 43, got "${ledgerNums[0]}"`);
  }
  console.log('ledger:', ledgerNums.map((s) => s.replace(/\s+/g, ' ')));
  const flagItems = await full.locator('.ledger2-flagitem').count();
  if (flagItems < 1) fail('countries ledger shows no flag');
  await full.waitForTimeout(700);
  await full.locator('.saved-trips-panel').screenshot({ path: `${SHOTS}/saved-visited-full.png` });

  // ---- 3b. The record, next to what friends have shown you.
  //
  // Every number here comes from trips a friend already chose to show, so the
  // block must never read as a ranking: a friend who has seen thirty countries
  // and shares one trip appears as one, and presenting that as a score would
  // turn a private choice into public pressure.
  const compare = async (page) => {
    const led = page.locator('.fledger');
    if (!await led.count()) { fail('no friend comparison on the Visited tab'); return; }
    const text = await led.innerText();
    if (!/Sofie Vermeulen/.test(text) || !/Jonas Peeters/.test(text)) {
      fail(`the comparison does not name both friends: ${text}`);
    } else ok('the comparison lists each friend once, not each trip');
    // Sofie shows Portugal and Austria, Jonas shows Italy, so the rows are 2
    // and 1 and Sofie sorts first.
    const nums = await led.locator('.fledger-row:not(.is-legend) .fledger-num').allInnerTexts();
    const countries = nums.filter((_, i) => i % 2 === 0);
    if (countries[1] !== '2' || countries[2] !== '1') {
      fail(`friend country counts are wrong or unsorted: ${JSON.stringify(countries)}`);
    } else ok('counts are per friend, deduped across their trips, most first');
    if (!/not a ranking/i.test(text)) {
      fail('the comparison does not say it is not a ranking');
    } else ok('and it says plainly that it is not a ranking');
  };

  // ---- 3. The account-only shapes, through the ?savedmock seam.
  const mock = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await mock.addInitScript(() => localStorage.setItem('carta.savedTripsTab', 'planned'));
  await mock.goto(`${BASE}/?savedmock`);
  await enterApp(mock);
  await openSaved(mock);
  const upCards = await mock.locator('.uptrip-card:not(.is-foreign)').count();
  if (upCards !== 1) fail(`expected 1 upcoming trip card, got ${upCards}`);
  const upTitle = await mock.locator('.uptrip-card:not(.is-foreign) .uptrip-title').innerText();
  const upSub = await mock.locator('.uptrip-card:not(.is-foreign) .uptrip-sub').innerText().catch(() => '');
  if (!/Portugal/.test(upTitle)) fail(`upcoming card should headline the country, got "${upTitle}"`);
  if (!/Lisbon.*Porto/.test(upSub)) fail(`upcoming card cities line unexpected: "${upSub}"`);
  const chip = await mock.locator('.uptrip-card:not(.is-foreign) .uptrip-when').innerText();
  if (!/In \d+ days/.test(chip)) fail(`countdown chip unexpected: "${chip}"`);
  if (!(await mock.locator('.uptrip-card:not(.is-foreign) .uptrip-flag').count())) fail('upcoming card is missing its corner flag badge');
  if (!(await mock.locator('.uptrip-card:not(.is-foreign) .uptrip-datelabel').count())) fail('upcoming card is missing its Dates label');
  await mock.waitForTimeout(900);
  await mock.locator('.saved-trips-panel').screenshot({ path: `${SHOTS}/saved-mock-planned.png` });

  // Visited tab: three finished mock trips, ledger at 3 countries.
  await pickTab(mock, 'visited');
  const mockVis = await mock.locator('.uptrip-card.is-visited').count();
  if (mockVis !== 3) fail(`expected 3 visited journey cards, got ${mockVis}`);
  const mockVisTitles = await mock.locator('.uptrip-card.is-visited .uptrip-title').allInnerTexts();
  if (!mockVisTitles.some((s) => s.includes('Flanders'))) fail(`visited record misses the labelled plan: ${JSON.stringify(mockVisTitles)}`);
  if (!mockVisTitles.some((s) => /Austria|Salzburg/.test(s))) fail(`visited record misses Salzburg: ${JSON.stringify(mockVisTitles)}`);
  const mockLedger = await mock.locator('.ledger2-num').allInnerTexts();
  if (!/3\s*\/\s*43/.test((mockLedger[0] || '').replace(/\s+/g, ' '))) {
    fail(`mock countries ledger should read 3 / 43, got "${mockLedger[0]}"`);
  }
  await compare(mock);
  const mockFlagNames = await mock.locator('.ledger2-flagname').allInnerTexts();
  for (const c of ['Austria', 'Belgium', 'Germany']) {
    if (!mockFlagNames.includes(c)) fail(`ledger flags miss ${c}: ${JSON.stringify(mockFlagNames)}`);
  }
  // The record map carries a pin per visited city, three countries painted.
  await mock.locator('.saved-map .trip-map canvas').waitFor({ timeout: 15000 }).catch(() => fail('mock record map never appeared'));
  await mock.locator('.saved-map .trip-pin').first().waitFor({ timeout: 20000 }).catch(() => fail('mock record map never drew a pin'));
  const mockPins = await mock.locator('.saved-map .trip-pin').count();
  if (mockPins < 3) fail(`mock record map should pin every visited city, got ${mockPins}`);

  // The map is explorable: +/- buttons, and the wheel scrolls the page until
  // ctrl is held (it says so).
  if (!(await mock.locator('.saved-map .maplibregl-ctrl-zoom-in').count())) fail('record map has no zoom controls');
  const mapBox = await mock.locator('.saved-map').boundingBox();
  await mock.mouse.move(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
  await mock.mouse.wheel(0, -200);
  await mock.waitForTimeout(400);
  const gestureHint = await mock.locator('.maplibregl-cooperative-gesture-screen').innerText().catch(() => '');
  if (!/ctrl/i.test(gestureHint)) fail(`plain wheel over the map should explain itself, got "${gestureHint}"`);

  // Every pin carries the city's photo, revealed one zoom step past the frame.
  const photos = await mock.locator('.saved-map .trip-pin-photo').evaluateAll(
    (els) => els.map((e) => getComputedStyle(e).backgroundImage));
  if (photos.length !== mockPins) fail(`expected a photo on each of ${mockPins} pins, got ${photos.length}`);
  if (photos.some((b) => !/^url\(/.test(b))) fail(`a record pin has no photo: ${JSON.stringify(photos)}`);
  if (await mock.locator('.saved-map .trip-map.pins-photo').count()) fail('photos should be hidden at the opening frame');
  await mock.locator('.saved-map .maplibregl-ctrl-zoom-in').click();
  await mock.waitForTimeout(1100);
  if (!(await mock.locator('.saved-map .trip-map.pins-photo').count())) fail('one zoom step in should reveal the photo pins');
  const pinNames = await mock.locator('.saved-map .trip-pin-label').allInnerTexts();
  for (const c of ['Munich', 'Salzburg', 'Bruges']) {
    if (!pinNames.includes(c)) fail(`photo pins miss ${c}: ${JSON.stringify(pinNames)}`);
  }
  await mock.waitForTimeout(600);
  await mock.locator('.saved-map').screenshot({ path: `${SHOTS}/saved-record-photopins.png` });
  await mock.locator('.saved-map .maplibregl-ctrl-zoom-out').click();
  await mock.waitForTimeout(900);
  // Every visited card must resolve a photo through the fallback chain.
  const visFallbacks = await mock.locator('.uptrip-photo.is-fallback').count();
  if (visFallbacks) fail(`${visFallbacks} visited card(s) fell back to an icon instead of a photo`);
  await mock.waitForTimeout(700);
  await mock.locator('.saved-trips-panel').screenshot({ path: `${SHOTS}/saved-mock-visited.png` });

  // Favorites: photo grid with flags, kind tags and saved dates.
  await pickTab(mock, 'favorites');
  const favs = await mock.locator('.fav-card').count();
  if (favs !== 3) fail(`expected 3 favorite cards, got ${favs}`);
  const favFallbacks = await mock.locator('.fav-card-photo.is-fallback').count();
  if (favFallbacks) fail(`${favFallbacks} favorite(s) fell back to an icon instead of a photo`);
  if ((await mock.locator('.fav-card-flag').count()) !== 3) fail('favorite cards are missing corner flags');
  if ((await mock.locator('.fav-card-savedon').count()) !== 3) fail('favorite cards are missing their saved dates');
  await mock.waitForTimeout(600);
  await mock.locator('.saved-trips-panel').screenshot({ path: `${SHOTS}/saved-mock-favorites.png` });
  // Letting a favorite go still asks first, in place.
  await mock.locator('.fav-card-mark').first().click();
  await mock.locator('.fav-card-ask').waitFor({ timeout: 4000 });
  await mock.locator('.saved-card-confirm-keep').first().click();
  if ((await mock.locator('.fav-card').count()) !== 3) fail('"Keep" removed the favorite anyway');

  // Mock seam, mobile width, all three tabs, no sideways scroll.
  const mockMob = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mockMob.addInitScript(() => localStorage.setItem('carta.savedTripsTab', 'planned'));
  await mockMob.goto(`${BASE}/?savedmock`);
  await enterApp(mockMob);
  await openSaved(mockMob);
  await mockMob.waitForTimeout(900);
  for (const which of ['planned', 'visited', 'favorites']) {
    await pickTab(mockMob, which);
    const overflow = await mockMob.evaluate(() => {
      const p = document.querySelector('.saved-trips-panel');
      return p ? p.scrollWidth - p.clientWidth : -1;
    });
    if (overflow > 1) fail(`mock ${which} tab scrolls sideways on mobile by ${overflow}px`);
    await mockMob.screenshot({ path: `${SHOTS}/saved-mock-mobile-${which}.png` });
  }

  // ---- 4. Seeded day plans, mobile width.
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
  await pickTab(mob, 'visited');
  await mob.screenshot({ path: `${SHOTS}/saved-mobile-visited.png` });

  await browser.close();
  console.log(process.exitCode ? 'done with failures' : 'all checks passed');
} finally {
  if (srv) srv.kill();
}
