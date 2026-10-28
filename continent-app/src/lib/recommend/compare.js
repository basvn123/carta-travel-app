/**
 * Trips side by side (TF3, T802): the rows of the compare table, built from
 * the trip objects themselves, so every cell is the figure the card and the
 * receipt already show. The trips are the columns, one row per figure:
 *
 *   total    the total a person, whole euros (trip.total)
 *   flight   the flight slot
 *   stay     the stay slot
 *   days     food plus getting around, as the card adds them
 *   match    the match %, only where match.pct is set
 *   door     door to door: the flight's minutes plus the gateway transfer
 *   weather  the month's day highs over the trip's places (taste.tmax_by_month,
 *            the source reasons.js reads)
 *   crowds   the month's busiest crowd tier over the places
 *            (taste.crowd_by_month, the source fit() reads)
 *   budget   under or over the typed budget; no row without a budget
 *
 * Each row with a "better" direction marks one best cell (sun yellow on
 * screen): exactly one, never on a tie, never with fewer than two figures,
 * and never on a missing figure. A total that leaves a slot out (no flight
 * price yet) is shown but never the best: it is not the same sum. Pure:
 * no React, no words. Roadmap 5.13 (the vote link) reads the same rows.
 */
import RECOMMEND from '../../../config/recommend.json' with { type: 'json' };

export const MAX_COMPARE = 4;

/** The crowd words by tier 0 to 3 (the app's CrowdingBadge keys). */
export const CROWD_KEYS = Object.freeze(['crowd.quiet', 'crowd.moderate', 'crowd.busy', 'crowd.crowded']);

const slotEur = (trip, id) => trip.slots.find((s) => s.id === id)?.eur ?? null;

/** Food plus getting around a person, as the card's "Days" adds them; null when neither has a figure. */
export function daysEur(trip) {
  const food = slotEur(trip, 'food');
  const local = slotEur(trip, 'local');
  return food == null && local == null ? null : (food || 0) + (local || 0);
}

/** Does the total leave a slot out (the card's "without the flight")? */
const leavesOut = (trip) => trip.slots.some((s) => s.eur == null && s.id !== 'activities');

/** Door to door in minutes: the outbound flight plus the gateway transfer; null when either is missing. */
export function doorMinutes(trip) {
  const facts = trip.slots.find((s) => s.id === 'flight')?.pick?.facts;
  const fly = facts?.out?.minutes ?? null;
  const transfer = trip.gateway?.minutes ?? null;
  return Number.isFinite(fly) && Number.isFinite(transfer) ? fly + transfer : null;
}

const placeValues = (trip, destinations, key) => trip.places
  .map((p) => destinations?.[p.id]?.taste?.[key]?.[trip.month - 1])
  .filter(Number.isFinite);

/** The month's day highs over the places: { lo, hi, mean } in whole degrees, or null. */
export function dayHighs(trip, destinations) {
  const xs = placeValues(trip, destinations, 'tmax_by_month');
  if (!xs.length) return null;
  return { lo: Math.round(Math.min(...xs)), hi: Math.round(Math.max(...xs)), mean: xs.reduce((s, v) => s + v, 0) / xs.length };
}

/** The busiest crowd tier (0 to 3) of the places in the month, or null. */
export function crowdTier(trip, destinations) {
  const xs = placeValues(trip, destinations, 'crowd_by_month');
  return xs.length ? Math.max(...xs) : null;
}

/**
 * Mark the one best cell of a row. `rank` is each cell's comparable figure
 * (null when it cannot be the best); lower wins, or higher with `high`.
 */
function markBest(cells, { high = false } = {}) {
  const ranked = cells.filter((c) => c.rank != null);
  if (ranked.length < 2) return cells;
  const top = ranked.reduce((a, c) => ((high ? c.rank > a.rank : c.rank < a.rank) ? c : a));
  if (ranked.filter((c) => c.rank === top.rank).length > 1) return cells;
  return cells.map((c) => (c === top ? { ...c, best: true } : c));
}

const cell = (value, rank = value, extra = {}) => ({ value, rank: value == null ? null : rank, best: false, ...extra });

/**
 * The compare table for 2 to 4 trips, in the order given.
 * ctx: { settings, destinations }
 * Returns [{ key, cells: [{ value, best, ... }] }], one cell per trip.
 */
export function compareRows(trips, { settings, destinations = {} } = {}) {
  const cols = trips.slice(0, MAX_COMPARE);
  const target = RECOMMEND.month.tmaxByWeather[settings?.guide?.weather];
  const withBudget = cols.some((t) => t.budget?.eur);
  const rows = [
    {
      key: 'total',
      cells: cols.map((t) => cell(t.total.perPerson, leavesOut(t) ? null : t.total.perPerson, { partial: leavesOut(t) })),
      high: false,
    },
    { key: 'flight', cells: cols.map((t) => cell(slotEur(t, 'flight'))) },
    { key: 'stay', cells: cols.map((t) => cell(slotEur(t, 'stay'))) },
    { key: 'days', cells: cols.map((t) => cell(daysEur(t))) },
    { key: 'match', cells: cols.map((t) => cell(t.match?.pct ?? null)), high: true },
    { key: 'door', cells: cols.map((t) => cell(doorMinutes(t))) },
    {
      key: 'weather',
      cells: cols.map((t) => {
        const h = dayHighs(t, destinations);
        return cell(h ? { lo: h.lo, hi: h.hi } : null, h && target != null ? Math.abs(Math.round(h.mean) - target) : null);
      }),
    },
    { key: 'crowds', cells: cols.map((t) => cell(crowdTier(t, destinations))) },
  ];
  if (withBudget) {
    rows.push({
      key: 'budget',
      cells: cols.map((t) => (t.budget?.eur ? cell(t.budget.delta, leavesOut(t) ? null : t.budget.delta) : cell(null))),
    });
  }
  return rows.map(({ key, cells, high }) => ({ key, cells: markBest(cells, { high }) }));
}

/** The row keys, top to bottom (with no budget the last is left out). */
export const ROW_KEYS = Object.freeze(['total', 'flight', 'stay', 'days', 'match', 'door', 'weather', 'crowds', 'budget']);
