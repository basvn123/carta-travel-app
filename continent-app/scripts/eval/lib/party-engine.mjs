/*
 * The E2 one party model's harness (G1, ROADMAP G4, logic wave 3). It runs the
 * REAL app code of every site that counts a party (the Explore way-there car,
 * the Places drive, the planner's hire, the day card's car line, the footprint
 * of a car, the day budget's divisor, the style and the planner's caps, the
 * party kind) twice, with flag E2 forced to old and to new (lib/flags.js
 * withFlags), and reduces each answer to a few scalars a golden case can
 * state: what a screen would print.
 *
 * Cars are read off each site's own money: Explore's car return is priced per
 * car, so cars = its total over the same drive for one seat. The place is
 * Annecy (real coordinates, Brussels as the start), the probe the audit used
 * (explore-B-transport-stays.md P8).
 */
import { withFlags, flag } from '../../../src/lib/flags.js';
import { groundReturn } from '../../../src/lib/travelWay.js';
import { drivingEstimate } from '../../../src/lib/runtime_pricing.js';
import * as PARTY from '../../../src/lib/party.js';
import { quoteTrip } from '../../../src/lib/tripTotal.js';
import { priceDay } from '../../../src/lib/price/priceDay.js';
import { DEFAULT_PRICE_REQUEST } from '../../../src/lib/price/request.js';
import { legKg } from '../../../src/lib/footprint/footprint.js';
import { budgetCheck } from '../../../src/planner/flow/budget.js';
import { styleFromChoices, kindOfCounts } from '../../../src/lib/travelStyles.js';
import { CATALOGUE } from './totals-engine.mjs';

const ANNECY = { id: 'gem:annecy', city: 'Annecy', iso2: 'FR', lat: 45.8992, lon: 6.1294, local_transport: {} };
const BRUSSELS = { lat: 50.8466, lon: 4.3528, name: 'Brussels', iso2: 'BE' };

const seatsOf = (p) => p.adults + (p.children || 0);

function tripState(p) {
  return {
    stops: [{ destinationId: 'BCN', nights: 3, activities: [] }], tripStart: '2027-03-06', tripEnd: '2027-03-09',
    groupSize: p.adults, children: p.children || 0, babies: p.babies || 0, transportPref: 'car', baggage: 'priority_10kg',
    ownFlight: null, carHome: null, stayTier: 'home', lifestyle: null,
  };
}

/** The cars each screen counts for one party. */
export function carsAt(p) {
  const party = PARTY.partyOf({ group_size: seatsOf(p), children: p.children || 0, babies: p.babies || 0 });
  const one = groundReturn(ANNECY, BRUSSELS, 'car', PARTY.partyOf({ group_size: 1 }));
  const ex = groundReturn(ANNECY, BRUSSELS, 'car', party);
  const places = drivingEstimate(ANNECY, BRUSSELS, { group_size: seatsOf(p), children: p.children || 0, babies: p.babies || 0 }, null, null);
  const q = quoteTrip(tripState(p), { data: { destinations: CATALOGUE } });
  const day = priceDay(CATALOGUE.BCN, { ...DEFAULT_PRICE_REQUEST, transport: 'car', group: { adults: p.adults, children: p.children || 0, babies: p.babies || 0 } }, CATALOGUE);
  return {
    explore: ex && one ? Math.round(ex.total / one.total) : null,
    places: places?.cars ?? null,
    planner: q.carRental?.cars ?? null,
    day: day?.lines?.find((l) => l.key === 'car')?.basis?.cars ?? null,
  };
}

const withFlagsIsNew = () => flag('E2') === 'new';
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

/** One golden case, answered by whatever flag E2 is now. */
function answer(c) {
  if (c.kind === 'cars') return carsAt(c.party);
  if (c.kind === 'footprint') return { kg: r1(legKg('car', c.km, { seats: seatsOf(c.party), babies: c.party.babies || 0 })) };
  if (c.kind === 'dayBudget') {
    const p = c.party;
    const priced = { perPerson: 0, parts: { beds: c.beds, days: c.days }, party: { babies: p.babies || 0 } };
    const r = budgetCheck(priced, { kind: 'day', eur: c.budget }, { party: p.adults + (p.children || 0) + (p.babies || 0), nights: c.nights });
    return { over: r.over, gap: r.gap };
  }
  if (c.kind === 'kind') {
    if (c.ages) {
      // Before E2 the app has no teen: everyone from 12 up is an adult, so a family of two teens reads as friends.
      if (PARTY.partyFromAges && withFlagsIsNew()) return { kind: PARTY.partyFromAges(c.ages).kind };
      const babies = c.ages.filter((a) => a < 2).length; const kids = c.ages.filter((a) => a >= 2 && a < 12).length;
      return { kind: kindOfCounts(c.ages.length - babies - kids, kids, babies) };
    }
    const kids = c.kids || 0;
    const s = styleFromChoices({ who: { kind: c.styleKind, adults: c.adults, kids, babies: c.babies || 0 } }, { group_size: c.adults + kids, children: kids, babies: c.babies || 0 });
    return { kind: s.who.kind ?? kindOfCounts(c.adults, kids, c.babies || 0) };
  }
  if (c.kind === 'limits') {
    const q = quoteTrip(tripState({ adults: 2, children: 0, babies: c.babies }), { data: { destinations: CATALOGUE } });
    const s = styleFromChoices({ who: { kind: 'family', adults: 2, kids: 0, babies: 0 } }, { group_size: 2, babies: c.babies });
    return { planner: q.party.babies, style: s.who.babies, party: PARTY.partyOf({ group_size: 2, babies: c.babies }).babies };
  }
  throw new Error(`party case ${c.id}: unknown kind ${c.kind}`);
}

export const partyPaths = {
  old: (c) => withFlags({ E2: 'old' }, () => answer(c)),
  new: (c) => withFlags({ E2: 'new' }, () => answer(c)),
};

/* ---- the persona view (shadow diff and characterisation snapshot) ---- */

/** The gate-7 travellers' parties: [adults, children, babies]. The toddler family carries the baby. */
export const PERSONA_PARTY = {
  'family-toddler': [2, 0, 1], 'beach-family': [2, 2, 0], 'friends-out': [4, 0, 0], skier: [4, 0, 0], backpacker: [1, 0, 0],
};
const partyOfPersona = (persona) => {
  const [adults, children, babies] = PERSONA_PARTY[persona.id] || ({ couple: [2, 0, 0], friends: [4, 0, 0], solo: [1, 0, 0], family: [2, 2, 0] }[persona.taste?.party] || [2, 0, 0]);
  return { adults, children, babies };
};

/** What one persona sees from the E2 sites, as short lines. */
export function personaParty(persona, which) {
  const p = partyOfPersona(persona);
  return withFlags({ E2: which }, () => {
    const cars = carsAt(p);
    const kg = answer({ kind: 'footprint', party: p, km: 800 }).kg;
    const budget = answer({ kind: 'dayBudget', party: p, beds: 700, days: 500, budget: 90, nights: 7 });
    return { party: `${p.adults}+${p.children}+${p.babies}`, cars: `explore ${cars.explore}, places ${cars.places}, planner ${cars.planner}, day ${cars.day}`, kg, dayBudget: `${budget.over ? 'over' : 'within'} by ${budget.gap}` };
  });
}
