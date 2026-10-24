// T661 (F1): every day-price screen of doc "Carta prijslogica Explore: plan"
// section 4.3, as the call that screen makes today. One adapter per screen
// path, so tests/priceGolden.test.mjs can price the same request on each and
// show where they disagree. When a screen's code changes, its adapter here
// changes with it, in the same commit.
//
// A request is the app state a traveller can set:
//   { choices, departDate, returnDate, dateFlex, defaultDates, xm }
import { priceFromIndex } from '../../../src/lib/destPrice.js';
import { priceDay, priceDays, priceRequest, atDates, DEFAULT_PRICE_REQUEST } from '../../../src/lib/price/index.js';
import { weekReceipt } from '../../../scripts/prerender/pages.mjs';

const cents = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100));

// App.jsx (T663): the one price request, and the engine's map that
// Explore, the destination page, Places, country, region, home, Ask,
// shortlist and the day planner read. The Explore month filter is part of
// the request (B7).
export function requestOf(r) {
  const d = r.defaultDates;
  const ownDates = r.ownDates ?? !!(r.departDate && r.returnDate && d && (r.departDate !== d.start || r.returnDate !== d.end));
  return priceRequest({ choices: r.choices, departDate: r.departDate, returnDate: r.returnDate,
    dateFlex: r.dateFlex, ownDates, xm: r.xm, today: '2026-10-24' });
}
const appRow = (all, id, r) => priceDays(all, requestOf(r)).get(id);

export const SCREENS = {
  // Explore card, pin and rails: the app map (T663: the month filter is in
  // the request, no second map).
  explore: (all, id, r) => cents(appRow(all, id, r)?.dayEur),
  // Destination header (DestPriceCard day figure) and Places place card
  // (BedFoodLine): the app map.
  destHeader: (all, id, r) => cents(appRow(all, id, r)?.dayEur),
  placesCard: (all, id, r) => cents(appRow(all, id, r)?.dayEur),
  // The calculator: the header's row times the nights and the party.
  calculatorDay: (all, id, r) => cents(calc(all, id, r)?.dayEur),
  calculatorTotal: (all, id, r) => cents(calc(all, id, r)?.total),
  // Day planner (T666): a stop's day at the stop's own dates, exact, with the
  // traveller's other choices. Here the stop runs over the request's pair.
  dayPlanner: (all, id, r) => cents(priceDay(all[id], atDates(requestOf(r), r.departDate, r.returnDate), all)?.dayEur),
  // Place pages (lake, beach, mountain, trail): hooks/useBaseDay.js (T664)
  // reads the app map row of the base town, else prices the town with the
  // same request against the catalogue.
  placePage: (all, id, r) => cents(priceDay(all[id], requestOf(r), all)?.dayEur),
  // The "cheaper base" exit (hooks/usePlaceExits.js, T664): the engine's bed
  // line for the request.
  cheaperBaseBed: (all, id, r) => cents(priceDay(all[id], requestOf(r), all)?.stayEur),
  // Prerendered pages and the OG card (T665): the default request through
  // the engine; the OG card gets the catalogue for the country repair.
  prerender: (all, id) => cents(priceDays(all, DEFAULT_PRICE_REQUEST).get(id)?.dayEur),
  prerenderWeek: (all, id) => cents(weekReceipt(priceDays(all, DEFAULT_PRICE_REQUEST).get(id), all[id])?.perDay),
  og: (all, id) => cents(priceDay(all[id], DEFAULT_PRICE_REQUEST, all)?.dayEur),
};

function calc(all, id, r) {
  const people = Math.max(1, Math.min(12, Math.round(r.choices?.group_size || 2)));
  return priceFromIndex(appRow(all, id, r), requestOf(r).nights, people, null, null);
}

// Screens that show a day price per person per day (the calculator total and
// the cheaper-base bed are other units and are compared on their own).
export const DAY_SCREENS = ['explore', 'destHeader', 'placesCard', 'calculatorDay', 'dayPlanner', 'placePage',
  'prerender', 'prerenderWeek', 'og'];
