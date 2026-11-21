/**
 * The compact price control on My trips (G12, the owner's last tweak):
 * [Per dag | Hele reis] [1 persoon | N personen] and, for Hele reis, a
 * nights stepper. It is a view of the one "Prijzen tonen" setting Explore
 * writes (lib/settings: price_span, price_view, trip_nights, the party), not
 * a second model, so a change here shows everywhere.
 *
 * The figures it scales are a day for one person (a watched day, a saved
 * place's move): unitFactor turns that into the chosen unit the way
 * lib/settings/prices.js grandTotal does for the stay part. A whole trip's
 * way there is not in a day figure; rows that have one use priceFigure.
 *
 * Pure: no React, no i18n.
 */
import { asModel } from '../settings/prices.js';
import { withPriceSpan, withPriceView, withTripNights, clampNights, DEFAULT_TRIP_NIGHTS } from '../settings/model.js';

const cents = (v) => Math.round(v * 100) / 100;

/** The chosen unit: { span: 'day'|'trip', group, seats, n, nights }. n is
 *  the people the figure is for (1, or the seats for the group). */
export function priceUnit(choices) {
  const m = asModel(choices);
  const seats = Math.max(1, m.seats || 1);
  const group = m.priceView === 'total';
  return {
    span: m.priceSpan === 'trip' ? 'trip' : 'day',
    group,
    seats,
    n: group ? seats : 1,
    nights: Math.max(1, m.nights || DEFAULT_TRIP_NIGHTS),
  };
}

/** What a day for one person is multiplied by in the chosen unit. */
export function unitFactor(choices) {
  const u = priceUnit(choices);
  return u.n * (u.span === 'trip' ? u.nights : 1);
}

/** A day for one person in the chosen unit, or null without a figure. */
export function inUnit(dayPp, choices) {
  return Number.isFinite(dayPp) ? cents(dayPp * unitFactor(choices)) : null;
}

/** The move of a day-for-one figure since it was saved, in the chosen unit:
 *  negative is cheaper. Null when either figure is missing or the basis it
 *  was saved on differs from today's (then the row hides the move). */
export function moveInUnit(thenDayPp, nowDayPp, choices, { sameBasis = true } = {}) {
  if (!sameBasis || !Number.isFinite(thenDayPp) || !Number.isFinite(nowDayPp)) return null;
  return cents((nowDayPp - thenDayPp) * unitFactor(choices));
}

/** A key for the unit, so a remembered figure can tell the unit changed. */
export const unitKey = (choices) => {
  const u = priceUnit(choices);
  return `${u.span}:${u.n}${u.span === 'trip' ? `:${u.nights}` : ''}`;
};

/* The control's three writes, as updaters for App's setChoices. */
export const setSpan = (span) => withPriceSpan(span === 'trip' ? 'trip' : 'day');
export const setWho = (who) => withPriceView(who === 'group' ? 'total' : 'pp');
/** One night more or less, from the nights the figures use now. */
export const stepNights = (delta) => (prev) => {
  const now = asModel(prev).tripNights;
  const next = clampNights(now + delta);
  return next === now ? prev : withTripNights(next)(prev);
};

/** The basis a saved price stood on: the month and the stay style. A saved
 *  row hides its move when today's basis differs (Revision 2). */
export const basisOf = (choices) => {
  const m = asModel(choices);
  const month = m.month || String(m.start || '').slice(0, 7);
  return `${month}|${choices?.stay_tier || m.stayTier || ''}`;
};
