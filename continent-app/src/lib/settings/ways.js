/**
 * The way there for every Explore row at once (G12, D10), pure, so a node
 * test and a node timing can run exactly what the list runs.
 *
 * Every row keeps its place in the list whatever the settings say: a way
 * that has no figure becomes notKnownWay(mode) (lib/travelWay.js), never a
 * removed row (decision "Layout stability": no row removed by a setting).
 *
 * Flights come from every home airport file the app holds: the selected
 * one (data.flights) and the ticked or country airports (data.flightsBy,
 * T861), each place priced from the cheapest (lib/price/flight.js
 * cheapestFlight). The pair search and the typical fare are memoised per
 * route in lib/flights/pairs.js, and the flight per anchor airport here,
 * so 3,868 places cost about 260 route lookups.
 */
import { wayFor, notKnownWay, groundReturn } from '../travelWay.js';
import { cheapestFlight } from '../price/flight.js';
import { flightWindow } from '../price/request.js';
import { destAnchor } from '../origins.js';
import { legDuration } from '../wayChoice.js';

// Ground ways depend on the start, the party and the place only, never on
// the dates: kept per catalogue for the last few starts, so a When change
// with Best way reprices flights alone (measured: 150 ms to about 10 ms).
const GROUND_STARTS = 4;
const groundMemo = new WeakMap();
function groundFor(destinations, home, party) {
  if (!destinations || !home) return null;
  let byStart = groundMemo.get(destinations);
  if (!byStart) { byStart = new Map(); groundMemo.set(destinations, byStart); }
  const key = JSON.stringify([home.lat, home.lon, home.iso2 || null, party ? [party.adults, party.children, party.babies] : null]);
  if (!byStart.has(key)) {
    if (byStart.size >= GROUND_STARTS) byStart.delete(byStart.keys().next().value);
    byStart.set(key, new Map());
  }
  const memo = byStart.get(key);
  return (dest, id) => (mode) => {
    const k = `${id}|${mode}`;
    if (!memo.has(k)) memo.set(k, groundReturn(dest, home, mode, party));
    return memo.get(k);
  };
}

/** The distinct flight files the app holds: data.flights first. */
export function flightFiles(data) {
  const out = [];
  const seen = new Set();
  for (const f of [data?.flights, ...Object.values(data?.flightsBy || {})]) {
    if (f && !seen.has(f)) { seen.add(f); out.push(f); }
  }
  return out;
}

/** The part of a request a way there depends on, as a string: the memo key
 *  for the whole list (a price view or span change leaves it alone). */
export function wayKey(request, mode, home, party) {
  const w = flightWindow(request);
  return JSON.stringify([
    w.kind, w.from || null, w.to || null, w.ym || null, request?.nights || null, request?.baggage || null,
    mode, home ? [home.lat, home.lon] : null,
    party ? [party.adults, party.children, party.babies] : null,
  ]);
}

/**
 * @param {object} p
 *   rows         the catalogue rows ({ id, cost, ... })
 *   destinations data.destinations
 *   files        flightFiles(data)
 *   request      the price request
 *   mode         'any' | 'plane' | 'train' | 'bus' | 'car'
 *   home         homePoint (null: ground ways are not known)
 *   party        partyOf
 *   now          epoch ms
 * @returns {Map<string, object>} id -> the row with cost.way set and fmin
 *   (the outbound flight's minutes, null without a dated flight)
 */
export function wayRowsFor({ rows, destinations, files, request, mode, home, party, now = Date.now() }) {
  const m = new Map();
  const flies = mode === 'plane' || mode === 'any';
  const byAnchor = new Map();
  const ground = groundFor(destinations, home, party);
  for (const p of rows || []) {
    const d = destinations?.[p.id];
    const anchor = destAnchor(d);
    let flight = null;
    if (flies && anchor && files?.length) {
      if (!byAnchor.has(anchor)) {
        const f = cheapestFlight(files, anchor, request, now);
        byAnchor.set(anchor, f ? {
          perSeat: f.perSeat,
          airline: f.out?.airline || null,
          // T1100: the air time in the door-to-door weighing (a typical
          // fare has no clock times, so it weighs on distance).
          minutes: legDuration(f.out),
          typical: f.typical,
          from: f.from,
          dates: f.typical ? null : { out: f.out.date, back: f.back.date },
        } : null);
      }
      flight = byAnchor.get(anchor);
    }
    const way = wayFor(d || p, mode, { home, party, flight, ground: ground && ground(d || p, p.id) });
    m.set(p.id, {
      ...p,
      cost: { ...p.cost, way: way || notKnownWay(mode) },
      fmin: flight && !flight.typical ? flight.minutes : null,
    });
  }
  return m;
}
