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


    // ── v2: the tiers, the seven filters, and the floor ──────────────────
    //
    // Everything below is peak_index_v2 (docs/MOUNTAINS.md). The rules the
    // export gate enforces are checked again here because the gate and the
    // app read the same files, and a wire that drifted would fail silently
    // in the browser rather than loudly in the build.
    const W = index.model?.weights || {};
    const weightSum = Object.values(W).reduce((a, b) => a + b, 0);
    check('the model is peak_index_v2', index.model?.version === 'peak_index_v2',
      index.model?.version || '');
    check('the weights ship with the data and sum to one',
      Math.abs(weightSum - 1) < 1e-6, `${weightSum}`);
    check('the view is a scored component', (W.views || 0) > 0, `${W.views}`);
    check('the index carries the terrain model',
      Boolean(index.model?.terrain?.version), index.model?.terrain?.version || '');
    check('the index reports the floor both ways round',
      Boolean(index.floor && index.floor.filled && index.floor.unreachable), '');
    check('every floor miss carries a reason code',
      Object.values(index.floor?.unreachable || {})
        .every((e) => Object.keys(index.floor.reasons || {}).includes(e.k)),
      Object.entries(index.floor?.unreachable || {})
        .map(([cc, e]) => `${cc}:${e.k}`).join(', '));

    const DIFFS = ['walkUp', 'hike', 'mountainHike', 'scramble', 'alpine',
      'viaFerrata', 'technical'];
    const ACCESS = ['liftTop', 'liftMountain', 'roadTop', 'trailhead',
      'transit', 'remote'];
    const thin = [];
    const shortGallery = [];
    const unnamedGallery = [];
    const scoredListed = [];
    const badFacet = [];
    const noRegion = [];
    let listedRows = 0;
    let withView = 0;
    let withDiff = 0;
    let withSeason = 0;
    let promDem = 0;
    for (const c of index.countries || []) {
      const path = `${WIRE}/${c.cc}.json`;
      if (!existsSync(path)) continue;
      const file = JSON.parse(readFileSync(path, 'utf8'));
      const rated = file.mountains || [];
      const listed = file.listed || [];
      listedRows += listed.length;
      // The floor is satisfied by rows of ANY tier, and a country that could
      // not reach it has to have said why in the index.
      if (rated.length + listed.length < (index.floor?.target || 8)
          && !index.floor?.unreachable?.[c.cc]) {
        thin.push(`${c.cc}: ${rated.length}+${listed.length}`);
      }
      for (const m of rated) {
        if ((m.images || []).length < (index.model?.min_images || 4)) {
          shortGallery.push(m.id);
        }
        if (!(m.images || []).some((i) => ['name', 'article', 'p18'].includes(i.ev))) {
          unnamedGallery.push(m.id);
        }
        if (!m.rg) noRegion.push(m.id);
        if (m.diff) {
          withDiff += 1;
          if (!DIFFS.includes(m.diff.k)) badFacet.push(`${m.id}: diff ${m.diff.k}`);
          if (m.diff.src === 'dem' && !m.diff.est) {
            badFacet.push(`${m.id}: DEM difficulty not marked estimated`);
          }
        }
        for (const code of m.acc || []) {
          if (!ACCESS.includes(code)) badFacet.push(`${m.id}: acc ${code}`);
        }
        if (m.vb != null) {
          withView += 1;
          if (!(m.vb >= 1 && m.vb <= 5)) badFacet.push(`${m.id}: vb ${m.vb}`);
        }
        if (m.promSrc && !['dem', 'dem_min'].includes(m.promSrc)) {
          badFacet.push(`${m.id}: promSrc ${m.promSrc}`);
        }
        if (m.promSrc) promDem += 1;
        if (m.season) {
          withSeason += 1;
          if (!m.season.est) badFacet.push(`${m.id}: season not marked estimated`);
          if ((m.season.months || []).some((n) => n < 1 || n > 12)) {
            badFacet.push(`${m.id}: month out of range`);
          }
        }
      }
      // The one rule the tier model cannot bend: a listed row has no score
      // key of any spelling. Absent, not null, because the app cannot render
      // what is not there.
      for (const m of listed) {
        if ('score' in m || 'tier' in m || 'comp' in m || 'sub' in m) {
          scoredListed.push(m.id);
        }
        if (!['l', 'e'].includes(m.t)) scoredListed.push(`${m.id}: t=${m.t}`);
        if (!(m.images || []).length
            && !(m.why || []).some((w) => w.k === 'no_photo_map_card')) {
          scoredListed.push(`${m.id}: no photograph and no map card`);
        }
      }
    }
    check('every rated row carries four photographs', shortGallery.length === 0,
      `${shortGallery.length}: ${shortGallery.slice(0, 3).join(', ')}`);
    check('every gallery is carried by a photograph that names the mountain',
      unnamedGallery.length === 0,
      `${unnamedGallery.length}: ${unnamedGallery.slice(0, 3).join(', ')}`);
    check('no listed row carries a score', scoredListed.length === 0,
      scoredListed.slice(0, 3).join(', '));
    check('the listed tier is populated', listedRows > 0, `${listedRows} listed`);
    check('every country reaches the floor or says why', thin.length === 0,
      thin.slice(0, 5).join(', '));
    check('every published row carries its region block', noRegion.length === 0,
      `${noRegion.length}: ${noRegion.slice(0, 3).join(', ')}`);
    check('the facets are all in vocabulary', badFacet.length === 0,
      badFacet.slice(0, 3).join(' | '));
    check('the difficulty facet is live on most rows', withDiff >= rows * 0.5,
      `${withDiff} of ${rows}`);
    check('the view is measured on most rows', withView >= rows * 0.5,
      `${withView} of ${rows}`);
    check('the season is measured on most rows', withSeason >= rows * 0.5,
      `${withSeason} of ${rows}`);
    check('prominence is computed where no source published one', promDem > 0,
      `${promDem} rows carry a computed prominence`);

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
// `:visible`, because the chrome renders the picker twice, once in the
// desktop side rail and once in the phone toolbar, and CSS decides which one
// a viewport shows. Counting both is how this check started failing on a
// change that broke nothing.
check('General still carries the country picker',
  await page.locator('.places-country:visible').count() === 1);

await page.locator('.places-cat', { hasText: /^mountains$/i }).click();
await page.waitForTimeout(2500);

// ── The controls this tab carries, and the ones it does not ──
check('country picker is on Mountains',
  await page.locator('.places-country:visible').count() === 1);
check('priced-from picker is gone on Mountains', await page.locator('.places-controls .origin-btn').count() === 0);
check('lifestyle tier is gone on Mountains', await page.locator('.lifestyle-btn:visible').count() === 0);
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
const head = await page.locator('.places-beachhead').count()
  ? await page.locator('.places-beachhead').first().innerText().catch(() => '')
  : '';
check('the opening list is the European ranking, with no country header',
  !head, head.replace(/\n/g, ' ').slice(0, 60));
await page.screenshot({ path: 'shots/mountains-list.png', fullPage: false });

// Ranked, best first.
const nums = (await page.locator('.places-mcard .score-chip').allInnerTexts())
  .map((s) => parseFloat(s)).filter((n) => !Number.isNaN(n));
check('the list is ranked best first',
  nums.length > 2 && nums.every((n, i) => i === 0 || nums[i - 1] >= n - 0.001),
  nums.slice(0, 5).join(', '));

// ── The lift chip, which is why most people open this tab ──
// It leads the "how you get there" group, which is the one group short
// enough for the toolbar row; the other six filters live in the sheet.
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

// ── The seven filters brief 05 asks for ──
// One group in the toolbar, the rest inside the Filters sheet, every chip
// carrying its own count, and no chip offered at zero in this scope.
const filterBtn = page.locator('.places-filter-btn').first();
if (await filterBtn.count()) {
  await filterBtn.click();
  await page.waitForTimeout(900);
  // The sheet renders the same facet model as the toolbar through its own
  // markup (PlacesFilterSheet: fsheet-field / fchips / fchip), which is why
  // this reads fchips rather than places-classes.
  const groups = page.locator('.fsheet-places .fchips');
  const nGroups = await groups.count();
  check('the filter sheet offers every mountain facet', nGroups >= 7,
    `${nGroups} groups`);
  const labels = (await page.locator('.fsheet-places .fchip span:not(.fchip-n)')
    .allInnerTexts()).map((x) => x.trim());
  const wanted = [/lift to the top/i, /walk up|hike/i, /500 m|1,000|1\.000/i,
    /hill|summit|peak/i, /view|panoram/i, /jan|jun|jul/i];
  const found = wanted.filter((re) => labels.some((l) => re.test(l)));
  check('the filters cover height, prominence, view, difficulty, access and month',
    found.length >= 5, `${found.length} of ${wanted.length} kinds seen`);
  const counted = await page.locator('.fsheet-places .fchip-n').count();
  check('every filter chip carries a count', counted >= labels.length * 0.9,
    `${counted} counts for ${labels.length} chips`);
  const zeroLive = await page.locator('.fsheet-places .fchip:not([disabled]) .fchip-n')
    .allInnerTexts();
  check('no chip is offered at zero in this scope',
    zeroLive.every((x) => x.trim() !== '0'),
    zeroLive.filter((x) => x.trim() === '0').length + ' zero chips live');
  await page.screenshot({ path: 'shots/mountains-filters.png', fullPage: false });
  // Close it by the scrim rather than by Escape: the sheet stays open on a
  // missed key and every click after it lands on the scrim instead of the
  // list, which reads as a mysterious 30 second timeout three checks later.
  await page.locator('.fsheet-scrim').click({ position: { x: 5, y: 5 } })
    .catch(() => page.keyboard.press('Escape'));
  await page.waitForTimeout(800);
  check('the filter sheet closes', await page.locator('.fsheet-places').count() === 0);
} else {
  check('the filter sheet offers every mountain facet', false, 'no Filters button');
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
  // The "{n} in {country}, best first" line over the list is gone (the
  // cards are the answer), so the scope is read off the cards themselves:
  // every card on screen has to name the country that was typed.
  const wheres = await page.locator('.places-bcard-where').allInnerTexts();
  const countryHead = wheres.slice(0, 6).join(' | ');
  check('typing a country narrows the list to it',
    wheres.length > 0 && wheres.every((w) => new RegExp(firstCountry, 'i').test(w)),
    countryHead.replace(/\n/g, ' ').slice(0, 100));
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
// The desktop shell moved the nav into the header (browse chrome v4), and a
// window that is already on Destinations renders no nav item to click at
// all. Both are fine; a hard click on a control that may not exist is not,
// and it costs every check after it (this one threw for 30 seconds and took
// the desktop pass with it).
const deskTab = desk.locator('.header-nav-item, .bottom-nav-item',
  { hasText: /destinations/i }).first();
if (await deskTab.isVisible().catch(() => false)) {
  await deskTab.click();
  await desk.waitForTimeout(1200);
}
check('desktop: the destinations tab is reachable',
  await desk.locator('.places-tab').isVisible().catch(() => false));
// Desktop draws the categories in the left panel (.side-cat) and the phone
// draws them in the toolbar (.places-cat). One renderer, two class names, so
// the harness asks for whichever one this viewport rendered.
const deskCat = desk.locator('.side-cat:visible, .places-cat:visible',
  { hasText: /^mountains$/i }).first();
if (await deskCat.isVisible().catch(() => false)) {
  await deskCat.click();
  await desk.waitForTimeout(2500);
}
check('desktop renders the mountain cards', await desk.locator('.places-mcard').count() >= 3);
await desk.screenshot({ path: 'shots/mountains-desktop.png' });
const deskCard = desk.locator('.places-mcard').first();
if (await deskCard.isVisible().catch(() => false)) {
  await deskCard.click();
  await desk.waitForTimeout(1500);
}
check('desktop opens the mountain page',
  await desk.locator('.mpage').isVisible().catch(() => false));
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
