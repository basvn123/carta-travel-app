/**
 * origins.js, the "where are you flying from?" layer.
 *
 * The dataset ships a deduplicated top-level fares table (harvest_all_origins.py):
 *   data.fares[anchor_iata][origin_iata] = { out: {date: eur}, ret: {date: eur},
 *     out_t/ret_t: {date: 'HH:MM/HH:MM'} }   (times optional, harvest_flight_times.py)
 * covering every European Ryanair origin (data.meta.all_origins), keyed by the
 * airport a destination is reached through, NOT per destination. Ground transport
 * (the airport->town last leg) is origin-independent and still lives per
 * destination (airport-tier dests fly straight in; gems carry `transfer`).
 *
 * Rather than teach every pricing consumer about the new table, we REHYDRATE each
 * destination's `routes` for the one chosen origin, back into the exact shape the
 * app already reads (`d.routes[origin] = { outbound_fare, return_fare, anchor_airport,
 * ground_transport_one_way_eur, ground_transport_minutes }`). So runtime_pricing,
 * the wizard, the cost optimizer and the planners all keep working unchanged, they
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

/** Build a destination's `routes` for a single origin from that origin's fare
 *  slice ({ anchor: rec }). Returns {} when this origin can't reach the
 *  destination by air (no stored fare, or an unpriceable last leg), exactly
 *  how a non-served route reads today. */
function routesForOrigin(faresForOrigin, d, origin) {
  const anchor = destAnchor(d);
  const rec = anchor ? faresForOrigin?.[anchor] : null;
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
      // Contract A provenance, absent on legacy slices (read side stays
      // tolerant): s = source that created the record's base fares
      // ('FR'|'W6'|'VY'|'V7'|'TP'), o = epoch DAY the record's prices were
      // last confirmed by a harvest. Per-day refinements (Travelpayouts cache
      // quotes) ride beside the carrier maps below: the observed/expires
      // epoch day of date D is outbound_seen[D] ?? o / outbound_expires[D].
      ...(rec.s != null ? { s: rec.s } : {}),
      ...(rec.o != null ? { o: rec.o } : {}),
      ...(rec.out_o ? { outbound_seen: rec.out_o } : {}),
      ...(rec.ret_o ? { return_seen: rec.ret_o } : {}),
      ...(rec.out_x ? { outbound_expires: rec.out_x } : {}),
      ...(rec.ret_x ? { return_expires: rec.ret_x } : {}),
      // Dep/arr local times of each day's cheapest flight ('HH:MM/HH:MM',
      // harvest_flight_times.py). Partial coverage, absent days show no hour.
      outbound_time: rec.out_t || {},
      return_time: rec.ret_t || {},
      // Days where a non-Ryanair source won the cheapest-wins merge
      // ({date: 'W6'|'VY'|'V7'|'TP'}, harvest_wizzair/vueling/volotea.py plus
      // the Travelpayouts staging merge). Untagged days are Ryanair fares.
      outbound_carrier: rec.out_c || {},
      return_carrier: rec.ret_c || {},
      fare_model: 'ryanair_all_origins',
    },
  };
}

/** This origin's column of a legacy inline fares table
 *  (data.fares[anchor][origin] -> { anchor: rec }). */
export function sliceFaresForOrigin(fares, origin) {
  const out = {};
  for (const [anchor, byOrigin] of Object.entries(fares || {})) {
    const rec = byOrigin?.[origin];
    if (rec) out[anchor] = rec;
  }
  return out;
}

/** A copy of `data` whose destinations are priced from `origin`. Every dest gets
 *  a rebuilt `routes` (single-origin) and `meta.selected_origin` is stamped so UI
 *  can label the trip's departure without prop-drilling. Cheap enough to run on
 *  every origin change (a shallow clone per destination + a tiny routes object).
 *
 *  `faresForOrigin` is this origin's slice ({ anchor: rec }), fetched from
 *  /fares/{origin}.json since the wire split; older datasets that still ship
 *  the inline data.fares table are sliced here as a fallback. */
export function hydrateForOrigin(data, origin, faresForOrigin = null) {
  if (!data || !origin) return data;
  const slice = faresForOrigin || sliceFaresForOrigin(data.fares, origin);
  const src = data.destinations || {};
  const destinations = {};
  for (const [id, d] of Object.entries(src)) {
    destinations[id] = { ...d, routes: routesForOrigin(slice, d, origin) };
  }
  return { ...data, destinations, meta: { ...data.meta, selected_origin: origin } };
}

// How far from home we'll look for a departure airport. Ryanair concentrates on
// secondary airports, so the *nearest* airport is often the one that barely flies
// anywhere, and a traveller will happily drive an hour to the one that does.
const ORIGIN_SEARCH_KM = 120;

/** How many anchor airports this origin actually has fares to. Since the wire
 *  split the counts are precomputed at build time (meta.origin_coverage, see
 *  scripts/sync-data.mjs); the table walk remains for legacy datasets that
 *  still ship data.fares inline. */
export function originCoverage(data, code) {
  const pre = data?.meta?.origin_coverage;
  if (pre) return pre[code] || 0;
  let n = 0;
  for (const byOrigin of Object.values(data?.fares || {})) {
    const rec = byOrigin?.[code];
    if (rec?.out && Object.keys(rec.out).length > 0) n++;
  }
  return n;
}

/** The departure airport a first-time visitor should land on: of the origins
 *  within reach of home, the one with the richest route network (ties to the
 *  closer one). Picking purely by distance is what put Brussels-Zaventem, which
 *  reaches 10 destinations, ahead of Charleroi, which reaches 100, and left the
 *  map with almost nothing you could actually fly to. Falls back to the nearest
 *  origin, then the first listed (then 'CRL'), when there's no home / no fares. */
export function defaultOrigin(data) {
  const origins = data?.meta?.origins || {};
  const codes = Object.keys(origins);
  if (codes.length === 0) return 'CRL';
  const home = data?.meta?.home;
  if (home && home.lat != null) {
    const near = [];
    let nearest = null;
    for (const code of codes) {
      const o = origins[code];
      if (o.lat == null) continue;
      const km = haversineKm(home.lat, home.lon, o.lat, o.lon);
      if (km == null) continue;
      if (nearest == null || km < nearest.km) nearest = { code, km };
      if (km <= ORIGIN_SEARCH_KM) near.push({ code, km, coverage: originCoverage(data, code) });
    }
    near.sort((a, b) => (b.coverage - a.coverage) || (a.km - b.km));
    if (near.length > 0 && near[0].coverage > 0) return near[0].code;
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
