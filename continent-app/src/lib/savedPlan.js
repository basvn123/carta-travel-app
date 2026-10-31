/**
 * savedPlan.js, "Plan a trip with these" from Saved for every kind (T942).
 *
 * The trip planner takes stops ({ destinationId, nights }) and, on each stop,
 * day activities (plain names the planner spreads over the stop's days,
 * useTripPlanner dayPlan). It has no stop for a trail or a beach. So:
 *
 *   a place        is a stop of its own, 2 nights (as T925 handed it over);
 *   a trail, beach, lake, mountain or cycling route
 *                  is a day activity at the nearest catalogue place within
 *                  80 km (lib/trailCards nearestDest, the same radius the
 *                  trail cards name their town with). When that place is
 *                  already a stop the activity joins it; otherwise the place
 *                  becomes a stop, its base.
 *   anything else  (a trip style, a region) or a thing with no place near
 *                  enough is not handed over, and is counted as such.
 *
 * A stop keeps at least 2 nights and gets one more night for each activity
 * beyond two, so every activity has a day, up to a week.
 *
 * Pure, for tests/savedPlan.test.mjs.
 */
import { nearestDest } from './trailCards.js';

export const PLAN_KINDS = ['trail', 'beach', 'lake', 'mountain', 'cycle'];
const BASE_NIGHTS = 2;
const MAX_NIGHTS = 7;

/** The catalogue as points for nearestDest, built once per catalogue. */
const indexCache = new WeakMap();
export function destPoints(destinations = {}) {
  if (indexCache.has(destinations)) return indexCache.get(destinations);
  const out = [];
  for (const [id, d] of Object.entries(destinations || {})) {
    const lat = d?.city_lat ?? d?.lat;
    const lon = d?.city_lon ?? d?.lon;
    if (Number.isFinite(lat) && Number.isFinite(lon)) out.push({ id, lat, lon });
  }
  indexCache.set(destinations, out);
  return out;
}

/**
 * The picked saves as the planner's stops:
 *   { stops: [{ dest, nights, dayActivities }], unplaced: [row] }
 * Stops run in the order of the saves that made them.
 */
export function planFromSaves(rows = [], destinations = {}, { maxKm } = {}) {
  const stops = [];
  const byDest = new Map();
  const unplaced = [];
  const stopFor = (dest) => {
    if (!byDest.has(dest)) {
      const s = { dest, nights: BASE_NIGHTS, dayActivities: [] };
      byDest.set(dest, s);
      stops.push(s);
    }
    return byDest.get(dest);
  };
  for (const r of rows) {
    if (!r) continue;
    if (r.kind === 'dest') {
      if (destinations[r.id]) stopFor(r.id);
      else unplaced.push(r);
      continue;
    }
    if (!PLAN_KINDS.includes(r.kind) || !Number.isFinite(r.lat) || !Number.isFinite(r.lon)) {
      unplaced.push(r);
      continue;
    }
    const near = nearestDest(destPoints(destinations), r.lat, r.lon, maxKm);
    if (!near) { unplaced.push(r); continue; }
    const s = stopFor(near.dest.id);
    const name = String(r.name || '').trim().slice(0, 80);
    if (name && !s.dayActivities.includes(name)) s.dayActivities.push(name);
  }
  for (const s of stops) s.nights = Math.min(MAX_NIGHTS, Math.max(BASE_NIGHTS, s.dayActivities.length));
  return { stops, unplaced };
}

/**
 * The selection bar's price (T942): the cheapest day price a person among
 * the stops the planner will price, or null when none of them has one. A
 * trail or a beach has no price of its own; its base town does.
 */
export function cheapestStopDay(stops = [], dayEurOf = () => null) {
  const all = stops.map((s) => dayEurOf(s.dest)).filter((v) => Number.isFinite(v) && v > 0);
  return all.length ? Math.min(...all) : null;
}
