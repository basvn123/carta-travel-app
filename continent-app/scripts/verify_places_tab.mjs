// T1089 needs: network (the card-picture check; the rest runs on public/ data)
// Headless verify for the Destinations tab (.places-tab) behind Explore's
// category row: Places hands to the map, and Trails, Beaches, Lakes,
// Mountains and Cycling open the browse layers with photo cards everywhere.
//
//   node scripts/verify_places_tab.mjs [url]      (default http://localhost:$CARTA_PORT or 4173)
//
// T1089: refreshed. The Trips category (now Plan's Carta's own trips, see
// verify_journeys), the phone's own search field (the dock owns it), the side
// panel's country fold and the Lifestyle checks left the tab; the tab now
// opens from Explore's .xcats row. The elevation-profile page is covered by
// verify_trail_page.mjs.
//
// Phone viewport first, then a desktop pass. Screenshots to shots/places-*.png.

import { chromium } from 'playwright';

const URL = process.argv[2] || `http://localhost:${process.env.CARTA_PORT || 4173}/`;

const browser = await chromium.launch();
const checks = [];
const check = (label, ok, note = '') => { checks.push({ label, ok, note }); };
const errors = [];
// Map style and tile fetches die offline (and a proxy answers 502); that is the
// environment, not the app.
const NOISE = /ERR_FAILED|ERR_TUNNEL_CONNECTION_FAILED|config is not valid|AJAXError|status of 502/;

const seed = (page) => page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.homeSeen.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
  } catch { /* storage unavailable */ }
});

// ── Mobile ────────────────────────────────────────────────────────────────
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 120)); });
await seed(page);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(3000);

// Explore opens on the map overview; a category pill opens the tab.
const openCat = async (scope, re) => {
  // The tab's own row once it is open, Explore's row before that.
  const row = (await scope.locator('.dtab-cats [role="tab"]:visible').count()) ? '.dtab-cats' : '.xcats';
  await scope.locator(`${row} [role="tab"]:visible`, { hasText: re }).first().click();
  await scope.waitForTimeout(2600);
};
await page.locator('.bottom-nav-item', { hasText: /^\s*explore\s*$/i }).first().click();
await page.waitForTimeout(1500);
await openCat(page, /^beaches$/i);
check('places tab opens from Explore\'s category row', await page.locator('.places-tab').isVisible());

// ── Category bar ──
const cats = page.locator('.dtab-cats [role="tab"]');
const catNames = (await cats.allInnerTexts()).map((s) => s.trim().toLowerCase());
check('every category tab renders',
  ['places', 'trails', 'beaches', 'lakes', 'mountains', 'cycling']
    .every((n) => catNames.some((c) => c.startsWith(n.slice(0, 5)))),
  catNames.join(', '));
check('Beaches is the active tab', /beaches/i.test(await page.locator('.dtab-cats [aria-selected="true"]').innerText().catch(() => '')));
check('there is no General tab', !catNames.some((c) => c.startsWith('gener')));
check('the trip library left this row (it is Plan\'s now)', !catNames.some((c) => c.startsWith('trips')));

// ── Beaches ──
const beachCards = await page.locator('.places-bcard').count();
check('beaches category shows published beaches', beachCards >= 1, `${beachCards} cards`);
await page.screenshot({ path: 'shots/places-beaches.png' });

// ── Trails: the opening rails, then a trail's page ──
await openCat(page, /^trails$/i);
const trailTiles = await page.locator('.dtab-strip .card-open').count();
check('trails open on rails of walks', trailTiles >= 3, `${trailTiles} tiles`);
await page.screenshot({ path: 'shots/places-trails.png' });
// The first rail tile opens its country's list of walks; a walk opens its page.
await page.locator('.dtab-strip .card-open').first().click();
await page.waitForTimeout(2500);
const hikeCards = await page.locator('.places-tcard').count();
check('a rail tile opens that country\'s walks', hikeCards >= 1, `${hikeCards} cards`);
await page.locator('.places-tcard').first().click();
await page.waitForTimeout(4500);
check('a trail tile opens the trail page', await page.locator('.tpage').first().isVisible().catch(() => false));
const factsText = await page.locator('.tpage .dsk-keyfacts').innerText().catch(() => '');
check('page facts carry the wire numbers', /km/.test(factsText), factsText.replace(/\n/g, ' '));
await page.screenshot({ path: 'shots/places-page-hike.png' });
await page.locator('.tpage-back').first().click().catch(() => {});
await page.waitForTimeout(800);

// Mountains: the layer's own chips. Only the short group stays inline; the
// other groups live in the All filters sheet.
await openCat(page, /^mountains$/i);
const mtnCards = await page.locator('.places-mcard').count();
check('mountains category shows mountain cards', mtnCards >= 1, `${mtnCards} cards`);
const mtnInline = await page.locator('.qfbar .ui-chip:visible, .dtab-chips .ui-chip:visible').allInnerTexts();
await page.locator('.qfbar-all:visible').first().click();
await page.waitForTimeout(700);
const mtnSheet = await page.locator('.fsheet-places .fchip').allInnerTexts();
const mtnSheetGroups = await page.locator('.fsheet-places .fsheet-field').count();
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
check('the mountain sheet holds every group the row leaves out',
  mtnSheetGroups > 1 && mtnInline.length < mtnSheet.length, `${mtnInline.length} inline, ${mtnSheet.length} in ${mtnSheetGroups} sheet groups`);
const mtnChips = [...mtnInline, ...mtnSheet];
check('mountain chips offer the ways up and the kinds',
  mtnChips.length >= 5 && /walk/i.test(mtnChips.join(' ')) && /climb/i.test(mtnChips.join(' ')),
  mtnChips.join(' | ').split(String.fromCharCode(10)).join(' '));
await page.screenshot({ path: 'shots/places-mountains.png' });

// ── A picture on every card, on every category ──
const blanks = [];
for (const [blankCat, blankRe] of [['trails', /^trails$/i], ['beaches', /^beaches$/i],
  ['lakes', /^lakes$/i], ['mountains', /^mountains$/i], ['cycling', /^cycling$/i]]) {
  await openCat(page, blankRe);
  const seen = await page.evaluate(async () => {
    const cards = [...document.querySelectorAll(
      '.places-tab .places-dcard, .places-tab .places-ccard, .places-tab .places-tcard, .places-tab .places-bcard, .places-tab .dtab-strip .card-open')];
    for (const c of cards.slice(0, 12)) {
      const img = c.querySelector('img');
      if (img) img.loading = 'eager';
    }
    await new Promise((r) => setTimeout(r, 2200));
    let broke = 0;
    for (const c of cards.slice(0, 12)) {
      const img = c.querySelector('img');
      if (img && img.complete && img.naturalWidth === 0) broke += 1;
    }
    return {
      n: cards.length,
      blank: cards.filter((c) => c.querySelector('.hero-blank, .places-card-noimg')).length,
      broke,
    };
  });
  if (!seen.n) blanks.push(`${blankCat}: no cards found`);
  if (seen.blank) blanks.push(`${blankCat}: ${seen.blank} placeholders of ${seen.n}`);
  if (seen.broke) blanks.push(`${blankCat}: ${seen.broke} pictures failed to load`);
}
// A picture that cannot load is only a finding when the photo host is
// reachable; offline every card falls back, so the check would prove nothing.
const photoHostUp = await page.evaluate(async () => {
  try {
    await fetch('https://upload.wikimedia.org/', { mode: 'no-cors', signal: AbortSignal.timeout(6000) });
    return true;
  } catch { return false; }
});
if (photoHostUp) {
  check('every card carries a picture', blanks.length === 0,
    blanks.length ? blanks.join(', ') : 'no blank cards on any category');
} else {
  console.log('SKIP (needs network): every card carries a picture; upload.wikimedia.org is unreachable here');
}

// Every hero URL must be on the one host the served CSP allows images from.
const heroHosts = await page.evaluate(async () => {
  const r = await fetch('/app_data.json');
  const j = await r.json();
  const bad = [];
  for (const [id, d] of Object.entries(j.destinations || {})) {
    const u = d.image?.url;
    if (u && !u.startsWith('https://upload.wikimedia.org/')) bad.push(id);
  }
  return { bad: bad.slice(0, 5), n: bad.length };
});
check('every hero URL is on the host the CSP allows',
  heroHosts.n === 0, heroHosts.n ? `${heroHosts.n}: ${heroHosts.bad.join(', ')}` : 'all on upload.wikimedia.org');

await page.close();

// ── Desktop pass ────────────────────────────────────────────────────────
const desk = await browser.newPage({ viewport: { width: 1280, height: 860 } });
desk.on('pageerror', (e) => errors.push('desktop pageerror: ' + e.message.split('\n')[0]));
await seed(desk);
await desk.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await desk.waitForTimeout(3000);
const deskTab = desk.locator('.header-nav-item', { hasText: /^\s*explore\s*$/i }).first();
await deskTab.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
await deskTab.click();
await desk.waitForTimeout(1200);
await openCat(desk, /^beaches$/i);
check('desktop: places tab reachable', await desk.locator('.places-tab').isVisible().catch(() => false));
const deskCols = await desk.locator('.places-list').first().evaluate(
  (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length,
).catch(() => 0);
// T452: the list is Explore's compact rows, columns at least 400px wide, so
// a 1280 window holds two (the old three-card grid is gone).
check('desktop: rows flow in two columns', deskCols === 2, `${deskCols} columns`);
await desk.screenshot({ path: 'shots/places-desktop.png' });
check('no origin picker on the desktop page',
  (await desk.locator('.places-tab .origin-btn:visible').count()) === 0);
check('desktop: the Where field heads the list',
  await desk.locator('.wbar-input').isVisible().catch(() => false));

// T404 (V5): rails you can walk with the keys, and an emptied list that
// always offers its way back. Trails is the layer that still opens on rails.
await openCat(desk, /^trails$/i);
const railStrip = desk.locator('.dtab-strip').first();
check('V5: a rail strip is a named group',
  !!(await railStrip.getAttribute('aria-label').catch(() => null)));
const railCards = railStrip.locator('.card-open');
if (await railCards.count() > 1) {
  await railCards.nth(0).focus();
  await desk.keyboard.press('ArrowRight');
  const movedTo = await desk.evaluate(() => {
    const strip = document.querySelector('.dtab-strip');
    return !!strip && strip.querySelectorAll('.card-open')[1] === document.activeElement;
  });
  check('V5: ArrowRight moves focus to the next card', movedTo === true);
}
check('a rail carries no position figure (T428)', await desk.locator('.open-pos-n, .open-dots').count() === 0);
await openCat(desk, /^beaches$/i);
await desk.locator('.wbar-input').fill('zzqxjv');
await desk.locator('.wbar-input').press('Enter');
await desk.waitForTimeout(1500);
check('V5: a search that matches nothing offers Clear search',
  await desk.locator('.places-empty .cov-empty-btn:visible').count() >= 1);
await desk.locator('.places-empty .cov-empty-btn:visible').first().click().catch(() => {});
await desk.waitForTimeout(800);
check('V5: Clear search empties the field',
  (await desk.locator('.wbar-input').inputValue()) === '');

await desk.close();

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
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
