/**
 * rows.js, themed rows under the best pick and the diverse top set (G12
 * plan rethink, lane R2, explore-recommendations.md Part 3 "Rows").
 *
 * The traveller asked for "other possibilities to keep looking", not three
 * options. A row is one reason to look further (Cheapest, Close by, Warm in
 * May, Quiet), drawn from the trips the finder already priced: no row
 * prices anything again, so the 4 s loader is untouched (B1 lane L0).
 *
 *   startOf(settings)                    'open' | 'when' | 'budget' | 'past' (decision §3.2 S1, S2/S3, S4, S10)
 *   ROWS_BY_START                        which rows each start may show, in order
 *   themedRows(trips, opts)              [{ key, sort, month, trips, n, extra }] at most 4
 *
 * Rules (Part 3 principles 2 and 3):
 *   - never an empty row: a row shows only when at least 2 of its trips are
 *     not already in the top set (the cards above it);
 *   - a total with a "Not yet" line never wins Cheapest (like for like);
 *   - with a ceiling (budget mode 'cap') no row holds a trip over it;
 *   - rows that add most beyond the top set come first.
 * Pure: the trips are returned as they came, in a new order.
 */

/**
 * The rows a start may show. G12 B6 (R5): Something new and Like <past
 * trip> for plan again (S10), Like your saved under a budget (S4). Van Viantra
 * and Other month add pricing, so they are not rows of the priced pool: they
 * run behind "Search more" (lib/recommend/moreSearch.js).
 */
export const ROWS_BY_START = Object.freeze({
  open: Object.freeze(['cheapest', 'near', 'warm']),
  when: Object.freeze(['cheapest', 'near', 'quiet']),
  budget: Object.freeze(['cheapest', 'near', 'kept']),
  past: Object.freeze(['new', 'past', 'cheapest', 'near']),
});
/** Each row's sort on the full list ("All n" opens it), finderText SORTS; the engine's order for the R5 rows. */
export const ROW_SORT = Object.freeze({ cheapest: 'cheapest', near: 'shortest', warm: 'warmest', quiet: 'quietest', new: 'match', past: 'match', kept: 'match' });
export const MAX_ROWS = 4;
export const ROW_CARDS = 8;
/** A row needs this many trips the top set does not already show. */
export const ROW_MIN_NEW = 2;
/** Warm means a day high of 20 C or more; Quiet a crowd tier of 1 or less. */
const WARM_MIN = 20;
const QUIET_MAX = 1;

const up = (x) => String(x || '').toUpperCase();
/** One base or a few towns (a road trip counts as towns, as the past trip's stops do). */
const shapeOf = (trip) => ((trip.places || []).length > 1 || (trip.shape && trip.shape !== 'one') ? 'towns' : 'one');
const leavesOut = (trip) => Array.isArray(trip.slots) && trip.slots.some((s) => s.eur == null && s.id !== 'activities');
const totalOf = (trip) => {
  const g = trip.total?.group;
  if (Number.isFinite(g)) return g;
  const p = trip.total?.perPerson;
  return Number.isFinite(p) ? p : null;
};

/** Which start the answers are (decision §3.2): a budget, a month or length, or nothing known. */
export function startOf(settings) {
  const s = settings || {};
  if (Number(s.guide?.budget?.eur) > 0) return 'budget';
  // G12 L12: plan again from a past trip (its month is a prefill, so this comes before 'when').
  if ((s.avoidIso2 || []).length || s.pastRef) return 'past';
  const w = s.when || {};
  const given = (s.answered || []).includes('when');
  if (w.mode === 'exact' || w.mode === 'months' || given) return 'when';
  return 'open';
}

/** The month all trips share, or 0 when they differ. */
function sharedMonth(trips) {
  const months = new Set(trips.map((x) => x.month).filter(Boolean));
  return months.size === 1 ? [...months][0] : 0;
}

/**
 * The themed rows for a ranked list.
 *   opts: { settings, destinations, topIds (the cards above the rows),
 *           highs(trip) -> { hi } | null, crowd(trip) -> 0..3 | null,
 *           minutes(trip) -> n | null, km(trip) -> straight-line km from
 *           home | null, max, perRow }
 *   G12 B5: Close by needs the flight's clock times (`minutes`), which a
 *   "Not yet" flight lacks; when too few trips have them, the row falls back
 *   to the straight-line distance from home (`basis: 'km'`), labelled as a
 *   distance, never as a travel time.
 *   -> [{ key, sort, month, trips: [...], n (all that fit the row), extra
 *         (how many are not in the top set), best (the best pick, for the why) }]
 */
export function themedRows(trips, {
  settings = null, topIds = [], highs = () => null, crowd = () => null, minutes = () => null, km = () => null,
  kept = [], max = MAX_ROWS, perRow = ROW_CARDS,
} = {}) {
  const list = Array.isArray(trips) ? trips.filter(Boolean) : [];
  if (list.length < ROW_MIN_NEW) return [];
  const capped = settings?.guide?.budget?.mode === 'cap';
  const pool = capped ? list.filter((x) => !(Number.isFinite(x.budget?.delta) && x.budget.delta > 0)) : list;
  const top = new Set(topIds);
  const best = list[0];
  const month = sharedMonth(pool);
  const been = new Set((settings?.avoidIso2 || []).map(up));
  const pastShape = settings?.pastRef?.shape ? (settings.pastRef.shape === 'one' ? 'one' : 'towns') : '';
  const keptIso = new Set((kept || []).map((r) => up(r?.iso2)).filter(Boolean));
  const keptIds = new Set((kept || []).map((r) => r?.id).filter(Boolean));
  const byKey = {
    cheapest: () => pool
      .filter((x) => !leavesOut(x) && totalOf(x) != null)
      .sort((a, b) => totalOf(a) - totalOf(b)),
    near: () => {
      const timed = pool.filter((x) => Number.isFinite(minutes(x))).sort((a, b) => minutes(a) - minutes(b));
      if (timed.filter((x) => !top.has(x.id)).length >= ROW_MIN_NEW) return timed;
      const far = pool.filter((x) => Number.isFinite(km(x))).sort((a, b) => km(a) - km(b));
      far.basis = 'km';
      return far;
    },
    warm: () => pool
      .filter((x) => (highs(x)?.hi ?? -Infinity) >= WARM_MIN)
      .sort((a, b) => highs(b).hi - highs(a).hi),
    quiet: () => pool
      .filter((x) => { const c = crowd(x); return c != null && c <= QUIET_MAX; })
      .sort((a, b) => crowd(a) - crowd(b)),
    // G12 R5: Something new, the trips in countries the traveller has not
    // been (settings.avoidIso2), in the engine's order. No countries been: no row.
    new: () => (been.size ? pool.filter((x) => !been.has(up(x.iso2))) : []),
    // Like <past trip>: the past trip's shape (one base or a few towns) in a
    // new country, so the row is "a trip like that one, somewhere else".
    past: () => (pastShape ? pool.filter((x) => shapeOf(x) === pastShape && !been.has(up(x.iso2))) : []),
    // Like your saved: trips in a country of a trip the traveller kept
    // (keptStore), never the kept trip itself.
    kept: () => (keptIso.size ? pool.filter((x) => keptIso.has(up(x.iso2)) && !keptIds.has(x.id)) : []),
  };
  const keys = ROWS_BY_START[startOf(settings)] || ROWS_BY_START.open;
  const rows = [];
  for (const key of keys) {
    const all = byKey[key]();
    const extra = all.filter((x) => !top.has(x.id)).length;
    if (extra < ROW_MIN_NEW) continue;
    rows.push({
      key, basis: all.basis || '', sort: ROW_SORT[key], month: key === 'warm' || key === 'quiet' ? month : 0, trips: all.slice(0, perRow), n: all.length, extra, best,
      ...(key === 'past' ? { name: settings?.pastRef?.label || '' } : {}),
    });
  }
  // The rows that show most beyond the cards above them come first; ties keep the start's order.
  return rows
    .map((r, i) => ({ r, i, share: r.extra / Math.max(1, r.n) }))
    .sort((a, b) => (b.share - a.share) || (a.i - b.i))
    .slice(0, max)
    .map((x) => x.r);
}

/**
 * A row card's why (Part 3 "Each card's why"): the row's own reason first.
 *   -> { key, vars } for the i18n, or null to fall back to the trip's reason
 *   Cheapest says how much less than the best pick, only when both totals
 *   are complete and the card is really cheaper.
 */
export function rowWhy(row, trip, { highs = () => null, crowd = () => null, minutes = () => null, km = () => null } = {}) {
  if (row.key === 'cheapest') {
    const a = totalOf(trip);
    const b = row.best && !leavesOut(row.best) ? totalOf(row.best) : null;
    if (a == null || b == null || !(b - a >= 1)) return null;
    return { key: 'tf.row.less', eur: b - a };
  }
  if (row.key === 'near' && row.basis === 'km') {
    const d = km(trip);
    return Number.isFinite(d) ? { key: 'tf.row.km', km: Math.round(d) } : null;
  }
  if (row.key === 'near') {
    const m = minutes(trip);
    return Number.isFinite(m) ? { key: 'tf.row.time', minutes: m } : null;
  }
  if (row.key === 'warm') {
    const h = highs(trip);
    return h ? { key: 'tf.row.high', c: h.hi } : null;
  }
  if (row.key === 'quiet') return crowd(trip) != null ? { key: 'tf.row.quietWhy', month: trip.month } : null;
  if (row.key === 'new') return { key: 'tf.row.newWhy', country: trip.country || '' };
  if (row.key === 'past') return { key: shapeOf(trip) === 'one' ? 'tf.row.pastOne' : 'tf.row.pastTowns', name: row.name || '' };
  if (row.key === 'kept') return { key: 'tf.row.keptWhy', country: trip.country || '' };
  return null;
}
