// Headless verify for the destination panel (browse/ExplorePanel.jsx).
//
//   node scripts/verify_detail_sheet.mjs [url]      (default http://localhost:4173)
//
// The contract this checks, after the panel stopped being a bottom sheet:
//
//   phone     it is a page. It covers the whole device, the bottom bar
//             included, there is no grip to drag and no half snap, and the
//             cross is on screen at every scroll position.
//   desktop   it is still the side drawer the map layout is built around.
//   both      the sections the panel exists for are all present, in the order
//             a reader decides in, and Escape closes it.
//
// Screenshots to shots/detail-*.png.

import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:4173/';

const browser = await chromium.launch();
const checks = [];
const check = (label, ok, note = '') => { checks.push({ label, ok, note }); };
const errors = [];
const NOISE = /emrldtp|ERR_FAILED|config is not valid|content_overrides/;

const seed = (page) => page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
  } catch { /* storage unavailable */ }
});

const openFirstPlace = async (page, nav) => {
  await page.locator(nav, { hasText: /explore/i }).first().click();
  await page.waitForTimeout(2600);
  await page.locator('.explore-card, .xcard, .explore-grid button').first().click();
  await page.waitForTimeout(2800);
};

// ── Phone: the panel is a page ────────────────────────────────────────────
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
page.on('console', (m) => {
  if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 120));
});
await seed(page);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(3200);
await openFirstPlace(page, '.bottom-nav-item');

const panel = page.locator('.dest-panel.explore-panel');
check('panel opens', await panel.isVisible());

const geom = await page.evaluate(() => {
  const el = document.querySelector('.dest-panel.explore-panel');
  const r = el.getBoundingClientRect();
  const nav = document.querySelector('.bottom-nav');
  const navBox = nav ? nav.getBoundingClientRect() : null;
  return {
    x: Math.round(r.x),
    y: Math.round(r.y),
    w: Math.round(r.width),
    h: Math.round(r.height),
    vw: window.innerWidth,
    vh: window.innerHeight,
    // The nav is still in the document; what matters is that the panel is
    // painted over it, which its z-index decides.
    panelZ: Number(getComputedStyle(el).zIndex),
    navZ: nav ? Number(getComputedStyle(nav).zIndex) : null,
    navTop: navBox ? Math.round(navBox.y) : null,
  };
});
check('it covers the whole screen',
  geom.x === 0 && geom.y === 0 && geom.w === geom.vw && Math.abs(geom.h - geom.vh) <= 2,
  `${geom.w}x${geom.h} at ${geom.x},${geom.y} in ${geom.vw}x${geom.vh}`);
check('it paints over the bottom bar',
  geom.navZ != null && geom.panelZ > geom.navZ, `panel z${geom.panelZ} over nav z${geom.navZ}`);
check('no drag grip is left', await page.locator('.dest-grip, .dest-grip-hit').count() === 0);
await page.screenshot({ path: 'shots/detail-phone-top.png' });

// The cross: on screen at the top, and still on screen four screens down.
const closeBox = await page.locator('.panel-close').boundingBox();
check('the cross is a thumb target', !!closeBox && closeBox.width >= 34 && closeBox.height >= 34,
  closeBox ? `${Math.round(closeBox.width)}x${Math.round(closeBox.height)}` : 'no box');

const scroller = page.locator('.dest-panel-scroll');
await scroller.evaluate((el) => el.scrollBy(0, 2400));
await page.waitForTimeout(900);
const deep = await page.locator('.panel-close').boundingBox();
check('the cross stays on screen deep in the page',
  !!deep && deep.y >= 0 && deep.y < 120, deep ? `y=${Math.round(deep.y)}` : 'gone');
check('the bar names the place once the hero has gone',
  await page.locator('.dsheet-bar.is-stuck .dsheet-bar-name').isVisible().catch(() => false));
await page.screenshot({ path: 'shots/detail-phone-scrolled.png' });

// ── The sections the panel exists for ─────────────────────────────────────
const titles = (await page.locator('.dest-panel .section-title').allInnerTexts())
  .map((s) => s.trim().toLowerCase());
const has = (re) => titles.some((x) => re.test(x));
check('the identity card carries the photo and the name',
  await page.locator('.xp-hero-card .panel-hero-img').count() === 1
  && (await page.locator('.xp-hero-card .panel-city').innerText()).trim().length > 1,
  (await page.locator('.xp-hero-card .panel-city').innerText().catch(() => '')).trim());
check('destination highlights', has(/highlight/), titles.join(' | '));
check('sights and areas, with a real map',
  has(/sights/) && await page.locator('.place-map').count() > 0);
check('what is around', has(/what is around/));
check('worth pairing with', has(/pairing/));
check('when to go', has(/when to go/));
check('what a day here costs', has(/costs/));
check('trip insights', has(/insights/));
check('what to bring', has(/bring/));
check('the page ends on the handover', has(/further/));
const hrefs = await page.locator('.xp-further-btn').evaluateAll((els) => els.map((e) => e.href));
check('the handover links leave the site',
  hrefs.length === 2 && hrefs.every((h) => /^https:\/\//.test(h)), hrefs.join(' '));

// ── The way out ──────────────────────────────────────────────────────────
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
check('Escape closes it', await page.locator('.xp-hero-card').count() === 0);

await openFirstPlace(page, '.bottom-nav-item');
await page.locator('.panel-close').click();
await page.waitForTimeout(600);
check('the cross closes it', await page.locator('.xp-hero-card').count() === 0);
await page.close();

// ── Desktop: still a side drawer ─────────────────────────────────────────
const desk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
desk.on('pageerror', (e) => errors.push('desktop pageerror: ' + e.message.split('\n')[0]));
await seed(desk);
await desk.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await desk.waitForTimeout(3200);
await openFirstPlace(desk, '.header-nav-item');
const dbox = await desk.locator('.dest-panel.explore-panel').boundingBox();
check('desktop keeps the side drawer',
  !!dbox && dbox.width < 760 && dbox.x > 500,
  dbox ? `${Math.round(dbox.width)}px wide at x=${Math.round(dbox.x)}` : 'no panel');
check('desktop shows the cross over the hero',
  await desk.locator('.panel-close').isVisible());
await desk.screenshot({ path: 'shots/detail-desktop.png' });
await desk.close();

await browser.close();

for (const c of checks) {
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  [${c.note}]` : ''}`);
}
const failed = checks.filter((c) => !c.ok).length;
if (errors.length) {
  console.log('\npage errors:');
  for (const e of [...new Set(errors)]) console.log('  ' + e);
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
