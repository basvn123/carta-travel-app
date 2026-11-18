/**
 * Trip-length pairs and the typical fare, from one home airport's sweep file
 * (G12, D10; .work/2026-11-18-search-settings decision, gate G1).
 *
 *   cheapestPair   the cheapest checked way out and way home whose trip is
 *                  `nights` long, plus or minus `slack` days. measure.md:
 *                  exact-night pairs are a minority (13 to 64 percent of
 *                  airports), with one day of slack 48 to 88 percent, so the
 *                  slack is 1. A month limits the way out to that month.
 *   typicalFare    the median checked fare each way of the route, only with
 *                  at least MIN_FARES fresh fares each way. It is a fare the
 *                  route usually costs, not a fare for any date, and every
 *                  figure built on it carries `typical: true`.
 *
 * Both choose and price by fare plus the bag (legCost), the basis every
 * checked row is ranked on, so a typical row sorts beside a checked one on
 * the same terms. Only fresh fares count (the app's age rule, sweptLegs).
 *
 * Memoised per file, airport and hour: 3,868 Explore places share about 260
 * anchor airports, so a full reprice reads each route once.
 *
 * Pure: no fetching, no React.
 */
import { sweptLegs, legCost } from './flights.js';
import { rule } from '../price/config.js';

export const PAIR_SLACK = rule('flights.pair_slack_days');
export const MIN_FARES = rule('flights.typical_min_fares');
const SPREAD = rule('flights.nearest_day_spread');

const DAY_MS = 86400000;
const HOUR_MS = 3600000;
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

const memo = new WeakMap();
function cached(file, key, make) {
  let m = memo.get(file);
  if (!m) { m = new Map(); memo.set(file, m); }
  if (!m.has(key)) m.set(key, make());
  return m.get(key);
}
// A fare's freshness moves by the hour at most as far as a list cares; a
// key on the exact millisecond would never hit.
const hourOf = (now) => Math.floor(now / HOUR_MS);

function legsOf(file, dir, airport, now) {
  return cached(file, `L|${dir}|${airport}|${hourOf(now)}`, () => sweptLegs(file, dir, airport, null, now));
}

/**
 * The cheapest checked return of `nights` nights (plus or minus `slack`),
 * the way out in `ym` ('YYYY-MM') when given, else on any swept day.
 * Returns { out, back, perSeat, nights } or null. Ties keep the exact
 * length, then the earlier way out.
 */
export function cheapestPair(file, airport, { nights = 7, ym = null, slack = PAIR_SLACK, now = Date.now(), bagKey } = {}) {
  if (!file || !airport || !(nights >= 1)) return null;
  return cached(file, `P|${airport}|${nights}|${ym || ''}|${slack}|${bagKey || ''}|${hourOf(now)}`, () => {
    const backs = new Map(legsOf(file, 'back', airport, now).map((l) => [l.date, l]));
    if (!backs.size) return null;
    const seat = (leg) => legCost(leg, { paying: 1, bagKey }).perSeat;
    let best = null;
    for (const out of legsOf(file, 'out', airport, now)) {
      if (ym && !out.date.startsWith(ym)) continue;
      const outSeat = seat(out);
      for (let s = 0; s <= slack; s += 1) {
        for (const d of s ? [-s, s] : [0]) {
          const back = backs.get(addDays(out.date, nights + d));
          if (!back || back.date <= out.date) continue;
          const perSeat = outSeat + seat(back);
          const off = Math.abs(d);
          if (!best || perSeat < best.perSeat
            || (perSeat === best.perSeat && (off < best.off || (off === best.off && out.date < best.out.date)))) {
            best = { out, back, perSeat, nights: nights + d, off };
          }
        }
      }
    }
    if (!best) return null;
    const { off: _off, ...pair } = best;
    return pair;
  });
}

/**
 * Dates mode (fixes-r1 E4): the cheapest checked pair whose way out is the
 * nearest swept day to `date` (at most flights.nearest_day_spread away) and
 * whose way home keeps the trip `nights` long, plus or minus `slack`. Null
 * when no such pair exists: the figure then falls back to the typical fare.
 */
export function pairNear(file, airport, date, { nights = 7, slack = PAIR_SLACK, spread = SPREAD, now = Date.now(), bagKey } = {}) {
  if (!file || !airport || !date || !(nights >= 1)) return null;
  const outs = new Map(legsOf(file, 'out', airport, now).map((l) => [l.date, l]));
  const backs = new Map(legsOf(file, 'back', airport, now).map((l) => [l.date, l]));
  const seat = (leg) => legCost(leg, { paying: 1, bagKey }).perSeat;
  for (let k = 0; k <= spread; k += 1) {
    let best = null;
    for (const s of k ? [-k, k] : [0]) {
      const out = outs.get(addDays(date, s));
      if (!out) continue;
      for (let j = 0; j <= slack; j += 1) {
        for (const d of j ? [-j, j] : [0]) {
          const back = backs.get(addDays(out.date, nights + d));
          if (!back || back.date <= out.date) continue;
          const perSeat = seat(out) + seat(back);
          if (!best || perSeat < best.perSeat) best = { out, back, perSeat, nights: nights + d };
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/**
 * The When month cards' figure (fixes-r1 E2): the cheapest CHECKED return
 * a seat (bag on both legs) of the trip length leaving in `ym`, over every
 * place's anchor airport and every home airport file. Typical fares are
 * left out on purpose: they do not change by month, so a month figure
 * built on them would be the same constant on every card. Null: no figure.
 */
export function monthFlightFrom(files, airports, ym, { nights = 7, now = Date.now(), bagKey } = {}) {
  let best = null;
  for (const file of files || []) {
    for (const ap of airports || []) {
      if (!ap || ap === file?.from) continue;
      const p = cheapestPair(file, ap, { nights, ym, now, bagKey });
      if (p && (best == null || p.perSeat < best)) best = p.perSeat;
    }
  }
  return best;
}

/** The median of a sorted list of legs by price: { price, airline }. The
 *  airline (for the bag) is the lower middle leg's. */
function medianLeg(legs) {
  const s = [...legs].sort((a, b) => a.price - b.price);
  const mid = Math.floor((s.length - 1) / 2);
  const price = s.length % 2 ? s[mid].price : (s[mid].price + s[mid + 1].price) / 2;
  return { price, airline: s[mid].airline || null, date: null, typical: true, fares: s.length };
}

/**
 * The route's typical fare: the median fresh fare each way, each with at
 * least MIN_FARES fares, else null. Returns { out, back, perSeat, typical }
 * with `out` and `back` leg-shaped ({ price, airline, date: null }) so
 * legCost prices the bag the same way it does for a checked leg.
 */
export function typicalFare(file, airport, { now = Date.now(), bagKey } = {}) {
  if (!file || !airport) return null;
  return cached(file, `T|${airport}|${bagKey || ''}|${hourOf(now)}`, () => {
    const outs = legsOf(file, 'out', airport, now);
    const backs = legsOf(file, 'back', airport, now);
    if (outs.length < MIN_FARES || backs.length < MIN_FARES) return null;
    const out = medianLeg(outs);
    const back = medianLeg(backs);
    const perSeat = legCost(out, { paying: 1, bagKey }).perSeat + legCost(back, { paying: 1, bagKey }).perSeat;
    return { out, back, perSeat, typical: true };
  });
}
