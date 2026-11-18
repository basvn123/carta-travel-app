/**
 * The "from" figure on a When month card (G12, D10): the lowest day figure
 * any place in the catalogue has in that month, under the traveller's own
 * request (party, stay, food, way) with only the month changed. Beds are
 * priced by season (costIndex stayAtTier reads the month), so the figure
 * moves with the month. The figure is a day, in the traveller's own view
 * (each person or the group), so it reads in the same unit as the cards.
 *
 * Null when no place has a complete day that month: the card then shows no
 * figure at all (never a made-up number).
 *
 * Pure: no React. The caller memoises per month (the sheet's twelve cards).
 */
import { priceDays } from '../price/priceDay.js';
import { isYm } from './model.js';
import { priceFigure, asModel } from './prices.js';

/** The request with its dates moved to one month, as priceRequest builds a
 *  month (`when.kind 'month'`); everything else stays. */
export function atMonth(req, ym) {
  if (!req || !isYm(ym)) return req;
  const month = Number(ym.slice(5, 7));
  return {
    ...req,
    when: { kind: 'month', month, months: [month], start: null, end: null, ym },
    dateMode: 'month',
  };
}

/**
 * @param {object} destinations  the catalogue (data.destinations)
 * @param {object} req           the app's price request (lib/price/request.js)
 * @param {string} ym            'YYYY-MM'
 * @param {object} choices       the Settings model or raw choices
 * @returns {number|null}        euros, a day, in the traveller's view
 */
export function monthFrom(destinations, req, ym, choices) {
  if (!destinations || !req || !isYm(ym)) return null;
  const m = { ...asModel(choices), priceSpan: 'day' };
  let best = null;
  for (const row of priceDays(destinations, atMonth(req, ym)).values()) {
    const f = priceFigure(row, m);
    if (f.notKnown || !(f.eur > 0)) continue;
    if (best == null || f.eur < best) best = f.eur;
  }
  return best;
}
