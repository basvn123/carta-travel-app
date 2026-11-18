/**
 * Where a trip starts, for the three Start kinds (G12, D10):
 *
 *   here     the browser's position, snapped to the nearest town in Carta's
 *            catalogue (nearestTown), so every way there starts from a
 *            place Carta can name
 *   place    a town the traveller picked (App's setFrom, as before)
 *   country  ground ways from the country's start town (countryStartTown);
 *            flights from every airport in the country the sweep covers
 *            (countryAirports), each place priced from the cheapest of them
 *            (lib/price/flight.js cheapestFlight). The UI names no airport;
 *            the price sheet may.
 *
 * "Best-connected town" (contract.md) is read as the country's airport town
 * nearest its capital, the rule FromPicker's countryAnchor already uses:
 * the logic critic (critique-logic.md, proposal C) found no station data to
 * rank towns by connections, and capitals are the rail and coach hubs of
 * every country here. FromPicker.jsx keeps its own copy until Lane 5
 * points it at CAPITALS below.
 *
 * Pure: no fetching, no React.
 */
import { haversineKm } from '../runtime_pricing.js';

/** Each country's capital, [lat, lon], by ISO2 (FromPicker.jsx's table). */
export const CAPITALS = Object.freeze({
  AD: [42.51, 1.52], AL: [41.33, 19.82], AM: [40.18, 44.51], AT: [48.21, 16.37], BA: [43.86, 18.41],
  BE: [50.85, 4.35], BG: [42.70, 23.32], BY: [53.90, 27.56], CH: [46.95, 7.45], CY: [35.17, 33.36],
  CZ: [50.08, 14.44], DE: [52.52, 13.40], DK: [55.68, 12.57], EE: [59.44, 24.75], ES: [40.42, -3.70],
  FI: [60.17, 24.94], FR: [48.86, 2.35], GB: [51.51, -0.13], GE: [41.72, 44.79], GR: [37.98, 23.73],
  HR: [45.81, 15.98], HU: [47.50, 19.04], IE: [53.35, -6.26], IS: [64.15, -21.94], IT: [41.90, 12.50],
  LT: [54.69, 25.28], LU: [49.61, 6.13], LV: [56.95, 24.11], MC: [43.74, 7.42], MD: [47.01, 28.86],
  ME: [42.44, 19.26], MK: [41.99, 21.43], MT: [35.90, 14.51], NL: [52.37, 4.90], NO: [59.91, 10.75],
  PL: [52.23, 21.01], PT: [38.72, -9.14], RO: [44.43, 26.10], RS: [44.79, 20.45], SE: [59.33, 18.07],
  SI: [46.06, 14.51], SK: [48.15, 17.11], TR: [39.93, 32.86], UA: [50.45, 30.52], XK: [42.66, 21.17],
});

const finite = (p) => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lon);

const isoCache = new WeakMap();
/** Country name -> ISO2, read off the catalogue (airports carry a name only). */
function isoByName(data) {
  const dests = data?.destinations;
  if (!dests) return new Map();
  let m = isoCache.get(dests);
  if (!m) {
    m = new Map();
    for (const d of Object.values(dests)) if (d?.country && d.iso2 && !m.has(d.country)) m.set(d.country, d.iso2);
    isoCache.set(dests, m);
  }
  return m;
}

/**
 * The town in Carta's catalogue nearest a point (the town's own centre,
 * city_lat/lon, where it has one). Returns { id, name, lat, lon, iso2,
 * country, km } or null.
 */
export function nearestTown(data, pt) {
  if (!finite(pt)) return null;
  let best = null;
  for (const [id, d] of Object.entries(data?.destinations || {})) {
    const lat = d?.city_lat ?? d?.lat;
    const lon = d?.city_lon ?? d?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const km = haversineKm(pt.lat, pt.lon, lat, lon);
    if (km != null && (!best || km < best.km)) best = { id, d, lat, lon, km };
  }
  if (!best) return null;
  const { d } = best;
  return { id: best.id, name: d.city || d.name || '', lat: best.lat, lon: best.lon, iso2: d.iso2 || null, country: d.country || '', km: best.km };
}

/** The airport towns of a country ({ name, lat, lon, codes }), one per town. */
function airportTowns(data, iso2) {
  const iso = isoByName(data);
  const towns = new Map();
  for (const [code, o] of Object.entries(data?.meta?.origins || {})) {
    if (!finite(o) || iso.get(o.country) !== iso2) continue;
    const name = o.city || o.name || code;
    if (!towns.has(name)) towns.set(name, { name, lat: o.lat, lon: o.lon, country: o.country, codes: [] });
    towns.get(name).codes.push(code);
  }
  return [...towns.values()];
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/**
 * Where ground ways start for a country: its airport town nearest the
 * capital (no capital listed: nearest the median of its towns). Returns
 * { name, lat, lon, iso2, country } (the town, named as itself) or null.
 */
export function countryStartTown(data, iso2) {
  const code = String(iso2 || '').toUpperCase();
  const towns = airportTowns(data, code);
  if (!towns.length) return null;
  const cap = CAPITALS[code];
  const at = cap ? { lat: cap[0], lon: cap[1] } : { lat: median(towns.map((x) => x.lat)), lon: median(towns.map((x) => x.lon)) };
  const off = (x) => (x.lat - at.lat) ** 2 + ((x.lon - at.lon) * Math.cos((at.lat * Math.PI) / 180)) ** 2;
  const town = [...towns].sort((a, b) => off(a) - off(b) || a.name.localeCompare(b.name))[0];
  return { name: town.name, lat: town.lat, lon: town.lon, iso2: code, country: town.country };
}

/** The most airports a country start loads (the URL's own cap, urlState oa). */
export const MAX_COUNTRY_AIRPORTS = 12;

/**
 * The country's airports the sweep has a file for, the most priced days
 * first (`swept`: IATA -> priced days, flightData loadSweptOrigins). With
 * `swept` unknown (null) every airport of the country is listed, so the
 * files can still be tried. Capped at MAX_COUNTRY_AIRPORTS.
 */
export function countryAirports(data, iso2, swept = null) {
  const code = String(iso2 || '').toUpperCase();
  const iso = isoByName(data);
  const list = [];
  for (const [iata, o] of Object.entries(data?.meta?.origins || {})) {
    if (iso.get(o?.country) !== code) continue;
    if (swept && !(swept[iata] > 0)) continue;
    list.push({ iata, days: swept ? swept[iata] : 0 });
  }
  return list
    .sort((a, b) => b.days - a.days || a.iata.localeCompare(b.iata))
    .slice(0, MAX_COUNTRY_AIRPORTS)
    .map((x) => x.iata);
}
