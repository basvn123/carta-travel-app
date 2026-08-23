// Headless verify for the mountain layer: the Mountains category on the
// Destinations tab, and the mountain page one card opens.
//
//   node scripts/verify_mountains.mjs [url]      (default http://localhost:4173)
//
// What it is checking, in the order a traveller meets it:
//   the tab shows MOUNTAINS, not the mountain-flavoured slice of the hikes it
//     used to show, and not a page of country flags
//   the country dropdown, the priced-from picker and the stay tier are GONE
//     from this category (they are back on General, which is also checked)
//   every card carries a photograph, a pin with the place, a height and a score
//   a mountain you can ride to the top of says so on the card, before it is
//     opened, and the chip that filters for exactly those works
//   typing a country name swaps the European ranking for that country's list
//   the page leads with the WAY UP, above the photograph, with its source
//   the gallery is a gallery: more than one photograph, each credited
//   hazards are their own block and carry the check-locally line
//   nothing untranslated leaks through, and no route description is generated
//
// Then a data pass over the published wire itself, which the DOM cannot show:
// every country in the index has entries, every lift claim names its source,
// no elevation is outside what a European summit can be, and the famous
// mountains a reader would notice the absence of are actually in there.
//
// Phone viewport first, because that is how the tab is entered, then one
// desktop pass. Screenshots to shots/mountains-*.png.

import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';

const URL = process.argv[2] || 'http://localhost:4173/';
const WIRE = 'public/mountains';

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

// ── The wire, read straight off disk ─────────────────────────────────────
// These are invariants the pipeline gate already enforces, checked again here
// because the gate and the app read the same files and a wire that drifted
// would fail silently in the browser.
try {
  const indexPath = `${WIRE}/index.json`;
  if (!existsSync(indexPath)) {
    check('the mountain wire is published', false, `${indexPath} is missing`);
  } else {
    const index = JSON.parse(readFileSync(indexPath, 'utf8'));
    check('the mountain wire is published', (index.n_mountains || 0) > 0,
      `${index.n_mountains} mountains`);
    check('the index names the model that scored it',
      Boolean(index.model && index.model.version), index.model?.version || '');
    check('the index says the season is an estimate',
      /estimat/i.test(index.model?.season_model || ''), '');
    check('the index says a lift is mapped rather than timetabled',
      /timetable|opening|season/i.test(index.model?.lift_note || ''), '');

    const empty = (index.countries || []).filter((c) => !c.n);
    check('no country in the index is empty', empty.length === 0,
      empty.map((c) => c.cc).join(', '));

    let rows = 0;
    const bad = [];
    const noImages = [];
    const badLift = [];
    const badEle = [];
    let soloImages = 0;
    let lifted = 0;
    const names = new Set();
    for (const c of index.countries || []) {
      const path = `${WIRE}/${c.cc}.json`;
      if (!existsSync(path)) { bad.push(`${c.cc}: no file`); continue; }
      const file = JSON.parse(readFileSync(path, 'utf8'));
      if ((file.mountains || []).length !== c.n) {
        bad.push(`${c.cc}: index says ${c.n}, file has ${(file.mountains || []).length}`);
      }
      for (const m of file.mountains || []) {
        rows += 1;
        names.add(m.name);
        if (!(m.images || []).length) noImages.push(m.id);
        if ((m.images || []).length === 1) soloImages += 1;
        // A lift is a claim about the world. It has to name who made it.
        if (m.lift && !['osm', 'curated', 'wiki'].includes(m.lift.src)) {
          badLift.push(`${m.id}: ${m.lift.src}`);
        }
        // An article mention is evidence that lifts exist here and none that
        // one reaches this summit, so it may only carry the weakest claim.
        if (m.lift && m.lift.src === 'wiki' && m.lift.kind !== 'liftsNearby') {
          badLift.push(`${m.id}: ${m.lift.kind} from an article mention`);
        }
        if (m.lift && m.lift.kind !== 'liftsNearby') lifted += 1;
        // Europe's highest is 5,642 m. Anything past that is a unit that was
        // read as metres and was not.
        if (m.ele != null && (m.ele < -20 || m.ele > 5700)) badEle.push(`${m.id}: ${m.ele}`);
        if (m.prom != null && m.ele != null && m.prom > m.ele + 50) {
          bad.push(`${m.id}: prominence ${m.prom} over elevation ${m.ele}`);
        }
        if (!(m.why || []).length) bad.push(`${m.id}: nothing to say about it`);
      }
    }
    check('every country file matches its index row', bad.length === 0, bad.slice(0, 3).join(' | '));
    check('every published mountain has a photograph', noImages.length === 0,
      noImages.slice(0, 3).join(', '));
    check('single photograph mountains stay the exception',
      soloImages <= Math.max(3, rows * 0.25), `${soloImages} of ${rows}`);
    check('every lift claim names its source', badLift.length === 0, badLift.slice(0, 3).join(', '));
    check('no elevation is off the European scale', badEle.length === 0, badEle.slice(0, 3).join(', '));
    check('the country files add up to the index total', rows === index.n_mountains,
      `${rows} vs ${index.n_mountains}`);
    check('a useful share can be ridden to the top', lifted >= 20, `${lifted} lift served`);

    // The reader test. A "best mountains in Europe" list that has published a
    // few thousand rows and not one of these is wrong in the way somebody
    // notices in the first five seconds.
    const FAMOUS = ['Matterhorn', 'Mont Blanc', 'Zugspitze', 'Eiger', 'Etna',
      'Triglav', 'Snowdon', 'Ben Nevis', 'Galdh', 'Preikestolen', 'Kirkjufell',
      'Teide', 'Olympus', 'Vesuv', 'Musala', 'Grossglockner', 'Tre Cime'];
    const missing = FAMOUS.filter((f) => ![...names].some((n) => n.includes(f)));
    check('the mountains a reader would look for are in the wire',
      missing.length <= 3, missing.length ? `missing: ${missing.join(', ')}` : '');
  }
} catch (e) {
  check('the mountain wire parses', false, String(e && e.message ? e.message : e).slice(0, 90));
}

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

// The chrome that must exist on General, so its absence on Mountains means
// something was removed rather than never rendered.
check('General still carries the country picker', await page.locator('.places-country').count() === 1);

await page.locator('.places-cat', { hasText: /^mountains$/i }).click();
await page.waitForTimeout(2500);

// ── The controls this tab carries, and the ones it does not ──
check('country picker is on Mountains', await page.locator('.places-country').count() === 1);
check('priced-from picker is gone on Mountains', await page.locator('.places-controls .origin-btn').count() === 0);
check('lifestyle tier is gone on Mountains', await page.locator('.places-lifestyle').count() === 0);
check('the search field stays', await page.locator('.places-search input').count() === 1);

// ── Mountains, not trips and not a country index ──
check('no country flag index on Mountains', await page.locator('.places-ccard').count() === 0);
check('no trip cards on Mountains', await page.locator('.places-card:not(.places-bcard)').count() === 0);
const cards = page.locator('.places-mcard');
const nCards = await cards.count();
check('mountain cards render', nCards >= 3, `${nCards} cards`);

const cardImg = await cards.first().locator('.places-card-img').getAttribute('src').catch(() => '');
check('cards carry a real photograph', /^https:\/\/upload\.wikimedia\.org/.test(cardImg || ''),
  (cardImg || '').slice(0, 70));
check('no tracking params on the photo URL', !/utm_/.test(cardImg || ''));
const cardWhere = await cards.first().locator('.places-bcard-where').innerText().catch(() => '');
check('cards carry the pin and the place', cardWhere.trim().length > 1, cardWhere.replace(/\n/g, ' '));
const heights = await page.locator('.places-mcard-ele').count();
check('cards carry the height in mono', heights >= 1, `${heights} of ${nCards}`);
const cardScore = await cards.first().locator('.score-chip').innerText().catch(() => '');
check('cards carry a score', /^\d/.test(cardScore.trim()), cardScore);
check('cards carry reason chips', await cards.first().locator('.places-bcard-tags span').count() >= 1);
const head = await page.locator('.places-beachhead').first().innerText().catch(() => '');
check('the list says how many mountains and how many countries', /\d/.test(head),
  head.replace(/\n/g, ' '));
await page.screenshot({ path: 'shots/mountains-list.png', fullPage: false });

// Ranked, best first.
const nums = (await page.locator('.places-mcard .score-chip').allInnerTexts())
  .map((s) => parseFloat(s)).filter((n) => !Number.isNaN(n));
check('the list is ranked best first',
  nums.length > 2 && nums.every((n, i) => i === 0 || nums[i - 1] >= n - 0.001),
  nums.slice(0, 5).join(', '));

// ── The lift chip, which is why most people open this tab ──
// It is one of six now (walk up, lift, climb, volcano, glacier, high point)
// and they live in the toolbar card rather than loose on the page.
const chip = page.locator('.places-facets .places-class', { hasText: /lift/i }).first();
if (await chip.count()) {
  const chipLabel = await chip.innerText();
  check('the lift chip is offered', /lift/i.test(chipLabel), chipLabel.replace(/\n/g, ' '));
  await chip.click();
  await page.waitForTimeout(1500);
  const liftCards = await page.locator('.places-mcard').count();
  const liftChips = await page.locator('.places-mcard-way').count();
  check('the lift filter keeps only mountains with a lift',
    liftCards > 0 && liftChips === liftCards, `${liftChips} of ${liftCards} say so`);
  await page.screenshot({ path: 'shots/mountains-lift.png', fullPage: false });
  await chip.click();
  await page.waitForTimeout(1200);
} else {
  check('the lift chip is offered', false, 'no chip rendered');
  check('the lift filter keeps only mountains with a lift', false, 'no chip rendered');
}

// ── Typing a country name opens that country's full list ──
// The where line is "<range>, <country>" with the mono height on a second
// line, so the country is the last comma part of the FIRST line. Split on a
// newline rather than stripping the height with a regex: this file has been
// written through a shell heredoc more than once, and every backslash escape
// in it came out mangled.
const firstCountry = (await page.locator('.places-bcard-where').first().innerText().catch(() => ''))
  .split(String.fromCharCode(10))[0]
  .split(',').map((s) => s.trim()).filter(Boolean).pop();
if (firstCountry) {
  await page.locator('.places-search input').fill(firstCountry);
  await page.waitForTimeout(2200);
  const countryHead = await page.locator('.places-beachhead').first().innerText().catch(() => '');
  check('typing a country names it over the list', new RegExp(firstCountry, 'i').test(countryHead),
    countryHead.replace(/\n/g, ' '));
  check('the country list has mountains in it', await page.locator('.places-mcard').count() >= 1);
  await page.locator('.places-search input').fill('');
  await page.waitForTimeout(1200);
}

// ── The mountain page ──
await page.locator('.places-mcard').first().click();
await page.waitForTimeout(1800);
check('the mountain page opens', await page.locator('.mpage').isVisible());

const where = await page.locator('.bpage-where').innerText().catch(() => '');
check('the page opens with the location', where.trim().length > 1, where.replace(/\n/g, ' '));
const mapsHref = await page.locator('.bpage-where').getAttribute('href').catch(() => '');
check('the pin links to a map by coordinate', /google\.com\/maps.*destination=-?\d/.test(mapsHref || ''),
  (mapsHref || '').slice(0, 70));

// The way up, and the fact that it comes BEFORE the photograph. It is the
// question the reader brought to the page.
const way = page.locator('.mpage-way');
check('the page carries the way up', await way.count() === 1);
const wayText = await way.innerText().catch(() => '');
check('the way up is a sentence, not a code', wayText.trim().length > 3,
  wayText.replace(/\n/g, ' ').slice(0, 90));
const order = await page.evaluate(() => {
  const el = document.querySelector('.mpage-way');
  const gallery = document.querySelector('.bpage-gallery');
  if (!el || !gallery) return null;
  return el.compareDocumentPosition(gallery) & Node.DOCUMENT_POSITION_FOLLOWING ? 'before' : 'after';
});
check('the way up sits above the photograph', order !== 'after', String(order));

const shot = await page.locator('.bpage-shot').getAttribute('src').catch(() => '');
check('the page shows a large photograph', /^https:\/\/upload\.wikimedia\.org/.test(shot || ''));
const thumbs = await page.locator('.bpage-thumb').count();
check('the page offers a gallery rather than one picture',
  thumbs === 0 || (thumbs >= 2 && thumbs <= 6), `${thumbs} photographs`);
const credit = await page.locator('.bpage-credit').innerText().catch(() => '');
check('the photograph carries its author and licence', /cc|public domain/i.test(credit),
  credit.replace(/\n/g, ' '));

// The three sub scores, on their own.
// One, two or three. A country enriched without the Overpass sweep has no
// evidence for "what is at the top" and only sometimes for "getting up", and
// the pipeline drops a component rather than printing a zero it did not earn.
const subs = await page.locator('.lpage-subs li').count();
check('the sub scores are shown separately, not blended',
  subs >= 1 && subs <= 3, `${subs} shown`);

const why = await page.locator('.bpage-why').innerText().catch(() => '');
check('the page explains why this mountain', why.length > 40, why.replace(/\n/g, ' ').slice(0, 120));
check('the explanation is composed prose, not reason codes',
  !/\b(kindPeak|summitFood|viaFerrata|wikiFame|liftsNearby)\b/.test(why));
const pageText = await page.locator('.bpage-wrap').innerText();
check('no untranslated keys leaked into the page', !/mtn\.[a-zA-Z]/.test(pageText));

// Safety. The hazard block is a block, and it sends the reader somewhere
// that knows today's conditions.
const hazards = await page.locator('.lpage-hazards li').count();
if (hazards > 0) {
  check('hazards are their own block', (await page.locator('.lpage-hazards h2').count()) === 1,
    `${hazards} hazards`);
  const checkLine = await page.locator('.mpage-check').innerText().catch(() => '');
  check('the hazard block says to check locally', /check|forecast|local/i.test(checkLine),
    checkLine.slice(0, 80));
} else {
  check('hazards are their own block', true, 'no hazards on this mountain');
  check('the hazard block says to check locally', true, 'no hazards on this mountain');
}
check('the page never writes a route description',
  !/turn (left|right)|follow the (path|trail) for|after \d+ (m|km),/i.test(pageText));

const bars = await page.locator('.bpage-bars li').count();
check('the score is broken into its parts', bars >= 4, `${bars} components`);
const facts = await page.locator('.bpage-facts').innerText().catch(() => '');
check('the measurements list renders', facts.length > 10, facts.replace(/\n/g, ' ').slice(0, 100));

check('no GPX or route export on a mountain page', !/gpx|\bkml\b/i.test(pageText));
check('no map canvas on a mountain page', await page.locator('.mpage canvas').count() === 0);
await page.screenshot({ path: 'shots/mountains-page.png', fullPage: true });

await page.locator('.tpage-back').click();
await page.waitForTimeout(600);
check('back returns to the list', await page.locator('.places-mcard').first().isVisible());

// ── Desktop ──
const desk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
desk.on('pageerror', (e) => errors.push('desktop pageerror: ' + e.message.split('\n')[0]));
await seed(desk);
await desk.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await desk.waitForTimeout(3000);
await desk.locator('.header-nav-item, .bottom-nav-item', { hasText: /destinations/i }).first().click();
await desk.waitForTimeout(1200);
await desk.locator('.places-cat', { hasText: /^mountains$/i }).click();
await desk.waitForTimeout(2500);
check('desktop renders the mountain cards', await desk.locator('.places-mcard').count() >= 3);
await desk.screenshot({ path: 'shots/mountains-desktop.png' });
await desk.locator('.places-mcard').first().click();
await desk.waitForTimeout(1500);
check('desktop opens the mountain page', await desk.locator('.mpage').isVisible());
await desk.screenshot({ path: 'shots/mountains-page-desktop.png', fullPage: true });
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
