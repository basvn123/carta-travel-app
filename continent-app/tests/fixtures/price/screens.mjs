// T661 (F1): every day-price screen of doc "Carta prijslogica Explore: plan"
// section 4.3, as the call that screen makes today. One adapter per screen
// path, so tests/priceGolden.test.mjs can price the same request on each and
// show where they disagree. When a screen's code changes, its adapter here
// changes with it, in the same commit.
//
// A request is the app state a traveller can set:
//   { choices, departDate, returnDate, dateFlex, defaultDates, xm }
import { quoteNights } from '../../../src/lib/price/nights.js';
import {
  priceDay, priceDays, priceRequest, atDates, DEFAULT_PRICE_REQUEST, seatsOf,
} from '../../../src/lib/price/index.js';
import { quoteTrip } from '../../../src/lib/price/trip.js';
import { quoteComposed } from '../../../src/lib/price/compose.js';
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
  // T702 (F6): the trip planner, the wizard's hand-over, a saved trip and
  // the Ask budget (quoteTrip): one stop over the request's pair, its beds
  // and days a person a night.
  tripPlanner: (all, id, r) => cents(tripDay(all, id, r)),
  // T708 (F6): a composed trip in Places (quoteComposed), its stay a person a night.
  placesTrip: (all, id, r) => cents(placesDay(all, id, r)),
};

function tripDay(all, id, r) {
  const q = requestOf(r);
  const priced = quoteTrip({
    stops: [{ destinationId: id, nights: q.nights, activities: [] }], tripStart: r.departDate,
    groupSize: q.group.adults, children: q.group.children, babies: q.group.babies,
    stayTier: q.stay, lifestyle: q.lifestyle,
  }, { data: { destinations: all, meta: {} } });
  const s = priced.stayCosts[0];
  return s?.day?.dayEur == null ? null : (s.accomTotal + s.groundTotal) / seatsOf(q) / q.nights;
}

function placesDay(all, id, r) {
  const q = requestOf(r);
  // The fixture towns have no air route: a zero-cost way there isolates the stay.
  const b = quoteComposed(all[id], r.departDate, r.returnDate, { ...r.choices, transport_mode: 'train' }, all,
    { ground: () => ({ total: 0 }) });
  return b ? (b.accom_total + b.ground_total) / seatsOf(q) / q.nights : null;
}

function calc(all, id, r) {
  const people = Math.max(1, Math.min(12, Math.round(r.choices?.group_size || 2)));
  return quoteNights(appRow(all, id, r), requestOf(r).nights, people, null, null);
}

// Screens that show a day price per person per day (the calculator total and
// the cheaper-base bed are other units and are compared on their own).
export const DAY_SCREENS = ['explore', 'destHeader', 'placesCard', 'calculatorDay', 'dayPlanner', 'placePage',
  'prerender', 'prerenderWeek', 'og', 'tripPlanner', 'placesTrip'];

// Screens that price at the trip's own exact dates (T666, T702): they meet
// the card when the request is exact.
export const EXACT_SCREENS = ['dayPlanner', 'tripPlanner', 'placesTrip'];
