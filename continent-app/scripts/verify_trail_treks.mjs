// T1184 (ROADMAP D24): a stage's trail page shows its whole trek. Serves a
// trails wire that pipeline/trails/treks.py --apply has stamped (TREK_WIRE,
// a copy of public/trails/*.json) in place of the shipped country files,
// opens a stage of the BergeSeen Trail from cold at phone and desktop width,
// checks the trek block (name, stage count, total, days, the gap line, this
// stage marked) and that another stage opens from the list.
//   TREK_WIRE=<dir> node scripts/verify_trail_treks.mjs [url] [stageId] [cc]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:5199/';
const id = process.argv[3] || '20040';
const cc = process.argv[4] || 'AT';
const wire = process.env.TREK_WIRE;
const shots = '../.work/shots/T1184';
if (!wire || !fs.existsSync(path.join(wire, `${cc}.json`))) {
  console.error('TREK_WIRE must name a folder holding the stamped country files');
  process.exit(2);
}
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
  await page.addInitScript(() => { try { localStorage.setItem('carta.onboarded', '1'); } catch { /* private mode */ } });
  await page.goto(`${base}#trail=${id}&tc=${cc}`);
  const block = page.locator('[data-testid="trek-stages"]');
  await block.waitFor({ timeout: 45000 }).catch(() => {});
  ok(await block.count() === 1, `${name}: the stage page shows one trek block`);
  if (!(await block.count())) { await page.screenshot({ path: `${shots}/trek-${name}-missing.png` }); await ctx.close(); continue; }
  const head = await block.locator('.pt-block-title').innerText();
  const total = (await block.locator('[data-testid="trek-total"]').innerText()).replace(/\s+/g, ' ');
  const items = await block.locator('.rstages li').count();
  ok(/BergeSeen Trail/.test(head), `${name}: block names the trek (${head})`);
  ok(/This is stage \d+\./.test(total) && /\d+ published stages, [\d,]+ km, [\d,]+ m up\. About \d+ days on foot/.test(total), `${name}: total line (${total})`);
  ok(items >= 2, `${name}: ${items} stages listed`);
  ok(/this stage/.test(await block.innerText()), `${name}: the stage being read is marked`);
  const gap = block.locator('[data-testid="trek-missing"]');
  ok(!(await gap.count()) || /Not published here yet: stage \d/.test(await gap.innerText()), `${name}: gap line ${await gap.count() ? await gap.innerText() : 'absent'}`);
  await block.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}/trek-${name}.png` });
  await block.screenshot({ path: `${shots}/trek-block-${name}.png` });
  const other = block.locator('button.rstage').first();
  ok(await other.count() > 0, `${name}: the other stages are links`);
  if (await other.count()) {
    const want = (await other.locator('.rstage-name').innerText()).trim();
    await other.click();
    await page.waitForFunction((w) => {
      const h = document.querySelector('[data-testid="trek-stages"]');
      return h && [...h.querySelectorAll('.rbase-sub')].some((s) => /this stage/.test(s.textContent)
        && s.parentElement.textContent.includes(w));
    }, want, { timeout: 20000 }).then(() => ok(true, `${name}: opening "${want}" lands on its page, marked as this stage`))
      .catch(() => ok(false, `${name}: opening "${want}" did not land on its page`));
  }
  await ctx.close();
}
await b.close();
process.exit(bad ? 1 : 0);
