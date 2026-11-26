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
// Viantra, the category tabs, the quick chips, the story rails). "Show all
// places" opens the focused list: rows are .xrow.xov (house style 2026-11:
// photo in .xrow-media with nothing on it, the Score plate .xscore after the
// name, the formation .xprice), the rails are the house .hs-rail-sec with
// .hs-rcard cards and .hs-see-all, and the toolbar is
// Share, Sort, Filters, Saved and one Map/List toggle. Filters opens the
// filter pane beside the list on a desktop and as a sheet on a phone; on a
// phone the Map toggle floats, and the map's list is a drawer.

import { chromium } from 'playwright';
import { mirrorData } from './lib/dataMirror.mjs';

const URL = process.argv[2] || `http://localhost:${process.env.CARTA_PORT || 4173}/`;

const browser = await chromium.launch();
const errors = [];
const checks = [];
const check = (label, ok, note = '') => { checks.push({ label, ok, note }); };
// T1089 needs: network (Wikimedia photos and the map's base tiles). A check
// that needs them passes with a SKIP note only when the host truly does not
// answer from here; with a network it is a real check.
const ONLINE = await fetch('https://upload.wikimedia.org/', { method: 'HEAD', signal: AbortSignal.timeout(5000) })
  .then(() => true).catch(() => false);
const netCheck = (label, ok, note = '') => (ONLINE || ok
  ? check(label, ok, note) : check(label, true, 'SKIP (needs network)'));

const boot = async (viewport, opts = {}) => {
  const page = await browser.newPage({ viewport, ...opts });
  await mirrorData(page);
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
  // T1089: the "Show all places" chip left the overview; the first rail's
  // "See all" opens the focused list (filtered to Excellent and up).
  const chip = page.locator('.xrails-rail .hs-see-all:visible').first();
  await chip.waitFor({ timeout: 30000 });
  if (tap) await chip.tap(); else await chip.click();
  await page.locator('.xrows .xrow').first().waitFor({ timeout: 30000 });
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
  await page.locator('.xrails-rail .hs-rcard').first()
    .waitFor({ state: 'attached', timeout: 30000 }).catch(() => {});
  check('Explore opens on the overview, headed "Where to next?"',
    (await page.locator('h1:visible').allInnerTexts()).map((s) => s.trim()).join('|') === 'Where to next?');
  // G12 Explore top (2026-11-19): the band's one search field with its
  // umber search button at the end, and Ask Viantra beside it.
  check('the band carries the search field and its search button',
    await page.locator('.band form[role="search"] .band-input').isVisible()
    && await page.locator('.band form[role="search"] .band-go').isVisible());
  check('Ask Viantra stands beside the field',
    await page.locator('.band .band-ask').isVisible()
    && /ask/i.test(await page.locator('.band .band-ask').innerText().catch(() => '')));
  const catTabs = await page.locator('.xcats-bar [role="tab"]').allInnerTexts();
  check('the category tabs lead with Places, selected',
    catTabs.length >= 4 && /places/i.test(catTabs[0])
    && /places/i.test(await page.locator('.xcats-bar [role="tab"][aria-selected="true"]').innerText()),
    catTabs.map((s) => s.trim()).join('|'));
  // The settings the prices depend on, as chips: the style first, then
  // From, When, the way and how prices read, each opening its step.
  const chips = (await page.locator('.band .band-chip:visible').allInnerTexts()).map((s) => s.trim());
  check('the settings chips show the style and the price inputs',
    chips.length >= 5 && await page.locator('.band .band-chip.is-style:visible').count() === 1
    && chips.some((c) => /^From /.test(c)), chips.join('|'));
  // Explore rails (owner 2026-11-18, G12; T427's cap of four lifted): every
  // rail with four places or more is drawn, so the page runs long, with no
  // subtitle or position figure on any of them.
  const railN = await page.locator('.explore-tab .hs-rail-sec').count();
  check('the overview draws many rails', railN >= 8, `${railN} rails`);
  // A drawn place card shows its figure with its basis right under it at
  // the card's foot (G12, D10, Explore clean 2026-11-20); no "+".
  const rc = await page.evaluate(() => {
    const out = { cards: 0, priced: 0, apart: [] };
    for (const c of document.querySelectorAll('.xrails-rail .xrc')) {
      out.cards += 1;
      const fig = c.querySelector('.xrc-foot .xrc-fig');
      const basis = c.querySelector('.xrc-foot .xrc-basis');
      if (fig && /€/.test(fig.textContent) && !/\+/.test(fig.textContent)) out.priced += 1;
      if (fig && basis) {
        const d = basis.getBoundingClientRect().top - fig.getBoundingClientRect().bottom;
        if (d < -1 || d > 8) out.apart.push(d.toFixed(1));
      }
    }
    return out;
  });
  check('every rail card shows a euro figure with no "+"', rc.cards > 0 && rc.priced === rc.cards, `${rc.priced} of ${rc.cards}`);
  check('the basis sits right under the figure', !rc.apart.length, rc.apart.slice(0, 4).join(', '));
  // Every rail has its See all; the first strip ends on the See all tile
  // (a strip draws its cards near the view, so scroll it to its end first).
  check('every rail has a See all', await page.locator('.xrails-rail .hs-see-all').count() === railN);
  await page.locator('.xrails-rail .hs-rail').first().evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  await page.waitForTimeout(800);
  await page.locator('.xrails-rail .hs-rail').first().evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  await page.waitForTimeout(800);
  check('the first strip ends on its See all tile', await page.locator('.xrails-rail').first().locator('.xrc-more').count() === 1);
  const seeAll = await page.locator('.xrails-rail .hs-see-all').allInnerTexts();
  check('"See all" carries no count', seeAll.length > 0 && seeAll.every((s) => !/\d/.test(s)), seeAll.join('|'));
  await page.screenshot({ path: 'shots/explore-overview-desktop.png' });

  // ── The focused list ──
  await showAll(page);
  // G12 Explore top: the focused list's title is read, not drawn (the band
  // and the tabs name it).
  check('Show all places opens the focused list',
    (await page.locator('h1.xhead-title').innerText().catch(() => '')).trim() === 'Places' && /[?&]xv=/.test(page.url()));
  check('no map canvas on the list', await page.locator('.maplibregl-canvas').count() === 0);
  const cards = await page.locator('.xrow').count();
  check('a real page of cards', cards >= 24, `${cards} cards`);
  const withImg = await page.locator('.xrow .xrow-media img.xrow-img').count();
  check('cards carry photos', withImg >= cards * 0.8, `${withImg}/${cards}`);
  // The 640px thumb splice must resolve to real bytes, not a 404 tile.
  const imgOk = await page.waitForFunction(() => {
    const el = document.querySelector('.xrow img.xrow-img');
    return !!el && el.complete && el.naturalWidth > 0;
  }, null, { timeout: 30000 }).then(() => true).catch(() => false);
  netCheck('spliced card thumb actually loads', imgOk);
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
  // G12 (explore polish): the one door is the style disc in the bottom-left
  // corner. Style Studio (2026-11-18): it opens the studio, the one place the
  // bed and the table are set (step 2 of a style); a saved style moves the
  // prices, a draft does not.
  check('one Lifestyle control on screen',
    await page.locator('.dock--corner .dock-trigger:visible').count() === 1
    && await page.locator('.settings-part-lifestyle:visible, .explore-shell .lifestyle-btn:visible, .lifestyle-panel').count() === 0);
  const priceText = () => page.locator('.xrow .xprice .money:visible').allInnerTexts();
  const beforeLs = (await priceText()).slice(0, 8).join(' ');
  await page.locator('.dock--corner .dock-trigger:visible').first().click();
  const studio = page.locator('.fsheet.sst[role="dialog"]');
  check('the disc opens the Style Studio', await studio.waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false));
  // A first visit has no style: make one "On my own" (the first who), which
  // also turns on its taste, so the toolbar gains Strong match and the sort
  // gains For you (checked below).
  let styled = false;
  const create = studio.getByRole('button', { name: 'Create a travel style' }).first();
  if (await create.isVisible().catch(() => false)) {
    await create.click();
    await page.waitForTimeout(500);
    await studio.locator('.sst-rows [role="radio"]').first().click();
    await page.waitForTimeout(300);
    await studio.getByRole('button', { name: 'Next', exact: true }).click();
    await page.waitForTimeout(600);
    const otherBed = studio.locator('.sst-spend .sst-tiles').first().locator('[role="radio"][aria-checked="false"]').first();
    check('step 2 offers another bed', await otherBed.count() === 1);
    if (await otherBed.count()) await otherBed.click();
    await page.waitForTimeout(400);
    check('a draft does not reprice the list', (await priceText()).slice(0, 8).join(' ') === beforeLs);
    for (let i = 0; i < 2; i += 1) {
      await studio.getByRole('button', { name: 'Next', exact: true }).click();
      await page.waitForTimeout(400);
    }
    await studio.getByRole('button', { name: 'Save style', exact: true }).click();
    await page.waitForTimeout(900);
    styled = (await studio.locator('.sst-card-hit[role="radio"]').count()) === 1;
    check('Save style makes the style', styled);
  }
  await page.keyboard.press('Escape');
  await studio.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
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
      const m = p.closest('.xrow').querySelector('.xrow-media').getBoundingClientRect();
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

  // G12 Explore top (2026-11-19): the list's tools are the applied row
  // (the active chips, Clear all, Sort, Saved, Share), Filters sits inside
  // the band's field with its count, and List | Map is one Segmented
  // control beside the tabs. Filters opens a dialog (FilterSheet).
  const firstNames = async () => (await page.locator('.xrow .xrow-name').allInnerTexts()).slice(0, 12).join('|');
  check('no count beside the title', await page.locator('.xbar-count:not(.sr-only)').count() === 0);
  check('no tier legend', await page.locator('.tierlegend, .tierlegend-row').count() === 0);
  const sortBtn = page.locator('.xap .btn', { hasText: /^Sort/ }).first();
  check('the applied row carries Sort, Saved and Share',
    await sortBtn.isVisible() && await page.locator('.xap .xap-saved:visible').count() === 1
    && await page.locator('.xap .xap-share:visible').count() === 1);
  const seg = (name) => page.locator('.seg-item', { hasText: new RegExp(`^\\s*${name}\\s*$`) }).first();
  check('List | Map is one Segmented control, List chosen',
    await seg('List').isVisible() && await seg('Map').isVisible()
    && /is-selected/.test(await seg('List').getAttribute('class') || ''));
  check('no second results header mid-page', await page.locator('.xgrid-head').count() === 0);
  // The sort is a menu, not a select. It closes on any scroll, so it is
  // opened from the top of the tab's own scroller with the scroll at rest.
  await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.explore-tab')?.scrollTo(0, 0); });
  await page.waitForTimeout(600);
  await sortBtn.click();
  await page.locator('.xsort-menu[role="menu"] [role="menuitemradio"]').first().waitFor({ timeout: 5000 }).catch(() => {});
  const sortItems = (await page.locator('.xsort-menu[role="menu"] [role="menuitemradio"]').allInnerTexts()).map((x) => x.trim());
  check('Sort opens a menu with the Score, a price order and A to Z',
    sortItems.length >= 4 && sortItems.some((x) => /score|rating/i.test(x)) && sortItems.some((x) => /price|cheap/i.test(x))
    && sortItems.some((x) => /A.?(to)?.?Z/i.test(x)), sortItems.join('|'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  // A card: the name, the Score plate after it, the country, the figure.
  const bodyFacts = await page.locator('.xrow').first().locator('.xrow-name, .xrow-line1 > .hs-score, .xrow-country, .xfig-amount').count();
  check('the card carries its four facts', bodyFacts === 4, `${bodyFacts} parts`);
  check('nothing sits on the row photograph',
    await page.locator('.xrow').first().locator('.xrow-media > :not(img):not(picture.ladder-pic):not(.hero-blank)').count() === 0);
  // Filters: the band's button counts what is active (See all lands on Top
  // rated, so one), opens the dialog, a chip there narrows the list live
  // and shows as a removable chip in the applied row.
  const filtersBtn = page.locator('.band .band-filters');
  const nActive = async () => Number((await filtersBtn.locator('.band-count').innerText().catch(() => '0')).trim() || 0);
  const activeBefore = await nActive();
  check('the Filters button counts the active filters', activeBefore >= 1, `${activeBefore}`);
  const countBefore = await firstNames();
  const chipsBefore = await page.locator('.xap .xap-chip').count();
  await filtersBtn.click();
  // On a desktop the filters are a non-modal panel (a region), so the list
  // stays readable while a chip narrows it.
  const sheet = page.locator('.flt.flt-panel[role="region"]');
  check('Filters opens the filter panel', await sheet.waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false));
  const sections = await sheet.locator('.flt-label').count();
  check('the panel holds its sections', sections >= 5, `${sections} sections`);
  await sheet.locator('.flt-chip[aria-pressed="false"]').first().click();
  await page.waitForTimeout(900);
  await sheet.locator('.flt-close').click();
  await page.waitForTimeout(700);
  check('a filter narrows the list live', countBefore !== '' && (await firstNames()) !== countBefore);
  check('the Filters count goes up by one', await nActive() === activeBefore + 1, `${activeBefore} -> ${await nActive()}`);
  check('the filter shows as a removable chip', await page.locator('.xap .xap-chip').count() === chipsBefore + 1);
  await page.screenshot({ path: 'shots/explore-filters-desktop.png' });
  await page.locator('.xap .xap-chip .xap-x').last().click();
  await page.waitForTimeout(700);
  check('removing the chip clears the filter', await nActive() === activeBefore
    && await page.locator('.xap .xap-chip').count() === chipsBefore);
  await page.screenshot({ path: 'shots/explore-desktop.png', fullPage: false });

  // On a desktop the map stands beside the list, not in its place.
  await seg('Map').click();
  await page.waitForTimeout(4000);
  check('map view splits the feed', await page.locator('.xcontent--split').count() === 1);
  await page.waitForTimeout(1500);
  check('map column: no country and no name is cut', await page.evaluate(() => [...document.querySelectorAll('.mpp-rows .xrow-ctry, .mpp-rows .xrow-name')]
    .every((e) => e.scrollWidth <= e.clientWidth + 1)));
  check('the map canvas is up', await page.locator('.xcontent-map .maplibregl-canvas').count() === 1);
  check('the list stays beside the map', await page.locator('.xcontent--split .xrows .xrow').first().isVisible());
  check('on the map, Map is the chosen segment', /is-selected/.test(await seg('Map').getAttribute('class') || ''));
  const pins = await page.evaluate(() => {
    const map = document.querySelector('.xcontent-map .xmap-canvas')?._cartaMap;
    if (!map) return { labels: 0, inside: false, cheapest: 0, domPills: 0, zoom: null, center: null };
    const W = map.getCanvas().clientWidth; const H = map.getCanvas().clientHeight;
    const q = (l) => (map.getLayer(l) ? map.queryRenderedFeatures({ layers: [l] }) : []);
    const pills = [...q('xpin'), ...q('xpin-best')];
    return {
      labels: pills.length,
      inside: pills.every((f) => { const pt = map.project(f.geometry.coordinates); return pt.x > 0 && pt.y > 0 && pt.x < W && pt.y < H; }),
      // Round 2: the best value is a pill, or a photo pin whose kind ends
      // in "b" (mapPins.js faceId), never both.
      cheapest: q('xpin-best').length + q('xpin-photo').filter((f) => /b$/.test(String(f.properties.img || '').split('\t')[1] || '')).length,
      domPills: document.querySelectorAll('.xmap-kpin.is-label, .xmap-kpin-label').length,
      // In the pins' data, drawn or not (MapLibre's collision guard may hide one).
      bestData: (map.getSource('dests')?._data?.geojson?.features || map.getSource('dests')?._data?.features || [])
        .filter((f) => f.properties.best === 1).map((f) => f.properties.city).join(', '),
      zoom: map.getZoom(),
      center: map.getCenter().toArray(),
    };
  });
  netCheck('map: prices from the opening view', pins.labels >= 8, `${pins.labels} labels`);
  check('map: every pill sits inside the frame', pins.inside);
  check('map: the pins are map layers, not DOM', pins.domPills === 0);
  netCheck('map: one best value in view', pins.cheapest === 1, `${pins.cheapest} drawn, in the data: ${pins.bestData || 'none'}, zoom ${pins.zoom?.toFixed(2)}`);
  await page.screenshot({ path: 'shots/explore-desktop-map.png' });
  await page.locator('.xcontent-map .maplibregl-canvas').evaluate((c) => { c.dataset.probe = '1'; });
  await seg('List').click();
  await page.waitForTimeout(600);
  check('back to the list, the map is hidden', !(await page.locator('.maplibregl-canvas').isVisible()));
  await seg('Map').click();
  await page.waitForTimeout(400);
  check('map again: the same map, kept mounted', await page.locator('.maplibregl-canvas[data-probe="1"]').isVisible());
  await seg('List').click();
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
  await page.locator('.destp .pt-title').waitFor({ timeout: 30000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('.destp-wait'), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1000);
  const panel = page.locator('.destp');
  check('destination page opens', await panel.isVisible());
  check('opening a place names it in the address and the history',
    page.url().includes('#dest=') && await page.evaluate(() => history.length) === histBefore + 1);
  // T1089: the page is one long template (pt-*) since T1019: sections are
  // always open, the jump bar names them, the folds are the Practical rows.
  check('the page opens its sections', await panel.locator('.pt-sec').count() >= 3,
    `${await panel.locator('.pt-sec').count()} sections`);
  const jumpNames = (await panel.locator('.pt-jump-link').allInnerTexts()).map((x) => x.trim());
  check('page has when-to-go', jumpNames.includes('When to go'), jumpNames.join('|'));
  // One cost truth (T429): the page's day figure is the row's.
  const pageDay = (await panel.locator('.tcard-each .money').last().innerText().catch(() => '')).trim();
  check('the page prints the row\'s day figure', !!rowDay && rowDay === pageDay, `${rowDay} / ${pageDay}`);
  check('page shows the price card', await panel.locator('.tcard').count() === 1);
  check('price card totals the stay in euros', /€\d/.test(await panel.locator('.tcard-total .money').innerText().catch(() => '')));
  check('at most five rows fold', await panel.locator('.pt-fold').count() <= 5,
    `${await panel.locator('.pt-fold').count()} folds`);
  check('page has explore-further (Practical)', /explore .* further|places like this/i.test(await panel.innerText()));
  await panel.locator('#pt-see').scrollIntoViewIfNeeded();
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
  // House style 2026-11: a row's country is never cut (the water mark rides
  // with the name, the docked column stacks the parts under it).
  check('phone: no country is cut', await page.evaluate(() => [...document.querySelectorAll('.xrows--ledger .xrow-ctry')].slice(0, 12)
    .every((e) => e.scrollWidth <= e.clientWidth + 1)));
  check('phone: rows show the region with the country', await page.evaluate(() => [...document.querySelectorAll('.xrows--ledger .xrow-region')]
    .some((e) => e.getBoundingClientRect().width > 8)));
  const gridBox = await page.locator('.xrows').boundingBox();
  check('no horizontal scroll', !!gridBox && gridBox.width > 0 && gridBox.width <= 390, `grid ${Math.round(gridBox?.width || 0)}px`);

  // On a phone the filter pane sits behind the toolbar's Filters button and
  // opens as the shared sheet (the desktop pane stands beside the list, so
  // this is the one place a sheet is right).
  // T962: on a phone Filters is the search dock's round button, not a bar tool.
  check('phone: Map is the fixed bottom-right corner', await page.locator('.corner-map .corner-btn').isVisible()
    && await page.locator('.seg-item:visible').count() === 0);
  const filtersBtn = page.locator('.xap .xap-filters:visible');
  check('phone: the Filters button leads the applied row', await filtersBtn.first().isVisible());
  await filtersBtn.first().click();
  await page.waitForTimeout(900);
  check('phone: the button opens the filters as a labelled sheet', await page.locator('.flt-sheet[role="dialog"][aria-modal="true"]').count() === 1);
  check('phone: one compact row per line', await page.locator('.xrows').evaluate(
    (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length === 1));
  await page.screenshot({ path: 'shots/explore-filters-phone.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  check('phone: Escape closes the sheet', await page.locator('.flt-sheet').count() === 0);
  await page.screenshot({ path: 'shots/explore-phone.png' });

  // G12: on a phone the price wagons sit over the link's middle (they are
  // buttons beside it, by design), so a tap on the place goes to its name.
  await page.locator('.xrow-hit .xrow-name').first().click();
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
  // The waiting-for line names the control that timed out.
  check('phone pass ran', false, String(e).split('\n').filter((l) => /Timeout|waiting for/.test(l)).slice(0, 2).join(' ') || String(e).split('\n')[0]);
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
  await page.locator('.corner-map .corner-btn').tap();
  await page.waitForSelector('.xmap.is-ready', { timeout: 30000 });
  await page.waitForTimeout(3500);
  const geo = await page.evaluate(() => {
    const m = document.querySelector('.xcontent-map .xmap').getBoundingClientRect();
    const nav = document.querySelector('.bottom-nav')?.getBoundingClientRect();
    return { top: m.top, bottom: m.bottom, width: m.width, navTop: nav ? nav.top : innerHeight };
  });
  check('phone map: full width and down to the nav', geo.width === 390 && Math.abs(geo.bottom - geo.navTop) <= 2,
    `${Math.round(geo.top)} to ${Math.round(geo.bottom)}, nav at ${Math.round(geo.navTop)}`);
  // G12 map view: the map is the page; the List pill opens the sheet, the
  // sheet's head offers the list view; the h1 stays.
  check('phone map: the List pill shows, the h1 stays',
    await page.locator('.xmap-listpill').isVisible()
    && await page.evaluate(() => [...document.querySelectorAll('h1')]
      .filter((h) => h.getClientRects().length > 0 && h.getBoundingClientRect().width > 0).length) === 1);
  const MAPJS = 'document.querySelector(".xcontent-map .xmap-canvas")._cartaMap';
  const pill = await page.evaluate(`(() => { const m = ${MAPJS}; const f = m.queryRenderedFeatures({ layers: ['xpin', 'xpin-best'] })[0];
    if (!f) return null; const p = m.project(f.geometry.coordinates); const r = m.getCanvas().getBoundingClientRect();
    return { x: p.x + r.left, y: p.y + r.top, city: f.properties.city }; })()`);
  netCheck('phone map: prices from the first view', !!pill, pill ? pill.city : 'no pill');
  if (!pill && !ONLINE) {
    check('phone map: pin tap, card and place door', true, 'SKIP (needs network)');
  } else if (pill) {
  await page.touchscreen.tap(pill.x, pill.y);
  await page.waitForTimeout(1500);
  check('phone map: a tap picks the place into the tap card, the map stays',
    await page.locator('.xmap-tapcard').isVisible()
    && await page.locator('.destp').count() === 0
    && (await page.locator('.xmap-tapcard .xrow-name').innerText().catch(() => '')).includes(pill.city), pill.city);
  const dock = await page.evaluate(() => {
    const c = document.querySelector('.xmap-tapcard').getBoundingClientRect();
    const nav = document.querySelector('.bottom-nav').getBoundingClientRect();
    return { clear: c.bottom <= nav.top && c.top > nav.top - 200, cardTop: Math.round(c.top), navTop: Math.round(nav.top) };
  });
  check('phone map: the tap card sits just above the nav', dock.clear, `card at ${dock.cardTop}, nav ${dock.navTop}`);
  await page.screenshot({ path: 'shots/explore-phone-map.png' });
  await page.locator('.xmap-tapcard .xtc-hit').first().tap();
  await page.locator('.destp').waitFor({ timeout: 30000 }).catch(() => {});
  check('phone map: the card opens the place', await page.locator('.destp').isVisible());
  }
  await page.close();
} catch (e) {
  check('phone map pass ran', false, String(e).split('\n')[0]);
}

// ── The search, by keyboard on a desktop. The guided search door (T442,
// .gsearch-trigger in the header) left Explore with v6: the header slot is
// Destinations' now, and Explore's search is the hero's Where field
// (T622) beside the Ask Viantra door. A typed place narrows the list to the
// places that match and shows as a chip; clearing the chip brings the list
// back; the Sort menu's Cheapest day orders by the day figure. ──
try {
  const page = await boot({ width: 1440, height: 900 });
  const exploreTab = page.locator('.header-nav-item', { hasText: /^\s*explore\s*$/i }).first();
  if (await exploreTab.isVisible().catch(() => false)) await exploreTab.click();
  // G12 Explore top: the band's one field (labelled by its aria-label).
  const where = page.locator('.band form[role="search"] .band-input');
  await where.waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  check('search: the field is labelled', !!(await where.getAttribute('aria-label'))?.trim());
  await where.focus();
  await page.keyboard.type('Rome', { delay: 15 });
  await page.keyboard.press('Enter');
  await page.locator('.xrows .xrow').first().waitFor({ timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const hits = await page.locator('.xrow .xrow-name').allInnerTexts();
  check('search: Enter narrows the list to the places that match',
    hits.length >= 1 && hits.length < 24 && hits[0].trim() === 'Rome'
    && hits.every((h) => /rome/i.test(h.normalize('NFD').replace(/[̀-ͯ]/g, ''))),
    hits.slice(0, 5).join('|'));
  // The band keeps the question in its field; emptying it ends the question.
  check('search: the field keeps the question', (await where.inputValue()) === 'Rome');
  const whys = await page.locator('.xrow .xrow-why').allTextContents();
  check('search: every row says when it is good', whys.length >= hits.length && whys.every((w) => /\b(best|good) in\b/i.test(w)),
    whys[0]);
  await where.fill('');
  await where.press('Enter');
  await page.waitForTimeout(1200);
  check('search: clearing the field ends the question', (await where.inputValue()) === ''
    && !(await page.locator('.xrow .xrow-name').allInnerTexts()).slice(0, 5).every((h) => /rome/i.test(h)));
  // The price sort orders by the day figure (the default basis), cheapest first.
  const sortBtn = page.locator('.xap .btn', { hasText: /^Sort/ }).first();
  if (!(await sortBtn.isVisible().catch(() => false))) await showAll(page);
  await sortBtn.click();
  await page.locator('.xsort-menu [role="menuitemradio"]', { hasText: /price|cheap/i }).first().click();
  await page.waitForTimeout(900);
  const days = (await page.locator('.xrow .xfig-amount').allInnerTexts()).slice(0, 10)
    .map((x) => Number(x.replace(/[^\d]/g, ''))).filter((d) => d > 0);
  check('search: the price sort puts the cheapest first and lands in the URL',
    days.length >= 5 && days.every((d, i) => i === 0 || d >= days[i - 1]) && /[?&](xs|sort)=cost/.test(page.url()),
    `${days.join(' ')} ${page.url().split('?')[1] || ''}`);
  // Back from a place returns to the list, not out of Viantra.
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

// ── The list view and the receipt from a card (G12 map view, with the band;
// judgement-1 fix 6). On a
// phone and a desktop: the list shows rows, each row's figure is a euro
// amount or "Not yet", the figure opens the place's receipt, Escape closes
// it, and the List | Map switch reaches the map. ──
for (const [label, viewport, opts] of [
  ['phone', { width: 390, height: 844 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 3 }],
  ['desktop', { width: 1440, height: 900 }, {}],
]) {
  try {
    const page = await boot(viewport, opts);
    await page.goto(new globalThis.URL('?tab=map', URL).href, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.locator('.explore-tab').waitFor({ timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2500);
    if (!(await page.locator('.xrow').first().isVisible().catch(() => false))) {
      await page.getByRole('button', { name: /see all|show all/i }).first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1500);
    }
    const rows = page.locator('.xrows .xrow');
    const n = await rows.count();
    check(`${label} list view: rows show`, n >= 5, `${n} rows`);
    const figs = await page.locator('.xrows .xrow .xfig-amount').evaluateAll((els) => els.slice(0, 8).map((e) => e.textContent.trim()));
    check(`${label} list view: each figure is euros or Not yet`, figs.length > 0 && figs.every((f) => /€\s?\d|\d\s?€|not yet/i.test(f)), figs.join(' | '));
    const fig = page.locator('.xrows .xrow .xfig').first();
    await fig.scrollIntoViewIfNeeded();
    await fig.click();
    await page.waitForTimeout(1200);
    const title = await page.locator('.rcp-title, .rcp-sheet .fsheet-title').filter({ visible: true }).first().textContent({ timeout: 5000 }).catch(() => '');
    check(`${label} list view: a card's figure opens its receipt`, !!title, title);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
    check(`${label} list view: Escape closes the receipt`, !(await page.locator('.rcp-title, .rcp-sheet').filter({ visible: true }).count()));
    // The desktop's List | Map is a segmented control; the phone's a button.
    await page.locator('.seg-item').filter({ hasText: /^Map$/ }).or(page.getByRole('button', { name: /^map$/i }))
      .filter({ visible: true }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const onMap = await page.evaluate(() => new URLSearchParams(location.search).get('xw') === 'map' && !!document.querySelector('.xcontent-map .xmap-canvas'));
    check(`${label} list view: Map opens the map view`, onMap);
    await page.close();
  } catch (e) {
    check(`${label} list view pass ran`, false, String(e).split('\n')[0]);
  }
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
