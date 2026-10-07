/**
 * Trip length (T101, spec I2): every curated trip is seven days, and a
 * catalogue where every week is seven days is a generation artefact. Most
 * people book four nights, so every trip also carries a short version: its
 * three or four best days, with a total of their own.
 *
 * Nothing is added to the wire. The week is already seven discrete day
 * objects with an authored budget, so the short version is a chosen run of
 * those days and a recalculated cost, worked out here from what the page and
 * the card already hold (spec I2: "a chosen subset plus a recalculated
 * cost, not new content").
 *
 * The rules, so a maintainer can change one without reading the rest:
 *
 *   how many days   4 days; 3 when the trip is rated Demanding or harder
 *                   (difficulty 4 or 5), because a hard route is not four
 *                   days of effort. Never more than the week has.
 *   which days      one unbroken run, so the bases and the travel between
 *                   them still make sense. The run whose days hold the most
 *                   named places and measured detail wins (dayScore); a tie
 *                   goes to the later run, because the first day of a week is
 *                   the arrival day and the last is the leaving day.
 *   what it costs   each authored line (stay, food, transport, activities),
 *                   the total and the per-day figure scale by the share of
 *                   the week the short version keeps. Getting to the
 *                   trip's start is inside the transport line and scales with
 *                   it, which understates a short trip a little; the page
 *                   says the figures are shares of the week's.
 *
 * Pure functions only, so the node tests import it without a JSX loader.
 */

export const WEEK = 'week';
export const SHORT = 'short';
export const LENGTH_KEY = 'carta.tripLength';

const BUDGET_SLOTS = ['accommodation', 'food', 'transport', 'activities'];

/** Days in the short version: 4, or 3 for a Demanding or harder trip. */
export function shortDayCount(difficulty, weekDays = 7) {
  const hard = Number(difficulty) >= 4;
  return Math.max(1, Math.min(weekDays - 1, hard ? 3 : 4));
}

/** What a day holds, as a number: words that name a place or a thing
 *  (capitalised mid sentence, or between asterisks) and measured figures. */
export function dayScore(day) {
  if (!day) return 0;
  const text = [day.morning, day.afternoon, day.evening].filter(Boolean).join(' ');
  const bold = (text.match(/\*\*[^*]+\*\*/g) || []).length;
  const named = (text.match(/(?<![.!?]\s)(?<!^)\b[A-Z\u00C0-\u00DE][a-z\u00DF-\u00FF]{2,}/g) || []).length;
  const figures = (text.match(/\d/g) || []).length > 0 ? 1 : 0;
  const stats = day.dayStats ? 2 : 0;
  return named + bold * 2 + figures + stats;
}

/** The run of `n` days with the best total score: { start, indexes, score }.
 *  A tie goes to the later run. */
export function pickShortRun(itinerary, n) {
  const days = Array.isArray(itinerary) ? itinerary : [];
  const size = Math.max(1, Math.min(n, days.length));
  if (!days.length) return { start: 0, indexes: [], score: 0 };
  const scores = days.map(dayScore);
  let best = null;
  for (let s = 0; s + size <= days.length; s += 1) {
    let sum = 0;
    for (let i = s; i < s + size; i += 1) sum += scores[i];
    if (!best || sum >= best.score) best = { start: s, score: sum };
  }
  return { start: best.start, indexes: Array.from({ length: size }, (_, i) => best.start + i), score: best.score };
}

/** A whole-euro share of a { low, high } pair, or null. */
export function scalePair(pair, days, weekDays = 7) {
  if (!pair || !(weekDays > 0)) return pair ? { ...pair } : null;
  const k = days / weekDays;
  const f = (v) => (Number.isFinite(v) ? Math.round(v * k) : v);
  return { ...pair, low: f(pair.low), high: f(pair.high) };
}

/** The authored budget, cut to a share of the week. The per-day range does
 *  not change: a day costs what it cost. */
export function scaleBudget(budget, days, weekDays = 7) {
  if (!budget) return budget;
  if (!(days > 0) || days >= weekDays) return budget;
  const k = days / weekDays;
  const f = (v) => (Number.isFinite(v) ? Math.round(v * k) : v);
  const breakdown = budget.breakdown ? { ...budget.breakdown } : budget.breakdown;
  if (breakdown) {
    for (const slot of BUDGET_SLOTS) {
      const row = breakdown[slot];
      if (row) breakdown[slot] = { ...row, lowEur: f(row.lowEur), highEur: f(row.highEur) };
    }
  }
  return {
    ...budget,
    totalEur: scalePair(budget.totalEur, days, weekDays),
    breakdown,
    perDayEur: budget.perDayEur,
  };
}

/** The two lengths of a full trip: { week, short } with the days, the
 *  indexes of the days each keeps and the budget at that length. */
export function tripLengths(trip) {
  const itinerary = trip?.itinerary || [];
  const weekDays = itinerary.length || trip?.durationDays || 7;
  const n = shortDayCount(trip?.profile?.difficulty, weekDays);
  const run = pickShortRun(itinerary, n);
  return {
    week: {
      key: WEEK, days: weekDays,
      indexes: itinerary.map((_, i) => i),
      budget: trip?.budget || null,
    },
    short: {
      key: SHORT, days: run.indexes.length || n,
      indexes: run.indexes,
      budget: scaleBudget(trip?.budget, run.indexes.length || n, weekDays),
    },
  };
}

/** A browse card's total for one length: the authored range, or its share
 *  for the short version. The card holds no itinerary, so only the day count
 *  (shortDayCount of its difficulty) is needed. */
export function cardTotal(card, length) {
  const pair = card?.eur;
  if (!pair || (!Number.isFinite(pair.low) && !Number.isFinite(pair.high))) return null;
  const weekDays = card.days || 7;
  if (length !== SHORT) return { low: pair.low, high: pair.high, days: weekDays };
  const days = shortDayCount(card.diff, weekDays);
  const s = scalePair(pair, days, weekDays);
  return { low: s.low, high: s.high, days };
}

export function readTripLength() {
  try { return window.localStorage.getItem(LENGTH_KEY) === SHORT ? SHORT : WEEK; } catch { return WEEK; }
}

export function writeTripLength(length) {
  try { window.localStorage.setItem(LENGTH_KEY, length === SHORT ? SHORT : WEEK); } catch { /* blocked store: the choice lasts for this page */ }
}
