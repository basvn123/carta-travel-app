// Headless verify for the desktop browse chrome v4: paper top bar with the
// red underline on the active tab, the search field portalled into the
// header, the left filter panel on Destinations and Explore, full-accent
// selected states, and the photo-forward Explore card whose explanation sits
// behind the info button. Then a phone pass that proves nothing moved there.
//
//   node scripts/verify_desktop_shell.mjs [url]   (default http://localhost:4173)
//
// Screenshots to shots/desktop-destinations.png, shots/desktop-explore.png,
// shots/mobile-destinations.png.

import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:4173/';

const browser = await chromium.launch();
const checks = [];
const check = (label, ok, note = '') => { checks.push({ label, ok, note }); };
const errors = [];
const NOISE = /emrldtp|ERR_FAILED|config is not valid/;

const seed = (page) => page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
  } catch { /* storage unavailable */ }
});

const bg = (page, sel) => page.locator(sel).first()
  .evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => '');

// ── Desktop ───────────────────────────────────────────────────────────────
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 120)); });
await seed(page);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(3500);

// The bar: page ground, not white; the active section underlined; the pass
// button on the full accent; friends folded to its icon; search in the bar.
const barBg = await bg(page, '.top-bar');
check('top bar sits on the page ground', barBg === 'rgb(248, 246, 240)', barBg);
check('a header tab is active', await page.locator('.header-nav-item.active').count() === 1);
const passBg = await bg(page, '.header-pricing-btn');
check('Get a pass wears the accent', passBg === 'rgb(224, 90, 71)', passBg);
const passLabel = (await page.locator('.header-pricing-btn').innerText().catch(() => '')).trim();
check('pass button says Get a pass', /get a pass/i.test(passLabel), passLabel);
check('friends label folded to the icon',
  await page.locator('.header-friends-label').first().isHidden().catch(() => true));
check('search rides in the header',
  await page.locator('.header-search-slot .places-search input').isVisible());

// Destinations: the left panel stands, the toolbar card is gone.
check('side panel renders', await page.locator('.places-side').isVisible());
check('toolbar card folded away', await page.locator('.places-toolbar').isHidden());
const sideCats = await page.locator('.places-side .side-cat').count();
check('six category tiles in the panel', sideCats === 6, `${sideCats}`);
check('origin picker off this page', await page.locator('.places-tab .origin-btn').count() === 0
  || await page.locator('.places-tab .origin-btn').first().isHidden());
check('lifestyle stays in the panel', await page.locator('.places-side .lifestyle-btn').isVisible());
check('country dropdown in the panel', await page.locator('.places-side .side-country').isVisible());

// Selected category = full accent tile.
await page.locator('.places-side .side-cat', { hasText: /trails/i }).first().click();
await page.waitForTimeout(1200);
const onBg = await bg(page, '.places-side .side-cat.on');
check('selected tile wears the full accent', onBg === 'rgb(224, 90, 71)', onBg);
await page.locator('.places-side .side-cat', { hasText: /general/i }).first().click();
await page.waitForTimeout(800);

// Sorts live in the panel and switch on the accent. They only exist past the
// country index (same rule as before this pass), so step into a country.
await page.locator('.places-ccard').first().click();
await page.waitForTimeout(1200);
const sortN = await page.locator('.places-side .side-sort').count();
check('sorts stand in the panel', sortN === 3, `${sortN}`);
await page.locator('.places-side .side-sort').nth(2).click();
await page.waitForTimeout(400);
const sortBg = await bg(page, '.places-side .side-sort.on');
check('active sort wears the accent', sortBg === 'rgb(224, 90, 71)', sortBg);

// The header search still answers: typing offers suggestions under the bar.
await page.locator('.header-search-slot .places-search input').fill('Gent');
await page.waitForTimeout(700);
check('header search suggests', await page.locator('.places-sugg').isVisible());
await page.screenshot({ path: 'shots/desktop-destinations.png' });
await page.keyboard.press('Escape');
await page.locator('.header-search-slot .places-search input').fill('');
await page.waitForTimeout(400);

// ── Explore ──
await page.locator('.header-nav-item', { hasText: /explore/i }).first().click();
await page.waitForTimeout(2500);
check('explore side panel renders', await page.locator('.explore-side').isVisible());
check('explore toolbar folded away', await page.locator('.explore-toolbar').isHidden());
check('kind tiles in the panel', await page.locator('.explore-side .kind-rail-chip').count() >= 9);
check('explore search in the header',
  await page.locator('.header-search-slot .results-search-input').isVisible());

// The card is nearly all photograph: overlay on, body off, info button up.
const card = page.locator('.xcard').first();
check('card overlay carries the name',
  (await card.locator('.xcard-overlay-name').innerText().catch(() => '')).trim().length > 1);
check('card body folded away', await card.locator('.xcard-body').isHidden());
check('info button renders', await card.locator('.xcard-info').isVisible());
// The explanation sits behind the button: click opens the preview panel.
await card.locator('.xcard-info').click();
await page.waitForTimeout(600);
check('info opens the explanation', await card.locator('.xcard-preview').isVisible());
await page.screenshot({ path: 'shots/desktop-explore.png' });
await page.mouse.move(10, 500);
await page.waitForTimeout(300);

// ── Phone: the same design language, arranged for a thumb. ────────────────
// Mobile chrome v4: no side panel and no header portal (the toolbar keeps
// its controls inline), but the toolbar loses its card chrome, the brand
// stands in the bar with its mark, the category row scrolls sideways, the
// bottom tabs wear the accent, and the Explore card reads photo-first.
const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
phone.on('pageerror', (e) => errors.push('phone pageerror: ' + e.message.split('\n')[0]));
await seed(phone);
await phone.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await phone.waitForTimeout(3000);
check('phone: side panel absent', await phone.locator('.side-panel').first().isHidden().catch(() => true));
check('phone: toolbar stays inline', await phone.locator('.places-toolbar').isVisible());
check('phone: search stays inline', await phone.locator('.places-toolbar .places-search input').isVisible());
check('phone: the brand stands in the bar',
  await phone.locator('.app-header-brand .brand-name').isVisible().catch(() => false));
check('phone: no card chrome on the toolbar',
  (await bg(phone, '.places-toolbar')) === 'rgba(0, 0, 0, 0)');
check('phone: category row scrolls sideways', await phone.locator('.places-cats').evaluate(
  (el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).display === 'flex'));
check('phone: no origin chip', await phone.locator('.places-toolbar .origin-btn').count() === 0);
check('phone: no count line on country cards',
  await phone.locator('.places-ccard .places-card-sub').count() === 0);
const tickH = await phone.locator('.places-cat').first()
  .evaluate((el) => getComputedStyle(el, '::before').height).catch(() => '');
check('phone: category tiles carry the accent tick', tickH === '2px', tickH);
const navColor = await phone.locator('.bottom-nav-item.active').first()
  .evaluate((el) => getComputedStyle(el).color).catch(() => '');
check('phone: the active bottom tab wears the accent', navColor === 'rgb(224, 90, 71)', navColor);
await phone.screenshot({ path: 'shots/mobile-destinations.png' });
const phoneNav = phone.locator('.bottom-nav-item', { hasText: /explore/i }).first();
await phoneNav.click();
await phone.waitForTimeout(2500);
check('phone: explore toolbar stays inline', await phone.locator('.explore-toolbar').isVisible());
const pCard = phone.locator('.xcard').first();
check('phone: explore card is photo-first', await pCard.locator('.xcard-overlay').isVisible().catch(() => false));
check('phone: explore card body folded away', await pCard.locator('.xcard-body').isHidden().catch(() => true));
check('phone: info button stays hidden', await pCard.locator('.xcard-info').isHidden().catch(() => true));
check('phone: explore cards run two abreast', await phone.locator('.explore-grid').evaluate(
  (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length === 2));
await phone.screenshot({ path: 'shots/mobile-explore.png' });

// ── Report ──
let fail = 0;
for (const c of checks) {
  if (!c.ok) fail += 1;
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
}
if (errors.length) console.log('\nerrors:\n' + errors.join('\n'));
console.log(`\n${checks.length - fail}/${checks.length} passed`);
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
