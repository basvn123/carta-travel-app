/**
 * budgetCompass.js, the budget as a compass (G12 plan rethink, lane L8,
 * decision §3.4; owner 2026-11-24: "Net erover", up to 3 within +10%, yes).
 *
 *   tripVerdict(trip, budget)        'fits' | 'over' | 'unknown' for one
 *                                    finder trip, with the gap and the lines
 *                                    its figure leaves out
 *   budgetSplit(trips, budget)       the list under a ceiling ('cap'):
 *                                    { list, near, out }
 *   moneyLeft(priced, budget, opts)  what is left of the budget on the trip
 *                                    page, a person and the group, or null
 *
 * Honest verdicts: a verdict compares like with like. A figure with a line
 * still "Not yet" (no price) on the budget's own basis is 'unknown', never
 * 'fits' (a missing flight would make any trip look cheap); a ceiling never
 * drops a trip it cannot judge. A guide ('soft') budget only ranks (rank.js
 * sinks trips over it); only a ceiling takes trips out of the list. Pure:
 * tests/budgetCompass.test.mjs.
 */
import { budgetKind, budgetRulerFor, dayBasisSpend } from '../budgetBasis.js';

/** "Net erover": a trip at most this share over a ceiling is shown apart. */
export const NEAR_SHARE = 0.1;
/** At most this many "Net erover" trips. */
export const NEAR_MAX = 3;

// The slot lines each basis reads: a day budget is bed plus the day's
// spend; a trip budget is everything (things to do are never priced, so
// they are named, not counted).
const DAY_LINES = ['stay', 'food'];

/** The budget a ceiling or guide applies to, or null without one. */
export function activeBudget(budget) {
  if (!budget || !(Number(budget.eur) > 0)) return null;
  return { eur: Number(budget.eur), kind: budgetKind(budget), mode: budget.mode === 'cap' ? 'cap' : 'soft' };
}

/** The slot ids a finder trip has no price for, on the budget's basis. */
export function missingLines(trip, kind) {
  const slots = Array.isArray(trip?.slots) ? trip.slots : [];
  return slots
    .filter((s) => s.id !== 'activities' && s.eur == null && (kind === 'total' || DAY_LINES.includes(s.id)))
    .map((s) => s.id);
}

/**
 * One finder trip against the budget: { state, gap (a person, on the basis,
 * whole euros), missing (slot ids with no price), leavesOut ('activities'
 * when the trip has things to do it never prices) } or null with no budget.
 */
export function tripVerdict(trip, budget) {
  const b = activeBudget(budget);
  if (!b || !trip) return null;
  const missing = missingLines(trip, b.kind);
  const ruler = budgetRulerFor(trip, b);
  const delta = ruler?.delta;
  const leavesOut = b.kind === 'total' ? ['activities'] : [];
  if (missing.length || !Number.isFinite(delta)) return { state: 'unknown', gap: null, missing, leavesOut };
  if (delta <= 0.5) return { state: 'fits', gap: Math.round(-delta), missing, leavesOut };
  return { state: 'over', gap: Math.round(delta), missing, leavesOut, share: delta / b.eur };
}

/**
 * The list under a ceiling. With a guide or no budget the trips stay as
 * they are. With a ceiling a trip over it leaves the list; up to NEAR_MAX
 * of those within NEAR_SHARE come back apart as `near` (least over first);
 * a trip whose figure cannot be judged stays in the list (it is never
 * counted as fitting, its card says so), unless its priced lines alone
 * already pass the ceiling. `out` counts the trips that left.
 */
export function budgetSplit(trips, budget) {
  const list = Array.isArray(trips) ? trips : [];
  const b = activeBudget(budget);
  if (!b || b.mode !== 'cap') return { list, near: [], out: 0 };
  const keep = [];
  const over = [];
  for (const trip of list) {
    const v = tripVerdict(trip, b);
    if (v?.state === 'over') over.push({ trip, verdict: v });
    // G12 browser pass: a "Not yet" line only adds to a figure, so a trip
    // whose priced lines alone pass the ceiling is over it (a EUR 900
    // ceiling listed Bruges at EUR 1,365 before the flight as best pick).
    // Its gap is a floor, so it never comes back as "Slightly over".
    else if (v?.state === 'unknown' && budgetRulerFor(trip, b)?.delta > 0.5) over.push({ trip, verdict: { ...v, partial: true } });
    else keep.push(trip);
  }
  const near = over
    .filter((x) => !x.verdict.partial && x.verdict.share <= NEAR_SHARE)
    .sort((a, b2) => a.verdict.gap - b2.verdict.gap)
    .slice(0, NEAR_MAX);
  return { list: keep, near, out: over.length };
}

/**
 * G12 L15: a Vrienden group's band (budget mode 'band', the lowest
 * whole-trip maximum a person) against the list: { eur, fits, judged } or
 * null without a band. Only trips that can be judged count (a "Not yet"
 * line on the basis is never fitting), so the line never overclaims.
 */
export function bandFit(trips, budget) {
  if (!budget || budget.mode !== 'band' || !(Number(budget.eur) > 0)) return null;
  let fits = 0;
  let judged = 0;
  for (const trip of trips || []) {
    const v = tripVerdict(trip, budget);
    if (!v || v.state === 'unknown') continue;
    judged += 1;
    if (v.state === 'fits') fits += 1;
  }
  return { eur: Number(budget.eur), fits, judged };
}

/**
 * What is left of the budget on the trip page ("Geld over"), from the
 * engine's quote: { person, group } in euros, or null when there is no
 * budget, the trip is over it, or a line on the basis has no price yet
 * (`missing`, the cost tiles' own flag, passed by the caller), so the money
 * left is never a figure with a flight still missing.
 *   opts: { party, nights, missing: [tile keys with no price] }
 */
export function moneyLeft(priced, budget, { party = 1, nights = 0, missing = [] } = {}) {
  const b = activeBudget(budget);
  if (!b || !priced) return null;
  const people = Math.max(1, party || 1);
  if (b.kind === 'total') {
    if (missing.length || !Number.isFinite(priced.perPerson)) return null;
    // G12 (browser pass 2): the group figure is the shown per-person figure
    // times the party, so "€731 under" never sits over "€1,463 left for the
    // group" (731 x 2 = 1,462); each figure is rounded once, as shown.
    const person = Math.round(b.eur - priced.perPerson);
    return person >= 1 ? { person, group: person * people } : null;
  }
  if (missing.some((k) => k === 'stay' || k === 'food')) return null;
  const spent = dayBasisSpend(priced.parts, people, nights);
  if (spent == null) return null;
  // The same for a day budget: the card shows the day gap rounded, so the trip figures build on it.
  const perNight = Math.round(b.eur - spent);
  if (perNight < 1) return null;
  return { person: perNight * nights, group: perNight * nights * people, perNight };
}
