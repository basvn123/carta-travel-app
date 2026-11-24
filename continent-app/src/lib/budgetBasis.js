/**
 * One basis for the traveller's budget (G12 lane L1, plan rethink decision
 * §3.4). A day budget is bed plus the day's spend (food and drink, getting
 * around town) for one person a night: the basis of a place's day price on
 * Explore. A trip budget is the whole trip for one person, flight included.
 *
 * Before G12 the finder (rank.budgetOf) multiplied a day budget by the
 * nights and set it against the whole trip, flight and all, while the trip
 * page (planner/flow/budget.js) set it against bed and days: one budget was
 * judged two ways, so a trip could be "over" in the list and "under" on its
 * own page. Every check now reads its spend from here. Pure.
 */

/** The basis a stored budget is on; tripSettings.budgetOfRaw reads anything but 'total' as a day budget. */
export const budgetKind = (budget) => (budget?.kind === 'total' ? 'total' : 'day');

/**
 * A person's spend a night on the day basis, from the engine's parts
 * (lib/price/trip.js quoteTrip: `beds` and `days` are group euros for the
 * whole stay). Null without nights or parts.
 */
export function dayBasisSpend(parts, people, nights) {
  if (!parts || !(nights > 0)) return null;
  const spent = ((parts.beds || 0) + (parts.days || 0)) / Math.max(1, people || 1) / nights;
  return Number.isFinite(spent) ? spent : null;
}

/**
 * What a finder trip (lib/recommend/trips.js) spends a person on a budget's
 * basis: the whole-trip total for a trip budget, bed and days a night for a
 * day budget. The day basis needs the trip's quote (its hidden `quote`, or
 * the one passed after a re-price); without one it is null, so an unknown
 * spend never reads as within budget.
 */
export function tripSpendOn(trip, kind, quote = trip?.quote) {
  if (!trip) return null;
  if (kind === 'total') {
    const v = trip.total?.perPerson;
    return Number.isFinite(v) ? v : null;
  }
  return dayBasisSpend(quote?.parts, trip.party?.head, trip.nights);
}

/**
 * The ruler a finder trip carries: { eur, kind, delta } for one person on the
 * budget's own basis, delta < 0 under budget and null when the spend is not
 * known; null with no budget.
 */
export function budgetRulerFor(trip, budget, quote = trip?.quote) {
  if (!budget || !(budget.eur > 0)) return null;
  const kind = budgetKind(budget);
  const spent = tripSpendOn(trip, kind, quote);
  return { eur: budget.eur, kind, delta: spent == null ? null : spent - budget.eur };
}
