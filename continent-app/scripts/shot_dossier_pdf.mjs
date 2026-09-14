// Download one destination's PDF guide for design review.
//
//   npm run build && npx vite preview --port 4207
//   node scripts/shot_dossier_pdf.mjs FCO rome
//
// Opens the page with the ?paymock seam (the export is a paid action and a
// headless run cannot hold an entitlement), clicks "Download PDF guide", and
// saves the download to shots/<name>.pdf. Read the PDF page by page to judge
// the layout at full size.
import { chromium } from 'playwright';
import { mkdirSync, statSync } from 'node:fs';

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
page.on('pageerror', (e) => console.log('pageerror:', e.message.split('\n')[0]));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|net::|503|404/.test(m.text())) console.log('console:', m.text().slice(0, 160)); });
await page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
  } catch { /* storage unavailable */ }
});
await page.goto(`${BASE}?paymock#dest=${encodeURIComponent(id)}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6500);

const dlPromise = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
await page.locator('.destp-pdf').click();
const dl = await dlPromise;
if (!dl) {
  console.log('no download started');
  await page.screenshot({ path: `shots/${out}-pdf-fail.png` });
  await browser.close();
  process.exit(1);
}
const path = `shots/${out}.pdf`;
await dl.saveAs(path);
console.log(`saved ${path} (${statSync(path).size} bytes) as ${dl.suggestedFilename()}`);
await browser.close();
