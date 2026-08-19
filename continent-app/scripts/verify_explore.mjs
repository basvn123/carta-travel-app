// Headless verify for the Explore tab v2: the map is gone, the grid answers
// with the two 0-10 indices instead of fares, one Filters sheet serves every
// width, and the destination panel carries the info sections (around, when,
// weather, parking, events, packing).
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
  const ixCount = await page.locator('.xcard-ix').count();
  check('every card shows the two indices', ixCount >= cards * 2 - 2, `${ixCount} meters`);
  const cardText = await page.locator('.xcard').first().innerText();
  check('no euro price on a card', !/€/.test(cardText), cardText.replace(/\n/g, ' | ').slice(0, 80));

  // The retired fare-era controls must be gone from this tab.
  check('no depart/return fields', await page.locator('.row-date-fields').count() === 0);
  check('no stay-tier filter', await page.locator('.filter-staytier').count() === 0);
  check('no baggage filter', await page.locator('.filter-baggage').count() === 0);
  check('no travel-by toggle', await page.locator('.filter-travelby').count() === 0);
  check('no total/per-person toggle', await page.locator('.filter-show').count() === 0);
  check('no desktop filter tray', await page.locator('.filter-tray').count() === 0);

  // One Filters door, and it opens the SHEET on desktop too.
  await page.locator('.explore-filter-btn').click();
  await page.waitForTimeout(600);
  check('desktop Filters opens the sheet', await page.locator('.fsheet-explore').isVisible());
  check('sheet is a modal dialog', await page.locator('.fsheet-explore').getAttribute('aria-modal') === 'true');
  const sheetText = await page.locator('.fsheet-explore').innerText();
  check('sheet has no price window', !/€/.test(sheetText));
  await page.screenshot({ path: 'shots/explore-filters-desktop.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  await page.screenshot({ path: 'shots/explore-desktop.png', fullPage: false });

  // ── Open a destination panel and walk its sections ──
  await page.locator('.xcard-hit').first().click();
  await page.waitForTimeout(2500);
  const panel = page.locator('.dest-panel.open');
  check('panel opens', await panel.isVisible());
  const panelText = await panel.innerText();
  check('panel shows the indices block', await panel.locator('.xp-indices').count() === 1);
  check('panel has what-is-around', /what is around/i.test(panelText));
  check('panel has when-to-go', /when to go/i.test(panelText));
  check('panel has weather section', /weather this week/i.test(panelText));
  check('panel has parking section', /where to park/i.test(panelText));
  check('panel has events section', /events and festivals/i.test(panelText));
  check('panel has packing section', /what to bring/i.test(panelText));
  check('panel shows POI rows', await panel.locator('.xp-poi').count() >= 3);
  check('packing list has items', await panel.locator('.xp-pack').count() >= 2);
  // The live forecast (network) and the destinfo layer (built?) get a longer leash.
  await page.waitForTimeout(3000);
  const weatherDays = await panel.locator('.xp-wday').count();
  check('live forecast rendered 7 days', weatherDays === 7, `${weatherDays} days`);
  const hasParkRow = await panel.locator('.xp-park').count();
  const parkNote = (await panel.locator('.dsheet-card', { hasText: /where to park/i }).innerText()).slice(0, 90);
  check('parking answered (spot or honest empty)', hasParkRow > 0 || /not been gathered|no public parking/i.test(parkNote), parkNote.replace(/\n/g, ' | '));
  await page.screenshot({ path: 'shots/explore-panel-desktop.png' });

  // Scroll the panel through its sections for a second shot.
  await panel.locator('.dest-panel-scroll').evaluate((el) => { el.scrollTop = el.scrollHeight * 0.55; });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'shots/explore-panel-desktop-2.png' });
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

  await page.locator('.explore-filter-btn').click();
  await page.waitForTimeout(600);
  check('phone Filters opens the same sheet', await page.locator('.fsheet-explore').isVisible());
  await page.screenshot({ path: 'shots/explore-filters-phone.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'shots/explore-phone.png' });

  await page.locator('.xcard-hit').first().click();
  await page.waitForTimeout(2000);
  check('phone panel opens as bottom sheet', await page.locator('.dest-panel.open').isVisible());
  check('phone panel has the grip', await page.locator('.dest-grip').isVisible());
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
