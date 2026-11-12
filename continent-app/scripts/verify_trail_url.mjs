// G13 (T1102): a walk has its own address. Opens #trail=ID&tc=CC from cold,
// checks the page and the address, then opens one from its card, checks the
// hash is written and that Back closes it.
//   node scripts/verify_trail_url.mjs [url] [id] [cc]
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:5199/';
const id = process.argv[3] || '20050';
const cc = process.argv[4] || 'AT';
const shots = '../.work/shots/T1102';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let bad = 0;
const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) bad++; };
for (const [name, vp] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 860 }]]) {
  const ctx = await b.newContext({ viewport: vp });
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.setItem('carta.onboarded', '1'); } catch {} });
  await page.goto(`${base}#trail=${id}&tc=${cc}`);
  await page.waitForSelector('.tpage, .ox-page, [data-testid="outdoor-page"]', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  ok(page.url().includes(`trail=${id}`), `${name}: cold open keeps #trail=${id} in the address (${page.url().split('#')[1]})`);
  ok(/BergeSeen/.test(await page.locator('body').innerText()), `${name}: trail page shows its title`);
  await page.screenshot({ path: `${shots}/trail-${name}.png` });
  // Close with the page's own back control: the address drops the trail.
  await page.locator('.tpage button').first().click();
  await page.waitForTimeout(1200);
  const tile = (await page.locator('.storyr', { hasText: /walks in/i }).locator('.card').first().innerText()).replace(/\s+/g, ' ');
  ok(/\d+ ?h|\d+ ?min/.test(tile) && /\+\d[\d,. ]*m/.test(tile) && /km/.test(tile), `${name}: top-band rail tile shows length, time and climb (${tile.slice(0, 120)})`);
  await page.screenshot({ path: `${shots}/trail-rail-${name}.png` });
  const card = page.locator('.pcard.places-tcard').first();
  ok(!page.url().includes('trail='), `${name}: closing clears the trail from the address (${page.url().split('#')[1]})`);
  if (await card.count()) {
    const txt = (await card.innerText()).replace(/\s+/g, ' ');
    ok(/\d+ ?h|\d+ ?min/.test(txt) && /\+\d[\d,. ]*m/.test(txt), `${name}: card shows time and climb (${txt.slice(0, 110)})`);
    await page.screenshot({ path: `${shots}/trail-list-${name}.png` });
    await card.locator('.card-open').first().click().catch(() => card.click());
    await page.waitForTimeout(2000);
    ok(/#trail=\d+&tc=[A-Z]{2}/.test(page.url()), `${name}: opening a card writes the address (${page.url().split('#')[1]})`);
    await page.goBack();
    await page.waitForTimeout(1200);
    ok(!page.url().includes('trail='), `${name}: Back closes the walk and clears the address`);
  } else ok(false, `${name}: no trail card found after closing`);
  await ctx.close();
}
await b.close();
process.exit(bad ? 1 : 0);
