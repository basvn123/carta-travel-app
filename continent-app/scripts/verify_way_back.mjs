// T1185 (ROADMAP D24): a one-way walk's trail page shows the way back.
// Serves a trails wire stamped by pipeline/trails/way_back.py (WB_WIRE, a copy
// of public/trails/*.json), opens one walk from cold at phone and desktop
// width and checks the block: title, the straight-line line, the public
// transport line, the taxi flagged as an estimate, no horizontal scroll.
//   WB_WIRE=<dir> node scripts/verify_way_back.mjs [url] [id] [cc]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:5199/';
const id = process.argv[3] || '20050';
const cc = process.argv[4] || 'AT';
const wire = process.env.WB_WIRE;
const shots = '../Execution/P15/T1185-shots';
if (!wire || !fs.existsSync(path.join(wire, `${cc}.json`))) { console.error('WB_WIRE must name the stamped folder'); process.exit(2); }
fs.mkdirSync(shots, { recursive: true });
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let bad = 0;
const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) bad++; };
for (const [name, vp] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 860 }]]) {
  const ctx = await b.newContext({ viewport: vp });
  await ctx.route(/\/trails\/[A-Z]{2}\.json(\?.*)?$/, (route) => {
    const f = path.join(wire, path.basename(new URL(route.request().url()).pathname));
    if (!fs.existsSync(f)) return route.continue();
    return route.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(f) });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => { try { localStorage.setItem('carta.onboarded', '1'); } catch { /* private mode */ } });
  await page.goto(`${base}#trail=${id}&tc=${cc}`);
  const block = page.locator('[data-testid="way-back"]');
  await block.waitFor({ timeout: 45000 }).catch(() => {});
  ok(await block.count() === 1, `${name}: one way-back block`);
  if (await block.count()) {
    const text = (await block.innerText()).replace(/\s+/g, ' ');
    console.log(`     ${text}`);
    ok(/straight line/.test(text), `${name}: the straight-line distance is said`);
    ok(/Public transport\./.test(text), `${name}: a public transport line`);
    ok(/Taxi: about .* \(an estimate\)/.test(text), `${name}: the taxi is an estimate`);
    ok(!/\d+ ?min.*(train|bus)/i.test(await block.locator('[data-way="pt"]').innerText()), `${name}: no public transport minutes`);
    await block.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${shots}/wayback-${name}.png` });
  }
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${name}: no horizontal scroll`);
  ok(errors.length === 0, `${name}: no page errors ${errors.slice(0, 1)}`);
  await ctx.close();
}
await b.close();
process.exit(bad ? 1 : 0);
