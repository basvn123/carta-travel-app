// The receipt behind a place's figure (G12, D10, place-prices decision
// section 2), pure. The card and the receipt read one calculation
// (lib/settings/prices.js grandTotal and priceFigure), so in every basis
// cell (a day or the trip, each or the group) the receipt's total is the
// card's figure and its lines add up to it.

import { grandTotal, priceFigure } from '../settings/prices.js';

const cents = (v) => Math.round(v * 100) / 100;

/**
 * The receipt's figures for one row under the Settings model:
 *   total     the card's figure (priceFigure eur), whole euros on screen
 *   basis     the card's basis line [key, params]
 *   span      'day' | 'trip'; group, n, nights
 *   bed       { eur, each }  eur in the basis; each: a night (trip only)
 *   food      { eur, each }  eur in the basis; each: a day (trip only)
 *   way       { eur, inTotal, missing, off, mode, typical, estimated }
 *             the return, for the view's people; inside the total on a
 *             trip, apart on a day. typical: the route's median fare;
 *             estimated: a ground estimate for a way with no fare (the
 *             price chain, lib/settings/prices.js); the receipt names each
 *   sum       the total again, in cents, for the receipt's Total line
 *   rounding  what the printed cent lines miss of sum (null when nothing)
 *   notKnown  part of the trip has no figure yet (the way)
 */
export function receiptLines(row, model) {
  const g = grandTotal(row, model);
  const f = priceFigure(row, model);
  const trip = f.span === 'trip';
  const bed = { eur: trip ? f.parts.bed : g.bed, each: trip ? g.bed : null };
  const food = { eur: trip ? f.parts.food : g.food, each: trip ? g.food : null };
  const way = {
    eur: g.way, inTotal: trip, missing: g.wayMissing, off: g.wayOff, mode: g.wayMode,
    typical: !g.wayMissing && g.wayTypical, estimated: !g.wayMissing && g.wayEstimated,
  };
  const sum = f.eur;
  let rounding = null;
  if (sum != null && bed.eur != null && food.eur != null) {
    const printed = bed.eur + food.eur + (trip && way.eur != null ? way.eur : 0);
    const d = cents(sum - printed);
    if (Math.abs(d) >= 0.01) rounding = d;
  }
  return {
    total: f.eur, basis: f.basis, span: f.span, group: f.group, n: g.n, nights: g.nights,
    bed, food, way, sum, rounding, notKnown: f.notKnown,
  };
}

/**
 * The words under the receipt's way line for the price chain's step (G12,
 * D10, owner 2026-11-20: the card shows no sign, the receipt says which),
 * as [i18n key] or [null]: the route's typical fare, a ground estimate for a
 * way with no fare (by the way it priced), or a way not priced yet (the
 * total is the stay alone). A dated fare or a way switched off says nothing.
 */
export function wayLegNote(way) {
  if (!way || way.off) return [null];
  if (way.missing) return ['price.receipt.wayNotPriced'];
  if (way.estimated && ['train', 'bus', 'car'].includes(way.mode)) return [`price.receipt.est.${way.mode}`];
  if (way.typical) return ['price.receipt.typical'];
  return [null];
}

/**
 * The one insight line (decision section 2): how this place's day sits
 * against the traveller's usual day (the style's median day at the same
 * party, bed and table, lib/price/styleDay.js), only when it differs by 10%
 * or more. Amounts a person; `n` scales them to the view's people.
 *   -> { dir: 'under' | 'over', eur } or null
 */
export const INSIGHT_SHARE = 0.1;
export function dayInsight(dayEur, usualEur, n = 1) {
  if (!Number.isFinite(dayEur) || !Number.isFinite(usualEur) || usualEur <= 0) return null;
  const d = dayEur - usualEur;
  if (Math.abs(d) < usualEur * INSIGHT_SHARE) return null;
  return { dir: d < 0 ? 'under' : 'over', eur: Math.abs(d) * Math.max(1, n) };
}
