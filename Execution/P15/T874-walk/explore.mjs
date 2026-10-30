// T874 exploration: one sentence, then press the primary on every screen, logging titles.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const APP = 'C:/Users/Gebruiker/Documents/Portfolio/Travel App/continent-app';
const { chromium } = await import(`file:///${APP}/node_modules/playwright/index.mjs`);
const PORT = 5874;
const [W0, LANG, SENT, QS] = process.argv.slice(2);
const W = Number(W0 || 1440);
const OUT = `C:/Users/Gebruiker/Documents/Portfolio/Travel App/Execution/P15/T874-walk/explore`;
mkdirSync(OUT, { recursive: true });
const fx = (n) => JSON.parse(readFileSync(`${APP}/tests/fixtures/${n}`, 'utf8'));
function sweep() { const f = fx('tf1-flights-BRU.json'); const at = Math.floor(Date.now() / 60000) - 30;
  for (const side of [f.to, f.back]) for (const days of Object.values(side)) for (const v of Object.values(days)) if (Array.isArray(v)) v[5] = at; f.checked = at; f.from = 'BRU'; return f; }
const AIRLINES = readFileSync('C:/Users/Gebruiker/Documents/Portfolio/wt/t817-airlines-index.json', 'utf8');
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: W < 500 ? 812 : 900 }, serviceWorkers: 'block' });
const page = await ctx.newPage(); page.setDefaultTimeout(6000);
page.on('pageerror', (e) => console.log('pageerror', e.message.split('\n')[0]));
await page.route('**/flights/*.json', (r) => { const code = r.request().url().match(/flights\/([A-Z_a-z]+)\.json/)?.[1];
  if (code === '_index') return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: AIRLINES });
  return code === 'BRU' ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sweep()) }) : r.fulfill({ status: 404, body: '' }); });
await page.route('**/api/flights**', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
await page.addInitScript((lg) => { try { localStorage.setItem('continent.lang.v1', lg); localStorage.setItem('continent.guestMode.v1', '1');
  localStorage.setItem('continent.homeSeen.v1', '1'); localStorage.setItem('carta.welcomeSeen', '1'); localStorage.setItem('continent.mapGuideDismissed.v1', '1'); } catch {} }, LANG || 'en');
await page.goto(`http://localhost:${PORT}/${QS || '?o=BRU&oa=BRU.CRL&ah=p&dh=51.0540,3.7170,Ghent'}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(2500);
await page.locator('.header-nav-item:visible, nav.bottom-nav .bottom-nav-item:visible').nth(1).click(); await page.waitForTimeout(1500);
const dump = async (tag) => { const d = await page.evaluate(() => {
  const pf = document.querySelector('.pf');
  return { title: document.querySelector('.pf-title')?.innerText.trim(), h1: document.querySelector('h1:not([hidden])')?.innerText.trim(),
    marks: [...document.querySelectorAll('.pf-mark')].map((m) => (m.classList.contains('is-done') ? 'x' : m.classList.contains('is-on') ? 'o' : '.')).join(''),
    body: (pf || document.body).innerText.replace(/\s+/g, ' ').slice(0, 600), cls: [...document.querySelectorAll('.pf > *, .tff-trips, .tff-tp, .tpg, .ffl')].map((e) => e.className.split(' ')[0]).join(',') }; });
  console.log(`\n== ${tag}`, JSON.stringify(d)); };
await dump('plan home');
await page.locator('.pf-open-start').click(); await page.waitForTimeout(900);
await dump('kind sheet');
await page.locator('.pf .pf-foot .btn-primary').first().click(); await page.waitForTimeout(900);
await dump('tell');
const field = page.locator('#pf-tell'); await field.click(); await field.pressSequentially(SENT, { delay: 4 }); await page.waitForTimeout(1000);
console.log('chips', JSON.stringify(await page.locator('.pf-read-chips .pf-read-chip').allInnerTexts()));
await page.screenshot({ path: `${OUT}/tell-${W}.png` });
for (let k = 0; k < 22; k++) {
  if (await page.locator('.tpg').count()) { await dump('TRIP PAGE V4'); break; }
  const prim = page.locator('.pf .pf-foot .btn-primary:visible, .tff-tp-plan:visible').last();
  if (await page.locator('.tff-trips').count() && !(await page.locator('.tff-tp').count())) { await dump('results'); await page.locator('.tff-list .tff-card-open').first().click(); await page.waitForTimeout(1500); continue; }
  if (await page.locator('.ffl').count()) { await dump('flights'); await page.locator('.ffl .ffl-card').first().locator('.card-open').click(); await page.waitForTimeout(2500); continue; }
  await dump(`step ${k}`);
  await page.screenshot({ path: `${OUT}/s${k}-${W}.png` });
  if (await prim.count() && await prim.isEnabled()) await prim.click(); else { console.log('primary disabled: picking the first option'); await page.locator('.pf [role="radio"]:visible, .pf [role="checkbox"]:visible, .pf .ui-tile:visible, .pf button[aria-pressed]:visible').first().click().catch((e) => console.log('pick failed', e.message.slice(0, 120))); }
  await page.waitForTimeout(1300);
}
await page.screenshot({ path: `${OUT}/end-${W}.png` });
await browser.close();
