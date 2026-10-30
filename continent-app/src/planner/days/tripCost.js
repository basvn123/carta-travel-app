/**
 * tripCost.js (T671): the trip's money at a glance, for the days overview,
 * after TravelSpend's two tiles and its split: the total, the figure a person
 * a day, and the share each part takes. Every figure is read from priceTrip's
 * result (lib/tripTotal.js tripLines), so it is the price card's own money in
 * another shape. Plain JS.
 */
import { tripLines } from '../../lib/tripTotal.js';

/** Receipt lines folded into the parts a traveller budgets by. */
const PART_OF = {
  out: 'getting', back: 'getting', travel: 'getting', drive: 'getting', airport: 'getting', transfers: 'getting',
  between: 'around', car: 'around',
  beds: 'stays',
  days: 'food',
};
export const PARTS = ['getting', 'stays', 'food', 'around'];

/**
 * { total, perPerson, perPersonDay, nights, parts:[{key, eur, share}] }, or
 * null without a priced trip. A line the traveller still has to price
 * (kind 'missing') counts as nothing and is reported as `missing`.
 */
export function costOverview(priced, { party = 1, nights = 0 } = {}) {
  if (!priced || !Number.isFinite(priced.grandTotal)) return null;
  const sums = Object.fromEntries(PARTS.map((k) => [k, 0]));
  let missing = 0;
  for (const l of tripLines(priced)) {
    if (l.kind === 'missing') { missing += 1; continue; }
    const k = PART_OF[l.key];
    if (k && Number.isFinite(l.eur)) sums[k] += l.eur;
  }
  const people = Math.max(1, party);
  const sum = PARTS.reduce((n, k) => n + sums[k], 0);
  const perPerson = priced.perPerson ?? priced.grandTotal / people;
  return {
    total: priced.grandTotal,
    perPerson,
    perPersonDay: nights > 0 ? perPerson / nights : null,
    nights,
    missing,
    parts: PARTS.map((k) => ({ key: k, eur: Math.round(sums[k] * 100) / 100, share: sum > 0 ? sums[k] / sum : 0 }))
      .filter((p) => p.eur > 0),
  };
}
