// The AI proposal card, checked on its own: the day drawn as a numbered walking
// route on a map, a photo (or its category glyph) on every stop, and row and pin
// selecting each other. Needs no account, no Edge Function and no AI quota,
// which is what the full-flow test (verify_ai_flow.mjs) does need.
//
//   npx vite --port 4188      # dev server, then:
//   node scripts/ai/verify_ai_proposal.mjs
import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:4188/scripts/ai/proposal_preview.html';
const errors = [];
const results = [];
const check = (name, cond) => { results.push({ name, cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 780, height: 1400 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => errors.push('pageerror: ' + (e.message || String(e)).split('\n')[0]));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/tile|cartocdn|ERR_|emrldtp/i.test(t)) return;
  errors.push('console: ' + t.slice(0, 140));
});

let osrmOk = false;
page.on('response', async (r) => {
  if (!/routed-foot/.test(r.url())) return;
  if (r.status() !== 200) return;
  const j = await r.json().catch(() => null);
  if (j?.routes?.[0]?.geometry?.coordinates?.length > 10) osrmOk = true;
});

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForSelector('.ai-sched', { timeout: 15000 });
await page.waitForTimeout(4500); // tiles + OSRM

check('map rendered', await page.locator('.ai-route-map canvas').isVisible().catch(() => false));
check('one numbered pin per stop', (await page.locator('.ai-route-map .trip-pin').count()) === 8);
check('pin numbers run 1..8',
  (await page.locator('.ai-route-map .trip-pin-no').allInnerTexts()).join(',') === '1,2,3,4,5,6,7,8');
check('the real walking route was fetched and drawn', osrmOk);
// A pin drawn outside its own map is worse than no pin: it lands on the card.
check('every pin sits inside the map frame', await page.evaluate(() => {
  const box = document.querySelector('.ai-route-map').getBoundingClientRect();
  return [...document.querySelectorAll('.ai-route-map .trip-pin-shape')].every((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= box.top - 1 && r.bottom <= box.bottom + 1
      && r.left >= box.left - 1 && r.right <= box.right + 1;
  });
}));
check('every stop has a thumbnail', (await page.locator('.ai-sched-stop .day-thumb').count()) === 8);
check('stops with a photo show it', (await page.locator('.ai-sched-stop img.day-thumb').count()) >= 3);
// A thumbnail that renders at zero size is not a thumbnail: an inline span
// silently ignores width/height, which is exactly how the photos first shipped.
check('thumbnails are actually drawn at size', await page.evaluate(() => [
  ...document.querySelectorAll('.ai-sched-stop .day-thumb'),
].every((el) => el.getBoundingClientRect().width >= 36)));
// Three of the catalogue's Ghent photo URLs are dead (Wikimedia 400s on some
// 640px thumbs). The row must never show a blank tinted square for one.
check('every photo on screen actually loaded', await page.evaluate(() => [
  ...document.querySelectorAll('.ai-sched-stop img.day-thumb'),
].every((el) => el.complete && el.naturalWidth > 0)));
check('a dead photo url falls back to its glyph',
  (await page.locator('.ai-sched-stop .day-thumb-empty svg').count()) === 5);
check('no stop is left without a thumbnail',
  (await page.locator('.ai-sched-stop img.day-thumb').count())
  + (await page.locator('.ai-sched-stop .day-thumb-empty').count()) === 8);
check('row numbers match the pins',
  (await page.locator('.ai-sched-no').allInnerTexts()).join(',') === '1,2,3,4,5,6,7,8');
check('phase labels announced once per block',
  (await page.locator('.ai-sched-time').allInnerTexts()).filter(Boolean).length >= 3);
check('the bot find is tagged', (await page.locator('.ai-disc-tag').count()) === 1);

await page.screenshot({ path: 'scripts/ai/shots/p1-proposal.png', fullPage: true });

// Pin -> row
const before = await page.evaluate(() => document.querySelector('.ai-route-map .trip-pin').getBoundingClientRect().top);
// Click the drawn shape, which is where the pin visually is: a decluttered pin
// fans its shape away from its (maplibre-owned) marker box.
await page.locator('.ai-route-map .trip-pin .trip-pin-shape').nth(1).click();
await page.waitForTimeout(900);
check('tapping a pin selects its row',
  (await page.locator('.ai-sched-stop.on .ai-sched-no').innerText()) === '2');
check('selecting does not re-frame the map (the whole day stays visible)',
  Math.abs(await page.evaluate(() => document.querySelector('.ai-route-map .trip-pin').getBoundingClientRect().top) - before) < 2);
await page.screenshot({ path: 'scripts/ai/shots/p3-pin-selected.png', fullPage: true });

// Row -> pin
await page.locator('.ai-sched-main').nth(4).click();
await page.waitForTimeout(900);
check('tapping a row selects exactly one row', (await page.locator('.ai-sched-stop.on').count()) === 1);
check('tapping a row highlights its pin',
  (await page.locator('.ai-route-map .trip-pin.active .trip-pin-no').innerText()) === '5');
await page.screenshot({ path: 'scripts/ai/shots/p2-row-selected.png', fullPage: true });

// Phone, loaded AT phone size (resizing an already-framed map only stretches
// the old view, which is not what a phone visitor gets).
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await phone.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await phone.waitForSelector('.ai-sched', { timeout: 15000 });
await phone.waitForTimeout(4500);
check('no horizontal overflow at 390px', await phone.evaluate(
  () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
check('every pin sits inside the map frame on a phone', await phone.evaluate(() => {
  const box = document.querySelector('.ai-route-map').getBoundingClientRect();
  return [...document.querySelectorAll('.ai-route-map .trip-pin-shape')].every((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= box.top - 1 && r.bottom <= box.bottom + 1
      && r.left >= box.left - 1 && r.right <= box.right + 1;
  });
}));
await phone.screenshot({ path: 'scripts/ai/shots/p4-phone.png', fullPage: true });

await browser.close();
const failed = results.filter((r) => !r.cond).length;
console.log(`\nchecks failed: ${failed}  |  errors: ${errors.length}`);
errors.slice(0, 8).forEach((e) => console.log('  ' + e));
process.exit(failed || errors.length ? 1 : 0);
