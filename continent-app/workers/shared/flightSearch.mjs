/**
 * One Google Flights search: every flight of one day on one route (T513).
 *
 * Shared by the sweep Worker (workers/flight-sweep) and the live Pages
 * Function (functions/api/flights.js), so both read Google the same way.
 * The search itself is fli-js (vendored in ./fli, bundled to fli.bundle.mjs),
 * which loads the public Google Flights results page and reads the data
 * embedded in it. One call is one page load.
 *
 * searchDay() never throws. It answers
 *   { ok: true,  flights: [...], link }       a normal page (flights may be [])
 *   { ok: false, blocked: true,  reason }     Google refused us: back off
 *   { ok: false, blocked: false, reason }     anything else (timeout, parse)
 *
 * A flight is { price, airline, airlineName, flightNo, dep, arr, stops, min,
 * via } with dep/arr as the airport's local 'HH:MM' and price in EUR for one
 * adult. Flights are sorted cheapest first and capped at MAX_FLIGHTS.
 */
import {
  Airport, Client, FlightSearchFilters, FlightSegment, MaxStops, SearchFlights, SeatType, SortBy,
} from './fli.bundle.mjs';

export const MAX_FLIGHTS = 12;
const LOCALE = { currency: 'EUR', language: 'en', country: 'BE' };
const IATA = /^[A-Z]{3}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Which refusal a raw Google answer shows, or null for a normal page. */
export function blockReason(status, url, body) {
  if (status === 429) return 'http429';
  if (status >= 400) return `http${status}`;
  if (url.includes('/sorry/')) return 'sorry';
  if (url.includes('consent.google')) return 'consent';
  if (/unusual traffic/i.test(body)) return 'captcha';
  if (!body.includes('ds:1')) return 'empty';
  return null;
}

/** fli's FlightResult to Carta's compact flight. */
export function toFlight(f) {
  const legs = f.legs || [];
  const first = legs[0];
  const last = legs[legs.length - 1];
  if (!first || typeof f.price !== 'number' || !(f.price > 0)) return null;
  const code = String(f.primary_airline || first.airline || '').replace(/^_/, '');
  return {
    price: Math.round(f.price),
    airline: code,
    airlineName: f.primary_airline_name || first.airline_name || code,
    flightNo: `${String(first.airline).replace(/^_/, '')}${first.flight_number ?? ''}`,
    dep: hhmm(first.departure_datetime),
    arr: hhmm(last.arrival_datetime),
    stops: f.stops ?? Math.max(0, legs.length - 1),
    min: f.duration ?? null,
    via: legs.slice(0, -1).map((l) => String(l.arrival_airport).replace(/^_/, '')),
  };
}

/**
 * @param {{from: string, to: string, date: string, fetchImpl?: typeof fetch,
 *          directOnly?: boolean, timeoutMs?: number}} q
 */
export async function searchDay({ from, to, date, fetchImpl, directOnly = false, timeoutMs = 15000 }) {
  if (!IATA.test(from) || !IATA.test(to) || !DATE.test(date) || from === to) {
    return { ok: false, blocked: false, reason: 'bad-query' };
  }
  if (!Airport[from] || !Airport[to]) return { ok: false, blocked: false, reason: 'unknown-airport' };
  const doFetch = fetchImpl || ((u, i) => fetch(u, i));
  let refused = null;
  // Workers throw "Illegal invocation" when fetch is called unbound, so fli
  // always gets a wrapper; the wrapper also reads every answer for refusals.
  const watched = async (u, init) => {
    const res = await doFetch(u, init);
    const body = await res.text();
    refused = refused || blockReason(res.status, res.url || String(u), body);
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  };
  try {
    const client = new Client({ fetchImpl: watched, retries: 1, timeoutMs });
    const filters = new FlightSearchFilters({
      passenger_info: { adults: 1, children: 0, infants_in_seat: 0, infants_on_lap: 0 },
      flight_segments: [new FlightSegment({
        departure_airport: [[[Airport[from], 0]]],
        arrival_airport: [[[Airport[to], 0]]],
        travel_date: date,
      })],
      seat_type: SeatType.ECONOMY,
      stops: directOnly ? MaxStops.NON_STOP : MaxStops.ANY,
      sort_by: SortBy.CHEAPEST,
    });
    const search = new SearchFlights(client);
    const rows = (await search.search(filters, LOCALE)) || [];
    if (refused && refused !== 'empty') return { ok: false, blocked: true, reason: refused };
    const flights = rows.map(toFlight).filter(Boolean)
      .sort((a, b) => a.price - b.price).slice(0, MAX_FLIGHTS);
    return { ok: true, flights, link: googleLink(from, to, date) };
  } catch (e) {
    if (refused && refused !== 'empty') return { ok: false, blocked: true, reason: refused };
    return { ok: false, blocked: false, reason: `${e?.name || 'Error'}: ${String(e?.message || e).slice(0, 120)}` };
  }
}

/** The Google Flights page for one route and day, for the traveller to book from. */
export function googleLink(from, to, date) {
  const q = encodeURIComponent(`Flights from ${from} to ${to} on ${date} one way`);
  return `https://www.google.com/travel/flights?q=${q}&curr=EUR&hl=en`;
}
