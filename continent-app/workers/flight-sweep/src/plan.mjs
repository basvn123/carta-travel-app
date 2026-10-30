/**
 * Which searches the sweep runs in a given minute (T514).
 *
 * Three tiers share one clock, so the load is flat (about 24 searches a
 * minute for the whole of Europe; T780, was about 100 before Google started
 * refusing us) and every route is treated the same:
 *
 *   near   the next 14 days, every fourth day, each route every 3 days
 *   far    weeks 3 to 26, one day per week, each route every 2 weeks
 *   late   weeks 27 to 40, the same, each route every 4 weeks; on the
 *          Hetzner box (T798, workers/late-sweep), sent in through /ingest
 *   find   every pair of Carta airports that no route covers yet, one day
 *          21 days out, direct flights only, each pair once a month
 *
 * A route's slot is its index in the sorted list modulo the tier's cycle
 * length in minutes, so each minute takes a fixed share without scanning or
 * remembering anything. A route Eurostat saw only in some months is skipped
 * on dates in its off months; a route with no direct flight on six checks in
 * a row is dormant and only the find tier looks at it again.
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
// T798: the late tier, weeks 27 to 40 (about 9 months out), runs on the
// Hetzner box (workers/late-sweep), not here: each route every 4 weeks, so
// its fares sit under flights.max_age_days.late.
export const LATE_CYCLE = 40320; // minutes in 4 weeks
export const LATE_WEEKS = 14; // weeks 27 to 40, after the far tier's 24
export const FIND_MIN_KM = 150; // closer than this nobody flies
export const DORMANT_AFTER = 6;

const DAY = 86400000;

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
 * @returns {Array<{o:string,d:string,date:string,tier:'near'|'far'|'find'}>}
 */
export function jobsForMinute(list, airports, nowMs, dormant = new Set()) {
  const minute = Math.floor(nowMs / 60000);
  const today = Math.floor(nowMs / DAY) * DAY;
  const jobs = [];
  const add = (o, d, ms, tier, mask) => {
    if (mask & monthBit(ms)) jobs.push({ o, d, date: isoDay(ms), tier });
  };

  for (const r of routesInMinute(minute, NEAR_CYCLE, list.length)) {
    const [o, d, mask] = list[r];
    if (dormant.has(o + d)) continue;
    for (const k of NEAR_DAYS) add(o, d, today + k * DAY, 'near', mask);
  }
  for (const r of routesInMinute(minute, FAR_CYCLE, list.length)) {
    const [o, d, mask] = list[r];
    if (dormant.has(o + d)) continue;
    for (let w = 0; w < FAR_WEEKS; w++) {
      // A different weekday each week, so a month's cheapest day is not
      // always a Tuesday.
      add(o, d, today + (14 + 7 * w + ((r + w) % 7)) * DAY, 'far', mask);
    }
  }

  const codes = Object.keys(airports).sort();
  const known = new Set(list.filter(([o, d]) => !dormant.has(o + d)).map(([o, d]) => o + d));
  const pairs = codes.length * codes.length;
  for (let p = minute % FIND_CYCLE; p < pairs; p += FIND_CYCLE) {
    const o = codes[Math.floor(p / codes.length)];
    const d = codes[p % codes.length];
    if (o === d || known.has(o + d)) continue;
    if (km(airports[o], airports[d]) < FIND_MIN_KM) continue;
    jobs.push({ o, d, date: isoDay(today + FIND_AHEAD * DAY), tier: 'find' });
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
  for (let w = 0; w < FAR_WEEKS; w++) {
    const ms = today + (14 + 7 * w + ((r + w) % 7)) * DAY;
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
