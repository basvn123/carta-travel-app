/**
 * Every walk on a day plan, checked before it is drawn (T433).
 *
 * The owner's rule: Carta must never send somebody down a route they get
 * stuck on. Language models are measurably bad at this (an audit of AI
 * itineraries found an error in nine of ten, a quarter with impossible
 * routing), so no model draws a route here. The order of a day comes from
 * code (daySpread.js), and every leg is routed on OpenStreetMap's footpaths
 * by OSRM and then judged by this file:
 *
 *   ok        a real footpath, about as long as the crow flies allows
 *   long      a real footpath, but longer than this pace walks between two
 *             sights: drawn as a walk, with the transit way offered beside it
 *   detour    the footpath exists but runs far round (a river with no bridge
 *             near, a motorway, a fenced estate): never drawn as a walk
 *   unrouted  OSRM found no footpath at all: never drawn as a walk
 *   far       further from the start than a day on foot reaches: a ride
 *   ferry     the path crosses water by boat: drawn as the ferry it is
 *   unreachable  one end lies further than OFF_PATH_M from any path (a reef, a
 *             protected seabed, a summit with no trail mapped): the router
 *             snapped it to the nearest path, which is not the place, so the
 *             leg is never drawn as a walk to it
 *
 * A stop that lies far from the nearest path (a sight on a private estate, an
 * island) is flagged on the stop itself (`offPathM`). There is no straight
 * line dressed up as a walk anywhere: a leg that was not routed says so.
 *
 * What this cannot check is opening hours, because the catalogue does not hold
 * them yet; the day says "Check hours" on each stop instead of guessing.
 */
import { fetchWalkingRoute } from './routing.js';
import { kmBetween } from './daySpread.js';

// The longest leg on foot between two sights, by pace (km). Past it the leg
// is still a walk, but the day offers the bus beside it.
export const PACE_LEG_KM = { relaxed: 1.5, balanced: 2.2, packed: 3 };
// Step-free (a pushchair, a wheelchair): shorter, whatever the pace.
export const STEP_FREE_LEG_KM = 0.9;
// A footpath this many times the straight line, and this much longer, is a
// path round something, not a walk to it.
export const DETOUR_RATIO = 2.5;
export const DETOUR_EXTRA_KM = 1.5;
// No stop of a walking day further than this from where the day starts.
export const FAR_KM = 18;
// A stop this far from the nearest path is not reached by the route.
export const OFF_PATH_M = 350;
// A place the footpaths do not reach is not walked to: a leg touching a stop
// further than OFF_PATH_M from any path is unreachable, never a walk. The
// T433 verification found why one threshold is the honest one: two marine
// reserves at Cinque Terre snapped 484 m and 285 m to a coastal path; OSRM
// called the leg 0.8 km, Valhalla 13 km. Neither router reaches the place,
// so the day says so and offers the ride instead of drawing a walk.
export const UNREACHABLE_M = OFF_PATH_M;

/** Judge one routed leg. `leg` is routing.js's leg (or null when unrouted). */
export function legStatus({ from, to, leg, maxLegKm, start = null }) {
  if (start && kmBetween(start, to) > FAR_KM) return 'far';
  if (!leg) return 'unrouted';
  const straight = kmBetween(from, to);
  const km = Number(leg.km) || 0;
  if (Number.isFinite(straight) && km > straight * DETOUR_RATIO && km - straight > DETOUR_EXTRA_KM) return 'detour';
  if (leg.ferry) return 'ferry';
  const walked = Number.isFinite(leg.walkKm) && leg.walkKm > 0 ? leg.walkKm : km;
  if (walked > maxLegKm) return 'long';
  return 'ok';
}

/** Legs a traveller may be shown as a walk. */
export const isWalkable = (status) => status === 'ok' || status === 'long' || status === 'ferry';

const cacheKey = (pts) => pts.map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`).join(';');
const memo = new Map();
function remember(key, value) {
  memo.set(key, value);
  try { sessionStorage.setItem(`carta.route.${key}`, JSON.stringify(value)); } catch { /* storage off */ }
}
function recall(key) {
  if (memo.has(key)) return memo.get(key);
  try {
    const raw = sessionStorage.getItem(`carta.route.${key}`);
    if (raw) { const v = JSON.parse(raw); memo.set(key, v); return v; }
  } catch { /* storage off */ }
  return undefined;
}

/** Walking speed by party: groups and step-free days walk slower than OSRM's 5 km/h. */
export function walkFactor({ groupSize = 2, stepFree = false } = {}) {
  if (stepFree) return 5 / 3.4;
  if (groupSize >= 5) return 5 / 3.8;
  return 5 / 4.5;
}

/**
 * Route and judge one day.
 *
 *   points    the day's stops in order, [{ lat, lon }]
 *   start     where the day leaves from ({ lat, lon }) or null
 *   pace      'relaxed' | 'balanced' | 'packed'
 *   stepFree  shorter legs and a slower walk
 *   startsAtStart  false when the first hop from the start is a ride already
 *             (the stay is far from the first sight); that hop is then not
 *             routed on foot at all
 *   fetchRoute  injectable for tests (routing.js fetchWalkingRoute)
 *
 * Resolves { legs, offPath, checked, walkKm, walkMin } where legs[i] joins
 * waypoint i to i+1 of [start?, ...points]: { km, min, coords, status,
 * straightKm, ferry }. `checked` is false when not one leg could be routed
 * (offline), so the caller can say "Route not checked" rather than imply it.
 */
export async function routeDay(points, {
  start = null, pace = 'balanced', stepFree = false, groupSize = 2,
  startsAtStart = true, fetchRoute = fetchWalkingRoute,
} = {}) {
  const stops = (points || []).filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon));
  const lead = start && startsAtStart && Number.isFinite(start.lat) ? [start] : [];
  const pts = [...lead, ...stops];
  const maxLegKm = stepFree ? STEP_FREE_LEG_KM : (PACE_LEG_KM[pace] || PACE_LEG_KM.balanced);
  const factor = walkFactor({ groupSize, stepFree });
  if (pts.length < 2) return { legs: [], offPath: [], checked: true, walkKm: 0, walkMin: 0, maxLegKm };

  const key = cacheKey(pts);
  let r = recall(key);
  if (r === undefined) {
    r = await fetchRoute(pts);
    if (!r) r = await fetchRoute(pts); // one retry: the public instance drops the odd request
    if (r) remember(key, r);
  }

  // The whole day in one request failed or came back misaligned: route the
  // legs one by one, so one bad point does not cost the whole day its checks.
  let legsRaw = r && Array.isArray(r.legs) && r.legs.length === pts.length - 1 ? r.legs : null;
  let snap = r?.snapM || [];
  if (!legsRaw) {
    legsRaw = [];
    snap = [];
    for (let i = 0; i < pts.length - 1; i += 1) {
      const pair = [pts[i], pts[i + 1]];
      const k = cacheKey(pair);
      let one = recall(k);
      if (one === undefined) {
        one = await fetchRoute(pair);
        if (one) remember(k, one);
      }
      legsRaw.push(one?.legs?.[0] || null);
      if (i === 0) snap.push(one?.snapM?.[0] ?? null);
      snap.push(one?.snapM?.[1] ?? null);
    }
  }

  let walkKm = 0;
  let walkMin = 0;
  const legs = legsRaw.map((leg, i) => {
    const from = pts[i];
    const to = pts[i + 1];
    const farFromPath = [snap[i], snap[i + 1]].some((m) => Number.isFinite(m) && m > UNREACHABLE_M);
    const status = leg && farFromPath ? 'unreachable' : legStatus({ from, to, leg, maxLegKm, start });
    const straightKm = kmBetween(from, to);
    const min = leg ? Math.max(1, Math.round((leg.walkMin || leg.min || 0) * factor) + (leg.ferryMin || 0)) : null;
    if (leg && isWalkable(status)) {
      walkKm += Number(leg.walkKm || leg.km) || 0;
      walkMin += min || 0;
    }
    return {
      km: leg ? leg.km : null,
      min,
      ferry: !!leg?.ferry,
      coords: leg?.coords?.length >= 2 ? leg.coords : [[from.lon, from.lat], [to.lon, to.lat]],
      status,
      straightKm,
    };
  });

  // Off-path stops, indexed into `points` (the lead start is not a stop).
  const offPath = stops.map((_, i) => {
    const m = snap[i + lead.length];
    return Number.isFinite(m) && m > OFF_PATH_M ? Math.round(m) : null;
  });

  return {
    legs,
    offPath,
    checked: legs.some((l) => l.status !== 'unrouted'),
    walkKm: Math.round(walkKm * 10) / 10,
    walkMin,
    maxLegKm,
    lead: lead.length,
  };
}

/** Map segments for TripMap: walk, ferry, or ride per leg's verdict. */
export function routeSegments(day) {
  return (day?.legs || []).map((l) => ({
    mode: l.status === 'ferry' ? 'ferry' : isWalkable(l.status) ? 'walk' : 'ride',
    coordinates: isWalkable(l.status) ? l.coords : [l.coords[0], l.coords[l.coords.length - 1]],
  }));
}

/**
 * The day's own checks, beyond the legs: nothing twice, nothing without a
 * position, done before the traveller said they wanted to be back.
 *   items   the day's stops ({ name, lat, lon, key? })
 *   endMin  when the schedule finishes; backBy the traveller's answer (min)
 */
export function dayChecks(items, { endMin = null, backBy = null } = {}) {
  const seen = new Set();
  const dupes = [];
  const unplaced = [];
  (items || []).forEach((it, i) => {
    const k = (it?.key || `${(it?.name || '').toLowerCase()}|${it?.lat?.toFixed?.(4)}`);
    if (seen.has(k)) dupes.push(i);
    seen.add(k);
    if (!Number.isFinite(it?.lat) || !Number.isFinite(it?.lon)) unplaced.push(i);
  });
  return {
    dupes,
    unplaced,
    late: Number.isFinite(endMin) && Number.isFinite(backBy) && endMin > backBy,
  };
}
