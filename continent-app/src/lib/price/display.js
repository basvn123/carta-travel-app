/**
 * What a price shows, in the traveller's view (T694, plan rule 4): per
 * person, or the total for the whole group. The engine prices per person per
 * day; a view only multiplies, so the two views can never disagree.
 *
 *   per person   the day a person a day; a way there a person, return
 *   total        the day x seats x nights (the stay for everyone); a way
 *                there x seats
 *
 * A filter or a sort compares the number on the card in the same view (V15):
 * the shown figure and the shown threshold are the per-person ones times the
 * same factor, so the result and the order are the same in both views (V16).
 */
import { DEFAULT_PRICE_REQUEST, seatsOf } from './request.js';

const cents = (v) => Math.round(v * 100) / 100;

export const isTotalView = (req) => (req || DEFAULT_PRICE_REQUEST).view === 'total';

/** The day-price factor: 1 per person, seats x nights for the group. */
export function viewFactor(req) {
  const r = req || DEFAULT_PRICE_REQUEST;
  return isTotalView(r) ? seatsOf(r) * r.nights : 1;
}

/** The way-there factor: 1 per person, seats for the group. */
export function wayFactor(req) {
  const r = req || DEFAULT_PRICE_REQUEST;
  return isTotalView(r) ? seatsOf(r) : 1;
}

/** A per-person day amount in the view, whole cents; null stays null. */
export function shownDay(eur, req) {
  return eur == null || !Number.isFinite(eur) ? null : cents(eur * viewFactor(req));
}

/** A per-person amount for the way there in the view. */
export function shownWay(eur, req) {
  return eur == null || !Number.isFinite(eur) ? null : cents(eur * wayFactor(req));
}

/** The unit words for a day amount in the view, through i18n. */
export function dayUnit(t, req) {
  const r = req || DEFAULT_PRICE_REQUEST;
  if (!isTotalView(r)) return t('dest.priceDayUnit');
  const seats = seatsOf(r);
  return t('price.unitTotal', {
    people: seats === 1 ? t('receipt.onePerson') : t('receipt.nPeople', { n: seats }),
    nights: r.nights === 1 ? t('receipt.oneNight') : t('receipt.nNights', { n: r.nights }),
  });
}

// The day lines that name a part of the day sentence (lib/dayIncludes.js).
const DAY_PART_OF = { bed: 'bed', food: 'food', transport: 'transport' };

/**
 * The parts the day figure holds, from the engine's own lines (T698, B11:
 * the short line names what is in the price): every included line that has
 * an amount, in line order. Local transport joins by itself once F8 prices
 * it; a line the traveller switched off leaves the sentence.
 */
export function includedParts(row) {
  if (!row?.lines) return ['bed', 'food'];
  return row.lines
    .filter((l) => l.status === 'included' && l.eur != null && DAY_PART_OF[l.key])
    .map((l) => DAY_PART_OF[l.key]);
}
