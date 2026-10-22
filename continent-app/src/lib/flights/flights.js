/**
 * Flight prices for a trip, from the sweep's file or a live search (T517).
 *
 * Two sources, one shape:
 *   - the sweep's file for the home airport (data/flights/{IATA}.json, see
 *     workers/flight-sweep/src/publish.mjs): the cheapest flight per route
 *     and day, both directions, checked at most a few hours ago for the next
 *     two weeks and at most a week ago for later dates;
 *   - a live search (/api/flights, functions/api/flights.js): every flight
 *     of one day, used by the trip planner for its exact dates and hours.
 *
 * A leg: { date, price, airline, dep, arr, stops, checked, source }, price in
 * EUR for one adult one way, `checked` an epoch in ms, source 'live' or
 * 'swept'. Prices are Google Flights' and are always shown with the airline
 * and the time they were checked. A typed fare the traveller paid wins over
 * both (tripTotal.js); a day with no flight is null, never a guess.
 *
 * Pure: no fetching here (flightData.js and useLiveFlights.js do that).
 */
import { bagFee } from './bagFees.js';

/** Anything older than this is ignored: a stale price reads as current. */
export const MAX_AGE_MS = 3 * 86400000;

export const HOURS = Object.freeze({
  any: [0, 24],
  morning: [5, 12],
  midday: [12, 17],
  evening: [17, 24],
});

export function fitsHours(dep, band = 'any') {
  const [from, to] = HOURS[band] || HOURS.any;
  if (!dep) return band === 'any';
  const h = Number(dep.slice(0, 2)) + Number(dep.slice(3, 5)) / 60;
  return h >= from && h < to;
}

const fromDay = (date, v, source = 'swept') => (Array.isArray(v)
  ? { date, price: v[0], airline: v[1], dep: v[2], arr: v[3], stops: v[4], checked: v[5] * 60000, source }
  : null);

/** The swept cheapest flight for one day: a leg, null (no flight that day) or undefined (not searched). */
export function sweptDay(file, dir, airport, date, now = Date.now()) {
  const days = file?.[dir === 'back' ? 'back' : 'to']?.[airport];
  if (!days || !(date in days)) return undefined;
  const v = days[date];
  if (v === null) return null;
  const leg = fromDay(date, v);
  return leg && now - leg.checked <= MAX_AGE_MS ? leg : undefined;
}

/** The cheapest swept flight in a month ('2026-11') or over all days: a leg or null. */
export function sweptCheapest(file, dir, airport, month = null, now = Date.now()) {
  const days = file?.[dir === 'back' ? 'back' : 'to']?.[airport];
  if (!days) return null;
  let best = null;
  for (const [date, v] of Object.entries(days)) {
    if (month && !date.startsWith(month)) continue;
    const leg = fromDay(date, v);
    if (!leg || now - leg.checked > MAX_AGE_MS) continue;
    if (!best || leg.price < best.price) best = leg;
  }
  return best;
}

/**
 * The flight for one direction of a trip: the cheapest live flight in the
 * hours wanted, else the swept one if it fits those hours.
 * live: the /api/flights answer for that day ({checked, flights}) or null.
 */
export function pickLeg({ file, live, dir, airport, date, hours = 'any', now = Date.now() }) {
  if (live && Array.isArray(live.flights)) {
    const f = live.flights.find((x) => fitsHours(x.dep, hours));
    if (f) {
      return {
        date, price: f.price, airline: f.airline, dep: f.dep, arr: f.arr, stops: f.stops,
        flightNo: f.flightNo, checked: Date.parse(live.checked) || now, source: 'live', link: live.link,
      };
    }
    if (live.flights.length === 0) return null;
  }
  const swept = sweptDay(file, dir, airport, date, now);
  if (swept === null) return null;
  if (swept && fitsHours(swept.dep, hours)) return swept;
  return undefined;
}

/**
 * What one leg costs the party: fare per seat times the seats that pay
 * (babies on a lap fly almost free and are left out), plus the bag on
 * `bagKey` for everyone with a seat.
 * party: { paying } ; returns { fare, bags, bagsKnown, total, perSeat }
 */
export function legCost(leg, { paying = 1, bagKey = 'small' } = {}) {
  if (!leg) return null;
  const seats = Math.max(1, paying);
  const bag = bagFee(leg.airline, bagKey);
  const fare = leg.price * seats;
  const bags = bag.eur * seats;
  return { fare, bags, bagsKnown: bag.known, total: fare + bags, perSeat: leg.price + bag.eur };
}

/** The Google Flights search for a route: one way on `date`, or the return
 *  when `back` is given, in the reader's language (T537: the app and the
 *  sweep Worker used to build two different links, the Worker's always in
 *  English, and a pair of flights linked to two one-way searches). */
export function googleFlightsLink(from, to, date, { back = null, lang = 'en' } = {}) {
  const what = back
    ? `Flights from ${from} to ${to} on ${date} returning ${back}`
    : `Flights from ${from} to ${to} on ${date} one way`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(what)}&curr=EUR&hl=${encodeURIComponent(lang)}`;
}

/**
 * The return trip from the home airport's file: cheapest out in `month` and
 * cheapest back in the same month or the next, for a card's "from" price.
 * Returns { out, back, perSeat } or null when either way has no flight.
 */
export function cheapestReturn(file, airport, month, now = Date.now()) {
  const out = sweptCheapest(file, 'out', airport, month, now);
  if (!out) return null;
  const back = sweptCheapest(file, 'back', airport, month, now)
    || sweptCheapest(file, 'back', airport, nextMonth(month), now);
  if (!back) return null;
  return { out, back, perSeat: out.price + back.price };
}

/**
 * Whenever is cheapest (T578, "any time"): the cheapest return over every
 * month the sweep has flights for, each month paired as cheapestReturn pairs
 * it, so the way home never comes before the way out.
 */
export function cheapestReturnAnyMonth(file, airport, now = Date.now()) {
  const days = file?.to?.[airport];
  if (!days) return null;
  const months = [...new Set(Object.keys(days).map((d) => d.slice(0, 7)))];
  let best = null;
  for (const m of months) {
    const r = cheapestReturn(file, airport, m, now);
    if (r && (!best || r.perSeat < best.perSeat)) best = r;
  }
  return best;
}

export function nextMonth(month) {
  if (!month) return null;
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/**
 * The swept flight nearest a wanted day, at most `spread` days either side
 * (the sweep checks every other day for two weeks, then one day a week on a
 * weekday that moves by one each week, so a wanted day is never more than
 * four days from a checked one), or
 * null. The leg keeps its own date, which every screen shows beside it, so a
 * price for the 19th is never presented as the 18th's.
 */
export function sweptNear(file, dir, airport, date, { spread = 4, now = Date.now() } = {}) {
  if (!date) return null;
  const at = Date.parse(`${date}T00:00:00Z`);
  let best = null;
  for (let k = 0; k <= spread; k++) {
    for (const s of k ? [-k, k] : [0]) {
      const day = new Date(at + s * 86400000).toISOString().slice(0, 10);
      const leg = sweptDay(file, dir, airport, day, now);
      if (leg && (!best || leg.price < best.price)) best = leg;
    }
    if (best) return best;
  }
  return null;
}

/**
 * A return flight for screens that price a stay at the app's dates (the
 * destination page, trip styles, curated weeks, city cards): out near
 * `outDate`, home near `backDate`, from the home airport's swept file.
 * Returns { out, back, fare, bags, bagsKnown, total, perSeat, checked } for
 * the party, or null when either way has no flight near those days.
 */
export function roundTripNear(file, airport, outDate, backDate, { paying = 1, bagKey = 'small', now = Date.now() } = {}) {
  if (!file || !airport || airport === file.from) return null;
  const out = sweptNear(file, 'out', airport, outDate, { now });
  const back = sweptNear(file, 'back', airport, backDate, { now });
  if (!out || !back) return null;
  const a = legCost(out, { paying, bagKey });
  const b = legCost(back, { paying, bagKey });
  return {
    out, back,
    fare: a.fare + b.fare,
    bags: a.bags + b.bags,
    bagsKnown: a.bagsKnown && b.bagsKnown,
    total: a.total + b.total,
    perSeat: a.perSeat + b.perSeat,
    checked: Math.min(out.checked, back.checked),
  };
}
