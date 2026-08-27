// Render one destination's printable guide for design review.
//
//   npm run build && npx vite preview --port 4207
//   node scripts/shot_dossier_pdf.mjs CDG paris
//
// Writes shots/<name>.png (the whole document), shots/<name>.pdf (A4 print
// output) and shots/<name>-<section>.png for each section, so a layout change
// can be judged at full size rather than through a thumbnail of ten pages.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const id = process.argv[2] || 'CDG';
const out = process.argv[3] || 'dossier';
const BASE = process.argv[4] || 'http://127.0.0.1:4207/';
mkdirSync('shots', { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

for (let i = 0; i < 60; i++) {
  try { const r = await fetch(BASE); if (r.ok) break; } catch { /* not up yet */ }
  await wait(500);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
  } catch { /* storage unavailable */ }
});
await page.goto(`${BASE}#dest=${encodeURIComponent(id)}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6500);

const popupPromise = page.waitForEvent('popup', { timeout: 20000 }).catch(() => null);
await page.locator('.destp-pdf').click();
const popup = await popupPromise;
if (!popup) {
  console.log('no print window opened');
  await browser.close();
  process.exit(1);
}
// Commons photographs are hotlinked; give them time or the shot is grey boxes.
await popup.waitForTimeout(7000);
await popup.setViewportSize({ width: 900, height: 1200 });
await popup.screenshot({ path: `shots/${out}.png`, fullPage: true });
await popup.emulateMedia({ media: 'print' });
await popup.pdf({ path: `shots/${out}.pdf`, format: 'A4', printBackground: true })
  .catch((e) => console.log('pdf failed:', e.message.slice(0, 80)));
await popup.emulateMedia({ media: 'screen' });

const SECTIONS = [
  ['header.cover', 'cover'],
  ['.sec-hl', 'mustsee'],
  ['.sec:has(.dos)', 'do'],
  ['.sec:has(.trips)', 'trips'],
  ['.sec:has(.nat-grid)', 'nature'],
  ['.sec:has(.fests)', 'festivals'],
  ['.sec:has(.tips)', 'tips'],
  ['.credits-page', 'credits'],
];
for (const [sel, name] of SECTIONS) {
  const el = popup.locator(sel).first();
  if (await el.count() && await el.isVisible().catch(() => false)) {
    await el.screenshot({ path: `shots/${out}-${name}.png` }).catch(() => {});
  }
}
console.log(`wrote shots/${out}.png, ${out}.pdf and its sections`);
await browser.close();
