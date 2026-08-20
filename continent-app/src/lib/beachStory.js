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
  sandColour: (r) => `beach.whySand${cap(r.colour)}`,
  surface: (r) => `beach.whySurface${cap(r.surface)}`,
  water: (r) => `beach.whyWater${cap(r.class)}`,
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
  const key = surface
    ? (place ? 'beach.headSurfacePlace' : 'beach.headSurface')
    : (place ? 'beach.headPlace' : 'beach.headBare');
  return t(key, { name: beach.name, surface, place });
}

/**
 * Every sentence the data supports, in reading order. `max` caps how many go
 * on a card; the page passes no cap and shows the lot.
 */
export function beachWhy(beach, t, max) {
  const out = [];
  for (const reason of beach.why || []) {
    const key = keyFor(WHY_KEY, reason);
    if (!key) continue;
    const params = { ...reason };
    if (reason.k === 'services') params.list = serviceList(reason.list, t);
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
 *  most first, which is also the order of their weights. */
export const COMPONENT_ORDER = ['setting', 'acclaim', 'water', 'sand',
  'wildness', 'comfort'];

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
