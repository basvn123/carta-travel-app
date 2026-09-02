/**
 * lakeStory.js, the lake explained to a traveller rather than to a scorer.
 *
 * pipeline/lakes ships every water body with a `why` array of reason codes,
 * not with prose:
 *
 *   [{k: 'kindTarn'}, {k: 'mountains'}, {k: 'swimLimited', src: 'curated'},
 *    {k: 'season', from: 'jul', to: 'aug', n: 2, peak: 16.4},
 *    {k: 'nationalPark', name: 'Triglav'}]
 *
 * and this file turns that into sentences through t(), which buys three
 * things a written description in the wire could not have. The text lands in
 * all six UI languages. Every sentence on the page maps to exactly one field
 * in the data, so nothing can be on screen that no source put there. And the
 * wire stays small enough to load a whole country at once.
 *
 * Same arrangement as lib/beachStory.js and lib/trailStory.js, for the same
 * reason: composed copy belongs in the app, where it can be translated, not in
 * a JSON file written once in English.
 *
 * The order of the sentences is the order the pipeline emitted them in, which
 * is narrative order: what it is, how big, what stands around it, the water,
 * whether you may swim and when, what is protected, what there is to do, how
 * you get there, what is on the shore, and what it is known for.
 *
 * Hazards are deliberately NOT part of that paragraph. They come out of the
 * wire in their own `hazards` array and render in their own block, because a
 * cold shock warning that got trimmed off the end of a paragraph is a warning
 * that was not given.
 */

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

// Reason code -> i18n key. A function where the code carries a variant that
// deserves its own sentence rather than an interpolated word.
// The kind* codes are deliberately absent: lakeWhy() skips them, because the
// opening line has already said what kind of water this is and the sentence
// would follow it with "It is a lake." They still earn a chip through TAG_KEY.
const WHY_KEY = {
  // The listed tier's one honest line: shipped by the region
  // programme's floor fill, never by a scored row.
  unrated_coverage: 'region.listedNote',
  // "Draw the map instead", the photo engine's code for a row with no
  // publishable picture. Same key the mountain layer renders.
  no_photo_map_card: 'photo.mapCard',
  area: 'lake.whyArea',
  depth: 'lake.whyDepth',
  elevation: 'lake.whyElevation',
  mountains: 'lake.whyMountains',
  glacier: 'lake.whyGlacier',
  cliffs: 'lake.whyCliffs',
  waterfall: 'lake.whyWaterfall',
  islands: 'lake.whyIslands',
  forest: 'lake.whyForest',
  castle: 'lake.whyCastle',
  church: 'lake.whyChurch',
  waterExcellent: 'lake.whyWaterExcellent',
  waterGood: 'lake.whyWaterGood',
  waterSufficient: 'lake.whyWaterSufficient',
  waterPoor: 'lake.whyWaterPoor',
  turquoise: 'lake.whyTurquoise',
  clearWater: 'lake.whyClearWater',
  // The swimming verdict names its own evidence, so the sentence can say
  // "the park forbids it" rather than the flat "you cannot swim here" that
  // reads as an opinion.
  swimYes: (r) => `lake.whySwimYes${cap(r.src)}`,
  swimLimited: (r) => `lake.whySwimLimited${cap(r.src)}`,
  swimNo: (r) => `lake.whySwimNo${cap(r.src)}`,
  swimUnknown: 'lake.whySwimUnknown',
  designated: 'lake.whyDesignated',
  season: 'lake.whySeason',
  neverWarm: 'lake.whyNeverWarm',
  shoreBeach: 'lake.whyShoreBeach',
  lido: 'lake.whyLido',
  nationalPark: 'lake.whyNationalPark',
  reserve: 'lake.whyReserve',
  unesco: 'lake.whyUnesco',
  activities: 'lake.whyActivities',
  shoreWalk: 'lake.whyShoreWalk',
  // Shore access, new in lake_index_v2. The two are opposites and only one of
  // them is ever true of a lake: there is a way along the water, or the ways
  // that touch it say private.
  shorePath: 'lake.whyShorePath',
  shoreLaunch: 'lake.whyShoreLaunch',
  privateShore: 'lake.whyPrivateShore',
  hikeIn: 'lake.whyHikeIn',
  roadAccess: 'lake.whyRoadAccess',
  cableCar: 'lake.whyCableCar',
  undeveloped: 'lake.whyUndeveloped',
  resortShore: 'lake.whyResortShore',
  services: 'lake.whyServices',
  wikiFame: 'lake.whyWikiFame',
  photographed: 'lake.whyPhotographed',
  shared: 'lake.whyShared',
};

// Short chip labels, for the card and the top of the page.
const TAG_KEY = {
  swimNo: 'lake.tagNoSwimming',
  turquoise: 'lake.tagTurquoise',
  kindGeothermal: 'lake.tagThermal',
  kindCrater: 'lake.tagCrater',
  kindTarn: 'lake.tagTarn',
  kindReservoir: 'lake.tagReservoir',
  kindLagoon: 'lake.tagLagoon',
  kindRiver: 'lake.tagRiver',
  glacier: 'lake.tagGlacier',
  mountains: 'lake.tagMountains',
  islands: 'lake.tagIslands',
  nationalPark: 'lake.tagNationalPark',
  unesco: 'lake.tagUnesco',
  waterfall: 'lake.tagWaterfall',
  cliffs: 'lake.tagCliffs',
  castle: 'lake.tagCastle',
  undeveloped: 'lake.tagUndeveloped',
  waterExcellent: 'lake.tagWaterExcellent',
  lido: 'lake.tagLido',
  shoreBeach: 'lake.tagBeach',
  designated: 'lake.tagDesignated',
  activities: 'lake.tagWatersports',
  shoreWalk: 'lake.tagShoreWalk',
  shorePath: 'lake.tagShorePath',
  privateShore: 'lake.tagPrivateShore',
  hikeIn: 'lake.tagHikeIn',
  forest: 'lake.tagForest',
  area: 'lake.tagBigLake',
  depth: 'lake.tagDeep',
};

const SERVICE_KEY = {
  parking: 'lake.svcParking',
  toilets: 'lake.svcToilets',
  food: 'lake.svcFood',
  camping: 'lake.svcCamping',
  boatRental: 'lake.svcBoatRental',
  ferry: 'lake.svcFerry',
  lido: 'lake.svcLido',
  sauna: 'lake.svcSauna',
};

const DOING_KEY = {
  kayak: 'lake.doKayak',
  sail: 'lake.doSail',
  dive: 'lake.doDive',
  fish: 'lake.doFish',
  boat: 'lake.doBoat',
  windsurf: 'lake.doWindsurf',
};

/** "kayaks, sailing and boat trips", in the reading language. */
function joinList(list, map, t) {
  const names = String(list || '')
    .split(',')
    .map((s) => map[s.trim()])
    .filter(Boolean)
    .map((key) => t(key));
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} ${t('lake.and')} ${names[names.length - 1]}`;
}

function keyFor(map, reason) {
  const entry = map[reason.k];
  return typeof entry === 'function' ? entry(reason) : entry;
}

/** A month code from the wire ("jun") as a word in the reading language. */
export function monthWord(code, t) {
  return code ? t(`lake.month${cap(code)}`) : '';
}

/**
 * The opening line: what this water body is and where it is. Composed rather
 * than taken from a reason so it always exists, even for a lake whose only
 * signal was its size.
 */
export function lakeHeadline(lake, t, countryName) {
  const kind = t(`lake.kindWord${cap(lake.kind || 'lake')}`);
  const place = lake.region || (lake.base && lake.base.city) || countryName || '';
  if (!place) return t('lake.headKind', { name: lake.name, kind });
  return t('lake.headKindPlace', { name: lake.name, kind, place });
}

/**
 * Every sentence the data supports, in reading order. `max` caps how many go
 * on a card; the page passes no cap and shows the lot.
 */
export function lakeWhy(lake, t, max) {
  const out = [];
  for (const reason of lake.why || []) {
    // The opening line already said what kind of water this is, so the bare
    // kind reason would follow it with "It is a lake."
    if (String(reason.k || '').startsWith('kind')) continue;
    const key = keyFor(WHY_KEY, reason);
    if (!key) continue;
    const params = { ...reason };
    if (reason.k === 'services') params.list = joinList(reason.list, SERVICE_KEY, t);
    if (reason.k === 'activities') params.list = joinList(reason.list, DOING_KEY, t);
    if (reason.k === 'season') {
      params.from = monthWord(reason.from, t);
      params.to = monthWord(reason.to, t);
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
 *  that say the most about this lake. */
export function lakeTags(lake, t, max = 3) {
  const byCode = new Map((lake.why || []).map((r) => [r.k, r]));
  const out = [];
  for (const code of lake.tags || []) {
    const key = keyFor(TAG_KEY, byCode.get(code) || { k: code });
    if (!key) continue;
    const label = t(key, byCode.get(code) || {});
    if (!label || label === key) continue;
    out.push({ code, label });
    if (out.length >= max) break;
  }
  return out;
}

/**
 * The swimming verdict as a badge: the word, the explanation of where the
 * word came from, and a tone the UI colours by.
 *
 * `unknown` is a real answer here and renders as one. The alternative, saying
 * nothing when no rule was found, reads on a page about beautiful water as
 * permission, and this layer will not do that.
 */
const SWIM_TONE = { yes: 'ok', limited: 'warn', no: 'stop', unknown: 'unknown' };

export function lakeSwim(lake, t) {
  const rule = (lake.swim && lake.swim.rule) || 'unknown';
  const src = (lake.swim && lake.swim.src) || '';
  const srcKey = `lake.swimSrc${cap(src)}`;
  const srcLine = src ? t(srcKey) : '';
  return {
    rule,
    tone: SWIM_TONE[rule] || 'unknown',
    label: t(`lake.swim${cap(rule)}`),
    source: srcLine && srcLine !== srcKey ? srcLine : '',
  };
}

/** The estimated swimming season as one line, always carrying the word that
 *  says it is an estimate. */
export function lakeSeason(lake, t) {
  const season = lake.swim && lake.swim.season;
  if (!season) return '';
  return t('lake.seasonLine', {
    from: monthWord(season.from, t),
    to: monthWord(season.to, t),
    n: season.n,
    peak: Math.round(season.peak),
  });
}

/** Hazards as sentences, in the order the pipeline ranked them. */
export function lakeHazards(lake, t) {
  return (lake.hazards || [])
    .map((code) => {
      const key = `lake.haz${code.split('_').map(cap).join('')}`;
      const line = t(key);
      return line && line !== key ? { code, line } : null;
    })
    .filter(Boolean);
}

export function bestForLabel(code, t) {
  return t(`lake.for${cap(code)}`);
}

export function componentLabel(code, t) {
  return t(`lake.comp${cap(code)}`);
}

export function serviceLabel(code, t) {
  const key = SERVICE_KEY[code];
  return key ? t(key) : '';
}

export function accessLabel(code, t) {
  return code ? t(`lake.access${cap(code)}`) : '';
}

/** The order the score breakdown is read in: the components that decide the
 *  most first, which is also the order of their weights. `photo` and `shore`
 *  are lake_index_v2's two new terms and sit at the end because they weigh
 *  the least; a v1 row simply has no bar for them. */
export const COMPONENT_ORDER = ['scenery', 'swimming', 'acclaim', 'activity',
  'water', 'wildness', 'photo', 'shore'];

/** The three the page shows as headline figures, above the breakdown. */
export const SUB_ORDER = ['scenery', 'swimming', 'activity'];

/** Score band, for the colour of the chip. Mirrors the cutoffs the pipeline
 *  published in the wire meta (lake_index.TIER_CUTOFFS); the lake's own
 *  `tier` is authoritative and this is only the fallback. */
export function lakeTier(lake) {
  if (lake.tier != null) return lake.tier;
  const s = lake.score || 0;
  if (s >= 8.5) return 3;
  if (s >= 7.5) return 2;
  if (s >= 6.3) return 1;
  return 0;
}

/** The rating shape the app's RatingBadge already speaks. */
export function lakeRating(lake, t) {
  const tier = lakeTier(lake);
  return {
    score: lake.score,
    tier,
    label: t(`lake.band${tier}`),
  };
}

/** True for a lake that scores well above what its fame predicts. The
 *  pipeline publishes the residual as `gem`; 0.5 is "exactly as good as its
 *  reputation", so the threshold is a real margin above that. */
export const GEM_CUTOFF = 0.62;

export function isHiddenGem(lake) {
  return (lake.gem || 0) >= GEM_CUTOFF;
}

/* ---------------------------------------------------------------------------
 * Filters
 *
 * Nine groups, from brief 04 section 4, in the same shape MOUNTAIN_FACETS
 * uses: a group key, a label, and options that each carry a predicate over
 * one wire row. Inside a group the options are an OR (a lake is Excellent or
 * Good); between groups they are an AND (Excellent water AND a shore path),
 * which is what people mean when they tick two boxes in different rows.
 *
 * Swimming leads, for the same reason the swimming verdict rides on every
 * card: a list that promises beautiful water has to be able to show only the
 * water you may get into.
 *
 * Two of the brief's rows are narrower here than the brief wrote them, and
 * both narrowings are about not inventing a reading:
 *
 *   Setting     the brief asks for Mountain / Forest / Moorland / Lowland /
 *               Urban / Island from "scenery inputs + WorldCover". WorldCover
 *               is not joined to this layer, so the five that the scenery
 *               inputs really do evidence are offered and Moorland is not.
 *               A chip nothing can ever match is worse than a missing one.
 *   Protected   Natura 2000 and Emerald polygons are not ingested for lakes
 *               (the protected-area cache holds OSM centroids). The three
 *               levels that cache does support are offered instead, and the
 *               chip says what it means.
 *
 * The same rule the beach layer keeps: never render a chip with a zero count.
 * The counting below is what lets the caller do that.
 * ------------------------------------------------------------------------ */

const whyOf = (l, k) => (l.why || []).find((w) => w.k === k);
const hasWhy = (l, k) => !!whyOf(l, k);
const hasTag = (l, k) => (l.tags || []).includes(k);

/** Which of the six doings a lake carries, from the `activities` reason's
 *  comma separated list parameter. */
export function lakeDoings(lake) {
  const row = whyOf(lake, 'activities');
  return new Set(String(row?.list || '').split(',').filter(Boolean));
}

/** The month numbers (1..12) whose estimated water temperature reaches the
 *  model's warm threshold. Absent for a lake with no climate sample, which
 *  is the honest answer rather than "no good months". */
export function lakeWarmMonths(lake, warmC = 18) {
  const temps = lake.swim?.temps;
  if (!Array.isArray(temps) || temps.length !== 12) return [];
  const out = [];
  for (let i = 0; i < 12; i += 1) if (temps[i] >= warmC) out.push(i + 1);
  return out;
}

const MONTH_CODES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const SIZE_BANDS = [
  { key: 'pond', test: (l) => (l.size?.areaKm2 ?? 0) > 0
    && l.size.areaKm2 < 0.1 },
  { key: 'lake', test: (l) => (l.size?.areaKm2 ?? 0) >= 0.1
    && l.size.areaKm2 <= 10 },
  { key: 'large', test: (l) => (l.size?.areaKm2 ?? 0) > 10 },
];

export const LAKE_FACETS = [
  {
    key: 'swim',
    labelKey: 'lake.filterSwim',
    toolbar: true,
    options: [
      { key: 'yes', labelKey: 'lake.swimYes' },
      { key: 'limited', labelKey: 'lake.swimLimited' },
      { key: 'no', labelKey: 'lake.swimNo' },
      { key: 'unknown', labelKey: 'lake.swimUnknown' },
    ].map((o) => ({ ...o, test: (l) => l.swim?.rule === o.key })),
  },
  {
    key: 'water',
    labelKey: 'lake.filterWater',
    options: [
      { key: 'excellent', labelKey: 'lake.waterExcellent',
        test: (l) => l.water?.class === 'Excellent' },
      { key: 'good', labelKey: 'lake.waterGood',
        test: (l) => l.water?.class === 'Good' },
      { key: 'sufficient', labelKey: 'lake.waterSufficient',
        test: (l) => l.water?.class === 'Sufficient' },
      { key: 'unrated', labelKey: 'lake.waterUnrated',
        test: (l) => !l.water?.class },
    ],
  },
  {
    key: 'setting',
    labelKey: 'lake.filterSetting',
    options: [
      { key: 'mountain', labelKey: 'lake.setMountain',
        test: (l) => hasTag(l, 'mountains') || hasWhy(l, 'mountains')
          || (l.size?.elevM ?? 0) >= 800 },
      { key: 'forest', labelKey: 'lake.setForest',
        test: (l) => hasWhy(l, 'forest') },
      { key: 'island', labelKey: 'lake.setIsland',
        test: (l) => hasWhy(l, 'islands') },
      { key: 'urban', labelKey: 'lake.setUrban',
        test: (l) => hasWhy(l, 'resortShore') },
      { key: 'lowland', labelKey: 'lake.setLowland',
        test: (l) => (l.size?.elevM ?? 999) < 200 && !hasWhy(l, 'mountains') },
    ],
  },
  {
    key: 'size',
    labelKey: 'lake.filterSize',
    options: SIZE_BANDS.map((b) => ({
      key: b.key, labelKey: `lake.size${cap(b.key)}`, test: b.test,
    })),
  },
  {
    key: 'doing',
    labelKey: 'lake.filterActivity',
    options: [
      ...['kayak', 'sail', 'dive', 'boat', 'fish'].map((code) => ({
        key: code,
        labelKey: DOING_KEY[code],
        test: (l) => lakeDoings(l).has(code),
      })),
      { key: 'walk', labelKey: 'lake.doShorePath',
        test: (l) => hasWhy(l, 'shoreWalk') || hasWhy(l, 'shorePath') },
    ],
  },
  {
    key: 'shore',
    labelKey: 'lake.filterShore',
    options: [
      { key: 'path', labelKey: 'lake.shorePublicPath',
        test: (l) => hasWhy(l, 'shorePath') },
      { key: 'beach', labelKey: 'lake.shoreBeach',
        test: (l) => hasWhy(l, 'shoreBeach') || hasTag(l, 'shoreBeach') },
      { key: 'limited', labelKey: 'lake.shoreLimited',
        test: (l) => hasWhy(l, 'privateShore') },
    ],
  },
  {
    key: 'wild',
    labelKey: 'lake.filterWildness',
    options: [
      { key: 'wild', labelKey: 'lake.wildWild',
        test: (l) => (l.comp?.wildness ?? 0) >= 0.85 },
      { key: 'quiet', labelKey: 'lake.wildQuiet',
        test: (l) => (l.comp?.wildness ?? 0) >= 0.55
          && (l.comp?.wildness ?? 0) < 0.85 },
      { key: 'developed', labelKey: 'lake.wildDeveloped',
        test: (l) => (l.comp?.wildness ?? 1) < 0.55 },
    ],
  },
  {
    key: 'month',
    labelKey: 'lake.filterSeason',
    options: MONTH_CODES.map((code, i) => ({
      key: code.toLowerCase(),
      labelKey: `lake.mon${code}`,
      test: (l) => lakeWarmMonths(l).includes(i + 1),
    })),
  },
  {
    key: 'prot',
    labelKey: 'lake.filterProtected',
    options: [
      { key: 'np', labelKey: 'lake.protNationalPark',
        test: (l) => !!l.protected?.np },
      { key: 'reserve', labelKey: 'lake.protReserve',
        test: (l) => !!l.protected?.name && !l.protected?.np },
      { key: 'unesco', labelKey: 'lake.protUnesco',
        test: (l) => hasTag(l, 'unesco') || hasWhy(l, 'unesco') },
    ],
  },
];

/** Rows that satisfy every group with a selection (OR inside a group). */
export function applyLakeFacets(rows, state) {
  let out = rows || [];
  for (const group of LAKE_FACETS) {
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
export function lakeFacetCounts(pool, state) {
  const out = new Map();
  if (!pool) return out;
  for (const group of LAKE_FACETS) {
    const others = { ...(state || {}), [group.key]: [] };
    const base = applyLakeFacets(pool, others);
    for (const option of group.options) {
      out.set(`${group.key}:${option.key}`, base.filter(option.test).length);
    }
  }
  return out;
}
