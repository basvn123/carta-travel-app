/**
 * price/gaps.js: the one "missing value" rule for money (E1 honest totals,
 * ROADMAP D10 and G9; docs/logic/price.md PRICE-049).
 *
 *   1. A null is never 0 in a sum.
 *   2. The existing chain is walked first (typed, measured, country repair,
 *      typical fare); nothing is invented below it.
 *   3. When the chain ends empty the total is PARTIAL and carries what it
 *      leaves out.
 *   4. A partial total is never "fits" or "under budget", sorts after complete
 *      totals, and stays out of price bounds, histograms and the price filter.
 *   5. A fallback figure (a tier nobody asked for) never enters a median.
 *   6. An unknown currency is not converted.
 *
 * The first three functions are pure. The last three (standingOf,
 * orderByTotal, isPartial's callers) read flag E1 (lib/flags.js): with 'old'
 * they answer as the app did before, so one switch moves every site.
 */
import { isOn } from '../flags.js';

const known = (n) => typeof n === 'number' && Number.isFinite(n);

/**
 * Sum the parts of a total that may have gaps.
 * parts: [{ kind: 'bed'|'food'|'way'|'car', stop?: index, eur: number|null }]
 * Returns { eur, complete, leftOut: [{ kind, stop? }] }; a null part adds
 * nothing and is named in leftOut.
 */
export function sumParts(parts) {
  let eur = 0;
  const leftOut = [];
  for (const p of parts || []) {
    if (known(p?.eur)) { eur += p.eur; continue; }
    leftOut.push(p?.stop == null ? { kind: p?.kind } : { kind: p.kind, stop: p.stop });
  }
  return { eur: Math.round(eur * 100) / 100, complete: leftOut.length === 0, leftOut };
}

/** True for a total that leaves something out: { complete: false }, { partial: true } or a way with no fare. */
export const isPartial = (t) => !t || t.complete === false || t.partial === true || t.noFare === true || !known(t.eur);

/**
 * Where a total stands against a budget (the whole trip, for the party).
 *   total   { eur, complete, core? }; `core` is the total before a buffer
 *   state   'fits' (eur within budget), 'tight' (only the buffer tips it over),
 *           'over', or 'partial' (a gap, and the part we know is still within
 *           budget, so it cannot be called fits). A partial total already over
 *           budget is 'over': more parts only add.
 *   delta   eur minus budget (negative: money left); null when partial
 *   left    budget minus eur; null when partial
 * No budget gives state null.
 */
export function budgetStanding(total, budget, party = {}) {
  const heads = Math.max(1, (party.adults || 1) + (party.children || 0));
  if (!known(budget) || budget <= 0) return { state: null, delta: null, left: null, partial: isPartial(total), perPerson: null };
  const partial = isPartial(total);
  if (!known(total?.eur)) return { state: 'partial', delta: null, left: null, partial: true, perPerson: null };
  const delta = Math.round((total.eur - budget) * 100) / 100;
  const base = { delta, left: -delta, partial, perPerson: Math.round((total.eur / heads) * 100) / 100 };
  if (total.eur > budget) return { state: 'over', ...base };
  if (partial) return { state: 'partial', ...base, delta: null, left: null };
  return { state: 'fits', ...base };
}

/** Like budgetStanding, with 'tight' (the buffer is what tips it) and the old rule when the flag is not on. */
export function standingOf(total, budget, party = {}) {
  if (!isOn('E1')) return budgetStanding({ ...total, complete: true, partial: false, noFare: false }, budget, party);
  const s = budgetStanding(total, budget, party);
  if (s.state === 'over' && known(total.core) && total.core <= budget && !isPartial(total)) return { ...s, state: 'tight' };
  return s;
}

/** Sort order for two totals { eur, complete }: complete before partial, then cheaper first. */
export function comparePartialLast(a, b) {
  const pa = isPartial(a);
  const pb = isPartial(b);
  if (pa !== pb) return pa ? 1 : -1;
  const ea = known(a?.eur) ? a.eur : Infinity;
  const eb = known(b?.eur) ? b.eur : Infinity;
  return ea === eb ? 0 : ea < eb ? -1 : 1;
}

/**
 * A list of rows by price, cheapest first. With E1 on a row that leaves
 * something out (complete false, partial, noFare) goes after every complete
 * one; with it off the order is the old one, by the figure alone.
 * valueOf(row) is the figure a row sorts by.
 */
export function orderByTotal(rows, valueOf = (r) => r.eur) {
  const out = [...rows];
  if (!isOn('E1')) return out.sort((a, b) => valueOf(a) - valueOf(b));
  const view = (r) => ({ eur: valueOf(r), complete: !isPartial({ ...r, eur: valueOf(r) }) });
  return out.sort((a, b) => comparePartialLast(view(a), view(b)));
}

/**
 * Does a finder trip leave a priced slot out (a way, a bed, a car with no
 * figure)? Activities are optional and never count. Slots: { id, eur }.
 */
export const slotsLeaveOut = (slots) => (slots || []).some((s) => s.eur == null && s.id !== 'activities');
