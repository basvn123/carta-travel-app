// Headless verify for the section switch: Explore | Plan | My trips plus the
// account icon in the desktop header, and the four-link bottom bar on a phone
// (T502: the three places of T496-T501).
//
//   node scripts/verify_tab_switching.mjs [url]     (default http://localhost:$CARTA_PORT or 4173)
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

const URL = process.argv[2] || `http://localhost:${process.env.CARTA_PORT || 4173}/`;
const browser = await chromium.launch();
const checks = [];
const errors = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });

// The emrldtp affiliate loader always fails offline (accepted risk), and the
// weather calls are rate-capped. Neither says anything about the section
// switch, so neither is a regression signal here.
const NOISE = /ERR_FAILED|config is not valid/;

const SEED = () => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    localStorage.setItem('continent.homeSeen.v1', '1');
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
  // T502: the three places (T496-T501). Explore is .explore-tab, Plan with no
  // plan in progress is .plan-start, its Trip and One day tiles open the
  // planners. Explore is the default place, so its address carries no tab.
  return {
    explore: shown('.explore-tab'),
    plan: shown('.plan-start'),
    trip: shown('.trip-planner-screen:not(.day-flow-screen)'),
    day: shown('.day-flow-screen'),
    account: !!document.querySelector('.account-panel:not(.saved-trips-panel)'),
    saved: !!document.querySelector('.saved-trips-panel'),
    lifestyle: !!document.querySelector('.lifestyle-panel'),
    hdrActive: [...document.querySelectorAll('.header-nav-item.active .header-nav-label')].map((b) => b.textContent.trim()).join(','),
    avatarOn: !!document.querySelector('.account-door.on'),
    tab: new URLSearchParams(location.search).get('tab') || 'explore',
    mode: new URLSearchParams(location.search).get('mode') || '',
    sbw: getComputedStyle(document.documentElement).getPropertyValue('--sbw').trim(),
    slotFields: document.getElementById('header-search-slot')?.querySelectorAll('input, .gsearch-trigger').length ?? -1,
    exploreScroll: document.querySelector('.explore-tab')?.scrollTop ?? null,
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
const only = (s, key) => ['explore', 'plan', 'trip', 'day'].every((k) => s[k] === (k === key));

/* ─────────────────────────── desktop ─────────────────────────── */
{
  const page = await open({ width: 1440, height: 900 });
  const read = () => page.evaluate(READ);
  // T502: the header items carry no title now; the label is the name.
  const nav = (name) => page.locator('.header-nav-item').filter({ has: page.locator('.header-nav-label', { hasText: new RegExp(`^${name}$`) }) }).click();
  const tile = (mode) => page.locator(`.plan-start-tile[href*="mode=${mode}"]:visible`).first().click();
  const TABS = [
    ['Explore', 'explore', 'explore'],
    ['Plan', 'plan', 'plan'],
  ];

  const boot = await read();
  check('the app opens on Explore', only(boot, 'explore'), JSON.stringify(boot).slice(0, 120));

  // T502: three places (T473 decision, built T496-T501); Account is the icon.
  const labels = await page.locator('.header-nav-item .header-nav-label').evaluateAll((els) => els.map((e) => e.textContent.trim()));
  check('header lists the three places',
    labels.join('|') === 'Explore|Plan|My trips', labels.join('|'));
  check('the header has no Home tab, strapline or pass button',
    await page.evaluate(() => !document.querySelector('.brand-sub, .shell-pass-btn, .header-pricing-btn')));

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

  // T502: Plan's two tiles are the doors into the planners.
  await nav('Plan');
  await page.waitForTimeout(1500);
  await tile('trip');
  await page.waitForTimeout(2600);
  const onTripTile = await read();
  check('Plan -> Trip tile shows the trip planner and writes mode=trip',
    only(onTripTile, 'trip') && onTripTile.tab === 'plan' && onTripTile.mode === 'trip' && onTripTile.hdrActive === 'Plan',
    JSON.stringify(onTripTile).slice(0, 150));
  await nav('Explore');
  await page.waitForTimeout(2200);
  check('trip planner -> Explore shows only explore', await read().then((s) => only(s, 'explore')));
  await page.goto(new globalThis.URL('?tab=plan&mode=day', URL).href, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const onDayTile = await read();
  check('?tab=plan&mode=day shows the day planner under Plan',
    only(onDayTile, 'day') && onDayTile.hdrActive === 'Plan', JSON.stringify(onDayTile).slice(0, 150));
  await nav('Explore');
  await page.waitForTimeout(2200);

  // 2 + 3: the account page must not survive a section switch.
  for (const [to, body] of [['Explore', 'explore']]) {
    await page.locator('.account-door').click();
    await page.waitForTimeout(900);
    const opened = await read();
    check(`account page open marks the avatar, not a tab (before ${to})`,
      opened.account && opened.avatarOn && opened.hdrActive === '', JSON.stringify(opened).slice(0, 120));
    await nav(to);
    await page.waitForTimeout(2200);
    const s = await read();
    check(`account page closes on switching to ${to}`, !s.account && only(s, body), JSON.stringify(s).slice(0, 150));
  }

  // 7 (T381, the navigation rule): the section doors are links, and Back
  // returns to the section before, with the bar following it.
  check('the section doors are links with an address',
    await page.locator('.header-nav-item').first().evaluate((el) => el.tagName === 'A' && /tab=explore/.test(el.getAttribute('href') || '')));
  await nav('My trips');
  await page.waitForTimeout(1800);
  await nav('Explore');
  await page.waitForTimeout(1800);
  await page.goBack();
  await page.waitForTimeout(2200);
  check('Back after My trips then Explore returns to My trips',
    await read().then((s) => s.saved && s.hdrActive === 'My trips'));
  await page.goForward();
  await page.waitForTimeout(2200);
  check('Forward goes to Explore again', await read().then((s) => !s.saved && only(s, 'explore') && s.hdrActive === 'Explore'));

  // 2: My trips must not survive one either.
  await nav('My trips');
  await page.waitForTimeout(1200);
  check('My trips opens and takes the active state',
    await read().then((s) => s.saved && s.hdrActive === 'My trips'));
  await nav('Explore');
  await page.waitForTimeout(2200);
  check('My trips closes on switching to Explore',
    await read().then((s) => !s.saved && only(s, 'explore')));

  // 4: removed by T496-T501 (Account and My trips are places now; a second
  // press stays there instead of closing a door).

  // 2 + 5: the Lifestyle drawer, on the tab whose scrim used to cover the bar.
  await nav('Explore');
  await page.waitForTimeout(2000);
  // T401: Explore's own Lifestyle button is gone (explore V3 and V4 left the
  // settings line as the one door), so the door is the first visible one: the
  // settings line's Lifestyle part, or the older button where a tab still draws it.
  await page.locator('.settings-part-lifestyle:visible, .settings-bed:visible, .lifestyle-btn:visible').first().click();
  await page.waitForTimeout(900);
  check('Lifestyle opens on Explore', await read().then((s) => s.lifestyle));
  const swallowed = await page.locator('.header-nav-item').nth(1)
    .click({ timeout: 3000 }).then(() => false).catch(() => true);
  check('the Lifestyle scrim does not cover the section tabs', !swallowed);
  await page.waitForTimeout(2200);
  check('Lifestyle closes on switching to Plan',
    await read().then((s) => !s.lifestyle && !s.explore && s.hdrActive === 'Plan'));

  // 6: keep-alive and the bar's gutter.
  await nav('Explore');
  await page.waitForTimeout(2200);
  // The scroll target is what the tab can actually scroll to: the page is
  // shorter than 800 px of overflow at some data states (T381: this used to
  // assume 800 was always reachable).
  await page.locator('.explore-tab').evaluate((el) => { el.scrollTop = 800; });
  await page.waitForTimeout(400);
  const onExplore = await read();
  const scrolledTo = onExplore.exploreScroll;
  check('Explore scrolls', scrolledTo > 0, String(scrolledTo));
  // Explore is the place that portals its search: exactly one field.
  check('Explore portals one search field into the header',
    onExplore.slotFields === 1, String(onExplore.slotFields));
  check('the bar reserves a real scrollbar gutter', /^\d+px$/.test(onExplore.sbw), onExplore.sbw);
  // The gutter used to be written as 0 before the data landed and only
  // corrected itself on the first tab switch, so the Passes chip overhung the
  // bar's right edge on the screen everybody sees first.
  check('the gutter was already right on the first paint',
    boot.sbw === onExplore.sbw, `${boot.sbw} -> ${onExplore.sbw}`);
  await nav('Plan');
  await page.waitForTimeout(2200);
  const onPlan = await read();
  check('the gutter does not move on a planner tab',
    onPlan.sbw === onExplore.sbw, `${onExplore.sbw} -> ${onPlan.sbw}`);
  check('no search field portals in from a hidden tab', onPlan.slotFields === 0, String(onPlan.slotFields));
  await nav('Explore');
  await page.waitForTimeout(2200);
  const back = await read();
  check('scroll position survives the hop', back.exploreScroll === scrolledTo, `${scrolledTo} -> ${back.exploreScroll}`);
  check('Explore still portals exactly one search field', back.slotFields === 1, String(back.slotFields));

  await page.close();
}

/* ─────────────────────────── phone ─────────────────────────── */
{
  const page = await open({ width: 390, height: 844 });
  const read = () => page.evaluate(READ);
  // T502: 0 Explore, 1 Plan, 2 My trips, 3 Account (no plus since T496-T501).
  const item = (i) => page.locator('nav.bottom-nav[aria-label="Sections"] .bottom-nav-item').nth(i).click();
  check('phone: the bottom nav carries four links',
    await page.locator('nav.bottom-nav[aria-label="Sections"] a.bottom-nav-item').count() === 4);

  await item(3);
  await page.waitForTimeout(1100);
  check('phone: Account opens', await read().then((s) => s.account));
  await item(0);
  await page.waitForTimeout(2000);
  check('phone: Account closes on tapping Explore',
    await read().then((s) => !s.account && only(s, 'explore')));

  await item(2);
  await page.waitForTimeout(1100);
  check('phone: My trips opens', await read().then((s) => s.saved));
  await item(1);
  await page.waitForTimeout(2000);
  check('phone: My trips closes on tapping Plan',
    await read().then((s) => !s.saved && only(s, 'plan')));

  await item(0);
  await page.waitForTimeout(2000);
  // T401: the settings line's Lifestyle part is the door (Explore's own button is gone).
  await page.locator('.settings-part-lifestyle:visible, .settings-bed:visible, .lifestyle-btn:visible').first().click();
  await page.waitForTimeout(900);
  check('phone: Lifestyle opens', await read().then((s) => s.lifestyle));
  // T391 (shell V4, brief V4-6): on a phone Lifestyle is a bottom sheet over
  // the bar, so the bar never covers its foot, and like every modal dialog
  // the page behind (the bar included) takes no tap while it is up. This
  // used to tap Destinations through it; now the sheet's Done closes it and
  // the tab is pressed after, which is what a traveller does.
  const navCovered = await page.evaluate(() => {
    const n = document.querySelector('.bottom-nav-item');
    const r = n.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !n.contains(hit);
  });
  check('phone: the Lifestyle sheet stands over the bar', navCovered);
  await page.locator('.ls-done').click();
  await page.waitForTimeout(600);
  await item(1);
  await page.waitForTimeout(2000);
  check('phone: Lifestyle closes, then Plan opens',
    await read().then((s) => !s.lifestyle && only(s, 'plan')));

  // T502: the plus is gone (T496-T501); Plan's Trip tile is the door.
  await page.locator('.plan-start-tile[href*="mode=trip"]:visible').first().click();
  await page.waitForTimeout(2600);
  check('phone: the Trip tile lands on the Trip planner', await read().then((s) => only(s, 'trip')));
  // The bar steps aside inside a wizard step on a phone (T468), so the way
  // out is the system back, twice: to Plan, then to Explore.
  check('phone: the bar steps aside inside the wizard',
    !(await page.locator('nav.bottom-nav[aria-label="Sections"]').isVisible()));
  await page.goBack();
  await page.waitForTimeout(1500);
  await page.goBack();
  await page.waitForTimeout(2000);
  check('phone: Explore comes back from a planner', await read().then((s) => only(s, 'explore')));

  await page.close();
}

await browser.close();

const failed = checks.filter((c) => !c.ok);
console.log('=== tab switching verify ===  target:', URL);
for (const c of checks) console.log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.label}${c.note ? ' — ' + c.note : ''}`);
console.log(`TOTAL ERRORS: ${errors.length}  |  FAILED CHECKS: ${failed.length} / ${checks.length}`);
errors.slice(0, 10).forEach((e) => console.log('  ' + e));
process.exit(errors.length || failed.length ? 1 : 0);
