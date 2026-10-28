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
//
// Explore v6 to v8 (brought up to date 2026-10-28): the tab opens as an
// overview (a hero headed "Where to next?" with the Where search and Ask
// Carta, the category tabs, the quick chips, the story rails). "Show all
// places" opens the focused list: cards are .xrow.xov.xov--card (photo in
// .xpc-media with the Score on it, name .xpc-name), and the toolbar is
// Share, Sort, Filters, Saved and one Map/List toggle. Filters opens the
// filter pane beside the list on a desktop and as a sheet on a phone; on a
// phone the Map toggle floats, and the map's list is a drawer.

import { chromium } from 'playwright';

const URL = process.argv[2] || `http://localhost:${process.env.CARTA_PORT || 4173}/`;

const browser = await chromium.launch();
const errors = [];
const checks = [];
const check = (label, ok, note = '') => { checks.push({ label, ok, note }); };

const boot = async (viewport, opts = {}) => {
  const page = await browser.newPage({ viewport, ...opts });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
  // The live data host does not answer localhost (CORS), so a dev server's
  // fetch of the flight index is refused; that is the setup, not the page.
  const NOISE = /ERR_FAILED|config is not valid|data\.carta-europetravel\.com.*blocked by CORS/;
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 120)); });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.homeSeen.v1', '1');
      localStorage.setItem('carta.welcomeSeen.v1', '1');
    } catch { /* storage unavailable */ }
  });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  // A cold dev server needs 5 to 30 s for the lazy chunks; wait for the tab
  // rather than a fixed sleep, then let it settle.
  await page.locator('.explore-tab').waitFor({ timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  return page;
};

// "Show all places" (or any quick chip) leaves the overview for the
// focused list of cards.
const showAll = async (page, tap = false) => {
  const chip = page.locator('.xquick-chip:visible', { hasText: /show all places/i }).first();
  await chip.waitFor({ timeout: 30000 });
  if (tap) await chip.tap(); else await chip.click();
  await page.locator('.xov--card').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1200);
};

// ── Desktop pass ──
try {
  const page = await boot({ width: 1440, height: 900 });
  const exploreTab = page.locator('.header-nav-item', { hasText: /^\s*explore\s*$/i }).first();
  if (await exploreTab.isVisible().catch(() => false)) {
    await exploreTab.click();
    await page.waitForTimeout(1800);
  }

  // ── The overview (v6 to v8): the hero, the category tabs, the quick chips
  // and the story rails, each rail card priced like a list card. ──
  check('explore grid renders', await page.locator('.explore-tab').isVisible());
  check('no map canvas anywhere on Explore', await page.locator('.maplibregl-canvas').count() === 0);
  await page.locator('.xrails-rail .storyr-item:not(.storyr-item--lead)').first()
    .waitFor({ state: 'attached', timeout: 30000 }).catch(() => {});
  check('Explore opens on the overview, headed "Where to next?"',
    (await page.locator('h1:visible').allInnerTexts()).map((s) => s.trim()).join('|') === 'Where to next?');
  check('the hero carries the Where search and the Ask Carta door',
    await page.locator('.xov-hero form[role="search"] .xov-where-input').isVisible()
    && await page.locator('.xov-hero .xov-ask').isVisible());
  const catTabs = await page.locator('.xcats-bar [role="tab"]').allInnerTexts();
  check('the category tabs lead with Places, selected',
    catTabs.length >= 4 && /places/i.test(catTabs[0])
    && /places/i.test(await page.locator('.xcats-bar [role="tab"][aria-selected="true"]').innerText()),
    catTabs.map((s) => s.trim()).join('|'));
  const quick = (await page.locator('.xquick-chip:visible').allInnerTexts()).map((s) => s.trim());
  check('the quick chips offer All filters, Countries and Show all places',
    ['All filters', 'Countries', 'Show all places'].every((w) => quick.some((q) => q.startsWith(w))), quick.join('|'));
  // T427: four sections at most lead the page (the trip styles row counts
  // as one), with no subtitle or position figure on any of them.
  const railN = await page.locator('.explore-tab .storyr').count();
  check('at most four sections lead the page', railN >= 2 && railN <= 4, `${railN} rails`);
  const railCards = await page.locator('.xrails-rail .storyr-item:not(.storyr-item--lead)').count();
  const railPriced = await page.locator('.xrails-rail .storyr-item:not(.storyr-item--lead) .xprice').count();
  check('every section tile shows a euro-a-day figure', railCards > 0 && railCards === railPriced,
    `${railPriced} of ${railCards}`);
  const seeAll = await page.locator('.xrails-rail .storyr-lead-open').allInnerTexts();
  check('"See all" carries no count', seeAll.length > 0 && seeAll.every((s) => !/\d/.test(s)), seeAll.join('|'));
  await page.screenshot({ path: 'shots/explore-overview-desktop.png' });

  // ── The focused list ──
  await showAll(page);
  check('Show all places opens the focused list',
    (await page.locator('.xbar .xbar-title').innerText()).trim() === 'Places in Europe' && page.url().includes('xall=1'));
  check('no map canvas on the list', await page.locator('.maplibregl-canvas').count() === 0);
  const cards = await page.locator('.xrow').count();
  check('a real page of cards', cards >= 24, `${cards} cards`);
  const withImg = await page.locator('.xrow .xpc-media img.xpc-img').count();
  check('cards carry photos', withImg >= cards * 0.8, `${withImg}/${cards}`);
  // The 640px thumb splice must resolve to real bytes, not a 404 tile.
  const imgOk = await page.waitForFunction(() => {
    const el = document.querySelector('.xrow img.xpc-img');
    return !!el && el.complete && el.naturalWidth > 0;
  }, null, { timeout: 30000 }).then(() => true).catch(() => false);
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
  const img0 = page.locator('.xrow img.xpc-img').first();
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
  await page.mouse.move(5, 5);
  await page.locator('.xrow').first().hover();
  await page.locator('.xcard-preview').waitFor({ state: 'attached', timeout: 3000 }).catch(() => {});
  const previewOpen = await page.locator('.xcard-preview').count() === 1;
  check('hovering a card explains it', previewOpen);
  // V4 (T393, explore N6): the preview is a paper popover beside or under
  // its card, never over the photograph. v6 (xpop-v6) dropped the month
  // strip and the cost bar for words: what the place is known for, the
  // best months and what a day there costs, and a way into the place.
  if (previewOpen) {
    const pop = await page.evaluate(() => {
      const p = document.querySelector('.xcard-preview');
      const m = p.closest('.xrow').querySelector('.xpc-media').getBoundingClientRect();
      const r = p.getBoundingClientRect();
      const ox = Math.max(0, Math.min(r.right, m.right) - Math.max(r.left, m.left));
      const oy = Math.max(0, Math.min(r.bottom, m.bottom) - Math.max(r.top, m.top));
      return {
        overlap: ox * oy, w: Math.round(r.width),
        lead: !!p.querySelector('.xpop-lead'),
        months: /best in|good in/i.test(p.querySelector('.xpop-verdict')?.textContent || ''),
        plan: /€\d/.test(p.querySelector('.xpop-plan')?.textContent || ''),
        open: /^#dest=/.test(p.querySelector('.xpop-open')?.getAttribute('href') || ''),
      };
    });
    check('the preview never covers the photograph', pop.overlap === 0 && pop.w <= 321, JSON.stringify(pop));
    check('the preview says what it is known for, when to go, a day\'s cost, and opens it',
      pop.lead && pop.months && pop.plan && pop.open, JSON.stringify(pop));
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

  // C6: no modal sheet on a desktop. v6 put the filters behind the toolbar's
  // Filters button: it opens the same pane beside the list (not a dialog),
  // the button counts what is active, and turning a knob narrows the list
  // live.
  check('no filter modal anywhere', await page.locator('.fsheet-explore').count() === 0);
  // T427: the row carries no kind word, so "narrows live" is read off the
  // first names on the list, which change when the filter lands.
  const firstNames = async () => (await page.locator('.xrow .xrow-name').allInnerTexts()).slice(0, 12).join('|');
  check('the control bar heads the feed', await page.locator('.xbar .xbar-title').isVisible());
  // The count is read to screen readers only (.xbar-count.sr-only); nothing
  // beside the title shows a number.
  check('the title stands alone (no count beside it)',
    (await page.locator('.xbar .xbar-title').innerText()).trim() === 'Places in Europe'
    && await page.locator('.xbar-count:not(.sr-only)').count() === 0);
  check('no tier legend', await page.locator('.tierlegend, .tierlegend-row').count() === 0);
  const toolLabels = (await page.locator('.xbar-tools .xtool:visible').allInnerTexts()).map((s) => s.trim());
  check('the toolbar is Share, Sort, Filters, Saved and one Map toggle',
    toolLabels.join('|') === 'Share|Sort|Filters|Saved'
    && await page.locator('.xbar-tools .xview-toggle:visible').count() === 1
    && (await page.locator('.xbar-tools .xview-toggle').innerText()).trim() === 'Map',
    `${toolLabels.join('|')} + ${await page.locator('.xbar-tools .xview-toggle').innerText().catch(() => 'no toggle')}`);
  check('no second results header mid-page', await page.locator('.xgrid-head').count() === 0);
  check('no input row above the list any more', await page.locator('.xinputs').count() === 0);
  // The sort is a menu of four, not a select. The menu closes on any scroll
  // (a scroll-anchoring nudge from a late image counts), so it is opened
  // from the top of the tab's own scroller with the scroll at rest.
  await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.explore-tab')?.scrollTo(0, 0); });
  await page.waitForTimeout(600);
  await page.locator('.xbar-tools .xtool', { hasText: 'Sort' }).click();
  await page.locator('.xsort-menu[role="menu"] [role="menuitemradio"]').first().waitFor({ timeout: 5000 }).catch(() => {});
  const sortItems = (await page.locator('.xsort-menu[role="menu"] [role="menuitemradio"]').allInnerTexts()).map((s) => s.trim());
  check('Sort opens a menu: Rating, Cheapest day, A-Z, Country',
    sortItems.join('|') === 'Rating|Cheapest day|A-Z|Country', sortItems.join('|'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const filtersBtn = page.locator('.xbar-tools .xtool[aria-controls="explore-side"]');
  check('the filter pane waits behind the Filters button', !(await page.locator('.explore-side .xrail').isVisible()));
  await filtersBtn.click();
  await page.waitForTimeout(900);
  check('Filters opens the pane beside the list',
    await page.locator('.explore-side .xrail').isVisible()
    && await filtersBtn.getAttribute('aria-expanded') === 'true'
    && await page.locator('.xrow').first().isVisible());
  // The pane is built from the kit: kind chips, a size row, a budget range,
  // the months, one rating choice row and the switches, as open sections.
  const pane = await page.evaluate(() => {
    const s = document.querySelector('.explore-side');
    const sec = (name) => [...s.querySelectorAll('.xpane-sec')].find((x) => x.querySelector('.xrail-h')?.textContent.trim() === name);
    return {
      sections: s.querySelectorAll('.xpane-sec').length,
      kinds: sec('Kind of place')?.querySelectorAll('.ui-chip').length || 0,
      sizes: sec('Size of place')?.querySelectorAll('.ui-chip').length || 0,
      budget: sec('Budget a day')?.querySelectorAll('input[type="range"]').length || 0,
      months: sec('Month')?.querySelectorAll('[role="radio"]').length || 0,
      rating: sec('Rating')?.querySelectorAll('[role="radio"]').length || 0,
      switches: s.querySelectorAll('.xpane [role="switch"]').length,
    };
  });
  check('the pane carries kind and size chips, a budget range, months, a rating row and switches',
    pane.kinds === 9 && pane.sizes >= 4 && pane.budget === 2 && pane.months === 13
    && pane.rating === 4 && pane.switches >= 6, JSON.stringify(pane));
  // A card: the name, the Score, the country, the price.
  const bodyFacts = await page.locator('.xrow').first().locator('.xrow-name, .score-chip, .xrow-country, .xprice').count();
  check('the card carries its four facts', bodyFacts === 4, `${bodyFacts} parts`);
  // v6 puts the Score on the photograph (.xpc-score); nothing else sits there.
  check('only the Score sits on the card photograph',
    await page.locator('.xrow').first().locator('.xpc-media > .xpc-score').count() === 1
    && await page.locator('.xrow').first().locator('.xpc-media > :not(img):not(.xpc-score)').count() === 0);
  const countBefore = await firstNames();
  await page.locator('.explore-side .xpane-sec', { hasText: 'Size of place' })
    .locator('.ui-chip', { hasText: /^Village$/ }).first().click();
  await page.waitForTimeout(900);
  const countAfter = await firstNames();
  check('the Filters button says how many are active',
    (await filtersBtn.locator('.xfilters-n').innerText().catch(() => '')).trim() === '1');
  check('a pane toggle narrows the list live', countBefore !== '' && countAfter !== countBefore,
    `${countBefore.slice(0, 40)} -> ${countAfter.slice(0, 40)}`);
  check('the active filter shows as a chip', await page.locator('.xchip', { hasText: /Village/ }).count() === 1);
  check('the filter landed in the URL', page.url().includes('xk=village'));
  await page.screenshot({ path: 'shots/explore-filters-desktop.png' });
  await page.locator('.xchip', { hasText: /Village/ }).click();
  await page.waitForTimeout(500);
  check('removing the chip clears the filter', !page.url().includes('xk=village')
    && await page.locator('.xchip', { hasText: /Village/ }).count() === 0);
  await filtersBtn.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'shots/explore-desktop.png', fullPage: false });

  // C7 in v5: on a desktop the map stands beside the grid, not in its place,
  // and the bar's count follows the viewport. v6: the two-way switch is one
  // toggle that names the other view (Map, then List).
  const viewToggle = page.locator('.xbar-tools .xview-toggle');
  await viewToggle.click();
  await page.waitForTimeout(4000);
  check('map view splits the feed', await page.locator('.xcontent--split').count() === 1);
  check('the map canvas is up', await page.locator('.xcontent-map .maplibregl-canvas').count() === 1);
  check('the list stays beside the map', await page.locator('.xcontent--split .xrows .xrow').first().isVisible());
  check('on the map the toggle offers the list', (await viewToggle.innerText()).trim() === 'List');
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
  await viewToggle.click();
  await page.waitForTimeout(600);
  check('back to the grid, the map is hidden', await page.locator('.xcontent-map[hidden]').count() === 1
    && !(await page.locator('.maplibregl-canvas').isVisible()));
  await viewToggle.click();
  await page.waitForTimeout(400);
  check('map again: the same map, kept mounted', await page.locator('.maplibregl-canvas[data-probe="1"]').isVisible());
  await viewToggle.click();
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
  // The page first, then its dossier: on a cold server both take a while.
  await page.locator('.destp .destp-head').waitFor({ timeout: 30000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('.destp-wait'), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1000);
  const panel = page.locator('.destp');
  // T502 (T499): the page is four tabs, and a section is only in the DOM on
  // its own tab.
  const destTab = async (name) => {
    await panel.locator('[role="tab"]', { hasText: name }).first().click();
    await page.waitForTimeout(1500);
  };
  check('destination page opens', await panel.isVisible());
  check('opening a place names it in the address and the history',
    page.url().includes('#dest=') && await page.evaluate(() => history.length) === histBefore + 1);
  // T429: the page opens its sections (open without a click) and folds
  // five rows at most, so a reader scrolls a page, not a list of headings.
  // Since the tabs (T499) the Overview holds three or more open sections
  // and the folds live on Practical.
  check('the page opens its sections', await panel.locator('section.dsec2').count() >= 3
    && await panel.locator('.dsec-toggle').count() === 0,
    `${await panel.locator('section.dsec2').count()} open`);
  const tabNames = (await panel.locator('[role="tab"]').allInnerTexts()).map((x) => x.trim());
  check('page has when-to-go', tabNames.includes('When to go'), tabNames.join('|'));
  // One cost truth (T429): the page's day figure is the row's.
  const pageDay = (await panel.locator('.dprice-day .money').innerText().catch(() => '')).trim();
  check('the page prints the row\'s day figure', !!rowDay && rowDay === pageDay, `${rowDay} / ${pageDay}`);
  check('page shows the price card', await panel.locator('.dprice').count() === 1);
  check('price card totals the stay in euros', /€\d/.test(await panel.locator('.dprice .frr-sum-eur').innerText().catch(() => '')));
  await destTab('Practical');
  check('at most five rows fold', await panel.locator('.dsec-toggle').count() <= 5,
    `${await panel.locator('.dsec-toggle').count()} folds`);
  check('page has explore-further (Practical)', /explore .* further/i.test(await panel.innerText()));
  // The map mounts when its section comes near the view (on Nearby).
  await destTab('Nearby');
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
  await explore.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
  if (await explore.isVisible().catch(() => false)) {
    await explore.click();
    await page.waitForTimeout(1800);
  }
  check('phone grid renders', await page.locator('.explore-tab').isVisible());
  await showAll(page);
  const cards = await page.locator('.xrow').count();
  check('phone shows cards', cards >= 12, `${cards} cards`);
  const gridBox = await page.locator('.xrows').boundingBox();
  check('no horizontal scroll', !!gridBox && gridBox.width > 0 && gridBox.width <= 390, `grid ${Math.round(gridBox?.width || 0)}px`);

  // On a phone the filter pane sits behind the toolbar's Filters button and
  // opens as the shared sheet (the desktop pane stands beside the list, so
  // this is the one place a sheet is right).
  const filtersBtn = page.locator('.xbar-tools .xtool:visible', { hasText: /^Filters/ });
  check('phone: the Filters button is on the bar', await filtersBtn.first().isVisible());
  await filtersBtn.first().click();
  await page.waitForTimeout(900);
  check('phone: the button opens the same pane in a sheet', await page.locator('.fsheet-explore .xrail').isVisible());
  check('phone: the sheet is a labelled dialog', await page.locator('.fsheet-explore[role="dialog"][aria-modal="true"]').count() === 1);
  check('phone: the Map toggle floats above the nav', await page.locator('.xview-fab').isVisible()
    && await page.locator('.xbar-tools .xview-toggle').isHidden());
  check('phone: one compact row per line', await page.locator('.xrows').evaluate(
    (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length === 1));
  await page.screenshot({ path: 'shots/explore-filters-phone.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  check('phone: Escape closes the sheet', await page.locator('.fsheet-explore').count() === 0);
  await page.screenshot({ path: 'shots/explore-phone.png' });

  await page.locator('.xrow-hit').first().click();
  await page.locator('.destp').waitFor({ timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1000);
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

// ── The phone map (T441, T592), on a touch screen: full height to the nav,
// prices from the first view, and a tap on a price picking the place into
// the map drawer (MapPlacePanel) instead of leaving the map; the drawer's
// one primary then opens the place. ──
try {
  const page = await boot({ width: 390, height: 844 }, { hasTouch: true, isMobile: true });
  const explore = page.locator('.bottom-nav-item', { hasText: /explore/i }).first();
  await explore.waitFor({ state: 'visible', timeout: 30000 });
  await explore.tap();
  await showAll(page, true);
  await page.locator('.xview-fab .xview-toggle').tap();
  await page.waitForSelector('.xmap.is-ready', { timeout: 30000 });
  await page.waitForTimeout(3500);
  const geo = await page.evaluate(() => {
    const m = document.querySelector('.xcontent-map .xmap').getBoundingClientRect();
    const nav = document.querySelector('.bottom-nav')?.getBoundingClientRect();
    return { top: m.top, bottom: m.bottom, width: m.width, navTop: nav ? nav.top : innerHeight };
  });
  check('phone map: full width and down to the nav', geo.width === 390 && Math.abs(geo.bottom - geo.navTop) <= 2,
    `${Math.round(geo.top)} to ${Math.round(geo.bottom)}, nav at ${Math.round(geo.navTop)}`);
  // The sort no longer leaves the map view (the toolbar stays, T592); the
  // way back to the list is the drawer strip's toggle, and the h1 stays.
  check('phone map: the drawer strip offers the list, the h1 stays',
    /list/i.test(await page.locator('.xdrawer .map-drawer-strip .xview-toggle').innerText().catch(() => ''))
    && await page.evaluate(() => [...document.querySelectorAll('h1')]
      .filter((h) => h.getClientRects().length > 0 && h.getBoundingClientRect().width > 0).length) === 1);
  const n = await page.locator('.xmap-kpin.is-label').count();
  check('phone map: prices from the first view', n >= 5, `${n} labels`);
  const pickedName = (await page.locator('.xmap-kpin.is-label').first().innerText().catch(() => '')).replace(/€\s?\d+/, '').trim();
  await page.locator('.xmap-kpin.is-label').first().tap();
  await page.waitForTimeout(1500);
  check('phone map: a tap picks the place into the drawer, the map stays',
    await page.locator('.xdrawer .mpp.is-picked .mpp-place').isVisible()
    && await page.locator('.destp').count() === 0
    && (!pickedName || (await page.locator('.xdrawer .mpp-name').innerText().catch(() => '')).includes(pickedName)),
    pickedName);
  // The drawer runs on under the nav at its half stop (the rest is a drag
  // or the handle away), so this reads where the picked place starts: at
  // least its photograph's first 120 px in view above the nav, under the map.
  const dock = await page.evaluate(() => {
    const c = document.querySelector('.xdrawer .mpp-place').getBoundingClientRect();
    const nav = document.querySelector('.bottom-nav').getBoundingClientRect();
    return { clear: c.top >= 0 && c.top <= nav.top - 120, placeTop: Math.round(c.top), navTop: Math.round(nav.top) };
  });
  check('phone map: the picked place rises into view above the nav', dock.clear, `place at ${dock.placeTop}, nav ${dock.navTop}`);
  await page.screenshot({ path: 'shots/explore-phone-map.png' });
  await page.locator('.xdrawer .mpp-open').tap();
  await page.locator('.destp').waitFor({ timeout: 30000 }).catch(() => {});
  check('phone map: the drawer opens the place', await page.locator('.destp').isVisible());
  await page.close();
} catch (e) {
  check('phone map pass ran', false, String(e).split('\n')[0]);
}

// ── The search, by keyboard on a desktop. The guided search door (T442,
// .gsearch-trigger in the header) left Explore with v6: the header slot is
// Destinations' now, and Explore's search is the hero's Where field
// (T622) beside the Ask Carta door. A typed place narrows the list to the
// places that match and shows as a chip; clearing the chip brings the list
// back; the Sort menu's Cheapest day orders by the day figure. ──
try {
  const page = await boot({ width: 1440, height: 900 });
  const exploreTab = page.locator('.header-nav-item', { hasText: /^\s*explore\s*$/i }).first();
  if (await exploreTab.isVisible().catch(() => false)) await exploreTab.click();
  const where = page.locator('.xov-hero .xov-where-input');
  await where.waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  check('search: the Where field is labelled', await page.evaluate(() => {
    const i = document.querySelector('.xov-where-input');
    return !!i && !!document.querySelector(`label[for="${CSS.escape(i.id)}"]`)?.textContent.trim();
  }));
  await where.focus();
  await page.keyboard.type('Rome', { delay: 15 });
  await page.keyboard.press('Enter');
  await page.locator('.xov--card').first().waitFor({ timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const hits = await page.locator('.xrow .xrow-name').allInnerTexts();
  check('search: Enter narrows the list to the places that match',
    hits.length >= 1 && hits.length < 24 && hits[0].trim() === 'Rome'
    && hits.every((h) => /rome/i.test(h.normalize('NFD').replace(/[̀-ͯ]/g, ''))),
    hits.slice(0, 5).join('|'));
  const qChip = page.locator('.xchip', { hasText: /Rome/ });
  check('search: the question shows as a chip', await qChip.count() === 1);
  const whys = await page.locator('.xrow .xrow-why').allTextContents();
  check('search: every row says when it is good', whys.length >= hits.length && whys.every((w) => /\b(best|good) in\b/i.test(w)),
    whys[0]);
  await qChip.click();
  await page.waitForTimeout(900);
  check('search: clearing the chip brings the whole list back', await page.locator('.xchip', { hasText: /Rome/ }).count() === 0
    && await page.locator('.xrow').count() >= 24);
  // "Cheapest day" sorts by the day figure, cheapest first.
  if (!(await page.locator('.xbar-tools .xtool', { hasText: 'Sort' }).isVisible().catch(() => false))) await showAll(page);
  await page.locator('.xbar-tools .xtool', { hasText: 'Sort' }).click();
  await page.locator('.xsort-menu [role="menuitemradio"]', { hasText: 'Cheapest day' }).click();
  await page.waitForTimeout(900);
  const days = (await page.locator('.xrow .pitems-trigger .money').allInnerTexts()).slice(0, 10)
    .map((s) => Number(s.replace(/[^\d]/g, '')));
  check('search: "Cheapest day" sorts the cheapest first',
    days.length >= 5 && days.every((d, i) => i === 0 || d >= days[i - 1]) && page.url().includes('xs=cost'),
    `${days.join(' ')} ${page.url().includes('xs=cost') ? 'xs=cost' : 'no xs=cost'}`);
  // Back from a place returns to the list, not out of Carta.
  await page.locator('.xrow-hit').first().click();
  await page.locator('.destp').waitFor({ timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);
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
