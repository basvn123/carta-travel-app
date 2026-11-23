// Logic wave 2 (ROADMAP C9, I5, I12, G12, G4): DOM checks with flag E9 on (build with config/flags.json E9 "new").
// At 390, 820 and 1440, and a width sweep:
//   - a device with a party, shortlist and home point in its mirror keeps them across a reload
//   - the address bar carries the party (it prices the link) but never the shortlist, home point or taste
//   - the mirror still holds the shortlist and the home point (rounded to 0.01 degree)
//   - the Explore share link, when the share control is on screen, carries no person key
//   - no page error, no sideways scroll
//
//   node scripts/verify_logic_w2.mjs [url]     (default http://localhost:$CARTA_PORT or 4173)
import { chromium } from 'playwright';
import { mirrorData } from './lib/dataMirror.mjs';

const URL = process.argv[2] || `http://localhost:${process.env.CARTA_PORT || 4173}/`;
const browser = await chromium.launch();
const checks = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });
const noSideways = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const PERSON = ['fav', 'dh', 'ty'];
// The device's own state: three adults, a two-place shortlist, a home point at four decimals (an old save).
const MIRROR = 'g=3&sort=price&fav=dest%3ABRU.dest%3ALIS&dh=50.84673%2C4.35251%2CBrussels';

const boot = async (viewport) => {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).split('\n')[0]));
  await mirrorData(page);
  await page.addInitScript((mirror) => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.homeSeen.v1', '1');
      localStorage.setItem('carta.welcomeSeen.v1', '1');
      // Only the first load: a reload must find what the app wrote, not this.
      if (!sessionStorage.getItem('w2.seeded')) {
        localStorage.setItem('continent.state.v1', mirror);
        sessionStorage.setItem('w2.seeded', '1');
      }
    } catch { /* storage unavailable */ }
  }, MIRROR);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.locator('.explore-tab').waitFor({ timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);
  return { page, errors };
};
const addressKeys = (page) => page.evaluate(() => [...new URLSearchParams(window.location.search).keys()]);
const mirrorOf = (page) => page.evaluate(() => new URLSearchParams(localStorage.getItem('continent.state.v1') || ''));
const mirrorKeys = async (page) => [...(await mirrorOf(page)).keys()];

for (const [label, width, height] of [['phone 390', 390, 844], ['tablet 820', 820, 1180], ['desktop 1440', 1440, 900]]) {
  try {
    const { page, errors } = await boot({ width, height });
    let keys = await addressKeys(page);
    check(`${label}: Explore draws and does not scroll sideways`, await noSideways(page));
    check(`${label}: the address keeps the party`, keys.includes('g'), keys.join(','));
    check(`${label}: the address has no shortlist, home point or taste`, PERSON.every((k) => !keys.includes(k)), keys.join(','));
    let m = await mirrorOf(page);
    check(`${label}: the mirror keeps the shortlist`, (m.get('fav') || '').includes('LIS'), m.get('fav') || 'none');
    check(`${label}: the home point is stored at 0.01 degree`, /^50\.85,4\.35,Brussels$/.test(m.get('dh') || ''), m.get('dh') || 'none');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.explore-tab').waitFor({ timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(3000);
    keys = await addressKeys(page);
    m = await mirrorOf(page);
    check(`${label}: a reload keeps the party, the shortlist and the home point`, m.get('g') === '3' && (m.get('fav') || '').includes('BRU') && (m.get('dh') || '').startsWith('50.85,4.35'), `g=${m.get('g')} fav=${m.get('fav')} dh=${m.get('dh')}`);
    check(`${label}: after the reload the address still has no person key`, PERSON.every((k) => !keys.includes(k)), keys.join(','));
    // The share control, when the dock shows one: its link carries no person key.
    await page.evaluate(() => { window.__copied = ''; navigator.clipboard.writeText = async (t) => { window.__copied = t; }; });
    const share = page.getByRole('button', { name: /share/i }).first();
    if (await share.isVisible().catch(() => false)) {
      await share.click();
      await page.waitForTimeout(600);
      const link = await page.evaluate(() => window.__copied);
      const q = new globalThis.URL(link || 'https://x.test/').searchParams;
      check(`${label}: the share link carries no person key`, Boolean(link) && [...PERSON, 'g', 'o', 'st'].every((k) => !q.has(k)), link || 'no link copied');
    } else {
      check(`${label}: the share control is not on this screen (the link is pinned in tests/shareKeys.test.mjs)`, true, 'not visible');
    }
    check(`${label}: no page error with E9 on`, errors.length === 0, errors.join(' | '));
    await page.close();
  } catch (e) {
    check(`${label}: ran`, false, String(e).split('\n')[0]);
  }
}

try {
  const bad = [];
  const { page } = await boot({ width: 1440, height: 900 });
  for (const w of [360, 390, 430, 600, 768, 820, 1024, 1180, 1280, 1440, 1600]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(250);
    if (!(await noSideways(page))) bad.push(w);
  }
  check('width sweep 360 to 1600: no horizontal overflow', bad.length === 0, bad.join(','));
  check('the mirror still lists the shortlist after the sweep', (await mirrorKeys(page)).includes('fav'));
} catch (e) {
  check('the width sweep ran', false, String(e).split('\n')[0]);
}

await browser.close();
const failed = checks.filter((c) => !c.ok).length;
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed > 0 ? 1 : 0);
