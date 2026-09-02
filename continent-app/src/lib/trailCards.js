/**
 * trailCards.js, the join between the published trails wire and the catalogue.
 *
 * A composed city day names its anchor destination outright; a drawn hike gets
 * the nearest catalogue place within a sane radius. That association supplies
 * the from-price and the beach/mountain theming, plus the city photo behind a
 * city day, which really is a picture of what that day is about.
 *
 * A HIKE no longer borrows anything visual. The wire now carries the trail's
 * own photograph (pipeline/trails/trail_images.py, Wikimedia Commons, shot
 * within 400 m of the route line) and its own rating (pipeline/trails/rate.py,
 * open signals only). Before that existed, a hike showed the hero image of
 * whatever town happened to be nearest, which is how Bulgaria's list came to
 * illustrate mountain routes with a townhouse in Septemvri and a beach at
 * Sozopol. A photograph of somewhere else is worse than no photograph: it
 * answers "what does this walk look like" with a confident lie. A hike with no
 * picture of its own now shows its route glyph and says nothing.
 */
import { matchesAnyKind } from './trip_kinds.js';

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function bboxCentre(bbox) {
  return bbox?.length === 4
    ? { lat: (bbox[1] + bbox[3]) / 2, lon: (bbox[0] + bbox[2]) / 2 }
    : null;
}

/** Where a trip sits on the map: the anchor city for a composed city day,
 *  the extent's centre for a drawn trail. */
export function tripCentre(tr) {
  if (tr.category === 'citytrip' && tr.anchor?.lat != null) {
    return { lat: tr.anchor.lat, lon: tr.anchor.lon };
  }
  return bboxCentre(tr.bbox);
}

// Association radius for price/theme context and for naming the nearest town.
const ASSOC_MAX_KM = 80;

/** Nearest entry of a prebuilt dest index, or null outside maxKm. */
export function nearestDest(destIndex, lat, lon, maxKm = ASSOC_MAX_KM) {
  let best = null, bestKm = maxKm;
  for (const d of destIndex) {
    const km = haversineKm(lat, lon, d.lat, d.lon);
    if (km < bestKm) { bestKm = km; best = d; }
  }
  return best ? { dest: best, km: bestKm } : null;
}

/** The trail's own photograph, taken on the route. Null for a trail the photo
 *  pass found nothing usable for, which is not the same as "use a town". */
// How far a borrowed photograph may travel to stand in for a walk.
const NEAR_PHOTO_KM = 25;

export function tripPhoto(tr) {
  return tr?.img?.u || null;
}

/**
 * The trail rating in the shape RatingBadge reads: { score, tier }.
 *
 * The wire ships a bare 0-10 number. The badge colours itself from `tier`, and
 * without one every trail would render at rt-0, the greyest chip on the scale,
 * including a country's best walk. These are the catalogue's own cutoffs
 * (pipeline/rating_layer.py TIER_CUTOFFS), reused deliberately so an 8.9 means
 * the same shade of confidence whether it is a town or a trail.
 *
 * A trail rating is scored WITHIN its country though, where a destination
 * rating is scored across Europe. Same scale, different reference class, which
 * is the honest way to rank a Dutch dune walk against Dutch walks.
 */
const TRAIL_TIER_CUTOFFS = [[8.7, 3], [7.8, 2], [6.9, 1]];

export function trailRating(tr) {
  const score = tr?.rating;
  if (typeof score !== 'number') return null;
  const tier = TRAIL_TIER_CUTOFFS.find(([min]) => score >= min)?.[1] ?? 0;
  return { score, tier };
}

/**
 * Associate one wire trip with the catalogue: the anchor destination for a
 * city day, the nearest place for a hike. Returns
 *   { dest, destId, km, photoUrl }  (any of them null when nothing qualifies)
 *
 * photoUrl is the trail's own Commons photograph for a hike, and the anchor
 * city's hero for a city day. It is never a nearby town's hero on a hike.
 */
export function associateTrip(tr, destinations, destIndex) {
  const own = tripPhoto(tr);
  if (tr.category === 'citytrip' && tr.anchor?.dest && destinations[tr.anchor.dest]) {
    const dest = destinations[tr.anchor.dest];
    return {
      dest, destId: tr.anchor.dest, km: 0,
      photoUrl: own || dest.image?.url || null,
      photoOf: own ? null : dest.city,
    };
  }
  const c = tripCentre(tr);
  const near = c ? nearestDest(destIndex, c.lat, c.lon) : null;
  if (!near) return { dest: null, destId: null, km: null, photoUrl: own, photoOf: null };
  const full = destinations[near.dest.id] || near.dest;
  // A third of the walks in the wire have no photograph of their own, and a
  // grey placeholder in a list of photographs reads as a broken card. The
  // nearest place's hero fills the gap, and `photoOf` is what stops it being
  // a lie: the card says which place the picture is of, so nobody reads it as
  // a photograph of the path. Only from close by, because "the nearest town"
  // 60 km across a range is not the same landscape.
  const borrow = !own && near.km <= NEAR_PHOTO_KM ? (full.image?.url || null) : null;
  return {
    dest: full,
    destId: near.dest.id,
    km: near.km,
    photoUrl: own || borrow,
    photoOf: borrow ? full.city : null,
  };
}

/** 'beach' / 'mountains' membership for the themed category tabs. */
export function tripThemes(tr, assocDest) {
  const cats = assocDest?.categories || [];
  const themes = new Set();
  if (matchesAnyKind(cats, ['beach']) || cats.includes('coast')
    || assocDest?.beauty?.top_beach) themes.add('beach');
  if (matchesAnyKind(cats, ['mountains']) || (tr.ascent_m ?? 0) >= 600) themes.add('mountains');
  return themes;
}

/**
 * Distance bands for the Trails filter, in metres.
 *
 * The same five bands curate.py fills its per-country quota with, so the chips
 * a traveller taps map onto slices the list is actually built to contain: no
 * band can come back empty because the selection over-favoured one length.
 *
 * Phrased as "how long is my afternoon", because that is the question. Nobody
 * opens a hiking list thinking in metres, but everybody knows whether they
 * have two hours or a whole day.
 */
export const DISTANCE_BANDS = [
  { key: 'short', labelKey: 'trails.bandShort', min: 0, max: 5000 },
  { key: 'half', labelKey: 'trails.bandHalf', min: 5000, max: 10000 },
  { key: 'day', labelKey: 'trails.bandDay', min: 10000, max: 20000 },
  { key: 'long', labelKey: 'trails.bandLong', min: 20000, max: 40000 },
  { key: 'trek', labelKey: 'trails.bandTrek', min: 40000, max: Infinity },
];

/** Which band a trip falls in, or null when it carries no distance. */
export function tripBand(tr) {
  const m = tr?.distance_m;
  if (typeof m !== 'number') return null;
  return DISTANCE_BANDS.find((b) => m >= b.min && m < b.max)?.key ?? null;
}

/**
 * Climb bands, in metres of ascent.
 *
 * The cut points are the pipeline's (pipeline/trails/export_wire.py
 * ASCENT_BANDS ships the same five rows in index.json's filter_model, and
 * verify_trails_export.mjs holds these against those). Duplicated rather than
 * read from the wire because a chip has to render on the first frame, before
 * index.json has arrived; the harness is what stops the two drifting.
 *
 * Phrased as terrain rather than as arithmetic. "Rolling" is a thing a walker
 * can picture and "150 to 500 m of ascent" is a thing they have to convert.
 */
export const ASCENT_BANDS = [
  { key: 'flat', labelKey: 'trails.climbFlat', min: 0, max: 150 },
  { key: 'rolling', labelKey: 'trails.climbRolling', min: 150, max: 500 },
  { key: 'hilly', labelKey: 'trails.climbHilly', min: 500, max: 1000 },
  { key: 'steep', labelKey: 'trails.climbSteep', min: 1000, max: 1800 },
  { key: 'serious', labelKey: 'trails.climbSerious', min: 1800, max: Infinity },
];

/** Which climb band a trip falls in, or null when nothing measured it. */
export function tripClimbBand(tr) {
  const m = tr?.ascent_m;
  if (typeof m !== 'number') return null;
  return ASCENT_BANDS.find((b) => m >= b.min && m < b.max)?.key ?? null;
}

/**
 * The five published difficulty grades, hardest last.
 *
 * The wire carries the grade in `f.g` and where it came from in `f.gs`, and
 * the two are shown differently on purpose: a grade a mapper wrote on the
 * path and a grade we read off a 30 m elevation model are not the same claim,
 * and a walker choosing a very hard route deserves to know which they are
 * looking at. `gradeIsDerived` is what the badge asks.
 */
export const GRADES = [
  { key: 'easy', labelKey: 'trails.gradeEasy' },
  { key: 'moderate', labelKey: 'trails.gradeModerate' },
  { key: 'hard', labelKey: 'trails.gradeHard' },
  { key: 'very_hard', labelKey: 'trails.gradeVeryHard' },
  { key: 'alpine', labelKey: 'trails.gradeAlpine' },
];

export const tripGrade = (tr) => tr?.f?.g ?? null;
export const gradeIsDerived = (tr) => (tr?.f?.gs ?? null) === 'derived';

/**
 * Route shape: where the walk leaves you at the end of it.
 *
 * Out-and-back is separated from loop here even though both end where they
 * started, because they are not the same day: one shows you new ground the
 * whole way and the other shows you the same ground twice. `is_loop` stays on
 * the card as the cruder "you can leave the car here" signal, and covers all
 * three of loop, out_back and figure8.
 */
export const ROUTE_TYPES = [
  { key: 'loop', labelKey: 'trails.shapeLoop' },
  { key: 'out_back', labelKey: 'trails.shapeOutBack' },
  { key: 'point', labelKey: 'trails.shapePoint' },
  { key: 'figure8', labelKey: 'trails.shapeFigure8' },
];

export const tripRouteType = (tr) => tr?.f?.rt ?? null;

/**
 * What the walk goes past, as codes.
 *
 * The single most persuasive thing on a trail card: "waterfall, lake, castle"
 * is an argument for a Saturday and "12.4 km, moderate" is a specification.
 * Every code is a feature the pipeline found within 250 m of the drawn line
 * (pipeline/trails/scenic.py), never within a generous radius that would let
 * a card claim the next valley's waterfall.
 */
export const HIGHLIGHTS = [
  { key: 'summit', labelKey: 'trails.hlSummit' },
  { key: 'viewpoint', labelKey: 'trails.hlViewpoint' },
  { key: 'waterfall', labelKey: 'trails.hlWaterfall' },
  { key: 'lake', labelKey: 'trails.hlLake' },
  { key: 'gorge', labelKey: 'trails.hlGorge' },
  { key: 'coast', labelKey: 'trails.hlCoast' },
  { key: 'forest', labelKey: 'trails.hlForest' },
  { key: 'castle', labelKey: 'trails.hlCastle' },
  { key: 'hut', labelKey: 'trails.hlHut' },
  { key: 'village', labelKey: 'trails.hlVillage' },
];

export const tripHighlights = (tr) => tr?.f?.hl || [];

/**
 * Who the walk suits, tagged and derived kept apart.
 *
 * `f.su` is what OpenStreetMap says about the path. `f.sd` is what we worked
 * out from its shape, its surface and its gradient. The filter accepts both,
 * because somebody looking for a family walk wants both; the CARD says which,
 * because "a mapper checked this is wheelchair accessible" and "this looked
 * gentle to us" cannot be the same sentence.
 *
 * wheelchair only ever appears in `f.su`. Nothing derives it, by design.
 */
export const SUITABILITY = [
  { key: 'family', labelKey: 'trails.suitFamily' },
  { key: 'beginner', labelKey: 'trails.suitBeginner' },
  { key: 'dog', labelKey: 'trails.suitDog' },
  { key: 'stroller', labelKey: 'trails.suitStroller' },
  { key: 'wheelchair', labelKey: 'trails.suitWheelchair', taggedOnly: true },
  { key: 'winter', labelKey: 'trails.suitWinter' },
];

/** Every suitability code on a trip, tagged and derived together. */
export function tripSuitability(tr) {
  return [...(tr?.f?.su || []), ...(tr?.f?.sd || [])];
}

/** True when this code is a derivation rather than something OSM was told. */
export function suitabilityIsDerived(tr, key) {
  return (tr?.f?.sd || []).includes(key) && !(tr?.f?.su || []).includes(key);
}

/** A listed row: verified to exist, in region, and deliberately not scored. */
export const isListed = (tr) => (tr?.t ?? 'r') === 'l';

/** Assembled by us from way-level paths rather than published as a route. */
export const isDerivedRoute = (tr) => Boolean(tr?.f?.dr);

/** The portal that confirms this line, or null. */
export function portalVerified(tr) {
  const pv = tr?.f?.pv;
  return pv ? (typeof pv === 'string' ? pv : true) : null;
}

/** i18n key for the small kind chip on a card. */
export function tripKindKey(tr, assocDest) {
  if (tr.category === 'citytrip') {
    const cats = assocDest?.categories || [];
    if (matchesAnyKind(cats, ['beach'])) return 'trails.coastalDay';
    if (matchesAnyKind(cats, ['mountains'])) return 'trails.mountainDay';
    if (matchesAnyKind(cats, ['cultural'])) return 'trails.cultureDay';
    return 'trails.cityDay';
  }
  if ((tr.distance_m ?? 0) > 40000 || (tr.duration_min ?? 0) > 720) return 'trails.multiDayTrek';
  if ((tr.distance_m ?? 0) <= 25000) return 'trails.dayHike';
  return 'trails.trail';
}

/** "poi:gem:theth:thethi-national-park" -> "Thethi national park". The slug is
 *  the app's own diacritic fold of the POI name, so titling it back is honest
 *  enough for a stop list without downloading the 35 MB activities file. */
export function stopNameFromRef(poiRef) {
  const slug = String(poiRef || '').split(':').pop() || '';
  const words = slug.split('-').filter(Boolean);
  if (!words.length) return '';
  return words.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');
}
