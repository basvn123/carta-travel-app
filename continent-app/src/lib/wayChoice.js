/**
 * Which way there to show first (T1100, ROADMAP D13, audit P-31).
 *
 * Every screen that prices the way to a place used to preselect the cheapest
 * way that reaches it. That put a car to Bergen and to the Amalfi coast on the
 * card (fuel split over the party is cheap; fifteen hours at the wheel is
 * not), and a 512 euro train to Taormina while flights existed. The rule now:
 *
 *   1. Door to door. Each way gets its hours from the traveller's door to the
 *      place: a ground way's hours already count the stations and the ferry;
 *      a flight adds the way to the home airport, check-in and security, and
 *      the transfer from the landing airport to the place.
 *   2. Far means fly. Above `fly_km` (straight line, home to place) a flight
 *      with a fare is the default, unless a ground way is both faster door to
 *      door and no dearer (then nobody would fly).
 *   3. Near means time and money. Below it the way with the lowest return
 *      price a person plus `eur_per_hour` for every door-to-door hour, there
 *      and back, wins.
 *
 * The pick is a default, never a filter: every way stays on the screen with
 * its own price, and the cheapest keeps its "Cheapest" mark. Without a fare
 * no flight is offered, so the rule never prefers a plane it cannot price.
 * The numbers live in config/pricing.json `way.choice`.
 *
 * Pure: no fetching, no React.
 */
import { haversineKm } from './nearby.js';
import { rule } from './price/config.js';

const cfg = () => rule('way.choice');

const clockMinutes = (s) => {
  const m = typeof s === 'string' ? /^(\d{1,2}):(\d{2})/.exec(s) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** The minutes a flight leg takes from its local clock times, or null.
 *  (Moved from browse/placeWays.js so the price engine can read it.) */
export function legDuration(leg) {
  const a = clockMinutes(leg?.dep);
  const b = clockMinutes(leg?.arr);
  if (a == null || b == null) return null;
  const d = b - a;
  return d > 0 ? d : d + 1440;
}

/** The straight-line km from the traveller's start to the place, or null. */
export function wayKm(home, dest) {
  const a = home;
  const b = dest;
  const lat = b?.city_lat ?? b?.lat;
  const lon = b?.city_lon ?? b?.lon;
  if (!Number.isFinite(a?.lat) || !Number.isFinite(a?.lon) || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const km = haversineKm(a.lat, a.lon, lat, lon);
  return Number.isFinite(km) ? Math.round(km) : null;
}

/** Minutes from the landing airport to the place: 0 for a place with its own
 *  airport, the stored transfer for a gem, null when nobody knows. */
export function transferMinutesOf(dest) {
  if (!dest) return null;
  if (dest.tier === 'airport') return 0;
  const m = dest.transfer?.transfer_minutes_one_way;
  return Number.isFinite(m) ? m : null;
}

/** One way's door-to-door hours, one direction, or null when unknown. */
export function doorHours(way, { km = null, transferMinutes = null } = {}) {
  if (!way) return null;
  if (way.mode !== 'plane') return Number.isFinite(way.hours) && way.hours > 0 ? way.hours : null;
  const c = cfg();
  const air = Number.isFinite(way.minutes) && way.minutes > 0 ? way.minutes / 60
    : Number.isFinite(km) ? km / c.plane_kmh + c.plane_taxi_hours : null;
  if (air == null) return null;
  const transfer = Number.isFinite(transferMinutes) ? transferMinutes / 60 : c.unknown_transfer_hours;
  return air + c.plane_overhead_hours + transfer;
}

const lowest = (list, key) => list.reduce((a, b) => (b[key] < a[key] ? b : a));

/**
 * The way to preselect among `ways` ([{ mode, perPerson, hours?, minutes? }]).
 *   km               straight-line km, home to place (wayKm)
 *   transferMinutes  landing airport to the place (transferMinutesOf)
 * Returns { pick, reason, cheapest, fastest, rows } or null for no ways.
 *   pick     the mode to preselect
 *   reason   'distance' (far, so the flight), 'beats_flight' (far, but a
 *            ground way is faster and no dearer), 'time_cost' (near: lowest
 *            price plus time), 'only' (one way)
 *   cheapest the lowest return price a person
 *   fastest  the fewest door-to-door hours (null when fewer than two are known)
 *   rows     the ways with doorHours and score added, in the order given
 */
export function chooseWay(ways, { km = null, transferMinutes = null } = {}) {
  const list = (ways || []).filter((w) => w && Number.isFinite(w.perPerson) && w.perPerson > 0);
  if (!list.length) return null;
  const c = cfg();
  const rows = list.map((w) => {
    const h = doorHours(w, { km, transferMinutes });
    return { ...w, doorHours: h, score: h == null ? Infinity : w.perPerson + c.eur_per_hour * 2 * h };
  });
  const cheapest = lowest(rows, 'perPerson').mode;
  const timed = rows.filter((w) => w.doorHours != null);
  const fastest = timed.length > 1 ? lowest(timed, 'doorHours').mode : null;
  const out = (pick, reason) => ({ pick, reason, cheapest, fastest, rows });
  if (rows.length === 1) return out(rows[0].mode, 'only');

  const plane = rows.find((w) => w.mode === 'plane');
  if (plane && Number.isFinite(km) && km >= c.fly_km) {
    const beats = rows.filter((w) => w.mode !== 'plane' && w.doorHours != null && plane.doorHours != null
      && w.doorHours <= plane.doorHours && w.perPerson <= plane.perPerson);
    return beats.length ? out(lowest(beats, 'score').mode, 'beats_flight') : out('plane', 'distance');
  }
  // A way with unknown hours cannot be weighed on time; with none known the
  // cheapest stays the pick, as before.
  if (!timed.length) return out(cheapest, 'time_cost');
  return out(lowest(timed, 'score').mode, 'time_cost');
}
