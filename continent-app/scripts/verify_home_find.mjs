// Headless smoke for the homepage "Price any city" search.
// Serves the built app (vite preview), then:
//   1. The find field sits above the receipt; typing lists suggestions with
//      live per-person prices in mono.
//   2. Picking one reprices the ENTIRE receipt for that city: title, exact
//      total, and lines that still sum to it. The deck's live previews follow.
//   3. Accent folding: "krak" finds Krakow's diacritic spelling.
//   4. The keyboard drives it: ArrowDown + Enter picks, Escape closes.
//   5. The clear button returns the receipt to today's cheapest trip.
//   6. Gibberish gets the honest empty row, never a silent nothing.
//   7. 380px: the section still fits with no horizontal scroll.
// Run from inside continent-app/:  node scripts/verify_home_find.mjs
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4191;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

const isUp = async () => {
  try { return (await fetch(BASE)).ok; } catch { return false; }
};
let srv = null;
const waitForServer = async () => {
  if (await isUp()) return;
  srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    shell: true, stdio: 'ignore',
  });
  for (let i = 0; i < 60; i += 1) {
    if (await isUp()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite preview never came up');
};

const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };
const money = (s) => Number(s.replace(/[^\d.,]/g, '').replace(/,/g, ''));

try {
  await waitForServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await page.goto(`${BASE}/?d=2026-08-04&r=2026-08-08&g=1&b=priority_10kg&o=CRL&tab=home`);
  try {
    await page.getByRole('button', { name: 'Continue without an account' }).click({ timeout: 15000 });
  } catch { /* auth not configured in this build */ }
  await page.locator('.home-page').waitFor({ timeout: 120000 });
  await page.locator('.home-r-big').first().waitFor({ timeout: 60000 });

  // ---- 1. The field exists, labelled, above the receipt.
  const input = page.locator('#home-find-input');
  if (!(await input.count())) fail('no #home-find-input on the page');
  const defaultCity = await page.locator('.home-r-title').first().innerText();
  console.log('receipt opens on the cheapest:', JSON.stringify(defaultCity));

  await input.scrollIntoViewIfNeeded();
  await input.click();
  await input.pressSequentially('barc', { delay: 40 });
  await page.locator('.home-find-list [role="option"]').first().waitFor({ timeout: 10000 });
  const optTexts = await page.locator('.home-find-list [role="option"]').allInnerTexts();
  if (!optTexts.some((s) => /Barcelona/i.test(s))) {
    fail(`"barc" did not suggest Barcelona: ${optTexts.join(' | ')}`);
  }
  if (!optTexts.some((s) => /€\s?[\d.,]+/.test(s))) {
    fail(`suggestions carry no live prices: ${optTexts.join(' | ')}`);
  }
  console.log('suggestions:', optTexts.map((s) => JSON.stringify(s.replace(/\n/g, ' '))).join(' '));
  await page.screenshot({ path: `${SHOTS}/home-find-open.png` });

  // ---- 2. Picking Barcelona reprices the whole receipt.
  await page.locator('.home-find-list [role="option"]', { hasText: 'Barcelona' }).first()
    .locator('button').dispatchEvent('mousedown');
  await page.waitForTimeout(400);
  const pickedTitle = await page.locator('.home-r-title').first().innerText();
  if (!/Barcelona/i.test(pickedTitle)) fail(`receipt title is ${pickedTitle}, not Barcelona`);
  const rTotal = await page.locator('.home-r-big').innerText();
  if (!/€\s?[\d.,]+\.\d{2}/.test(rTotal)) fail(`picked total is not an exact euro figure: ${rTotal}`);
  const sum = (await page.locator('.home-r-line b').allInnerTexts())
    .reduce((a, s) => a + money(s), 0);
  if (Math.abs(sum - money(rTotal)) > 0.02) {
    fail(`picked receipt lines sum to ${sum.toFixed(2)} but the total says ${rTotal}`);
  }
  console.log(`Barcelona receipt adds up: ${sum.toFixed(2)} = ${rTotal}`);
  // The deck's live split preview must follow the same destination.
  const prevCap = await page.locator('.home-prev-cap').nth(1).innerText();
  if (!/Barcelona/i.test(prevCap)) {
    fail(`the split preview still shows another city: ${prevCap}`);
  }
  console.log('deck preview follows:', JSON.stringify(prevCap));
  await page.locator('.home-receipt').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/home-find-picked.png` });

  // ---- 3. Accent folding: "krak" must surface the diacritic spelling.
  await input.click();
  await input.press('Control+a');
  await input.pressSequentially('krak', { delay: 40 });
  await page.locator('.home-find-list [role="option"]').first().waitFor({ timeout: 10000 });
  const krak = await page.locator('.home-find-list [role="option"]').allInnerTexts();
  if (!krak.some((s) => /Krak/i.test(s))) fail(`"krak" found nothing Krakow-like: ${krak.join(' | ')}`);
  console.log('accent folding:', JSON.stringify(krak[0].replace(/\n/g, ' ')));

  // ---- 4. The keyboard drives it: ArrowDown + Enter picks the second row.
  const second = (krak[1] || krak[0]).split('\n')[0];
  await input.press('ArrowDown');
  await input.press('Enter');
  await page.waitForTimeout(400);
  const kbTitle = await page.locator('.home-r-title').first().innerText();
  if (krak.length > 1 && !kbTitle.startsWith(second.split(',')[0])) {
    fail(`ArrowDown+Enter picked ${kbTitle}, expected ${second}`);
  }
  if (await page.locator('.home-find-list').count()) fail('the list stayed open after Enter');
  console.log('keyboard pick:', JSON.stringify(kbTitle));

  // ---- 5. Clear returns to the cheapest.
  await page.locator('.home-find-clear').click();
  await page.waitForTimeout(400);
  const clearedTitle = await page.locator('.home-r-title').first().innerText();
  if (clearedTitle !== defaultCity) {
    fail(`clear returned to ${clearedTitle}, not the cheapest ${defaultCity}`);
  }
  if (await input.inputValue()) fail('clear left text in the field');
  console.log('clear returns to the cheapest trip');

  // ---- 6. Gibberish gets the honest empty row.
  await input.click();
  await input.pressSequentially('zzzzqq', { delay: 30 });
  await page.locator('.home-find-none').waitFor({ timeout: 10000 });
  const none = await page.locator('.home-find-none').innerText();
  if (!/zzzzqq/.test(none)) fail(`the empty row does not echo the query: ${none}`);
  console.log('empty row:', JSON.stringify(none));
  await input.press('Escape');

  // ---- 7. 380px: the find field and list stay inside the viewport.
  const ctx2 = await browser.newContext({
    viewport: { width: 380, height: 820 }, isMobile: true, hasTouch: true,
  });
  const page2 = await ctx2.newPage();
  await page2.addInitScript(() => { localStorage.setItem('continent.guestMode.v1', '1'); });
  await page2.goto(`${BASE}/?d=2026-08-04&r=2026-08-08&g=1&b=priority_10kg&o=CRL&tab=home`);
  await page2.locator('.home-page').waitFor({ timeout: 120000 });
  await page2.locator('#home-find-input').scrollIntoViewIfNeeded();
  await page2.locator('#home-find-input').click();
  await page2.locator('#home-find-input').pressSequentially('barc', { delay: 40 });
  await page2.locator('.home-find-list [role="option"]').first().waitFor({ timeout: 10000 });
  const overflow = await page2.evaluate(() => {
    const root = document.querySelector('.home-page');
    return root.scrollWidth > root.clientWidth + 1;
  });
  if (overflow) fail('the open find list makes 380px scroll sideways');
  await page2.screenshot({ path: `${SHOTS}/home-find-380.png` });
  console.log('380px: find field and list fit');

  await browser.close();
  if (process.exitCode !== 1) console.log('verify_home_find OK');
} catch (err) {
  fail(err.message);
} finally {
  if (srv) {
    srv.kill();
    if (process.platform === 'win32' && srv.pid) {
      try { spawnSync('taskkill', ['/pid', String(srv.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ }
    }
  }
  process.exit(process.exitCode === 1 ? 1 : 0);
}
