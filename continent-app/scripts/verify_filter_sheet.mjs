// Headless verify for the phone filter sheet rework: filtering became a modal
// bottom sheet (scrim over the map AND the bottom nav, grab handle, fixed
// header, sticky action bar with the live result count) instead of an inline
// drawer of dropdowns that scrolled for a screen and a half under a floating
// trip button.
//
//   node scripts/verify_filter_sheet.mjs [url]      (default http://localhost:4173)
//
// Checks the architecture (modal, scrim, sticky footer), the component swaps
// (no dropdowns left except the country list, chips and steppers instead),
// the 8pt spacing rhythm, 44px touch targets and keyboard behaviour.
// Screenshots to shots/filter-sheet-*.png.

import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:4173/';

const browser = await chromium.launch();
const errors = [];
const checks = [];
const check = (label, ok, note = '') => { checks.push({ label, ok, note }); };

const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
const NOISE = /emrldtp|ERR_FAILED|config is not valid/;
page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 120)); });

await page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    localStorage.setItem('carta.welcomeSeen.v1', '1');
  } catch { /* storage unavailable */ }
});

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(3000);

// Land on Explore (the map), whichever slot it occupies in the bottom nav.
const explore = page.locator('.bottom-nav-item', { hasText: /explore/i }).first();
if (await explore.isVisible().catch(() => false)) {
  await explore.click();
  await page.waitForTimeout(1500);
}

// ── Open the sheet from the header pill ──
const trigger = page.locator('.mobile-seg > .mobile-seg-btn');
await trigger.click();
await page.waitForTimeout(600);

const sheet = page.locator('.fsheet');
check('sheet renders', await sheet.isVisible());
check('it is a modal dialog', await sheet.getAttribute('role') === 'dialog'
  && await sheet.getAttribute('aria-modal') === 'true');
check('scrim covers the screen', await page.locator('.fsheet-scrim').isVisible());
check('grab handle present', await page.locator('.fsheet-grab').count() === 1);

// The sheet is portalled to <body>, not nested in the header (whose
// backdrop-filter would capture a fixed child).
check('sheet is portalled out of the header', await page.evaluate(
  () => !!document.body.querySelector(':scope > .fsheet-scrim')));

// ── The old conflicts: bottom nav + floating trip button over the controls ──
const navBox = await page.locator('.bottom-nav').boundingBox().catch(() => null);
const scrimZ = await page.locator('.fsheet-scrim').evaluate((el) => +getComputedStyle(el).zIndex);
const navZ = await page.locator('.bottom-nav').evaluate((el) => +getComputedStyle(el).zIndex);
check('scrim sits above the bottom nav', scrimZ > navZ, `scrim ${scrimZ} vs nav ${navZ}`);
// Nothing from the shell may be hit-testable over the sheet.
const overFab = await page.evaluate(() => {
  const plus = document.querySelector('.bottom-nav-plus');
  if (!plus) return 'no fab';
  const r = plus.getBoundingClientRect();
  const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return hit?.closest('.bottom-nav-plus') ? 'fab on top' : 'covered';
});
check('trip button no longer overlays the filters', overFab === 'covered', overFab);

// ── Sticky action bar, in the thumb zone before any scrolling ──
const foot = page.locator('.fsheet-foot');
const footBox = await foot.boundingBox();
const sheetBox = await sheet.boundingBox();
check('action bar is visible without scrolling', !!footBox
  && footBox.y + footBox.height <= sheetBox.y + sheetBox.height + 1);
const applyText = await page.locator('.fsheet-apply').innerText();
check('primary action carries the live count', /\d/.test(applyText) && /show/i.test(applyText),
  applyText.replace(/\n/g, ' '));
check('clear all is present', await page.locator('.fsheet-clear').isVisible());

// ── Component swaps ──
const dropdowns = await page.locator('.fsheet .dropdown-trigger').count();
check('only the country list is still a dropdown', dropdowns === 1, `${dropdowns} dropdowns`);
check('steppers replaced the number fields',
  await page.locator('.fsheet .fstepper').count() === 2);
check('no bare number inputs left',
  await page.locator('.fsheet input[type="number"]').count() === 0);
const chips = await page.locator('.fsheet .fchip').count();
check('chip sets carry the short lists', chips >= 12, `${chips} chips`);
check('price slider draws the distribution',
  await page.locator('.fsheet .dual-range-hist .dual-range-bar').count() > 10);
// Trip style left the sheet: the category rail under the header carries the
// same chips in the open, so asking again in here was asking twice.
check('the sheet does not repeat the category rail',
  await page.locator('.fsheet', { hasText: /trip style/i }).count() === 0
  && await page.locator('.fsheet .fchip', { hasText: /^Nightlife$/ }).count() === 0);

// ── Touch targets: everything interactive in the sheet clears 44px ──
const small = await page.evaluate(() => {
  const out = [];
  const sheetEl = document.querySelector('.fsheet');
  for (const el of sheetEl.querySelectorAll('button, [role="radio"], input, select')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;          // not rendered
    if (getComputedStyle(el).position === 'absolute') continue; // slider thumbs, measured below
    if (r.height < 43.5) out.push(`${el.className || el.tagName}:${Math.round(r.height)}`);
  }
  return out;
});
check('every control is at least 44px tall', small.length === 0, small.join(', '));
const thumb = await page.evaluate(() => {
  const el = document.querySelector('.fsheet .dual-range-input');
  if (!el) return 0;
  // The thumb is a pseudo-element; read the rule the sheet sets for it.
  for (const sheetCss of document.styleSheets) {
    let rules;
    try { rules = sheetCss.cssRules; } catch { continue; }
    for (const r of rules) {
      if (r.selectorText && r.selectorText.includes('.fsheet .dual-range-input') && r.selectorText.includes('slider-thumb')) {
        return parseFloat(r.style.height);
      }
    }
  }
  return 0;
});
check('slider thumbs clear the 24px target minimum', thumb >= 24, `${thumb}px`);

// ── 8pt rhythm: the spacings that carry the hierarchy ──
const rhythm = await page.evaluate(() => {
  const cs = (sel, prop) => {
    const el = document.querySelector(sel);
    return el ? parseFloat(getComputedStyle(el)[prop]) : -1;
  };
  return {
    body: cs('.fsheet-body', 'paddingLeft'),
    fields: cs('.fsheet-fields', 'rowGap'),
    label: cs('.fsheet-field > .fsheet-label', 'marginBottom'),
    caption: cs('.fsheet-caption', 'marginBottom'),
    section: cs('.fsheet-section + .fsheet-section', 'marginTop'),
    chips: cs('.fchips', 'rowGap'),
  };
});
const offGrid = Object.entries(rhythm).filter(([, v]) => v < 0 || v % 8 !== 0);
check('spacings are multiples of 8', offGrid.length === 0, JSON.stringify(rhythm));
check('micro spacing is tighter than macro', rhythm.label < rhythm.section,
  `${rhythm.label} vs ${rhythm.section}`);

// ── Contrast of the section labels (the old ones were 3.4:1) ──
const contrast = await page.evaluate(() => {
  const lum = (rgb) => {
    const [r, g, b] = rgb.match(/\d+/g).slice(0, 3).map((n) => {
      const c = n / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const el = document.querySelector('.fsheet-label');
  const fg = lum(getComputedStyle(el).color);
  const bg = lum(getComputedStyle(document.querySelector('.fsheet')).backgroundColor);
  const [hi, lo] = fg > bg ? [fg, bg] : [bg, fg];
  return (hi + 0.05) / (lo + 0.05);
});
check('labels pass 4.5:1', contrast >= 4.5, `${contrast.toFixed(2)}:1`);

// ── Scroll length: the complaint that started this rework. Every control is
//    still reachable, but the dropdown stack became chips and steppers. ──
const scroll = await page.evaluate(() => {
  const b = document.querySelector('.fsheet-body');
  return { h: b.scrollHeight, v: b.clientHeight };
});
// Fourteen filters at 44px targets cannot fit on one screen; what matters is
// that nothing is buried and the action bar never scrolls away (checked
// above). Three screens is the ceiling: past that, another set belongs behind
// a "show more".
check('scroll length stays inside three screens', scroll.h <= scroll.v * 3.05,
  `${scroll.h}px of content in a ${scroll.v}px window`);

// ── No horizontal overflow, and the sheet does not eat the whole screen ──
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('no horizontal overflow at 390px', overflow <= 0, `overflow ${overflow}px`);
check('the map stays visible above the sheet', sheetBox.height <= 844 * 0.93,
  `${Math.round(sheetBox.height)}px of 844`);

await page.screenshot({ path: 'shots/filter-sheet-top.png' });
// Mid scroll: the price and rating bands.
await page.locator('.fsheet-body').evaluate((el) => { el.scrollTop = 620; });
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/filter-sheet-mid.png' });
await page.locator('.fsheet-body').evaluate((el) => { el.scrollTop = el.scrollHeight; });
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/filter-sheet-bottom.png' });

// The one dropdown left has to work inside a scrolling sheet.
await page.locator('.fsheet .dropdown-trigger').click();
await page.waitForTimeout(400);
const menu = page.locator('.fsheet .dropdown-menu');
check('country picker opens inside the sheet', await menu.isVisible());
const menuBox = await menu.boundingBox();
check('its menu stays on screen', !!menuBox && menuBox.x >= 0 && menuBox.x + menuBox.width <= 390.5,
  menuBox ? `${Math.round(menuBox.x)}..${Math.round(menuBox.x + menuBox.width)}` : 'missing');
await page.screenshot({ path: 'shots/filter-sheet-country.png' });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check('closing the country menu leaves the sheet open', await page.locator('.fsheet').count() === 1);
await page.locator('.fsheet-body').evaluate((el) => { el.scrollTop = 0; });

// ── Narrowing a filter updates the count and marks the sheet ──
const before = await page.locator('.fsheet-apply').innerText();
await page.locator('.fsheet .fchip', { hasText: 'UNESCO' }).click();
await page.waitForTimeout(1200);
const after = await page.locator('.fsheet-apply').innerText();
check('the count reacts to a filter', before !== after, `${before.split('\n')[0]} -> ${after.split('\n')[0]}`);
check('an active filter is marked in the accent',
  await page.locator('.fsheet .fchip.on.narrow').count() >= 1);
await page.screenshot({ path: 'shots/filter-sheet-active.png' });

// ── Keyboard + dismissal ──
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
check('Escape closes the sheet', await page.locator('.fsheet').count() === 0);
check('the trigger keeps focus after closing',
  await page.evaluate(() => !!document.activeElement?.closest('.mobile-seg')));
check('the active filter shows on the trigger',
  await page.locator('.mobile-seg-count').isVisible());

// Reopen, then dismiss by tapping the scrim.
await trigger.click();
await page.waitForTimeout(500);
await page.mouse.click(195, 60);
await page.waitForTimeout(400);
check('tapping the scrim closes the sheet', await page.locator('.fsheet').count() === 0);

// ── The grab handle keeps its promise: a real touch drag dismisses ──
const touch = await browser.newPage({
  viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
});
touch.on('pageerror', (e) => errors.push('touch pageerror: ' + e.message.split('\n')[0]));
await touch.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    localStorage.setItem('carta.welcomeSeen.v1', '1');
  } catch { /* storage unavailable */ }
});
await touch.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await touch.waitForTimeout(3000);
const touchExplore = touch.locator('.bottom-nav-item', { hasText: /explore/i }).first();
if (await touchExplore.isVisible().catch(() => false)) {
  await touchExplore.tap();
  await touch.waitForTimeout(1500);
}
await touch.locator('.mobile-seg > .mobile-seg-btn').tap();
await touch.waitForTimeout(600);
check('sheet opens on a tap', await touch.locator('.fsheet').isVisible());
const head = await touch.locator('.fsheet-head').boundingBox();
const drag = async (dy) => {
  const x = 195;
  const y = head.y + 12;
  await touch.evaluate(([sx, sy, d]) => {
    const el = document.querySelector('.fsheet-head');
    const send = (type, cy) => el.dispatchEvent(new PointerEvent(type, {
      pointerId: 1, pointerType: 'touch', clientX: sx, clientY: cy, bubbles: true,
    }));
    el.setPointerCapture = () => {};
    send('pointerdown', sy);
    for (let i = 1; i <= 6; i += 1) send('pointermove', sy + (d * i) / 6);
    send('pointerup', sy + d);
  }, [x, y, dy]);
  await touch.waitForTimeout(400);
};
await drag(40);
check('a short drag springs back', await touch.locator('.fsheet').count() === 1);
await drag(220);
check('a long drag dismisses the sheet', await touch.locator('.fsheet').count() === 0);

// ── Nothing matches, in the longest-word locale, on the narrowest phone.
//    The link carries hidden gems + UNESCO + a 9.5 rating floor, which no
//    destination clears, so the footer has to flip. ──
const tight = await browser.newPage({ viewport: { width: 360, height: 780 } });
tight.on('pageerror', (e) => errors.push('empty-state pageerror: ' + e.message.split('\n')[0]));
await tight.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'de');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    localStorage.setItem('carta.welcomeSeen.v1', '1');
  } catch { /* storage unavailable */ }
});
await tight.goto(`${URL}?gem=1&un=1&rr=95.100`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await tight.waitForTimeout(3000);
const tightExplore = tight.locator('.bottom-nav-item').nth(1);
if (await tightExplore.isVisible().catch(() => false)) {
  await tightExplore.click();
  await tight.waitForTimeout(1500);
}
await tight.locator('.mobile-seg > .mobile-seg-btn').click();
await tight.waitForTimeout(700);
check('empty result flips the primary action',
  await tight.locator('.fsheet-apply.is-empty').isVisible());
check('clear all takes the lead when nothing matches',
  await tight.locator('.fsheet-foot.is-empty').count() === 1);
const tightOverflow = await tight.evaluate(() => {
  const el = document.querySelector('.fsheet');
  return el.scrollWidth - el.clientWidth;
});
check('no overflow in German at 360px', tightOverflow <= 0, `${tightOverflow}px`);
await tight.screenshot({ path: 'shots/filter-sheet-empty-de.png' });

// ── Desktop is untouched: the tray, not the sheet ──
const desk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
desk.on('pageerror', (e) => errors.push('desktop pageerror: ' + e.message.split('\n')[0]));
await desk.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    localStorage.setItem('carta.welcomeSeen.v1', '1');
  } catch { /* storage unavailable */ }
});
await desk.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await desk.waitForTimeout(3000);
try {
  // The shell opens on Destinations; the filter rows live on Explore, which
  // is what the tab is called at every width now.
  const exploreTab = desk.locator('.header-nav-item', { hasText: /^\s*explore\s*$/i }).first();
  if (await exploreTab.isVisible().catch(() => false)) {
    await exploreTab.click();
    await desk.waitForTimeout(1500);
  }
  check('desktop still shows the filter rows', await desk.locator('.filter-rows').isVisible());
  await desk.locator('.filter-tray-btn').click({ timeout: 8000 });
  await desk.waitForTimeout(400);
  check('desktop tray still opens', await desk.locator('.filter-tray.is-open').isVisible());
  check('desktop never mounts the sheet', await desk.locator('.fsheet').count() === 0);
  check('desktop price slider gained the distribution',
    await desk.locator('.filter-tray .dual-range-hist').count() === 1);
  await desk.screenshot({ path: 'shots/filter-sheet-desktop.png' });
} catch (e) {
  check('desktop pass ran', false, String(e).split('\n')[0]);
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
