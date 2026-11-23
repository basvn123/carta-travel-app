/**
 * The one stay ladder (E3, ROADMAP D10; logic audit E3; owner defaults 3 and 4
 * of 2026-11-23). What a town does not offer is replaced by the next tier down
 * a declared ladder, never by "the entire place, else whatever is first", and
 * the rooms and beds a party books follow one occupancy rule. Every number is
 * in config/pricing.json: stay.fallback_order, stay.room_occupancy,
 * stay.dorm_child_weight.
 *
 * Pure: no data, no flags. lib/stayPrice.js bedPrice calls these when flag E3
 * is new.
 */
import { rule } from './config.js';

/**
 * The tier a request is priced at, and whether that is a fallback.
 *   want     the tier asked for (a STAY_TIERS id)
 *   offered  the tiers the town can price (stayPrice tiersAt)
 * Walks stay.fallback_order[want] and takes the first offered tier. The entire
 * place ('home') stands last on the cheap ladders, so it is the answer only
 * when nothing cheaper is there. A tier that is in no ladder, or a town that
 * offers none of its ladder, falls to the first tier the town offers, the one
 * thing that is left, and still says it fell back.
 * Returns { tier, fallback, step } (step = how far down the ladder) or null.
 */
export function pickTier(want, offered) {
  if (!offered?.length) return null;
  const ladder = rule('stay.fallback_order')[want] || [want];
  for (let i = 0; i < ladder.length; i += 1) {
    if (offered.includes(ladder[i])) return { tier: ladder[i], fallback: ladder[i] !== want, step: i };
  }
  return { tier: offered[0], fallback: offered[0] !== want, step: ladder.length };
}

/**
 * How many rooms a party books. A room sleeps `adults` adults and up to
 * `children` children (stay.room_occupancy, owner default 4): 2 adults and 1
 * child are one room, 2 adults and 3 children two, 3 adults two.
 */
export function roomsFor(adults, children = 0) {
  const occ = rule('stay.room_occupancy');
  const byAdults = Math.ceil(Math.max(1, adults || 0) / occ.adults);
  const byChildren = Math.ceil(Math.max(0, children || 0) / occ.children);
  return Math.max(1, byAdults, byChildren);
}

/** The beds a party takes in a dorm: one each, a child weighing stay.dorm_child_weight (owner default 4: 1). */
export function dormBeds(adults, children = 0) {
  return Math.max(1, (adults || 0) + Math.ceil((children || 0) * rule('stay.dorm_child_weight')));
}
