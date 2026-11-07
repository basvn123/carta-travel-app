// Headless verify for P5, the shortlist.
//
// What it proves, end to end in a real browser:
//   1. the star on a feature page (a beach) writes a favourite
//   2. the favourite survives a reload, through the URL/localStorage mirror
//   3. an OLD shortlist (bare destination ids) still restores, as destinations
//   4. My trips > Saved lists the shortlist, with names and prices resolved
//   5. Remove on a row drops it
//
// T1089: the old checks 6 (trip planner "Add from shortlist" block), 6b (day
// planner's .daya-shortlist on the add panel's custom side) and 7 (Visited
// map, label-free basemap) were removed with their surfaces: the planner's
// add block and the add panel's modes are gone, and the Visited record map
// was rebuilt as Your Europe.
//
//   node scripts/verify_shortlist.mjs [url]      (default http://localhost:$CARTA_PORT or 4173)
//
// Screenshots to shots/shortlist-*.png.

import { chromium } from 'playwright';

const URL = process.argv[2] || `http://localhost:${process.env.CARTA_PORT || 4173}/`;

const browser = await chromium.launch();
const checks = [];
const check = (label, ok, note = '') => { checks.push({ label, ok, note }); };
const errors = [];
// content_overrides 404s because migration 018 was never applied to the live
// Supabase project; the overrides layer degrades to "no overrides" and every
// screen still renders. Not this feature's business, so it is not its failure.
const NOISE = /ERR_FAILED|config is not valid|cartocdn|content_overrides|Failed to load resource|AJAXError/;

/**
 * Open one of the app's top-level surfaces.
 *
 * The nav is twinned: a bottom bar on a phone, a header row on the desktop,
 * BOTH always in the DOM. Clicking the hidden twin times out, so this asks
 * for the visible one by name at whatever width the test is running.
 */
const openTab = async (page, name) => {
  const nav = page.locator(`.header-nav-item:visible, .bottom-nav-item:visible`, { hasText: name });
  await nav.first().click({ timeout: 15000 });
  await page.waitForTimeout(1500);
};

const seed = (page) => page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.homeSeen.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
  } catch { /* storage unavailable */ }
});

const watch = (page) => {
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
  page.on('console', (m) => {
    if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 120));
  });
};

// ── 1 + 2: star a beach, then reload and find it still starred ────────────
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
watch(page);
await seed(page);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(2500);

// Destinations tab -> Beaches -> open the first beach page.
// T1089: Explore's category row opens the Beaches layer.
await openTab(page, /explore/i);
const beachCat = page.locator('.xcats [role="tab"]:visible', { hasText: /^beaches$/i }).first();
if (await beachCat.count()) { await beachCat.click(); await page.waitForTimeout(4000); }

// Beach rows are .places-bcard (each layer has its own card class).
const firstBeach = page.locator('.places-bcard').first();
if (await firstBeach.count()) { await firstBeach.click(); await page.waitForTimeout(3000); }

// T1089: the page bar's keep control is the kit SaveButton (aria-pressed).
const star = page.locator('.ipage-bar-acts [aria-pressed]').first();
check('a feature page carries the shortlist star', await star.isVisible().catch(() => false));
if (await star.isVisible().catch(() => false)) {
  check('the star starts empty', (await star.getAttribute('aria-pressed')) === 'false');
  await star.click();
  await page.waitForTimeout(600);
  check('tapping the star keeps the beach', (await star.getAttribute('aria-pressed')) === 'true');
  await page.screenshot({ path: 'shots/shortlist-star.png' });
}

// The favourite must be in the URL in the new kind:cc/id form.
const favParam = await page.evaluate(() => new URLSearchParams(window.location.search).get('fav'));
check('the favourite is written to the URL as kind:cc/id',
  !!favParam && /^beach:[A-Z]{2}\//.test(favParam), String(favParam));

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
const afterReload = await page.evaluate(() => new URLSearchParams(window.location.search).get('fav'));
check('the shortlist survives a reload', !!favParam && afterReload === favParam, String(afterReload));

// ── 3: an OLD shortlist (bare ids) still restores ─────────────────────────
const legacy = await browser.newPage({ viewport: { width: 1280, height: 900 } });
watch(legacy);
await seed(legacy);
await legacy.goto(`${URL}?fav=BCN.LIS`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await legacy.waitForTimeout(3000);
const migrated = await legacy.evaluate(() => new URLSearchParams(window.location.search).get('fav'));
check('a legacy bare-id shortlist migrates to dest: keys',
  !!migrated && migrated.includes('dest:BCN') && migrated.includes('dest:LIS'), String(migrated));

// ── 4 + 5: the Favorites tab shows them, grouped, and can drop one ────────
await openTab(legacy, /saved trips|my trips/i);
// T1089: the tab is Saved now (was Shortlist, Favorites before).
const favTab = legacy.locator('[role="tab"]:visible', { hasText: /saved/i }).first();
if (await favTab.count()) { await favTab.click(); await legacy.waitForTimeout(2000); }

const rows = legacy.locator('.mt-item');
const rowCount = await rows.count();
check('both shortlisted cities are listed', rowCount >= 2, `${rowCount} rows`);
const firstName = await legacy.locator('.mt-item-name').first().innerText().catch(() => '');
check('a shortlisted row shows a real name, not an id',
  !!firstName && !/^[A-Z]{3}$/.test(firstName.trim()), firstName);
const kind = await legacy.locator('.mt-item-kind').first().innerText().catch(() => '');
check('a row names its kind and country', /places/i.test(kind) && /,/.test(kind), kind);
await legacy.screenshot({ path: 'shots/shortlist-tab.png' });

if (rowCount > 0) {
  await legacy.locator('.mt-item .mt-menu button').first().click();
  await legacy.locator('.mt-menu-item.is-danger').click();
  await legacy.waitForTimeout(900);
  check('Remove from the row drops it',
    await legacy.locator('.mt-item').count() === rowCount - 1,
    `${rowCount} -> ${await legacy.locator('.mt-item').count()}`);
}
await legacy.close();

await page.close();
await browser.close();

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed += 1;
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  [${c.note}]` : ''}`);
}
if (errors.length) {
  console.log('\npage errors:');
  for (const e of errors) console.log('  ' + e);
}
console.log(failed === 0 && errors.length === 0 ? '\nAll checks passed.' : `\n${failed} checks failed, ${errors.length} page errors.`);
process.exit(failed === 0 ? 0 : 1);
