// T427 (2026-10-13): the contract follows the owner's Explore review: rows
// for every list, photo tiles in the sections, no count, no tier legend, no
// rail subtitles, the estimate mark on stand-in figures only.
//
// Headless verify for the Explore tab v3: the map is gone, the grid answers
// with a euro-a-day figure (the two 0-10 "cheapness" indices are retired, see
// lib/costIndex.js), one Filters sheet serves every width, and the
// destination panel carries the info sections (cost receipt, around + locator
// map, worth pairing with, when, weather, how the score is built, parking,
// packing).
//
//   node scripts/verify_explore.mjs [url]      (default http://localhost:$CARTA_PORT or 4173)
//
// Supersedes verify_filter_sheet.mjs and the map-era checks: the desktop
// filter rows, the tray and the origin toolrow no longer exist on Explore.
// Screenshots to shots/explore-*.png.

import { chromium } from 'playwright';

const URL = process.argv[2] || `http://localhost:${process.env.CARTA_PORT || 4173}/`;

const browser = await chromium.launch();
const errors = [];
const checks = [];
const check = (label, ok, note = '') => { checks.push({ label, ok, note }); };

const boot = async (viewport) => {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
  const NOISE = /ERR_FAILED|config is not valid|open-meteo/;
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 120)); });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.homeSeen.v1', '1');
      localStorage.setItem('carta.welcomeSeen.v1', '1');
    } catch { /* storage unavailable */ }
  });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2500);
  return page;
};

// ── Desktop pass ──
try {
  const page = await boot({ width: 1440, height: 900 });
  const exploreTab = page.locator('.header-nav-item', { hasText: /^\s*explore\s*$/i }).first();
  if (await exploreTab.isVisible().catch(() => false)) {
    await exploreTab.click();
    await page.waitForTimeout(1800);
  }

  check('explore grid renders', await page.locator('.explore-tab').isVisible());
  check('no map canvas anywhere on Explore', await page.locator('.maplibregl-canvas').count() === 0);
  const cards = await page.locator('.xrow').count();
  check('a real page of cards', cards >= 24, `${cards} cards`);
  const withImg = await page.locator('.xrow img.xrow-img').count();
  check('cards carry photos', withImg >= cards * 0.8, `${withImg}/${cards}`);
  // The 640px thumb splice must resolve to real bytes, not a 404 tile.
  const imgOk = await page.waitForFunction(() => {
    const el = document.querySelector('.xrow img.xrow-img');
    return !!el && el.complete && el.naturalWidth > 0;
  }, null, { timeout: 12000 }).then(() => true).catch(() => false);
  check('spliced card thumb actually loads', imgOk);
  // The retired 0-10 meters must be gone, and every card must carry the euro
  // figure that replaced them (lib/costIndex.js explains the swap in full).
  check('the 0-10 cheapness meters are gone', await page.locator('.xcard-ix').count() === 0);
  const costCount = await page.locator('.xrow .xprice').count();
  check('every card shows a euro-a-day figure', costCount >= cards - 2, `${costCount}/${cards}`);
  // T427: the five-bar gauge repeated the figure; it is gone from the card.
  check('the cost gauge left the card', await page.locator('.xrow .cost-gauge').count() === 0);
  const cardText = await page.locator('.xrow').first().innerText();
  check('the card names a price in euros', /€\d/.test(cardText), cardText.replace(/\n/g, ' | ').slice(0, 90));

  // T427 (owner decision 2026-10-13): a stand-in figure carries the estimate
  // mark, the tilde joined to the figure and the word after it, and nothing
  // else says where it came from. Carta still prices no flight (T279-a): no
  // "not a live quote" title anywhere on a card.
  const prices = await page.locator('.xrow .xprice').allInnerTexts();
  const cardTitles = await page.locator('.xrow [title]').evaluateAll((els) => els.map((e) => e.title).join('\n'));
  check('every tilde on a card comes with the estimate word',
    prices.every((p) => !p.includes('~') || /est\./.test(p)) && !/not a live quote/i.test(cardTitles),
    prices.slice(0, 3).join(' | '));
  check('no card says national or names a source',
    !(await page.locator('.xrow').allInnerTexts()).some((s) => /\bnational\b/i.test(s)));

  // The srcset must offer widths Wikimedia actually renders. An unlisted
  // width answers 400, which is exactly how this breaks silently.
  // T427: a 72 px row photo needs one width (250), so it may carry a plain
  // src and no srcset; either way only renderable widths may appear.
  const img0 = page.locator('.xrow img.xrow-img').first();
  const srcset = (await img0.getAttribute('srcset')) || (await img0.getAttribute('src'));
  const widths = (srcset || '').match(/(\d+)px-/g) || [];
  const legalW = ['250px-', '330px-', '500px-', '960px-', '1280px-', '1920px-'];
  check('card srcset uses renderable Wikimedia widths',
    widths.length >= 1 && widths.every((w) => legalW.includes(w)),
    srcset ? widths.join(' ') : 'no srcset');

  // The Lifestyle control has to be present AND has to move the prices: a
  // control that changes nothing is worse than no control at all.
  // The control renders twice since desktop chrome v4 (toolbar card for the
  // phone, side panel for desktop); exactly one may be on screen at a time.
  // V4 (T393, rows T381-b and T383-a): the one Lifestyle door on Explore is
  // the shell's settings line above the tab (T381); Explore's own input-row
  // door was a second door to the same dialog and is gone. The check now
  // reads the settings line's part and asserts Explore draws none of its own.
  check('one Lifestyle control on screen',
    await page.locator('.settings-part-lifestyle:visible').count() === 1
    && await page.locator('.explore-shell .lifestyle-btn:visible').count() === 0);
  const priceText = () => page.locator('.xrow .xprice .money:visible').allInnerTexts();
  const beforeLs = (await priceText()).slice(0, 8).join(' ');
  await page.locator('.settings-part-lifestyle:visible').first().click();
  await page.waitForTimeout(800);
  check('Lifestyle opens as a right-hand drawer', await page.locator('.accom-panel.from-right').count() === 1);
  check('the grid behind it stays reachable through a scrim', await page.locator('.lifestyle-scrim').count() === 1);
  const bp = page.locator('.lifestyle-panel .ls-tile', { hasText: /^Backpacker$/ }).first();
  if (await bp.count()) { await bp.click(); await page.waitForTimeout(700); }
  await page.keyboard.press('Escape');
  await page.locator('.lifestyle-scrim').click({ position: { x: 120, y: 400 } }).catch(() => {});
  await page.waitForTimeout(700);
  const afterLs = (await priceText()).slice(0, 8).join(' ');
  check('changing Lifestyle reprices the grid', beforeLs !== afterLs, `${beforeLs} -> ${afterLs}`);

  // The hover explanation, and WCAG 1.4.13's dismissible requirement.
  await page.locator('.xrow').first().hover();
  await page.waitForTimeout(350);
  const previewOpen = await page.locator('.xcard-preview').count() === 1;
  check('hovering a card explains it', previewOpen);
  // V4 (T393, explore N6): the preview is a paper popover beside or under
  // its card, never over the photograph, and carries the month strip and
  // the receipt's cost bar.
  if (previewOpen) {
    const pop = await page.evaluate(() => {
      const p = document.querySelector('.xcard-preview');
      const m = p.closest('.xrow').querySelector('.xrow-media').getBoundingClientRect();
      const r = p.getBoundingClientRect();
      const ox = Math.max(0, Math.min(r.right, m.right) - Math.max(r.left, m.left));
      const oy = Math.max(0, Math.min(r.bottom, m.bottom) - Math.max(r.top, m.top));
      return { overlap: ox * oy, w: r.width, strip: !!p.querySelector('.mstrip'), bar: !!p.querySelector('.xcost-bar') };
    });
    check('the preview never covers the photograph', pop.overlap === 0 && pop.w <= 321, JSON.stringify(pop));
    check('the preview carries the month strip and the cost bar', pop.strip && pop.bar);
  }
  if (previewOpen) await page.screenshot({ path: 'shots/explore-hover.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('Escape dismisses the preview (WCAG 1.4.13)',
    await page.locator('.xcard-preview').count() === 0);

  // The retired fare-era controls must be gone from this tab.
  check('no depart/return fields', await page.locator('.row-date-fields').count() === 0);
  check('no stay-tier filter', await page.locator('.filter-staytier').count() === 0);
  check('no baggage filter', await page.locator('.filter-baggage').count() === 0);
  check('no travel-by toggle', await page.locator('.filter-travelby').count() === 0);
  check('no total/per-person toggle', await page.locator('.filter-show').count() === 0);
  check('no desktop filter tray', await page.locator('.filter-tray').count() === 0);

  // C6: the modal sheet is gone. Every filter stands in the always-visible
  // rail, the count leads it, and turning a knob narrows the grid live.
  check('no filter modal anywhere', await page.locator('.fsheet-explore').count() === 0);
  check('the filter rail is on screen', await page.locator('.explore-side .xrail').isVisible());
  // v5: the count heads the control bar over the feed, beside the grid/map
  // switch and the sort, and the rail groups are folds with the first two
  // open. The count is locale-grouped ("3,855"), so digits are stripped.
  // The bar carries no count any more, and the tier legend counts the whole
  // catalogue, so "narrows live" is read off the cards: how many of the
  // cards on screen are not a village.
  // T427: the row carries no kind word, so "narrows live" is read off the
  // first names on the list, which change when the filter lands.
  const firstNames = async () => (await page.locator('.xrow .xrow-name').allInnerTexts()).slice(0, 12).join('|');
  check('the control bar heads the feed', await page.locator('.xbar .xbar-title').isVisible());
  check('the title stands alone (no count beside it)',
    (await page.locator('.xbar .xbar-title').innerText()).trim() === 'Explore Europe'
    && await page.locator('.xbar-count').count() === 0);
  check('no tier legend', await page.locator('.tierlegend, .tierlegend-row').count() === 0);
  check('list/map switch and sort share the bar',
    await page.locator('.xbar .xview-seg [role="radio"]').count() === 2
    && await page.locator('.xbar .xgrid-sort select').isVisible());
  check('no second results header mid-page', await page.locator('.xgrid-head').count() === 0);
  // T383 (V3): six folds, not five. The trip styles left their own tile
  // grid and became the rail's first group, so they make chips and reset
  // with the other filters (brief V3-7).
  check('the rail groups are folds', await page.locator('.explore-side details.xrail-group').count() === 6);
  // T383 (V3): the input row carries Lifestyle, the budget ceiling, the
  // month, No car needed and the shortlist, each showing its value.
  check('the input row shows the inputs the figures depend on',
    await page.locator('.xinputs select').count() === 2
    && await page.locator('.xinputs .xinput--toggle').count() === 2);
  // Every section tile carries the day cost (brief V3-5), on the kit Card.
  const railCards = await page.locator('.xtile').count();
  const railPriced = await page.locator('.xtile .xprice').count();
  check('every section tile shows a euro-a-day figure', railCards > 0 && railCards === railPriced,
    `${railPriced} of ${railCards}`);
  check('"See all" carries no count',
    (await page.locator('.xrails-all').allInnerTexts()).every((s) => !/\d/.test(s)));
  check('the first two folds open, the rest closed',
    await page.locator('.explore-side details.xrail-group[open]').count() === 2);
  // T427: four sections on a desktop, then one row of buttons; no subtitle
  // and no position figure on any of them.
  check('at most four sections lead the page', await page.locator('.xrails-rail').count() <= 4);
  check('no section carries a subtitle or a position',
    await page.locator('.xrails-sub, .xrails-pos').count() === 0);
  check('the other sections are one row of buttons',
    await page.locator('.xrails-doors button').count() >= 1);
  // A row: the name, the Score, the country, the price; nothing on the photo.
  const bodyFacts = await page.locator('.xrow').first().locator('.xrow-name, .score-chip, .xrow-country, .xprice').count();
  check('the row carries its four facts', bodyFacts === 4, `${bodyFacts} parts`);
  check('nothing sits on the row photograph',
    await page.locator('.xrow').first().locator('.xrow-media > :not(img)').count() === 0);
  const countBefore = await firstNames();
  // T383 (V3): "Size of place" (was "Kind of place") starts closed, so the
  // fold is opened before its Village toggle is pressed.
  await page.locator('.explore-side .xrail-legend', { hasText: /Size of place/ }).click();
  await page.waitForTimeout(300);
  await page.locator('.explore-side .xrail-toggle', { hasText: /^Village$/ }).first().click();
  await page.waitForTimeout(700);
  const countAfter = await firstNames();
  check('the open fold says how many are active',
    (await page.locator('.explore-side .xrail-legend-n').first().innerText()).trim() === '1');
  check('a rail toggle narrows the grid live', countBefore !== '' && countAfter !== countBefore,
    `${countBefore.slice(0, 40)} -> ${countAfter.slice(0, 40)}`);
  check('the active filter shows as a chip', await page.locator('.xchip', { hasText: /Village/ }).count() === 1);
  check('the filter landed in the URL', page.url().includes('xk=village'));
  await page.screenshot({ path: 'shots/explore-filters-desktop.png' });
  await page.locator('.xchip', { hasText: /Village/ }).click();
  await page.waitForTimeout(500);

  await page.screenshot({ path: 'shots/explore-desktop.png', fullPage: false });

  // C7 in v5: on a desktop the map stands beside the grid, not in its place,
  // and the bar's count follows the viewport.
  await page.locator('.xbar .xview-seg [role="radio"]').nth(1).click();
  await page.waitForTimeout(4000);
  check('map view splits the feed', await page.locator('.xcontent--split').count() === 1);
  check('the map canvas is up', await page.locator('.xcontent-map .maplibregl-canvas').count() === 1);
  check('the list stays beside the map', await page.locator('.xcontent--split .xrows .xrow').first().isVisible());
  check('the collections step aside for the map', await page.locator('.xrails-rail').count() === 0);
  await page.screenshot({ path: 'shots/explore-desktop-map.png' });
  await page.locator('.xbar .xview-seg [role="radio"]').first().click();
  await page.waitForTimeout(600);
  check('back to the grid, the map is gone', await page.locator('.maplibregl-canvas').count() === 0);

  // ── Open a destination: it is the full-screen page now. The deep contract
  // (gallery, highlights, PDF, parking deeplinks) lives in
  // scripts/verify_destination_page.mjs; this pass only proves the door. ──
  await page.locator('.xrow-hit').first().click();
  await page.waitForTimeout(2500);
  const panel = page.locator('.destp');
  check('destination page opens', await panel.isVisible());
  // P4.4: the page arrives folded, so a reader steers it instead of
  // scrolling a wall. Only the first section opens itself.
  check('the page arrives folded', await panel.locator('.dsec.is-open').count() === 1,
    `${await panel.locator('.dsec.is-open').count()} open`);
  // V5 (T403, row T393-a): the destination page now opens "When to go" (the
  // second fold) so the month answer is on the first screen; the check
  // follows the page, it does not demand the old first fold.
  check('the section that opens is the when-to-go one',
    await panel.locator('.dsec').nth(1).evaluate((el) => el.classList.contains('is-open')));
  // The titles are readable while everything is shut: a fold a reader
  // cannot judge from its head is a fold they have to open to skip.
  const foldedText = await panel.innerText();
  check('page has when-to-go', /when to go/i.test(foldedText));
  check('page has explore-further', /explore .* further/i.test(foldedText));
  await page.waitForTimeout(2500);
  // V5 (T403, row T393-a): the map lives in the highlights fold, which
  // arrives shut; open it, then look for the canvas.
  await panel.locator('.dsec').filter({ hasText: /highlights on the/i }).first().locator('button').first().click();
  await page.waitForTimeout(4000);
  check('page pins the place on a real map', await panel.locator('canvas').count() >= 1);
  // Open the costs fold for the receipt checks below.
  await panel.locator('#sec-cost .dsec-toggle').click();
  await page.waitForTimeout(1200);
  check('page shows the cost receipt', await panel.locator('.cost-receipt').count() === 1);
  // The receipt has to say what it assumed. A price a reader cannot trace
  // back to a setting is a price they must take on faith.
  const assumes = await panel.locator('.cost-assumes').innerText().catch(() => '');
  check('receipt names the lifestyle it priced for', /priced for/i.test(assumes), assumes.slice(0, 60));
  check('receipt totals a day in euros', /€\d/.test(await panel.locator('.cost-total-eur').innerText()));
  await page.screenshot({ path: 'shots/explore-panel-desktop.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.close();
} catch (e) {
  check('desktop pass ran', false, String(e).split('\n')[0]);
}

// ── Phone pass ──
try {
  const page = await boot({ width: 390, height: 844 });
  const explore = page.locator('.bottom-nav-item', { hasText: /explore/i }).first();
  // The bar mounts after the catalogue boots, which on a cold dev server is
  // later than the 2.5 s boot() waits, so wait for it instead of skipping.
  await explore.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  if (await explore.isVisible().catch(() => false)) {
    await explore.click();
    await page.waitForTimeout(1800);
  }
  check('phone grid renders', await page.locator('.explore-tab').isVisible());
  const cards = await page.locator('.xrow').count();
  check('phone shows cards', cards >= 12, `${cards} cards`);
  const gridBox = await page.locator('.xrows').boundingBox();
  check('no horizontal scroll', gridBox && gridBox.width <= 390, `grid ${Math.round(gridBox?.width || 0)}px`);

  // On a phone the filter rail sits behind the same Filters button
  // Destinations uses, and opens as the shared sheet (the desktop rail is
  // always on screen, so this is the one place a sheet is right).
  check('phone: the Filters button is on the bar', await page.locator('.explore-filterbar .places-filter-btn').isVisible());
  await page.locator('.explore-filterbar .places-filter-btn').click();
  await page.waitForTimeout(700);
  check('phone: the button opens the same rail in a sheet', await page.locator('.fsheet-explore .xrail').isVisible());
  check('phone: the sheet is a labelled dialog', await page.locator('.fsheet-explore[role="dialog"][aria-modal="true"]').count() === 1);
  check('phone: grid/map switch floats above the nav', await page.locator('.xview-fab').isVisible()
    && await page.locator('.xbar .xview-seg').isHidden());
  check('phone: one compact row per line', await page.locator('.xrows').evaluate(
    (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length === 1));
  await page.screenshot({ path: 'shots/explore-filters-phone.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  check('phone: Escape closes the sheet', await page.locator('.fsheet-explore').count() === 0);
  await page.screenshot({ path: 'shots/explore-phone.png' });

  await page.locator('.xrow-hit').first().click();
  await page.waitForTimeout(2000);
  check('phone destination page opens', await page.locator('.destp').isVisible());
  // Full bleed, back arrow as the exit; the rest of the contract lives in
  // scripts/verify_destination_page.mjs.
  const pbox = await page.locator('.destp').boundingBox();
  check('phone page covers the screen',
    !!pbox && pbox.x === 0 && pbox.y === 0 && pbox.width === 390,
    pbox ? Math.round(pbox.width) + 'x' + Math.round(pbox.height) : 'no box');
  check('phone page exits by the back arrow', await page.locator('.destp-back').isVisible());
  await page.screenshot({ path: 'shots/explore-panel-phone.png' });
  await page.close();
} catch (e) {
  check('phone pass ran', false, String(e).split('\n')[0]);
}

// ── Report ──
let failed = 0;
for (const c of checks) {
  if (!c.ok) failed += 1;
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
}
if (errors.length) {
  console.log('\nPage errors:');
  for (const e of errors.slice(0, 10)) console.log('  ' + e);
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
await browser.close();
process.exit(failed > 0 || errors.length > 0 ? 1 : 0);
