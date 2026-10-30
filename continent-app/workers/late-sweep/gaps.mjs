/**
 * The route list's blind spot (T915). _routes.json comes from Eurostat, where
 * a route shows up when either end's country reports it. Between two
 * countries that do not report (the UK, Czechia, the Channel Islands,
 * Albania, Kosovo, ...) no route is listed at all, so London to Prague or
 * London to Edinburgh is never searched. The box's gap search looks at those
 * pairs once, direct flights only, and sends the ones with a flight to the
 * Worker as found routes.
 */
import { km, FIND_MIN_KM } from '../flight-sweep/src/plan.mjs';

export const AIRPORTS_CSV = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
// Eurostat's country codes that differ from ISO 3166.
const EUROSTAT_ISO = { EL: 'GR', UK: 'GB' };
// Europe, Iceland and the Azores to the Urals' foot. The list also has a few
// French overseas and African airports, where the gap is not Europe's.
const inEurope = ([lat, lon]) => lat >= 34 && lat <= 72 && lon >= -32 && lon <= 45;

/** One CSV line's fields (quoted fields may hold commas and doubled quotes). */
function fields(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/** OurAirports airports.csv to { IATA: ISO country }. */
export function airportCountries(csv) {
  const lines = csv.split(/\r?\n/);
  const head = fields(lines[0]);
  const ia = head.indexOf('iata_code');
  const ic = head.indexOf('iso_country');
  const out = {};
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const f = fields(line);
    if (/^[A-Z]{3}$/.test(f[ia]) && f[ic]) out[f[ia]] = f[ic];
  }
  return out;
}

/**
 * The pairs to look at: both airports Carta's, in Europe, both in a country
 * that does not report to Eurostat, at least FIND_MIN_KM apart, and no route either way
 * in `list` (flattenRoutes output, found routes included). Each pair once,
 * [a, b] with a < b, sorted.
 * @returns {Array<[string,string]>}
 */
export function gapPairs(routesJson, countries, list) {
  const reporters = new Set((routesJson.reporters || [])
    .map((c) => c.toUpperCase()).map((c) => EUROSTAT_ISO[c] || c));
  const known = new Set(list.map(([o, d]) => o + d));
  const codes = Object.keys(routesJson.airports)
    .filter((c) => countries[c] && !reporters.has(countries[c]) && inEurope(routesJson.airports[c])).sort();
  const out = [];
  for (let i = 0; i < codes.length; i++) {
    for (let j = i + 1; j < codes.length; j++) {
      const a = codes[i];
      const b = codes[j];
      if (known.has(a + b) || known.has(b + a)) continue;
      if (km(routesJson.airports[a], routesJson.airports[b]) < FIND_MIN_KM) continue;
      out.push([a, b]);
    }
  }
  return out;
}
