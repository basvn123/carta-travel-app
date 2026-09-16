#!/usr/bin/env node
/**
 * audit-trail-photos.mjs - does every trail lead with a view of the walk?
 *
 * Same question as scripts/audit-trip-heroes.mjs, asked of trails. A card
 * promises a walk. A trailhead sign, a waymark on a post, a car park or a
 * locator map keeps that promise on a technicality and breaks it in the only
 * way that matters, which is what the reader sees before reading anything.
 *
 * The trail card is the one surface in the app with a good answer already:
 * DestinationsTab.jsx's TrailPicture draws the route's own geometry when
 * there is no photograph. A drawn line tells a walker the shape of the walk,
 * which a photograph of a signpost does not, so on this layer a bad photo is
 * strictly worse than no photo. What this audit produces is therefore a list
 * of photographs to DROP, not a list to replace.
 *
 * READS ONLY. Nothing under public/ is touched. Drops are written to a patch
 * file for the exporter to apply, because the wire is generated and a hand
 * edit there is erased by the next export:
 *   pipeline/trails/export_wire.py
 *
 * The reject vocabulary is READ OUT of pipeline/audit_hero_images.py at run
 * time, for the reason audit-trip-heroes.mjs gives: that file owns the
 * question "is this Commons file a photograph of a place", it is tuned
 * against files the pipeline genuinely mis-picked, and a second weaker copy
 * living in the app repo would drift from it and lose. Added here is only
 * what is specific to walking and absent there: waymarks, trailhead signage,
 * car parks, and the close-ups a route relation attracts.
 *
 * Offline. Categories come from cache/trails/photo_categories.json (92k
 * files) and cache/hero_image_meta.json (21.5k). A photo neither cache knows
 * is judged on its file name alone and reported as `name-only`, so the
 * confidence of each verdict stays visible instead of being averaged away.
 *
 * Run from continent-app/:
 *     node scripts/audit-trail-photos.mjs
 *     node scripts/audit-trail-photos.mjs --verbose
 *     node scripts/audit-trail-photos.mjs --write-patch
 *
 * Without --write-patch it reports and writes nothing at all, which is the
 * mode to run first: it prints the counts before anything changes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..');
const ROOT = path.resolve(APP, '..');

const TRAILS_DIR = path.join(APP, 'public', 'trails');
const CAT_CACHE = path.join(ROOT, 'cache', 'trails', 'photo_categories.json');
const META_CACHE = path.join(ROOT, 'cache', 'hero_image_meta.json');
const AUDIT_PY = path.join(ROOT, 'pipeline', 'audit_hero_images.py');

const REPORT = path.join(ROOT, 'data', 'reports', 'trail_photos_audit.json');
const PATCH = path.join(ROOT, 'data', 'reports', 'trail_photo_patch.json');

const argv = new Set(process.argv.slice(2));
const VERBOSE = argv.has('--verbose');
const WRITE_PATCH = argv.has('--write-patch');

// The card crops to 9/4 (.places-tcard). Prompt: anything under 800px is out.
// Measured on the LONG edge, because a 900x600 photograph is a usable card
// picture and a 900x120 strip is not; the aspect band below catches that one.
const MIN_LONG_EDGE = 800;
// Much wider than the 9/4 frame on purpose: this flags what CANNOT work in
// the card, not what is merely not ideal. The first pass set the portrait bar
// at 0.9 and that dropped 3:4 photographs (0.75) by the dozen, among them a
// clean view down the Rodopi gorge. An ordinary upright photograph is a
// photograph; it loses its top and bottom in a 9/4 crop and still shows the
// place. What does not survive is a tall panorama, so the bar sits below the
// commonest upright shapes (0.75 and 0.67) and catches only what is taller
// than 2:1. Same reasoning the fit_bars() comment in pipeline/images/checks.py
// gives for not using an absolute number across frames.
const MIN_AR = 0.5;
const MAX_AR = 3.6;

// ── the shared reject vocabulary ────────────────────────────────────────────

/**
 * Lift the pattern lists out of pipeline/audit_hero_images.py.
 *
 * Python and JS regex agree on everything these patterns use (literal
 * alternation, \b, \w, character classes); the one dialect difference that
 * would bite, inline (?i), is not used there because the flag is passed
 * separately. Anything unparseable is skipped with a warning rather than
 * silently narrowing the vocabulary.
 */
function loadRejectVocabulary() {
  const src = fs.readFileSync(AUDIT_PY, 'utf8');
  const badBlock = src.match(/^BAD_PATTERNS = \[(.*?)^\]/ms);
  const bad = [];
  if (badBlock) {
    const entry = /\(\s*"([a-z_]+)"\s*,\s*((?:r"(?:[^"\\]|\\.)*"\s*)+)\)/gs;
    let m;
    while ((m = entry.exec(badBlock[1])) !== null) {
      const parts = [...m[2].matchAll(/r"((?:[^"\\]|\\.)*)"/gs)].map((p) => p[1]);
      bad.push({ tag: m[1], pattern: parts.join('') });
    }
  }
  if (!bad.length) {
    console.warn('! could not read BAD_PATTERNS out of audit_hero_images.py');
  }

  const compile = (pattern, wrap) => {
    try {
      return new RegExp(wrap(pattern), 'i');
    } catch (err) {
      console.warn(`! skipping unparseable pattern: ${err.message}`);
      return null;
    }
  };

  // Two readings of the same word list, exactly as the Python does. On a FILE
  // NAME the word can sit anywhere; on a CATEGORY it has to lead, because
  // Commons files photographs under categories like "Buildings with flags in
  // Italy". Emblems are excluded from the category pass for the same reason.
  const nameRes = bad
    .map(({ tag, pattern }) => ({ tag, re: compile(pattern, (p) => `\\b${p}\\b`) }))
    .filter((r) => r.re);
  const catRes = bad
    .filter(({ tag }) => tag !== 'emblem')
    .map(({ tag, pattern }) => ({
      tag, re: compile(pattern, (p) => `^(svg |png |historical |old )?${p}\\b`),
    }))
    .filter((r) => r.re);

  const named = (name) => {
    const m = src.match(new RegExp(`^${name} = re\\.compile\\(\\s*((?:r"(?:[^"\\\\]|\\\\.)*"\\s*)+)`, 'ms'));
    if (!m) return null;
    const parts = [...m[1].matchAll(/r"((?:[^"\\]|\\.)*)"/gs)].map((p) => p[1]);
    return compile(parts.join(''), (p) => p);
  };

  return {
    nameRes,
    catRes,
    offSubject: named('OFF_SUBJECT'),
    offCats: named('OFF_CATS'),
    historical: named('HISTORICAL'),
    safeHints: named('SAFE_HINTS'),
  };
}

// ── what is specific to walking ─────────────────────────────────────────────

/**
 * The three things a route relation attracts that the destination vocabulary
 * has no reason to know about. Every one of these is a real photograph, taken
 * at the trail, of something that is not the trail:
 *
 *   waymark   the paint blaze, the metal lozenge, the post with the lozenge
 *             on it. Commons has thousands, because they are what a mapper
 *             photographs to prove a route exists.
 *   signage   the trailhead board, the information panel, the fingerpost.
 *             Often names the route in full, so it wins every text match.
 *   parking   the car park at the start, and the bus stop beside it.
 *
 * Kept deliberately narrow. "Sign" alone would take "Signal de Botrange", the
 * high point of Belgium, so the words are anchored to compounds. "Gate" would
 * take every kissing gate on a moorland view.
 */
const TRAIL_BAD = [
  ['waymark', /\b(waymark\w*|way ?mark\w*|blaze|blazes|trail marker|route marker|markierung|wegmarkierung|wegzeichen|markering|balisage|balise|segnavia|marcaje|sen[ãa]l[ií]stica|znakowanie|turistick[aá] zna[čc]ka)\b/i],
  ['signage', /\b(signpost|sign ?post|fingerpost|guidepost|wegweiser|wegwijzer|panneau|pancarte|cartello|se[ñn]al de|information (board|panel|sign)|infotafel|informatietafel|trailhead sign|noticeboard|notice board|schild|tabu[lł]a informacyjna)\b/i],
  ['parking', /\b(car ?park|parking|parkplatz|parkeerplaats|parcheggio|aparcamiento|park and ride|bus stop|bushalte|haltestelle)\b/i],
];

// Categories that say the same three things. Unanchored, because a Commons
// category is a subject statement already: a file in "Hiking trail markers in
// Slovenia" is a waymark whatever it is called.
const TRAIL_BAD_CATS = [
  ['waymark', /\b(trail markers?|way ?marks?|waymarking|route markers?|blazes|wegmarkierung|segnavia|markeringen)\b/i],
  ['signage', /\b(signposts?|fingerposts?|guideposts?|wegweiser|information (boards?|panels?|signs?)|infotafeln|street signs?|traffic signs?)\b/i],
  ['parking', /\b(car parks?|parking|parkpl[aä]tze|parcheggi|bus stops?)\b/i],
];

// What a good trail photograph looks like, in words. Used the way
// SAFE_HINTS is used in the Python: a file whose name says "view from the
// Rotwand summit" is not reclassified as signage because the word "Schild"
// appears in a place name inside it. Prompt 3.2's own standard: a wide view
// along the trail, or of the summit / valley it reaches.
const TRAIL_GOOD = /\b(view|views|vista|panorama|panoramic|aussicht|ausblick|blick|uitzicht|vue|veduta|panorama\w*|summit|gipfel|peak|cima|vrh|sommet|top of|ridge|grat|crest|valley|tal|vall[eé]e|valle|dolina|lake|see|lac|lago|jezero|glacier|gletscher|waterfall|wasserfall|cascade|coast|cliff|gorge|canyon|meadow|alm|forest|wald|foret|bosco|landscape|landschaft|paysage|paesaggio|scenery|sunrise|sunset|hiking|wandern|wanderung|hike|trail|sentiero|sendero|szlak|pad|pfad|weg)\b/i;

// ── helpers ─────────────────────────────────────────────────────────────────

/**
 * The Commons file name a URL points at, thumb or original alike. Thumb URLs
 * repeat the name twice (.../thumb/5/56/Name.jpg/960px-Name.jpg); the stable
 * identity is the path segment before the px- variant. Mirrors file_title()
 * in pipeline/images/checks.py.
 */
function fileTitle(url) {
  let pathname;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return '';
  }
  const parts = pathname.split('/').filter(Boolean);
  if (!parts.length) return '';
  const i = parts.indexOf('thumb');
  if (i !== -1 && parts.length >= i + 4) return parts[i + 3];
  return parts[parts.length - 1];
}

/**
 * The cache key for a file: percent-decoded, underscores to spaces, and the
 * EXTENSION LEFT ON, because that is how both caches key ("Foo bar.jpg").
 * Stripping it here is what silently turned every verdict into a name-only
 * one on the first run: the join never hit, so no photo was ever judged on
 * its categories.
 */
function titleKey(title) {
  let name = title;
  try {
    name = decodeURIComponent(title);
  } catch { /* a stray % in a Commons name; the raw form still reads */ }
  return name.replace(/_/g, ' ');
}

/** The same name as prose to match words against: extension off. */
function titleWords(title) {
  return titleKey(title).replace(/\.(jpe?g|png|gif|tiff?|webp|svg)$/i, '');
}

function loadJson(file, what) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.warn(`! no ${what} (${err.code || err.message}); judging on file names alone`);
    return {};
  }
}

// ── the audit ───────────────────────────────────────────────────────────────

function main() {
  const vocab = loadRejectVocabulary();
  const cats = loadJson(CAT_CACHE, 'trail photo categories');
  const meta = loadJson(META_CACHE, 'Commons file metadata');

  // Both caches key on "File:Name.jpg". Index them once by the bare name too,
  // since the wire only ever carries the URL.
  const catsByName = new Map();
  for (const [key, value] of Object.entries(cats)) {
    catsByName.set(key.replace(/^File:/, '').replace(/_/g, ' '), value);
  }
  const metaByName = new Map();
  for (const [key, value] of Object.entries(meta)) {
    metaByName.set(key.replace(/^File:/, '').replace(/_/g, ' '), value);
  }

  const files = fs.readdirSync(TRAILS_DIR).filter((f) => /^[A-Z]{2}\.json$/.test(f));
  const rows = [];
  let trails = 0;
  let withPhoto = 0;

  for (const file of files.sort()) {
    const wire = JSON.parse(fs.readFileSync(path.join(TRAILS_DIR, file), 'utf8'));
    const trips = [...(wire.trips || []), ...(wire.listed || [])];
    for (const tr of trips) {
      trails += 1;
      const url = tr.img?.u;
      if (!url) continue;
      withPhoto += 1;

      const title = fileTitle(url);
      const words = titleWords(title);
      const key = titleKey(title);
      const fileCats = catsByName.get(key)
        || (metaByName.get(key)?.cats ? String(metaByName.get(key).cats).split('; ') : null);
      const dims = metaByName.get(key);
      const w = tr.img.w ?? dims?.width ?? null;
      const h = tr.img.h ?? dims?.height ?? null;

      const flags = [];

      // Subject, from the file name. The good-words guard runs first, the
      // way SAFE_HINTS does in the Python: a wide view whose caption happens
      // to carry a bad word is a wide view.
      const looksGood = TRAIL_GOOD.test(words) || vocab.safeHints?.test(words);
      for (const [tag, re] of TRAIL_BAD) {
        if (re.test(words) && !looksGood) flags.push(`name:${tag}`);
      }
      for (const { tag, re } of vocab.nameRes) {
        if (re.test(words) && !looksGood) flags.push(`name:${tag}`);
      }
      if (vocab.offSubject?.test(words) && !looksGood) flags.push('name:off_subject');
      if (vocab.historical?.test(words)) flags.push('~historical');

      // Subject, from the categories. A category is a subject statement, so
      // it is trusted over the name and the good-words guard does not apply.
      if (fileCats) {
        for (const cat of fileCats) {
          for (const [tag, re] of TRAIL_BAD_CATS) {
            if (re.test(cat)) flags.push(`cat:${tag}`);
          }
          for (const { tag, re } of vocab.catRes) {
            if (re.test(cat)) flags.push(`cat:${tag}`);
          }
          if (vocab.offCats?.test(cat)) flags.push('cat:off_subject');
        }
      }

      // Mechanics.
      if (w && h) {
        const longEdge = Math.max(w, h);
        const ar = w / h;
        if (longEdge < MIN_LONG_EDGE) flags.push(`small:${w}x${h}`);
        if (ar < MIN_AR) flags.push(`portrait:${ar.toFixed(2)}`);
        else if (ar > MAX_AR) flags.push(`strip:${ar.toFixed(2)}`);
      } else {
        flags.push('~no_dims');
      }

      const uniq = [...new Set(flags)];
      const hardFlags = uniq.filter((f) => !f.startsWith('~'));
      if (!uniq.length) continue;

      rows.push({
        id: tr.id,
        name: tr.name,
        country: tr.country,
        category: tr.category,
        url,
        file: title,
        w,
        h,
        flags: uniq,
        drop: hardFlags.length > 0,
        // Whether the verdict saw categories or only the file name. A
        // name-only verdict is the weaker one and says so.
        basis: fileCats ? 'categories' : 'name-only',
        // Every trail can fall back to its own drawn geometry, so a drop
        // always has somewhere to land. Recorded rather than assumed.
        hasGeometry: Boolean(tr.geometry?.coordinates?.length),
      });
    }
  }

  // ── counts, which is all this prints unless asked for more ───────────────

  const drops = rows.filter((r) => r.drop);
  const byFlag = new Map();
  for (const r of rows) {
    for (const f of r.flags) {
      const tag = f.replace(/^~/, '').split(':')[0] === 'name' || f.split(':')[0] === 'cat'
        ? f.split(':').slice(0, 2).join(':')
        : f.replace(/:.*$/, '');
      byFlag.set(tag, (byFlag.get(tag) || 0) + 1);
    }
  }
  const byBasis = new Map();
  for (const r of drops) byBasis.set(r.basis, (byBasis.get(r.basis) || 0) + 1);
  const byCountry = new Map();
  for (const r of drops) byCountry.set(r.country, (byCountry.get(r.country) || 0) + 1);

  const pct = (n, of) => (of ? `${((n / of) * 100).toFixed(1)}%` : '-');

  console.log('\nTrail photographs');
  console.log(`  trails published        ${trails}`);
  console.log(`  carrying a photograph   ${withPhoto}  (${pct(withPhoto, trails)})`);
  console.log(`  drawn geometry instead  ${trails - withPhoto}  (${pct(trails - withPhoto, trails)})`);
  console.log('\nFlagged');
  console.log(`  flagged at all          ${rows.length}  (${pct(rows.length, withPhoto)} of photos)`);
  console.log(`  would drop              ${drops.length}  (${pct(drops.length, withPhoto)} of photos)`);
  console.log(`  warnings only           ${rows.length - drops.length}`);
  console.log(`  drops with geometry     ${drops.filter((r) => r.hasGeometry).length} of ${drops.length}`);

  // A check that finds nothing is a result, not an omission: the exporter
  // restates every photograph at 1280px, so the prompt's "anything under
  // 800px" bar currently has nothing to catch. Printed so that a future
  // export that stops doing this is visible the moment it happens.
  const small = rows.filter((r) => r.flags.some((f) => f.startsWith('small:')));
  console.log(`\n  under ${MIN_LONG_EDGE}px on the long edge   ${small.length}`);

  console.log('\nBy reason (a photo can carry more than one)');
  for (const [tag, n] of [...byFlag].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${tag.padEnd(22)} ${n}`);
  }
  console.log('\nDrops by basis');
  for (const [basis, n] of [...byBasis].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${basis.padEnd(22)} ${n}`);
  }
  console.log('\nDrops by country (top 12)');
  for (const [cc, n] of [...byCountry].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${cc.padEnd(22)} ${n}`);
  }

  if (VERBOSE) {
    console.log('\nEvery drop');
    for (const r of drops) {
      console.log(`  ${r.country} ${String(r.id).padEnd(7)} ${r.flags.join(',').padEnd(30)} ${r.name}`);
      console.log(`          ${r.file}`);
    }
  }

  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, `${JSON.stringify({
    generated_at: new Date().toISOString(),
    trails,
    with_photo: withPhoto,
    flagged: rows.length,
    drops: drops.length,
    by_flag: Object.fromEntries(byFlag),
    by_basis: Object.fromEntries(byBasis),
    rows,
  }, null, 2)}\n`);
  console.log(`\nreport  ${path.relative(ROOT, REPORT)}`);

  if (WRITE_PATCH) {
    fs.writeFileSync(PATCH, `${JSON.stringify({
      generated_at: new Date().toISOString(),
      note: 'Trail ids whose photograph is not a view of the walk. '
        + 'pipeline/trails/export_wire.py drops img for these, and the card '
        + 'falls back to the drawn route geometry.',
      drop: drops.map((r) => ({
        id: r.id, country: r.country, file: r.file, flags: r.flags,
      })),
    }, null, 2)}\n`);
    console.log(`patch   ${path.relative(ROOT, PATCH)}`);
  } else {
    console.log('patch   not written (pass --write-patch)');
  }
}

main();
