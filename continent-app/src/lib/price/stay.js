/**
 * A stay inside a trip (T702, plan F6): one stop's bed and days for the
 * whole party, from the day price. Every trip path prices a stop here, so a
 * stop in the planner, the wizard, a saved trip or the Ask budget costs
 * exactly the destination page's day for the same question, times the seats
 * and the nights (V1, V3).
 */
import { DEFAULT_LIFESTYLE } from '../runtime_pricing.js';
import { addDays } from '../dates.js';
import { round2 } from '../math.js';
import { rule } from './config.js';
import { DEFAULT_PRICE_REQUEST, atDates, seatsOf } from './request.js';
import { priceDay } from './priceDay.js';

const MAX_SEATS = rule('party.limits').max_seats;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));

// The planner's way-there choice as the request's transport.
const TRANSPORT = { car: 'car', owncar: 'car', fly: 'plane', plane: 'plane', train: 'train', bus: 'bus', public: 'train' };

/**
 * The price request of a planned trip: its party (groupSize is the adults,
 * as the planner holds it), stay, Lifestyle, way there and bag. A saved
 * trip keeps this request, so it prices again for the question it was
 * planned with.
 */
export function tripRequest(state = {}) {
  const adults = clamp(state.groupSize || 1, 1, MAX_SEATS);
  const children = clamp(state.children || 0, 0, MAX_SEATS - adults);
  const babies = clamp(state.babies || 0, 0, MAX_SEATS - adults - children);
  return {
    ...DEFAULT_PRICE_REQUEST,
    group: { adults, children, babies },
    stay: state.stayTier || DEFAULT_PRICE_REQUEST.stay,
    lifestyle: state.lifestyle || DEFAULT_LIFESTYLE,
    transport: TRANSPORT[state.transportPref] || 'any',
    baggage: state.baggage || DEFAULT_PRICE_REQUEST.baggage,
  };
}

/**
 * One stop: { day, accom, ground, accomTotal, groundTotal, total, nights, seats }.
 *   day          the engine's day row at the stop's dates (null for 0 nights)
 *   accom        { per_night, total } a person, or null without a bed price
 *   ground       { per_day, total } a person (food and drink), or null
 *   accomTotal   the bed for every seat, all nights
 *   groundTotal  the days for every seat, all nights (food and drink, and
 *                local transport once the place has a fare, T714)
 * A 0-night pass-through stop books nothing and costs nothing.
 */
export function quoteStay(dest, nights, arriveDate, req = DEFAULT_PRICE_REQUEST, destinations = null) {
  if (!dest) return null;
  const n = Math.max(0, Math.round(nights || 0));
  const seats = seatsOf(req);
  if (n === 0) return { day: null, accom: null, ground: null, accomTotal: 0, groundTotal: 0, total: 0, nights: 0, seats };
  const at = arriveDate ? atDates(req, arriveDate, addDays(arriveDate, n)) : { ...req, nights: n };
  const day = priceDay(dest, at, destinations);
  if (!day) return null;
  const bed = day.stayEur;
  const food = day.foodEur;
  // T714: local transport joins the days once the place has a fare (B11).
  const local = day.lines.find((l) => l.key === 'transport' && l.status === 'included')?.eur || 0;
  const accomTotal = round2((bed || 0) * n * seats);
  const groundTotal = round2(((food || 0) + local) * n * seats);
  return {
    day,
    accom: bed != null ? { per_night: bed, total: round2(bed * n) } : null,
    ground: food != null ? { per_day: food, total: round2(food * n) } : null,
    accomTotal,
    groundTotal,
    total: round2(accomTotal + groundTotal),
    nights: n,
    seats,
  };
}
