/**
 * Which searches the sweep runs in a given minute (T514).
 *
 * Three tiers share one clock, so the load is flat (about 120 searches a
 * minute for the whole of Europe) and every route is treated the same:
 *
 *   near   the next 14 days, every other day, each route twice a day
 *   far    weeks 3 to 26, one day per week, each route once a week
 *   find   every pair of Carta airports that no route covers yet, one day
 *          21 days out, direct flights only, each pair once a month
 *
 * A route's slot is its index in the sorted list modulo the tier's cycle
 * length in minutes, so each minute takes a fixed share without scanning or
 * remembering anything. A route Eurostat saw only in some months is skipped
 * on dates in its off months; a route with no direct flight on six checks in
 * a row is dormant and only the find tier looks at it again.
 */

export const NEAR_CYCLE = 720; // minutes in 12 hours
export const FAR_CYCLE = 10080; // minutes in a week
export const FIND_CYCLE = 43200; // minutes in 30 days
export const NEAR_DAYS = [1, 3, 5, 7, 9, 11, 13];
export const FAR_WEEKS = 24; // weeks 3 to 26
export const FIND_AHEAD = 21;
export const FIND_MIN_KM = 150; // closer than this nobody flies
export const DORMANT_AFTER = 6;

const DAY = 86400000;

export const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const monthBit = (ms) => 1 << new Date(ms).getUTCMonth();

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

  for (let r = minute % NEAR_CYCLE; r < list.length; r += NEAR_CYCLE) {
    const [o, d, mask] = list[r];
    if (dormant.has(o + d)) continue;
    for (const k of NEAR_DAYS) add(o, d, today + k * DAY, 'near', mask);
  }
  for (let r = minute % FAR_CYCLE; r < list.length; r += FAR_CYCLE) {
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
