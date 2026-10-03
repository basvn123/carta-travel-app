/**
 * notFor.js, "Not for you if ..." for every page that argues for a place.
 *
 * Two lines at most, written in the reader's interest rather than the page's.
 * A page full of our own claims earns trust by saying who should stay away,
 * and it costs the wrong visits and buys the right ones.
 *
 * Every line is DERIVED from a field the page already shows. Nothing here is
 * hand written per place, so nothing can drift from the data: when the hazard
 * list or the surface changes, the line changes with it. Each kind has an
 * ordered rule list; a rule returns { key, params } or null, and the first two
 * that fire are shown.
 *
 * A place that trips no rule still gets one line, the fallback below. It is
 * true of everything Carta shows (a page describes the usual picture, never
 * today's conditions), which is why it is allowed to stand in. A block that
 * silently vanished would read as "nothing to warn about", which is a claim
 * this app cannot make.
 *
 * The caller passes plain objects and gets keys back, so the same rules serve
 * a card, a page and a test. Resolve with t(key, params) in the component.
 */

const MAX_LINES = 2;
const FALLBACK = { key: 'notfor.conditions', params: {} };

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const line = (key, params = {}) => ({ key, params });
const has = (list, code) => Array.isArray(list) && list.includes(code);

// ctx.word is the translated grade, when the page has one.
const MOUNTAIN_RULES = [
  (m) => (has(m.hazards, 'glacier') || has(m.hazards, 'crevasse')
    ? line('notfor.mtnGlacier') : null),
  (m) => (has(m.hazards, 'exposure') ? line('notfor.mtnExposure') : null),
  (m, ctx) => (['scramble', 'alpine', 'viaFerrata', 'technical'].includes(m.diff && m.diff.k)
    && ctx.word ? line('notfor.mtnGrade', { word: ctx.word.toLowerCase() }) : null),
  (m) => (has(m.hazards, 'altitude') ? line('notfor.mtnAltitude') : null),
  (m) => (has(m.hazards, 'lightning') ? line('notfor.mtnLightning') : null),
  (m) => (!(m.lift && m.lift.kind) ? line('notfor.mtnNoLift') : null),
];

const BEACH_ROUGH = ['pebble', 'shingle', 'gravel', 'fineGravel', 'rock'];

// ctx.word is the translated surface.
const BEACH_RULES = [
  (b, ctx) => (BEACH_ROUGH.includes(b.surface) && ctx.word
    ? line('notfor.beachSurface', { word: ctx.word }) : null),
  (b) => {
    const cls = b.water && b.water.class;
    return cls === 'Sufficient' || cls === 'Poor' ? line(`notfor.beachWater${cls}`) : null;
  },
  (b) => (Array.isArray(b.services) && !b.services.includes('toilets')
    && !b.services.includes('food') ? line('notfor.beachServices') : null),
  (b) => (b.size === 'cove' ? line('notfor.beachCove') : null),
];

const LAKE_RULES = [
  (l) => {
    const rule = l.swim && l.swim.rule;
    if (rule === 'no') return line('notfor.lakeSwimNo');
    if (rule === 'limited') return line('notfor.lakeSwimLimited');
    return null;
  },
  (l) => (has(l.hazards, 'cold_shock') ? line('notfor.lakeCold') : null),
  (l) => (has(l.hazards, 'algal_bloom') ? line('notfor.lakeAlgae') : null),
  (l) => (has(l.hazards, 'dam_release') ? line('notfor.lakeDam') : null),
  (l) => (has(l.hazards, 'currents') ? line('notfor.lakeCurrent') : null),
];

// entity is unused; ctx is { reasons, grade, ascent, totalM }.
const TRAIL_RULES = [
  (x, ctx) => {
    const road = (ctx.reasons || []).find((r) => (r.code || r.k) === 'roadWalk');
    const pct = road ? num(road.pct) : null;
    return pct !== null && pct >= 15 ? line('notfor.trailRoad', { pct: Math.round(pct) }) : null;
  },
  (x, ctx) => (ctx.grade === 'very_hard' || ctx.grade === 'alpine'
    ? line('notfor.trailGrade') : null),
  (x, ctx) => {
    const m = num(ctx.ascent);
    return m !== null && m >= 800 ? line('notfor.trailClimb', { m: Math.round(m) }) : null;
  },
  (x, ctx) => {
    const km = num(ctx.totalM) !== null ? ctx.totalM / 1000 : null;
    return km !== null && km >= 20 ? line('notfor.trailLong', { km: Math.round(km) }) : null;
  },
];

// A cycling route or tour: { km, asc, paved (0 to 1), bike, safety }.
const CYCLE_RULES = [
  (c) => (c.bike === 'gravel' ? line('notfor.cycleGravel')
    : c.bike === 'mtb' ? line('notfor.cycleMtb') : null),
  (c) => {
    const p = num(c.paved);
    return p !== null && p < 0.7 && c.bike !== 'gravel' && c.bike !== 'mtb'
      ? line('notfor.cycleUnpaved', { pct: Math.round((1 - p) * 100) }) : null;
  },
  (c) => (num(c.safety) !== null && c.safety < 5 ? line('notfor.cycleTraffic') : null),
  (c) => {
    const asc = num(c.asc);
    const km = num(c.km);
    return asc !== null && km && asc / km >= 12
      ? line('notfor.cycleHilly', { asc: Math.round(asc), km: Math.round(km) }) : null;
  },
];

// A published trip: { transport, archetype, stops, days, seasonText }.
const TRIP_RULES = [
  (x) => (x.transport === 'car' ? line('notfor.tripCar') : null),
  (x) => (x.archetype !== 'base' && num(x.stops) !== null && x.stops >= 4 && num(x.days)
    ? line('notfor.tripMoves', { n: x.stops, days: x.days }) : null),
  (x) => (x.seasonText ? line('notfor.tripSeason', { months: x.seasonText }) : null),
];

// A curated journey: { carRequired, familyFriendly, label, word }.
const JOURNEY_RULES = [
  (j) => (j.carRequired === true ? line('notfor.tripCar') : null),
  (j) => (['Demanding', 'Expert'].includes(j.label) && j.word
    ? line('notfor.journeyHard', { word: j.word.toLowerCase() }) : null),
  (j) => (j.familyFriendly === false ? line('notfor.journeyFamily') : null),
];

const RULES = {
  mountain: MOUNTAIN_RULES,
  beach: BEACH_RULES,
  lake: LAKE_RULES,
  trail: TRAIL_RULES,
  cycle: CYCLE_RULES,
  trip: TRIP_RULES,
  journey: JOURNEY_RULES,
};

/**
 * The lines for one place, as { key, params } objects, at most two, never
 * empty for a known kind. `entity` is the place's own record (or the small
 * object each rule list above documents); `ctx` carries anything that needs
 * the i18n function (a translated word) or a value the page derives itself.
 */
export function notForLines(kind, entity, ctx = {}) {
  const rules = RULES[kind];
  if (!rules || !entity) return [];
  const out = [];
  for (const rule of rules) {
    if (out.length >= MAX_LINES) break;
    let hit = null;
    try { hit = rule(entity, ctx); } catch { hit = null; }
    if (hit) out.push(hit);
  }
  return out.length ? out : [FALLBACK];
}
