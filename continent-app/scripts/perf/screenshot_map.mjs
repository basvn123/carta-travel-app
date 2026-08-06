// Headless browse-map screenshots at continental and city zoom, for visual
// regression checks on the price-pin layers. Serves the built app (dist/) with
// its real data; usage: node scripts/perf/screenshot_map.mjs <label> [outDir]
// Writes <outDir>/map-<label>-continental.png and map-<label>-city.png.
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = path.join(APP, 'dist');
// Ephemeral port: fixed ones kept colliding with stale servers on this machine.
let BASE = '';
const require = createRequire(path.join(APP, 'package.json'));
const { chromium } = require('playwright');

const label = process.argv[2] || 'shot';
const outDir = process.argv[3] || path.join(os.tmpdir(), 'carta-perf');
fs.mkdirSync(outDir, { recursive: true });

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  let file = urlPath === '/' ? path.join(DIST, 'index.html') : path.join(DIST, urlPath.slice(1));
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, resolve));
BASE = `http://localhost:${server.address().port}`;

try {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => { localStorage.setItem('continent.guestMode.v1', '1'); });
  await page.goto(`${BASE}/?tab=map`, { waitUntil: 'domcontentloaded' });
  await page.locator('.maplibregl-canvas').waitFor({ timeout: 120000 });
  await page.locator('.result-row').first().waitFor({ timeout: 240000 });
  // Clear anything floating over the map (welcome, fare notice, START HERE).
  try { await page.getByRole('button', { name: 'Explore the map' }).click({ timeout: 3000 }); } catch { /* absent */ }
  try { await page.getByRole('button', { name: 'Got it' }).click({ timeout: 2000 }); } catch { /* absent */ }
  try { await page.locator('.map-guide-pill').click({ timeout: 2000 }); } catch { /* absent */ }
  await page.waitForTimeout(4000);   // symbol placement settles

  await page.screenshot({ path: path.join(outDir, `map-${label}-continental.png`) });

  // City zoom: wheel in over the map centre-right (Benelux/Germany at the
  // default camera), the densest part of the catalogue.
  const box = await page.locator('.maplibregl-canvas').boundingBox();
  const cx = box.x + box.width * 0.62, cy = box.y + box.height * 0.5;
  for (let i = 0; i < 8; i += 1) {
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(outDir, `map-${label}-city.png`) });

  await browser.close();
  console.log(`wrote map-${label}-continental.png and map-${label}-city.png to ${outDir}`);
} finally {
  server.close();
}
