import { rule } from './price/config.js';

/** "2 adults, 1 child": the party in words, through i18n (T458). */
export function partyText(t, { adults = 1, children = 0, babies = 0 } = {}) {
  const bits = [t(adults === 1 ? 'plan.partyAdultOne' : 'plan.partyAdultMany', { n: adults })];
  if (children) bits.push(t(children === 1 ? 'plan.partyChildOne' : 'plan.partyChildMany', { n: children }));
  if (babies) bits.push(t(babies === 1 ? 'plan.partyBabyOne' : 'plan.partyBabyMany', { n: babies }));
  return bits.join(', ');
}

/*
 * The party's shares (T579), estimates every price that splits by person
 * reads: seats are adults plus children (group_size); babies sit on a lap
 * and take no seat and no bed.
 */
const SHARES = rule('party.shares');
export const CHILD_FOOD_SHARE = SHARES.child_food;
export const BABY_FOOD_SHARE = SHARES.baby_food;
export const CHILD_TICKET_SHARE = SHARES.child_ticket;
export const BABY_LAP_FEE_LEG = rule('party.baby_lap_fee_leg');

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
// T691: one cap for every screen (config party.limits): before 12, 20 or 99.
const LIMITS = rule('party.limits');

/** The party from the app's choices: group_size is every seat (adults plus
 *  children), children and babies are counted on their own. */
export function partyOf(choices) {
  const seats = clampInt(choices?.group_size ?? LIMITS.default_seats, 1, LIMITS.max_seats);
  const children = clampInt(choices?.children ?? 0, 0, seats - 1);
  const babies = clampInt(choices?.babies ?? 0, 0, LIMITS.max_babies);
  return { adults: seats - children, children, babies, seats };
}

/** What a seat eats, on average, against an adult day (1 for adults only). */
export function foodShare(party) {
  const p = party || { adults: 1, children: 0, babies: 0, seats: 1 };
  return (p.adults + CHILD_FOOD_SHARE * p.children + BABY_FOOD_SHARE * p.babies) / p.seats;
}

/** What a seat pays for a train or coach ticket, on average, against an adult fare. */
export function ticketShare(party) {
  const p = party || { adults: 1, children: 0, seats: 1 };
  return (p.adults + CHILD_TICKET_SHARE * p.children) / p.seats;
}

/** A return flight a seat, with the babies' lap fees shared over the seats. */
export function flightPerSeat(perSeat, party) {
  if (!(perSeat > 0)) return null;
  const p = party || { babies: 0, seats: 1 };
  return perSeat + (p.babies * BABY_LAP_FEE_LEG * 2) / p.seats;
}

