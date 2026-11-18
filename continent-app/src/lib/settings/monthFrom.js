/**
 * The "from" figure on a When month card (G12, D10; fixes-r1 E2): the
 * cheapest CHECKED return flight a person (fare plus the bag, both legs) of
 * the trip length, leaving that month, from the traveller's start (every
 * home airport file the app holds) to any place in the catalogue.
 *
 * Before E2 it was the lowest day figure; stays carry no seasonal signal,
 * so every month read the same 45 euros. A flight is the part that moves
 * by month. Typical fares are left out (they do not change by month), so a
 * month with no checked pair shows no figure at all: never a constant and
 * never a made-up number.
 *
 * Unit: a return flight, each person, whatever the price view.
 *
 * Pure: no React. The caller memoises per month (the sheet's twelve cards).
 */
import { isYm } from './model.js';
import { asModel } from './prices.js';
import { flightFiles } from './ways.js';
import { monthFlightFrom } from '../flights/pairs.js';
import { destAnchor } from '../origins.js';
import { rule } from '../price/config.js';

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

const anchorsMemo = new WeakMap();
function anchorsOf(destinations) {
  if (!destinations) return [];
  if (!anchorsMemo.has(destinations)) {
    anchorsMemo.set(destinations, [...new Set(Object.values(destinations).map(destAnchor).filter(Boolean))]);
  }
  return anchorsMemo.get(destinations);
}

/**
 * @param {object} data     the app data (destinations, flights, flightsBy)
 * @param {object} req      the app's price request (bag, nights)
 * @param {string} ym       'YYYY-MM'
 * @param {object} choices  the Settings model or raw choices (trip length)
 * @param {number} [now]
 * @returns {number|null}   euros, a return flight, each person
 */
export function monthFrom(data, req, ym, choices, now = Date.now()) {
  if (!data?.destinations || !isYm(ym)) return null;
  const files = flightFiles(data);
  if (!files.length) return null;
  const m = asModel(choices);
  const v = monthFlightFrom(files, anchorsOf(data.destinations), ym, {
    nights: m.tripNights || req?.nights || rule('request.default_nights'),
    now,
    bagKey: req?.baggage || rule('request.default_bag'),
  });
  return v == null ? null : Math.round(v * 100) / 100;
}
