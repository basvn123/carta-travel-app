/**
 * Spread a set of places over several days, by neighbourhood (T433).
 *
 * A traveller with three nights in Lisbon picks a dozen places, or Carta picks
 * them, and the days have to be cut out of that set. Research on how people
 * actually walk a city (and the planners that do this well) agrees on the
 * rule: one area a day, the big sight early, nothing crossing the city twice.
 * No consumer planner does the cut for you; Wanderlog fills one day at a
 * time. So the cut is made here, in code that can be tested, never by a
 * language model: the model may suggest WHICH places, the order and the days
 * are arithmetic.
 *
 *   1. Seeds: the place that matters most (a must-see when there is one), then
 *      each next seed the place furthest from every seed so far. Deterministic,
 *      so the same picks always give the same days.
 *   2. k-medoids: every place joins its nearest seed, each group's medoid is
 *      recomputed, until nothing moves (a handful of rounds for a day's worth
 *      of places).
 *   3. Balance by minutes, not by count: a day of two museums is as long as a
 *      day of six viewpoints. A day running past its share by a third hands
 *      its edge place (the one closest to another group) to the lighter day.
 *   4. Order: days run outward from the start (the nearest group is day 1),
 *      and each day is walked in the shortest open path from the start
 *      (nearest neighbour seed, then 2-opt, the plan-day function's order).
 *
 * Pure: plain numbers in, plain arrays out; no React, no fetch.
 */

const R = 6371;
const toRad = (d) => (d * Math.PI) / 180;

/** Great-circle distance in km, or Infinity when either point is missing. */
export function kmBetween(a, b) {
  if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(a.lon)
    || !Number.isFinite(b.lat) || !Number.isFinite(b.lon)) return Infinity;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function pathKm(order, pts, start) {
  let total = 0;
  let prev = start;
  for (const i of order) {
    if (prev) total += kmBetween(prev, pts[i]);
    prev = pts[i];
  }
  return total;
}

/**
 * Shortest open path through `pts` from `start` (the end is free): nearest
 * neighbour seed, then 2-opt to convergence. Returns indices into `pts`.
 * The same rule as plan-day's twoOptOrder, so the server and the app order a
 * day the same way.
 */
export function walkOrder(pts, start = null) {
  let order = pts.map((_, i) => i);
  if (pts.length < 2) return order;
  if (start) {
    const left = new Set(order);
    const seeded = [];
    let cur = start;
    while (left.size) {
      let best = -1;
      let bestD = Infinity;
      for (const i of left) {
        const d = kmBetween(cur, pts[i]);
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best < 0) { seeded.push(...left); break; }
      seeded.push(best);
      left.delete(best);
      cur = pts[best];
    }
    order = seeded;
  }
  if (pts.length < 3) return order;
  let improved = true;
  let guard = 0;
  while (improved && guard < 200) {
    improved = false;
    guard += 1;
    for (let a = 0; a < order.length - 1; a += 1) {
      for (let b = a + 1; b < order.length; b += 1) {
        const next = order.slice(0, a).concat(order.slice(a, b + 1).reverse(), order.slice(b + 1));
        if (pathKm(next, pts, start) + 1e-9 < pathKm(order, pts, start)) {
          order = next;
          improved = true;
        }
      }
    }
  }
  return order;
}

function medoidOf(members, pts) {
  let best = members[0];
  let bestSum = Infinity;
  for (const m of members) {
    let s = 0;
    for (const o of members) s += kmBetween(pts[m], pts[o]);
    if (s < bestSum) { bestSum = s; best = m; }
  }
  return best;
}

/**
 * places   [{ lat, lon, ...anything }]; entries without coordinates are kept
 *          and placed on the lightest day, never dropped
 * days     how many days to cut (1 to 7)
 * start    { lat, lon } where each day leaves from (the stay), or null
 * minutes(p)  visit minutes of a place (default 60)
 * weight(p)   how much a place matters (seeds the first day; default 0)
 *
 * Returns an array of `days` arrays of the ORIGINAL indices, each in walking
 * order. A day can be empty when there are fewer places than days.
 */
export function spreadIntoDays(places, {
  days = 1, start = null, minutes = () => 60, weight = () => 0,
} = {}) {
  const n = Math.max(1, Math.min(7, Math.round(days) || 1));
  const list = places || [];
  const mapped = list.map((p, i) => ({ p, i })).filter(({ p }) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon));
  const unmapped = list.map((p, i) => ({ p, i })).filter(({ p }) => !(Number.isFinite(p?.lat) && Number.isFinite(p?.lon)));
  const pts = mapped.map(({ p }) => p);
  const out = Array.from({ length: n }, () => []);

  if (n === 1 || pts.length <= 1) {
    const order = walkOrder(pts, start).map((k) => mapped[k].i);
    out[0] = [...order, ...unmapped.map(({ i }) => i)];
    return out;
  }

  // 1. Seeds: the heaviest place first (ties: nearest to the start), then
  //    farthest-first.
  const k = Math.min(n, pts.length);
  const firstSeed = pts
    .map((p, j) => ({ j, w: Number(weight(p)) || 0, d: start ? kmBetween(start, p) : 0 }))
    .sort((a, b) => (b.w - a.w) || (a.d - b.d) || (a.j - b.j))[0].j;
  const seeds = [firstSeed];
  while (seeds.length < k) {
    let best = -1;
    let bestD = -1;
    pts.forEach((p, j) => {
      if (seeds.includes(j)) return;
      const d = Math.min(...seeds.map((s) => kmBetween(pts[s], p)));
      if (d > bestD) { bestD = d; best = j; }
    });
    seeds.push(best);
  }

  // 2. k-medoids.
  let medoids = [...seeds];
  let assign = new Array(pts.length).fill(0);
  for (let round = 0; round < 25; round += 1) {
    const next = pts.map((p) => {
      let g = 0;
      let gd = Infinity;
      medoids.forEach((m, gi) => {
        const d = kmBetween(pts[m], p);
        if (d < gd) { gd = d; g = gi; }
      });
      return g;
    });
    const groups = medoids.map((_, gi) => next.map((g, j) => (g === gi ? j : -1)).filter((j) => j >= 0));
    const nextMedoids = groups.map((g, gi) => (g.length ? medoidOf(g, pts) : medoids[gi]));
    const stable = next.every((g, j) => g === assign[j]) && nextMedoids.every((m, gi) => m === medoids[gi]);
    assign = next;
    medoids = nextMedoids;
    if (stable && round > 0) break;
  }

  // 3. Balance by minutes.
  const mins = pts.map((p) => Math.max(0, Number(minutes(p)) || 0));
  const load = () => medoids.map((_, gi) => assign.reduce((s, g, j) => (g === gi ? s + mins[j] : s), 0));
  const total = mins.reduce((a, b) => a + b, 0);
  const share = total / k;
  for (let pass = 0; pass < pts.length * 2; pass += 1) {
    const l = load();
    const heavy = l.indexOf(Math.max(...l));
    if (l[heavy] <= share * 1.34) break;
    const members = assign.map((g, j) => (g === heavy ? j : -1)).filter((j) => j >= 0);
    if (members.length <= 1) break;
    // The member that is least at home here: the smallest extra distance to
    // another group's medoid, among groups lighter than this one.
    let move = null;
    for (const j of members) {
      if (j === medoids[heavy]) continue;
      medoids.forEach((m, gi) => {
        if (gi === heavy || l[gi] + mins[j] >= l[heavy]) return;
        const cost = kmBetween(pts[m], pts[j]) - kmBetween(pts[medoids[heavy]], pts[j]);
        if (!move || cost < move.cost) move = { j, gi, cost };
      });
    }
    if (!move) break;
    assign[move.j] = move.gi;
  }

  // 4. Days outward from the start, each walked in order.
  const groups = medoids.map((m, gi) => ({
    gi,
    members: assign.map((g, j) => (g === gi ? j : -1)).filter((j) => j >= 0),
    from: start ? kmBetween(start, pts[m]) : gi,
  })).filter((g) => g.members.length)
    .sort((a, b) => a.from - b.from || a.gi - b.gi);
  groups.forEach((g, d) => {
    const sub = g.members.map((j) => pts[j]);
    out[d] = walkOrder(sub, start).map((x) => mapped[g.members[x]].i);
  });

  // Places without a position go to the lightest day, at its end.
  unmapped.forEach(({ i }) => {
    const l = out.map((day) => day.reduce((s, idx) => s + (Number(minutes(list[idx])) || 0), 0));
    const d = l.indexOf(Math.min(...l));
    out[d].push(i);
  });
  return out;
}
