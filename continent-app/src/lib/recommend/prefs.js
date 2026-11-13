/**
 * One reading each of two trip settings the trip finder asks in several
 * places (selection in candidates.js, order in rank.js, pricing in
 * trips.js). They used to be read differently per file: the persona pool
 * missed a "mild" weather answer, and the quiz missed public transport and
 * taxis as "no car". Both take the settings' guide. Pure.
 */

/** Heat is to be avoided: said outright, or the weather answer is mild. */
export function avoidsHeat(guide) {
  return Boolean(guide?.avoid?.includes('heat') || guide?.weather === 'mild');
}

/**
 * No car on the trip (owner, plan flow walk 2026-10-30): an older "avoid a
 * car" answer, or getting around by public transport or taxis.
 */
export function noCar(guide) {
  const around = guide?.around;
  return Boolean(guide?.avoid?.includes('car') || around === 'public' || around === 'taxi');
}
