/**
 * Which searches the sweep runs in a given minute (T514).
 *
 * Three tiers share one clock, so the load is flat (about 24 searches a
 * minute for the whole of Europe; T780, was about 100 before Google started
 * refusing us) and every route is treated the same:
 *
 *   near   the next 14 days, every fourth day, each route every 3 days
 *   far    weeks 3 to 26, one day per week, each route every 2 weeks
 *   late   weeks 27 to 45, the same, each route every 4 weeks; on the
 *          Hetzner box (T798, workers/late-sweep), sent in through /ingest
 *   find   every pair of Carta airports that no route covers yet, one day
 *          21 days out, direct flights only, each pair once a month
 *
 * A route's slot is its index in the sorted list modulo the tier's cycle
 * length in minutes, so each minute takes a fixed share without scanning or
 * remembering anything. A route Eurostat saw only in some months is skipped
 * on dates in its off months; a route with no direct flight on six checks in
 * a row is dormant and only the find tier looks at it again.
 *
 * T1043: the slots are counted in half minutes, two to a minute by day and
 * one from 22:00 to 05:00 UTC, the hours Google refused the Worker every
 * night (owner, 2026-11-04). So a night minute carries half a day minute's
 * share; each cycle still takes exactly its days (a day has the same
 * SLOTS_PER_DAY), and by day a minute carries about 17% more than before.
 *
 * N6 (2026-11-17): half speed did not help, 0 of 7 nights clean, each
 * night three refusals in about 100 swept minutes and the pause ladder
 * (1, 2, 4 hours) eating the rest. A night minute now has NIGHT_SLOTS = 0:
 * no searches from 22:00 to 05:00 UTC, and the day minutes carry the
 * whole cycle (about 21% more each than at half speed), so every route
 * still has its turn once a cycle.
 *
 * D10 (with T855, 2026-11-26): the same daily budget, spent where
 * travellers pick. A trip whose day had no swept fare took the nearest swept
 * day, up to 4 days off. Now:
 *
 *   dense  the DENSE_ROUTES busiest routes (_routes.json `rank`, Eurostat
 *          passengers) get every day: days 1 to 14 on the near cycle, days
 *          15 to 104 on the far cycle, one day a slot, so every day of the
 *          next 90 always has a fare checked on that very day
 *   far    the weekly days to day 104 every 2 weeks as before; the weeks
 *          after it every 4 weeks (SLOW_CYCLE), half of them on each far
 *          turn, where prices move slowly and the app accepts a fare as old
 *          as a late one (config flights.max_age_days.late_after_days 90)
 *   box    in the box's idle time, days 1 to 14 every day for the next
 *          BOX_DENSE_ROUTES of the rank (workers/late-sweep)
 *
 * The slow weeks pay for the dense days: measured on the 10,094 routes, the
 * Worker plans 25,503 searches a day, was 25,738, and a day minute never
 * more than 41, was 40 (tests/flightSweep.test.mjs keeps both).
 */

// T780: as few searches as the app needs (owner, 2026-10-27: a price may be a
// few days old). Each cycle stays under its flights.max_age_days in
// config/pricing.json (near 5, far 16), or prices drop out between checks.
export const NEAR_CYCLE = 4320; // minutes in 3 days; was 12 hours
export const FAR_CYCLE = 20160; // minutes in 2 weeks; was a week
export const FIND_CYCLE = 129600; // minutes in 90 days; T780, was 30
// T780: every fourth day, was every other day; the app takes the nearest
// swept day within flights.nearest_day_spread (4) of the one asked for.
export const NEAR_DAYS = [1, 5, 9, 13];
export const FAR_WEEKS = 24; // weeks 3 to 26
export const FIND_AHEAD = 21;
// T798: the late tier runs on the Hetzner box (workers/late-sweep), not here:
// each route every 4 weeks, so its fares sit under flights.max_age_days.late.
// T805: weeks 27 to 45, was 27 to 40. Its last date is day 308 to 314, so
// from late October on it always reaches the end of next August, and stays
// under Google Flights' booking horizon (about 330 days), past which a
// search only comes back empty.
export const LATE_CYCLE = 40320; // minutes in 4 weeks
export const LATE_WEEKS = 19; // weeks 27 to 45, after the far tier's 24
// D10: the dense tier and the slow far weeks that pay for it. DENSE_ROUTES is
// sized so the searches a day stay at or under the plan before (a test keeps
// it so). SLOW_AFTER is config flights.max_age_days.late_after_days.
export const DENSE_DAYS = 90;
export const DENSE_NEAR = 14; // days 1 to 14 every day on the near cycle
export const DENSE_ROUTES = 400;
// D10: the box's idle time between late minutes (workers/late-sweep) fills
// days 1 to 14 every day for the next BOX_DENSE_ROUTES of the rank, the days
// the Worker's near tier leaves out, at the late tier's own spacing.
export const BOX_DENSE_ROUTES = 1000;
export const SLOW_AFTER = 90;
// The far cycle still takes the two weeks past SLOW_AFTER: a day the slow
// cycle searched has come down to day 90 before its far age applies, and the
// far cycle has had its turn at it by then.
export const FAST_UNTIL = SLOW_AFTER + 14;
export const SLOW_CYCLE = 2 * FAR_CYCLE; // 4 weeks: every second far turn
// One dense day a slot, so a minute carries at most a few: with more a day
// minute went past the 40 searches the plan before peaked at.
export const DENSE_CHUNK = 1;
// The dense far chunks reach two weeks past DENSE_DAYS, so a day that comes
// down to day 90 between two turns was already searched on its own day.
export const DENSE_UNTIL = DENSE_DAYS + 14;
export const FIND_MIN_KM = 150; // closer than this nobody flies
export const DORMANT_AFTER = 6;
// T1043: the night window, 22:00 to 05:00 UTC. N6: no slots in it (was one
// a minute, half speed); a day minute has two.
export const NIGHT_UTC = [22, 5];
export const NIGHT_SLOTS = 0;
const DAY_SLOTS = 2;
const NIGHT_MIN = (24 - NIGHT_UTC[0] + NIGHT_UTC[1]) * 60;
export const SLOTS_PER_DAY = DAY_SLOTS * 1440 - (DAY_SLOTS - NIGHT_SLOTS) * NIGHT_MIN;

const DAY = 86400000;

/** Slots (half minutes; NIGHT_SLOTS per night minute) from the epoch to this minute. */
export function slotsAt(minute) {
  const day = Math.floor(minute / 1440);
  const r = minute - day * 1440;
  const night = Math.min(r, NIGHT_UTC[1] * 60) + Math.max(0, r - NIGHT_UTC[0] * 60);
  return DAY_SLOTS * minute - (DAY_SLOTS - NIGHT_SLOTS) * (day * NIGHT_MIN + night);
}

/**
 * The route indices whose turn it is in this real minute (T1043): those of
 * its slots in a cycle of `cycleMin` real minutes, a whole number of days.
 */
export function routesForMinute(minute, cycleMin, n) {
  const cycle = (cycleMin / 1440) * SLOTS_PER_DAY;
  const out = [];
  for (let s = slotsAt(minute); s < slotsAt(minute + 1); s++) out.push(...routesInMinute(s, cycle, n));
  return out;
}

export const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const monthBit = (ms) => 1 << new Date(ms).getUTCMonth();

/**
 * The route indices whose turn it is in this minute of a cycle. With more
 * routes than minutes, every cycle-th route; with fewer (T780: the far cycle
 * is 2 weeks, 20,160 minutes, for about 10,000 routes), spread evenly over
 * the cycle instead of all in its first half.
 */
export function routesInMinute(minute, cycle, n) {
  const slot = minute % cycle;
  const out = [];
  if (n >= cycle) {
    for (let r = slot; r < n; r += cycle) out.push(r);
    return out;
  }
  for (let r = Math.ceil((slot * n) / cycle); r < Math.ceil(((slot + 1) * n) / cycle); r++) out.push(r);
  return out;
}

/** The route list as sorted [origin, dest, monthMask] triples. */
export function flattenRoutes(routes, extra = []) {
  const seen = new Set();
  const out = [];
  for (const o of Object.keys(routes).sort()) {
    for (const d of Object.keys(routes[o]).sort()) {
      seen.add(o + d);
      out.push([o, d, routes[o][d]]);
    }
  }
  for (const [o, d] of extra) {
    if (!seen.has(o + d)) { seen.add(o + d); out.push([o, d, 4095]); }
  }
  return out;
}

/**
 * A route's far days on its far turn number `turn`, days from today: one in
 * each of weeks 3 to 26, a different weekday each week, so a month's
 * cheapest day is not always a Tuesday. D10: the weekday follows the
 * calendar week (w + 2 turn is the same week two weeks later), so two
 * neighbouring weeks searched on different turns still sit about a week
 * apart; it moves on by one day every second turn, so over seven slow turns
 * a week has had every weekday.
 */
export function farDays(r, turn = 0) {
  return Array.from({ length: FAR_WEEKS }, (_, w) => 14 + 7 * w + ((r + w + 2 * turn + Math.floor(turn / 2)) % 7));
}

/** The far cycle's turn number in this minute (D10: the weekday and the slow weeks follow it). */
export function farTurn(minute) {
  return Math.floor(slotsAt(minute) / ((FAR_CYCLE / 1440) * SLOTS_PER_DAY));
}

/**
 * The dense tier's routes (D10): the indices in `list` of the first `k`
 * routes of _routes.json's `rank` (busiest first) that are in the list and
 * not dormant. A file without a rank gives none, and the sweep runs as
 * before.
 * @param {Array<[string,string,number]>} list   flattenRoutes() output
 * @param {string[]} rank   'BRUBCN' keys, busiest first
 * @returns {Set<number>}
 */
export function denseRoutes(list, rank, dormant = new Set(), k = DENSE_ROUTES) {
  const at = new Map(list.map(([o, d], i) => [o + d, i]));
  const out = new Set();
  for (const key of rank || []) {
    if (out.size >= k) break;
    if (at.has(key) && !dormant.has(key)) out.add(at.get(key));
  }
  return out;
}

/**
 * The box's near-day searches in one minute of its own cycle (D10): for the
 * routes ranked after the Worker's dense tier, the days 1 to DENSE_NEAR the
 * near tier does not search, each route once in NEAR_CYCLE. Plain minutes,
 * not slots: the box searches by night too. `box` is denseRoutes() of the
 * next BOX_DENSE_ROUTES, as an array in rank order.
 * @returns {Array<{o:string,d:string,date:string,tier:'box'}>}
 */
export function boxJobsForMinute(list, box, nowMs) {
  const minute = Math.floor(nowMs / 60000);
  const today = Math.floor(nowMs / DAY) * DAY;
  const jobs = [];
  for (const i of routesInMinute(minute, NEAR_CYCLE, box.length)) {
    const [o, d, mask] = list[box[i]];
    for (let k = 1; k <= DENSE_NEAR; k++) {
      const ms = today + k * DAY;
      if (!NEAR_DAYS.includes(k) && (mask & monthBit(ms))) jobs.push({ o, d, date: isoDay(ms), tier: 'box' });
    }
  }
  return jobs;
}

/** The box's routes (D10): the BOX_DENSE_ROUTES ranked after the Worker's dense ones, in rank order. */
export function boxRoutes(list, rank, dormant = new Set()) {
  const all = [...denseRoutes(list, rank, dormant, DENSE_ROUTES + BOX_DENSE_ROUTES)];
  return all.slice(DENSE_ROUTES);
}

export function km([la1, lo1], [la2, lo2]) {
  const r = Math.PI / 180;
  const a = Math.sin(((la2 - la1) * r) / 2) ** 2
    + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(((lo2 - lo1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

/**
 * @param {Array<[string,string,number]>} list   flattenRoutes() output
 * @param {Record<string,[number,number]>} airports
 * @param {number} nowMs
 * @param {Set<string>} dormant   'BRUBCN' keys
 * @param {Set<number>} dense     route indices of the dense tier (denseRoutes)
 * @returns {Array<{o:string,d:string,date:string,tier:'near'|'far'|'dense'|'find'}>}
 */
export function jobsForMinute(list, airports, nowMs, dormant = new Set(), dense = new Set()) {
  const minute = Math.floor(nowMs / 60000);
  const today = Math.floor(nowMs / DAY) * DAY;
  const jobs = [];
  const add = (o, d, ms, tier, mask) => {
    if (mask & monthBit(ms)) jobs.push({ o, d, date: isoDay(ms), tier });
  };

  for (const r of routesForMinute(minute, NEAR_CYCLE, list.length)) {
    const [o, d, mask] = list[r];
    if (dormant.has(o + d) || dense.has(r)) continue;
    for (const k of NEAR_DAYS) add(o, d, today + k * DAY, 'near', mask);
  }
  // D10: a far week past FAST_UNTIL rides along on every second far turn of
  // the route (SLOW_CYCLE, 4 weeks), half the slow weeks on one turn and
  // half on the next, so a turn carries fewer far days than before.
  const turn = farTurn(minute);
  for (const r of routesForMinute(minute, FAR_CYCLE, list.length)) {
    const [o, d, mask] = list[r];
    if (dormant.has(o + d)) continue;
    farDays(r, turn).forEach((k, w) => {
      // Half the slow weeks on one turn, the other half on the next.
      if (k > FAST_UNTIL && (turn + r + w) % 2) return;
      if (dense.has(r) && k <= DENSE_UNTIL) return;
      add(o, d, today + k * DAY, 'far', mask);
    });
  }
  // D10: the dense days in chunks of DENSE_CHUNK, each chunk its own slot in
  // the cycle, so a minute never carries a route's 76 days at once and stays
  // inside the Worker's 50 seconds.
  const hot = [...dense];
  for (const [cycle, from, to] of [[NEAR_CYCLE, 1, DENSE_NEAR], [FAR_CYCLE, DENSE_NEAR + 1, DENSE_UNTIL]]) {
    const chunks = Math.ceil((to - from + 1) / DENSE_CHUNK);
    for (const i of routesForMinute(minute, cycle, hot.length * chunks)) {
      const r = hot[Math.floor(i / chunks)];
      const [o, d, mask] = list[r];
      if (dormant.has(o + d)) continue;
      const a = from + (i % chunks) * DENSE_CHUNK;
      for (let k = a; k <= Math.min(to, a + DENSE_CHUNK - 1); k++) add(o, d, today + k * DAY, 'dense', mask);
    }
  }

  const codes = Object.keys(airports).sort();
  if (!codes.length) return jobs;
  const known = new Set(list.filter(([o, d]) => !dormant.has(o + d)).map(([o, d]) => o + d));
  const pairs = codes.length * codes.length;
  const findSlots = (FIND_CYCLE / 1440) * SLOTS_PER_DAY;
  for (let s = slotsAt(minute); s < slotsAt(minute + 1); s++) {
    for (let p = s % findSlots; p < pairs; p += findSlots) {
      const o = codes[Math.floor(p / codes.length)];
      const d = codes[p % codes.length];
      if (o === d || known.has(o + d)) continue;
      if (km(airports[o], airports[d]) < FIND_MIN_KM) continue;
      jobs.push({ o, d, date: isoDay(today + FIND_AHEAD * DAY), tier: 'find' });
    }
  }
  return jobs;
}

/**
 * The late tier's searches in a given minute (T798): the far tier's weekday
 * spread carried on for LATE_WEEKS more weeks, so the two tiers meet without
 * a gap. Dormant routes are not known on the box and are searched anyway.
 * @returns {Array<{o:string,d:string,date:string,tier:'late'}>}
 */
export function lateJobsForMinute(list, nowMs) {
  const minute = Math.floor(nowMs / 60000);
  return routesInMinute(minute, LATE_CYCLE, list.length).flatMap((r) => lateJobsForRoute(list, r, nowMs));
}

/** One route's late searches on the day of nowMs (T819: the fill asks route by route). */
export function lateJobsForRoute(list, r, nowMs) {
  const today = Math.floor(nowMs / DAY) * DAY;
  const [o, d, mask] = list[r];
  const jobs = [];
  for (let w = FAR_WEEKS; w < FAR_WEEKS + LATE_WEEKS; w++) {
    const ms = today + (14 + 7 * w + ((r + w) % 7)) * DAY;
    if (mask & monthBit(ms)) jobs.push({ o, d, date: isoDay(ms), tier: 'late' });
  }
  return jobs;
}

/**
 * One route's far-tier searches whose day falls between fromIso and toIso
 * (T917: the box fills a window the Worker has not reached yet). The same
 * days the Worker's far tier picks for the route on the day of nowMs.
 * @returns {Array<{o:string,d:string,date:string,tier:'far'}>}
 */
export function farJobsInWindow(list, r, nowMs, fromIso, toIso) {
  const today = Math.floor(nowMs / DAY) * DAY;
  const [o, d, mask] = list[r];
  const jobs = [];
  // D10: the far tier's weekdays on this turn, every week (the slow weeks too).
  for (const k of farDays(r, farTurn(Math.floor(nowMs / 60000)))) {
    const ms = today + k * DAY;
    const date = isoDay(ms);
    if (date >= fromIso && date <= toIso && (mask & monthBit(ms))) jobs.push({ o, d, date, tier: 'far' });
  }
  return jobs;
}

/**
 * The fill's route order (T819): every route the late cycle will not reach
 * within `spanMin` minutes of nowMs, starting with the one it reaches next
 * after that and wrapping round to the one it reaches now. Run once over
 * `spanMin`, it gives every route a late fare by then; each filled route still
 * gets its normal turn within one LATE_CYCLE, so no fare outlives the age.
 */
export function lateFillOrder(n, nowMs, spanMin) {
  const minute = Math.floor(nowMs / 60000);
  const first = (m) => Math.ceil(((((m % LATE_CYCLE) + LATE_CYCLE) % LATE_CYCLE) * n) / LATE_CYCLE) % n;
  const from = first(minute + spanMin);
  const to = first(minute);
  const out = [];
  for (let r = from; r !== to; r = (r + 1) % n) out.push(r);
  return out;
}

/**
 * How long to pause after Google refuses a search (T780). The first refusal
 * pauses an hour; a refusal within 2 hours of the last pause ending doubles
 * it, up to a day, so a block that keeps coming back is left alone longer.
 * @param {number} now
 * @param {number} lastUntil   when the previous pause ended (0: never)
 * @param {number} lastLevel   that pause's level (0 = one hour)
 * @returns {{until:number, level:number}}
 */
export const PAUSE_BASE_MS = 3600000;
export const PAUSE_MAX_MS = 86400000;
export const PAUSE_RESET_MS = 7200000;
export function nextPause(now, lastUntil = 0, lastLevel = 0) {
  const level = lastUntil && now - lastUntil < PAUSE_RESET_MS ? lastLevel + 1 : 0;
  const ms = Math.min(PAUSE_BASE_MS * 2 ** level, PAUSE_MAX_MS);
  return { until: now + ms, level };
}
