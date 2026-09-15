#!/usr/bin/env node
/**
 * audit-trip-heroes.mjs - does every trip and journey lead with a view?
 *
 * A card promises a place. A locator map, a coat of arms, a museum interior
 * or a portrait keeps that promise on a technicality and breaks it in the
 * only way that matters, which is what the reader sees before they read
 * anything. This walks every published trip and journey, resolves the hero it
 * actually uses, and says which ones are not photographs of somewhere.
 *
 * READS ONLY. Nothing under public/ is touched. The replacements it finds are
 * written to a patch file for the two exporters to apply, because the wire is
 * generated and a hand-edit there is erased by the next export:
 *   pipeline/trips/export_trips.py        (trips, via hero_of)
 *   pipeline/journeys/build_wire.py       (journeys, via pick_hero)
 *
 * Why this does not carry its own reject vocabulary. pipeline/audit_hero_images.py
 * already owns the question "is this Commons file a photograph of a place",
 * and its answer is tuned against files this pipeline genuinely mis-picked
 * (the category pass alone distinguishes "Maps of Italy" from "Buildings with
 * flags in Italy"). A second, weaker copy of that judgement living in the app
 * repo would drift from it and lose. The patterns below are READ OUT of that
 * file at run time, so there is one vocabulary and this script inherits every
 * future fix to it.
 *
 * Offline. Dimensions and Commons categories come from cache/hero_image_meta.json
 * (21.5k files) and cache/journey_images.json. A hero neither cache knows is
 * reported as `unknown` rather than guessed at: not a pass, and not a flag.
 *
 * Run from continent-app/:
 *     node scripts/audit-trip-heroes.mjs
 *     node scripts/audit-trip-heroes.mjs --write-patch
 *
 * Without --write-patch it reports and writes nothing at all, which is the
 * mode to run first: it prints how many were flagged and how many could be
 * auto-replaced before anything changes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..');
const ROOT = path.resolve(APP, '..');

const TRIPS_DIR = path.join(APP, 'public', 'trips', 'trip');
const JOURNEYS_DIR = path.join(APP, 'public', 'journeys', 'journey');
const DOSSIER_DIR = path.join(APP, 'public', 'dossier');
const META_CACHE = path.join(ROOT, 'cache', 'hero_image_meta.json');
const JOURNEY_CACHE = path.join(ROOT, 'cache', 'journey_images.json');
const AUDIT_PY = path.join(ROOT, 'pipeline', 'audit_hero_images.py');

const REPORT = path.join(ROOT, 'reports', 'trip_heroes_audit.json');
const PATCH = path.join(ROOT, 'data', 'reports', 'trip_hero_patch.json');

// The widths upload.wikimedia.org actually renders (see src/lib/heroImage.js:
// an unlisted width returns 400, not a resized image). A replacement lifted
// from a 500px POI thumbnail must be restated at the hero width, or the fix
// ships a smaller picture than the one it replaced.
const HERO_PX = 1280;
// Anchored to the LAST path segment, which is the only place the rendered
// width lives. An unanchored /(\d+)px-/ rewrites the file NAME too, and
// Commons really does host files called "1280px-Soldeu.jpg": that produced
// ".../1280px-Soldeu.jpg/960px-800px-Soldeu.jpg", a 404 that looked like a
// resize. Mirrors THUMB_RE in src/lib/heroImage.js, which is anchored the
// same way for the same reason.
const THUMB_RE = /\/(\d+)px-([^/]*)$/;
const atHeroWidth = (url) => (
  typeof url === 'string' && url.includes('/thumb/') && THUMB_RE.test(url)
    ? url.replace(THUMB_RE, `/${HERO_PX}px-$2`)
    : url
);

// A card crops to 30/11 (.itin-card-media) and a journey card to 25/12. A
// photograph outside this band arrives as its middle third whichever way it
// is cropped, so the band is deliberately wider than either frame: this
// flags what CANNOT work, not what is merely not ideal.
const MIN_AR = 1.2;
const MAX_AR = 2.4;
const MIN_LONG_EDGE = 800;

// ── the shared reject vocabulary ────────────────────────────────────────────

/**
 * Lift the pattern lists out of pipeline/audit_hero_images.py.
 *
 * Python regex and JS regex agree on everything these patterns use (literal
 * alternation, \b, \w, character classes), so the source strings port as-is;
 * the one dialect difference that would bite, inline (?i), is not used there
 * because the flag is passed separately. Anything unparseable is skipped with
 * a warning rather than silently narrowing the vocabulary.
 */
function loadRejectVocabulary() {
  const src = fs.readFileSync(AUDIT_PY, 'utf8');

  // BAD_PATTERNS = [ ("tag", r"..." r"..."), ... ]
  const badBlock = src.match(/^BAD_PATTERNS = \[(.*?)^\]/ms);
  const bad = [];
  if (badBlock) {
    const entry = /\(\s*"([a-z_]+)"\s*,\s*((?:r"(?:[^"\\]|\\.)*"\s*)+)\)/gs;
    let m;
    while ((m = entry.exec(badBlock[1])) !== null) {
      // Adjacent r"..." literals concatenate in Python.
      const parts = [...m[2].matchAll(/r"((?:[^"\\]|\\.)*)"/gs)].map((p) => p[1]);
      bad.push({ tag: m[1], pattern: parts.join('') });
    }
  }

  const named = (name) => {
    const m = src.match(new RegExp(`^${name} = re\\.compile\\(\\s*((?:\\s*r?"(?:[^"\\\\]|\\\\.)*"\\s*)+)`, 'ms'));
    if (!m) return null;
    return [...m[1].matchAll(/r?"((?:[^"\\]|\\.)*)"/gs)].map((p) => p[1]).join('');
  };

  const compile = (pattern, what) => {
    try {
      return new RegExp(pattern, 'i');
    } catch (err) {
      console.warn(`  ! could not port ${what} from audit_hero_images.py: ${err.message}`);
      return null;
    }
  };

  const nameRe = bad
    .map(({ tag, pattern }) => ({ tag, re: compile(`\\b(?:${pattern})\\b`, tag) }))
    .filter((x) => x.re);
  // Emblems are excluded from the category pass on purpose, and the reason is
  // in audit_hero_images.py: Commons files a photograph that merely SHOWS a
  // flag under "Flags in Gloucestershire".
  const catRe = bad
    .filter(({ tag }) => tag !== 'emblem')
    .map(({ tag, pattern }) => ({ tag, re: compile(`^(?:svg |png |historical |old )?(?:${pattern})\\b`, tag) }))
    .filter((x) => x.re);

  const single = (name, tag) => {
    const pattern = named(name);
    if (!pattern) {
      console.warn(`  ! ${name} not found in audit_hero_images.py`);
      return null;
    }
    const re = compile(pattern, name);
    return re ? { tag, re } : null;
  };

  return {
    nameRe,
    catRe,
    historical: single('HISTORICAL', 'historical'),
    offSubject: single('OFF_SUBJECT', 'off_subject'),
    offCats: single('OFF_CATS', 'off_subject'),
    safe: single('SAFE_HINTS', 'safe'),
    count: bad.length,
  };
}

// ── caches ──────────────────────────────────────────────────────────────────

/** The Commons file behind a URL or a "File:Name" title, lowercased. Mirrors
 *  _file_key in export_trips.py so the two agree about what one file is. */
function fileKey(text) {
  let name = String(text || '').split('?')[0].split('/').pop();
  name = name.replace(/^\d+px-/, '').replace(/^File:/i, '');
  try { name = decodeURIComponent(name); } catch { /* already literal */ }
  return name.replace(/_/g, ' ').trim().toLowerCase();
}

/**
 * The dossier FILENAME for a destination id, mirroring dossierFileBase in
 * src/lib/dossier.js. Two shapes the raw id gets wrong: "gem:mostar-ba" is
 * filed as "gem-mostar-ba", and ids colliding with Windows device names (PRN,
 * COM1, ...) carry a trailing underscore. 324 of the 419 stop ids in the wire
 * need this, so skipping it silently emptied the deepest candidate pool.
 */
const RESERVED = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  ...Array.from({ length: 10 }, (_, i) => `COM${i}`),
  ...Array.from({ length: 10 }, (_, i) => `LPT${i}`),
]);

function dossierFileBase(destId) {
  const id = String(destId || '');
  if (id.startsWith('gem:')) return `gem-${id.slice(4)}`;
  const code = id.toUpperCase();
  return RESERVED.has(code) ? `${code}_` : code;
}

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function buildMeta() {
  const meta = readJson(META_CACHE, {}) || {};
  const byKey = new Map();
  for (const [title, rec] of Object.entries(meta)) {
    if (rec && typeof rec === 'object') byKey.set(fileKey(title), rec);
  }
  // The journey cache carries dimensions but no categories: a second-best
  // record, and better than none for the size and shape checks.
  const jcache = readJson(JOURNEY_CACHE, {}) || {};
  for (const rec of Object.values(jcache)) {
    if (!rec || !rec.url || !rec.w) continue;
    const key = fileKey(rec.url);
    if (!byKey.has(key)) byKey.set(key, { width: rec.w, height: rec.h, cats: '', name: rec.credit || '' });
  }
  return byKey;
}

// ── the verdict on one image ────────────────────────────────────────────────

/**
 * Why this image should not front a trip, or null when it may.
 *
 * Order matters: a file whose NAME says map is a map whatever its categories
 * say, but a file whose name is a camera serial ("DSC_0042.jpg") is only
 * knowable from its categories.
 */
function judge(url, meta, vocab) {
  if (!url) return { reason: 'missing', detail: 'no hero image' };

  // Special:FilePath is a commons.wikimedia.org redirect and the served CSP
  // allows upload.wikimedia.org only, so this renders BLANK in production
  // while looking right in the wire. Same rule as export_trips._photo_ok.
  if (url.includes('Special:FilePath')) {
    return { reason: 'csp_blocked', detail: 'Special:FilePath is blocked by the served CSP' };
  }

  const key = fileKey(url);
  const name = key.replace(/\.[a-z0-9]+$/, '');
  const cats = String(meta?.cats || '');
  const safe = vocab.safe && vocab.safe.re.test(name);

  for (const { tag, re } of vocab.nameRe) {
    if (!re.test(name)) continue;
    // A street called "Kortestraat", a hotel called "The Map Room": a real
    // photograph whose name happens to carry a bad word.
    if (safe && tag !== 'emblem') continue;
    return { reason: tag, detail: `file name reads as ${tag}: ${name}` };
  }
  for (const cat of cats.split(';').map((c) => c.trim()).filter(Boolean)) {
    for (const { tag, re } of vocab.catRe) {
      if (re.test(cat)) return { reason: tag, detail: `category "${cat}" reads as ${tag}` };
    }
  }
  if (vocab.historical) {
    // The word test runs over the name AND the categories, the way
    // audit_hero_images.classify does it. The YEAR half of that rule does not:
    // measured here, a bare four-digit year in a category flags modern digital
    // photographs on the strength of something the category merely mentions
    // ("Penkenbahn (1996-2015)", "Gisela (ship, 1871)", "Built in Belgium in
    // 1900"). All three were photographs of the place, taken this century. A
    // year in the FILE NAME still counts, because that is the file naming
    // itself as an old picture.
    const yearless = new RegExp(vocab.historical.re.source.replace(/^\\b\(1\[5-9\]\\d\{2\}\|19\[0-7\]\\d\)\\b\|/, ''), 'i');
    const hit = vocab.historical.re.test(name)
      || (yearless.source !== vocab.historical.re.source && yearless.test(cats));
    if (hit) return { reason: 'historical', detail: 'a painting or a photograph of another century' };
  }
  if (vocab.offSubject && vocab.offSubject.re.test(name)) {
    return { reason: 'off_subject', detail: `not a view of the place: ${name}` };
  }
  if (vocab.offCats && vocab.offCats.re.test(cats)) {
    return { reason: 'off_subject', detail: 'categories say aircraft, rolling stock or a species' };
  }

  if (!meta || !meta.width || !meta.height) {
    return { reason: 'unknown', detail: 'no cached dimensions or categories for this file' };
  }
  const { width: w, height: h } = meta;
  if (Math.max(w, h) < MIN_LONG_EDGE) {
    return { reason: 'too_small', detail: `${w}x${h}, long edge under ${MIN_LONG_EDGE}px` };
  }
  const ar = w / h;
  if (ar < MIN_AR || ar > MAX_AR) {
    return { reason: 'bad_aspect', detail: `${w}x${h}, aspect ${ar.toFixed(2)} outside ${MIN_AR}-${MAX_AR}` };
  }
  return null;
}

// ── candidate replacements ──────────────────────────────────────────────────

/**
 * Score a candidate so the best of several wins: a wide outdoor view of the
 * right place. Higher is better; a candidate that fails `judge` never gets
 * here, so this only ranks images that are already allowed to ship.
 */
function score(url, meta, vocab, frameAr) {
  if (!meta?.width || !meta?.height) return -1;
  const ar = meta.width / meta.height;
  if (ar < MIN_AR || ar > MAX_AR) return -1;
  if (Math.max(meta.width, meta.height) < MIN_LONG_EDGE) return -1;
  // How much of the frame survives the crop: 1 when the photograph is exactly
  // the frame's shape, falling away in both directions.
  const fit = ar > frameAr ? frameAr / ar : ar / frameAr;
  const name = fileKey(url).replace(/\.[a-z0-9]+$/, '');
  const wide = vocab.safe && vocab.safe.re.test(name) ? 0.15 : 0;
  const big = Math.min(meta.width, 1920) / 1920 * 0.1;
  return fit + wide + big;
}

/**
 * Every image already attached to this trip, in BANDS.
 *
 * The band is the whole point, and leaving it out is how the first run of this
 * script proposed fronting 27 Mostar trips with a photograph of Dubrovnik.
 * Dubrovnik is a day trip FROM Mostar, its picture is wider, and a scorer that
 * ranks on shape alone will take it every time. export_trips.hero_of has
 * always ordered candidates this way and never crosses bands for shape; this
 * mirrors that rule rather than inventing a second one.
 *
 *   stop     a town this trip sleeps in. The opening town leads, because it
 *            is the one a reader is deciding whether to fly to.
 *   sight    something IN one of those towns. Still answers "where does this
 *            trip go" with the same answer.
 *   daytrip  a place the trip visits for an afternoon. A true photograph of
 *            somewhere the trip goes, and the wrong answer to what the trip
 *            IS, so it never outranks the two above.
 *
 * Only a better candidate from the SAME band replaces a flagged hero, and the
 * replacement must name a place the trip actually sleeps in.
 */
function tripCandidates(trip, dossierFor) {
  const out = [];
  const push = (url, credit, page, city, band) => {
    if (url && !out.some((c) => c.url === url)) out.push({ url, credit, page, city, band });
  };
  for (const s of trip.stops || []) {
    push(s.img, s.img_credit, s.img_page, s.city, 'stop');
  }
  // The dossier gallery carries several photographs per place, which is the
  // deepest pool available without a network call. They are pictures OF the
  // stop, so they sit with it rather than below the sights.
  for (const s of trip.stops || []) {
    for (const g of dossierFor(s.dest)) push(g.url, g.caption || s.city, g.page, s.city, 'stop');
  }
  for (const s of trip.stops || []) {
    for (const h of s.highlights || []) push(h.img, h.name, h.wiki, s.city, 'sight');
  }
  for (const g of trip.gallery || []) {
    // A trip gallery mixes stops and day trips; only the rows naming a stop
    // city can stand for the trip.
    const isStop = (trip.stops || []).some((s) => s.city === g.city);
    push(g.url, g.credit || g.name || g.city, g.page, g.city, isStop ? 'stop' : 'daytrip');
  }
  for (const d of trip.daytrips || []) push(d.img, d.img_credit || d.city, null, d.city, 'daytrip');
  return out;
}

function journeyCandidates(trip, jcache) {
  const out = [];
  const push = (rec, credit) => {
    if (!rec?.url) return;
    const url = String(rec.url).split('?')[0];
    if (!out.some((c) => c.url === url)) {
      out.push({ url, credit: credit || rec.credit, page: rec.page, city: credit || rec.credit });
    }
  };
  // The places this journey names, in the same claim order build_wire.py uses.
  const names = [];
  const add = (raw) => {
    const n = String(raw || '').replace(/\s*\(.*?\)\s*/g, ' ').trim().replace(/^[,.\s]+|[,.\s]+$/g, '');
    if (n && n.length <= 60 && !names.includes(n)) names.push(n);
  };
  const coords = trip.coordinates || {};
  if (coords.precision === 'source' || coords.precision === 'city') add(coords.matchedPlace);
  for (const b of trip.basecamps || []) add(b);
  for (const part of String(trip.subRegion || '').split(/[:;,/→>&+]|\bto\b|\band\b/)) {
    if (part.trim().split(/\s+/).length <= 4) add(part);
  }
  // Tags are NOT a source of places. They are themes ("karst", "truffles",
  // "gravel"), and a theme resolves to whatever article happens to carry
  // that title: "karst" fetched Krupa Canyon in Croatia and offered it to a
  // Hungarian running week in the Bukk. Only fields that name a location may
  // nominate a photograph.
  for (const n of names) {
    if (jcache[n]) push(jcache[n], n);
    // The cache is keyed by article title, which is usually Title Case.
    const title = n.replace(/\b\w/g, (c) => c.toUpperCase());
    if (jcache[title]) push(jcache[title], n);
  }
  return out;
}

/**
 * Does this candidate sit in the journey's own country?
 *
 * Journeys carry no stop list, so the trip-side "must name a town this trip
 * sleeps in" guard has nothing to bite on. The country is the coarsest honest
 * substitute: a photograph filed under Croatia cannot front a week in Hungary,
 * whatever its shape. Commons categories carry the country name for most
 * files; when nothing says either way the candidate is allowed through,
 * because silence is not evidence of being in the wrong place.
 */
const COUNTRY_WORDS = [
  'albania', 'andorra', 'austria', 'belgium', 'bosnia', 'bulgaria', 'croatia',
  'cyprus', 'czech', 'denmark', 'estonia', 'finland', 'france', 'germany',
  'greece', 'hungary', 'iceland', 'ireland', 'italy', 'kosovo', 'latvia',
  'liechtenstein', 'lithuania', 'luxembourg', 'malta', 'moldova', 'monaco',
  'montenegro', 'netherlands', 'norway', 'poland', 'portugal', 'romania',
  'serbia', 'slovakia', 'slovenia', 'spain', 'sweden', 'switzerland',
  'turkey', 'ukraine', 'england', 'scotland', 'wales',
];

function plausibleCountry(cand, trip, meta) {
  const own = String(trip.country || '').trim().toLowerCase();
  if (!own) return true;
  const m = meta.get(fileKey(cand.url));
  const hay = `${fileKey(cand.url)} ${m?.cats || ''} ${m?.name || ''}`.toLowerCase();
  const named = COUNTRY_WORDS.filter((c) => hay.includes(c));
  if (!named.length) return true;                       // says nothing either way
  return named.some((c) => own.includes(c) || c.includes(own));
}

// ── the walk ────────────────────────────────────────────────────────────────

function main() {
  const writePatch = process.argv.includes('--write-patch');

  console.log('Reading the reject vocabulary from pipeline/audit_hero_images.py');
  const vocab = loadRejectVocabulary();
  console.log(`  ${vocab.count} pattern groups, plus historical, off-subject and safe hints`);

  const meta = buildMeta();
  console.log(`  ${meta.size} Commons files with cached size or categories`);

  const dossierCache = new Map();
  const dossierFor = (destId) => {
    if (!destId) return [];
    if (!dossierCache.has(destId)) {
      const doc = readJson(path.join(DOSSIER_DIR, `${dossierFileBase(destId)}.json`));
      dossierCache.set(destId, doc?.gallery || []);
    }
    return dossierCache.get(destId);
  };

  const rows = [];

  // Trips.
  const tripFiles = fs.existsSync(TRIPS_DIR) ? fs.readdirSync(TRIPS_DIR).filter((f) => f.endsWith('.json')) : [];
  for (const file of tripFiles) {
    const trip = readJson(path.join(TRIPS_DIR, file));
    if (!trip) continue;
    const hero = trip.hero || {};
    rows.push({
      layer: 'trip',
      id: trip.id || file.replace(/\.json$/, ''),
      title: trip.name || trip.id,
      cc: trip.cc,
      heroCity: hero.city || null,
      hero: hero.url || null,
      verdict: judge(hero.url, meta.get(fileKey(hero.url)), vocab),
      candidates: () => tripCandidates(trip, dossierFor),
      stopCities: new Set((trip.stops || []).map((x) => String(x.city || '').toLowerCase())),
      frameAr: 30 / 11,
    });
  }

  // Journeys.
  const jcache = readJson(JOURNEY_CACHE, {}) || {};
  const journeyFiles = fs.existsSync(JOURNEYS_DIR) ? fs.readdirSync(JOURNEYS_DIR).filter((f) => f.endsWith('.json')) : [];
  for (const file of journeyFiles) {
    const trip = readJson(path.join(JOURNEYS_DIR, file));
    if (!trip) continue;
    const hero = trip.hero || {};
    rows.push({
      layer: 'journey',
      id: trip.id || file.replace(/\.json$/, ''),
      title: trip.title,
      cc: trip.countryCode,
      heroCity: hero.credit || null,
      hero: hero.url || null,
      verdict: judge(hero.url, meta.get(fileKey(hero.url)), vocab),
      candidates: () => journeyCandidates(trip, jcache),
      journey: trip,
      frameAr: 25 / 12,
    });
  }

  // Cross-place reuse. One photograph standing for two DIFFERENT places is a
  // lie about what a place looks like; the same photograph on sixty trips
  // that all start in Berat is not, and 3,904 of the 3,949 trips are in that
  // second group. Only reuse across places is reported.
  const byUrl = new Map();
  for (const r of rows) {
    if (!r.hero) continue;
    if (!byUrl.has(r.hero)) byUrl.set(r.hero, []);
    byUrl.get(r.hero).push(r);
  }
  for (const [, group] of byUrl) {
    const places = new Set(group.map((r) => (r.heroCity || '').toLowerCase()).filter(Boolean));
    if (places.size < 2) continue;
    for (const r of group) {
      if (r.verdict) continue;
      r.verdict = {
        reason: 'shared_across_places',
        detail: `this file also fronts ${places.size - 1} other place(s): ${[...places].join(', ')}`,
      };
    }
  }

  // Replacements for what was flagged.
  const flagged = rows.filter((r) => r.verdict && r.verdict.reason !== 'unknown');
  const unknown = rows.filter((r) => r.verdict && r.verdict.reason === 'unknown');
  const patch = {};
  let replaced = 0;

  // Bands in the order export_trips.hero_of ranks them. The search takes the
  // best candidate in the FIRST band that offers one, and never compares
  // across bands: that is what stops a wide picture of a day trip beating a
  // squarish picture of the town the trip is about.
  const BANDS = ['stop', 'sight', 'daytrip'];

  for (const r of flagged) {
    let best = null;
    let bestScore = 0;
    const cands = r.candidates();
    // A trip must keep leading with a place it sleeps in. Without this the
    // run proposed Dubrovnik for 27 Mostar trips, Barcelona for 11 Andorran
    // ones and Banska Stiavnica for 9 Hungarian ones: every one of them a
    // real photograph of somewhere the trip passes, and none of them an
    // answer to "what does this trip look like".
    const homes = r.stopCities || null;
    for (const band of BANDS) {
      for (const cand of cands) {
        if (cand.url === r.hero) continue;
        if (cand.band && cand.band !== band) continue;
        if (homes && homes.size && cand.city
            && !homes.has(String(cand.city).toLowerCase())) continue;
        if (r.journey && !plausibleCountry(cand, r.journey, meta)) continue;
        const m = meta.get(fileKey(cand.url));
        if (judge(cand.url, m, vocab)) continue;
        const sc = score(cand.url, m, vocab, r.frameAr);
        if (sc > bestScore) { best = cand; bestScore = sc; }
      }
      if (best) break;
    }
    if (best) {
      replaced += 1;
      // Restated at the hero width: several of the best candidates come from
      // the POI shortlist, which ships its thumbnails at 500px.
      const url = atHeroWidth(best.url);
      r.replacement = { url, credit: best.credit || null, page: best.page || null, city: best.city || null, score: Number(bestScore.toFixed(3)) };
      patch[r.id] = { layer: r.layer, was: r.hero, reason: r.verdict.reason, hero: { url, credit: best.credit || null, page: best.page || null, city: best.city || null } };
    }
  }

  // ── the report ────────────────────────────────────────────────────────────

  const byReason = {};
  for (const r of flagged) byReason[r.verdict.reason] = (byReason[r.verdict.reason] || 0) + 1;

  const report = {
    generated_at: new Date().toISOString(),
    model: 'trip_heroes_audit_v1',
    checked: { trip: rows.filter((r) => r.layer === 'trip').length, journey: rows.filter((r) => r.layer === 'journey').length },
    flagged: flagged.length,
    unknown: unknown.length,
    replaceable: replaced,
    by_reason: Object.fromEntries(Object.entries(byReason).sort((a, b) => b[1] - a[1])),
    items: flagged.map((r) => ({
      layer: r.layer,
      id: r.id,
      title: r.title,
      cc: r.cc,
      hero: r.hero,
      reason: r.verdict.reason,
      detail: r.verdict.detail,
      replacement: r.replacement || null,
    })),
    unknown_items: unknown.map((r) => ({ layer: r.layer, id: r.id, hero: r.hero })),
  };

  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 1), 'utf8');

  const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
  console.log('');
  console.log(`  trips checked      ${report.checked.trip}`);
  console.log(`  journeys checked   ${report.checked.journey}`);
  console.log(`  flagged            ${report.flagged}`);
  console.log(`  auto-replaceable   ${report.replaceable}`);
  console.log(`  unknown (no cached metadata, neither pass nor flag)   ${report.unknown}`);
  console.log('');
  for (const [reason, n] of Object.entries(report.by_reason)) {
    console.log(`  ${String(n).padStart(5)}  ${reason}`);
  }
  console.log('');
  console.log(`  report: ${rel(REPORT)}`);

  if (writePatch) {
    fs.mkdirSync(path.dirname(PATCH), { recursive: true });
    fs.writeFileSync(PATCH, JSON.stringify({
      generated_at: report.generated_at,
      note: 'Applied by the exporters, never by hand: the wire under public/ is generated.',
      heroes: patch,
    }, null, 1), 'utf8');
    console.log(`  patch:  ${rel(PATCH)} (${Object.keys(patch).length} replacements)`);
  } else {
    console.log('  no patch written; re-run with --write-patch once the list above is agreed');
  }
}

main();
