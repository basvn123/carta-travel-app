/**
 * doors.js, how much Carta plans (T863 to T866, plan flow v3 Batch D).
 *
 * After the setup the traveller picks one of four doors:
 *
 *   guide    Plan the whole trip for me   Help me choose, then the trips
 *   flight   Find my flight first         flights to every place that fits
 *   know     I know where I'm going       the named places, a priced route
 *   booked   I've booked part of it       the bookings anchor the trip
 *
 * The door is kept on the trip (settings.door), so the trip page knows a
 * flight-first trip or a booked one and offers "Plan the rest".
 *
 *   suggestDoor(s)              the door the words point at
 *   selectionOfPlan(plan)       a finder plan as the planner's hand-over
 *   bookedTrip(s, destinations) the trip the bookings make, with the booked parts marked
 *
 * Plain JS, no React and no store, so node tests hold it (tests/doors.test.mjs).
 * It rides in the Plan tab's first load, so it imports nothing heavy.
 */
import { arrivalFromImports, staysFromImports } from '../../planner/flow/importStays.js';

/** The four doors, in their order on the screen (the trip settings' TRIP_DOORS; tests/doors pins them equal). */
export const DOORS = ['guide', 'flight', 'know', 'booked'];
/** The doors whose trip page offers "Plan the rest": Carta did not plan all of it. */
export const PARTIAL_DOORS = ['flight', 'booked'];

const DAY_MS = 86400000;
const addDays = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const nightsBetween = (a, b) => (a && b ? Math.max(0, Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY_MS)) : 0);
const anyBooked = (s) => Boolean(s?.booked && Object.values(s.booked).some(Boolean)) || (s?.imports?.length || 0) > 0;

/**
 * The door the trip's answers point at: a door already chosen (or said in
 * the words, "just a cheap flight") first; then a booking (the trip is built
 * around it); then a named place (they know where); else the whole trip.
 */
export function suggestDoor(s) {
  if (s?.door && DOORS.includes(s.door)) return s.door;
  if (anyBooked(s)) return 'booked';
  if ((s?.places || []).length) return 'know';
  return 'guide';
}

/**
 * A finder plan (planOf) as the hand-over the planner loads (useTripPlanner
 * loadFromWizard, the same fields wizardPlannerState reads), so a trip made
 * on a door lands on the trip page priced as the finder priced it: the
 * places and nights, the party, the stay and Lifestyle, the home airport,
 * and the flight each way on its own day (T855's held legs).
 */
export function selectionOfPlan(plan, { label = '' } = {}) {
  if (!plan?.order?.length) return null;
  const flights = plan.flights || null;
  return {
    startDate: plan.startDate || '',
    stops: plan.order.map((id) => ({ destinationId: id, nights: Math.max(1, plan.nights?.[id] || 1), activities: [] })),
    label,
    groupSize: plan.party?.adults || 1,
    children: plan.party?.children || 0,
    babies: plan.party?.babies || 0,
    transport: plan.transport || 'auto',
    pace: 'balanced',
    anchorId: plan.anchorId || null,
    returnAnchorId: plan.returnAnchorId || null,
    anchorOrigin: plan.anchorOrigin || null,
    ownFlight: null,
    carHome: plan.carHome || null,
    legModes: {},
    ownLegs: {},
    ownStays: {},
    flightPicks: flights?.out || flights?.back ? { out: flights.out || null, back: flights.back || null } : null,
    stayTier: plan.stayTier || null,
    lifestyle: plan.lifestyle || null,
  };
}

const FLIGHT_KINDS = ['flight', 'flight_out', 'flight_home'];
const paidOf = (list) => {
  const v = list.reduce((sum, b) => sum + (Number(b.eur) > 0 ? Number(b.eur) : 0), 0);
  return Math.round(v * 100) / 100;
};

/**
 * The trip the bookings make (T866), or null when they hold nothing the
 * catalogue can place. The booked stays are the stops, each with its nights
 * and what it cost; with only a flight booked, the town it lands in is the
 * one base for the trip's nights and Carta fills the stay, the food and the
 * getting around. A booked flight is the traveller's own fare each way
 * (labelled theirs on the trip page) and the trip lands where it lands; a
 * booked stay is the traveller's own price for that stop. Whatever is not
 * booked (the flight with stays booked, the bed with a flight booked) Carta
 * prices as for any trip.
 *
 *   -> { selection (loadFromWizard's hand-over), booked: { flights, stays: [destinationId] } } | null
 */
export function bookedTrip(s, destinations, { label = '' } = {}) {
  const imports = Array.isArray(s?.imports) ? s.imports : [];
  const when = s?.when || {};
  const stays = staysFromImports(imports, destinations, when);
  const arrival = arrivalFromImports(imports, destinations);
  const flightsBooked = Boolean(s?.booked?.flights) || imports.some((b) => FLIGHT_KINDS.includes(b.kind));
  const nightsWanted = when.start && when.end ? nightsBetween(when.start, when.end) : Number(when.nights) || 7;
  let stops = stays.map((r) => ({ destinationId: r.id, nights: r.nights, activities: [] }));
  if (!stops.length && arrival) stops = [{ destinationId: arrival, nights: Math.max(1, nightsWanted), activities: [] }];
  if (!stops.length) return null;

  const dated = imports.map((b) => b.date).filter(Boolean).sort();
  const start = when.mode === 'exact' && when.start ? when.start : (dated[0] || '');
  const total = stops.reduce((n, x) => n + x.nights, 0);
  const out = imports.filter((b) => b.kind === 'flight_out');
  const home = imports.filter((b) => b.kind === 'flight_home');
  const either = imports.filter((b) => b.kind === 'flight');
  const split = out.length > 0 || home.length > 0;
  const costOut = split ? paidOf(out) : 0;
  const costBack = split ? paidOf(home) : 0;
  const costTotal = split ? Math.round((costOut + costBack + paidOf(either)) * 100) / 100 : paidOf(either);
  const airline = [...new Set([...out, ...home, ...either].map((b) => (b.title || b.code || '').trim()).filter(Boolean))].join(' / ');
  const ownFlight = flightsBooked ? {
    airline,
    mode: 'fly',
    booked: true,
    costTotal,
    ...(split ? { costOut, costBack } : {}),
    outDate: start || null,
    retDate: start ? addDays(start, total) : null,
  } : null;
  const ownStays = Object.fromEntries(stays.filter((r) => r.eur > 0).map((r) => [r.id, r.eur]));
  return {
    selection: {
      startDate: start,
      stops,
      label,
      groupSize: s?.party?.adults || 1,
      children: s?.party?.kids || 0,
      babies: s?.party?.babies || 0,
      transport: 'auto',
      pace: 'balanced',
      // The booked flight lands where it lands (the old wizard's arrival rule).
      anchorId: flightsBooked && arrival ? arrival : null,
      returnAnchorId: null,
      anchorOrigin: null,
      ownFlight,
      carHome: null,
      legModes: {},
      ownLegs: {},
      ownStays,
      flightPicks: null,
      stayTier: null,
      lifestyle: null,
    },
    booked: { flights: flightsBooked, stays: stays.map((r) => r.id) },
  };
}

/** T874: the flight the words said is booked: the one town named and the trip's exact days, else blanks. */
export function saidFlight(s) {
  const towns = (s?.places || []).filter((p) => p.kind === 'place' && p.name);
  const exact = s?.when?.mode === 'exact';
  const on = Boolean(s?.booked?.flights);
  return {
    city: on && towns.length === 1 ? towns[0].name : '',
    out: on && exact && s.when.start ? s.when.start : '',
    back: on && exact && s.when.end ? s.when.end : '',
  };
}
