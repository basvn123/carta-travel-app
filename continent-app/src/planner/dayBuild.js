/**
 * Picks to days (T433): the one function that turns what a traveller chose
 * (in the builder, or what Carta chose for them) into a plan's towns and days.
 *
 * The builder's tray previews exactly what this returns, and "Open my days"
 * hands exactly this to the planner, so the preview can never disagree with
 * the day it opens on.
 *
 * A day belongs to one town (the plan's shape is towns, each with its days),
 * so the cut is made per town: every town with a pick gets at least one day,
 * the days the traveller asked for beyond that go to the town with the most
 * to see per day, and inside a town the days are cut by neighbourhood
 * (daySpread.js).
 */
import { spreadIntoDays, kmBetween } from '../lib/daySpread.js';

// The clock a preview reads, the same defaults the timeline uses.
const DAY_START = 9 * 60 + 30;
const LUNCH_AFTER = 12 * 60 + 30;
const LUNCH_MIN = 45;
// A walk between sights at an honest strolling pace, along streets rather
// than as the crow flies (a city's streets add about a quarter).
const STREET_FACTOR = 1.25;
const WALK_KMH = 4.5;
// The planner's own rule (STAY_WALK_MAX_KM): past 2.5 km the start is a ride.
const RIDE_FROM_KM = 2.5 * STREET_FACTOR;
const RIDE_KMH = 35;

/**
 * picks    [{ destId, idx, lat, lon, minutes, must, name, img }]
 * townIds  towns picked as a whole (a day out, no places named yet)
 * dayCount the days the traveller asked for (1 to 7)
 * homeId   the town the start sits in, first when it has picks or none do
 * townPos(id)  { lat, lon } of a town, for ordering towns outward
 * start    { lat, lon } where each day leaves from
 *
 * Returns { stops: [{ destinationId, days }], assign: { [stopIdx]: { [dayIdx]: [idx] } },
 *           days: [{ si, di, destId, picks: [pick] }] } in plan order.
 */
export function buildDays({
  picks = [], townIds = [], dayCount = 1, homeId = null, townPos = () => null, start = null,
}) {
  const byTown = new Map();
  for (const p of picks) {
    if (!p?.destId) continue;
    if (!byTown.has(p.destId)) byTown.set(p.destId, []);
    byTown.get(p.destId).push(p);
  }
  for (const id of townIds) if (id && !byTown.has(id)) byTown.set(id, []);
  if (!byTown.size && homeId) byTown.set(homeId, []);
  if (!byTown.size) return { stops: [], assign: {}, days: [] };

  const towns = [...byTown.keys()].sort((a, b) => {
    if (a === homeId) return -1;
    if (b === homeId) return 1;
    return kmBetween(start, townPos(a)) - kmBetween(start, townPos(b));
  });

  const minutesOf = (id) => byTown.get(id).reduce((s, p) => s + (Number(p.minutes) || 60), 0) || 240;
  const total = Math.max(Math.min(7, Math.max(1, Math.round(dayCount) || 1)), towns.length);
  const daysOf = new Map(towns.map((id) => [id, 1]));
  for (let extra = total - towns.length; extra > 0; extra -= 1) {
    let best = towns[0];
    let bestLoad = -1;
    for (const id of towns) {
      // Only a town with places to spread earns a second day; a whole-town
      // pick with nothing named stays one day out.
      if (!byTown.get(id).length && towns.length > 1) continue;
      const load = minutesOf(id) / daysOf.get(id);
      if (load > bestLoad) { bestLoad = load; best = id; }
    }
    daysOf.set(best, daysOf.get(best) + 1);
  }

  const stops = [];
  const assign = {};
  const days = [];
  towns.forEach((id, si) => {
    const k = daysOf.get(id);
    const ps = byTown.get(id);
    stops.push({ destinationId: id, days: k });
    const lists = spreadIntoDays(ps, {
      days: k,
      start,
      minutes: (p) => Number(p.minutes) || 60,
      weight: (p) => (p.must ? 1 : 0),
    });
    assign[si] = {};
    lists.forEach((list, di) => {
      if (list.length) assign[si][di] = list.map((j) => ps[j].idx);
      days.push({ si, di, destId: id, picks: list.map((j) => ps[j]) });
    });
  });
  return { stops, assign, days };
}

/**
 * A clock for one previewed day: arrival times by straight-line walk times
 * (street-corrected) and the visit minutes, a lunch pause once past 12:30.
 * The planner's own timeline re-times it on the routed streets afterwards; this
 * is the shape, said honestly as "about".
 */
export function previewClock(picks, { start = null, startMin = DAY_START } = {}) {
  let t = startMin;
  let prev = start;
  let km = 0;
  let lunched = false;
  const rows = picks.map((p, i) => {
    const d = prev ? kmBetween(prev, p) : 0;
    const legKm = Number.isFinite(d) ? d * STREET_FACTOR : 0;
    // Beyond a stroll the first hop is a ride (the planner draws it as one),
    // so it costs ride minutes and adds nothing to the walking.
    if (i === 0 && legKm > RIDE_FROM_KM) {
      t += Math.round((legKm / RIDE_KMH) * 60) + 10;
    } else {
      km += legKm;
      t += Math.round((legKm / WALK_KMH) * 60);
    }
    const arriveMin = t;
    t += Number(p.minutes) || 60;
    if (!lunched && t >= LUNCH_AFTER) { lunched = true; t += LUNCH_MIN; }
    prev = p;
    return { ...p, arriveMin };
  });
  return { rows, endMin: t, km: Math.round(km * 10) / 10 };
}
