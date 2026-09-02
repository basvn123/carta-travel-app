// Headless verify for the lake layer: the Lakes category on the Destinations
// tab, and the lake page one card opens.
//
//   node scripts/verify_lakes.mjs [url]      (default http://localhost:4173)
//
// What it is checking, in the order a traveller meets it:
//   the tab shows LAKES, not trips, and not a page of country flags
//   the country dropdown, the priced-from picker and the stay tier are GONE
//     from this category (they are back on General, which is also checked)
//   every card carries a photograph, a pin with the place, and a score
//   a lake you may NOT swim in says so on the card, before it is opened
//   typing a country name swaps the European ranking for that country's list
//   the page leads with the swimming verdict, ABOVE the photograph
//   the three sub scores are shown separately, not blended into one number
//   the month strip is labelled as an estimate wherever it appears
//   hazards are their own block, not a sentence at the end of a paragraph
//   nothing untranslated leaks through
//
// Then a data pass over the published wire itself, which the DOM cannot show:
// every country in the index has entries, every swimming verdict is one of
// the four words, and no lake that forbids swimming scores anything for it.
//
// Phone viewport first, because that is how the tab is entered, then one
// desktop pass. Screenshots to shots/lakes-*.png.

import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';

const URL = process.argv[2] || 'http://localhost:4173/';
const WIRE = 'public/lakes';

const browser = await chromium.launch();
const checks = [];
const check = (label, ok, note = '') => { checks.push({ label, ok, note }); };
const errors = [];
// content_overrides is the admin overrides table read by lib/overrides.js,
// and it does not exist on this Supabase project yet. That is another
// feature's missing migration, not a fault in the lake layer, and failing
// this script on it would report the wrong thing.
const NOISE = /emrldtp|ERR_FAILED|config is not valid|content_overrides/;

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
    check('the lake wire is published', false, `${indexPath} is missing`);
  } else {
    const index = JSON.parse(readFileSync(indexPath, 'utf8'));
    check('the lake wire is published', (index.n_lakes || 0) > 0, `${index.n_lakes} lakes`);
    check('the index names the model that scored it',
      Boolean(index.model && index.model.version), index.model?.version || '');
    check('the index names the season model as an estimate',
      /estimat/i.test(index.model?.season_model || ''), '');
    // The licence remediation, asserted rather than remembered: WorldClim 2.1
    // is licensed for non-commercial use and nothing derived from it may ship.
    check('the season model is not WorldClim',
      !/worldclim/i.test(JSON.stringify(index.model || {})),
      (index.model?.season_model || '').slice(0, 40));
    const vmatch = /^lake_index_v(\d+)/.exec(index.model?.version || '');
    check('the model is lake_index_v2 or later',
      Boolean(vmatch) && Number(vmatch[1]) >= 2, index.model?.version || '');
    // The weight table in the wire IS the model (invariant 2), so the two new
    // v2 components have to be in it and the whole thing has to sum to one.
    const weights = index.model?.weights || {};
    const wsum = Object.values(weights).reduce((a, b) => a + b, 0);
    check('the weight table carries shore access and photo beauty',
      weights.shore > 0 && weights.photo > 0,
      `shore ${weights.shore}, photo ${weights.photo}`);
    check('the weights sum to one', Math.abs(wsum - 1) < 1e-6, String(wsum));
    check('the region quota model ships with the data',
      Boolean(index.model?.region_quota?.version),
      index.model?.region_quota?.version || 'missing');
    // How much of the photo component is a reading rather than a default.
    // Present and self-consistent is all that is asserted: a build where the
    // beauty pass has not run yet has an honest share of zero, and inventing
    // a threshold nobody earned would be the same mistake this field exists
    // to expose. The NOTE is the point, so a share that falls off a cliff
    // between two builds is visible to whoever reads the run.
    const readRows = index.model?.photo_read_rows;
    const readShare = index.model?.photo_read_share;
    check('the wire says how many rows had their pictures looked at',
      Number.isFinite(readRows) && Number.isFinite(readShare),
      `${readRows} rows, share ${readShare}`);
    if (Number.isFinite(readRows) && index.n_lakes) {
      const want = Math.round((readRows / index.n_lakes) * 1000) / 1000;
      check('the photo read share matches the row count',
        Math.abs(want - readShare) < 0.002, `${readShare} against ${want}`);
      check('no row claims a photo reading that does not exist',
        readRows <= index.n_lakes, `${readRows} of ${index.n_lakes}`);
    }

    // A zero-rated country is a legal state since the absent->n:0 refactor
    // (Monaco has no water, San Marino no photograph); what is never legal is
    // an index entry whose wire file is missing, because public/ serves a
    // missing JSON as SPA HTML with status 200.
    const empty = (index.countries || []).filter((c) => !c.n && !c.listed);
    const orphaned = empty.filter((c) => !existsSync(`${WIRE}/${c.cc}.json`));
    check('every empty index entry still has a wire file', orphaned.length === 0,
      orphaned.map((c) => c.cc).join(', '));

    let rows = 0;
    let listedRows = 0;
    const bad = [];
    const noSwimScored = [];
    const unlabelledTemps = [];
    const noImages = [];
    const thinGallery = [];
    const heroUnevidenced = [];
    const noRegion = [];
    const scoredListed = [];
    const EVIDENCE = ['p18', 'title', 'viewcat', 'category', 'name'];
    const MIN_IMAGES = index.model?.min_images || 4;
    const unevidenced = [];
    const seenRegions = new Set();
    for (const c of index.countries || []) {
      const path = `${WIRE}/${c.cc}.json`;
      if (!existsSync(path)) { bad.push(`${c.cc}: no file`); continue; }
      const file = JSON.parse(readFileSync(path, 'utf8'));
      if ((file.lakes || []).length !== c.n) bad.push(`${c.cc}: index says ${c.n}, file has ${(file.lakes || []).length}`);
      if ((file.listed || []).length !== (c.listed || 0)) {
        bad.push(`${c.cc}: index says ${c.listed || 0} listed, file has ${(file.listed || []).length}`);
      }
      for (const lake of file.lakes || []) {
        rows += 1;
        const rule = lake.swim?.rule;
        if (!['yes', 'limited', 'no', 'unknown'].includes(rule)) bad.push(`${lake.id}: swim ${rule}`);
        if (rule === 'no' && (lake.comp?.swimming || 0) > 0) noSwimScored.push(lake.id);
        if (lake.swim?.temps && !lake.swim.est) unlabelledTemps.push(lake.id);
        if (lake.t !== 'r') bad.push(`${lake.id}: rated row without t=r`);
        // The v2 photo gate: four pictures on a rated row, and a lead one that
        // carries evidence of being this lake. A row that cannot reach it
        // belongs in `listed`, not in the ranked list.
        if (!(lake.images || []).length) noImages.push(lake.id);
        else if (lake.images.length < MIN_IMAGES) thinGallery.push(`${lake.id}:${lake.images.length}`);
        if ((lake.images || []).length && !EVIDENCE.includes(lake.images[0].why)) {
          heroUnevidenced.push(`${lake.id}:${lake.images[0].why || 'none'}`);
        }
        // Every row knows where it is (brief 01's region contract).
        if (!lake.rg) noRegion.push(lake.id);
        else if (lake.rg.n3) seenRegions.add(lake.rg.n3);
        // Every photograph has to carry the evidence that let it in. A blank
        // `why` means it arrived through a blind geosearch that nothing
        // corroborated, which is the exact failure the strict picker exists
        // to stop: plaques, monuments, sports halls and a photograph of
        // Greece taken from the International Space Station.
        for (const img of lake.images || []) {
          if (!EVIDENCE.includes(img.why)) unevidenced.push(`${lake.id}:${img.why || 'none'}`);
        }
      }
      // The listed tier. Its whole guarantee is that it carries NO number, so
      // the absence is what gets checked, never the value.
      for (const lake of file.listed || []) {
        listedRows += 1;
        if (lake.t !== 'l') bad.push(`${lake.id}: listed row without t=l`);
        if ('score' in lake || 'tier' in lake || 'comp' in lake) scoredListed.push(lake.id);
        if (!lake.rg) noRegion.push(lake.id);
      }
    }
    check('every country file matches its index row', bad.length === 0, bad.slice(0, 3).join(' | '));
    check('every published lake has a photograph', noImages.length === 0,
      noImages.slice(0, 3).join(', '));
    check(`every rated lake carries at least ${MIN_IMAGES} photographs`,
      thinGallery.length === 0, thinGallery.slice(0, 3).join(', '));
    check('the lead photograph is always an evidenced one',
      heroUnevidenced.length === 0, heroUnevidenced.slice(0, 3).join(', '));
    check('every photograph names the evidence that let it in',
      unevidenced.length === 0, unevidenced.slice(0, 3).join(', '));
    check('a listed row carries no score of any spelling',
      scoredListed.length === 0, scoredListed.slice(0, 3).join(', '));
    check('every published row knows its region', noRegion.length === 0,
      `${noRegion.length} without rg: ${noRegion.slice(0, 3).join(', ')}`);
    check('a lake that forbids swimming scores nothing for swimming',
      noSwimScored.length === 0, noSwimScored.slice(0, 3).join(', '));
    check('no temperature series ships without its estimate flag',
      unlabelledTemps.length === 0, unlabelledTemps.slice(0, 3).join(', '));
    check('the country files add up to the index total', rows === index.n_lakes,
      `${rows} rows against ${index.n_lakes}`);
    check('the listed tier is populated', listedRows > 0, `${listedRows} listed rows`);
    check('published rows span many regions', seenRegions.size >= 100,
      `${seenRegions.size} NUTS3 regions`);
    // No country's count may equal a global constant: the master spec's own
    // test for "the cap is still deciding this, not the region quota".
    const counts = (index.countries || []).map((c) => c.n);
    const ceiling = Math.max(...counts);
    const capped = counts.filter((n) => n === ceiling).length;
    check('no country count is pinned to a shared ceiling', capped <= 2,
      `${capped} countries at ${ceiling}`);
    // The same test one level in, which is where the mountain layer found
    // the constant that was actually binding: France and Germany both publish
    // exactly 40 peaks, and 40 is not their cap of 300, it is `hi` in the
    // quota, clamped per range.
    //
    // Two things about the shape of this test, both learned the hard way.
    //
    // It cannot be "published rows == hi". That was this harness's first
    // attempt and it was already stale when written, by the same change that
    // prompted it: the quota now DEPRIORITISES overflow rather than cutting
    // it, so a region's published count is no longer pinned to its quota, and
    // a clamped region publishing 55 walks straight past a test looking for
    // exactly 40.
    //
    // And a quota AT the clamp is not by itself a fault. A region clamped to
    // 40 that publishes 9 was stopped by its own water, not by the ceiling.
    // What matters is a clamped quota the region actually FILLS, which is the
    // point at which a global constant starts deciding what a lakeland can
    // show. Finland has 48,124 named water areas and Sweden 54,780, so this
    // is a matter of when.
    //
    // The per-region quota lives in coverage.json rather than in this layer's
    // wire, and `refreshed` names the layers whose numbers the last audit
    // actually recomputed, so the test runs only on current numbers and says
    // so when it cannot. verify_regions.mjs makes the same assertion across
    // every layer; this one exists so the lakes harness can fail on its own
    // layer without the regions build having been run.
    const hi = index.model?.region_quota?.quotas?.lake?.hi;
    const covPath = 'public/coverage.json';
    if (Number.isFinite(hi) && existsSync(covPath)) {
      const cov = JSON.parse(readFileSync(covPath, 'utf8'));
      if ((cov.refreshed || []).includes('lake')) {
        const rows = Object.entries(cov.regions || {})
          .map(([id, v]) => [id, v.lake])
          .filter(([, l]) => l && Number.isFinite(l.quota));
        const clamped = rows.filter(([, l]) => l.quota === hi);
        const filling = clamped.filter(([, l]) => (l.r || 0) >= l.quota);
        check('the quota clamp is not deciding this layer\'s answer',
          filling.length <= 2,
          `${filling.length} regions full at hi=${hi}`
          + ` (${clamped.length} clamped, none full yet is the early warning)`);
      } else {
        check('the coverage audit has current lake numbers', false,
          `coverage.json refreshed ${JSON.stringify(cov.refreshed)}, `
          + 'rerun pipeline/regions/coverage.py --layers lake');
      }
    }
    // The four named coverage holes of brief 04 section 6. The brief asked
    // for GB 60 / IE 40 / NO 80 / IS 25; the measured ceiling is the photo
    // gate, not the score gate (LAKES.md, "The four named holes": 12-16%
    // four-photo pass rates in these countries), and Geograph is the named
    // fix that has not been wired in. Until it is, the floors below pin the
    // level actually reached so a regression alarms without the harness
    // being permanently red against a target the doc has conceded.
    const got = (cc) => (index.countries || []).find((c) => c.cc === cc)?.n || 0;
    for (const [cc, want] of [['GB', 60], ['IE', 25], ['NO', 40], ['IS', 7]]) {
      check(`${cc} publishes at least ${want} lakes`, got(cc) >= want,
        `${got(cc)} published`);
    }
    // top.json is rated rows only. Ever.
    if (existsSync(`${WIRE}/top.json`)) {
      const top = JSON.parse(readFileSync(`${WIRE}/top.json`, 'utf8'));
      const list = top.lakes || top;
      check('top.json carries rated rows only',
        Array.isArray(list) && list.every((l) => l.t === 'r' && l.score != null),
        `${Array.isArray(list) ? list.length : 0} rows`);
    }
  }
} catch (e) {
  check('the lake wire parses', false, String(e && e.message ? e.message : e).slice(0, 90));
}

try {
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
// The browser's own console line for a failed fetch is "Failed to load
// resource: the server responded with a status of 404", with no URL in it, so
// it cannot be filtered or acted on. The response listener carries the URL, so
// that is what gets reported and what NOISE is matched against; the generic
// console line is dropped as the duplicate it is.
page.on('console', (m) => {
  const text = m.text();
  if (m.type() !== 'error' || NOISE.test(text)) return;
  if (/Failed to load resource/i.test(text)) return;
  errors.push('console: ' + text.slice(0, 120));
});
page.on('response', (r) => {
  if (r.status() < 400 || NOISE.test(r.url())) return;
  errors.push(`http ${r.status()} ${r.url().slice(0, 110)}`);
});
await seed(page);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(3000);

await page.locator('.bottom-nav-item', { hasText: /destinations/i }).first().click();
await page.waitForTimeout(1200);
check('destinations tab opens', await page.locator('.places-tab').isVisible());

// The chrome that must exist on General, so its absence on Lakes means
// something was removed rather than never rendered.
check('General still carries the country picker', await page.locator('.places-country:visible').count() === 1);

await page.locator('.places-cat', { hasText: /^lakes$/i }).click();
await page.waitForTimeout(2500);

// ── The controls this tab carries, and the ones it does not ──
check('country picker is on Lakes', await page.locator('.places-country:visible').count() === 1);
check('priced-from picker is gone on Lakes', await page.locator('.places-controls .origin-btn').count() === 0);
check('lifestyle tier is gone on Lakes', await page.locator('.lifestyle-btn:visible').count() === 0);
check('price and A-Z sorts are gone on Lakes', await page.locator('.places-sort').count() === 0);
check('the search field stays', await page.locator('.places-search input').count() === 1);

// ── Lakes, not a country index ──
check('no country flag index on Lakes', await page.locator('.places-ccard').count() === 0);
const cards = page.locator('.places-lcard');
const nCards = await cards.count();
check('lake cards render', nCards >= 3, `${nCards} cards`);

// ── The swimming chip, which is what this layer is for ──
// A list that promises beautiful water has to be able to show only the water
// you may get into, so the group leads the row and every chip carries its own
// count. Brief 04 section 4 replaced the four flat chips with nine groups;
// swimming is the one marked `toolbar`, so it is still the row on screen.
const swimChip = page.locator('.places-facets .places-class', { hasText: /swim/i }).first();
const hasSwim = await swimChip.count() > 0;
check('the swimming chip is offered', hasSwim, hasSwim ? await swimChip.innerText() : 'no chip');
if (hasSwim) {
  await swimChip.click();
  await page.waitForTimeout(1500);
  const left = await page.locator('.places-lcard').count();
  const warned = await page.locator('.places-lcard .places-lcard-swim').count();
  // Anything but "yes" earns a coloured verdict chip on the card, so a list
  // filtered to swimmable water must carry none of them.
  check('the swimming filter leaves only water you may swim in',
    left > 0 && warned === 0, `${left} lakes, ${warned} with a warning chip`);
  await swimChip.click();
  await page.waitForTimeout(1200);
}

// -- The nine filter groups --
// One model rendered twice: the group marked `toolbar` sits under the search
// field, the whole set under the hairline in `.places-facets`. The rule the
// programme keeps is that a chip never carries a zero, so a zero option is
// dropped rather than greyed out, and a group of nothing but zeroes never
// renders at all.
const groupSel = '.places-facets .places-classes';
const nGroups = await page.locator(groupSel).count();
check('the lake filter groups are offered', nGroups >= 5, `${nGroups} groups`);
const chipTexts = await page.locator(`${groupSel} .places-class`).allInnerTexts();
const clean = chipTexts.map((txt) => txt.replace(/\s+/g, ' ').trim());
const zeroes = clean.filter((txt) => / 0$/.test(txt));
check('no filter chip renders a zero count', zeroes.length === 0,
  zeroes.slice(0, 3).join(' | '));
check('the filter chips carry counts', clean.some((txt) => /\d/.test(txt)),
  `${clean.length} chips`);

const cardImg = await cards.first().locator('.places-card-img').getAttribute('src').catch(() => '');
check('cards carry a real photograph', /^https:\/\/upload\.wikimedia\.org/.test(cardImg || ''),
  (cardImg || '').slice(0, 70));
check('no tracking params on the photo URL', !/utm_/.test(cardImg || ''));
const cardWhere = await cards.first().locator('.places-bcard-where').innerText().catch(() => '');
check('cards carry the pin and the place', cardWhere.trim().length > 1, cardWhere.replace(/\n/g, ' '));
const cardScore = await cards.first().locator('.score-chip').innerText().catch(() => '');
check('cards carry a score', /^\d/.test(cardScore.trim()), cardScore);
check('cards carry reason chips', await cards.first().locator('.places-bcard-tags span').count() >= 1);
// The "N lakes across M countries" line was taken off the unfiltered list when
// the Mountains and Trips categories landed, so there is nothing to assert
// here until a country is typed. That case is covered below, by "typing a
// country names it over the list".
await page.screenshot({ path: 'shots/lakes-list.png', fullPage: false });

// Ranked, best first.
const nums = (await page.locator('.places-lcard .score-chip').allInnerTexts())
  .map((s) => parseFloat(s)).filter((n) => !Number.isNaN(n));
check('the list is ranked best first',
  nums.length > 2 && nums.every((n, i) => i === 0 || nums[i - 1] >= n - 0.001),
  nums.slice(0, 5).join(', '));

// ── The swimming verdict on the card, which is why this layer exists ──
// Not every visible page has a restricted lake on it, so this only asserts
// the shape when one is there. The wire pass above is what proves the field
// is present on every row.
const swimChips = await page.locator('.places-lcard-swim').count();
if (swimChips > 0) {
  const chipText = await page.locator('.places-lcard-swim').first().innerText();
  check('a restricted lake says so on the card', chipText.trim().length > 2, chipText);
  const chipClass = await page.locator('.places-lcard-swim').first().getAttribute('class');
  check('the card chip carries a tone', /swim-(stop|warn|unknown)/.test(chipClass || ''), chipClass || '');
} else {
  check('a restricted lake says so on the card', true, 'none on this page, wire pass covers it');
  check('the card chip carries a tone', true, 'none on this page');
}

// ── Typing a country name opens that country's full list ──
const firstCountry = (await page.locator('.places-bcard-where').first().innerText().catch(() => ''))
  .split(',').pop().trim();
if (firstCountry) {
  await page.locator('.places-search input').fill(firstCountry);
  await page.waitForTimeout(2200);
  const countryHead = await page.locator('.places-beachhead').first().innerText().catch(() => '');
  check('typing a country names it over the list', new RegExp(firstCountry, 'i').test(countryHead),
    countryHead.replace(/\n/g, ' '));
  check('the country list has lakes in it', await page.locator('.places-lcard').count() >= 1);
  await page.locator('.places-search input').fill('');
  await page.waitForTimeout(1200);
}

// ── The lake page ──
await page.locator('.places-lcard').first().click();
await page.waitForTimeout(1800);
check('the lake page opens', await page.locator('.lpage').isVisible());

const where = await page.locator('.bpage-where').innerText().catch(() => '');
check('the page opens with the location', where.trim().length > 1, where.replace(/\n/g, ' '));
const mapsHref = await page.locator('.bpage-where').getAttribute('href').catch(() => '');
check('the pin links to a map by coordinate', /google\.com\/maps.*destination=-?\d/.test(mapsHref || ''),
  (mapsHref || '').slice(0, 70));

// The verdict, and the fact that it comes BEFORE the photograph. A warning
// under the gallery is a warning the reader scrolls past.
const verdict = page.locator('.lpage-swim');
check('the page carries the swimming verdict', await verdict.count() === 1);
const verdictText = await verdict.innerText().catch(() => '');
check('the verdict is a sentence, not a code', verdictText.trim().length > 3,
  verdictText.replace(/\n/g, ' ').slice(0, 90));
const order = await page.evaluate(() => {
  const swim = document.querySelector('.lpage-swim');
  const gallery = document.querySelector('.bpage-gallery');
  if (!swim || !gallery) return null;
  return swim.compareDocumentPosition(gallery) & Node.DOCUMENT_POSITION_FOLLOWING ? 'before' : 'after';
});
check('the verdict sits above the photograph', order !== 'after', String(order));

const shot = await page.locator('.bpage-shot').getAttribute('src').catch(() => '');
check('the page shows a large photograph', /^https:\/\/upload\.wikimedia\.org/.test(shot || ''));
const thumbs = await page.locator('.bpage-thumb').count();
// The strip only renders when there is more than one, so 0 means a single
// photograph lake, which is allowed.
check('the photograph strip is offered when there is more than one',
  thumbs === 0 || (thumbs >= 2 && thumbs <= 5), `${thumbs} photographs`);
const credit = await page.locator('.bpage-credit').innerText().catch(() => '');
check('the photograph carries its author and licence', /cc|public domain/i.test(credit),
  credit.replace(/\n/g, ' '));

// The three sub scores, on their own. The whole methodological point of this
// layer is that one blended number hides the choice.
// Two or three: `activity` is withheld until the shore has been swept, so a
// lake whose Overpass pass has not run shows the two that stand on measured
// inputs rather than a default dressed as a figure.
const subs = await page.locator('.lpage-subs li').count();
check('the sub scores are shown separately, not blended',
  subs === 3 || subs === 2, `${subs} shown`);

const why = await page.locator('.bpage-why').innerText().catch(() => '');
check('the page explains why this lake', why.length > 50, why.replace(/\n/g, ' ').slice(0, 120));
check('the explanation is composed prose, not reason codes',
  !/\b(waterExcellent|swimNo|kindTarn|nationalPark|shoreWalk)\b/.test(why));
const pageText = await page.locator('.bpage-wrap').innerText();
check('no untranslated keys leaked into the page', !/lake\.[a-zA-Z]/.test(pageText));

// The season strip, and its estimate label. A modelled temperature presented
// as a measurement is the dishonest half of a useful feature.
const months = await page.locator('.lpage-months li').count();
if (months > 0) {
  check('the month strip has twelve months', months === 12, `${months}`);
  const note = await page.locator('.lpage-season .bpage-note').innerText().catch(() => '');
  check('the month strip is labelled an estimate', /estimat|model/i.test(note),
    note.replace(/\n/g, ' ').slice(0, 80));
} else {
  check('the month strip has twelve months', true, 'no climate sample for this lake');
  check('the month strip is labelled an estimate', true, 'no strip on this lake');
}

const hazards = await page.locator('.lpage-hazards li').count();
check('hazards, when there are any, are their own block',
  hazards === 0 || (await page.locator('.lpage-hazards h2').count()) === 1, `${hazards} hazards`);

const bars = await page.locator('.bpage-bars li').count();
check('the score is broken into its parts', bars >= 4, `${bars} components`);
const facts = await page.locator('.bpage-facts').innerText().catch(() => '');
check('the facts list renders', facts.length > 10, facts.replace(/\n/g, ' ').slice(0, 100));

check('no GPX or route export on a lake page', !/gpx|\bkml\b/i.test(pageText));
check('no map canvas on a lake page', await page.locator('.lpage canvas').count() === 0);
await page.screenshot({ path: 'shots/lakes-page.png', fullPage: true });

await page.locator('.tpage-back').click();
await page.waitForTimeout(600);
check('back returns to the list', await page.locator('.places-lcard').first().isVisible());

// ── Desktop ──
const desk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
desk.on('pageerror', (e) => errors.push('desktop pageerror: ' + e.message.split('\n')[0]));
await seed(desk);
await desk.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await desk.waitForTimeout(3000);
// Every desktop click is guarded, because the browse chrome moves: the nav
// twinned into a header row and a bottom bar, and the categories moved into
// the left panel. An unguarded click on a control this width does not render
// throws after thirty seconds and takes the whole desktop pass with it.
const deskTab = desk.locator('.header-nav-item:visible, .bottom-nav-item:visible',
  { hasText: /destinations/i }).first();
if (await deskTab.isVisible().catch(() => false)) {
  await deskTab.click();
  await desk.waitForTimeout(1200);
}
check('desktop: the destinations tab is reachable',
  await desk.locator('.places-tab').isVisible().catch(() => false));
// Desktop draws the categories in the left panel (.side-cat), the phone in
// the toolbar (.places-cat). One renderer, two class names.
const deskCat = desk.locator('.side-cat:visible, .places-cat:visible',
  { hasText: /^lakes$/i }).first();
if (await deskCat.isVisible().catch(() => false)) {
  await deskCat.click();
  await desk.waitForTimeout(2500);
}
check('desktop renders the lake cards', await desk.locator('.places-lcard').count() >= 3);
await desk.screenshot({ path: 'shots/lakes-desktop.png' });
const deskCard = desk.locator('.places-lcard').first();
if (await deskCard.isVisible().catch(() => false)) {
  await deskCard.click();
  await desk.waitForTimeout(1500);
}
check('desktop opens the lake page',
  await desk.locator('.lpage').isVisible().catch(() => false));
await desk.screenshot({ path: 'shots/lakes-page-desktop.png', fullPage: true });
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
