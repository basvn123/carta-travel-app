// Region layer harness: the scope ladder, travel bands, region pages and
// the tier rules on the wire.
//
// npm run build, then: node scripts/verify_regions.mjs
//
// RUN IT FROM POWERSHELL, not Git Bash. The preview server is spawned with
// shell:true, and from bash that resolves npx's shim wrongly ('"node"' is
// not recognized), so nothing serves and EVERY wire check reports "missing"
// or "0 rows". That reads exactly like the wire being destroyed, and it is
// not: check `ls dist/region/*.json` before believing it.
//
// What it holds the build to:
//   - /region/index.json exists, parses, and its quota model matches the
//     formulas in pipeline/regions/quotas.py (the model ships with the
//     data, and this is the check that keeps the two in lockstep)
//   - every region file the index references exists and parses (sampled),
//     empty regions included: a missing JSON under public/ is served as
//     the SPA index with status 200, which is exactly the bug this rule
//     prevents
//   - no listed row anywhere carries a score key; top.json carries rated
//     rows only
//   - every published layer row carries its rg block (sampled)
//   - the near screen: with a mocked location on the Belgian coast, the
//     header says "near", the first card is a nearby card, and no far row
//     renders without a band divider above it. "415 km away" under "near
//     you" is the screenshot this whole programme started from.
//   - #region= opens the region page, Escape closes it
//
// One check is reported but NOT counted as a failure yet: country counts
// equal to a global constant (ES/FR/GB at exactly PUBLISH_MAX). The region
// quota reorders WHICH rows fill the cap in this chat; lifting the cap
// itself is the beach brief's work, so until that lands the smell test
// only warns.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

const PORT = 4213;
const BASE = `http://127.0.0.1:${PORT}/`;
mkdirSync('shots', { recursive: true });

const isUp = async () => {
  try { const r = await fetch(BASE); return r.ok; } catch { return false; }
};
let server = null;
if (!(await isUp())) {
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'],
    { shell: true, stdio: 'ignore' });
  for (let i = 0; i < 90 && !(await isUp()); i++) {
    await new Promise((r) => setTimeout(r, 500));
  }
}

const browser = await chromium.launch();
const checks = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });
const warns = [];
const errors = [];
// "Failed to load resource" with no URL is the browser noting an icon or
// manifest 404; a missing WIRE file cannot hide behind it because every
// wire check reads the JSON itself.
const NOISE = /emrldtp|ERR_FAILED|config is not valid|content_overrides|net::|favicon|Failed to load resource/;

const seed = (page) => page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
  } catch { /* storage unavailable */ }
});
const wire = (page) => {
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
  page.on('console', (m) => {
    if (m.type() === 'error' && !NOISE.test(m.text())) {
      errors.push('console: ' + m.text().slice(0, 140));
    }
  });
};

const getJson = async (path) => {
  try {
    const r = await fetch(BASE.replace(/\/$/, '') + path);
    if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) return null;
    return await r.json();
  } catch { return null; }
};

try {
  // ── 1. The region wire ────────────────────────────────────────────────
  const index = await getJson('/region/index.json');
  check('region index exists and parses', !!index && Array.isArray(index.regions),
    index ? `${index.regions?.length} regions` : 'missing');

  if (index) {
    check('region count matches the index', index.n_regions === index.regions.length,
      `${index.n_regions} vs ${index.regions.length}`);

    // The quota model in the wire against the formulas in the code.
    const quotasPy = readFileSync('../pipeline/regions/quotas.py', 'utf-8');
    const model = index.model || {};
    let inSync = !!model.quotas;
    for (const [layer, spec] of Object.entries(model.quotas || {})) {
      if (!quotasPy.includes(`"${spec.per_unit.replace(/ /g, ' ')}"`)
        && !quotasPy.includes(spec.per_unit)) inSync = false;
      if (!spec.unit || typeof spec.lo !== 'number') inSync = false;
      void layer;
    }
    check('quota model ships with the data and matches quotas.py', inSync,
      Object.keys(model.quotas || {}).join(','));

    // Sampled region files: they exist, parse, keep tiers apart, and an
    // empty region still answers with a file.
    const sample = [];
    const rs = index.regions;
    for (let i = 0; i < rs.length && sample.length < 40; i += Math.ceil(rs.length / 40)) {
      sample.push(rs[i]);
    }
    let missing = 0; let scoredListed = 0; let unranked = 0; let empties = 0;
    for (const r of sample) {
      const file = await getJson(r.file);
      if (!file || !file.region) { missing++; continue; }
      if (!file.rated.length && !file.listed.length) empties++;
      for (const card of file.listed) if ('score' in card) scoredListed++;
      const scores = file.rated.map((c) => c.score).filter((s) => typeof s === 'number');
      const sorted = [...scores].sort((a, b) => b - a);
      if (JSON.stringify(scores) !== JSON.stringify(sorted)) unranked++;
    }
    check('sampled region files all exist and parse', missing === 0,
      `${sample.length - missing}/${sample.length}, ${empties} empty files present`);
    check('no listed card carries a score key', scoredListed === 0,
      scoredListed ? `${scoredListed} leaks` : '');
    check('rated cards are ranked', unranked === 0);
  }

  // ── 2. Layer wires: tiers and rg ──────────────────────────────────────
  for (const [dir, key] of [['beaches', 'beaches'], ['lakes', 'lakes'],
    ['mountains', 'mountains']]) {
    const top = await getJson(`/${dir}/top.json`);
    const rows = top?.[key] || [];
    const onlyRated = rows.every((r) => (r.t || 'r') === 'r' && ('score' in r));
    check(`${dir} top.json carries rated rows only`, rows.length > 0 && onlyRated,
      `${rows.length} rows`);

    const idx = await getJson(`/${dir}/index.json`);
    const ccs = (idx?.countries || []).slice(0, 3).map((c) => c.cc);
    let noRg = 0; let n = 0; let listedScored = 0;
    for (const cc of ccs) {
      const file = await getJson(`/${dir}/${cc}.json`);
      for (const row of file?.[key] || []) {
        n++;
        if (!row.rg) noRg++;
      }
      for (const row of file?.listed || []) {
        if ('score' in row) listedScored++;
      }
    }
    check(`${dir} rows carry their region block`, n > 0 && noRg === 0,
      `${noRg}/${n} missing rg`);
    check(`${dir} listed rows ship without scores`, listedScored === 0);

    // The cap smell test, reported but not failed until the beach brief
    // lifts the cap itself.
    const counts = (idx?.countries || []).map((c) => c.n);
    const max = Math.max(...counts, 0);
    const atMax = counts.filter((c) => c === max).length;
    if (atMax >= 3 && max > 0) {
      warns.push(`${dir}: ${atMax} countries publish exactly ${max}, the cap still binds (lifted by the layer briefs)`);
    }
  }

  // ── 1b. Every pointer REGIONS.md makes must resolve ───────────────────
  //
  // The doc tells a reader to look for specific wire fields. A rename then
  // leaves it citing something that does not exist, which reads exactly
  // like a field that does: a dangling pointer dressed as a citation. The
  // list is READ FROM THE DOC rather than copied here, so the two cannot
  // drift; this check is deliberately of the kind whose own correctness is
  // a fact (a path resolves or it does not) rather than a judgement.
  {
    const doc = readFileSync('../docs/REGIONS.md', 'utf-8');
    const block = doc.match(/```pointers\n([\s\S]*?)```/);
    const pointers = (block ? block[1] : '').split('\n')
      .map((l) => l.trim()).filter(Boolean)
      .map((l) => l.split(/\s{2,}/).map((s) => s.trim()));
    const sample = await getJson('/region/COAST_BE-BELGIAN-COAST.json');
    const docs = {
      'coverage.json': await getJson('/coverage.json'),
      'region/index.json': index,
      'region/{ID}.json': sample,
    };
    const dead = [];
    for (const [file, path] of pointers) {
      let node = docs[file];
      for (const part of path.replace(/\[\]/g, '.0').split('.')) {
        node = node == null ? undefined : node[part];
      }
      if (node === undefined) dead.push(`${file}:${path}`);
    }
    check('every wire pointer REGIONS.md makes resolves',
      pointers.length > 0 && dead.length === 0,
      dead.length ? `dead: ${dead.join(', ')}` : `${pointers.length} pointers`);
  }

  // ── 2a. Is the quota's upper CLAMP deciding an answer? ────────────────
  //
  // Making the quota a priority rather than a ceiling moved which constant
  // binds, and the next one in line is `hi`. A region whose quota equals
  // its layer's hi AND which fills that quota was stopped by the clamp,
  // not by its own opportunity: the same "a constant is deciding the
  // catalogue" smell the master spec names for country caps, one level in.
  // Both numbers are read from the wire's own model block, so this check
  // cannot drift from the model that produced the data.
  if (index?.model?.quotas) {
    const hiOf = index.model.quotas;
    const cov = await getJson('/coverage.json');
    // Only assert on layers the last audit recomputed AND whose wire has
    // not moved since. `refreshed` alone is not enough: it answers "did
    // the audit recompute this", which is a different claim from "is that
    // recomputation still current". A trails wire re-exported 47 minutes
    // after an audit that named trail passed a membership-only gate while
    // being twelve thousand rows out of date. Membership plus timestamp is
    // the pair; either alone is the "this is checked" fault.
    const named = new Set(cov?.refreshed || cov?.layers || []);
    const auditAt = Date.parse(cov?.generated_at || '') || 0;
    const wireAt = {};
    for (const [layer, dir] of [['beach', 'beaches'], ['lake', 'lakes'],
      ['mountain', 'mountains'], ['trail', 'trails']]) {
      const idx = await getJson(`/${dir}/index.json`);
      wireAt[layer] = Date.parse(idx?.generated_at || '') || 0;
    }
    const fresh = new Set([...named].filter(
      (l) => !wireAt[l] || !auditAt || wireAt[l] <= auditAt));
    const stale = (cov?.layers || []).filter((l) => !fresh.has(l));
    const clamped = {}; const deciding = {};
    for (const entry of Object.values(cov?.regions || {})) {
      for (const [layer, g] of Object.entries(entry)) {
        if (!g || typeof g !== 'object' || g.quota == null) continue;
        if (!fresh.has(layer)) continue;
        if (!hiOf[layer] || g.quota !== hiOf[layer].hi) continue;
        clamped[layer] = (clamped[layer] || 0) + 1;
        if ((g.r || 0) >= g.quota) deciding[layer] = (deciding[layer] || 0) + 1;
      }
    }
    const worst = Object.entries(deciding).sort((a, b) => b[1] - a[1])[0];
    const atClamp = Object.entries(clamped).map(([l, n]) => `${l} ${n} at clamp`).join(', ');
    const skipped = stale.length ? `; not asserted (stale): ${stale.join(',')}` : '';
    check('the quota clamp is not deciding any layer\'s answer',
      !worst || worst[1] <= 2,
      (worst ? `${worst[0]}: ${worst[1]} regions full at hi`
        : `none full at hi (${atClamp || 'no region at a clamp'})`) + skipped);
  }

  // ── 2b. Listed rows must actually REACH a region page ─────────────────
  //
  // The coverage fill exists so a region page is not empty, so a listed
  // row that ships in a country file and appears on no region page is the
  // whole feature failing silently. The first cut of export_regions read
  // only the main array and sent 208 listed rows to nowhere.
  {
    let sampled = 0; let landed = 0; let firstMiss = '';
    for (const [dir, key] of [['beaches', 'beaches'], ['lakes', 'lakes'],
      ['mountains', 'mountains']]) {
      void key;
      const idx = await getJson(`/${dir}/index.json`);
      const ccs = (idx?.countries || []).filter((c) => c.listed > 0)
        .slice(0, 3).map((c) => c.cc);
      for (const cc of ccs) {
        const file = await getJson(`/${dir}/${cc}.json`);
        for (const row of (file?.listed || []).slice(0, 2)) {
          const rg = row.rg || {};
          const targets = [rg.n2, rg.co, rg.ra].filter(Boolean);
          if (!targets.length) continue;
          sampled++;
          let found = false;
          for (const rid of targets) {
            const page = await getJson(`/region/${rid.replace(/:/g, '_')}.json`);
            if ((page?.listed || []).some((c) => c.id === row.id)) found = true;
          }
          if (found) landed++;
          else if (!firstMiss) firstMiss = `${dir}/${cc} ${row.id}`;
        }
      }
    }
    check('listed rows reach their region pages',
      sampled === 0 || landed === sampled,
      sampled ? `${landed}/${sampled} landed${firstMiss ? `, missing ${firstMiss}` : ''}`
        : 'no listed rows in the wire to sample');
  }

  // ── 3. The near screen: scope header, band chips, band dividers ───────
  //
  // Run twice, because the two cases fail in opposite directions. On the
  // coast the header must say "near" and mean it; inland, where the
  // nearest beach is hours away, it must NOT, and that second case is the
  // screenshot this whole programme started from.
  const nearScreen = async (place) => {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      geolocation: { latitude: place.lat, longitude: place.lon },
      permissions: ['geolocation'],
    });
    const page = await ctx.newPage();
    await seed(page);
    wire(page);
    await page.route('**/nominatim.openstreetmap.org/**', (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        name: place.name, display_name: place.display,
        address: place.address, lat: String(place.lat), lon: String(place.lon),
      }),
    }));
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);
    await page.locator('.bottom-nav-item', { hasText: /destinations/i }).first()
      .click({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(800);
    await page.locator('.places-cat', { hasText: /beaches/i }).first()
      .click({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const locate = page.locator('.places-locate:visible').first();
    const nearhead = page.locator('.places-nearhead');
    if (await locate.count()) {
      await locate.click().catch(() => {});
      // Wait for the header, do not sleep at it. A fixed 2.5 s passed on a
      // warm context and failed on a cold one, reporting "locating composes
      // no scope header" when locating had simply not finished: a false
      // failure that reads exactly like a real regression.
      await nearhead.first().waitFor({ state: 'visible', timeout: 20000 })
        .catch(() => {});
    }
    const found = await nearhead.count() > 0;
    const out = { found, scope: null, headText: '', chips: [], beforeDivider: [] };
    if (found) {
      out.scope = await nearhead.getAttribute('data-scope');
      out.headText = (await nearhead.innerText()).replace(/\s+/g, ' ').trim();
      out.chips = await page.locator('.places-card-km').allInnerTexts();
      const order = await page.evaluate(() => {
        const rows = [];
        document.querySelectorAll('.places-bandhead, .places-card-km').forEach((el) => {
          rows.push(el.classList.contains('places-bandhead')
            ? 'DIV' : el.textContent.trim());
        });
        return rows;
      });
      for (const item of order) {
        if (item === 'DIV') break;
        out.beforeDivider.push(item);
      }
      await page.screenshot({ path: `shots/regions-near-${place.slug}.png` });
    }
    await ctx.close();
    return out;
  };

  const coast = await nearScreen({
    slug: 'knokke', name: 'Knokke-Heist', lat: 51.34, lon: 3.27,
    display: 'Knokke-Heist, West-Vlaanderen, Belgium',
    address: { town: 'Knokke-Heist', state: 'West-Vlaanderen', country_code: 'be' },
  });
  check('locating composes a scope header', coast.found);
  if (coast.found) {
    check('the Knokke scope is nearby (the Belgian coast is 3 km away)',
      coast.scope === 'nearby', `scope=${coast.scope}`);
    check('cards carry band chips, not raw km-away lines',
      coast.chips.length > 0 && coast.chips.every((c) => !/km away$/.test(c.trim())),
      coast.chips.slice(0, 2).join(' | '));
    const farWords = /journey|weekend/i;
    check('no far row renders under the near header before a band divider',
      coast.beforeDivider.every((c) => !farWords.test(c)),
      `${coast.beforeDivider.length} rows above the first divider`);
  }

  // Debrecen: 700 km of Hungary between it and the nearest sea.
  const inland = await nearScreen({
    slug: 'debrecen', name: 'Debrecen', lat: 47.53, lon: 21.63,
    display: 'Debrecen, Hajdu-Bihar, Hungary',
    address: { city: 'Debrecen', state: 'Hajdu-Bihar', country_code: 'hu' },
  });
  check('an inland location still gets a scope header', inland.found);
  if (inland.found) {
    check('landlocked Debrecen is NOT labelled nearby',
      inland.scope !== 'nearby' && inland.scope !== 'none',
      `scope=${inland.scope}`);
    // The original bug, stated as an assertion: no result beyond the
    // nearby band may render under a "Near <city>" header.
    const claimsNear = /^Near /i.test(inland.headText);
    check('the header does not claim "Near Debrecen" over distant beaches',
      !claimsNear, inland.headText.slice(0, 80));
    check('the first inland card is not chipped as nearby',
      inland.chips.length === 0 || !/^Nearby/i.test(inland.chips[0].trim()),
      inland.chips[0] || 'no cards');
  }

  // ── 4. The region page deep link ──────────────────────────────────────
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page2 = await ctx2.newPage();
  await seed(page2);
  wire(page2);
  await page2.goto(`${BASE}#region=COAST:BE-BELGIAN-COAST`,
    { waitUntil: 'domcontentloaded', timeout: 45000 });
  // The page is a lazy chunk: wait for it rather than sleeping at it.
  const rgnp = page2.locator('.rgnp');
  await rgnp.first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  await page2.waitForTimeout(600);
  check('#region= opens the region page', await rgnp.count() > 0);
  if (await rgnp.count()) {
    const h1 = await page2.locator('.rgnp h1').innerText().catch(() => '');
    check('the region page names the coast', /belgian coast/i.test(h1), h1);
    // Every card whose wire entry carries a picture must render one. The
    // first cut read the trail layer's `img` as a URL string when it is an
    // object, so ten of sixteen cards on this page showed a blank frame
    // while the wire held their photograph.
    const wireFile = await getJson('/region/COAST_BE-BELGIAN-COAST.json');
    const withPhoto = [...(wireFile?.rated || []), ...(wireFile?.listed || [])]
      .filter((c) => (c.images && c.images[0]) || c.img).length;
    const rendered = await page2.locator('.rgnp-card img').count();
    check('every card with a picture in the wire renders it',
      withPhoto > 0 && rendered >= withPhoto,
      `${rendered} rendered vs ${withPhoto} in the wire`);
    await page2.screenshot({ path: 'shots/regions-page-belgian-coast.png' });
    await page2.keyboard.press('Escape');
    await page2.waitForTimeout(400);
    check('escape closes the region page', await rgnp.count() === 0);
  }
  await ctx2.close();
} catch (e) {
  // A thrown locator timeout must not swallow the checks that already ran:
  // "which of these passed" is the whole output of this script.
  errors.push('script: ' + String(e && e.message ? e.message : e).split('\n')[0]);
  check('the run finished without throwing', false);
}

await browser.close();
if (server) server.kill();
let fail = 0;
for (const c of checks) {
  if (!c.ok) fail++;
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
}
for (const w of warns) console.log(`WARN  ${w}`);
if (errors.length) {
  console.log('\npage errors:');
  for (const e of [...new Set(errors)].slice(0, 12)) console.log('  ' + e);
}
process.exit(fail || errors.length ? 1 : 0);
