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
// G12, D10 (lane 1, explore-top-2 profile): a re-price of the day figures
// gives every row a new object, and working out each place's way again cost
// about 0.3 s at 4x CPU though the way had not moved. A place's way depends
// only on the place and wayKey's inputs (and the hour, for which flights are
// still ahead), so it is kept per catalogue under that key.
const WAYS = new WeakMap();
function waysKept(destinations, files, key) {
  if (!destinations || typeof destinations !== 'object') return null;
  let byKey = WAYS.get(destinations);
  if (!byKey) { byKey = new Map(); WAYS.set(destinations, byKey); }
  const k = `${key}|${files?.length || 0}`;
  let kept = byKey.get(k);
  // The same files in the same order count as the same (each caller builds its own list).
  const same = kept && kept.files.length === (files?.length || 0) && kept.files.every((f, i) => f === files[i]);
  if (!same) {
    if (byKey.size > 8) byKey.clear();
    kept = { files: files || [], ids: new Map() };
    byKey.set(k, kept);
  }
  return kept.ids;
}

// One place's way and outbound minutes, with the flight per anchor shared.
function wayMaker({ destinations, files, request, mode, home, party, now }) {
  const flies = mode === 'plane' || mode === 'any';
  const byAnchor = new Map();
  const ground = groundFor(destinations, home, party);
  return (id, p) => {
    const d = destinations?.[id];
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
    const way = wayFor(d || p, mode, { home, party, flight, ground: ground && ground(d || p, id) }) || notKnownWay(mode);
    const fmin = flight && !flight.typical ? flight.minutes : null;
    return { way, fmin };
  };
}

const keptFor = ({ destinations, files, request, mode, home, party, now }) => waysKept(
  destinations, files, `${wayKey(request, mode, home, party)}|${Math.floor(now / 3600000)}`);

export function wayRowsFor({ rows, destinations, files, request, mode, home, party, now = Date.now() }) {
  const m = new Map();
  const args = { destinations, files, request, mode, home, party, now };
  const kept = keptFor(args);
  let one = null;
  for (const p of rows || []) {
    let hit = kept?.get(p.id);
    if (!hit) {
      one = one || wayMaker(args);
      hit = one(p.id, p);
      kept?.set(p.id, hit);
    }
    m.set(p.id, { ...p, cost: { ...p.cost, way: hit.way }, fmin: hit.fmin });
  }
  return m;
}

/**
 * G12, D10 (round 7): whether every row's way is already kept for these
 * inputs, so a caller can show the rows with their way "not known yet"
 * (notKnownWay) while warmWays works the rest out in slices, instead of
 * working out thousands of ways in one render (2.7 to 3.7 s at 4x CPU on
 * a desktop load, before the start town was known).
 */
export function waysReady({ rows, destinations, files, request, mode, home, party, now = Date.now() }) {
  const kept = keptFor({ destinations, files, request, mode, home, party, now });
  if (!kept) return true;
  for (const p of rows || []) if (!kept.has(p.id)) return false;
  return true;
}

/** The rows with their way not known yet (the same state a place with no
 *  figure shows), while warmWays runs. */
export function wayRowsPending({ rows, mode }) {
  const m = new Map();
  const way = notKnownWay(mode);
  for (const p of rows || []) m.set(p.id, { ...p, cost: { ...p.cost, way }, fmin: null });
  return m;
}

/**
 * G12, D10 (lane 1, round 3): the same ways worked out ahead, in short
 * slices, into the cache wayRowsFor reads, so the render that shows a new
 * start town or catalogue finds every place's way already known. Same
 * inputs as wayRowsFor; resolves false when `signal` aborts first.
 */
export async function warmWays({ destinations, files, request, mode, home, party, now = Date.now(), signal = null, sliceMs = 12 }) {
  const args = { destinations, files, request, mode, home, party, now };
  const kept = keptFor(args);
  if (!kept) return true;
  const one = wayMaker(args);
  const clock = () => (globalThis.performance?.now ? performance.now() : Date.now());
  let t0 = clock();
  for (const id of Object.keys(destinations || {})) {
    if (signal?.aborted) return false;
    if (!kept.has(id)) kept.set(id, one(id, null));
    if (clock() - t0 > sliceMs) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      t0 = clock();
    }
  }
  return true;
}

/**
 * One place as an Explore row: its day answer (priceDay) under `cost` with
 * the way there the list gives it, so a figure outside the list (the
 * Prices shown example) adds the same way, checked or typical, as its card.
 *
 *   day   the priceDay answer for the place (null: null)
 *   rest  as wayRowsFor
 */
export function placeRow({ id, day, destinations, files, request, mode, home, party, now = Date.now() }) {
  if (!id || !day) return null;
  return wayRowsFor({ rows: [{ id, cost: day }], destinations, files, request, mode, home, party, now }).get(id) || null;
}
