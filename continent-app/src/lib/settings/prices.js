/**
 * The one figure a place shows under "Prices shown" (G12, D10): a day or
 * the whole trip, each person or the group. grandTotal is the ONLY place
 * the four cells are worked out; priceFigure shapes it for a row, so a card,
 * a rail, the map panel and the price sheet cannot disagree.
 *
 *                  each person                  the group (n = seats)
 *   A day          bed + food                   (bed + food) x n
 *   The whole trip (bed + food) x nights        ((bed + food) x nights
 *                  + way there                  + way there) x n
 *
 * Seats are adults plus children; babies have no seat and no bed and their
 * lap fees are already spread over the seats in the way's perPerson
 * (lib/party.js flightPerSeat). This fixes the two group rules of before
 * (explore-settings.md 2d: the row multiplied a day by the seats, the rest
 * of the app by seats x nights): the span now says which.
 *
 * A trip whose way there has no figure (notKnown, or no way on the row)
 * still shows the stay part, marked `notKnown: true` with `missing:
 * ['way']`, so the UI marks it and the price sort can put it last. A way
 * the traveller switched off (price_excluded 'flight') is not missing.
 *
 * Pure: no React, no i18n (unit is a key and its params).
 */
import { readSettings } from './model.js';

const cents = (v) => Math.round(v * 100) / 100;
const fin = (v) => (Number.isFinite(v) ? v : null);

/** The model from whatever the caller holds: a readSettings model passes
 *  through, raw choices are read. */
export function asModel(choices) {
  return choices && typeof choices === 'object' && 'priceSpan' in choices && 'dateMode' in choices
    ? choices
    : readSettings(choices || {});
}

const costOf = (row) => (row && typeof row === 'object' && 'cost' in row ? row.cost : row) || null;

/** The way there a figure can add: { eur, typical, mode, from } a person,
 *  or null with `why` 'off' | 'none' | 'notKnown'. */
function wayPart(cost, excluded) {
  if (excluded) return { eur: null, why: 'off' };
  const way = cost?.way;
  if (!way) return { eur: null, why: 'none' };
  if (way.notKnown || !(way.perPerson > 0)) return { eur: null, why: 'notKnown', mode: way.mode };
  return { eur: way.perPerson, typical: !!way.typical, mode: way.mode, from: way.from || null };
}

/**
 * Every amount of the four cells for one row, in euros.
 * @returns {{ group, n, nights, span, day, bed, food, way, stay, trip,
 *   wayTypical, wayMissing, wayOff }}
 *   day/bed/food are one day for n; way is the return for n; stay is
 *   day x nights; trip is stay + way (stay alone when the way is missing).
 */
export function grandTotal(row, choices) {
  const m = asModel(choices);
  const cost = costOf(row);
  const group = m.priceView === 'total';
  const n = group ? Math.max(1, m.seats) : 1;
  const nights = Math.max(1, m.nights || 1);
  const times = (eur, k) => (fin(eur) == null ? null : cents(eur * k));
  const excluded = m.excluded.includes('flight');
  const w = wayPart(cost, excluded);
  const day = times(cost?.dayEur, n);
  const stay = times(cost?.dayEur, n * nights);
  const way = times(w.eur, n);
  return {
    group, n, nights, span: m.priceSpan,
    day,
    bed: times(cost?.stayEur, n),
    food: times(cost?.foodEur, n),
    way,
    stay,
    trip: stay == null ? null : cents(stay + (way || 0)),
    wayTypical: !!w.typical,
    wayMissing: w.why === 'notKnown' || w.why === 'none',
    wayOff: w.why === 'off',
    wayMode: w.mode || cost?.way?.mode || null,
    wayFrom: w.from || null,
  };
}

/** The basis line under a figure (G12, D10, card option A): the words the
 *  card and the receipt both print, as an i18n key and its params. */
function basisOf(g) {
  if (g.span !== 'trip') return g.group ? ['price.basis.dayGroup', { n: g.n }] : ['price.basis.day', {}];
  const one = g.nights === 1;
  if (g.group) return [one ? 'price.basis.tripGroupOne' : 'price.basis.tripGroup', { n: g.n, nights: g.nights }];
  return [one ? 'price.basis.tripOne' : 'price.basis.trip', { nights: g.nights }];
}

/**
 * The figure for a row under the choices:
 *   { eur, unit: [key, params], basis: [key, params], span, group,
 *     typical, notKnown, missing, parts }
 *   eur       the number to show (null: no figure at all)
 *   unit      the i18n key and params after it ("/day", "/day for 3",
 *             "/trip", "/trip for 3")
 *   basis     the line under the figure ("a day, each", "for 2, 7 nights")
 *   span      'day' | 'trip'; group: the figure is the group's
 *   typical   the figure holds a typical fare (whole trip only)
 *   notKnown  part of the figure has no number yet (missing names it)
 *   parts     { bed, food, way, nights, n }: the wagons, each in the same
 *             span and view as eur, so they add up to it (way null on a day)
 */
export function priceFigure(row, choices) {
  const g = grandTotal(row, choices);
  const trip = g.span === 'trip';
  const missing = [];
  if (g.day == null) missing.push('day');
  if (trip && g.wayMissing) missing.push('way');
  const k = trip ? g.nights : 1;
  const scale = (v) => (v == null ? null : cents(v * k));
  const unit = trip
    ? (g.group ? ['settingsSum.unitTripGroup', { n: g.n }] : ['settingsSum.unitTrip', {}])
    : (g.group ? ['card.perDayGroup', { n: g.n }] : ['card.perDay', {}]);
  return {
    eur: trip ? g.trip : g.day,
    unit,
    basis: basisOf(g),
    span: trip ? 'trip' : 'day',
    group: g.group,
    typical: trip && !g.wayMissing && !g.wayOff && g.wayTypical,
    notKnown: missing.length > 0,
    missing,
    parts: {
      bed: scale(g.bed),
      food: scale(g.food),
      way: trip ? g.way : null,
      wayMode: g.wayMode,
      wayTypical: g.wayTypical,
      wayFrom: g.wayFrom,
      nights: g.nights,
      n: g.n,
    },
  };
}

/**
 * The number a price sort compares, on the figure's own basis, so checked
 * and typical rows rank together (decision G1); a figure with a missing
 * part sorts after every complete one.
 */
export function priceSortValue(row, choices) {
  const f = priceFigure(row, choices);
  if (f.eur == null) return Infinity;
  return f.notKnown ? 1e9 + f.eur : f.eur;
}
