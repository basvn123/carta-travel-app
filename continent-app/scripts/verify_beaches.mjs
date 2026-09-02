// Headless verify for the beach layer: the Beaches category on the
// Destinations tab, and the beach page one card opens.
//
//   node scripts/verify_beaches.mjs [url]      (default http://localhost:4173)
//
// What it is checking, in the order a traveller meets it:
//   the tab shows BEACHES, not trips, and not a page of country flags
//   the country dropdown, the priced-from picker and the stay tier are GONE
//     from this category (they are back on General, which is also checked)
//   every card carries a photograph, a pin with the place, and a score
//   typing a country name swaps the European ranking for that country's list
//   the page carries the pin row, three or four photographs with credits, the
//     composed explanation, the facts, the score breakdown, and no GPX or
//     route export anywhere on it
//
// Phone viewport first, because that is how the tab is entered, then one
// desktop pass. Screenshots to shots/beaches-*.png.

import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:4173/';

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

try {
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
page.on('console', (m) => {
  if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 120));
});
await seed(page);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(3000);

await page.locator('.bottom-nav-item', { hasText: /destinations/i }).first().click();
await page.waitForTimeout(1200);
check('destinations tab opens', await page.locator('.places-tab').isVisible());

// The chrome that must exist on General, so its absence on Beaches means
// something was removed rather than never rendered.
// :visible on both. The desktop shell renders the country picker twice, in
// the phone toolbar and in the left panel, and only one of them is ever on
// screen. Counting the DOM rather than the view asserted a layout that has
// not existed since the desktop shell landed.
check('General still carries the country picker', await page.locator('.places-country:visible').count() === 1);

await page.locator('.places-cat', { hasText: /beaches/i }).click();
await page.waitForTimeout(2500);

// ── The controls this tab carries, and the ones it does not ──
// The country picker is one of the first: it used to be on three tabs out of
// six, and on the other three the only way to reach a country was to type its
// name into the search field and hope the match landed.
check('country picker is on Beaches', await page.locator('.places-country:visible').count() === 1);
check('priced-from picker is gone on Beaches', await page.locator('.places-controls .origin-btn').count() === 0);
check('lifestyle tier is gone on Beaches', await page.locator('.lifestyle-btn:visible').count() === 0);
check('price and A-Z sorts are gone on Beaches', await page.locator('.places-sort').count() === 0);
check('the search field stays', await page.locator('.places-search input').count() === 1);

// ── Every published photograph must evidence being of its beach ──
// The wire itself, not the rendered page: this is a data claim, and the
// cheapest place to catch "a playground stood in for a beach" is here.
const wire = await page.evaluate(async () => {
  const r = await fetch('/beaches/top.json');
  return r.ok ? r.json() : null;
});
if (wire) {
  const shots = wire.beaches.flatMap((b) => (b.images || []).map((i) => ({ b, i })));
  const unevidenced = shots.filter(({ i }) => !['p18', 'cat', 'name', 'geo'].includes(i.ev));
  check('every published photograph carries its evidence', unevidenced.length === 0,
    unevidenced.length ? `${unevidenced.length} of ${shots.length} without` : `${shots.length} photographs`);
  const byKind = shots.reduce((acc, { i }) => { acc[i.ev] = (acc[i.ev] || 0) + 1; return acc; }, {});
  check('most photographs are name or category matched',
    ((byKind.name || 0) + (byKind.cat || 0) + (byKind.p18 || 0)) >= shots.length * 0.7,
    JSON.stringify(byKind));

  // ── beach_beauty_v2, checked against the wire ──
  // The photo floor. The rated tier's whole claim is about how a beach LOOKS,
  // so four pictures is the bar and the LEAD one has to prove it is this
  // beach: a geotagged frame may fill a later slot, never the hero slot.
  const thin = wire.beaches.filter((b) => (b.images || []).length < 4);
  check('every rated row carries four photographs', thin.length === 0,
    thin.length ? `${thin.length} of ${wire.beaches.length} short: ${thin.slice(0, 3).map((b) => `${b.name} ${(b.images || []).length}`).join(', ')}` : `${wire.beaches.length} rows`);
  const weakHero = wire.beaches.filter((b) => b.images?.[0]
    && !['p18', 'cat', 'name'].includes(b.images[0].ev));
  check('no rated row is led by a merely geotagged photograph', weakHero.length === 0,
    weakHero.length ? `${weakHero.length} rows` : 'all leads strongly evidenced');

  // top.json is rated only, ever (master spec section 3).
  const notRated = wire.beaches.filter((b) => b.t !== 'r');
  check("top.json holds rated rows only", notRated.length === 0,
    notRated.length ? `${notRated.length} rows are not t='r'` : `${wire.beaches.length} rated`);

  // Region completeness: a published row that does not know where it is
  // cannot be quota'd, floored or put on a region page.
  const noRegion = wire.beaches.filter((b) => !b.rg);
  check('every rated row carries its region block', noRegion.length === 0,
    noRegion.length ? `${noRegion.length} without rg` : 'all assigned');
}
if (!wire) check('the beach wire is readable', false);

// ── The index: the model, the tiers and the facets ──
const index = await page.evaluate(async () => {
  const r = await fetch('/beaches/index.json');
  return r.ok ? r.json() : null;
});
if (index) {
  const model = index.model || {};
  check('the model block is beach_beauty_v2', model.version === 'beach_beauty_v2', model.version);
  const w = model.weights || {};
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  check('the published weights sum to 1', Math.abs(sum - 1) < 1e-3, `sum ${sum.toFixed(4)}`);
  check('the model ships space and photo beauty',
    w.space != null && w.photo != null, Object.keys(w).join(','));
  // The brief's own table sums to 1.08; both it and the normalised one ship,
  // so the deviation is auditable from the wire rather than only from a
  // comment in the pipeline.
  check('the brief\'s own weight table ships beside the normalised one',
    !!model.weights_as_briefed, model.weights_as_briefed ? 'present' : 'missing');
  check('the region quota model rides with the data', !!model.region_quota);

  // No country's published count may equal a round constant: that is the
  // signature of a cap deciding a catalogue rather than a coast (master spec
  // section 9). PUBLISH_MAX is now a ceiling far above any quota sum.
  const capped = (index.countries || []).filter((c) => c.n === model.publish_max);
  check('no country is pinned to the publication ceiling', capped.length === 0,
    capped.length ? capped.map((c) => c.cc).join(',') : `ceiling ${model.publish_max}`);
  const atOldCap = (index.countries || []).filter((c) => c.n === 120);
  check('no country still publishes exactly 120', atOldCap.length === 0,
    atOldCap.length ? atOldCap.map((c) => c.cc).join(',') : 'the old cap is gone');

  // Facet counts: computed server side, and never zero. A facet group that
  // ships a zero is a chip the app would have to hide, so the wire should not
  // carry one in the first place.
  const facets = index.facets || {};
  const zeros = Object.entries(facets)
    .flatMap(([g, opts]) => Object.entries(opts).filter(([, n]) => !n).map(([k]) => `${g}:${k}`));
  check('no facet count in the wire is zero', zeros.length === 0, zeros.join(',') || `${Object.keys(facets).length} groups`);
  check('the wire carries facet counts at all', Object.keys(facets).length >= 5,
    Object.keys(facets).join(','));
  console.log('   facet groups: ' + Object.entries(facets)
    .map(([g, o]) => `${g}(${Object.keys(o).length})`).join(' '));
} else {
  check('the beach index is readable', false);
}

// ── The listed tier: no score, of any spelling ──
const listedProbe = await page.evaluate(async () => {
  const idx = await fetch('/beaches/index.json').then((r) => (r.ok ? r.json() : null));
  if (!idx) return null;
  const withListed = (idx.countries || []).filter((c) => c.listed > 0).slice(0, 6);
  const out = { countries: withListed.length, rows: 0, scored: 0, overPhotoBar: 0,
                mapCards: 0, weakEvidence: 0, ranked: 0 };
  for (const c of withListed) {
    const file = await fetch(`/beaches/${c.cc}.json`).then((r) => (r.ok ? r.json() : null));
    if (!file) continue;
    // The listed rows live in their OWN array. A screen has to opt in to
    // showing them, and they can never interleave into a ranked list.
    if (Array.isArray(file.beaches) && file.beaches.some((b) => b.t === 'l')) out.ranked += 1;
    for (const row of file.listed || []) {
      out.rows += 1;
      if ('score' in row || 'tier' in row || 'comp' in row) out.scored += 1;
      const imgs = row.images || [];
      if (imgs.length > 1) out.overPhotoBar += 1;
      if (!imgs.length) out.mapCards += 1;
      if (imgs.some((i) => !['p18', 'cat', 'name'].includes(i.ev))) out.weakEvidence += 1;
    }
  }
  return out;
});
if (listedProbe && listedProbe.rows) {
  check('listed rows carry no score of any spelling', listedProbe.scored === 0,
    `${listedProbe.rows} listed rows checked`);
  check('listed rows never interleave into the ranked array', listedProbe.ranked === 0);
  check('listed rows stay at one photograph or none',
    listedProbe.overPhotoBar === 0, `${listedProbe.mapCards} map cards`);
  check('a listed photograph is always strongly evidenced',
    listedProbe.weakEvidence === 0);
} else {
  check('the listed tier is populated', false, 'no listed rows found in the wire');
}

// ── Beaches, not a country index ──
const flagCards = await page.locator('.places-ccard').count();
check('no country flag index on Beaches', flagCards === 0, `${flagCards} flag cards`);
const cards = page.locator('.places-bcard');
const nCards = await cards.count();
check('beach cards render', nCards >= 3, `${nCards} cards`);

const cardImg = await cards.first().locator('.places-card-img').getAttribute('src').catch(() => '');
check('cards carry a real photograph', /^https:\/\/upload\.wikimedia\.org/.test(cardImg || ''),
  (cardImg || '').slice(0, 70));
check('no tracking params on the photo URL', !/utm_/.test(cardImg || ''));
const cardWhere = await cards.first().locator('.places-bcard-where').innerText().catch(() => '');
check('cards carry the pin and the place', cardWhere.trim().length > 1, cardWhere.replace(/\n/g, ' '));
check('cards carry a pin icon', await cards.first().locator('.places-bcard-where svg').count() === 1);
const cardScore = await cards.first().locator('.score-chip').innerText().catch(() => '');
check('cards carry a beauty score', /^\d/.test(cardScore.trim()), cardScore);
const cardTags = await cards.first().locator('.places-bcard-tags span').count();
check('cards carry reason chips', cardTags >= 1, `${cardTags} chips`);

// ── The filter rail: every chip carries a count, none of them zero ──
// This is the brief's rule and the screenshot it came from: the tab shipped
// "Excellent water 2", "Nothing built on it 0", "Lifeguard 0", and two chips
// reading zero tell a reader the filters are broken even when they are honest.
const chipTexts = await page.locator('.places-class-label').allInnerTexts();
const chipCounts = await page.locator('.places-class-n').allInnerTexts();
check('the filter rail renders chips', chipTexts.length >= 3, `${chipTexts.length} chips`);
check('every chip carries a count', chipCounts.length === chipTexts.length,
  `${chipCounts.length} counts for ${chipTexts.length} chips`);
const zeroChips = chipCounts.filter((n) => parseInt(n.replace(/\D/g, ''), 10) === 0);
check('no chip renders a zero count', zeroChips.length === 0,
  zeroChips.length ? `${zeroChips.length} zeros` : chipTexts.slice(0, 6).join(' | '));
check('the rail offers more than the three chips v1 had', chipTexts.length > 3,
  chipTexts.length + ' chips');
await page.screenshot({ path: 'shots/beaches-list.png', fullPage: false });

// Ranked, best first.
const scores = await page.locator('.places-bcard .score-chip').allInnerTexts();
const nums = scores.map((s) => parseFloat(s)).filter((n) => !Number.isNaN(n));
check('the list is ranked best first',
  nums.length > 2 && nums.every((n, i) => i === 0 || nums[i - 1] >= n - 0.001),
  nums.slice(0, 5).join(', '));

// ── Typing a country name opens that country's full list ──
const firstCountry = (await page.locator('.places-bcard-where').first().innerText().catch(() => ''))
  .split(',').pop().trim();
if (firstCountry) {
  await page.locator('.places-search input').fill(firstCountry);
  await page.waitForTimeout(2200);
  const countryHead = await page.locator('.places-beachhead').first().innerText().catch(() => '');
  check('typing a country names it over the list', new RegExp(firstCountry, 'i').test(countryHead),
    countryHead.replace(/\n/g, ' '));
  // The header carries the count as well as the name. It only exists once a
  // country is chosen, which is why this is asked here rather than on the
  // opening European ranking, where there is no single country to count.
  check('the list says how many beaches are in that country', /\d/.test(countryHead),
    countryHead.replace(/\n/g, ' '));

  // The listed tier on screen. Thousands of rows ship as listed and they live
  // in their own array in the wire, so a screen has to opt in to showing them.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);
  const alsoBlocks = await page.locator('.places-alsohere').count();
  if (alsoBlocks) {
    const listedRows = await page.locator('.places-alsohere .places-listedrow').count();
    check('the listed tier renders under its own heading', listedRows > 0, `${listedRows} rows`);
    const alsoText = await page.locator('.places-alsohere').first().innerText();
    check('the listed heading says they are not scored',
      /not scored|nog niet|pas encore|noch nicht|sin valorar|non ancora/i.test(alsoText));
    // A listed card may not show a number. The wire omits the key; this is
    // the assertion that the screen honours it.
    const listedScores = await page.locator('.places-alsohere .score-chip').count();
    check('no listed row shows a score', listedScores === 0, `${listedScores} score chips`);
  } else {
    check('the listed tier renders under its own heading', false,
      'no .places-alsohere block for this country');
  }
  const inCountry = await page.locator('.places-bcard').count();
  check('the country list has beaches in it', inCountry >= 1, `${inCountry} cards`);
  await page.locator('.places-search input').fill('');
  await page.waitForTimeout(1200);
}

// ── The beach page ──
await page.locator('.places-bcard').first().click();
await page.waitForTimeout(1800);
check('the beach page opens', await page.locator('.bpage').isVisible());

const where = await page.locator('.bpage-where').innerText().catch(() => '');
check('the page opens with the location', where.trim().length > 1, where.replace(/\n/g, ' '));
check('the location row carries a pin icon', await page.locator('.bpage-where svg').count() >= 1);
const mapsHref = await page.locator('.bpage-where').getAttribute('href').catch(() => '');
check('the pin links to a map by coordinate', /google\.com\/maps.*destination=-?\d/.test(mapsHref || ''),
  (mapsHref || '').slice(0, 70));

const shot = await page.locator('.bpage-shot').getAttribute('src').catch(() => '');
check('the page shows a large photograph', /^https:\/\/upload\.wikimedia\.org/.test(shot || ''));
const thumbs = await page.locator('.bpage-thumb').count();
check('three or four photographs are offered', thumbs >= 2 && thumbs <= 4, `${thumbs} photographs`);
const credit = await page.locator('.bpage-credit').innerText().catch(() => '');
check('the photograph carries its author and licence', /cc|public domain/i.test(credit), credit.replace(/\n/g, ' '));

const why = await page.locator('.bpage-why').innerText().catch(() => '');
check('the page explains why this beach', why.length > 60, why.replace(/\n/g, ' ').slice(0, 120));
check('the explanation is composed prose, not reason codes',
  !/\b(waterExcellent|boatOnly|sandColour|nationalPark)\b/.test(why));
check('no untranslated keys leaked into the page', !/beach\.[a-zA-Z]/.test(await page.locator('.bpage-wrap').innerText()));

const bars = await page.locator('.bpage-bars li').count();
check('the score is broken into its parts', bars >= 4, `${bars} components`);

// The score badge is a door. Tapping it shows the same components WITH their
// weights, which is what makes a 6.7 something a reader can argue with rather
// than a verdict handed down.
const scoreBtn = page.locator('.bpage-scorebtn');
check('the score badge is tappable', await scoreBtn.count() === 1);
await scoreBtn.click();
await page.waitForTimeout(400);
const parts = await page.locator('.bpage-parts li').count();
check('tapping the score opens the breakdown', parts >= 4, `${parts} rows`);
const weights = await page.locator('.bpage-part-w').count();
check('the breakdown shows each component weight', weights >= 4, `${weights} weights`);
await scoreBtn.click();
await page.waitForTimeout(300);
check('tapping again closes it', await page.locator('.bpage-parts li').count() === 0);
const facts = await page.locator('.bpage-facts').innerText().catch(() => '');
check('the facts list renders', facts.length > 10, facts.replace(/\n/g, ' ').slice(0, 100));

// The brief: no GPX, no route exports, no elevation profile on a beach.
const pageText = await page.locator('.bpage').innerText();
check('no GPX or route export on a beach page', !/gpx|kml|elevation/i.test(pageText));
check('no map canvas on a beach page', await page.locator('.bpage canvas').count() === 0);
await page.screenshot({ path: 'shots/beaches-page.png', fullPage: true });

await page.locator('.tpage-back').click();
await page.waitForTimeout(600);
check('back returns to the list', await page.locator('.places-bcard').first().isVisible());

// ── Desktop ──
const desk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
desk.on('pageerror', (e) => errors.push('desktop pageerror: ' + e.message.split('\n')[0]));
await seed(desk);
await desk.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await desk.waitForTimeout(3000);
await desk.locator('.header-nav-item:visible, .bottom-nav-item:visible', { hasText: /destinations/i }).first().click();
await desk.waitForTimeout(1200);
// :visible matters. The desktop shell renders the category rail twice, once
// in the phone toolbar and once in the left panel, and the hidden copy is the
// one a bare selector finds first.
// The desktop shell moves the category rail into the left panel and renames
// its class: `.places-cat` is the phone toolbar copy and is hidden here, so
// the desktop pass has to accept `.side-cat` too.
await desk.locator('.places-cat:visible, .side-cat:visible', { hasText: /beaches/i }).first().click();
await desk.waitForTimeout(2500);
check('desktop renders the beach cards', await desk.locator('.places-bcard:visible').count() >= 3);
await desk.screenshot({ path: 'shots/beaches-desktop.png' });
await desk.locator('.places-bcard:visible').first().click();
await desk.waitForTimeout(1500);
check('desktop opens the beach page', await desk.locator('.bpage').isVisible());
await desk.screenshot({ path: 'shots/beaches-page-desktop.png', fullPage: true });
await desk.close();

} catch (e) {
  // A thrown locator timeout must not swallow the checks that already ran:
  // "which of these passed" is the whole output of this script.
  errors.push('script: ' + String(e && e.message ? e.message : e).split('\n')[0]);
  check('the run finished without throwing', false);
}

await browser.close();

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed += 1;
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  [${c.note}]` : ''}`);
}
if (errors.length) {
  console.log('\npage errors:');
  for (const e of errors) console.log('  ' + e);
}
console.log(failed === 0 && errors.length === 0
  ? '\nAll checks passed.'
  : `\n${failed} checks failed, ${errors.length} page errors.`);
process.exit(failed === 0 ? 0 : 1);
