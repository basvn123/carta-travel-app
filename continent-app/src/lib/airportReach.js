/**
 * airportReach.js, the airports a traveller can reach from home (T860, T861;
 * plan flow v3 Batch C).
 *
 * The From town has more than one airport within a drive: Ghent has Brussels,
 * Charleroi, Lille and Eindhoven inside two hours. The traveller says how far
 * they would go (1, 2 or 3 hours, or picks airports one by one) and every
 * airport the flight sweep covers inside that reach is ticked; the finder and
 * the planner then price each one and fly from the cheapest door to door.
 *
 * The drive time is an estimate, kept in config/pricing.json
 * (origins.airport_access, kind estimate): the straight line times a road
 * factor, at one speed. The way to the airport and back is the cheaper of the
 * car (the car model's fuel and tolls, there and back twice, plus parking a
 * day) and the train or coach (ground.transfer_public, a ticket a seat each
 * way, children at their share). Pure: no React, no network.
 *
 *   airportsNear(meta, pt, { covered })   every airport within the longest
 *                                         reach, by drive time
 *   originsWithin(list, hours)            the covered ones a reach ticks
 *   homeAirports(meta, pt, codes)         the ticked ones with their drive
 *   accessCost(airport, party)            the way to it and back for a trip
 */
import { haversineKm } from './runtime_pricing.js';
import { ticketShare } from './party.js';
import { rule } from './price/config.js';

const ACCESS = rule('origins.airport_access');
const PUBLIC = rule('ground.transfer_public');
const CAR = rule('car.model');

/** The reaches the question offers, in hours, and the one preselected. */
export const REACH_HOURS = ACCESS.hours;
export const DEFAULT_REACH = ACCESS.default_hours;

const r2 = (n) => Math.round(n * 100) / 100;
const isPoint = (pt) => pt && Number.isFinite(pt.lat) && Number.isFinite(pt.lon ?? pt.lng);

/** The road km and the drive in minutes for a straight-line distance. */
export function driveOf(km) {
  const road = km * ACCESS.road_factor;
  return { roadKm: Math.round(road), minutes: Math.round((road / ACCESS.drive_kmh) * 60) };
}

/**
 * Every departure airport (meta.origins) within the longest reach of `pt`,
 * nearest drive first, each with whether the sweep has prices for it
 * (`covered`: the sweep index's origins; null while it is unknown counts
 * every airport as covered). A town with no priced airport inside the
 * longest reach also gets the nearest one that is priced, so the list is
 * never empty and always has one airport to fly from.
 *
 *   -> [{ iata, name, city, km, roadKm, minutes, covered }]
 */
export function airportsNear(meta, pt, { covered = null, maxHours = Math.max(...REACH_HOURS) } = {}) {
  if (!isPoint(pt)) return [];
  const lon = pt.lon ?? pt.lng;
  const all = [];
  for (const [iata, o] of Object.entries(meta?.origins || {})) {
    if (o?.lat == null || o?.lon == null) continue;
    const km = haversineKm(pt.lat, lon, o.lat, o.lon);
    if (km == null) continue;
    const d = driveOf(km);
    all.push({
      iata, name: o.name || o.city || iata, city: o.city || o.name || iata, km: Math.round(km), ...d,
      covered: covered ? (covered[iata] || 0) > 0 : true,
    });
  }
  all.sort((a, b) => a.minutes - b.minutes || a.iata.localeCompare(b.iata));
  const near = all.filter((a) => a.minutes <= maxHours * 60);
  if (near.some((a) => a.covered)) return near;
  // Nothing priced inside the longest reach: the nearest airports up to and
  // including the nearest one the sweep covers.
  const firstCovered = all.findIndex((a) => a.covered);
  return firstCovered < 0 ? (near.length ? near : all.slice(0, 1)) : all.slice(0, Math.max(near.length, firstCovered + 1));
}

/**
 * The airports a reach ticks: every covered one within `hours` of driving;
 * with none inside it, the nearest covered one (a reach never ticks nothing
 * while the sweep covers an airport in the list).
 */
export function originsWithin(list, hours) {
  const covered = (list || []).filter((a) => a.covered);
  const inside = covered.filter((a) => a.minutes <= hours * 60);
  return (inside.length ? inside : covered.slice(0, 1)).map((a) => a.iata);
}

/**
 * The ticked airports with their drive from `pt`, nearest drive first.
 * Codes the catalogue does not know are left out. Without a point the
 * drive is unknown (minutes null) and the codes keep their order.
 *
 *   -> [{ iata, city, km, roadKm, minutes }]
 */
export function homeAirports(meta, pt, codes) {
  const out = [];
  for (const iata of codes || []) {
    const o = meta?.origins?.[iata];
    if (!o) continue;
    if (isPoint(pt) && o.lat != null && o.lon != null) {
      const km = haversineKm(pt.lat, pt.lon ?? pt.lng, o.lat, o.lon);
      out.push({ iata, city: o.city || o.name || iata, km: Math.round(km), ...driveOf(km) });
    } else {
      out.push({ iata, city: o.city || o.name || iata, km: null, roadKm: null, minutes: null });
    }
  }
  return isPoint(pt) ? out.sort((a, b) => a.minutes - b.minutes) : out;
}

/**
 * The way to one home airport and back for the whole trip, for the party:
 * the cheaper of driving and parking there, and the train or coach.
 *
 *   airport  { roadKm, minutes } (homeAirports' row)
 *   party    { adults, children, babies, nights }
 *   -> { eur, mode: 'car' | 'public', minutes, parking } or null without a drive
 */
export function accessCost(airport, { adults = 1, children = 0, babies = 0, nights = 7 } = {}, car = CAR) {
  if (!airport || !Number.isFinite(airport.roadKm)) return null;
  const road = airport.roadKm;
  const seats = Math.max(1, adults + children);
  const cars = Math.ceil((seats + babies) / Math.max(1, car.car_capacity || 4));
  const perKm = (car.consumption_l_per_100km / 100) * car.fuel_price_eur_per_l + (car.toll_eur_per_100km || 0) / 100;
  const days = Math.max(1, Math.round(nights || 0) + 1);
  const parking = r2(ACCESS.parking_eur_per_day * days * cars);
  // Driven there and parked, then driven home from it: the road twice.
  const byCar = r2(perKm * road * 2 * cars + parking);
  // A ticket a seat each way, on the straight line's own detour.
  const straight = road / ACCESS.road_factor;
  const fare = Math.min(PUBLIC.cap_eur, Math.max(PUBLIC.floor_eur, PUBLIC.per_km_eur * straight * PUBLIC.detour));
  const weight = ticketShare({ adults, children, seats });
  const byPublic = r2(fare * seats * weight * 2);
  if (byCar <= byPublic) return { eur: byCar, mode: 'car', minutes: airport.minutes, parking };
  return { eur: byPublic, mode: 'public', minutes: Math.round(((straight * PUBLIC.detour) / PUBLIC.kmh) * 60), parking: 0 };
}

/**
 * The home airports a trip may fly from (T861), each with its swept flight
 * file: every ticked airport (data.meta.home_airports, nearest drive first),
 * else the app's one origin; an airport the trip is pinned to (`pinned`, a
 * swap the traveller made, the planner's anchorOrigin) is added when it is
 * not among them. `ticked` says whether the list came from the traveller's
 * reach answer, so the way to the airport is priced only then.
 *
 *   -> { homes: [{ iata, file, row }], ticked }
 */
export function homeCandidates(data, pinned = null) {
  const rows = Array.isArray(data?.meta?.home_airports) ? data.meta.home_airports : [];
  const fileFor = (iata) => data?.flightsBy?.[iata] || (data?.flights?.from === iata ? data.flights : null);
  const one = data?.meta?.selected_origin || null;
  const codes = rows.length ? rows.map((r) => r.iata) : (one ? [one] : []);
  if (pinned && !codes.includes(pinned)) codes.push(pinned);
  return {
    homes: codes.map((iata) => ({ iata, file: fileFor(iata), row: rows.find((r) => r.iata === iata) || null })),
    ticked: rows.length > 0,
  };
}
