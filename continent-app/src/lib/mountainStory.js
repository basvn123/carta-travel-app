/**
 * mountainStory.js, the mountain explained to a traveller rather than to a
 * scorer.
 *
 * pipeline/mountains ships every summit with a `why` array of reason codes,
 * not with prose:
 *
 *   [{k: 'kindPeak'}, {k: 'height', m: 2970},
 *    {k: 'lift', kind: 'cableCar', src: 'osm', name: 'Schilthornbahn'},
 *    {k: 'glacier'}, {k: 'summitFood'}, {k: 'wikiFame', n: 34}]
 *
 * and this file turns that into sentences through t(), which buys three
 * things a written description in the wire could not have. The text lands in
 * all six UI languages. Every sentence on the page maps to exactly one field
 * in the data, so nothing can be on screen that no source put there. And the
 * wire stays small enough to load a whole country at once.
 *
 * Same arrangement as lib/lakeStory.js, lib/beachStory.js and
 * lib/trailStory.js, for the same reason: composed copy belongs in the app,
 * where it can be translated, not in a JSON file written once in English.
 *
 * The order of the sentences is the order the pipeline emitted them in, which
 * is narrative order: what it is, how high, what it stands above, how you get
 * up it, what is up there, what is protected, and what it is known for.
 *
 * Two things are deliberately NOT part of that paragraph.
 *
 *   Hazards come out of the wire in their own array and render in their own
 *   block, because a glacier warning trimmed off the end of a paragraph is a
 *   warning that was not given.
 *   The way up names its own source. "There is a cable car" is a claim about
 *   the world, and the sentence says whether OpenStreetMap's map or a human
 *   put it there, because neither of them knows whether it is running today.
 */

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

// Reason code -> i18n key. A function where the code carries a variant that
// deserves its own sentence rather than an interpolated word.
// The kind* codes are deliberately absent: mountainWhy() skips them, because
// the opening line has already said what kind of mountain this is. They still
// earn a chip through TAG_KEY.
const WHY_KEY = {
  // The listed tier's one honest line: shipped by the region
  // programme's floor fill, never by a scored row.
  unrated_coverage: 'region.listedNote',
  height: 'mtn.whyHeight',
  highpoint: 'mtn.whyHighpoint',
  prominence: 'mtn.whyProminence',
  range: 'mtn.whyRange',
  // The way up. One sentence per kind, and deliberately not per source: the
  // banner at the top of the page already names the evidence, and repeating
  // "OpenStreetMap says" inside a paragraph would be a footnote pretending to
  // be a sentence.
  lift: (r) => `mtn.whyLift${cap(r.kind)}`,
  glacier: 'mtn.whyGlacier',
  volcanic: 'mtn.whyVolcanic',
  activeVolcano: 'mtn.whyActiveVolcano',
  viewpoint: 'mtn.whyViewpoint',
  summitFood: 'mtn.whySummitFood',
  hut: (r) => (r.name ? 'mtn.whyHutNamed' : 'mtn.whyHut'),
  observatory: 'mtn.whyObservatory',
  summitCross: 'mtn.whySummitCross',
  viaFerrata: (r) => (r.grade ? 'mtn.whyViaFerrataGrade' : 'mtn.whyViaFerrata'),
  graded: 'mtn.whyGraded',
  hiking: 'mtn.whyHiking',
  climbersMountain: 'mtn.whyClimbers',
  ski: 'mtn.whySki',
  park: 'mtn.whyPark',
  protected: 'mtn.whyProtected',
  unesco: 'mtn.whyUnesco',
  lakeBelow: 'mtn.whyLakeBelow',
  wildlife: 'mtn.whyWildlife',
  film: 'mtn.whyFilm',
  parking: 'mtn.whyParking',
  season: 'mtn.whySeason',
  wikiFame: 'mtn.whyWikiFame',
  curated: 'mtn.whyCurated',
};

// Short chip labels, for the card and the top of the page.
const TAG_KEY = {
  lift: (r) => `mtn.tag${cap(r.kind)}`,
  viewpoint: 'mtn.tagViewpoint',
  glacier: 'mtn.tagGlacier',
  activeVolcano: 'mtn.tagActiveVolcano',
  volcanic: 'mtn.tagVolcano',
  summitFood: 'mtn.tagSummitFood',
  viaFerrata: 'mtn.tagViaFerrata',
  hut: 'mtn.tagHut',
  park: 'mtn.tagPark',
  unesco: 'mtn.tagUnesco',
  ski: 'mtn.tagSki',
  lakeBelow: 'mtn.tagLakeBelow',
  observatory: 'mtn.tagObservatory',
  summitCross: 'mtn.tagSummitCross',
  highpoint: 'mtn.tagHighpoint',
  kindVolcano: 'mtn.tagVolcano',
  kindCliff: 'mtn.tagCliff',
  kindRock: 'mtn.tagRock',
  kindPlateau: 'mtn.tagPlateau',
  kindRidge: 'mtn.tagRidge',
  kindHill: 'mtn.tagHill',
};

function keyFor(map, reason) {
  const entry = map[reason.k];
  return typeof entry === 'function' ? entry(reason) : entry;
}

/** A month code from the wire ("jun") as a word in the reading language. */
export function monthWord(code, t) {
  return code ? t(`mtn.month${cap(code)}`) : '';
}

/** How you get to the top, as a word: "Cable car", "Rack railway", "On foot". */
export function liftLabel(mountain, t) {
  const kind = mountain?.lift?.kind;
  if (!kind) return t('mtn.liftNone');
  const key = `mtn.lift${cap(kind)}`;
  const word = t(key);
  return word && word !== key ? word : t('mtn.liftNone');
}

/**
 * The opening line: what this mountain is and where it is. Composed rather
 * than taken from a reason so it always exists, even for a summit whose only
 * signal was its height.
 */
export function mountainHeadline(mountain, t, countryName) {
  const kind = t(`mtn.kindWord${cap(mountain.kind || 'peak')}`);
  // The range if it has one, the country otherwise. Deliberately NOT the
  // nearest priced town: that field exists to say where you would sleep, and
  // "Teide is a volcano in Tenerife South" reads as a mistake because the
  // nearest thing Carta prices is an airport.
  const place = mountain.range || countryName || '';
  if (!place) return t('mtn.headKind', { name: mountain.name, kind });
  return t('mtn.headKindPlace', { name: mountain.name, kind, place });
}

/**
 * Every sentence the data supports, in reading order. `max` caps how many go
 * on a card; the page passes no cap and shows the lot.
 */
export function mountainWhy(mountain, t, max) {
  const out = [];
  for (const reason of mountain.why || []) {
    if (String(reason.k || '').startsWith('kind')) continue;
    const key = keyFor(WHY_KEY, reason);
    if (!key) continue;
    const params = { ...reason };
    if (reason.k === 'season') {
      params.from = monthWord(reason.from, t);
      params.to = monthWord(reason.to, t);
    }
    if (reason.k === 'graded') params.scale = t(`mtn.sac${cap(reason.scale || '')}`);
    const line = t(key, params);
    // A key with no catalogue entry falls back to the key itself, which must
    // never reach the page as a sentence.
    if (!line || line === key) continue;
    out.push(line);
    if (max && out.length >= max) break;
  }
  return out;
}

/** Chip labels for the card, already filtered by the pipeline to the four
 *  that say the most about this mountain. */
export function mountainTags(mountain, t, max = 3) {
  const byCode = new Map((mountain.why || []).map((r) => [r.k, r]));
  const out = [];
  for (const code of mountain.tags || []) {
    const reason = byCode.get(code) || { k: code };
    const key = keyFor(TAG_KEY, reason);
    if (!key) continue;
    const label = t(key, reason);
    if (!label || label === key) continue;
    out.push({ code, label });
    if (out.length >= max) break;
  }
  return out;
}

/** Hazards as sentences, in the order the pipeline ranked them. */
export function mountainHazards(mountain, t) {
  return (mountain.hazards || [])
    .map((code) => {
      const key = `mtn.haz${code.split('_').map(cap).join('')}`;
      const line = t(key);
      return line && line !== key ? { code, line } : null;
    })
    .filter(Boolean);
}

/** The estimated snow free season as one line, always carrying the word that
 *  says it is an estimate. */
export function mountainSeason(mountain, t) {
  const season = mountain.season;
  if (!season || season.n >= 12) return '';
  return t('mtn.seasonLine', {
    from: monthWord(season.from, t),
    to: monthWord(season.to, t),
    n: season.n,
  });
}

export function bestForLabel(code, t) {
  return t(`mtn.for${cap(code)}`);
}

export function componentLabel(code, t) {
  return t(`mtn.comp${cap(code)}`);
}

/** The order the score breakdown is read in: the components that decide the
 *  most first, which is also the order of their weights. */
export const COMPONENT_ORDER = ['scenery', 'access', 'acclaim', 'stature',
  'experience'];

/** The three the page shows as headline figures, above the breakdown. */
export const SUB_ORDER = ['scenery', 'access', 'experience'];

/** Score band, for the colour of the chip. Mirrors the cutoffs the pipeline
 *  published in the wire meta (peak_index.TIER_CUTOFFS); the mountain's own
 *  `tier` is authoritative and this is only the fallback. */
export function mountainTier(mountain) {
  if (mountain.tier != null) return mountain.tier;
  const s = mountain.score || 0;
  if (s >= 8.5) return 3;
  if (s >= 7.4) return 2;
  if (s >= 6.2) return 1;
  return 0;
}

/** The rating shape the app's RatingBadge already speaks. */
export function mountainRating(mountain, t) {
  const tier = mountainTier(mountain);
  return {
    score: mountain.score,
    tier,
    label: t(`mtn.band${tier}`),
  };
}

/** True for a mountain that scores well above what its fame predicts. The
 *  pipeline publishes the residual as `gem`; 0.5 is "exactly as good as its
 *  reputation", so the threshold is a real margin above that. */
export const GEM_CUTOFF = 0.6;

export function isHiddenGem(mountain) {
  return (mountain.gem || 0) >= GEM_CUTOFF;
}

/** True when you can ride to the top rather than walk. Drives the "lift to
 *  the top" filter chip, which is the single most asked question on this tab
 *  and the one the brief says to weight for. */
export function isLiftServed(mountain) {
  const kind = mountain?.lift?.kind;
  return !!kind && kind !== 'liftsNearby';
}

/** The height as a line, or an empty string for a mountain that never had a
 *  measured elevation. Never rounded to a prettier number than the source. */
export function heightLine(mountain, t, lang) {
  if (mountain.ele == null) return '';
  return t('mtn.heightLine', { m: Math.round(mountain.ele).toLocaleString(lang) });
}
