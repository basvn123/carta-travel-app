/**
 * budget.js (T658): how a priced trip sits against the budget the traveller
 * gave in the trip settings. The budget is for one person (the question says
 * so): a day budget is bed plus food and drink a person a day, the same basis
 * as a place's day price on Explore; a trip budget is the whole trip's figure
 * a person. Returns { over, gap } in euros, or null without a budget.
 */
import { isOn } from '../../lib/flags.js';

/** The people a day budget divides by. `party` is every head the caller counts, babies too; E2 (H-8, V-9,
 *  owner default 2) leaves the priced trip's babies out, as the trip budget's per-person figure does. */
export function budgetHeads(priced, party = 1) {
  const babies = isOn('E2') ? Math.max(0, priced?.party?.babies || 0) : 0;
  return Math.max(1, party - babies);
}

/** The day figure a day budget compares: bed plus food and drink a person a day. */
export function daySpent(priced, party, nights) {
  return ((priced?.parts?.beds || 0) + (priced?.parts?.days || 0)) / budgetHeads(priced, party) / Math.max(1, nights);
}

export function budgetCheck(priced, budget, { party = 1, nights = 0 } = {}) {
  if (!priced || !budget || !(budget.eur > 0)) return null;
  let spent;
  if (budget.kind === 'total') {
    spent = priced.perPerson;
  } else {
    if (!(nights > 0)) return null;
    spent = daySpent(priced, party, nights);
  }
  if (!Number.isFinite(spent)) return null;
  const gap = Math.abs(budget.eur - spent);
  return { over: spent > budget.eur, gap: Math.round(gap) };
}
