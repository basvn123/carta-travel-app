/**
 * The trip page's Lifestyle slider (T173, spec E2, E6 and M6).
 *
 * Every curated trip carries its cost as an authored range: a low and a high
 * figure for the week, for each of the four receipt lines, and per day. The
 * low end is a week of cheap beds and cooking, the high end a week of hotel
 * rooms and dinners out. The slider places the traveller between the two.
 *
 * It is not a second control. Its stops are the Lifestyle panel's own "Where
 * you sleep" answers (offeredSleepGroups, cheapest first) and moving it writes
 * the same setting the panel's tiles write, choices.stay_tier, so the trip
 * page, the panel and every other price in the app agree on one answer.
 *
 * Stop i of n sits at share i / (n - 1) of the way from low to high, and each
 * figure is placed at that share of its own range. Whole euros, because the
 * authored inputs are whole euros: a cent figure here would be precision the
 * source never had. The total is placed on the authored total range, not
 * summed from the lines, so the low and high ends always show the authored
 * totals exactly (in the 2026-10 wire the line lows miss the total low on 42
 * of 253 trips and the line highs miss the total high on 57).
 *
 * Pure functions only, so the node tests can import it without a JSX loader.
 */
import { sleepGroupOf } from './sleepGroups.js';

export const BUDGET_SLOTS = ['accommodation', 'food', 'transport', 'activities'];

/** Index of the stop that holds the stored tier. A tier the dataset does not
 *  offer resolves the way the panel resolves it (sleepGroupOf), then to the
 *  entire place, then to the first stop. */
export function stopIndexFor(stops, stayTier) {
  if (!stops?.length) return -1;
  const g = sleepGroupOf(stayTier);
  const at = stops.findIndex((s) => s.key === g);
  if (at >= 0) return at;
  const home = stops.findIndex((s) => s.key === 'home');
  return home >= 0 ? home : 0;
}

/** How far along the authored range stop i of n sits, 0 to 1. */
export function stopShare(i, n) {
  if (!(n > 1)) return 0.5;
  return Math.min(1, Math.max(0, i / (n - 1)));
}

/** A whole-euro figure `share` of the way from low to high. One end missing
 *  means the other is the only figure there is; both missing is null. */
export function between(low, high, share) {
  const lo = Number.isFinite(low) ? low : null;
  const hi = Number.isFinite(high) ? high : null;
  if (lo == null && hi == null) return null;
  if (lo == null) return Math.round(hi);
  if (hi == null) return Math.round(lo);
  return Math.round(lo + (hi - lo) * share);
}

/** The receipt at one point of the range: the four lines, the total and the
 *  figure per day. `days` only matters when the trip has no per-day range. */
export function tripFigures(budget, share, days = 7) {
  if (!budget?.totalEur) return null;
  const rows = {};
  for (const slot of BUDGET_SLOTS) {
    const row = budget.breakdown?.[slot];
    rows[slot] = row ? between(row.lowEur, row.highEur, share) : null;
  }
  const total = between(budget.totalEur.low, budget.totalEur.high, share);
  const perDay = budget.perDayEur
    ? between(budget.perDayEur.low, budget.perDayEur.high, share)
    : (total != null && days > 0 ? Math.round(total / days) : null);
  return { rows, total, perDay };
}

/** The i18n key of the sentence that says what a stop's figure assumes. */
export function sayKey(stopKey) {
  return {
    dorm: 'journey.lsSayDorm',
    private: 'journey.lsSayPrivate',
    home: 'journey.lsSayHome',
    hotel: 'journey.lsSayHotel',
  }[stopKey] || 'journey.lsSayHome';
}
