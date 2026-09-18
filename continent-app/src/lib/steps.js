/**
 * steps.js, walking distance in the unit travellers actually feel.
 *
 * Kilometres are a map unit. Nobody knows whether 9 km is a hard day, but
 * everybody with a phone in their pocket knows what 15,000 steps costs them:
 * the step count is the one walking figure most people already have a
 * calibrated sense of, because their phone has been showing it to them
 * every evening for years.
 *
 * So the day planner asks and answers in steps, and converts to kilometres
 * only at the edges that genuinely need them: the plan-day payload (whose
 * server contract speaks maxWalkKm) and distances to another town, which
 * are travelled, not walked.
 */

// An adult's walking stride is roughly 0.70 to 0.78 m, which puts a
// kilometre between about 1,300 and 1,400 steps. 1,350 is the middle of
// that band and keeps the round numbers round: 5 km reads as 6,750, and
// the offered budgets (5k, 10k, 15k, 20k) land on 3.7, 7.4, 11.1 and
// 14.8 km, which are sane walking days.
export const STEPS_PER_KM = 1350;

/** Kilometres to steps, rounded to the nearest 500 so nothing reads false-precise. */
export function kmToSteps(km) {
  const n = Number(km);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round((n * STEPS_PER_KM) / 500) * 500;
}

/** Steps back to kilometres, one decimal, for the server contract. */
export function stepsToKm(steps) {
  const n = Number(steps);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round((n / STEPS_PER_KM) * 10) / 10;
}

/**
 * "9,500 steps" with the reader's own thousands separator. The approximate
 * sign is the caller's business: some strings already say "about".
 */
export function formatSteps(n, lang = 'en') {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '0';
  try {
    return new Intl.NumberFormat(lang).format(Math.round(v));
  } catch {
    return String(Math.round(v));
  }
}

/** Kilometres straight to a formatted step count, the common path. */
export function kmToStepsLabel(km, lang = 'en') {
  return formatSteps(kmToSteps(km), lang);
}

// Under this, a walk is better described by how long it takes than how far
// it goes: "12 min walk" beats "0.9 km".
export const SHORT_WALK_KM = 1.5;
// 4.5 km/h is the usual town-walking figure, and matches daySchedule.js.
export const WALK_KMH = 4.5;

/** Minutes on foot for a short hop, at least 1. */
export function walkMinutes(km) {
  const n = Number(km);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(1, Math.round((n / WALK_KMH) * 60));
}

/**
 * How far away something is, said the way it is actually experienced.
 *
 * Under a kilometre and a half nobody thinks in distance, they think in
 * minutes: "an 11 minute walk" is a decision, "0.8 km" is a sum. Beyond
 * that the distance is the better unit again, because the trip is probably
 * not on foot at all.
 *
 * `t` is the i18n function, so the caller does not have to branch.
 */
export function distanceAway(km, t) {
  const n = Number(km);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < SHORT_WALK_KM) return t('day.minWalk', { min: walkMinutes(n) });
  return t('day.kmAway', { km: n < 10 ? Math.round(n * 10) / 10 : Math.round(n) });
}
