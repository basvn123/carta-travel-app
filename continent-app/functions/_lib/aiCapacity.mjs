/**
 * aiCapacity: the capacity rules as pure functions (ai fix program wave 1,
 * QUOTA-005, S3 of the gemini-rag decision; ROADMAP E7).
 *
 * The numbers live in continent-app/config/ai_models.json `capacity` and
 * reach this module through the generated aiConfig.mjs. The atomic version of
 * the same rule for signed-in features is the SQL function ai_consume_v2
 * (migration 078); this module turns the config into the arguments it takes
 * and states the rule once for code that has no database (Ask's guests, lane
 * 6). Byte-identical copy: continent-app/functions/_lib/aiCapacity.mjs.
 *
 * The rule:
 *   1. A cache hit costs no shared capacity (it never reaches Google).
 *   2. A per-user daily limit, the same for every tier, comes first.
 *   3. Then the spend breaker on the shared daily count: guests are cut first
 *      (at guestShare of the ceiling), then free accounts (at freeShare),
 *      Pass holders never (they are counted, and stopped only by their own
 *      allowance and the daily limit).
 */
import { AI_CAPACITY } from './aiConfig.mjs';

export const AUDIENCES = ['guest', 'free', 'pass'];

/** The audience of a tier id from plan_tiers: free, or a Pass (trip, year); no account is a guest. */
export function audienceOf(tier) {
  if (!tier) return 'guest';
  return tier === 'free' ? 'free' : 'pass';
}

/** The shared-count ceiling for each audience: { guest, free, pass }, pass null (never cut). */
export function breakerCaps(globalCap, cfg = AI_CAPACITY) {
  const cap = Math.max(0, Math.floor(Number(globalCap) || 0));
  return {
    guest: Math.floor(cap * cfg.breaker.guestShare),
    free: Math.floor(cap * cfg.breaker.freeShare),
    pass: null,
  };
}

/** May one more uncached call of this audience run with spentToday on the shared count? */
export function breakerAllows(audience, spentToday, globalCap, cfg = AI_CAPACITY) {
  if (audience === 'pass') return true;
  const caps = breakerCaps(globalCap, cfg);
  const ceiling = audience === 'free' ? caps.free : caps.guest;
  return (Number(spentToday) || 0) < ceiling;
}

/** The global daily ceiling: AI_GLOBAL_DAILY_CAP when it is a positive number, else the config default. */
export function globalCapFrom(envValue, cfg = AI_CAPACITY) {
  const n = Math.floor(Number(envValue));
  return Number.isFinite(n) && n > 0 ? n : cfg.globalDailyCapDefault;
}

/** The per-user daily limit for a quota kind ('plan' or 'ground'). */
export function userDayLimit(kind, cfg = AI_CAPACITY) {
  return cfg.userDailyLimit[kind] ?? cfg.userDailyLimit.plan;
}

/**
 * Has a "k of any n days" trigger fired? days is one entry per day, oldest
 * first: true (the signal happened), false (it did not), null (no data). A
 * day with no data is never read as a quiet day.
 *   { status: 'fired' | 'not_fired' | 'no_data', hits, known }
 * not_fired needs n known days in the window; with fewer it is no_data.
 */
export function triggerStatus(days, { k, n }) {
  const list = Array.isArray(days) ? days : [];
  const count = (w) => ({
    hits: w.filter((d) => d === true).length,
    known: w.filter((d) => d === true || d === false).length,
  });
  for (let s = 0; s + n <= list.length; s += 1) {
    const c = count(list.slice(s, s + n));
    if (c.hits >= k) return { status: 'fired', ...c };
  }
  const last = count(list.slice(-n));
  if (last.hits >= k) return { status: 'fired', ...last };
  return { status: list.length >= n && last.known === n ? 'not_fired' : 'no_data', ...last };
}

/** Every capacity trigger in the config against its day series: [{ id, then, ...triggerStatus }]. */
export function capacityTriggers(seriesById, cfg = AI_CAPACITY) {
  return cfg.triggers.map((t) => ({ id: t.id, then: t.then, ...triggerStatus(seriesById?.[t.id], t) }));
}
