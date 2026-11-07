// T1175 (ROADMAP K7): the shareable trip receipt, in the browser.
//   With ?savedmock (E2E seams) and ?receipt=1 (the flag), My trips' next trip
//   menu offers "Share the receipt"; the sheet draws a 1080 x 1350 PNG with
//   the numbers check passed, previews it and offers Save (and Share where
//   the browser can share files). Without the flag the menu item is absent.
//   Checked at 390 x 844 and 1440 x 900; no sideways scroll on the phone.
// Run from continent-app/ with a dev server started as
//   VITE_E2E_SEAMS=1 npx vite --port 5231 --strictPort
// then: CARTA_PORT=5231 node scripts/verify_share_receipt.mjs
// Requests to the data host are answered from public/ or empty (it is not
// reachable from a dev box). CHROMIUM_PATH overrides the browser; SHOTS a folder for one screenshot per width.
import { chromium } from 'playwright';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';

const PORT = Number(process.env.CARTA_PORT) || 5231;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = process.env.SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

let failed = 0;
const fail = (msg) => { console.error('FAIL:', msg); failed += 1; };
const ok = (msg) => console.log('  ok:', msg);

const enterApp = async (page) => {
  try { await page.getByRole('button', { name: 'Continue without an account' }).click({ timeout: 8000 }); } catch { /* not shown */ }
  for (const label of ['Explore the map', 'Open the app', 'Got it']) {
    try { await page.getByRole('button', { name: label }).first().click({ timeout: 2000 }); } catch { /* not shown */ }
  }
  await page.waitForTimeout(500);
};
const openSaved = async (page) => {
  const btn = page.locator('.header-nav-item, .bottom-nav-item')
    .filter({ hasText: /^(Saved trips|My trips)$/ }).locator('visible=true').first();
  await btn.waitFor({ timeout: 25000 });
  await btn.click();
  await page.locator('.saved-trips-panel').waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);
};
const openMenu = async (page) => {
  const card = page.locator('.mt-next-card').first();
  await card.waitFor({ timeout: 15000 });
  await card.locator('.mt-menu button[aria-haspopup="menu"]').click();
  await page.locator('.mt-menu-pop').waitFor({ timeout: 5000 });
};

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  for (const [w, h, name] of [[390, 844, 'phone'], [1440, 900, 'desktop']]) {
    console.log(`${name} ${w}x${h}`);
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    // The data host is out of reach from a dev box or a cloud container: serve
    // a shipped copy from public/ where there is one, else an empty answer.
    await page.route(/^https:\/\/data\.carta-europetravel\.com\//, (route) => {
      const path = new URL(route.request().url()).pathname.replace(/^\/data\//, '/');
      const local = `public${path}`;
      if (existsSync(local)) return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(local) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: path.endsWith('_index.json') ? '{}' : 'null' });
    });

    // Flag off: no menu item.
    await page.goto(`${BASE}/?savedmock=next&receipt=0`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await enterApp(page);
    await openSaved(page);
    await openMenu(page);
    if (await page.getByRole('menuitem', { name: 'Share the receipt' }).count()) fail('the item shows with the flag off');
    else ok('flag off: no "Share the receipt"');

    // Flag on.
    await page.goto(`${BASE}/?savedmock=next&receipt=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await enterApp(page);
    await openSaved(page);
    await openMenu(page);
    const item = page.getByRole('menuitem', { name: 'Share the receipt' });
    if (!(await item.count())) { fail('no "Share the receipt" with the flag on'); await ctx.close(); continue; }
    await item.click();
    const body = page.locator('[data-share-receipt]');
    await body.waitFor({ timeout: 10000 });
    await page.waitForFunction(() => document.querySelector('[data-share-receipt]')?.dataset.shareReceipt !== 'drawing', null, { timeout: 15000 });
    const status = await body.getAttribute('data-share-receipt');
    if (status !== 'ready') { fail(`the sheet says ${status}`); await ctx.close(); continue; }
    ok('the numbers check passed and the image is drawn');
    const img = page.locator('.share-receipt-img');
    const size = await img.evaluate((el) => ({ w: el.naturalWidth, h: el.naturalHeight, shown: el.getBoundingClientRect().width, alt: el.alt }));
    if (size.w !== 1080 || size.h !== 1350) fail(`image is ${size.w}x${size.h}`); else ok('image 1080 x 1350');
    if (!/€/.test(size.alt)) fail(`alt text has no price: ${size.alt}`); else ok(`alt: ${size.alt}`);
    const sheet = await page.locator('.share-receipt-sheet').evaluate((el) => el.getBoundingClientRect().width);
    if (size.shown > sheet) fail('the image is wider than the sheet'); else ok(`image ${Math.round(size.shown)} px in a ${Math.round(sheet)} px sheet`);
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (sideways) fail('sideways scroll'); else ok('no sideways scroll');
    const save = page.getByRole('button', { name: 'Save the image' });
    if (!(await save.isVisible())) fail('no Save button');
    else {
      const box = await save.boundingBox();
      if (box.height < 44) fail(`Save is ${box.height} px tall`); else ok(`Save ${Math.round(box.height)} px tall`);
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), save.click()]);
      const fname = dl.suggestedFilename();
      if (!/^carta-lisbon.*\.png$|^carta-.*\.png$/.test(fname)) fail(`download named ${fname}`); else ok(`download ${fname}`);
    }
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/receipt-${name}.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    if (await page.locator('.share-receipt-sheet').count()) fail('Escape did not close the sheet'); else ok('Escape closes');
    if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log('verify_share_receipt: all good');
