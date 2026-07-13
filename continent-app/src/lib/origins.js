/**
 * origins.js - the "where are you flying from?" layer.
 *
 * The dataset ships a deduplicated top-level fares table (harvest_all_origins.py):
 *   data.fares[anchor_iata][origin_iata] = { out: {date: eur}, ret: {date: eur} }
 * covering every European Ryanair origin (data.meta.all_origins), keyed by the
 * airport a destination is reached through - NOT per destination. Ground transport
 * (the airport->town last leg) is origin-independent and still lives per
 * destination (airport-tier dests fly straight in; gems carry `transfer`).
 *
 * Rather than teach every pricing consumer about the new table, we REHYDRATE each
 * destination's `routes` for the one chosen origin, back into the exact shape the
 * app already reads (`d.routes[origin] = { outbound_fare, return_fare, anchor_airport,
 * ground_transport_one_way_eur, ground_transport_minutes }`). So runtime_pricing,
 * the wizard, the cost optimizer and the planners all keep working unchanged - they
 * simply see fares from the selected origin. Changing origin re-derives and reprices.
 */
import { haversineKm } from './runtime_pricing.js';

/** The airport a destination is reached through (mirrors harvest_all_origins.py's
 *  anchor_set): its own anchor airport, else its IATA for airport-tier places. */
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

/** Build a destination's `routes` for a single origin from the fares table.
 *  Returns {} when this origin can't reach the destination by air (no stored
 *  fare, or an unpriceable last leg) - exactly how a non-served route reads today. */
function routesForOrigin(fares, d, origin) {
  const anchor = destAnchor(d);
  const rec = anchor ? fares?.[anchor]?.[origin] : null;
  if (!rec || !rec.out || Object.keys(rec.out).length === 0) return {};
  const leg = lastLeg(d);
  if (!leg) return {};
  return {
    [origin]: {
      anchor_airport: anchor,
      ground_transport_one_way_eur: leg.eur,
      ground_transport_minutes: leg.minutes,
      outbound_fare: rec.out,
      return_fare: rec.ret || {},
      fare_model: 'ryanair_all_origins',
    },
  };
}

/** A copy of `data` whose destinations are priced from `origin`. Every dest gets
 *  a rebuilt `routes` (single-origin) and `meta.selected_origin` is stamped so UI
 *  can label the trip's departure without prop-drilling. Cheap enough to run on
 *  every origin change (a shallow clone per destination + a tiny routes object). */
export function hydrateForOrigin(data, origin) {
  if (!data || !origin) return data;
  const fares = data.fares || {};
  const src = data.destinations || {};
  const destinations = {};
  for (const [id, d] of Object.entries(src)) {
    destinations[id] = { ...d, routes: routesForOrigin(fares, d, origin) };
  }
  return { ...data, destinations, meta: { ...data.meta, selected_origin: origin } };
}

/** The origin airport closest to the app's configured home point, so a first-time
 *  visitor lands on a sensible departure without choosing. Falls back to the first
 *  listed origin (then 'CRL') when there's no home / no coordinates. */
export function defaultOrigin(data) {
  const origins = data?.meta?.origins || {};
  const codes = Object.keys(origins);
  if (codes.length === 0) return 'CRL';
  const home = data?.meta?.home;
  if (home && home.lat != null) {
    let best = null;
    for (const code of codes) {
      const o = origins[code];
      if (o.lat == null) continue;
      const km = haversineKm(home.lat, home.lon, o.lat, o.lon);
      if (km != null && (best == null || km < best.km)) best = { code, km };
    }
    if (best) return best.code;
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
