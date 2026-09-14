/**
 * beachStory.js, the beach explained to a traveller rather than to a scorer.
 *
 * pipeline/beaches ships every beach with a `why` array of reason codes, not
 * with prose:
 *
 *   [{k: 'cliffs'}, {k: 'waterExcellent'}, {k: 'boatOnly'},
 *    {k: 'nationalPark', name: 'Parco Nazionale del Gennargentu'}]
 *
 * and this file turns that into sentences through t(), which buys three
 * things a written description in the wire could not have. The text lands in
 * all six UI languages. Every sentence on the page maps to exactly one field
 * in the data, so nothing can be on screen that no source put there. And the
 * wire stays small enough to load a whole country at once.
 *
 * It is the same arrangement lib/trailStory.js uses for hikes, for the same
 * reason: composed copy belongs in the app, where it can be translated, not
 * in a JSON file written once in English.
 *
 * The order of the sentences is the order the pipeline emitted them in, which
 * is narrative order: what the beach is made of, what stands around it, the
 * water, whether it is protected, how you get there, what is on it, and what
 * it is known for.
 */

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

// Reason code -> i18n key. A function where the code carries a variant that
// deserves its own sentence rather than an interpolated word: "the sand is
// white" and "the sand is black volcanic" are not the same sentence in any
// language, and translating a bare adjective produces the wrong gender in
// half of them.
const WHY_KEY = {
  // The listed tier's one honest line: shipped by the region
  // programme's floor fill, never by a scored row.
  unrated_coverage: 'region.listedNote',
  sandColour: (r) => `beach.whySand${cap(r.colour)}`,
  surface: (r) => `beach.whySurface${cap(r.surface)}`,
  cliffs: 'beach.whyCliffs',
  dunes: 'beach.whyDunes',
  pines: 'beach.whyPines',
  lagoon: 'beach.whyLagoon',
  cave: 'beach.whyCave',
  arch: 'beach.whyArch',
  lighthouse: 'beach.whyLighthouse',
  shipwreck: 'beach.whyShipwreck',
  waterExcellent: 'beach.whyWaterExcellent',
  waterGood: 'beach.whyWaterGood',
  waterSufficient: 'beach.whyWaterSufficient',
  waterPoor: 'beach.whyWaterPoor',
  turquoise: 'beach.whyTurquoise',
  clearWater: 'beach.whyClearWater',
  shallow: 'beach.whyShallow',
  nationalPark: 'beach.whyNationalPark',
  reserve: 'beach.whyReserve',
  turtles: 'beach.whyTurtles',
  boatOnly: 'beach.whyBoatOnly',
  steps: 'beach.whySteps',
  hikeIn: 'beach.whyHikeIn',
  undeveloped: 'beach.whyUndeveloped',
  resortStrip: 'beach.whyResortStrip',
  quiet: 'beach.whyQuiet',
  services: 'beach.whyServices',
  lifeguard: 'beach.whyLifeguard',
  nudist: 'beach.whyNudist',
  wheelchair: 'beach.whyWheelchair',
  wikiFame: 'beach.whyWikiFame',
  photographed: 'beach.whyPhotographed',
  blueFlag: 'beach.whyBlueFlag',
  snorkel: 'beach.whySnorkel',
  surf: 'beach.whySurf',
  length: 'beach.whyLength',
  // beach_beauty_v2. The pipeline spells these in snake_case because
  // 03-BEACHES.md names them that way and because unrated_coverage, which
  // arrived with the region programme, already reads like this.
  sunset_facing: 'beach.whySunsetFacing',
  long_strand: 'beach.whyLongStrand',
  pocket_cove: 'beach.whyPocketCove',
  water_unknown_no_source: 'beach.whyWaterUnknownNoSource',
  natura2000: 'beach.whyNatura2000',
  emerald: 'beach.whyEmerald',
  // A listed row with no publishable photograph. The card draws itself from
  // the map instead, and this is the line under it.
  no_photo_map_card: 'beach.whyNoPhotoMapCard',
};

// Short chip labels, for the card and the top of the page.
const TAG_KEY = {
  sandColour: (r) => `beach.tagSand${cap(r.colour)}`,
  cliffs: 'beach.tagCliffs',
  dunes: 'beach.tagDunes',
  pines: 'beach.tagPines',
  lagoon: 'beach.tagLagoon',
  cave: 'beach.tagCave',
  arch: 'beach.tagArch',
  shipwreck: 'beach.tagShipwreck',
  turquoise: 'beach.tagTurquoise',
  clearWater: 'beach.tagClearWater',
  shallow: 'beach.tagShallow',
  waterExcellent: 'beach.tagWaterExcellent',
  nationalPark: 'beach.tagNationalPark',
  reserve: 'beach.tagReserve',
  turtles: 'beach.tagTurtles',
  boatOnly: 'beach.tagBoatOnly',
  steps: 'beach.tagSteps',
  hikeIn: 'beach.tagHikeIn',
  undeveloped: 'beach.tagUndeveloped',
  quiet: 'beach.tagQuiet',
  lifeguard: 'beach.tagLifeguard',
  nudist: 'beach.tagNudist',
  blueFlag: 'beach.tagBlueFlag',
  snorkel: 'beach.tagSnorkel',
  surf: 'beach.tagSurf',
  sunset_facing: 'beach.tagSunsetFacing',
  long_strand: 'beach.tagLongStrand',
  pocket_cove: 'beach.tagPocketCove',
  natura2000: 'beach.tagNatura2000',
  emerald: 'beach.tagEmerald',
};

const SERVICE_KEY = {
  parking: 'beach.svcParking',
  toilets: 'beach.svcToilets',
  showers: 'beach.svcShowers',
  water: 'beach.svcWater',
  food: 'beach.svcFood',
  camping: 'beach.svcCamping',
};

/** "parking, toilets and food", in the reading language. */
function serviceList(list, t) {
  const names = String(list || '')
    .split(',')
    .map((s) => SERVICE_KEY[s.trim()])
    .filter(Boolean)
    .map((key) => t(key));
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} ${t('beach.and')} ${names[names.length - 1]}`;
}

function keyFor(map, reason) {
  const entry = map[reason.k];
  return typeof entry === 'function' ? entry(reason) : entry;
}

/**
 * The opening line: what this beach is and where it is. Composed rather than
 * taken from a reason so it always exists, even for a beach whose only signal
 * was its water class.
 */
export function beachHeadline(beach, t, countryName) {
  const surface = beach.surface ? t(`beach.surfaceWord${cap(beach.surface)}`) : '';
  const place = beach.region || (beach.base && beach.base.city) || countryName || '';
  // Nothing to say beyond the name, which the heading above has already
  // said. An empty lede is better than a sentence that only repeats it.
  if (!surface && !place) return '';
  const key = surface
    ? (place ? 'beach.headSurfacePlace' : 'beach.headSurface')
    : 'beach.headPlace';
  return t(key, { name: beach.name, surface, place });
}

/**
 * Every sentence the data supports, in reading order. `max` caps how many go
 * on a card; the page passes no cap and shows the lot.
 */
export function beachWhy(beach, t, max) {
  const out = [];
  for (const reason of beach.why || []) {
    // The opening line already said "is a sand beach", so the bare surface
    // reason would follow it with "It is a sand beach." A COLOURED surface
    // still earns its sentence: "sand beach" and "its sand is white" are two
    // different things to know.
    if (reason.k === 'surface' && beach.surface) continue;
    const key = keyFor(WHY_KEY, reason);
    if (!key) continue;
    const params = { ...reason };
    let sentence = key;
    if (reason.k === 'services') {
      params.list = serviceList(reason.list, t);
      // One service is not "there are". English needs the singular verb and
      // Italian needs a different one again, so the count picks the key
      // rather than the code trying to conjugate.
      if (Number(reason.n) === 1) sentence = 'beach.whyServices1';
    }
    const line = t(sentence, params);
    // A key with no catalogue entry falls back to the key itself, which must
    // never reach the page as a sentence.
    if (!line || line === sentence) continue;
    out.push(line);
    if (max && out.length >= max) break;
  }
  return out;
}

/** Chip labels for the card, already filtered by the pipeline to the four
 *  that say the most about this beach. */
export function beachTags(beach, t, max = 3) {
  const byCode = new Map((beach.why || []).map((r) => [r.k, r]));
  const out = [];
  for (const code of beach.tags || []) {
    const key = keyFor(TAG_KEY, byCode.get(code) || { k: code });
    if (!key) continue;
    const label = t(key, byCode.get(code) || {});
    if (!label || label === key) continue;
    out.push({ code, label });
    if (out.length >= max) break;
  }
  return out;
}

export function bestForLabel(code, t) {
  return t(`beach.for${cap(code)}`);
}

export function componentLabel(code, t) {
  return t(`beach.comp${cap(code)}`);
}

/** The order the score breakdown is read in: the components that decide the
 *  most first, which is also the order of their weights.
 *
 *  A component the pipeline could not measure is ABSENT from `comp` rather
 *  than zero, so the page filters this list against the row and a Norwegian
 *  beach simply shows seven bars instead of eight. That is the visible face
 *  of drop-and-renormalise: a bar nobody earned is never drawn. */
export const COMPONENT_ORDER = ['setting', 'acclaim', 'water', 'sand',
  'wildness', 'comfort', 'space', 'photo'];

/** The weight each component carried, straight from the wire's model block,
 *  so the breakdown can show what the number is made of rather than only
 *  what it scored. Falls back to nothing when the index has not loaded. */
export function componentWeights(model) {
  const weights = model && model.weights;
  if (!weights || typeof weights !== 'object') return null;
  return weights;
}

/** Whether this row is the listed tier: exists, named, deduped, not scored.
 *  The test is the ABSENCE of a score rather than the presence of a flag,
 *  because absence is what the export guarantees. */
export function isListed(beach) {
  return !!beach && beach.t === 'l';
}

/** The facet rail's labels, for a group key and an option key. Kept here so
 *  the pipeline's facet vocabulary has exactly one translation table. */
export function facetGroupLabel(group, t) {
  return t(`beach.facet${cap(group)}`);
}

export function facetOptionLabel(group, option, t) {
  return t(`beach.f${cap(group)}${cap(option)}`);
}

/** Score band, for the colour of the chip. Mirrors the cutoffs the pipeline
 *  published in the wire meta (beauty_index.TIER_CUTOFFS); the beach's own
 *  `tier` is authoritative and this is only the fallback. */
export function beachTier(beach) {
  if (beach.tier != null) return beach.tier;
  const s = beach.score || 0;
  if (s >= 8.6) return 3;
  if (s >= 7.6) return 2;
  if (s >= 6.4) return 1;
  return 0;
}

/** The rating shape the app's RatingBadge already speaks. */
export function beachRating(beach, t) {
  const tier = beachTier(beach);
  return {
    score: beach.score,
    tier,
    label: t(`beach.band${tier}`),
  };
}


/* ---------------------------------------------------------------------------
 * The filter rail
 *
 * 03-BEACHES.md section 4. What shipped was three chips, and two of them read
 * zero in every scope: "Excellent water 2", "Nothing built on it 0",
 * "Lifeguard 0". A filter that shows a zero tells the reader the filters are
 * broken even when they are honest, and three filters over a catalogue with
 * this many fields was leaving most of them unreachable.
 *
 * Nine groups now, every one backed by a field beach_beauty_v2 actually
 * publishes. Grouped in the same shape as LAKE_FACETS and MOUNTAIN_FACETS so
 * the three natural-feature tabs share one mental model, with one rule of its
 * own that the brief is explicit about and that the other two do not follow:
 *
 *   A CHIP WHOSE COUNT IS ZERO IN THE CURRENT SCOPE IS NOT RENDERED.
 *
 * Not greyed out. Absent. A disabled control still occupies the rail and
 * still reads as something that ought to work; an absent one reads as a
 * filter that does not apply here, which is the truth.
 *
 * `toolbar` picks the one group short enough for the row under the search
 * field. Water quality, because that is what a beach list is asked for first.
 * ------------------------------------------------------------------------- */

const whyHas = (b, k) => (b.why || []).some((w) => w.k === k);
const tagHas = (b, k) => (b.tags || []).includes(k);

export const BEACH_FACETS = [
  {
    key: 'water',
    labelKey: 'beach.facetWater',
    toolbar: true,
    options: [
      { key: 'excellent', labelKey: 'beach.fWaterExcellent',
        test: (b) => b.water?.class === 'Excellent' },
      { key: 'good', labelKey: 'beach.fWaterGood',
        test: (b) => b.water?.class === 'Good' },
      { key: 'sufficient', labelKey: 'beach.fWaterSufficient',
        test: (b) => b.water?.class === 'Sufficient' },
      // A real answer, not a gap. No authority publishes a bathing class for
      // Norway, Iceland or Great Britain, so the pipeline drops the water
      // component there rather than inventing one, and a reader filtering
      // for it is asking a legitimate question.
      { key: 'unrated', labelKey: 'beach.fWaterUnrated',
        test: (b) => !b.water?.class },
    ],
  },
  {
    key: 'substrate',
    labelKey: 'beach.facetSubstrate',
    options: [
      { key: 'sand', labelKey: 'beach.fSubstrateSand',
        test: (b) => b.surface === 'sand' },
      { key: 'pebble', labelKey: 'beach.fSubstratePebble',
        test: (b) => ['pebble', 'gravel', 'fineGravel'].includes(b.surface) },
      { key: 'shingle', labelKey: 'beach.fSubstrateShingle',
        test: (b) => b.surface === 'shingle' },
      { key: 'rock', labelKey: 'beach.fSubstrateRock',
        test: (b) => b.surface === 'rock' },
    ],
  },
  {
    key: 'setting',
    labelKey: 'beach.facetSetting',
    options: [
      { key: 'cliffs', labelKey: 'beach.fSettingCliffs',
        test: (b) => whyHas(b, 'cliffs') },
      { key: 'dunes', labelKey: 'beach.fSettingDunes',
        test: (b) => whyHas(b, 'dunes') },
      { key: 'pines', labelKey: 'beach.fSettingPines',
        test: (b) => whyHas(b, 'pines') },
      { key: 'lagoon', labelKey: 'beach.fSettingLagoon',
        test: (b) => whyHas(b, 'lagoon') },
      { key: 'park', labelKey: 'beach.fSettingPark',
        test: (b) => whyHas(b, 'nationalPark') || whyHas(b, 'reserve') },
    ],
  },
  {
    key: 'wildness',
    labelKey: 'beach.facetWildness',
    options: [
      { key: 'wild', labelKey: 'beach.fWildnessWild',
        test: (b) => tagHas(b, 'undeveloped') || whyHas(b, 'undeveloped') },
      { key: 'quiet', labelKey: 'beach.fWildnessQuiet',
        test: (b) => whyHas(b, 'quiet') },
      { key: 'developed', labelKey: 'beach.fWildnessDeveloped',
        test: (b) => whyHas(b, 'resortStrip') },
    ],
  },
  {
    key: 'size',
    labelKey: 'beach.facetSize',
    // From the beach's own geometry, which is what the v2 `space` component
    // reads. Nothing in v1 could tell a four kilometre strand from a sixty
    // metre cove, and they are different products.
    options: [
      { key: 'cove', labelKey: 'beach.fSizeCove', test: (b) => b.size === 'cove' },
      { key: 'beach', labelKey: 'beach.fSizeBeach', test: (b) => b.size === 'beach' },
      { key: 'strand', labelKey: 'beach.fSizeStrand', test: (b) => b.size === 'strand' },
    ],
  },
  {
    key: 'facilities',
    labelKey: 'beach.facetFacilities',
    // Each its own chip, per the brief: "parking" and "a lifeguard" are not
    // one question, and a single Facilities chip could not answer either.
    options: [
      { key: 'parking', labelKey: 'beach.fFacilitiesParking',
        test: (b) => (b.services || []).includes('parking') },
      { key: 'toilets', labelKey: 'beach.fFacilitiesToilets',
        test: (b) => (b.services || []).includes('toilets') },
      { key: 'food', labelKey: 'beach.fFacilitiesFood',
        test: (b) => (b.services || []).includes('food') },
      { key: 'stepfree', labelKey: 'beach.fFacilitiesStepfree',
        test: (b) => !!b.wheelchair },
      { key: 'lifeguard', labelKey: 'beach.fFacilitiesLifeguard',
        test: (b) => !!b.lifeguard },
    ],
  },
  {
    key: 'naturist',
    labelKey: 'beach.facetNaturist',
    // OSM spells it `naturism` and `nudism` is the older key. The pipeline
    // reads both, so by the time it is here there is one field.
    options: [
      { key: 'yes', labelKey: 'beach.fNaturistYes', test: (b) => !!b.nudism },
    ],
  },
  {
    key: 'protected',
    labelKey: 'beach.facetProtected',
    // Natura 2000 is the EU half and the Emerald Network is its non-EU twin,
    // so this chip works in Norway and the Balkans instead of stopping at the
    // EU border. Both are proved from polygons, not from a centroid.
    options: [
      { key: 'natura2000', labelKey: 'beach.fProtectedNatura2000',
        test: (b) => b.prot?.net === 'natura2000' },
      { key: 'emerald', labelKey: 'beach.fProtectedEmerald',
        test: (b) => b.prot?.net === 'emerald' },
      { key: 'national', labelKey: 'beach.fProtectedNational',
        test: (b) => !!b.protected?.np },
    ],
  },
  {
    key: 'bestfor',
    labelKey: 'beach.facetBestfor',
    options: [
      { key: 'swimming', labelKey: 'beach.fBestforSwimming',
        test: (b) => (b.bestFor || []).includes('swimming') },
      { key: 'sunset', labelKey: 'beach.fBestforSunset',
        test: (b) => !!b.sunset || (b.bestFor || []).includes('sunset') },
      { key: 'walking', labelKey: 'beach.fBestforWalking',
        test: (b) => (b.bestFor || []).includes('walkers') },
      { key: 'surf', labelKey: 'beach.fBestforSurf',
        test: (b) => (b.bestFor || []).includes('surfing') },
    ],
  },
];

/** Rows that satisfy every group with a selection (OR inside a group). */
export function applyBeachFacets(rows, state) {
  let out = rows || [];
  for (const group of BEACH_FACETS) {
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
 * what lets a chip carry a number that is true of what tapping it would do,
 * and what keeps the number still while it is tapped.
 */
export function beachFacetCounts(pool, state) {
  const out = new Map();
  if (!pool) return out;
  for (const group of BEACH_FACETS) {
    const others = { ...(state || {}), [group.key]: [] };
    const base = applyBeachFacets(pool, others);
    for (const option of group.options) {
      out.set(`${group.key}:${option.key}`, base.filter(option.test).length);
    }
  }
  return out;
}
