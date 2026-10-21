// Headless verify for the desktop browse chrome v4: paper top bar with the
// red underline on the active tab, Explore's search field portalled into the
// header while Destinations heads its own column with its one, the left
// filter panel on Destinations and Explore, full-accent
// selected states, and the photo-forward Explore card whose explanation sits
// behind the info button. Then a phone pass that proves nothing moved there.
//
//   node scripts/verify_desktop_shell.mjs [url]   (default http://localhost:$CARTA_PORT or 4173)
//
// Screenshots to shots/desktop-destinations.png, shots/desktop-explore.png,
// shots/mobile-destinations.png.

import { chromium } from 'playwright';

const URL = process.argv[2] || `http://localhost:${process.env.CARTA_PORT || 4173}/`;

const browser = await chromium.launch();
const checks = [];
const check = (label, ok, note = '') => { checks.push({ label, ok, note }); };
const errors = [];
const NOISE = /ERR_FAILED|config is not valid/;

const seed = (page) => page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.homeSeen.v1', '1');
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
// T502: Destinations folded into Explore (T498); its panel is Explore's
// Trails layer now, ?tab=explore&cat=trails.
await page.goto(URL + '?tab=explore&cat=trails', { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(3500);

// The bar: page ground, not white; the active section underlined; the pass
// button on the full accent; friends folded to its icon.
const barBg = await bg(page, '.top-bar');
// T502: --surface-page is #f6f5f2 since the Lagoon tokens (DESIGN.md).
check('top bar sits on the page ground', barBg === 'rgb(246, 245, 242)', barBg);
check('a header tab is active', await page.locator('.header-nav-item.active').count() === 1);
// The pass button checks went with the button (T496-T501: no pass in the header).
check('friends label folded to the icon',
  await page.locator('.header-friends-label').first().isHidden().catch(() => true));

// Destinations: its search heads the column (NOT the header slot, which this
// tab gave up), the left panel stands, the toolbar card is gone.
// T502: since the fold into Explore (T498) the layer portals its search
// into the header slot, the way Explore does: one field there.
check('search stands in the header slot',
  await page.locator('#header-search-slot .places-search input').isVisible());
check('the header slot holds one search field',
  await page.locator('#header-search-slot input').count() === 1);
check('side panel renders', await page.locator('.places-side').isVisible());
check('toolbar card folded away', await page.locator('.places-toolbar').isHidden());
// Seven since Cycling joined General/Trips/Trails/Beaches/Lakes/Mountains.
// Six since General was retired (T381 harness baseline, register row
// T370-a): Trips, Trails, Beaches, Lakes, Mountains and Cycling.
const sideCats = await page.locator('.dtab-cats [role="tab"]').count();
check('every category has a tile in the panel', sideCats === 6, `${sideCats}`);
check('origin picker off this page', await page.locator('.places-tab .origin-btn').count() === 0
  || await page.locator('.places-tab .origin-btn').first().isHidden());
// The Lifestyle door left the side panel (it only ever showed on the retired
// General category) and lives in the shell's settings line under the bar
// on every Destinations category (T381, brief V3-3 and V3-4).
check('lifestyle door on the settings line',
  await page.locator('.settings-line .settings-part-lifestyle').isVisible());
check('country dropdown in the panel', await page.locator('.places-side .side-country').isVisible());

// Selected category = full accent tile. Since T380 the house selected state
// is --ink-fill (#2b3446), never the accent (carta-design "Selected state"),
// and the tiles already wear it, so the assertion checks the ink fill
// (T381, register row T370-a).
await page.locator('.dtab-cats [role="tab"]', { hasText: /trails/i }).first().click();
await page.waitForTimeout(1200);
const onBg = await bg(page, '.dtab-cats [aria-selected="true"]');
// T502: the selected state is the --select-bg tint (#f6e7d3, DESIGN.md "No Slab Rule").
check('selected tile wears the select tint', onBg === 'rgb(246, 231, 211)', onBg);
// It stays on Trails: General, the category this used to return to, is
// retired, and Trails is a category with a country index for the sorts.
await page.waitForTimeout(800);

// Sorts live in the panel and switch on the accent. They only exist past the
// country index (same rule as before this pass), so step into a country.
await page.locator('.dgal-card .card-open').first().click();
await page.waitForTimeout(1200);
// T428: one sort select in the panel, with the three orders in it.
const sortN = await page.locator('.places-side .dtab-sort-side select option').count();
check('sorts stand in the panel', sortN === 3, `${sortN}`);
await page.locator('.places-side .dtab-sort-side select').selectOption({ index: 2 });
await page.waitForTimeout(400);
check('the panel sort changes the order',
  (await page.locator('.places-side .dtab-sort-side select').inputValue()) !== 'rating');

// The column search still answers: typing offers suggestions under the field.
await page.locator('#header-search-slot .places-search input').fill('Gent');
await page.waitForTimeout(700);
check('column search suggests', await page.locator('.places-sugg').isVisible());
await page.screenshot({ path: 'shots/desktop-destinations.png' });
await page.keyboard.press('Escape');
await page.locator('#header-search-slot .places-search input').fill('');
await page.waitForTimeout(400);

// ── Explore ──
await page.locator('.header-nav-item', { hasText: /explore/i }).first().click();
await page.waitForTimeout(2500);
// T502: Explore opens on its rails; See all is the list with the side panel.
await page.locator('.xrails-all:visible').first().click();
await page.waitForTimeout(2500);
check('explore side panel renders', await page.locator('.explore-side').isVisible());
check('explore toolbar folded away', await page.locator('.explore-toolbar').isHidden());
// T391: Explore v5 (T383) draws the trip types as the rail's toggles
// (.xrail-toggle) in its side panel; the old kind-rail chips are gone.
// T502: the kit tiles and the trip kinds are .ui-tile toggles in the panel.
check('kind tiles in the panel', await page.locator('.explore-side .ui-tile').count() >= 9);
check('explore search in the header',
  await page.locator('.header-search-slot .gsearch-trigger').isVisible());

// T502: the card is a compact row since T427 (photograph, name, country,
// price); the info button is gone and the preview opens on hover.
const card = page.locator('.xrow').first();
check('card body carries the name',
  (await card.locator('.xrow-body .xrow-name').innerText().catch(() => '')).trim().length > 1);
check('card body is on screen', await card.locator('.xrow-body').isVisible());
await card.hover();
await page.waitForTimeout(1200);
check('hover opens the explanation', await card.locator('.xcard-preview').isVisible());
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
await phone.goto(URL + '?tab=explore&cat=trails', { waitUntil: 'domcontentloaded', timeout: 45000 });
await phone.waitForTimeout(3000);
check('phone: side panel absent', await phone.locator('.side-panel').first().isHidden().catch(() => true));
// T502: the toolbar is .dtab-top since the fold (T498); the phone brand
// check went with the phone header bar (T496-T501: none on browse views).
check('phone: toolbar stays inline', await phone.locator('.dtab-top').isVisible());
check('phone: search stays inline', await phone.locator('.dtab-top .places-search input').isVisible());
check('phone: no card chrome on the toolbar',
  (await bg(phone, '.dtab-top')) === 'rgba(0, 0, 0, 0)');
// T391: up to six categories on a phone are a 2 x 3 grid of equal buttons,
// never a sideways strip that hides some (carta-design "Filter chips", built
// by the V3 destinations session); this asserted the sideways row before.
check('phone: categories are a grid with every tile on screen', await phone.locator('.dtab-cats').evaluate(
  (el) => getComputedStyle(el).display === 'grid' && el.scrollWidth <= el.clientWidth + 1));
check('phone: no origin chip', await phone.locator('.places-toolbar .origin-btn').count() === 0);
// The opposite is the rule now: an index card may carry its published count
// (DIRECTION.md, destinations N7), and the Trips index shows "26 trips" on
// each style card. What still holds is that a count line is a count
// (T381, register row T370-a).
check('phone: a count line on an index card carries its number',
  (await phone.locator('.places-ccard .places-card-sub').allInnerTexts()).every((x) => /\d/.test(x)));
// T391: the accent tick on every category tile is gone (rule R11, "Accent
// marks": an accent mark means "this one acts"); this asserted a 2 px tick.
const tickContent = await phone.locator('.dtab-cats [role="tab"]').first()
  .evaluate((el) => getComputedStyle(el, '::before').content).catch(() => '');
check('phone: category tiles carry no accent tick', tickContent === 'none' || tickContent === 'normal', tickContent);
// T391 (shell V4, rule R4): the active bottom tab is an --ink-fill pill
// behind its icon (the sliding .nav-marker), the icon in --on-fill and the
// label in ink; it was accent text under an accent tick, which this asserted.
const navState = await phone.locator('.bottom-nav').evaluate((nav) => {
  const item = nav.querySelector('.bottom-nav-item.active');
  const mk = nav.querySelector('.nav-marker');
  if (!item || !mk) return null;
  return {
    marker: getComputedStyle(mk).backgroundColor,
    on: mk.dataset.on,
    label: getComputedStyle(item.querySelector('.bottom-nav-label')).color,
  };
}).catch(() => null);
check('phone: the active bottom tab wears the ink pill',
  !!navState && navState.on === 'true' && navState.marker === 'rgb(246, 231, 211)' && navState.label !== 'rgb(206, 56, 35)',
  JSON.stringify(navState));
await phone.screenshot({ path: 'shots/mobile-destinations.png' });
const phoneNav = phone.locator('.bottom-nav-item', { hasText: /explore/i }).first();
await phoneNav.click();
await phone.waitForTimeout(2500);
// T391: Explore v5 (T383) replaced the toolbar with its input row
// (.xinputs) under the title bar; this asserted the old .explore-toolbar.
// T502: the guided search button replaced the input row (T442).
check('phone: explore search stays inline', await phone.locator('.gsearch-trigger:visible').first().isVisible());
await phone.locator('.xrails-all:visible').first().click();
await phone.waitForTimeout(2500);
// T502: the card is a compact row since T427 (no info button, no grid).
const pCard = phone.locator('.xrow').first();
check('phone: explore card body is on screen', await pCard.locator('.xrow-body').isVisible().catch(() => false));
check('phone: explore card has no photo overlay', await pCard.locator('.xcard-overlay').count() === 0);
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
