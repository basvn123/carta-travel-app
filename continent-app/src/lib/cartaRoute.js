/**
 * cartaRoute.js, the Carta algorithm: given a set of places a traveller wants
 * and the nights they have, it decides the ORDER they are visited in and how
 * many nights each one keeps.
 *
 * Two problems, solved in that order, because they are not the same problem:
 *
 *   1. SEQUENCE. Which order costs the least moving about. With the start
 *      fixed (you land somewhere) and the end either fixed or free, this is an
 *      open-path travelling salesman problem. Carta used to answer it with
 *      nearest neighbour alone, which is fast and often visibly wrong: it
 *      walks into a corner and then crosses the whole country to get out. The
 *      fix is the classic pair, nearest neighbour for a first guess and then
 *      2-opt and Or-opt to untangle it. On the sizes a holiday actually has
 *      (three to eight stops) that lands on the optimum nearly every time and
 *      still runs in under a millisecond, which is what a wizard step needs.
 *
 *   2. NIGHTS. How long to stay in each. A night in a city with forty
 *      catalogued sights is worth more than the fourth night in a village with
 *      six, and the value of any city's next night falls the longer you have
 *      already been there. So each stop gets a saturation (how much there is
 *      to do) and each night a marginal value that decays against it; the
 *      nights are then handed out one at a time to whichever stop values the
 *      next one most. That is the "variable profits" half of the tourist trip
 *      design problem, done greedily because the greedy answer to a concave
 *      value function is the optimal one.
 *
 * Distances are straight lines scaled by a road factor. That is a proxy, not
 * a routing engine: it decides ORDER well (the ranking of two orders almost
 * never flips between crow-flight and road) and it is never shown to the
 * traveller as a distance to plan around. The planner prices the real legs
 * afterwards, with the real transport engine.
 *
 * Pure, no React, no fetch, so scripts/verify_carta_route.mjs can run it under
 * plain node.
 */
import { haversineKm } from './runtime_pricing.js';
import { gemScore } from './trip_planner_pricing.js';

/** Straight line to road/rail, the same 1.25 the trip composer uses. */
export const ROAD_FACTOR = 1.25;

/** Door to door speed, in km/h, for turning a leg into an afternoon lost.
 *  Deliberately pessimistic and deliberately blunt: it exists to compare two
 *  orderings, not to promise an arrival time. */
const LEG_KMH = 72;
const LEG_FIXED_H = 0.6; // getting to the station, and out of the other one

/** Road-ish kilometres between two { lat, lon } points, or null. */
export function legKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const km = haversineKm(a.lat, a.lon, b.lat, b.lon);
  return km == null ? null : km * ROAD_FACTOR;
}

/** Rough hours a leg eats, for the "this trip is mostly travelling" warning. */
export function legHours(km) {
  return km == null ? null : LEG_FIXED_H + km / LEG_KMH;
}

/** Total length of one ordering, including the run in from `start` and out to
 *  `end` when those are given. Missing coordinates cost nothing rather than
 *  poisoning the comparison with NaN. */
function pathCost(order, pts, start, end) {
  let total = 0;
  let prev = start || null;
  for (const i of order) {
    const p = pts[i];
    const km = legKm(prev, p);
    if (km != null) total += km;
    prev = p;
  }
  if (end) {
    const km = legKm(prev, end);
    if (km != null) total += km;
  }
  return total;
}

/** Greedy first guess: always hop to the closest place not yet visited. */
function nearestNeighbour(pts, start) {
  const left = pts.map((_, i) => i);
  const order = [];
  let cur = start || pts[0];
  while (left.length) {
    let bi = 0;
    let bd = Infinity;
    left.forEach((idx, k) => {
      const km = legKm(cur, pts[idx]);
      const d = km == null ? Infinity : km;
      if (d < bd) { bd = d; bi = k; }
    });
    const [idx] = left.splice(bi, 1);
    order.push(idx);
    cur = pts[idx];
  }
  return order;
}

/**
 * 2-opt: reverse the stretch between two stops whenever that shortens the
 * whole path. This is what removes the crossing an eye picks out instantly on
 * a map, and it is why a routed trip stops looping back on itself.
 */
function twoOpt(order, pts, start, end) {
  const n = order.length;
  if (n < 3) return order;
  let best = order.slice();
  let bestCost = pathCost(best, pts, start, end);
  let improved = true;
  let guard = 0;
  while (improved && guard < 60) {
    improved = false;
    guard += 1;
    for (let i = 0; i < n - 1; i += 1) {
      for (let k = i + 1; k < n; k += 1) {
        const trial = best.slice(0, i).concat(best.slice(i, k + 1).reverse(), best.slice(k + 1));
        const cost = pathCost(trial, pts, start, end);
        if (cost < bestCost - 0.01) {
          best = trial;
          bestCost = cost;
          improved = true;
        }
      }
    }
  }
  return best;
}

/**
 * Or-opt: lift a run of one to three stops out and drop it somewhere else,
 * either way round. 2-opt cannot move a single stop past its neighbours, and
 * one stop in the wrong place is the other failure a traveller can see.
 */
function orOpt(order, pts, start, end) {
  let best = order.slice();
  let bestCost = pathCost(best, pts, start, end);
  let improved = true;
  let guard = 0;
  while (improved && guard < 60) {
    improved = false;
    guard += 1;
    for (let len = 1; len <= 3 && len < best.length; len += 1) {
      for (let i = 0; i + len <= best.length; i += 1) {
        const seg = best.slice(i, i + len);
        const rest = best.slice(0, i).concat(best.slice(i + len));
        for (let j = 0; j <= rest.length; j += 1) {
          const pieces = len > 1 ? [seg, seg.slice().reverse()] : [seg];
          for (const piece of pieces) {
            const trial = rest.slice(0, j).concat(piece, rest.slice(j));
            const cost = pathCost(trial, pts, start, end);
            if (cost < bestCost - 0.01) {
              best = trial;
              bestCost = cost;
              improved = true;
            }
          }
        }
      }
    }
  }
  return best;
}

/**
 * The order to visit these places in.
 *
 * @param ids          destination ids, in whatever order the traveller picked
 * @param destinations data.destinations
 * @param opts.start   { lat, lon } the trip arrives at (airport, home, first
 *                     stop of a fixed trip). Omit and the opening stop is free
 * @param opts.end     { lat, lon } the trip has to finish near; pass the same
 *                     point as `start` for a loop back to where you landed
 * @param opts.fixFirst  keep ids[0] first whatever it costs (an arrival city)
 * @returns a new array of the same ids. Unroutable input (a missing
 *          coordinate, fewer than two stops) comes back untouched.
 */
export function routeOrder(ids, destinations, { start = null, end = null, fixFirst = false } = {}) {
  const list = (ids || []).filter((id) => destinations?.[id]);
  if (list.length < 2) return ids || [];
  const pts = list.map((id) => {
    const d = destinations[id];
    return { id, lat: d.lat, lon: d.lon };
  });
  if (pts.some((p) => p.lat == null || p.lon == null)) return ids;

  const head = fixFirst ? pts[0] : null;
  const movable = fixFirst ? pts.slice(1) : pts;
  const from = head || start;
  if (!movable.length) return ids;

  let order = nearestNeighbour(movable, from);
  order = twoOpt(order, movable, from, end);
  order = orOpt(order, movable, from, end);
  const tail = order.map((i) => movable[i].id);
  return head ? [head.id, ...tail] : tail;
}

/** What each ordering costs, so the UI can say what the routing saved. */
export function routeStats(ids, destinations, { start = null, end = null } = {}) {
  const pts = (ids || []).map((id) => {
    const d = destinations?.[id];
    return d && d.lat != null ? { id, lat: d.lat, lon: d.lon } : null;
  }).filter(Boolean);
  const idx = pts.map((_, i) => i);
  const km = pathCost(idx, pts, start, end);
  const legs = [];
  let prev = start;
  for (const p of pts) {
    const d = legKm(prev, p);
    if (prev) legs.push({ toId: p.id, km: d == null ? null : Math.round(d), hours: d == null ? null : legHours(d) });
    prev = p;
  }
  if (end && prev) {
    const d = legKm(prev, end);
    legs.push({ toId: null, km: d == null ? null : Math.round(d), hours: d == null ? null : legHours(d) });
  }
  const hours = legs.reduce((s, l) => s + (l.hours || 0), 0);
  return { km: Math.round(km), legs, hours: Math.round(hours * 10) / 10 };
}

/* -- Nights ------------------------------------------------------------- */

/**
 * How many nights a place can absorb before it starts repeating itself.
 *
 * Read off what the catalogue actually holds for it: the number of things to
 * do and its rating. A saturation of 2 means the second night is already worth
 * a lot less than the first; a saturation of 5 means a week there still finds
 * something.
 */
export function stopSaturation(dest) {
  const things = (dest?.activities?.items || []).length;
  const rating = dest?.rating?.score ?? gemScore(dest) ?? 5;
  const base = 1.1 + Math.min(3.4, things / 9) + Math.max(0, rating - 6) * 0.28;
  return Math.max(1, Math.min(5.5, base));
}

/** What a place is worth at all, before any night is spent on it. */
function stopAppeal(dest) {
  const g = gemScore(dest) || 0;
  const r = dest?.rating?.score ?? 0;
  return Math.max(1, (g * 0.6) + (r * 0.4));
}

/**
 * The value of the k-th night in a place (k is 1-based). Concave by
 * construction, which is both true to how travel feels and the reason a
 * greedy allocation is optimal rather than merely quick.
 */
function nightValue(appeal, saturation, k) {
  return appeal * Math.exp(-(k - 1) / saturation);
}

/**
 * Split `totalNights` across the stops.
 *
 * Every stop keeps at least one night: a stop with none is not a stop, it is a
 * day trip, and the wizard would have to say so rather than silently zeroing
 * it. When there are more stops than nights the tail is handed back as
 * `dropped` so the caller can offer to remove them instead.
 *
 * @param pace 'relaxed' | 'balanced' | 'packed' widens or narrows saturation,
 *             which is what makes a relaxed trip stay put and a packed one
 *             spread out.
 * @returns { nights: { [id]: n }, dropped: [id] }
 */
export function allocateNights(ids, destinations, totalNights, { pace = 'balanced' } = {}) {
  const list = (ids || []).filter((id) => destinations?.[id]);
  const nights = {};
  if (!list.length) return { nights, dropped: [] };
  const budget = Math.max(1, Math.round(totalNights || list.length));
  const paceMul = pace === 'relaxed' ? 1.45 : (pace === 'packed' ? 0.72 : 1);

  if (budget < list.length) {
    const keep = list.slice(0, budget);
    keep.forEach((id) => { nights[id] = 1; });
    return { nights, dropped: list.slice(budget) };
  }

  const rows = list.map((id) => ({
    id,
    appeal: stopAppeal(destinations[id]),
    sat: stopSaturation(destinations[id]) * paceMul,
    n: 1,
  }));
  let left = budget - rows.length;
  while (left > 0) {
    let best = rows[0];
    let bestVal = -Infinity;
    for (const r of rows) {
      const v = nightValue(r.appeal, r.sat, r.n + 1);
      if (v > bestVal) { bestVal = v; best = r; }
    }
    best.n += 1;
    left -= 1;
  }
  rows.forEach((r) => { nights[r.id] = r.n; });
  return { nights, dropped: [] };
}

/* -- The whole answer, in one call -------------------------------------- */

/**
 * Route the stops and share out the nights in one go, and say what it did.
 *
 * @returns {
 *   order      the ids, in the order to travel them
 *   nights     { [id]: nights }
 *   dropped    ids there were no nights left for
 *   km         road-ish kilometres of the routed order
 *   kmBefore   the same for the order handed in
 *   kmSaved    how much the routing took off, never negative
 *   hours      rough hours spent moving between stops
 *   moveShare  those hours as a share of the waking hours of the trip
 *   crowded    true when the trip spends more of itself moving than resting
 *              in it, see the cut point below
 * }
 */
export function planRoute({
  ids, destinations, totalNights, start = null, end = null, fixFirst = false, pace = 'balanced',
}) {
  const order = routeOrder(ids, destinations, { start, end, fixFirst });
  const before = routeStats(ids, destinations, { start, end });
  const after = routeStats(order, destinations, { start, end });
  const { nights, dropped } = allocateNights(order, destinations, totalNights, { pace });
  const kept = order.filter((id) => !dropped.includes(id));
  const days = Math.max(1, Math.round(totalNights || kept.length) + 1);
  const moveShare = after.hours / (days * 10);
  return {
    order: kept,
    nights,
    dropped,
    km: after.km,
    kmBefore: before.km,
    kmSaved: Math.max(0, before.km - after.km),
    hours: after.hours,
    legs: after.legs,
    moveShare: Math.round(moveShare * 100) / 100,
    // Better than a quarter of every waking day spent moving is a trip that
    // will feel like one. Six Italian cities in six nights lands at 0.30, the
    // same six in twelve nights at 0.16, which is where the line belongs.
    crowded: moveShare > 0.28,
  };
}
