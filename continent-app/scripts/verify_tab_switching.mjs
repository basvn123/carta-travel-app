// Headless verify for the section switch: Destinations | Explore | Trip
// planner | Day planner | Saved trips in the desktop header, and the five-slot
// bottom bar on a phone.
//
//   node scripts/verify_tab_switching.mjs [url]     (default http://localhost:4173)
//
// The contract this asserts, on both widths:
//   1. Pressing a section lands on that section and hides every other one.
//   2. Nothing from the last section is left standing over the new one. The
//      account page and My trips are full-height pages below the bar (z 56),
//      so a switch that left one open showed the wrong screen under the right
//      underline. The Lifestyle drawer goes with them.
//   3. The bar marks what is actually on screen: a page laid over a tab takes
//      the active state away from that tab, and the account door wears it.
//   4. The doors are doors both ways: a second press on Account or My trips
//      closes what it opened.
//   5. The tabs stay reachable. The Lifestyle scrim covered the whole window
//      and out-ranked the bar, so a tab press was swallowed by the scrim.
//   6. Keep-alive holds: scroll position and the header's search field survive
//      a hop away and back, and the bar's scrollbar gutter (--sbw) does not
//      change width when a planner (which has no scrolling panel) is showing.

import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:4173/';
const browser = await chromium.launch();
const checks = [];
const errors = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });

// The emrldtp affiliate loader always fails offline (accepted risk), and the
// weather calls are rate-capped. Neither says anything about the section
// switch, so neither is a regression signal here.
const NOISE = /emrldtp|ERR_FAILED|config is not valid|open-meteo/;

const SEED = () => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
  } catch { /* storage unavailable */ }
};

// One reading of what is actually on screen. `.saved-trips-panel` borrows the
// `.account-panel` class for its styling, so the account page has to be
// matched with that one excluded or My trips reads as both.
const READ = () => {
  const shown = (s) => {
    const e = document.querySelector(s);
    if (!e) return false;
    const r = e.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  };
  return {
    places: shown('.places-tab'),
    explore: shown('.explore-tab'),
    trip: shown('.trip-planner-screen:not(.day-flow-screen)'),
    day: shown('.day-flow-screen'),
    account: !!document.querySelector('.account-panel:not(.saved-trips-panel)'),
    saved: !!document.querySelector('.saved-trips-panel'),
    lifestyle: !!document.querySelector('.lifestyle-panel'),
    hdrActive: [...document.querySelectorAll('.header-nav-item.active')].map((b) => b.title).join(','),
    avatarOn: !!document.querySelector('.account-avatar-btn.on'),
    tab: new URLSearchParams(location.search).get('tab') || 'map',
    sbw: getComputedStyle(document.documentElement).getPropertyValue('--sbw').trim(),
    slotInputs: document.getElementById('header-search-slot')?.querySelectorAll('input').length ?? -1,
    placesScroll: document.querySelector('.places-tab')?.scrollTop ?? null,
  };
};

async function open(viewport) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
  page.on('console', (m) => {
    if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 120));
  });
  await page.addInitScript(SEED);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  return page;
}

// Exactly one section body on screen, and it is the one asked for.
const only = (s, key) => ['places', 'explore', 'trip', 'day'].every((k) => s[k] === (k === key));

/* ─────────────────────────── desktop ─────────────────────────── */
{
  const page = await open({ width: 1440, height: 900 });
  const read = () => page.evaluate(READ);
  const nav = (title) => page.locator(`.header-nav-item[title="${title}"]`).click();
  const TABS = [
    ['Destinations', 'places', 'places'],
    ['Explore', 'explore', 'map'],
    ['Trip planner', 'trip', 'trip'],
    ['Day planner', 'day', 'day'],
  ];

  const boot = await read();
  check('the app opens on Destinations', only(boot, 'places'), JSON.stringify(boot).slice(0, 120));
  check('the header search field is portalled in on the first paint',
    boot.slotInputs === 1, String(boot.slotInputs));

  const labels = await page.locator('.header-nav-item').evaluateAll((els) => els.map((e) => e.title));
  check('header lists the five sections',
    labels.join('|') === 'Destinations|Explore|Trip planner|Day planner|Saved trips', labels.join('|'));

  // 1 + 3: every section, reached from every other section.
  for (const [from] of TABS) {
    await nav(from);
    await page.waitForTimeout(2200);
    for (const [to, body, urlTab] of TABS) {
      if (to === from) continue;
      await nav(to);
      await page.waitForTimeout(2200);
      const s = await read();
      check(`${from} -> ${to} shows only ${body}`, only(s, body), JSON.stringify(s).slice(0, 150));
      check(`${from} -> ${to} marks ${to} active`, s.hdrActive === to, s.hdrActive);
      check(`${from} -> ${to} writes tab=${urlTab}`, s.tab === urlTab, s.tab);
      await nav(from);
      await page.waitForTimeout(2200);
    }
  }

  // 2 + 3: the account page must not survive a section switch.
  for (const [to, body] of TABS) {
    await page.locator('.account-avatar-btn').click();
    await page.waitForTimeout(900);
    const opened = await read();
    check(`account page open marks the avatar, not a tab (before ${to})`,
      opened.account && opened.avatarOn && opened.hdrActive === '', JSON.stringify(opened).slice(0, 120));
    await nav(to);
    await page.waitForTimeout(2200);
    const s = await read();
    check(`account page closes on switching to ${to}`, !s.account && only(s, body), JSON.stringify(s).slice(0, 150));
  }

  // 2: My trips must not survive one either.
  await nav('Saved trips');
  await page.waitForTimeout(1200);
  check('My trips opens and takes the active state',
    await read().then((s) => s.saved && s.hdrActive === 'Saved trips'));
  await nav('Explore');
  await page.waitForTimeout(2200);
  check('My trips closes on switching to Explore',
    await read().then((s) => !s.saved && only(s, 'explore')));

  // 4: the doors close what they opened.
  await page.locator('.account-avatar-btn').click();
  await page.waitForTimeout(900);
  await page.locator('.account-avatar-btn').click();
  await page.waitForTimeout(900);
  check('a second press on the avatar closes the account page',
    await read().then((s) => !s.account && !s.avatarOn));
  await nav('Saved trips');
  await page.waitForTimeout(1000);
  await nav('Saved trips');
  await page.waitForTimeout(1000);
  check('a second press on My trips closes it', await read().then((s) => !s.saved));

  // 2 + 5: the Lifestyle drawer, on the tab whose scrim used to cover the bar.
  await nav('Explore');
  await page.waitForTimeout(2000);
  await page.locator('.lifestyle-btn:visible').first().click();
  await page.waitForTimeout(900);
  check('Lifestyle opens on Explore', await read().then((s) => s.lifestyle));
  const swallowed = await page.locator('.header-nav-item[title="Trip planner"]')
    .click({ timeout: 3000 }).then(() => false).catch(() => true);
  check('the Lifestyle scrim does not cover the section tabs', !swallowed);
  await page.waitForTimeout(2200);
  check('Lifestyle closes on switching to Trip planner',
    await read().then((s) => !s.lifestyle && only(s, 'trip')));

  // 6: keep-alive and the bar's gutter.
  await nav('Destinations');
  await page.waitForTimeout(2200);
  await page.locator('.places-tab').evaluate((el) => { el.scrollTop = 800; });
  await page.waitForTimeout(400);
  const onPlaces = await read();
  check('Destinations portals one search field into the header',
    onPlaces.slotInputs === 1, String(onPlaces.slotInputs));
  check('the bar reserves a real scrollbar gutter', /^\d+px$/.test(onPlaces.sbw), onPlaces.sbw);
  // The gutter used to be written as 0 before the data landed and only
  // corrected itself on the first tab switch, so the Passes chip overhung the
  // bar's right edge on the screen everybody sees first.
  check('the gutter was already right on the first paint',
    boot.sbw === onPlaces.sbw, `${boot.sbw} -> ${onPlaces.sbw}`);
  await nav('Trip planner');
  await page.waitForTimeout(2200);
  const onTrip = await read();
  check('the gutter does not move on a planner tab',
    onTrip.sbw === onPlaces.sbw, `${onPlaces.sbw} -> ${onTrip.sbw}`);
  check('no search field portals in from a hidden tab', onTrip.slotInputs === 0, String(onTrip.slotInputs));
  await nav('Destinations');
  await page.waitForTimeout(2200);
  const back = await read();
  check('scroll position survives the hop', back.placesScroll === 800, String(back.placesScroll));
  check('the search field comes back exactly once', back.slotInputs === 1, String(back.slotInputs));

  await page.close();
}

/* ─────────────────────────── phone ─────────────────────────── */
{
  const page = await open({ width: 390, height: 844 });
  const read = () => page.evaluate(READ);
  // 0 Destinations, 1 Explore, 2 My trips, 3 Account (the plus is not an item).
  const item = (i) => page.locator('.bottom-nav-item').nth(i).click();

  await item(3);
  await page.waitForTimeout(1100);
  check('phone: Account opens', await read().then((s) => s.account));
  await item(1);
  await page.waitForTimeout(2000);
  check('phone: Account closes on tapping Explore',
    await read().then((s) => !s.account && only(s, 'explore')));

  await item(2);
  await page.waitForTimeout(1100);
  check('phone: My trips opens', await read().then((s) => s.saved));
  await item(0);
  await page.waitForTimeout(2000);
  check('phone: My trips closes on tapping Destinations',
    await read().then((s) => !s.saved && only(s, 'places')));

  await item(1);
  await page.waitForTimeout(2000);
  await page.locator('.lifestyle-btn:visible').first().click();
  await page.waitForTimeout(900);
  check('phone: Lifestyle opens', await read().then((s) => s.lifestyle));
  await item(0);
  await page.waitForTimeout(2000);
  check('phone: Lifestyle closes on tapping Destinations',
    await read().then((s) => !s.lifestyle && only(s, 'places')));

  await page.locator('.bottom-nav-plus').click();
  await page.waitForTimeout(400);
  await page.locator('.plan-chooser-item').first().click();
  await page.waitForTimeout(2600);
  check('phone: the plus lands on the Trip planner', await read().then((s) => only(s, 'trip')));
  await item(0);
  await page.waitForTimeout(2000);
  check('phone: Destinations comes back from a planner', await read().then((s) => only(s, 'places')));

  await page.close();
}

await browser.close();

const failed = checks.filter((c) => !c.ok);
console.log('=== tab switching verify ===  target:', URL);
for (const c of checks) console.log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.label}${c.note ? ' — ' + c.note : ''}`);
console.log(`TOTAL ERRORS: ${errors.length}  |  FAILED CHECKS: ${failed.length} / ${checks.length}`);
errors.slice(0, 10).forEach((e) => console.log('  ' + e));
process.exit(errors.length || failed.length ? 1 : 0);
