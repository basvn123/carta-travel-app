// Logic wave 0b (ROADMAP G4): DOM checks for the visible quick wins.
//   E-10  a fresh visitor's Sort menu has no "For you" (no taste the match can score)
//   D-7   no empty SAC or "Reachable" chip group is drawn on a trail list
//   F-10  the place page's When block never says "Hot and busy" without a crowd figure
//   H-9 / A-18 / A-8 are pinned in node (tests/quickWins0b.test.mjs, tests/flowGraph.test.mjs)
// The phone has no Sort on the toolbar: its Sort list is checked inside the Filters sheet.
// At 390, 820 and 1440, then a width sweep for horizontal overflow.
//
//   node scripts/verify_logic_0b.mjs [url]     (default http://localhost:$CARTA_PORT or 4173)
import { chromium } from 'playwright';
import { mirrorData } from './lib/dataMirror.mjs';

const URL = process.argv[2] || `http://localhost:${process.env.CARTA_PORT || 4173}/`;
const browser = await chromium.launch();
const checks = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });

const boot = async (viewport) => {
  const page = await browser.newPage({ viewport });
  await mirrorData(page);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.homeSeen.v1', '1');
      localStorage.setItem('carta.welcomeSeen.v1', '1');
    } catch { /* storage unavailable */ }
  });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.locator('.explore-tab').waitFor({ timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  return page;
};

for (const [label, width, height] of [['phone 390', 390, 844], ['tablet 820', 820, 1180], ['desktop 1440', 1440, 900]]) {
  try {
    const page = await boot({ width, height });
    const see = page.locator('.xrails-rail .hs-see-all:visible').first();
    await see.waitFor({ timeout: 30000 });
    await see.click();
    await page.locator('.xrows .xrow').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(1000);
    const sortBtn = page.locator('.xap .btn, .xap button', { hasText: /sort/i }).or(page.getByRole('button', { name: /sort/i })).filter({ visible: true }).first();
    if (await sortBtn.isVisible().catch(() => false)) {
      await sortBtn.click();
      await page.locator('.xsort-menu[role="menu"] [role="menuitemradio"]').first().waitFor({ timeout: 5000 }).catch(() => {});
      const items = (await page.locator('.xsort-menu[role="menu"] [role="menuitemradio"]').allInnerTexts()).map((x) => x.trim());
      check(`${label}: a visitor with no taste is not offered For you`, items.length >= 3 && !items.some((x) => /for you/i.test(x)), items.join(' | '));
      await page.keyboard.press('Escape');
    } else {
      // The phone keeps Sort inside the Filters sheet: open it and read the Sort list there.
      const filters = page.getByRole('button', { name: /^filters/i }).filter({ visible: true }).first();
      await filters.click({ timeout: 8000 }).catch(() => {});
      const sheet = page.locator('.fsheet[role="dialog"], [role="dialog"]').filter({ visible: true }).first();
      await sheet.waitFor({ timeout: 8000 }).catch(() => {});
      const sortOpts = (await sheet.locator('[role="radio"], [role="menuitemradio"], button').allInnerTexts()).map((x) => x.trim());
      const hasSort = sortOpts.some((x) => /^score$|^rating$/i.test(x)) && sortOpts.some((x) => /a to z/i.test(x));
      check(`${label}: the Filters sheet lists Sort, without For you for a visitor with no taste`, hasSort && !sortOpts.some((x) => /for you/i.test(x)), sortOpts.slice(0, 12).join(' | '));
      await page.keyboard.press('Escape');
    }
    check(`${label}: no horizontal overflow on the list`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await page.close();
  } catch (e) {
    check(`${label}: the Explore pass ran`, false, String(e).split('\n')[0]);
  }
}

// D-7: a trail list draws no SAC or Reachable group while no row can answer it.
// F-10: the place page says "Hot in", never "Hot and busy", where crowds are unknown (Mostar).
for (const [label, width, height] of [['phone 390', 390, 844], ['tablet 820', 820, 1180], ['desktop 1440', 1440, 900]]) {
  try {
    const page = await boot({ width, height });
    await page.goto(`${URL}?tab=explore&cat=trails&dn=SI`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(6000);
    const body = await page.locator('body').innerText();
    check(`${label}: the Slovenia trail list is open`, /Slovenia/.test(body) && body.length > 400);
    check(`${label}: no SAC or Reachable chip group is drawn`, !/SAC|Reachable by|Reachable on/i.test(body));
    await page.goto(`${URL}#dest=gem:mostar-ba`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(7000);
    const when = (await page.locator('.when-verdict').allInnerTexts()).join(' | ');
    check(`${label}: Mostar's When says "Hot in Jul to Aug" and never "Hot and busy"`, /Hot in /.test(when) && !/Hot and busy/.test(when), when.replace(/\n+/g, ' / ').slice(0, 160));
    check(`${label}: the place page does not scroll sideways`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await page.close();
  } catch (e) {
    check(`${label}: the trail and place pass ran`, false, String(e).split('\n')[0]);
  }
}

// Width sweep: the Explore overview must never scroll sideways.
try {
  const page = await boot({ width: 1600, height: 900 });
  const bad = [];
  for (let w = 360; w <= 1600; w += 80) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(150);
    if (!(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))) bad.push(w);
  }
  check('width sweep 360 to 1600: no horizontal overflow', bad.length === 0, bad.join(','));
  await page.close();
} catch (e) {
  check('the width sweep ran', false, String(e).split('\n')[0]);
}

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed += 1;
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
await browser.close();
process.exit(failed > 0 ? 1 : 0);
