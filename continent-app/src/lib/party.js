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

/** The kind a party of these counts reads as (teens are adults here, but a
 *  family keeps its kind: E2, G-8). */
export function kindOfCounts(adults, kids, babies = 0, teens = 0) {
  if (kids > 0 || babies > 0 || teens > 0) return 'family';
  if (adults <= 1) return 'solo';
  if (adults === 2) return 'couple';
  return adults <= LIMITS.friends_max_adults ? 'friends' : 'group';
}

/** Whether a kind of party still fits the counts (G-10): a family needs a child,
 *  a teen or a baby, solo is one adult, a couple is two adults, a group has no
 *  children. An explicit kind wins while it fits; adults count the teens. */
export function kindFits(kind, { adults = 1, kids = 0, babies = 0, teens = 0 } = {}) {
  const young = kids + babies + teens;
  if (kind === 'family') return young > 0;
  if (kind === 'solo') return adults === 1 && young === 0;
  if (kind === 'couple') return adults === 2 && young === 0;
  return young === 0 || kind === 'group';
}

/**
 * The party from the app's choices: group_size is every seat (adults, teens
 * and children), children, babies and teens are counted on their own.
 *
 *   adults    everyone priced as an adult: from 12 up, teens included
 *   teens     12 to 17 (a count inside `adults`; priced as adults, kept for the kind)
 *   children  2 to 11, a child's share of food and tickets, a bed in the parents' room
 *   babies    under 2: a lap on the plane, a car seat in the car (owner default 2)
 *   seats     adults plus children, what a ticket and a bed count; `paying` is the same number
 *   carSeats  seats plus babies; cars is that over one car's seats (car.model car_capacity)
 *   kind      the traveller's own kind while it fits the counts, else read from them
 *   limits    config party.limits, the one cap
 */
export function partyOf(choices) {
  const seats = clampInt(choices?.group_size ?? LIMITS.default_seats, 1, LIMITS.max_seats);
  const children = clampInt(choices?.children ?? 0, 0, seats - 1);
  const babies = clampInt(choices?.babies ?? 0, 0, LIMITS.max_babies);
  const adults = seats - children;
  const teens = clampInt(choices?.teens ?? 0, 0, adults - 1);
  const carSeats = seats + babies;
  const read = { adults, kids: children, babies, teens };
  const kind = choices?.kind && kindFits(choices.kind, read) ? choices.kind : kindOfCounts(adults, children, babies, teens);
  return { adults, teens, children, babies, seats, paying: seats, carSeats, cars: carsOf(carSeats), kind, limits: LIMITS };
}

/** How many cars a number of car seats fills (config car.model car_capacity). */
export function carsOf(carSeats, capacity) {
  return Math.max(1, Math.ceil(Math.max(1, carSeats || 1) / Math.max(1, capacity || rule('car.model').car_capacity)));
}

/** The one car count of a party: every seat, babies included (owner default 2). */
export const carsFor = (party) => carsOf(party?.carSeats ?? party?.seats ?? 1);

/** The party of a list of ages: under 2 a baby, 2 to 11 a child, 12 to 17 a
 *  teen (priced as an adult), 18 and over an adult (config party.limits). */
export function partyFromAges(ages) {
  const list = (Array.isArray(ages) ? ages : []).map(Number).filter((a) => Number.isFinite(a) && a >= 0);
  const babies = list.filter((a) => a < LIMITS.baby_under_age).length;
  const children = list.filter((a) => a >= LIMITS.baby_under_age && a < LIMITS.child_under_age).length;
  const teens = list.filter((a) => a >= LIMITS.child_under_age && a < LIMITS.teen_under_age).length;
  return partyOf({ group_size: Math.max(1, list.length - babies), children, babies, teens });
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
