// Headless verify for the natural-features layer: beaches and mountains.
//
//   node scripts/verify_features.mjs            (run from inside continent-app/)
//
// Two halves, on purpose.
//
// 1. THE WIRE, which exists today. continent-app/public/features/index.json and
//    the per-country files are read straight off disk and checked against each
//    other: counts match, no id is shipped twice, every tier 1 has a witness,
//    every photo carries a licence we can print, every feature names a priced
//    destination inside the wire's own 60 km rule. Then the same files are
//    fetched over a vite preview to prove they are served as JSON: a file that
//    is missing under public/ comes back as the SPA's index.html with status
//    200, so only a content-type check can tell "no data" from data. The trails
//    wire learnt this the hard way and the features exporter writes a file for
//    all 43 priced countries because of it.
//
// 2. THE UI, which does not exist yet. Another session owns the front end; the
//    Destinations tab's Beaches and Mountains categories still filter published
//    TRIPS by theme (DestinationsTab.jsx), they render nothing from
//    /features/. Every assertion that needs that surface therefore prints SKIP
//    with the reason rather than passing on an empty selector, which is the
//    failure mode this file exists to avoid: a check that cannot run must say
//    so. The moment a .places-fcard renders, those checks activate themselves
//    and run for real. Nothing here needs editing for that to happen except
//    SELECTORS below, if the names land differently.
//
// SELECTORS. docs/CATEGORY_UI_PLAN.md does not exist in the repo, so the names
// below are not quoted from it: they follow the tab's own live convention
// (.places-dcard for a destination, .places-tcard for a trip, .places-ccard for
// a country) and are the contract this check asserts. If the plan lands with
// other names, change them here, in one place.
//
// Harness gotchas this file already handles: guest mode and language are seeded
// into localStorage before the first paint, the account gate and the map guide
// are dismissed by TEXT if they still appear, and the Destinations tab is
// entered by matching the bottom-bar item's label, never by index (the bar has
// five slots and the middle one is the plus button).

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, '..');
const WIRE_DIR = resolve(appDir, 'public', 'features');
const APP_DATA = resolve(appDir, 'public', 'app_data.json');
const SHOTS = resolve(scriptDir, 'shots');
mkdirSync(SHOTS, { recursive: true });

const PORT = 4196;
const BASE = process.argv[2] || `http://127.0.0.1:${PORT}`;

const SELECTORS = {
  tab: '.places-tab',
  cat: '.places-cat',              // category tab (General, Trips, Trails, Beaches, Mountains)
  country: '.places-country',      // the country <select>
  fcard: '.places-fcard',          // ONE natural feature (unbuilt)
  fempty: '.places-fempty',        // "no beaches here" state (unbuilt)
  ccard: '.places-ccard',          // country index card
  tcard: '.places-tcard',          // published trip or hike card
  name: '.places-card-name',
  sub: '.places-card-sub',
  img: '.places-card-img',
  noimg: '.places-card-noimg',     // the honest empty state, no photo
  credit: '.places-card-credit',   // per-photo TASL line (unbuilt)
  kindCity: '.places-card-kind.city',
};

// Mirrors rank_features.licence_ok: NC and ND as whole tokens (so "Public
// domain" does not fail on the "nd" inside "domain"), plus the phrases.
const BAD_TOKENS = new Set(['nc', 'nd']);
const BAD_PHRASES = ['noncommercial', 'non commercial', 'noderivatives',
  'no derivatives', 'by permission', 'permission only'];
const licenceOk = (lic) => {
  if (!lic) return false;
  const low = String(lic).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (low.split(' ').some((t) => BAD_TOKENS.has(t))) return false;
  return !BAD_PHRASES.some((p) => low.includes(p));
};

// ── Reporting ─────────────────────────────────────────────────────────────
const results = [];
const pass = (label, note = '') => results.push({ state: 'PASS', label, note });
const fail = (label, note = '') => results.push({ state: 'FAIL', label, note });
const skip = (label, why) => results.push({ state: 'SKIP', label, note: why });
const check = (label, ok, note = '') => (ok ? pass(label, note) : fail(label, note));
const notes = [];

// ══════════════════════════════════════════════════════════════════════════
// 1. THE WIRE, from disk
// ══════════════════════════════════════════════════════════════════════════
const readJson = (path) => JSON.parse(readFileSync(path, 'utf-8'));

let index = null;
let files = new Map();               // ISO2 -> parsed country file
let allFeatures = [];                // every shipped feature, with its country

if (!existsSync(resolve(WIRE_DIR, 'index.json'))) {
  fail('wire: index.json exists', `${WIRE_DIR} has no index.json: run `
    + 'pipeline/features/export_features.py');
} else {
  index = readJson(resolve(WIRE_DIR, 'index.json'));
  const countries = Object.entries(index.countries || {});
  check('wire: index.json parses and lists countries',
    countries.length > 0 && Array.isArray(index.tiers),
    `${countries.length} countries, tiers ${JSON.stringify(index.tiers)}, `
    + `${index.n_features} features, generated ${index.generated_at}`);

  // Every indexed country file is on disk, parses, and knows its own code.
  const missing = [];
  const mislabelled = [];
  for (const [iso2] of countries) {
    const path = resolve(WIRE_DIR, `${iso2}.json`);
    if (!existsSync(path)) { missing.push(iso2); continue; }
    let doc;
    try { doc = readJson(path); } catch (e) { missing.push(`${iso2} (${e.message.slice(0, 40)})`); continue; }
    if (doc.country !== iso2) mislabelled.push(`${iso2} says ${doc.country}`);
    files.set(iso2, doc);
    for (const f of doc.features || []) allFeatures.push({ ...f, iso2 });
  }
  check('wire: every indexed country file is on disk and parses',
    missing.length === 0, missing.length ? missing.join(', ') : `${files.size} files`);
  check('wire: every country file names its own country code',
    mislabelled.length === 0, mislabelled.join(', '));

  // Counts. The index is what the app reads before fetching anything, so a
  // count that lies is a country card that promises beaches it cannot show.
  const countMismatch = [];
  for (const [iso2, row] of countries) {
    const doc = files.get(iso2);
    if (!doc) continue;
    const seen = { beach: 0, mountain: 0 };
    for (const f of doc.features || []) seen[f.kind] = (seen[f.kind] || 0) + 1;
    if (seen.beach !== row.beaches || seen.mountain !== row.mountains) {
      countMismatch.push(`${iso2}: index ${row.beaches}/${row.mountains}, file ${seen.beach}/${seen.mountain}`);
    }
    if ((doc.counts || {}).beach !== seen.beach || (doc.counts || {}).mountain !== seen.mountain) {
      countMismatch.push(`${iso2}: file counts block disagrees with its own features`);
    }
  }
  check('wire: index counts match the country files',
    countMismatch.length === 0, countMismatch.slice(0, 4).join(' | '));

  const summed = countries.reduce((n, [, r]) => n + r.beaches + r.mountains, 0);
  check('wire: index n_features equals what the files ship',
    index.n_features === summed && summed === allFeatures.length,
    `index ${index.n_features}, summed ${summed}, rows ${allFeatures.length}`);

  // Ids. A duplicate id silently overwrites its twin in every keyed consumer,
  // which is why validate_features.py treats it as a hard failure upstream.
  const seenIds = new Map();
  const dupes = [];
  for (const f of allFeatures) {
    if (seenIds.has(f.id)) dupes.push(`${f.id} (${seenIds.get(f.id)} + ${f.iso2})`);
    else seenIds.set(f.id, f.iso2);
  }
  check('wire: no duplicate feature id anywhere', dupes.length === 0,
    dupes.length ? `${dupes.length}: ${dupes.slice(0, 3).join(', ')}` : `${seenIds.size} unique ids`);

  // Shape.
  const shapeBad = [];
  for (const f of allFeatures) {
    const doc = files.get(f.iso2);
    const okKind = f.kind === 'beach' || f.kind === 'mountain';
    const okGeo = Number.isFinite(f.lat) && Number.isFinite(f.lon)
      && Math.abs(f.lat) <= 90 && Math.abs(f.lon) <= 180;
    const okTier = (doc.tiers || []).includes(f.tier);
    const okScore = typeof f.score === 'number' && f.score >= 0 && f.score <= 1;
    const okRank = Number.isInteger(f.rank) && f.rank >= 1;
    const okName = typeof f.name === 'string' && f.name.trim().length > 0;
    if (!(okKind && okGeo && okTier && okScore && okRank && okName)) {
      shapeBad.push(`${f.id} [${[!okKind && 'kind', !okGeo && 'coords', !okTier && 'tier',
        !okScore && 'score', !okRank && 'rank', !okName && 'name'].filter(Boolean).join(',')}]`);
    }
  }
  check('wire: every feature has a kind, a name, real coords, a tier, a rank and a 0..1 score',
    shapeBad.length === 0, shapeBad.slice(0, 3).join(' | '));

  // The 60 km rule: a feature the app cannot hang off a priced city is a row
  // with no journey, and the ranker gates exactly that.
  const orphans = allFeatures.filter((f) => !f.near || !f.near.dest_id
    || !(typeof f.near.km === 'number') || f.near.km > 60);
  check('wire: every feature names a priced destination within 60 km',
    orphans.length === 0,
    orphans.length ? `${orphans.length}, e.g. ${orphans.slice(0, 3).map((f) => f.id).join(', ')}` : '');

  // Corroboration, read off the shipped fields only: an article reference, a
  // formal designation (the inferred natura2000 label is never shipped), an
  // official water class, or a photo whose licence clears the reuse gate.
  const t1 = allFeatures.filter((f) => f.tier === 1);
  const witnessless = t1.filter((f) => !(f.wikipedia
    || (f.designations || []).length
    || f.water
    || ((f.image || {}).licence && licenceOk(f.image.licence))));
  check('wire: every tier 1 feature carries a witness',
    witnessless.length === 0,
    witnessless.length ? `${witnessless.length} of ${t1.length}: ${witnessless.slice(0, 3).map((f) => f.id).join(', ')}`
      : `${t1.length} tier 1 features, all corroborated`);

  // Licensing. A photo we cannot credit is a licensing incident, not a data
  // gap, so this is the one wire check that is about us rather than the app.
  const badImg = [];
  const authorless = [];
  let withImg = 0;
  for (const f of allFeatures) {
    const img = f.image;
    if (!img) continue;
    withImg += 1;
    if (!img.url || !licenceOk(img.licence)) {
      badImg.push(`${f.id} (${img.licence || 'no licence'})`);
    } else if (!img.author && !/public domain|^cc0/i.test(img.licence)) {
      // A credit line reading "CC BY-SA 3.0" with nobody credited is not a
      // credit. Reported, not failed: the gap is in the licence cache
      // upstream, and it is follow-up item 8 in the licence ledger.
      authorless.push(`${f.id} (${img.licence})`);
    }
  }
  check('wire: every shipped photo carries a licence that clears the NC/ND gate',
    badImg.length === 0, badImg.length ? badImg.slice(0, 3).join(', ') : `${withImg} photos`);
  if (authorless.length) {
    notes.push(`${authorless.length} of ${withImg} photos carry an attribution-required `
      + `licence with no author name (ledger follow-up 8): e.g. ${authorless.slice(0, 2).join(', ')}`);
  }

  // The index's top picks have to be the rank 1 of their kind, or a country
  // card leads with a name the list underneath never shows.
  const topWrong = [];
  for (const [iso2, row] of countries) {
    const doc = files.get(iso2);
    if (!doc) continue;
    for (const [kind, key] of [['beach', 'top_beach'], ['mountain', 'top_mountain']]) {
      const rows = (doc.features || []).filter((f) => f.kind === kind);
      if (!rows.length) {
        if (row[key]) topWrong.push(`${iso2} ${key} names ${row[key]} with no ${kind} in the file`);
        continue;
      }
      const best = rows.reduce((a, b) => (a.rank <= b.rank ? a : b));
      if (row[key] !== best.name) topWrong.push(`${iso2} ${key}: index ${row[key]}, file ${best.name}`);
    }
  }
  check('wire: index top picks are the rank 1 of their kind',
    topWrong.length === 0, topWrong.slice(0, 3).join(' | '));

  // Every priced country gets a file, empty or not: see the SPA-fallback note
  // in the header. Checked against the catalogue, not against the index.
  if (existsSync(APP_DATA)) {
    const dests = readJson(APP_DATA).destinations || {};
    const priced = new Set(Object.values(dests).map((d) => d.iso2).filter(Boolean));
    const onDisk = new Set(readdirSync(WIRE_DIR)
      .filter((n) => /^[A-Z]{2}\.json$/.test(n)).map((n) => n.slice(0, 2)));
    const gaps = [...priced].filter((c) => !onDisk.has(c)).sort();
    check('wire: every priced country has a file (the SPA-fallback trap)',
      gaps.length === 0, gaps.length ? `no file for ${gaps.join(', ')}` : `${priced.size} priced countries`);
  } else {
    skip('wire: every priced country has a file (the SPA-fallback trap)',
      'public/app_data.json is absent, so the priced-country set is unknown; run npm run data');
  }
}

// Countries the UI half needs, taken from the wire rather than hardcoded: the
// three richest for the kind checks, and the beach-less ones for the empty
// state. The brief named Hungary, Austria and Czechia as beach-less; only
// Czechia is (Balaton and the Karnten lakes are official EEA bathing sites,
// so HU and AT ship 23 and 17 beaches), which is why this is computed.
const withBoth = index ? Object.entries(index.countries)
  .filter(([, r]) => r.beaches >= 3 && r.mountains >= 3)
  .sort((a, b) => (b[1].beaches + b[1].mountains) - (a[1].beaches + a[1].mountains))
  .slice(0, 3).map(([c]) => c) : [];
const noBeach = index ? Object.entries(index.countries)
  .filter(([, r]) => r.beaches === 0).map(([c]) => c) : [];
if (index) {
  notes.push(`UI countries chosen from the wire: ${withBoth.join(', ')} for the kind checks, `
    + `beach-less: ${noBeach.join(', ') || 'none'}`);
}

// ══════════════════════════════════════════════════════════════════════════
// 2. THE SERVED WIRE + THE UI
// ══════════════════════════════════════════════════════════════════════════
const UI_CHECKS = [
  'ui: the Beaches tab shows only beaches, in 3 countries',
  'ui: the Mountains tab shows only mountains, in 3 countries',
  'ui: no city day appears under Beaches or Mountains',
  'ui: every feature card has a photo or the honest empty state',
  'ui: no card shows a photo belonging to another place',
  'ui: the country index counts match index.json',
  'ui: a country with no beaches offers no Beaches card',
];
const skipAllUi = (why) => UI_CHECKS.forEach((label) => skip(label, why));

const isUp = async () => { try { return (await fetch(BASE)).ok; } catch { return false; } };
let srv = null;
const startServer = async () => {
  if (await isUp()) return;
  // Straight at the local vite binary with the node already running this
  // script, not through npx: the npx shim on this machine resolves node as
  // '"node"', quotes included, and dies with "not recognized as an internal or
  // external command" before vite is ever reached.
  const viteBin = resolve(appDir, 'node_modules', 'vite', 'bin', 'vite.js');
  srv = existsSync(viteBin)
    ? spawn(process.execPath, [viteBin, 'preview', '--port', String(PORT), '--strictPort'],
      { cwd: appDir, stdio: 'ignore' })
    : spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'],
      { cwd: appDir, shell: true, stdio: 'ignore' });
  for (let i = 0; i < 60; i += 1) {
    if (await isUp()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`vite preview never came up on ${PORT} (is dist/ built? npm run build)`);
};

let browser = null;
try {
  await startServer();
} catch (e) {
  const why = `no server: ${e.message}`;
  skip('served: the wire comes back as JSON, not the SPA shell', why);
  skipAllUi(why);
  skip('ui: the Trails tab still shows hikes', why);
  skip('ui: the Trips tab still shows city days', why);
}

if (await isUp()) {
  // ── The served wire: content type, not just status ──
  const served = [];
  for (const path of ['/features/index.json', ...(index ? [`/features/${Object.keys(index.countries)[0]}.json`] : [])]) {
    const res = await fetch(`${BASE}${path}`);
    const type = res.headers.get('content-type') || '';
    if (!type.includes('json')) served.push(`${path} served as ${type || 'no content-type'}`);
  }
  check('served: the wire comes back as JSON, not the SPA shell',
    served.length === 0, served.join(' | '));
  const ghost = await fetch(`${BASE}/features/ZZ.json`);
  notes.push('a country file that does not exist is served as '
    + `${ghost.status} ${ghost.headers.get('content-type')}, which is why the exporter `
    + 'writes a file for every priced country rather than only the ones with features');

  // ── The app ──
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message.split('\n')[0]));
    await page.addInitScript(() => {
      try {
        localStorage.setItem('continent.lang.v1', 'en');
        localStorage.setItem('continent.guestMode.v1', '1');
        localStorage.setItem('continent.mapGuideDismissed.v1', '1');
        localStorage.setItem('carta.mapGuideDone', '1');
      } catch { /* storage unavailable */ }
    });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);
    // The seeds normally cover both, but a renamed key would silently put the
    // gate back in front of everything below, so dismiss by label as well.
    for (const label of [/continue without an account/i, /^got it$/i, /start here/i]) {
      const btn = page.getByRole('button', { name: label }).first();
      if (await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); await page.waitForTimeout(400); }
    }
    // By label, never by index: the bar has five slots and the middle one is
    // the plus button.
    await page.locator('.bottom-nav-item', { hasText: /destinations/i }).first().click();
    await page.waitForTimeout(1500);
    const tabOpen = await page.locator(SELECTORS.tab).isVisible().catch(() => false);
    check('ui: the Destinations tab opens from the bottom bar', tabOpen);

    const openCat = async (re) => {
      const cat = page.locator(SELECTORS.cat, { hasText: re }).first();
      if (!await cat.isVisible().catch(() => false)) return false;
      await cat.click();
      await page.waitForTimeout(1200);
      return true;
    };
    const pickCountry = async (iso2) => {
      await page.locator(SELECTORS.country).selectOption(iso2).catch(() => {});
      await page.waitForTimeout(1200);
    };

    if (!tabOpen) {
      const why = 'the Destinations tab never rendered, so nothing below could be looked at';
      skipAllUi(why);
      skip('ui: the Trails tab still shows hikes', why);
      skip('ui: the Trips tab still shows city days', why);
    } else {
      // ── The two tabs that already work: features must not have eaten them ──
      if (await openCat(/^trips$/i) && index) {
        await pickCountry(withBoth[0] || 'IT');
        const cityChips = await page.locator(SELECTORS.kindCity).count();
        const cards = await page.locator(SELECTORS.tcard).count();
        check('ui: the Trips tab still shows city days', cards > 0 && cityChips > 0,
          `${cards} cards, ${cityChips} city-day chips`);
      } else {
        skip('ui: the Trips tab still shows city days', 'no Trips category on the tab');
      }
      if (await openCat(/trails/i)) {
        await pickCountry(withBoth[0] || 'IT');
        const cards = await page.locator(SELECTORS.tcard).count();
        const cityChips = await page.locator(SELECTORS.kindCity).count();
        check('ui: the Trails tab still shows hikes', cards > 0 && cityChips === 0,
          `${cards} cards, ${cityChips} city-day chips (want 0)`);
      } else {
        skip('ui: the Trails tab still shows hikes', 'no Trails category on the tab');
      }

      // ── The features surface ──
      const beachesTab = await openCat(/beaches/i);
      if (withBoth.length) await pickCountry(withBoth[0]);
      const fcards = beachesTab ? await page.locator(SELECTORS.fcard).count() : 0;
      await page.screenshot({ path: resolve(SHOTS, 'features-beaches.png') });

      if (!beachesTab) {
        skipAllUi('the Destinations tab has no Beaches category');
      } else if (fcards === 0) {
        skipAllUi(`the Beaches tab renders no ${SELECTORS.fcard}: the features UI is not built `
          + 'yet (the category still filters published trips by theme), so these assertions '
          + 'have nothing to read. They run themselves the moment a feature card renders.');
      } else {
        // Live path. It has never executed against a real UI, so treat a
        // surprise here as a finding about this file as much as about the app.
        const cardData = async () => page.locator(SELECTORS.fcard).evaluateAll(
          (els, sel) => els.map((el) => ({
            name: (el.querySelector(sel.name) || {}).textContent?.trim() || '',
            img: (el.querySelector(sel.img) || {}).getAttribute?.('src') || null,
            noimg: !!el.querySelector(sel.noimg),
            credit: (el.querySelector(sel.credit) || {}).textContent?.trim() || '',
          })), SELECTORS,
        );
        const wireNames = (iso2, kind) => new Set((files.get(iso2)?.features || [])
          .filter((f) => f.kind === kind).map((f) => f.name));
        const wireByName = (iso2, name) => (files.get(iso2)?.features || [])
          .find((f) => f.name === name);

        const wrongKind = [];
        const cityDays = [];
        const noPhotoState = [];
        const borrowed = [];
        for (const kind of ['beach', 'mountain']) {
          if (!await openCat(kind === 'beach' ? /beaches/i : /mountains/i)) continue;
          for (const iso2 of withBoth) {
            await pickCountry(iso2);
            const rows = await cardData();
            const mine = wireNames(iso2, kind);
            const theirs = wireNames(iso2, kind === 'beach' ? 'mountain' : 'beach');
            for (const r of rows) {
              if (!mine.has(r.name)) {
                wrongKind.push(`${iso2} ${kind}: "${r.name}" `
                  + (theirs.has(r.name) ? 'is the other kind' : 'is not in the wire at all'));
              }
              if (!r.img && !r.noimg) noPhotoState.push(`${iso2} "${r.name}"`);
              const f = wireByName(iso2, r.name);
              if (r.img && f) {
                const want = [f.image?.url, f.image?.thumb].filter(Boolean);
                if (!want.length) borrowed.push(`${iso2} "${r.name}" shows a photo the wire does not have`);
                else if (!want.includes(r.img)) borrowed.push(`${iso2} "${r.name}" shows ${r.img.slice(0, 60)}`);
                else if (r.credit && f.image?.author && !r.credit.includes(f.image.author)) {
                  borrowed.push(`${iso2} "${r.name}" credits "${r.credit}" not ${f.image.author}`);
                }
              }
            }
            cityDays.push(...(await page.locator(SELECTORS.kindCity).count() ? [`${iso2} ${kind}`] : []));
          }
          const label = kind === 'beach'
            ? 'ui: the Beaches tab shows only beaches, in 3 countries'
            : 'ui: the Mountains tab shows only mountains, in 3 countries';
          const bad = wrongKind.filter((s) => s.includes(` ${kind}:`));
          check(label, bad.length === 0 && withBoth.length >= 3,
            bad.length ? bad.slice(0, 3).join(' | ') : `checked ${withBoth.join(', ')}`);
        }
        check('ui: no city day appears under Beaches or Mountains',
          cityDays.length === 0, cityDays.join(', '));
        check('ui: every feature card has a photo or the honest empty state',
          noPhotoState.length === 0, noPhotoState.slice(0, 3).join(' | '));
        check('ui: no card shows a photo belonging to another place',
          borrowed.length === 0, borrowed.slice(0, 3).join(' | '));

        // Country index: the count the card promises before anything is fetched.
        await openCat(/beaches/i);
        await pickCountry('');
        const idxRows = await page.locator(SELECTORS.ccard).evaluateAll(
          (els, sel) => els.map((el) => ({
            name: (el.querySelector(sel.name) || {}).textContent?.trim() || '',
            sub: (el.querySelector(sel.sub) || {}).textContent?.trim() || '',
          })), SELECTORS,
        );
        if (!idxRows.length) {
          skip('ui: the country index counts match index.json',
            'the Beaches category renders no country index cards to read counts off');
        } else {
          const wrong = [];
          for (const [iso2, row] of Object.entries(index.countries)) {
            const card = idxRows.find((r) => r.name === (files.get(iso2)?.country_name));
            if (!card) continue;
            const n = parseInt((card.sub.match(/\d+/) || [])[0], 10);
            if (Number.isFinite(n) && n !== row.beaches) wrong.push(`${iso2}: card ${n}, wire ${row.beaches}`);
          }
          check('ui: the country index counts match index.json', wrong.length === 0,
            wrong.slice(0, 4).join(' | '));
        }

        // A country with no beaches must not offer the card at all.
        if (!noBeach.length) {
          skip('ui: a country with no beaches offers no Beaches card',
            'every country in the wire ships at least one beach');
        } else {
          const offenders = [];
          for (const iso2 of noBeach.slice(0, 3)) {
            await openCat(/beaches/i);
            await pickCountry(iso2);
            const n = await page.locator(SELECTORS.fcard).count();
            const empty = await page.locator(SELECTORS.fempty).count();
            if (n > 0) offenders.push(`${iso2} shows ${n} beach cards`);
            else if (empty === 0) offenders.push(`${iso2} shows neither cards nor an empty state`);
          }
          check('ui: a country with no beaches offers no Beaches card',
            offenders.length === 0, offenders.join(' | ') || `checked ${noBeach.slice(0, 3).join(', ')}`);
        }
      }
    }
    if (pageErrors.length) notes.push(`page errors: ${pageErrors.slice(0, 3).join(' | ')}`);
    await page.close();
  } catch (e) {
    const why = `the app could not be driven: ${e.message.split('\n')[0]}`;
    skipAllUi(why);
    skip('ui: the Trails tab still shows hikes', why);
    skip('ui: the Trips tab still shows city days', why);
  }
}

if (browser) await browser.close();
if (srv) srv.kill();

// ── Report ────────────────────────────────────────────────────────────────
for (const r of results) console.log(`${r.state}  ${r.label}${r.note ? `  [${r.note}]` : ''}`);
if (notes.length) {
  console.log('\nnotes:');
  for (const n of notes) console.log('  ' + n);
}
const failed = results.filter((r) => r.state === 'FAIL').length;
const skipped = results.filter((r) => r.state === 'SKIP').length;
console.log(`\n${results.length - failed - skipped} passed, ${failed} failed, ${skipped} could not run.`);
if (skipped) console.log('A skipped check is not a passing check: the UI it needs does not exist yet.');
process.exit(failed === 0 ? 0 : 1);
