// Headless verify for the Explore tab v3: the map is gone, the grid answers
// with a euro-a-day figure (the two 0-10 "cheapness" indices are retired, see
// lib/costIndex.js), one Filters sheet serves every width, and the
// destination panel carries the info sections (cost receipt, around + locator
// map, worth pairing with, when, weather, how the score is built, parking,
// packing).
//
//   node scripts/verify_explore.mjs [url]      (default http://localhost:4173)
//
// Supersedes verify_filter_sheet.mjs and the map-era checks: the desktop
// filter rows, the tray and the origin toolrow no longer exist on Explore.
// Screenshots to shots/explore-*.png.

import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:4173/';

const browser = await chromium.launch();
const errors = [];
const checks = [];
const check = (label, ok, note = '') => { checks.push({ label, ok, note }); };

const boot = async (viewport) => {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
  const NOISE = /emrldtp|ERR_FAILED|config is not valid|open-meteo/;
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 120)); });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
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
  const cards = await page.locator('.xcard').count();
  check('a real page of cards', cards >= 24, `${cards} cards`);
  const withImg = await page.locator('.xcard img.xcard-img').count();
  check('cards carry photos', withImg >= cards * 0.8, `${withImg}/${cards}`);
  // The 640px thumb splice must resolve to real bytes, not a 404 tile.
  const imgOk = await page.waitForFunction(() => {
    const el = document.querySelector('.xcard img.xcard-img');
    return !!el && el.complete && el.naturalWidth > 0;
  }, null, { timeout: 12000 }).then(() => true).catch(() => false);
  check('spliced card thumb actually loads', imgOk);
  // The retired 0-10 meters must be gone, and every card must carry the euro
  // figure that replaced them (lib/costIndex.js explains the swap in full).
  check('the 0-10 cheapness meters are gone', await page.locator('.xcard-ix').count() === 0);
  const costCount = await page.locator('.xcard-cost').count();
  check('every card shows a euro-a-day figure', costCount >= cards - 2, `${costCount}/${cards}`);
  const litSegs = await page.locator('.xcard-cost .cost-gauge .cost-seg.on').count();
  check('the cost gauge fills', litSegs >= cards, `${litSegs} lit segments`);
  const cardText = await page.locator('.xcard').first().innerText();
  check('the card names a price in euros', /€\d/.test(cardText), cardText.replace(/\n/g, ' | ').slice(0, 90));

  // The srcset must offer widths Wikimedia actually renders. An unlisted
  // width answers 400, which is exactly how this breaks silently.
  const srcset = await page.locator('.xcard img.xcard-img').first().getAttribute('srcset');
  const widths = (srcset || '').match(/(\d+)px-/g) || [];
  const legalW = ['250px-', '330px-', '500px-', '960px-', '1280px-', '1920px-'];
  check('card srcset uses renderable Wikimedia widths',
    widths.length >= 2 && widths.every((w) => legalW.includes(w)),
    srcset ? widths.join(' ') : 'no srcset');

  // The Lifestyle control has to be present AND has to move the prices: a
  // control that changes nothing is worse than no control at all.
  // The control renders twice since desktop chrome v4 (toolbar card for the
  // phone, side panel for desktop); exactly one may be on screen at a time.
  check('one Lifestyle control on screen', await page.locator('.explore-shell .lifestyle-btn:visible').count() === 1);
  const priceText = () => page.locator('.xcard-cost-eur:visible').allInnerTexts();
  const beforeLs = (await priceText()).slice(0, 8).join(' ');
  await page.locator('.explore-shell .lifestyle-btn:visible').first().click();
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
  await page.locator('.xcard').first().hover();
  await page.waitForTimeout(350);
  const previewOpen = await page.locator('.xcard-preview').count() === 1;
  check('hovering a card explains it', previewOpen);
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
  check('the live count leads the rail', /\d/.test(await page.locator('.xrail-count').innerText()));
  const countBefore = (await page.locator('.xgrid-count').innerText()).match(/\d+/)?.[0];
  await page.locator('.explore-side .xrail-toggle', { hasText: /^Village$/ }).first().click();
  await page.waitForTimeout(700);
  const countAfter = (await page.locator('.xgrid-count').innerText()).match(/\d+/)?.[0];
  check('a rail toggle narrows the count live', Number(countAfter) < Number(countBefore),
    `${countBefore} -> ${countAfter}`);
  check('the active filter shows as a chip', await page.locator('.xchip', { hasText: /Village/ }).count() === 1);
  check('the filter landed in the URL', page.url().includes('xk=village'));
  await page.screenshot({ path: 'shots/explore-filters-desktop.png' });
  await page.locator('.xchip', { hasText: /Village/ }).click();
  await page.waitForTimeout(500);

  await page.screenshot({ path: 'shots/explore-desktop.png', fullPage: false });

  // ── Open a destination: it is the full-screen page now. The deep contract
  // (gallery, highlights, PDF, parking deeplinks) lives in
  // scripts/verify_destination_page.mjs; this pass only proves the door. ──
  await page.locator('.xcard-hit').first().click();
  await page.waitForTimeout(2500);
  const panel = page.locator('.destp');
  check('destination page opens', await panel.isVisible());
  check('page shows the cost receipt', await panel.locator('.cost-receipt').count() === 1);
  // The receipt has to say what it assumed. A price a reader cannot trace
  // back to a setting is a price they must take on faith.
  const assumes = await panel.locator('.cost-assumes').innerText().catch(() => '');
  check('receipt names the lifestyle it priced for', /priced for/i.test(assumes), assumes.slice(0, 60));
  check('receipt totals a day in euros', /€\d/.test(await panel.locator('.cost-total-eur').innerText()));
  const panelText = await panel.innerText();
  check('page has when-to-go', /when to go/i.test(panelText));
  check('page has explore-further', /explore .* further/i.test(panelText));
  await page.waitForTimeout(2500);
  check('page pins the place on a real map', await panel.locator('.dmap canvas').count() >= 1);
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
  if (await explore.isVisible().catch(() => false)) {
    await explore.click();
    await page.waitForTimeout(1800);
  }
  check('phone grid renders', await page.locator('.explore-tab').isVisible());
  const cards = await page.locator('.xcard').count();
  check('phone shows cards', cards >= 12, `${cards} cards`);
  const gridBox = await page.locator('.explore-grid').boundingBox();
  check('no horizontal scroll', gridBox && gridBox.width <= 390, `grid ${Math.round(gridBox?.width || 0)}px`);

  // C6 on a phone: the same rail inside a plain fold, never a modal.
  await page.locator('.explore-fold > summary').click();
  await page.waitForTimeout(600);
  check('phone fold opens the same rail', await page.locator('.explore-fold .xrail').isVisible());
  check('phone rail is not a modal', await page.locator('[aria-modal="true"]').count() === 0);
  await page.screenshot({ path: 'shots/explore-filters-phone.png' });
  await page.locator('.explore-fold > summary').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'shots/explore-phone.png' });

  await page.locator('.xcard-hit').first().click();
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
