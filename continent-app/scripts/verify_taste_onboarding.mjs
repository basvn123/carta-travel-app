// Headless verify for the taste profile's onboarding (T764, rating v5 Layer 3).
//
//   node scripts/verify_taste_onboarding.mjs [url]
//   (default http://localhost:$CARTA_PORT or 4173; the R4 end check runs it on 5763)
//
// At 390x844 (phone first), service workers blocked, storage cleared:
//   (a) a fresh Explore opens the start dialog on "Who usually comes?"; the
//       fewest taps that set a taste with chip words are counted and timed:
//       Next, one like (Hiking), Skip;
//   (b) after a reload the Explore header chip still reads the taste
//       ("For you: hiking"), so it survived through urlState / local storage;
//   (c) a fresh visit again: Skip is one tap and leaves no taste.
//
// The start dialog stays shut for a driven browser (navigator.webdriver, so the
// other verify scripts never meet it); this script reports a normal browser.

import { chromium } from 'playwright';

const URL = process.argv[2] || `http://localhost:${process.env.CARTA_PORT || 4173}/`;
const browser = await chromium.launch();
const checks = [];
const errors = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });
const NOISE = /ERR_FAILED|config is not valid|Failed to load resource/;

async function freshPage() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 140)); });
  await page.addInitScript(() => {
    try { Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }); } catch { /* ignore */ }
    try {
      // Only on the first load of this context: the reload in (b) must keep
      // what the first load stored.
      if (!sessionStorage.getItem('t764.cleared')) {
        localStorage.clear();
        sessionStorage.setItem('t764.cleared', '1');
      }
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.homeSeen.v1', '1');
      localStorage.setItem('carta.welcomeSeen', '1');
    } catch { /* storage unavailable */ }
  });
  return { context, page };
}

async function openExplore(page) {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  const guest = page.getByText(/continue without an account/i).first();
  if (await guest.isVisible({ timeout: 1500 }).catch(() => false)) await guest.click();
}

const dialog = (page) => page.locator('.xstart[role="dialog"]');

// (a) the fewest taps that set a taste with words on the chip.
{
  const { context, page } = await freshPage();
  await openExplore(page);
  const d = dialog(page);
  const opened = await d.waitFor({ state: 'visible', timeout: 20000 }).then(() => true, () => false);
  check('a. a fresh Explore on a phone opens the start dialog', opened);
  if (opened) {
    await d.locator('.taste-steps[data-step="party"]').waitFor({ timeout: 10000 }).catch(() => {});
    check('a. it opens on "Who usually comes?"', (await d.locator('.taste-q').first().textContent().catch(() => ''))?.includes('Who usually comes'));
    check('a. No preference is offered', await d.getByRole('radio', { name: 'No preference' }).first().isVisible().catch(() => false));
    const t0 = Date.now();
    let taps = 0;
    await d.locator('.taste-next').click(); taps += 1;
    await d.locator('.taste-steps[data-step="likes"]').waitFor({ timeout: 10000 });
    await d.locator('.pf-like[data-like="hiking"]').click(); taps += 1;
    const pressed = await d.locator('.pf-like[data-like="hiking"]').getAttribute('aria-pressed');
    check('a. Hiking is picked', pressed === 'true', `aria-pressed=${pressed}`);
    await d.locator('.taste-skip').click(); taps += 1;
    await d.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
    const ms = Date.now() - t0;
    check('a. the dialog closes after Skip', !(await d.isVisible().catch(() => false)));
    check('a. a taste is set in under 30 s', ms < 30000, `${taps} taps, ${ms} ms (scripted; a person reads each screen)`);
    const chip = page.locator('.xtaste-chip').first();
    await chip.waitFor({ timeout: 10000 }).catch(() => {});
    const chipText = (await chip.textContent().catch(() => '')) || '';
    check('a. the header chip reads the taste', /For you: hiking/i.test(chipText), chipText.trim());
    console.log(`TAPS_SET_TASTE=${taps} ELAPSED_MS=${ms}`);

    // (b) the taste survives a reload.
    await page.waitForTimeout(600); // the urlState writer is debounced 300 ms
    const stored = await page.evaluate(() => localStorage.getItem('continent.state.v1') || '');
    check('b. the local mirror carries ty', /(?:^|&)ty=/.test(stored), stored.slice(0, 120));
    await page.reload({ waitUntil: 'domcontentloaded' });
    const chip2 = page.locator('.xtaste-chip').first();
    await chip2.waitFor({ timeout: 20000 }).catch(() => {});
    const chipText2 = (await chip2.textContent().catch(() => '')) || '';
    check('b. after a reload the chip still reads the taste', /For you: hiking/i.test(chipText2), chipText2.trim());
    check('b. no start dialog after a reload', !(await dialog(page).isVisible().catch(() => false)));
    // The chip opens the same four questions as a sheet.
    await chip2.click().catch(() => {});
    const sheet = page.locator('.taste-sheet[role="dialog"]');
    const sheetOpen = await sheet.waitFor({ timeout: 10000 }).then(() => true, () => false);
    check('b. the chip opens the taste sheet', sheetOpen);
    if (sheetOpen) check('b. the sheet starts on the same first question', ((await sheet.locator('.taste-q').textContent()) || '').includes('Who usually comes'));
  }
  await context.close();
}

// (c) Skip is one tap.
{
  const { context, page } = await freshPage();
  await openExplore(page);
  const d = dialog(page);
  const opened = await d.waitFor({ state: 'visible', timeout: 20000 }).then(() => true, () => false);
  check('c. a fresh visit opens the dialog again', opened);
  if (opened) {
    await d.locator('.taste-skip').waitFor({ timeout: 10000 });
    let taps = 0;
    await d.locator('.taste-skip').click(); taps += 1;
    await d.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
    check('c. Skip is one tap', !(await d.isVisible().catch(() => false)) && taps === 1, `${taps} tap`);
    const chipText = (await page.locator('.xtaste-chip').first().textContent().catch(() => '')) || '';
    check('c. after Skip the chip invites', /Tell Carta what you like/i.test(chipText), chipText.trim());
    console.log(`TAPS_SKIP=${taps}`);
  }
  await context.close();
}

await browser.close();
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
if (errors.length) console.log(`errors:\n  ${[...new Set(errors)].slice(0, 10).join('\n  ')}`);
const failed = checks.filter((c) => !c.ok).length;
console.log(`${checks.length - failed}/${checks.length} checks pass`);
process.exit(failed ? 1 : 0);
