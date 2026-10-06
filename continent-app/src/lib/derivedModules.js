/**
 * derivedModules.js, the derived modules of the beach, lake and mountain
 * pages (T182, destinations spec 11.5). Each one turns fields the wire
 * already carries into a reading a traveller can act on, and each one says
 * plainly when the data cannot answer.
 *
 *   beachFacing    which way the sand looks out to sea, and what the sun does
 *                  there (spec 8.4). From `aspect` and `sunset`, written by
 *                  pipeline/beaches/coastline.py off the EEA coastline
 *                  polygon and exported by export_beaches.py.
 *   beachWalkIn    how you get down to the sand (spec 8.5). From `access`
 *                  (export_beaches.py access_of: only what the Wikipedia
 *                  article states) and the `parking` service (an OSM car park
 *                  within 400 m, enrich_beaches.py CONTEXT_RADIUS). Minutes
 *                  and metres of descent are not on the wire; the module says
 *                  so instead of guessing.
 *   mountainWayUp  the four ways up, drive, lift, walk, climb, each on or off
 *                  (spec 10.3). From `acc` (peak_index.py access_codes), `lift`
 *                  (peak_index.py lift_of) and `diff` (peak_index.py
 *                  difficulty_of, the easiest graded way plus the hardest one
 *                  nearby as `hard`).
 *   lakeShore      how much path runs along the water (spec 9.5). From the
 *                  `shorePath` reason (lake_index.py: metres of walkable way
 *                  inside 50 m of the waterline, published at 300 m or more),
 *                  `privateShore`, `shoreLaunch`, and the area for the
 *                  shortest shore a lake of that size can have.
 *
 * Everything here is a pure function of one row, so tests/derivedModules
 * can check every branch without a browser and the coverage count in the
 * T182 report runs the same code the page runs.
 */

/* ── Beach orientation (8.4) ───────────────────────────────────────────── */

/** The eight compass points, clockwise from north. */
export const COMPASS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

/** A bearing in degrees as one of the eight points. 22.5 either side. */
export function compassPoint(deg) {
  const d = ((Number(deg) % 360) + 360) % 360;
  return COMPASS[Math.round(d / 45) % 8];
}

/**
 * What the sun does on a beach facing this way, in Europe's latitudes.
 *
 *   sunset     the pipeline's own flag: the bearing looks into the arc the
 *              sun sets through between the equinox and the June solstice at
 *              this latitude, give or take 22 degrees (coastline.py
 *              faces_sunset). Latitude-correct, so it wins over the bands.
 *   morning    facing 45 to 135 degrees: the sun rises over the water and is
 *              behind the shore by the afternoon.
 *   midday     facing 135 to 225: the sun crosses in front of you.
 *   evening    facing 225 to 315 without the flag: the afternoon sun is over
 *              the water, but it sets behind a headland or onto land.
 *   behind     facing 315 to 45: the sun is behind the shore most of the day.
 */
export function sunOf(aspect, sunset) {
  if (sunset) return 'sunset';
  const d = ((Number(aspect) % 360) + 360) % 360;
  if (d >= 45 && d < 135) return 'morning';
  if (d >= 135 && d < 225) return 'midday';
  if (d >= 225 && d < 315) return 'evening';
  return 'behind';
}

/**
 * { state: 'measured', aspect, point, sun } when the coastline gave a bearing;
 * { state: 'inland' } for a lake or river beach, which coastline.py never
 * gives a bearing because it is read against the sea;
 * { state: 'none' } otherwise (a spit, a lagoon mouth, or a beach further
 * than 5 km from the mapped coast, all refused by coastline.py).
 */
export function beachFacing(beach) {
  const aspect = Number(beach?.aspect);
  if (beach?.aspect != null && Number.isFinite(aspect)) {
    return {
      state: 'measured',
      aspect: Math.round(((aspect % 360) + 360) % 360),
      point: compassPoint(aspect),
      sun: sunOf(aspect, Boolean(beach.sunset)),
    };
  }
  if (beach?.inland) return { state: 'inland' };
  return { state: 'none' };
}

/* ── Beach walk-in (8.5) ───────────────────────────────────────────────── */

/** The access codes export_beaches.py writes, plus `road`, which the strip's
 *  ACCESS_LEVEL already knows. */
export const WALKIN_ACCESS = ['road', 'steps', 'hike', 'boat'];

/**
 * { state: 'access', access, parking } when the article names the way in;
 * { state: 'parking' } when only a car park within 400 m is known (a
 * distance, never a route: the car park above Navagio is 200 m over a cove
 * you reach by boat, which is why export_beaches.py stopped calling it road
 * access); { state: 'none' } when nothing says.
 */
export function beachWalkIn(beach) {
  const parking = (beach?.services || []).includes('parking');
  if (WALKIN_ACCESS.includes(beach?.access)) {
    return { state: 'access', access: beach.access, parking: parking && beach.access !== 'boat' };
  }
  if (parking) return { state: 'parking' };
  return { state: 'none' };
}

/* ── Mountain, how you get up (10.3) ───────────────────────────────────── */

/** Grades that mean a walking route reaches the top (peak_index.py DIFFICULTY). */
export const WALK_GRADES = ['walkUp', 'hike', 'mountainHike'];
/** Grades that need hands, a rope or a cable. */
export const CLIMB_GRADES = ['scramble', 'alpine', 'viaFerrata', 'technical'];
/** The slot order, easiest way first. */
export const WAY_UP_SLOTS = ['drive', 'lift', 'walk', 'climb'];

/**
 * The four ways up, each 'on', 'part' or 'off', and the easiest one that is
 * on as `primary`.
 *
 *   drive  `acc` has roadTop (a road to the top, from OSM or the hand list)
 *   lift   `acc` has liftTop: a top station within 700 m of the summit
 *          (peak_index.py SUMMIT_LIFT_M). liftMountain, a lift within 3 km or
 *          one the article mentions, is 'part': lifts help on the mountain,
 *          none is known to reach the top
 *   walk   the easiest graded way up is a walk, a hike or a mountain hike
 *   climb  the easiest way, or a harder one mapped near the summit, needs
 *          hands or gear: a scramble, an alpine route, a via ferrata
 *
 * `graded` is false when the row carries no difficulty at all, so the page
 * can say "not graded" for walk and climb instead of "no".
 */
export function mountainWayUp(mountain) {
  const acc = mountain?.acc || [];
  const k = mountain?.diff?.k || '';
  const hard = mountain?.diff?.hard || '';
  const graded = Boolean(k);
  const state = {
    drive: acc.includes('roadTop') ? 'on' : 'off',
    lift: acc.includes('liftTop') ? 'on' : acc.includes('liftMountain') ? 'part' : 'off',
    walk: WALK_GRADES.includes(k) ? 'on' : 'off',
    climb: CLIMB_GRADES.includes(k) || CLIMB_GRADES.includes(hard) ? 'on' : 'off',
  };
  const slots = WAY_UP_SLOTS.map((key) => ({ key, state: state[key] }));
  const primary = WAY_UP_SLOTS.find((key) => state[key] === 'on') || null;
  const lift = mountain?.lift || null;
  return {
    slots,
    primary,
    graded,
    estimated: Boolean(mountain?.diff?.est),
    grade: k,
    hard: CLIMB_GRADES.includes(hard) ? hard : '',
    liftKind: state.lift === 'on' && lift?.kind && lift.kind !== 'road' && lift.kind !== 'liftsNearby'
      ? lift.kind : '',
    liftName: lift?.name || '',
    // Metres along the ground from the top station to the summit, as
    // peak_index.py measured it. NOT the climb left on foot: the station's
    // height is not on the wire (register row T182-c).
    liftM: state.lift === 'on' && Number.isFinite(lift?.m) ? Math.round(lift.m) : null,
  };
}

/* ── Lake shore walkability (9.5) ──────────────────────────────────────── */

/** lake_index.py SHORE_DEFAULT and the beach-beside-it fallback: the two
 *  values the shore component takes when osm_water.py never swept the
 *  shore. A swept shore goes through a saturating curve and lands on
 *  these exact three-decimal values only by accident. */
const UNSWEPT_SHORE = [0.45, 0.62];

/** lake_index.py REASON_MAX, the number of reasons export_lakes.py ships. */
export const REASON_MAX = 10;
/** The reasons reasons_for() adds after the shore block, in its order. */
const AFTER_SHORE = ['undeveloped', 'resortShore', 'services', 'wikiFame', 'photographed', 'shared'];

/**
 * The shortest shore a lake of this area can have: a circle's circumference,
 * 2 * sqrt(pi * area). Every real shore is longer, so it is a floor, and it
 * is the reference the spec's shoreline development index divides by.
 */
export function minShoreKm(areaKm2) {
  const a = Number(areaKm2);
  if (!Number.isFinite(a) || a <= 0) return null;
  return 2 * Math.sqrt(Math.PI * a);
}

/**
 * { state: 'path', km, minKm } when 300 m or more of path runs within 50 m of
 * the water; { state: 'short', private, launch, minKm } when the shore was
 * swept and less than that was found; { state: 'unswept' } when the shore
 * score is the pipeline's no-reading default; { state: 'cut' } when the
 * answer may have been trimmed off the wire.
 *
 * The last one is common; the T182 report counts it. export_lakes.py ships only the
 * first REASON_MAX (10) reasons, in lake_index.py's narrative order, and the
 * shore reasons come seventh of nine sections. So a missing shorePath means
 * "less than 300 m" only when the list is short of ten, or when a reason
 * from after the shore block (AFTER_SHORE) made it on. Otherwise the figure
 * may simply have been cut, and the page says it is not on the listing
 * rather than claim the shore has no path. Lake Como is the case that
 * showed it: ten reasons, none about the shore.
 */
export function lakeShore(lake) {
  const why = lake?.why || [];
  const has = (k) => why.find((w) => w.k === k);
  const minKm = minShoreKm(lake?.size?.areaKm2);
  const path = has('shorePath');
  if (path && Number(path.km) > 0) {
    return { state: 'path', km: Number(path.km), minKm };
  }
  const shore = lake?.comp?.shore;
  if (shore == null || UNSWEPT_SHORE.includes(shore)) return { state: 'unswept' };
  const shoreSaid = has('privateShore') || has('shoreLaunch');
  const reachedPastShore = why.length < REASON_MAX || why.some((w) => AFTER_SHORE.includes(w.k));
  if (!shoreSaid && !reachedPastShore) return { state: 'cut' };
  return {
    state: 'short',
    private: Boolean(has('privateShore')),
    launch: Boolean(has('shoreLaunch')),
    minKm,
  };
}

/** A kilometre figure the way the page prints it: one decimal under 10 km,
 *  whole kilometres above. */
export function kmFigure(km, lang = 'en') {
  const n = Number(km);
  if (!Number.isFinite(n)) return '';
  const digits = n < 10 ? 1 : 0;
  return n.toLocaleString(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/* ── The six-word summaries a closed row shows ─────────────────────────── */

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

/** A compass point as a word in the reading language: "south-west". */
export const pointWord = (point, t) => t(`derived.point${cap(point)}`);

export function facingSummary(facing, t) {
  if (facing?.state === 'measured') {
    return t('derived.facingSum', {
      point: pointWord(facing.point, t),
      sun: t(`derived.sunShort${cap(facing.sun)}`),
    });
  }
  if (facing?.state === 'inland') return t('derived.facingInlandSum');
  return t('derived.notMeasured');
}

export function walkInSummary(walkIn, t) {
  if (walkIn?.state === 'access') return t(`beach.access${cap(walkIn.access)}`);
  if (walkIn?.state === 'parking') return t('derived.walkinParkingSum');
  return t('derived.notMeasured');
}

/** `liftWord` is mountainStory.js liftLabel and `gradeWord` its
 *  difficultyLabel, passed in so this file stays free of the story module. */
export function wayUpSummary(wayUp, t, { liftWord = '', gradeWord = '' } = {}) {
  switch (wayUp?.primary) {
    case 'drive': return t('derived.upSumDrive');
    case 'lift': return liftWord || t('derived.slotLift');
    case 'walk':
    case 'climb': return gradeWord || t(`derived.slot${cap(wayUp.primary)}`);
    default: return t('derived.notMeasured');
  }
}

export function shoreSummary(shore, t, lang = 'en') {
  if (shore?.state === 'path') return t('derived.shoreSum', { km: kmFigure(shore.km, lang) });
  if (shore?.state === 'short') return t('derived.shoreShortSum');
  return t('derived.notMeasured');
}
