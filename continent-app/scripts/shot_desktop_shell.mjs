// Clean screenshots of the desktop browse chrome, no interactions first.
//   node scripts/shot_desktop_shell.mjs [url]
import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:4173/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
  } catch { /* storage unavailable */ }
});
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(4500);
await page.screenshot({ path: 'shots/final-destinations.png' });

// A country picked, so the sorts and the priced cards show.
await page.locator('.places-ccard').nth(8).click();
await page.waitForTimeout(2500);
await page.screenshot({ path: 'shots/final-destinations-country.png' });

await page.locator('.header-nav-item', { hasText: /explore/i }).first().click();
await page.waitForTimeout(3500);
await page.mouse.move(4, 500);
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/final-explore.png' });
await browser.close();
