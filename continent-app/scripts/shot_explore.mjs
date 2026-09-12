// Screenshots of the Explore page, desktop and phone, grid and map.
//   node scripts/shot_explore.mjs [url] [prefix]
// Writes shots/<prefix>-explore-*.png. Serve dist first (vite preview).
import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:4173/';
const OUT = process.argv[3] || 'after';
const browser = await chromium.launch();

async function boot(viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.mapGuideDismissed.v1', '1');
      localStorage.setItem('carta.welcomeSeen.v1', '1');
    } catch { /* storage unavailable */ }
  });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3500);
  return page;
}

// desktop
{
  const page = await boot({ width: 1440, height: 900 });
  const tab = page.locator('.header-nav-item', { hasText: /explore/i }).first();
  if (await tab.isVisible().catch(() => false)) { await tab.click(); await page.waitForTimeout(3500); }
  await page.mouse.move(4, 500);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `shots/${OUT}-explore-desktop.png` });
  await page.locator('.explore-tab').evaluate((el) => el.scrollBy(0, 760));
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `shots/${OUT}-explore-desktop-2.png` });
  // hover preview on the first grid card
  const card = page.locator('.explore-grid .xcard').first();
  if (await card.isVisible().catch(() => false)) {
    await card.hover();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `shots/${OUT}-explore-desktop-hover.png` });
    await page.mouse.move(4, 500);
  }
  // the map beside the grid
  const mapBtn = page.locator('.xbar .xview-toggle button').nth(1);
  if (await mapBtn.isVisible().catch(() => false)) {
    await mapBtn.click();
    await page.waitForTimeout(4500);
    await page.screenshot({ path: `shots/${OUT}-explore-desktop-map.png` });
    await page.locator('.xbar .xview-toggle button').first().click();
    await page.waitForTimeout(800);
  }
  // one fold closed, one filter on
  const village = page.locator('.explore-side .xrail-toggle', { hasText: /^Village$/ }).first();
  if (await village.isVisible().catch(() => false)) {
    await village.click();
    await page.waitForTimeout(1500);
    await page.locator('.explore-tab').evaluate((el) => el.scrollTo(0, 0));
    await page.waitForTimeout(600);
    await page.screenshot({ path: `shots/${OUT}-explore-desktop-filtered.png` });
  }
  await page.close();
}

// phone
{
  const page = await boot({ width: 390, height: 844 });
  const tab = page.locator('.bottom-nav-item', { hasText: /explore/i }).first();
  if (await tab.isVisible().catch(() => false)) { await tab.click(); await page.waitForTimeout(3500); }
  await page.screenshot({ path: `shots/${OUT}-explore-phone.png` });
  await page.locator('.explore-tab').evaluate((el) => el.scrollBy(0, 640));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `shots/${OUT}-explore-phone-2.png` });
  await page.locator('.explore-tab').evaluate((el) => el.scrollBy(0, 900));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `shots/${OUT}-explore-phone-3.png` });
  const fabMap = page.locator('.xview-fab button').nth(1);
  if (await fabMap.isVisible().catch(() => false)) {
    await fabMap.click();
    await page.waitForTimeout(4500);
    await page.screenshot({ path: `shots/${OUT}-explore-phone-map.png` });
  }
  await page.close();
}
await browser.close();
