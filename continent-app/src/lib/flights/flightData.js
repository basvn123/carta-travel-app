/**
 * Loading the sweep's flight files and the airline index (T517).
 *
 * The files live on the data host only (R2, written by the flight-sweep
 * Worker every hour), never in public/: a dev server or a preview without
 * VITE_DATA_BASE still reads the live production files, so every build
 * shows the same, current prices.
 *
 *   flights/{IATA}.json    one home airport, both directions (publish.mjs)
 *   flights/_index.json    airlines seen: code -> { name, logo }
 *   airlines/{code}.png    a logo, copied from Google once per airline
 */
import { DATA_BASE } from '../dataHost.js';

export const FLIGHT_HOST = DATA_BASE || 'https://data.carta-europetravel.com/data';

const files = new Map();
let index = null;

export function flightFileUrl(origin) {
  return `${FLIGHT_HOST}/flights/${origin}.json`;
}

export function airlineLogoUrl(code) {
  return `${FLIGHT_HOST}/airlines/${code}.png`;
}

async function getJson(url) {
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

/** The home airport's flight file, or null when it has none yet. Cached per origin. */
export function loadFlightFile(origin) {
  if (!/^[A-Z]{3}$/.test(origin || '')) return Promise.resolve(null);
  if (!files.has(origin)) {
    files.set(origin, getJson(flightFileUrl(origin)).catch(() => {
      files.delete(origin); // try again on the next origin switch
      return null;
    }));
  }
  return files.get(origin);
}

/** The sweep's index (_index.json), once; null when it cannot be read. */
function loadIndex() {
  if (!index) {
    index = getJson(`${FLIGHT_HOST}/flights/_index.json`)
      .catch(() => { index = null; return null; });
  }
  return index;
}

/** code -> { name, logo } for every airline the sweep has seen ({} until it loads). */
export function loadAirlines() {
  return loadIndex().then((j) => j?.airlines || {});
}

/** T860: the home airports the sweep publishes a file for, IATA -> priced
 *  days ({} until it loads, null when the index cannot be read). An airport
 *  missing here has no prices yet. */
export function loadSweptOrigins() {
  return loadIndex().then((j) => (j ? j.origins || {} : null));
}
