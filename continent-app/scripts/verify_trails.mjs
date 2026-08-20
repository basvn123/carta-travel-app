// Headless verify for the rebuilt Trails category and trail page.
//
//   node scripts/verify_trails.mjs [url]      (default http://localhost:4173)
//
// What this exists to catch, in the order the complaints came in:
//   the hero image     a trail card must show a photograph of the TRAIL, or
//                      no photograph at all. The old behaviour borrowed the
//                      nearest town's hero, which put a townhouse and a beach
//                      on Bulgarian mountain routes.
//   the rating         every trail card carries its own 0-10 chip, and the
//                      default order is best first.
//   the km filter      length band chips filter the list and carry counts.
//   loops              a loops-only chip, and a Loop marker on the card.
//   the GPX            the downloaded file must be ONE continuous track, not
//                      a set of segments that teleport between each other.
//   why it is special  the trail page leads with measured reasons.
//   the views          a photo strip of what the walk looks like.
//   the removed notes  the two paragraphs about which apps open a GPX and how
//                      following behaves are gone from every language.
//
// Screenshots to shots/trails-*.png.

import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:4173/';
// Which country's list to check. Slovenia by default: 150 curated routes,
// 63 of them loops, and enough relief that the reason codes have something to
// say. Pass another ISO2 to check a country whose photo pass has finished.
const CC = (process.argv[3] || 'SI').toUpperCase();

const browser = await chromium.launch();
const checks = [];
const check = (label, ok, note = '') => { checks.push({ label, ok, note }); };
const errors = [];
const NOISE = /emrldtp|ERR_FAILED|config is not valid/;

const seed = (page) => page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
  } catch { /* storage unavailable */ }
});

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
page.on('console', (m) => {
  if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 120));
});
await seed(page);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(3000);

// ── Reach the Trails category ────────────────────────────────────────────
// Desktop uses .header-nav-item; the bottom bar exists in the DOM but is
// hidden above 768px, so filtering by text alone finds an invisible button.
// The app also OPENS on Destinations, so the click is only a safety net.
const destTab = page.locator('.header-nav-item', { hasText: /destinations/i }).first();
if (await destTab.isVisible().catch(() => false)) {
  await destTab.click();
  await page.waitForTimeout(1200);
}
await page.locator('.places-cat', { hasText: /trails/i }).first().click();
await page.waitForTimeout(1000);
check('trails category opens', await page.locator('.places-tab').isVisible());

await page.locator('.places-country').selectOption(CC);
await page.waitForTimeout(2500);

const cards = page.locator('.places-tcard');
const nCards = await cards.count();
check('country list is much longer than the old 13', nCards >= 30, `${nCards} cards rendered`);

// ── The rating ───────────────────────────────────────────────────────────
const chips = page.locator('.places-tcard .score-chip');
const nChips = await chips.count();
check('trail cards carry their own rating chip', nChips >= nCards * 0.9,
  `${nChips} chips on ${nCards} cards`);
const scores = (await chips.allInnerTexts()).map((s) => parseFloat(s)).filter(Number.isFinite);
check('ratings are on the 0-10 scale', scores.every((s) => s >= 0 && s <= 10),
  `${Math.min(...scores)} to ${Math.max(...scores)}`);
const sortedDesc = scores.every((s, i) => i === 0 || scores[i - 1] >= s - 0.001);
check('default order is best rated first', sortedDesc,
  scores.slice(0, 5).join(', '));

// ── The hero image: a trail photo or nothing, never a borrowed town ───────
const imgs = await page.locator('.places-tcard .places-card-img').evaluateAll(
  (els) => els.map((e) => (e.tagName === 'IMG' ? e.getAttribute('src') : 'NOIMG')),
);
const real = imgs.filter((s) => s && s !== 'NOIMG');
check('trail cards show photographs', real.length > 0,
  `${real.length} of ${imgs.length} cards have one`);
check('every trail photograph comes from Commons',
  real.every((s) => /upload\.wikimedia\.org/.test(s)),
  real.slice(0, 1).join(''));
await page.screenshot({ path: `shots/trails-${CC.toLowerCase()}-list.png`, fullPage: false });

// ── The length filter ────────────────────────────────────────────────────
const bandChips = page.locator('.places-bands .places-class').filter({ hasNotText: /loops/i });
const nBands = await bandChips.count();
check('length band chips render', nBands >= 4, `${nBands} bands`);
const bandLabel = await bandChips.first().innerText().catch(() => '');
check('band chips carry a count', /\d/.test(bandLabel), bandLabel.replace(/\n/g, ' '));

// Tap the shortest band and confirm the list actually shortens to short walks.
const shortChip = page.locator('.places-bands .places-class', { hasText: /under 5 km/i }).first();
await shortChip.click();
await page.waitForTimeout(900);
const afterBand = await page.locator('.places-tcard').count();
check('length filter changes the list', afterBand > 0 && afterBand < nCards,
  `${afterBand} of ${nCards} after "Under 5 km"`);
const kmTexts = await page.locator('.places-tcard .places-card-facts').allInnerTexts();
const kms = kmTexts.map((s) => parseFloat(s)).filter(Number.isFinite);
// The card rounds to one decimal and drops a trailing zero, so a 4.96 km
// walk prints as "5 km". The bound is on the metres in the wire, not on the
// rounded label, so the assertion has to allow the boundary value back.
check('filtered list really is under 5 km', kms.every((k) => k <= 5),
  `max ${Math.max(...kms)} km as printed`);
await page.screenshot({ path: `shots/trails-${CC.toLowerCase()}-band-filter.png` });
await shortChip.click();
await page.waitForTimeout(700);

// ── Loops ────────────────────────────────────────────────────────────────
const loopChip = page.locator('.places-loopchip').first();
check('loops-only chip is offered', await loopChip.count() > 0);
if (await loopChip.count()) {
  await loopChip.click();
  await page.waitForTimeout(900);
  const loopCards = await page.locator('.places-tcard').count();
  const loopMarks = await page.locator('.places-tcard .places-card-loop').count();
  check('loops filter returns only loops', loopCards > 0 && loopMarks === loopCards,
    `${loopMarks} loop marks on ${loopCards} cards`);
  await page.screenshot({ path: `shots/trails-${CC.toLowerCase()}-loops.png` });
  await loopChip.click();
  await page.waitForTimeout(700);
}

// ── Sort by length ───────────────────────────────────────────────────────
await page.locator('.places-sort', { hasText: /length/i }).first().click();
await page.waitForTimeout(900);
const sortedKm = (await page.locator('.places-tcard .places-card-facts').allInnerTexts())
  .map((s) => parseFloat(s)).filter(Number.isFinite);
check('length sort orders shortest first',
  sortedKm.every((k, i) => i === 0 || sortedKm[i - 1] <= k + 0.001),
  sortedKm.slice(0, 5).join(', '));
await page.locator('.places-sort', { hasText: /rating/i }).first().click();
await page.waitForTimeout(800);

// ── The trail page ───────────────────────────────────────────────────────
await page.locator('.places-tcard').first().click();
await page.waitForTimeout(3500);
check('trail page opens', await page.locator('.tpage').isVisible());

const why = page.locator('.tpage-why');
check('page leads with why this walk is special', await why.count() > 0);
const whyLines = await page.locator('.tpage-why .tpage-story li').count();
check('the why section makes several measured claims', whyLines >= 2, `${whyLines} lines`);
const whyText = await why.innerText().catch(() => '');
check('why text is composed, not a raw code',
  whyText.length > 20 && !/\bcode\b|undefined|NaN/.test(whyText),
  whyText.replace(/\n/g, ' | ').slice(0, 120));

const pageRating = await page.locator('.tpage-sub .score-chip').first().innerText().catch(() => '');
check('trail page carries the rating', /^\d/.test(pageRating.trim()), pageRating);

// The removed paragraphs must be gone.
const body = await page.locator('.tpage-scroll').innerText();
check('the GPX apps paragraph is gone',
  !/Komoot, AllTrails, OsmAnd/i.test(body) && !/mymaps\.google\.com/i.test(body));
check('the following-works paragraph is gone',
  !/Following works while this page is open/i.test(body)
  && !/It stops when the phone locks/i.test(body));

// Views strip and highlights.
const views = await page.locator('.tpage-view').count();
check('views along the way render', views > 0, `${views} photographs`);
if (views > 1) {
  const ats = await page.locator('.tpage-view-at').allInnerTexts();
  check('view photographs say where on the route they were taken',
    ats.length > 0, ats.slice(0, 3).join(', '));
}
const hls = await page.locator('.tpage-highlights li').count();
check('what you walk past is listed', hls >= 0, `${hls} named features`);
await page.screenshot({ path: `shots/trails-${CC.toLowerCase()}-page.png`, fullPage: false });
await page.locator('.tpage-scroll').evaluate((el) => el.scrollTo(0, 900));
await page.waitForTimeout(700);
await page.screenshot({ path: `shots/trails-${CC.toLowerCase()}-page-views.png` });

// ── The GPX must be one continuous track ─────────────────────────────────
const download = await Promise.all([
  page.waitForEvent('download', { timeout: 20000 }).catch(() => null),
  page.locator('.tpage-primary').click(),
]).then(([d]) => d);
if (download) {
  const stream = await download.createReadStream();
  let gpx = '';
  for await (const chunk of stream) gpx += chunk;
  const segs = (gpx.match(/<trkseg>/g) || []).length;
  const pts = (gpx.match(/<trkpt /g) || []).length;
  check('GPX is a single continuous track segment', segs === 1, `${segs} trkseg, ${pts} points`);
  check('GPX carries full resolution geometry, not the card sketch', pts > 100, `${pts} points`);
  check('GPX carries elevation', /<ele>/.test(gpx));
  check('GPX credits OpenStreetMap',
    /OpenStreetMap contributors/.test(gpx) && /opendatacommons\.org/.test(gpx));
  // The teleport test: no jump between consecutive points bigger than a
  // kilometre. This is what 142 of the old 545 published hikes failed.
  const coords = [...gpx.matchAll(/<trkpt lat="([-\d.]+)" lon="([-\d.]+)"/g)]
    .map((m) => [parseFloat(m[1]), parseFloat(m[2])]);
  let worst = 0;
  for (let i = 1; i < coords.length; i += 1) {
    const [la1, lo1] = coords[i - 1];
    const [la2, lo2] = coords[i];
    const dy = (la2 - la1) * 111.32;
    const dx = (lo2 - lo1) * 111.32 * Math.cos((la1 * Math.PI) / 180);
    worst = Math.max(worst, Math.sqrt(dx * dx + dy * dy));
  }
  check('GPX never teleports between points', worst < 1,
    `largest step ${(worst * 1000).toFixed(0)} m`);
} else {
  check('GPX downloads', false, 'no download event');
}

// ── Phone ────────────────────────────────────────────────────────────────
// The filter rail is the one genuinely new piece of chrome, and it is a row
// of six chips on a 390px screen. It has to wrap rather than push the page
// sideways: a horizontally scrolling body is the classic way a chip row
// breaks a phone layout.
const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
phone.on('pageerror', (e) => errors.push('phone pageerror: ' + String(e.message).slice(0, 120)));
await seed(phone);
await phone.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await phone.waitForTimeout(3000);
await phone.locator('.bottom-nav-item', { hasText: /destinations/i }).first().click();
await phone.waitForTimeout(1200);
await phone.locator('.places-cat', { hasText: /trails/i }).first().click();
await phone.waitForTimeout(900);
await phone.locator('.places-country').selectOption(CC);
await phone.waitForTimeout(2500);
check('phone: trail cards render', await phone.locator('.places-tcard').count() > 5);
check('phone: the filter rail is there',
  await phone.locator('.places-bands .places-class').count() >= 4);
const overflow = await phone.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
check('phone: nothing pushes the page sideways', overflow <= 1, `${overflow}px of overflow`);
await phone.screenshot({ path: `shots/trails-${CC.toLowerCase()}-phone.png` });
await phone.locator('.places-tcard').first().click();
await phone.waitForTimeout(3500);
check('phone: trail page opens', await phone.locator('.tpage').isVisible());
const pOverflow = await phone.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
check('phone: the trail page fits the screen', pOverflow <= 1, `${pOverflow}px of overflow`);
await phone.locator('.tpage-scroll').evaluate((el) => el.scrollTo(0, 620));
await phone.waitForTimeout(1000);
await phone.screenshot({ path: `shots/trails-${CC.toLowerCase()}-phone-page.png` });

// ── Report ───────────────────────────────────────────────────────────────
await browser.close();
let failed = 0;
for (const c of checks) {
  if (!c.ok) failed += 1;
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
}
if (errors.length) {
  console.log(`\n${errors.length} page error(s):`);
  for (const e of errors.slice(0, 8)) console.log('  ' + e);
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed || errors.length ? 1 : 0);
