/**
 * origins.js, the "where are you flying from?" layer.
 *
 * Each destination's `routes` is rebuilt for the one chosen origin, in the
 * shape the pricing code reads (`d.routes[origin] = { anchor_airport,
 * ground_transport_one_way_eur, ground_transport_minutes }`): the airport the
 * trip lands at and the origin-independent last leg from it into town. A
 * destination gets a route when it has an anchor airport (its own, or the one
 * it is reached through) and Carta can price that last leg.
 *
 * There is no fare in a route. The old per-origin fare files and their
 * readers went in T511; the flight module (T517) adds flights back.
 */
import { haversineKm } from './runtime_pricing.js';

/** The airport a destination is reached through: its own anchor airport,
 *  else its IATA for airport-tier places. */
export function destAnchor(d) {
  return d?.anchor_airport || d?.iata || null;
}

/** The origin-independent airport->destination last leg, or null when we can't
 *  price it honestly (a gem with no stored transfer). Airport-tier destinations
 *  fly straight in (zero). Gems use their stored `transfer`. */
function lastLeg(d) {
  if (!d) return null;
  if (d.tier === 'airport') return { eur: 0, minutes: 0 };
  const t = d.transfer;
  if (t && (t.transfer_eur_one_way_pp != null || t.transfer_minutes_one_way != null)) {
    return { eur: t.transfer_eur_one_way_pp || 0, minutes: t.transfer_minutes_one_way || 0 };
  }
  return null; // ground-only gem: no honest door-to-door price from a flight
}

/** Build a destination's `routes` for a single origin. Returns {} when the
 *  destination has no anchor airport, the anchor is the origin itself, or the
 *  last leg cannot be priced honestly. */
function routesForOrigin(d, origin) {
  const anchor = destAnchor(d);
  if (!anchor || anchor === origin) return {};
  const leg = lastLeg(d);
  if (!leg) return {};
  return {
    [origin]: {
      anchor_airport: anchor,
      ground_transport_one_way_eur: leg.eur,
      ground_transport_minutes: leg.minutes,
    },
  };
}

/** A copy of `data` whose destinations carry routes from `origin`. Every dest
 *  gets a rebuilt `routes` (single-origin) and `meta.selected_origin` is
 *  stamped so UI can label the trip's departure without prop-drilling. Cheap
 *  enough to run on every origin change. */
export function withOriginRoutes(data, origin) {
  if (!data || !origin) return data;
  const src = data.destinations || {};
  const destinations = {};
  for (const [id, d] of Object.entries(src)) {
    destinations[id] = { ...d, routes: routesForOrigin(d, origin) };
  }
  return { ...data, destinations, meta: { ...data.meta, selected_origin: origin } };
}

/** The departure airport a first-time visitor should land on: the origin
 *  nearest home, then 'CRL' when listed, then the first listed. (Until T511
 *  this ranked nearby origins by how many places their fares reached; with
 *  the fares gone the nearest airport stands in.) */
export function defaultOrigin(data) {
  const origins = data?.meta?.origins || {};
  const codes = Object.keys(origins);
  if (codes.length === 0) return 'CRL';
  const home = data?.meta?.home;
  if (home && home.lat != null) {
    let nearest = null;
    for (const code of codes) {
      const o = origins[code];
      if (o.lat == null) continue;
      const km = haversineKm(home.lat, home.lon, o.lat, o.lon);
      if (km == null) continue;
      if (nearest == null || km < nearest.km) nearest = { code, km };
    }
    if (nearest) return nearest.code;
  }
  return codes.includes('CRL') ? 'CRL' : codes[0];
}

/** The origin airport's coordinates, for use as the driving home so the car
 *  comparison departs from the same place as the flight (never a stale, mixed
 *  "fly from Athens but drive from Brussels" estimate). Null when unknown. */
export function originHome(data, code) {
  const o = data?.meta?.origins?.[code];
  return o && o.lat != null && o.lon != null ? { lat: o.lat, lon: o.lon } : null;
}

/** "Charleroi (CRL)" style label for a chosen origin code. */
export function originLabel(data, code) {
  if (!code) return '';
  const o = data?.meta?.origins?.[code];
  return o ? `${o.city || o.name || code} (${code})` : code;
}

/** Origins grouped by country and sorted, for the picker. Each group:
 *  { country, items: [{ code, city, name }] }. An optional query filters by
 *  city / country / IATA (case-insensitive). */
export function originGroups(data, query = '') {
  const origins = data?.meta?.origins || {};
  const q = query.trim().toLowerCase();
  const byCountry = new Map();
  for (const [code, o] of Object.entries(origins)) {
    const city = o.city || o.name || code;
    const country = o.country || 'Other';
    if (q && !(`${city} ${country} ${code}`.toLowerCase().includes(q))) continue;
    if (!byCountry.has(country)) byCountry.set(country, []);
    byCountry.get(country).push({ code, city, name: o.name });
  }
  return [...byCountry.entries()]
    .map(([country, items]) => ({
      country,
      items: items.sort((a, b) => a.city.localeCompare(b.city)),
    }))
    .sort((a, b) => a.country.localeCompare(b.country));
}
