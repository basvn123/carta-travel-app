/**
 * When to go, worked out (T1022): what the place page's When to go section
 * says and draws, from the data the destination carries. Pure, so it is
 * tested in node.
 *
 *   monthsOf(climate, crowding)    twelve months: high, low, rain, comfort
 *                                  tier (great | good | mixed | poor) and
 *                                  crowd tier (0 quiet .. 3 crowded, or null)
 *   whenVerdict(months, best)      the written recommendation: the best
 *                                  months, the quieter months that are still
 *                                  pleasant, the months to skip and why
 *   stayByMonth(rec, kind)         one stay type's price by month, from the
 *                                  scrape (T1021): only the scraped months
 *                                  carry a figure, the rest are gaps; flat
 *                                  when the dearest scraped month is within
 *                                  STAY_FLAT of the cheapest
 *   crowdStanding(id, catalogue)   the share of Europe's places with fewer
 *                                  visitor nights per km2 than this one
 *
 * The comfort tiers are ClimateStrip's (apply_climate.py's 0 to 100 index),
 * the crowd tiers crowdMonth.js's, so the strip and the page read the same.
 */
import { rule } from './price/config.js';
import { QUIET_MAX_TIER } from './crowdMonth.js';

/** Comfort tier -> colour band. Mirrors apply_climate.py's 0-100 index. */
export function comfortTier(c) {
  if (c >= 78) return 'great';
  if (c >= 60) return 'good';
  if (c >= 45) return 'mixed';
  return 'poor';
}

// A month is "hot" at hot_c (daytime high); within stay_flat the scraped
// months are "about the same price" (config/pricing.json when.guide).
const { hot_c: HOT_C, stay_flat: STAY_FLAT } = rule('when.guide');

/** The stay types the section offers, each with the wire tiers that price it, best first. */
export const STAY_KINDS = [
  { kind: 'hostel', tiers: ['dorm'] },
  { kind: 'hotel', tiers: ['hotel3', 'hotel4', 'hotel2', 'hotel5'] },
  { kind: 'home', tiers: ['bnb_home'] },
];

export function monthsOf(climate, crowding) {
  const m = climate?.m;
  if (!Array.isArray(m) || m.length !== 12) return null;
  const crowd = crowding?.monthly?.tier;
  return m.map(([hi, lo, rain, comfort], i) => ({
    month: i + 1,
    hi: Math.round(hi),
    lo: Math.round(lo),
    rain: Math.round(rain),
    tier: comfortTier(comfort),
    crowd: Array.isArray(crowd) && crowd.length === 12 && Number.isFinite(crowd[i]) ? crowd[i] : null,
  }));
}

/**
 * { best, quieter, hot, cold } as month numbers. `best` is the pipeline's own
 * pick (climate.best) when it has one, else the great and good months.
 * `quieter`: pleasant months (great or good) outside the best whose crowds
 * are quiet or moderate. `hot`: a high of HOT_C or more with busy or packed
 * streets. `cold`: the poor-comfort months that are not hot.
 */
export function whenVerdict(months, best) {
  if (!months) return null;
  const nice = (x) => x.tier === 'great' || x.tier === 'good';
  const picked = Array.isArray(best) && best.length ? best : months.filter(nice).map((x) => x.month);
  const quieter = months.filter((x) => nice(x) && !picked.includes(x.month) && x.crowd != null && x.crowd <= QUIET_MAX_TIER)
    .map((x) => x.month);
  const hot = months.filter((x) => x.hi >= HOT_C && (x.crowd == null || x.crowd > QUIET_MAX_TIER)).map((x) => x.month);
  const cold = months.filter((x) => x.tier === 'poor' && x.hi < HOT_C).map((x) => x.month);
  const span = months.filter((x) => picked.includes(x.month));
  return {
    best: picked,
    range: span.length ? { lo: Math.min(...span.map((x) => x.hi)), hi: Math.max(...span.map((x) => x.hi)) } : null,
    quieter,
    hot,
    cold,
  };
}

/**
 * One stay type's twelve months from a stays record:
 *   { tier, values[12] (null where not scraped), cheap[], dear[], lo, hi, flat }
 * or null when the place has no price for that type.
 */
export function stayByMonth(rec, kind) {
  const def = STAY_KINDS.find((k) => k.kind === kind);
  const tier = def?.tiers.find((t) => Array.isArray(rec?.month?.[t]) && rec.month[t].length === 12);
  if (!tier) return null;
  const q = rec.season_q || '';
  const values = rec.month[tier].map((v, i) => (q[i] === 'm' && v > 0 ? v : null));
  const priced = values.filter((v) => v != null);
  if (!priced.length) return null;
  const lo = Math.min(...priced);
  const hi = Math.max(...priced);
  const at = (v) => values.map((x, i) => (x === v ? i + 1 : 0)).filter(Boolean);
  return { tier, values, lo, hi, cheap: at(lo), dear: at(hi), flat: hi / lo < STAY_FLAT };
}

/** The stay types a record can price, in STAY_KINDS order. */
export function stayKindsOf(rec) {
  return STAY_KINDS.map((k) => k.kind).filter((k) => stayByMonth(rec, k));
}

/** The share (0 to 1) of the catalogue's places with fewer visitor nights per
 *  km2 than `id`, or null when it has no figure. */
export function crowdStanding(id, destinations) {
  const mine = destinations?.[id]?.crowding?.nights_per_km2;
  if (!(mine >= 0)) return null;
  let below = 0;
  let n = 0;
  for (const d of Object.values(destinations || {})) {
    const v = d?.crowding?.nights_per_km2;
    if (!(v >= 0)) continue;
    n += 1;
    if (v < mine) below += 1;
  }
  return n > 1 ? below / (n - 1) : null;
}
