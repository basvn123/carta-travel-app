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
  // The editorial tier: a mountain a person put on the list that missed a
  // machine gate. It carries no score either.
  editorial_pick: 'mtn.whyEditorial',
  // A row with nothing publishable shows the map instead of somebody else's
  // view under its name. The photo engine's own code, shared by every layer.
  no_photo_map_card: 'photo.mapCard',
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
  transit: 'mtn.whyTransit',
  // v2: the view, measured against Copernicus GLO-30 rather than inferred
  // from somebody having mapped a bench.
  wideView: 'mtn.whyWideView',
  waterView: 'mtn.whyWaterView',
  peaksInView: 'mtn.whyPeaksInView',
  // The difficulty facet, which never moves the ranking. `est` marks a grade
  // the terrain implied rather than one a mapper tagged, and it earns its own
  // sentence: a DEM has never walked anything.
  difficulty: (r) => (r.est ? 'mtn.whyDifficultyEst' : 'mtn.whyDifficulty'),
  season: 'mtn.whySeason',
  wikiFame: 'mtn.whyWikiFame',
  curated: 'mtn.whyCurated',
};

// Short chip labels, for the card and the top of the page.
const TAG_KEY = {
  lift: (r) => `mtn.tag${cap(r.kind)}`,
  viewpoint: 'mtn.tagViewpoint',
  wideView: 'mtn.tagWideView',
  waterView: 'mtn.tagWaterView',
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
    if (reason.k === 'difficulty') {
      params.word = t(`mtn.diff${cap(reason.d || '')}`);
      params.hard = reason.hard ? t(`mtn.diff${cap(reason.hard)}`) : '';
    }
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
  'experience', 'views', 'photo'];

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

/* ---------------------------------------------------------------------------
 * v2: the difficulty, the way in, the view and the season
 * ------------------------------------------------------------------------ */

/** The difficulty ladder as one word. `est` marks a grade nobody tagged: it
 *  was inferred from the terrain, and the label says so rather than letting
 *  a reader take a DEM's word for a route. */
export function difficultyLabel(mountain, t) {
  const code = mountain?.diff?.k;
  if (!code) return '';
  const word = t(`mtn.diff${cap(code)}`);
  if (!word || word === `mtn.diff${cap(code)}`) return '';
  return mountain.diff.est ? t('mtn.diffEst', { word }) : word;
}

/** Every way in this mountain has, as words, in the order the pipeline
 *  ranked them. */
export function accessLabels(mountain, t) {
  return (mountain?.acc || [])
    .map((code) => {
      const key = `mtn.acc${cap(code)}`;
      const word = t(key);
      return word && word !== key ? { code, label: word } : null;
    })
    .filter(Boolean);
}

/** The view band as a word. The band is a percentile WITHIN THE COUNTRY, so
 *  "Panoramic" means panoramic for this country, which is the only reading
 *  that works on both a Dutch and a Swiss page. */
export function viewBandLabel(mountain, t) {
  const band = mountain?.vb;
  if (!band) return '';
  const key = `mtn.view${band}`;
  const word = t(key);
  return word && word !== key ? word : '';
}

/** Prominence bands, the honest version of "how much of a mountain is it".
 *  Absolute metres rather than a percentile: 300 m of prominence is 300 m of
 *  prominence in Denmark and in Switzerland. */
export const PROM_BANDS = [
  { key: 'molehill', max: 100 },
  { key: 'hill', min: 100, max: 300 },
  { key: 'peak', min: 300, max: 1000 },
  { key: 'major', min: 1000 },
];

export function promBand(mountain) {
  const m = mountain?.prom;
  if (m == null) return null;
  return (PROM_BANDS.find((b) => (b.min == null || m >= b.min)
    && (b.max == null || m < b.max)) || {}).key || null;
}

export const ELEVATION_BANDS = [
  { key: 'e0', max: 500 },
  { key: 'e1', min: 500, max: 1000 },
  { key: 'e2', min: 1000, max: 2000 },
  { key: 'e3', min: 2000, max: 3000 },
  { key: 'e4', min: 3000 },
];

/** The best months as one line: a range where they are contiguous, a list
 *  where they are not, and never an invitation on a summit that is under
 *  snow all year (`snowbound`). */
export function bestMonthsLine(mountain, t) {
  const season = mountain?.season;
  const months = season?.months;
  if (!months || !months.length || months.length >= 12) return '';
  const words = months.map((m) => t(`mtn.mon${MONTH_CODES[m - 1]}`));
  const contiguous = months.every((m, i) => i === 0 || m === months[i - 1] + 1);
  const span = contiguous && months.length > 1
    ? t('mtn.monthsRange', { from: words[0], to: words[words.length - 1] })
    : words.join(', ');
  return season.snowbound
    ? t('mtn.monthsSnowbound', { span })
    : t('mtn.monthsBest', { span });
}

const MONTH_CODES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The seven filters brief 05 asks for, as a model rather than as markup.
 *
 * They render twice, as the quick chip row under the toolbar and as the full
 * set inside the Filters sheet, and a filter that exists in one and not the
 * other is the bug this shape prevents. `toolbar` is what decides which of
 * them is short enough for the row: the way up leads, because "can I get up
 * it" is what this tab is opened for, and the other six live in the sheet.
 *
 * Two rules the counts depend on:
 *   inside a group the chips are OR. The bands are mutually exclusive, so
 *   AND inside a group would mean every second tap emptied the list.
 *   across groups they are AND. "A volcano you can walk up" is the question
 *   people actually ask; "a volcano or anything you can walk up" is not.
 */
const inBand = (value, band) => value != null
  && (band.min == null || value >= band.min)
  && (band.max == null || value < band.max);

export const MOUNTAIN_FACETS = [
  {
    key: 'acc',
    labelKey: 'mtn.filterAccess',
    toolbar: true,
    options: [
      { key: 'liftTop', labelKey: 'mtn.accLiftTop' },
      { key: 'liftMountain', labelKey: 'mtn.accLiftMountain' },
      { key: 'roadTop', labelKey: 'mtn.accRoadTop' },
      { key: 'trailhead', labelKey: 'mtn.accTrailhead' },
      { key: 'transit', labelKey: 'mtn.accTransit' },
      { key: 'remote', labelKey: 'mtn.accRemote' },
    ].map((o) => ({ ...o, test: (m) => (m.acc || []).includes(o.key) })),
  },
  {
    key: 'diff',
    labelKey: 'mtn.filterDifficulty',
    options: ['walkUp', 'hike', 'mountainHike', 'scramble', 'alpine',
      'viaFerrata', 'technical'].map((code) => ({
      key: code,
      labelKey: `mtn.diff${cap(code)}`,
      test: (m) => m.diff?.k === code,
    })),
  },
  {
    key: 'ele',
    labelKey: 'mtn.filterElevation',
    options: ELEVATION_BANDS.map((b) => ({
      key: b.key,
      labelKey: `mtn.ele${cap(b.key)}`,
      test: (m) => inBand(m.ele, b),
    })),
  },
  {
    key: 'prom',
    labelKey: 'mtn.filterProminence',
    options: PROM_BANDS.map((b) => ({
      key: b.key,
      labelKey: `mtn.prom${cap(b.key)}`,
      test: (m) => inBand(m.prom, b),
    })),
  },
  {
    key: 'view',
    labelKey: 'mtn.filterViews',
    options: [5, 4, 3, 2, 1].map((band) => ({
      key: `v${band}`,
      labelKey: `mtn.view${band}`,
      test: (m) => m.vb === band,
    })),
  },
  {
    key: 'rate',
    labelKey: 'mtn.filterRating',
    options: [3, 2, 1].map((tier) => ({
      key: `t${tier}`,
      labelKey: `mtn.band${tier}`,
      test: (m) => mountainTier(m) >= tier,
    })),
  },
  {
    key: 'month',
    labelKey: 'mtn.filterSeason',
    options: MONTH_CODES.map((code, i) => ({
      key: code.toLowerCase(),
      labelKey: `mtn.mon${code}`,
      // A snowbound summit's "best months" are its warmest rather than its
      // walkable ones, so it is not offered as an answer to "what can I do
      // in July": it would be the one row on that list nobody can walk up.
      test: (m) => !m.season?.snowbound && (m.season?.months || []).includes(i + 1),
    })),
  },
  {
    key: 'kind',
    labelKey: 'mtn.filterLabel',
    options: [
      { key: 'volcano', labelKey: 'mtn.chipVolcano',
        test: (m) => m.kind === 'volcano' || (m.why || []).some(
          (w) => w.k === 'volcanic' || w.k === 'activeVolcano') },
      { key: 'glacier', labelKey: 'mtn.chipGlacier',
        test: (m) => (m.tags || []).includes('glacier') },
      { key: 'water', labelKey: 'mtn.chipWaterView',
        test: (m) => !!m.view?.water },
      { key: 'high', labelKey: 'mtn.chipHighpoint',
        test: (m) => (m.tags || []).includes('highpoint') },
    ],
  },
];

/** Rows that satisfy every ACTIVE group (OR inside a group, AND across). */
export function applyMountainFacets(rows, state) {
  let out = rows;
  for (const group of MOUNTAIN_FACETS) {
    const on = state?.[group.key] || [];
    if (!on.length) continue;
    const tests = on
      .map((k) => group.options.find((o) => o.key === k)?.test)
      .filter(Boolean);
    if (!tests.length) continue;
    out = out.filter((row) => tests.some((fn) => fn(row)));
  }
  return out;
}

/**
 * How many rows each chip would leave, counted inside the pool the OTHER
 * groups already narrowed and IGNORING its own group's other chips. That is
 * what lets a chip carry its own number, grey itself out instead of leading
 * to an empty list, and keep the number still while it is tapped.
 */
export function mountainFacetCounts(pool, state) {
  const out = new Map();
  if (!pool) return out;
  for (const group of MOUNTAIN_FACETS) {
    const others = { ...(state || {}), [group.key]: [] };
    const base = applyMountainFacets(pool, others);
    for (const option of group.options) {
      out.set(`${group.key}:${option.key}`, base.filter(option.test).length);
    }
  }
  return out;
}

/** The one line a country whose floor could not be reached earns, composed
 *  from the code index.json ships rather than stored as prose. Brief 05's
 *  lead: the layer is honest about the floor internally and invisible about
 *  it to a reader, who just sees four Lithuanian mountains. */
export function floorNote(index, cc, t, countryName) {
  const entry = index?.floor?.unreachable?.[cc];
  if (!entry) return '';
  const key = `mtn.floor${cap(entry.k)}`;
  const line = t(key, { country: countryName || cc, n: entry.have });
  return line && line !== key ? line : '';
}
