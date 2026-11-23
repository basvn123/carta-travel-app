// Logic wave 3 (ROADMAP D10, G12, D22, G4): DOM checks with flags E2 and E3 on (build with config/flags.json E2 and E3 "new").
// At 390, 820, 1180 and 1440, and a width sweep, on real places of the shipped data:
//   - A Coruna (LCG), one traveller asking for a hostel dorm: the town has none, so the price card names the
//     tier it priced instead ("No Hostel dorm here: priced as ..."), and it is not the entire place (E3 ladder)
//   - Basel (BSL), the same ask: a bed that is modelled says "Not yet measured" next to its figure (REQ-data-2)
//   - A Coruna for 2 adults and 2 children in an entire place: the page draws with the party (E2 party)
//   - the note sits beside a figure, never instead of it; no page error, no sideways scroll
//
//   node scripts/verify_logic_w3.mjs [url]     (default http://localhost:$CARTA_PORT or 4173)
import { chromium } from 'playwright';
import { mirrorData } from './lib/dataMirror.mjs';

const URL = process.argv[2] || `http://localhost:${process.env.CARTA_PORT || 4173}/`;
const browser = await chromium.launch();
const checks = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });
const noSideways = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

const open = async (viewport, hash, search) => {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).split('\n')[0]));
  await mirrorData(page);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.homeSeen.v1', '1');
      localStorage.setItem('carta.welcomeSeen.v1', '1');
    } catch { /* storage unavailable */ }
  });
  await page.goto(`${URL}${search}${hash}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(4000);
  return { page, errors };
};
const noteOf = async (page, testid) => {
  const loc = page.locator(`[data-testid="${testid}"]`).first();
  const ok = await loc.waitFor({ state: 'attached', timeout: 45000 }).then(() => true, () => false);
  return { ok, text: ok ? (await loc.textContent()) || '' : '', visible: ok ? await loc.isVisible() : false };
};
// The note sits in the same row as a money figure.
const besideFigure = (page, testid) => page.evaluate((id) => {
  const el = document.querySelector(`[data-testid="${id}"]`);
  const row = el?.closest('.tcard-line, .costrow, dd, li, div');
  return !!row && /[0-9]/.test(row.textContent.replace(el.textContent, ''));
}, testid);

const SIZES = [['phone 390', 390, 844], ['tablet 820', 820, 1180], ['tablet 1180', 1180, 820], ['desktop 1440', 1440, 900]];
for (const [label, width, height] of SIZES) {
  try {
    const a = await open({ width, height }, '#dest=LCG', '?g=1&st=dorm');
    const fb = await noteOf(a.page, 'price-fallback');
    check(`${label}: A Coruna dorm ask names the tier it priced`, fb.ok && /^No Hostel dorm here: priced as /.test(fb.text), fb.text);
    check(`${label}: the fallback is not the entire place`, fb.ok && !/Entire place/.test(fb.text), fb.text);
    check(`${label}: the fallback note sits beside a figure`, fb.ok && await besideFigure(a.page, 'price-fallback'));
    check(`${label}: A Coruna does not scroll sideways`, await noSideways(a.page));
    check(`${label}: no page error (A Coruna)`, a.errors.length === 0, a.errors.join(' | '));
    await a.page.close();

    const b = await open({ width, height }, '#dest=BSL', '?g=1&st=dorm');
    const md = await noteOf(b.page, 'price-modelled');
    check(`${label}: Basel's modelled bed says Not yet measured`, md.ok && md.text === 'Bed price: not yet measured', md.text);
    check(`${label}: the modelled note sits beside a figure`, md.ok && await besideFigure(b.page, 'price-modelled'));
    check(`${label}: Basel does not scroll sideways`, await noSideways(b.page));
    check(`${label}: no page error (Basel)`, b.errors.length === 0, b.errors.join(' | '));
    await b.page.close();

    const c = await open({ width, height }, '#dest=LCG', '?g=4&gc=2&gb=1&st=home');
    await c.page.locator('.tcard-line, .costrows').first().waitFor({ timeout: 45000 }).catch(() => {});
    check(`${label}: a family of 2 adults, 2 children and a baby draws the price card`, (await c.page.locator('.tcard-line').count()) > 0);
    check(`${label}: the family page does not scroll sideways`, await noSideways(c.page));
    check(`${label}: no page error (family)`, c.errors.length === 0, c.errors.join(' | '));
    await c.page.close();
  } catch (e) { check(`${label}: ran`, false, String(e).split('\n')[0]); }
}

// A width sweep over the fallback page: no sideways scroll at any width.
try {
  const { page } = await open({ width: 390, height: 844 }, '#dest=LCG', '?g=1&st=dorm');
  await noteOf(page, 'price-fallback');
  const bad = [];
  for (let w = 320; w <= 1600; w += 80) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(250);
    if (!(await noSideways(page))) bad.push(w);
  }
  check('width sweep 320 to 1600: no sideways scroll', bad.length === 0, bad.join(','));
  await page.close();
} catch (e) { check('width sweep ran', false, String(e).split('\n')[0]); }

await browser.close();
const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.label}${c.note && !c.ok ? `  [${c.note}]` : ''}`);
console.log(`\n${checks.length - failed.length} of ${checks.length} checks pass`);
process.exit(failed.length ? 1 : 0);
