// Headless verify for rating v5's one word set (T763, Roadmap/2.10b-rating-v5.md).
//
//   node scripts/verify_rating_words.mjs [url]
//   (default http://localhost:$CARTA_PORT or 4173; the R4 end check runs it on 5763)
//
// A DOM check, no screenshots. For the baseline places (five metros, five
// villages, five areas, chosen across the score range) it opens the
// destination page and reads the Score in the head and in "Why it rates";
// on Explore it reads every card on the first screen; on each page it also
// reads every other ScoreChip (nature tiles, nearby rows). Every chip must
// carry the band its own figure falls in (lib/rating.js bandForScore) and
// print that band's English word, and one place must read the same word in
// the head, the breakdown and its Explore card.

import { chromium } from 'playwright';
import { bandForScore } from '../src/lib/rating.js';

const URL = process.argv[2] || `http://localhost:${process.env.CARTA_PORT || 4173}/`;
const WORD = { exceptional: 'Exceptional', excellent: 'Excellent', very_good: 'Very good', good: 'Good', pleasant: 'Pleasant' };
const PLACES = [
  'FCO', 'VNO', 'CTA', 'ZAG', 'MJV',
  'gem:hallstatt', 'gem:visegrad', 'gem:narni', 'gem:casoli', 'gem:lido-di-castel-fusano',
  'gem:como', 'gem:bohemian-switzerland', 'gem:yorkshire-dales', 'gem:symonds-yat', 'gem:dugi-otok',
];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
await context.addInitScript(() => { try { localStorage.setItem('continent.lang.v1', 'en'); } catch { /* ignore */ } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));

const fails = [];
let chips = 0;
const readChips = (root = 'body') => page.$$eval(`${root} .score-chip`, (els) => els.map((e) => ({
  band: e.dataset.band || '', score: e.dataset.score || '',
  word: e.querySelector('.score-chip-band')?.textContent?.trim() || '',
})));
function judge(where, list) {
  for (const c of list) {
    chips += 1;
    const want = bandForScore(Number(c.score)) || '';
    if (c.band !== want) fails.push(`${where}: ${c.score} carries ${c.band || 'none'}, expected ${want || 'none'}`);
    if (c.word && c.word !== WORD[want]) fails.push(`${where}: ${c.score} reads "${c.word}", expected "${WORD[want] || ''}"`);
  }
}

const seen = {};
for (const id of PLACES) {
  await page.goto(`${URL}#dest=${encodeURIComponent(id)}`, { waitUntil: 'domcontentloaded' });
  const head = await page.waitForSelector('.destp-score .score-chip', { timeout: 30000 }).catch(() => null);
  if (!head) { fails.push(`${id}: no Score in the head`); continue; }
  const [h] = await readChips('.destp-score');
  seen[id] = h.word;
  judge(`${id} head`, [h]);
  judge(`${id} page`, await readChips('.destp-grid'));
  // "Why it rates" lives on Practical; the head Score opens it.
  await page.click('.destp-score');
  const rb = await page.waitForSelector('[data-testid="rating-breakdown"] .score-chip', { timeout: 10000 }).catch(() => null);
  if (rb) {
    const [b] = await readChips('[data-testid="rating-breakdown"]');
    judge(`${id} breakdown`, [b]);
    if (b.band !== h.band) fails.push(`${id}: head ${h.band}, breakdown ${b.band}`);
  } else {
    fails.push(`${id}: no breakdown`);
  }
}

// Explore, the overview's rails and the list's first screen.
await page.goto(`${URL}?tab=map`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.score-chip', { timeout: 30000 }).catch(() => null);
judge('explore', await readChips());

console.log(`places ${Object.keys(seen).length}/${PLACES.length}, chips read ${chips}`);
for (const [id, w] of Object.entries(seen)) console.log(`  ${id.padEnd(28)} ${w}`);
if (errors.length) console.log('page errors:', errors.slice(0, 5));
if (fails.length) {
  console.log(`FAIL (${fails.length})`);
  for (const f of fails.slice(0, 30)) console.log('  ' + f);
  await browser.close();
  process.exit(1);
}
console.log('PASS: every chip carries the band of its own figure; head and breakdown agree');
await browser.close();
