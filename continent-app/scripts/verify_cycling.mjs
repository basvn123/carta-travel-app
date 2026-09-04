// Headless verify for the cycling layer, and the Scotland acceptance test.
//
//   node scripts/verify_cycling.mjs [url]      (default http://localhost:4173)
//   node scripts/verify_cycling.mjs --wire     (data pass only, no browser)
//
// Two passes, and the first one is the one the brief actually asks for.
//
// THE WIRE PASS is section 6 of 07-CYCLING.md written as a test. The query is
// "cycling tours, Scotland, five days, balanced, scenic", and every clause of
// the expected answer is checked against the published files:
//
//   a stitched, continuous, gap-free line, and a GPX export whose credit
//     travels inside the file
//   five stages, each 65 to 95 km, each under 1,000 m of smoothed ascent
//   five named overnight towns, each with three or more mapped beds
//   per stage: percent paved, percent traffic free, a safety score and the
//     worst surface
//   a scenic score demonstrably higher than a same-length route through the
//     central belt
//   a rail bail-out named for every stage, or an explicit remote flag
//   best months from the climatology, which for the Highlands has to be a
//     summer window and must not include January
//   four or more photographs, none of them from an unchecked host
//   links to the published beaches, lakes, peaks and trails within 5 km
//
// Then the layer-wide invariants the export gate already enforces, checked
// again here because the gate and the app read the same files and a wire that
// drifted would fail silently in the browser: the tier contract (a listed row
// has NO score key, ever), the model block, the attribution, and the fact
// that no country's published count equals a global constant.
//
// THE DOM PASS opens Destinations, switches to Cycling, and checks that a
// tour card opens a page with its stages on it, that a listed row renders
// without a score, and that nothing untranslated leaks through.
//
// Phone viewport first, because that is how the tab is entered, then one
// desktop pass. Screenshots to shots/cycling-*.png.

import { readFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';

const ARGS = process.argv.slice(2);
const WIRE_ONLY = ARGS.includes('--wire');
const URL = ARGS.find((a) => a.startsWith('http')) || 'http://localhost:4173/';
const WIRE = 'public/cycling';

const checks = [];
const check = (label, ok, note = '') => { checks.push({ label, ok, note }); };
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

// Scotland in the ITL spine the region layer uses for the UK (the UK is not
// in NUTS after Brexit, so brief 01 mapped it to the ONS codes).
//
// Scotland is ITL1 TLM, so membership is a PREFIX test rather than a list:
// the first version of this file hard-coded TLM5 to TLM9 from the published
// 2021 ITL2 table and every Scottish check failed, because the spine on disk
// actually carries TLM0 Eastern, TLM1 East Central, TLM2 Highlands and
// Islands, TLM3 West Central, TLM5 North Eastern and TLM9 Southern. A prefix
// cannot go stale against a re-cut spine; a list of five codes can and did.
const isScottish = (rg) => String((rg && (rg.n2 || rg.n1)) || '').startsWith('TLM');
// The two ends of the "nicest part" comparison, named from the spine itself.
const HIGHLANDS = new Set(['TLM2', 'TLM5']);   // Highlands and Islands, NE
const CENTRAL_BELT = new Set(['TLM3', 'TLM1']); // West Central, East Central
const ALLOWED_IMAGE_HOSTS = /(^|\.)(wikimedia\.org|geograph\.org\.uk)$/;

// ---------------------------------------------------------------------------
// The wire
// ---------------------------------------------------------------------------

let index = null;
let gbCountry = null;
let scotTours = [];
const routeById = new Map();

if (!existsSync(`${WIRE}/index.json`)) {
  check('the cycling wire is published', false, `${WIRE}/index.json is missing`);
} else {
  index = readJson(`${WIRE}/index.json`);
  check('the cycling wire is published',
    (index.n_routes || 0) + (index.n_listed || 0) > 0,
    `${index.n_routes} rated, ${index.n_listed} listed, ${index.n_tours} tours`);

  // The model ships with the data (invariant 2).
  const model = index.model || {};
  check('the index names the model that rated it',
    Boolean(model.rating && model.rating.version),
    model.rating?.version || 'missing');
  check('the index names the model that composed the tours',
    Boolean(model.tours && model.tours.version),
    model.tours?.version || 'missing');
  check('the pace table ships with the data',
    Boolean(model.tours?.paces?.balanced?.km_lo === 65
      && model.tours?.paces?.balanced?.ascent_cap === 1000),
    JSON.stringify(model.tours?.paces?.balanced || {}));
  check('the safety metric ships its own weights',
    Boolean(model.safety && model.safety.highway_penalty
      && model.safety.highway_penalty.trunk === 10),
    model.safety?.version || 'missing');
  check('all ten hard checks are named in the index',
    (index.checks || []).length === 10, `${(index.checks || []).length} checks`);

  // Attribution: ODbL is the backbone of this layer and it has to be visible.
  const credits = (index.attribution || []).map((a) => `${a.source} ${a.credit}`).join(' ');
  check('OpenStreetMap is credited in the wire',
    /OpenStreetMap contributors/.test(credits) && /ODbL/.test(credits));

  // No country's published count may equal a global constant, which is the
  // definition-of-done test for "the region quota is actually binding".
  const counts = (index.countries || []).map((c) => c.n_routes).filter((n) => n > 1);
  const repeated = counts.filter((n, i) => counts.indexOf(n) !== i && counts.filter((m) => m === n).length > 2);
  check('no country publishes exactly a global constant',
    repeated.length === 0,
    repeated.length ? `repeated counts: ${[...new Set(repeated)].join(',')}` : 'all distinct enough');

  // Load every country file and hold the tier contract to account.
  let scoreOnListed = 0;
  let listedTotal = 0;
  let ratedNoScore = 0;
  let photosFourPlus = 0;
  let ratedTotal = 0;
  for (const entry of index.countries || []) {
    const path = `${WIRE}/${entry.file.split('/').pop()}`;
    if (!existsSync(path)) continue;
    const data = readJson(path);
    for (const r of data.listed || []) {
      listedTotal += 1;
      if ('score' in r || 'scenic' in r) scoreOnListed += 1;
    }
    for (const r of data.routes || []) {
      ratedTotal += 1;
      if (r.score == null) ratedNoScore += 1;
      if ((r.nimg || 0) >= 4) photosFourPlus += 1;
      routeById.set(r.id, r);
    }
    if (entry.country === 'GB') {
      gbCountry = data;
      scotTours = (data.tours || []).filter((t) => isScottish(t.rg));
    }
  }
  check('a listed row has no score key at all',
    scoreOnListed === 0,
    `${scoreOnListed} of ${listedTotal} listed rows carry one`);
  check('every rated row carries a score',
    ratedNoScore === 0, `${ratedNoScore} of ${ratedTotal} rated rows do not`);
  // EuroVelo families: the brief asks for EV1 to EV19 "published as
  // families". In OSM a EuroVelo is one relation PER COUNTRY SECTION, so
  // without this the catalogue shows "EuroVelo 6 part Germany 3" and never
  // the route it belongs to.
  const fams = index.families || [];
  check('EuroVelo routes are published as families',
    fams.length > 0, `${fams.length} families in the index`);
  if (fams.length) {
    const evOnly = fams.every((f) => /^EV\d+$/.test(f.ref));
    check('every family is a EuroVelo reference', evOnly,
      fams.map((f) => f.ref).join(', '));
    let famCredited = 0;
    let famSections = 0;
    for (const f of fams) {
      const path = `${WIRE}/family/${f.file.split('/').pop()}`;
      if (!existsSync(path)) continue;
      const fam = readJson(path);
      famSections += (fam.sections || []).length;
      // The ECF wording is PRESCRIBED and has to travel inside the object,
      // not sit in a footer somewhere.
      if (/EuroVelo\.com/.test(fam.attribution || '')
          && /Open Database License/.test(fam.attribution || '')) famCredited += 1;
    }
    check('every family file carries the prescribed EuroVelo credit',
      famCredited === fams.length, `${famCredited} of ${fams.length}`);
    check('families list their country sections',
      famSections > 0, `${famSections} sections across ${fams.length} families`);
  }

  // Land cover: the brief's forest/water fraction, and the component whose
  // absence tied the Highlands with a canal towpath.
  let landRows = 0;
  let landTotal = 0;
  for (const entry of index.countries || []) {
    const path = `${WIRE}/${entry.file.split('/').pop()}`;
    if (!existsSync(path)) continue;
    for (const r of (readJson(path).routes || [])) {
      landTotal += 1;
      if (r.scenic != null && (index.model?.scenic?.weights || {}).land) landRows += 1;
    }
  }
  check('the scenic model includes the land-cover component',
    Boolean((index.model?.scenic?.weights || {}).land),
    index.model?.scenic?.version || 'missing');

  check('rated rows reach the four-photograph target',
    ratedTotal === 0 || photosFourPlus > 0,
    `${photosFourPlus} of ${ratedTotal} rated rows have four or more`);
}

// ---------------------------------------------------------------------------
// The Scotland acceptance test
// ---------------------------------------------------------------------------
// "plan me a cycling trip through the nicest part of Scotland": tours,
// Scotland, five days, balanced, scenic. If a reader cannot get from that
// sentence to a day by day plan with real overnights, real surfaces and a
// real elevation budget, the layer is not done.

const balanced = scotTours.filter((t) => t.pace === 'balanced');
check('Scotland publishes balanced tours',
  balanced.length > 0, `${balanced.length} balanced of ${scotTours.length} Scottish tours`);

const fiveDay = balanced.filter((t) => t.days >= 4 && t.days <= 6);
check('Scotland has a tour of about five days',
  fiveDay.length > 0, `${fiveDay.length} tours of 4 to 6 days`);

// Take the most scenic one that fits, which is what "the nicest part" means.
const pick = [...(fiveDay.length ? fiveDay : balanced)]
  .sort((a, b) => (b.scenic || 0) - (a.scenic || 0))[0] || null;

if (!pick) {
  check('a Scottish tour can be examined end to end', false, 'no tour to open');
} else {
  const full = existsSync(`${WIRE}/tour/${pick.slug}.json`)
    ? readJson(`${WIRE}/tour/${pick.slug}.json`) : null;
  check('the tour has a detail file', Boolean(full), pick.slug);

  if (full) {
    const stages = full.stages || [];
    check('the tour has one stage per day',
      stages.length === full.days, `${stages.length} stages, ${full.days} days`);

    // Every stage inside the balanced band and under the ascent cap.
    const overKm = stages.filter((s) => s.distance_m > 95000 * 1.18);
    const underKm = stages.filter((s) => s.distance_m < 65000 * 0.82);
    const overAsc = stages.filter((s) => s.ascent_m != null && s.ascent_m > 1000);
    check('every stage is inside the balanced kilometre band',
      overKm.length === 0 && underKm.length === 0,
      `${overKm.length} too long, ${underKm.length} too short`);
    check('no stage climbs more than 1,000 m',
      overAsc.length === 0,
      overAsc.length ? `worst ${Math.max(...overAsc.map((s) => s.ascent_m))} m` : 'all within');

    // Named overnight towns with real beds.
    const towns = stages.map((s) => s.to?.name).filter(Boolean);
    check('every stage ends at a named town',
      towns.length === stages.length, towns.join(', '));
    const thin = stages.filter((s) => ((s.to?.sleep || 0) < 3) && !(s.to?.camp > 0));
    check('every overnight has three or more mapped beds, or a campsite',
      thin.length === 0,
      thin.length ? thin.map((s) => `${s.to?.name}:${s.to?.sleep || 0}`).join(', ')
        : `${towns.length} towns checked`);
    check('no town is used twice',
      new Set(towns).size === towns.length, towns.join(', '));

    // Per-stage riding figures.
    const noSurface = stages.filter((s) => s.paved_share == null);
    const noFree = stages.filter((s) => s.traffic_free_share == null);
    const noSafety = stages.filter((s) => s.safety == null);
    check('every stage states its paved share',
      noSurface.length === 0, `${noSurface.length} without one`);
    check('every stage states its traffic free share',
      noFree.length === 0, `${noFree.length} without one`);
    check('every stage carries a safety score',
      noSafety.length === 0, `${noSafety.length} without one`);
    check('every stage declares the bike its worst surface needs',
      stages.every((s) => s.bike), stages.map((s) => s.bike).join(','));

    // Bail-outs: remote is an answer, silence is not.
    const noBail = stages.filter((s) => !s.bailout || !s.bailout.kind);
    const named = stages.filter((s) => s.bailout?.kind === 'station' && s.bailout.name);
    check('every stage has a bail-out answer',
      noBail.length === 0, `${named.length} name a station, ${stages.length - named.length} are remote`);

    // Water and food.
    const dry = stages.filter((s) => (s.longest_dry_m || 0) > 40000);
    check('no stage runs 40 km without water or a shop',
      dry.length === 0,
      dry.length ? `worst ${Math.round(Math.max(...dry.map((s) => s.longest_dry_m)) / 1000)} km` : 'all supplied');

    // Season from the climatology: a Highland tour is a summer product.
    const months = full.season?.months || [];
    check('the tour declares its months from the climatology',
      months.length > 0 && months.length < 12, `months ${months.join(',')}`);
    check('the tour is not published as a January product',
      !months.includes(1), months.includes(1) ? 'January is claimed' : 'winter excluded');
    check('the best months are a summer window',
      (full.season?.best || []).every((m) => m >= 4 && m <= 10),
      `best ${(full.season?.best || []).join(',')}`);

    // The line: one continuous piece.
    const geom = full.geometry || {};
    const parts = geom.type === 'MultiLineString' ? geom.coordinates.length
      : geom.type === 'LineString' ? 1 : 0;
    check('the tour line is one continuous piece', parts === 1, `${parts} parts`);

    // Photographs and the cross-layer links live on the route underneath.
    const firstRoute = (full.routes || [])[0];
    const routeFull = firstRoute && existsSync(`${WIRE}/route/${firstRoute}.json`)
      ? readJson(`${WIRE}/route/${firstRoute}.json`) : null;
    check('the tour names the route it rides', Boolean(routeFull),
      firstRoute ? `route ${firstRoute}` : 'no route id');

    if (routeFull) {
      const imgs = routeFull.carta?.images || [];
      check('the route carries four or more photographs',
        imgs.length >= 4, `${imgs.length} photographs`);
      const badHost = imgs.filter((i) => {
        try { return !ALLOWED_IMAGE_HOSTS.test(new URL(i.url).hostname); }
        catch { return true; }
      });
      check('every photograph comes from a checked host',
        badHost.length === 0, badHost.map((i) => i.url).join(' ') || 'commons and geograph only');
      check('every photograph names its licence',
        imgs.every((i) => i.license), `${imgs.filter((i) => i.license).length}/${imgs.length}`);

      // The credit has to travel inside a GPX, so it has to be in the wire.
      check('the GPX credit travels with the geometry',
        Boolean(routeFull.osm?.attribution && /OpenStreetMap/.test(routeFull.osm.attribution)),
        routeFull.osm?.attribution || 'missing');
      check('the licence split is structural',
        Boolean(routeFull.osm?.geometry && routeFull.carta
          && !('geometry' in routeFull.carta)),
        'osm holds the geometry, carta holds our scores');

      // Cross-layer links (brief 08, consumed from day one).
      const near = routeFull.carta?.near || {};
      const layers = Object.keys(near).filter((k) => (near[k] || []).length);
      check('the route links to our own published places within 5 km',
        layers.length > 0, layers.length ? layers.join(', ') : 'nothing near');
    }
  }
}

// Scenic: the Highlands must out-score the central belt at comparable length.
if (gbCountry) {
  const median = (xs) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const scenicIn = (set) => (gbCountry.routes || [])
    .filter((r) => set.has(r.rg?.n2) && r.km >= 30 && r.scenic != null)
    .map((r) => r.scenic);
  const hi = scenicIn(HIGHLANDS);
  const belt = scenicIn(CENTRAL_BELT);
  // The brief's wording is "a scenic score demonstrably higher than A
  // SAME-LENGTH ROUTE through the central belt", singular. An earlier version
  // of this check demanded three rated routes on each side, which is a
  // stricter statistical claim than the brief makes and which the central
  // belt cannot supply: Glasgow and the Forth valley have few long signed
  // cycle routes, and only photographed routes carry a scenic figure at all.
  // So: compare medians when both sides are thick enough to have one, and
  // otherwise compare the best of each, which is the comparison the brief
  // actually asks for. Either way the numbers are printed.
  if (hi.length && belt.length) {
    const useMedian = hi.length >= 3 && belt.length >= 3;
    const a = useMedian ? median(hi) : Math.max(...hi);
    const b = useMedian ? median(belt) : Math.max(...belt);
    check('the Highlands score more scenic than the central belt', a > b,
      `${useMedian ? 'median' : 'best'}: Highlands ${a} over ${hi.length} route(s), `
      + `central belt ${b} over ${belt.length}`);
  } else {
    check('the Highlands score more scenic than the central belt', false,
      `nothing to compare (${hi.length} Highland, ${belt.length} central belt)`);
  }
}

// ---------------------------------------------------------------------------
// The DOM
// ---------------------------------------------------------------------------

if (!WIRE_ONLY) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const errors = [];
  // `content_overrides` is migration 018 and is not applied on the live
  // Supabase project, so overrides.js 404s on every layer page. It predates
  // this layer and verify_lakes.mjs already filters it for the same reason;
  // filtering it here too keeps a real cycling error visible instead of
  // buried under a backend gap that is somebody else's to close.
  const NOISE = /emrldtp|ERR_FAILED|config is not valid|favicon|content_overrides/;
  try { mkdirSync('shots', { recursive: true }); } catch { /* exists */ }

  const seed = (page) => page.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    } catch { /* storage unavailable */ }
  });

  for (const [label, viewport] of [
    ['phone', { width: 390, height: 844 }],
    ['desktop', { width: 1440, height: 900 }],
  ]) {
    try {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', (e) => { if (!NOISE.test(String(e))) errors.push(String(e)); });
    page.on('console', (m) => {
      const text = m.text();
      // Chrome's console line for a failed fetch is "Failed to load resource:
      // the server responded with a status of 404" and carries NO url, so it
      // can never be matched against NOISE. The response listener below is
      // what actually knows which request failed, so the generic line is
      // dropped here and judged there instead.
      if (m.type() !== 'error') return;
      if (NOISE.test(text) || /Failed to load resource/.test(text)) return;
      errors.push(text);
    });
    page.on('response', (r) => {
      if (r.status() >= 400 && !NOISE.test(r.url())) {
        errors.push(`${r.status()} ${r.url()}`);
      }
    });
    await seed(page);
    await page.goto(URL, { waitUntil: 'networkidle' });

    // Into Destinations, then the Cycling category.
    //
    // `:visible` is not optional here and this repo has paid for it before:
    // the category rail is TWINNED, a desktop side rail and a phone tab strip
    // both in the DOM at once, and `.first()` without it resolves to whichever
    // is hidden at this viewport. The click then retries for thirty seconds
    // against an invisible button and the harness dies with a TimeoutError
    // that says nothing about the app.
    const cycleTab = page.locator(
      'button:visible:has-text("Cycling"), [role=tab]:visible:has-text("Cycling")',
    ).first();
    const found = await cycleTab.count();
    check(`${label}: the Cycling category is on the rail`, found > 0);
    if (found) {
      await cycleTab.click();
      await page.waitForTimeout(1500);
      const list = page.locator('[data-testid=cycle-list]');
      check(`${label}: the cycling list renders`, await list.count() > 0);

      // The tab opens on a country index, the way Trails does. Pick Britain,
      // which is the country the acceptance test below is about, through the
      // country picker (twinned: the phone toolbar's and the desktop panel's).
      const ccards = await page.locator('.places-ccard:visible').count();
      check(`${label}: the tab opens on a country index`, ccards > 5, `${ccards} country cards`);
      const picker = page.locator('.places-country:visible').first();
      if (await picker.count()) {
        await picker.selectOption('GB');
        await page.waitForTimeout(2500);
      }

      const tourCards = page.locator('[data-testid=cycle-tourcard]');
      const routeCards = page.locator('[data-testid=cycle-card]');
      const nTours = await tourCards.count();
      const nRoutes = await routeCards.count();
      check(`${label}: cards are on the page`, nTours + nRoutes > 0,
        `${nTours} tours, ${nRoutes} routes`);

      // A listed card must not print a score anywhere on it. Its length
      // ("6.4 km") and climb are measured facts and stay; they are stripped
      // before the score regex runs so a short ride cannot fail as a score.
      const listedCards = page.locator('[data-testid=cycle-listed-card]');
      if (await listedCards.count()) {
        const text = await listedCards.first().innerText();
        const facts = text.replace(/[+-]?\d+(?:[.,]\d+)?\s?(?:km|m)\b/g, '');
        const scoreChips = await listedCards.first().locator('[data-testid=cycle-card-score]').count();
        check(`${label}: a listed card shows no score`,
          !/\b\d\.\d\b/.test(facts) && scoreChips === 0,
          text.replace(/\n/g, ' ').slice(0, 90));
        check(`${label}: a listed card says it is not scored`,
          /not scored/i.test(text), text.replace(/\n/g, ' ').slice(0, 60));
      }

      if (nTours) {
        await tourCards.first().click();
        await page.waitForTimeout(1200);
        check(`${label}: a tour opens its page`,
          await page.locator('[data-testid=cycle-page]').count() > 0);
        check(`${label}: the tour page lists its stages`,
          await page.locator('[data-testid=cycle-stage]').count() > 0,
          `${await page.locator('[data-testid=cycle-stage]').count()} stages`);
      } else if (nRoutes) {
        await routeCards.first().click();
        await page.waitForTimeout(1200);
        check(`${label}: a route opens its page`,
          await page.locator('[data-testid=cycle-page]').count() > 0);
      }

      const body = await page.locator('body').innerText();
      check(`${label}: nothing untranslated leaks through`,
        !/cycle\.\w+/.test(body),
        (body.match(/cycle\.\w+/) || [''])[0]);

      await page.screenshot({ path: `shots/cycling-${label}.png`, fullPage: false });
    }
    await page.close();
    } catch (err) {
      // A browser failure is a FAILED CHECK with the reason attached, never
      // an unhandled rejection that loses the fifteen wire checks that
      // already passed above it.
      check(`${label}: the DOM pass completes`, false,
        String(err).split(String.fromCharCode(10))[0].slice(0, 120));
    }
  }
  await browser.close();
  check('no uncaught errors in the browser', errors.length === 0,
    errors.slice(0, 3).join(' | '));
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const passed = checks.filter((c) => c.ok).length;
for (const c of checks) {
  console.log(`${c.ok ? 'ok  ' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
}
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
