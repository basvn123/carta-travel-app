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

const boot = async (viewport, opts = {}) => {
  const page = await browser.newPage({ viewport, ...opts });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
  const NOISE = /ERR_FAILED|config is not valid/;
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

  // T590 (owner decision 4, 2026-10-22): a stand-in figure carries the tilde
  // alone, never the estimate word, and nothing else says where it came
  // from: no "not a live quote" title anywhere on a card.
  const prices = await page.locator('.xrow .xprice').allInnerTexts();
  const cardTitles = await page.locator('.xrow [title]').evaluateAll((els) => els.map((e) => e.title).join('\n'));
  check('no card prints the estimate word',
    prices.every((p) => !/\best\./.test(p)) && !/not a live quote/i.test(cardTitles),
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
  // T440: the rail is built from the kit: trip-type tiles, the budget and
  // the month as labelled selects (moved in from the row above the list),
  // one rating choice row, switches, and three quiet folds that start closed.
  check('the rail carries tiles, selects, a rating row and switches',
    await page.locator('.explore-side .xrail-tiles .ui-tile').count() === 9
    && await page.locator('.explore-side .xrail-pair select').count() === 2
    && await page.locator('.explore-side .xrail-rating [role="radio"]').count() === 4
    && await page.locator('.explore-side .xrail-switches [role="switch"]').count() >= 6);
  check('no input row above the list any more', await page.locator('.xinputs').count() === 0);
  // Every section tile carries the day cost (brief V3-5), on the kit Card.
  const railCards = await page.locator('.xtile').count();
  const railPriced = await page.locator('.xtile .xprice').count();
  check('every section tile shows a euro-a-day figure', railCards > 0 && railCards === railPriced,
    `${railPriced} of ${railCards}`);
  check('"See all" carries no count',
    (await page.locator('.xrails-all').allInnerTexts()).every((s) => !/\d/.test(s)));
  check('the three long lists start folded',
    await page.locator('.explore-side details.xrail-fold').count() === 3
    && await page.locator('.explore-side details.xrail-fold[open]').count() === 0);
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
  // "Size of place" starts closed, so the fold is opened before its Village
  // chip is pressed.
  await page.locator('.explore-side .xrail-fold-head', { hasText: /Size of place/ }).click();
  await page.waitForTimeout(300);
  await page.locator('.explore-side .xrail-fold .ui-chip', { hasText: /^Village$/ }).first().click();
  await page.waitForTimeout(700);
  const countAfter = await firstNames();
  check('the fold says how many are active',
    (await page.locator('.explore-side .xrail-fold-head .ui-chip-count').first().innerText()).trim() === '1');
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
  // T441: no number clusters; prices from the opening view, wholly inside
  // the frame; the one cheapest in view in sun; the camera on Europe.
  const pins = await page.evaluate(() => {
    const frame = document.querySelector('.xcontent-map .xmap').getBoundingClientRect();
    const labels = [...document.querySelectorAll('.xmap-kpin.is-label')].map((e) => e.getBoundingClientRect());
    const cheap = document.querySelector('.xmap-kpin.is-cheapest');
    const map = document.querySelector('.xmap-canvas')?._cartaMap;
    const best = getComputedStyle(document.documentElement).getPropertyValue('--best').trim();
    const probe = document.createElement('i');
    probe.style.color = best;
    document.body.appendChild(probe);
    const bestRgb = getComputedStyle(probe).color;
    probe.remove();
    return {
      labels: labels.length,
      inside: labels.every((r) => r.left >= frame.left && r.right <= frame.right && r.top >= frame.top && r.bottom <= frame.bottom),
      clusters: document.querySelectorAll('.xmap-kpin.is-cluster').length,
      cheapest: document.querySelectorAll('.xmap-kpin.is-cheapest').length,
      cheapSun: cheap ? getComputedStyle(cheap).backgroundColor === bestRgb : false,
      zoom: map ? map.getZoom() : null,
      center: map ? map.getCenter().toArray() : null,
    };
  });
  check('map: prices from the opening view', pins.labels >= 8, `${pins.labels} labels`);
  check('map: every label sits inside the frame', pins.inside);
  check('map: no number clusters', pins.clusters === 0);
  check('map: one cheapest in view, in sun', pins.cheapest === 1 && pins.cheapSun);
  check('map: unfiltered, the camera frames Europe', pins.zoom != null && pins.zoom >= 2.8 && pins.zoom <= 4.6
    && pins.center[0] > -5 && pins.center[0] < 25 && pins.center[1] > 40 && pins.center[1] < 58,
    pins.zoom != null ? `zoom ${pins.zoom.toFixed(2)} at ${pins.center.map((n) => n.toFixed(1)).join(', ')}` : 'no map');
  await page.screenshot({ path: 'shots/explore-desktop-map.png' });
  await page.locator('.xcontent-map .maplibregl-canvas').evaluate((c) => { c.dataset.probe = '1'; });
  await page.locator('.xbar .xview-seg [role="radio"]').first().click();
  await page.waitForTimeout(600);
  check('back to the grid, the map is hidden', await page.locator('.xcontent-map[hidden]').count() === 1
    && !(await page.locator('.maplibregl-canvas').isVisible()));
  await page.locator('.xbar .xview-seg [role="radio"]').nth(1).click();
  await page.waitForTimeout(400);
  check('map again: the same map, kept mounted', await page.locator('.maplibregl-canvas[data-probe="1"]').isVisible());
  await page.locator('.xbar .xview-seg [role="radio"]').first().click();
  await page.waitForTimeout(400);

  // ── Open a destination: it is the full-screen page now. The deep contract
  // (gallery, highlights, PDF, parking deeplinks) lives in
  // scripts/verify_destination_page.mjs; this pass only proves the door. ──
  // T444: the row is a link to the place, and opening it is one step in
  // the history, so Back closes the page onto the list.
  check('the row opens through a link', /^#dest=/.test(await page.locator('.xrow-hit').first().getAttribute('href') || ''));
  const histBefore = await page.evaluate(() => history.length);
  const rowDay = (await page.locator('.xrows .xrow').first().locator('.money').first().innerText().catch(() => '')).trim();
  await page.locator('.xrow-hit').first().click();
  await page.waitForTimeout(2500);
  const panel = page.locator('.destp');
  check('destination page opens', await panel.isVisible());
  check('opening a place names it in the address and the history',
    page.url().includes('#dest=') && await page.evaluate(() => history.length) === histBefore + 1);
  // T429: the page opens its sections (six at most, open without a click)
  // and folds five rows at most, so a reader scrolls a page, not a list of
  // headings.
  check('the page opens its sections', await panel.locator('section.dsec2').count() >= 5,
    `${await panel.locator('section.dsec2').count()} open`);
  check('at most five rows fold', await panel.locator('.dsec-toggle').count() <= 5,
    `${await panel.locator('.dsec-toggle').count()} folds`);
  const pageText = await panel.innerText();
  check('page has when-to-go', /when to go/i.test(pageText));
  check('page has explore-further', /explore .* further/i.test(pageText));
  // One cost truth (T429): the page's day figure is the row's.
  const pageDay = (await panel.locator('.dprice-day .money').innerText().catch(() => '')).trim();
  check('the page prints the row\'s day figure', !!rowDay && rowDay === pageDay, `${rowDay} / ${pageDay}`);
  check('page shows the price card', await panel.locator('.dprice').count() === 1);
  check('price card totals the stay in euros', /€\d/.test(await panel.locator('.dprice .frr-sum-eur').innerText().catch(() => '')));
  // The map mounts when its section comes near the view.
  await panel.locator('#sec-highlights').scrollIntoViewIfNeeded();
  await page.waitForTimeout(4000);
  check('page pins the place on a real map', await panel.locator('canvas').count() >= 1);
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
  check('phone: the Filters button is on the bar', await page.locator('.explore-filterbar .xfilters-btn').isVisible());
  await page.locator('.explore-filterbar .xfilters-btn').click();
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
  check('phone page exits by its back control', await page.locator('.destp .ipage-back').isVisible());
  await page.screenshot({ path: 'shots/explore-panel-phone.png' });
  await page.close();
} catch (e) {
  check('phone pass ran', false, String(e).split('\n')[0]);
}

// ── The phone map (T441), on a touch screen: full height to the nav, the
// kit switch floating, prices from the first view, and a tap on a price
// raising the peek card instead of leaving the map. ──
try {
  const page = await boot({ width: 390, height: 844 }, { hasTouch: true, isMobile: true });
  const explore = page.locator('.bottom-nav-item', { hasText: /explore/i }).first();
  await explore.waitFor({ state: 'visible', timeout: 20000 });
  await explore.tap();
  await page.waitForSelector('.xrow', { timeout: 30000 });
  await page.locator('.xview-fab [role="radio"]').nth(1).tap();
  await page.waitForSelector('.xmap.is-ready', { timeout: 20000 });
  await page.waitForTimeout(3500);
  const geo = await page.evaluate(() => {
    const m = document.querySelector('.xcontent-map .xmap').getBoundingClientRect();
    const nav = document.querySelector('.bottom-nav')?.getBoundingClientRect();
    return { top: m.top, bottom: m.bottom, width: m.width, navTop: nav ? nav.top : innerHeight };
  });
  check('phone map: full width and down to the nav', geo.width === 390 && Math.abs(geo.bottom - geo.navTop) <= 2,
    `${Math.round(geo.top)} to ${Math.round(geo.bottom)}, nav at ${Math.round(geo.navTop)}`);
  check('phone map: the sort leaves the map view, the h1 stays', await page.locator('.xbar-tools').isHidden()
    && await page.evaluate(() => [...document.querySelectorAll('h1')]
      .filter((h) => h.getClientRects().length > 0 && h.getBoundingClientRect().width > 0).length) === 1);
  const n = await page.locator('.xmap-kpin.is-label').count();
  check('phone map: prices from the first view', n >= 5, `${n} labels`);
  await page.locator('.xmap-kpin.is-label').first().tap();
  await page.waitForTimeout(1200);
  check('phone map: a tap raises the peek card, docked with a close', await page.locator('.xmap-peek .xmap-card').isVisible()
    && await page.locator('.xmap-peek-close').isVisible() && await page.locator('.destp').count() === 0);
  const dock = await page.evaluate(() => {
    const c = document.querySelector('.xmap-peek').getBoundingClientRect();
    const f = document.querySelector('.xview-fab').getBoundingClientRect();
    return { clear: c.bottom <= f.top, cardBottom: Math.round(c.bottom), fabTop: Math.round(f.top) };
  });
  check('phone map: the card sits clear of the floating switch', dock.clear, `card ${dock.cardBottom}, switch ${dock.fabTop}`);
  await page.screenshot({ path: 'shots/explore-phone-map.png' });
  await page.locator('.xmap-card-hit').tap();
  await page.waitForTimeout(2000);
  check('phone map: the card opens the place', await page.locator('.destp').isVisible());
  await page.close();
} catch (e) {
  check('phone map pass ran', false, String(e).split('\n')[0]);
}

// ── The guided search (T442), by keyboard on a desktop: the door opens a
// labelled dialog with the field in focus, a typed question offers only
// what Carta can answer, Enter applies it to Explore's own filters (and the
// URL), every row says why it answers, and Escape hands focus back. ──
try {
  const page = await boot({ width: 1440, height: 900 });
  const exploreTab = page.locator('.header-nav-item', { hasText: /^\s*explore\s*$/i }).first();
  if (await exploreTab.isVisible().catch(() => false)) await exploreTab.click();
  await page.waitForSelector('.xrow', { timeout: 30000 });
  await page.waitForTimeout(2500);
  const door = page.locator('.header-search-slot .gsearch-trigger');
  check('search: the door sits in the header', await door.isVisible());
  await door.focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('.gs-input', { timeout: 10000 });
  await page.waitForTimeout(600);
  check('search: a labelled dialog with the field in focus',
    await page.locator('.gsearch-sheet[role="dialog"][aria-modal="true"]').count() === 1
    && await page.evaluate(() => document.activeElement?.classList.contains('gs-input')));
  check('search: "Try one" offers six questions', await page.locator('.gs-try-item').count() === 6);
  check('search: five slots as tabs', await page.locator('.gs-tabs [role="tab"]').count() === 5);
  await page.keyboard.type('skiing in norway', { delay: 15 });
  await page.waitForTimeout(400);
  check('search: an unknown word is named', /skiing/.test(await page.locator('.gs-cant').textContent().catch(() => '')));
  await page.locator('.gs-input').fill('');
  await page.keyboard.type('hiking in the alps in july', { delay: 15 });
  await page.waitForTimeout(400);
  check('search: the question completes as one option',
    await page.locator('.gs-option').first().textContent().then((s) => /Hiking base, Alps, July/.test(s)));
  check('search: the combobox points at the active option',
    await page.locator('.gs-input').getAttribute('aria-activedescendant') === 'gs-opt-0');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  const url = page.url();
  check('search: Enter applies it to the filters and the URL',
    url.includes('xe=hiking') && url.includes('xa=alps') && url.includes('xm=7'), url.split('?')[1]?.slice(0, 80));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
  check('search: Escape closes and returns focus to the door', await page.locator('.gsearch-sheet').count() === 0
    && await page.evaluate(() => !!document.activeElement?.closest('.gsearch')));
  check('search: the door reads the question back', /Hiking base, Alps, July/.test(await door.textContent()));
  const whys = await page.locator('.xrow .xrow-why').allTextContents();
  check('search: every row says why it answers', whys.length >= 6 && whys.every((w) => /km|Alps|July/.test(w)),
    whys[0]);
  check('search: the sort says "Best match" while the question orders the list',
    // The sort is twinned (T474: on a phone it leads the chip row), so read the one on screen.
    await page.locator('.xgrid-sort select:visible').first().evaluate((s) => s.options[s.selectedIndex].text) === 'Best match');
  check('search: the month chip says the month whole', await page.locator('.xchip', { hasText: 'Good in July' }).count() === 1);
  await page.locator('.gsearch-clear').click();
  await page.waitForTimeout(600);
  check('search: clear empties the question', !page.url().includes('xe=') && await page.locator('.gsearch-placeholder').isVisible());
  // A budget word is a question Carta can answer (T444).
  await page.locator('.header-search-slot .gsearch-trigger').click();
  await page.waitForSelector('.gs-input');
  await page.keyboard.type('cheap beach in greece ', { delay: 10 });
  await page.waitForTimeout(400);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  check('search: "cheap" sorts the cheapest first', page.url().includes('xs=cost') && page.url().includes('xc=GR'));
  // Back from a place returns to the list, not out of Carta.
  await page.locator('.xrow-hit').first().click();
  await page.waitForTimeout(1500);
  await page.goBack();
  await page.waitForTimeout(1200);
  check('Back closes the place onto the list', await page.locator('.destp').count() === 0
    && await page.locator('.xrow').first().isVisible());
  await page.close();
} catch (e) {
  check('search pass ran', false, String(e).split('\n')[0]);
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
