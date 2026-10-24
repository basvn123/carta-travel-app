/**
 * budget.js (T658): how a priced trip sits against the budget the traveller
 * gave in the trip settings. The budget is for one person (the question says
 * so): a day budget is bed plus food and drink a person a day, the same basis
 * as a place's day price on Explore; a trip budget is the whole trip's figure
 * a person. Returns { over, gap } in euros, or null without a budget.
 */
export function budgetCheck(priced, budget, { party = 1, nights = 0 } = {}) {
  if (!priced || !budget || !(budget.eur > 0)) return null;
  const people = Math.max(1, party);
  let spent;
  if (budget.kind === 'total') {
    spent = priced.perPerson;
  } else {
    if (!(nights > 0)) return null;
    spent = ((priced.parts?.beds || 0) + (priced.parts?.days || 0)) / people / nights;
  }
  if (!Number.isFinite(spent)) return null;
  const gap = Math.abs(budget.eur - spent);
  return { over: spent > budget.eur, gap: Math.round(gap) };
}
