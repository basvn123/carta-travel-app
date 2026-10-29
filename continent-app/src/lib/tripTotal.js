/**
 * tripTotal.js, the one price of a planned trip (T432).
 *
 * The wizard's running estimate and the planned trip's total used to be two
 * sums over two sets of inputs: the wizard left out the airport transfers the
 * planner added, the planner dropped a car cost the wizard counted, and the
 * two read the Lifestyle from different places. The same Albania week read
 * 556.48 on the last wizard step and 676.48 one tap later.
 *
 * Now there is one function. `quoteTrip(state, ctx)` (lib/price/trip.js since T702) takes the planner's own
 * state (the shape useTripPlanner holds and persists) and returns every priced
 * part of the trip plus its total. useTripPlanner calls it for the planned
 * view; the wizard builds the state it is about to hand over through
 * `wizardPlannerState()` (the same transform loadFromWizard applies) and calls
 * it too, so the figure on every step IS the figure the planned trip shows.
 *
 * Pure: no React, no i18n, so tests/tripTotal.test.mjs can price trips in
 * node and assert the wizard and the planner agree.
 */
import { addDays } from './dates.js';
import { MAX_PARTY, PLANNER_BAG } from './price/trip.js';

// T702: the trip price lives in the engine (lib/price/trip.js); the names
// the screens import from here stay.
export {
  quoteTrip, OWN_LEG_MODES, MAX_PARTY, PLANNER_BAG, normalizeTransferMode, paidEur, tripStopDetails,
} from './price/trip.js';

/**
 * The trip's receipt lines in one fixed order, each marked for what it is:
 * 'est' a Carta estimate, 'yours' a figure the traveller typed, 'flight'
 * Google Flights' price with its airline and check time (`leg`), 'missing'
 * a way there or home nobody has priced yet (no flight found, or not flown).
 * Every screen and the PDF render these lines; none adds its own.
 */
export function tripLines(priced) {
  if (!priced) return [];
  const { parts, flight, legs, stayCosts, driveLegs, cartaFlight } = priced;
  const tr = priced.travelSplit || { legacy: false, out: 0, back: 0 };
  const lines = [];
  if (tr.legacy) {
    lines.push({ key: 'travel', eur: tr.out, kind: 'yours' });
    if (flight?.driving && parts.drive > 0) lines.push({ key: 'drive', eur: parts.drive, kind: 'est' });
  } else {
    for (const dir of ['out', 'back']) {
      const paid = tr[dir];
      const est = flight?.driving ? (dir === 'out' ? driveLegs?.out?.ground_total : driveLegs?.home?.ground_total) || 0 : 0;
      const carta = cartaFlight?.[dir];
      if (paid > 0) lines.push({ key: dir, eur: paid, kind: 'yours' });
      else if (carta?.cost) lines.push({ key: dir, eur: carta.cost.total, kind: 'flight', leg: carta });
      else if (est > 0) lines.push({ key: dir, eur: est, kind: 'est' });
      else lines.push({ key: dir, eur: 0, kind: 'missing' });
    }
  }
  if (parts.transfers > 0) lines.push({ key: 'transfers', eur: parts.transfers, kind: 'est' });
  if (parts.between > 0 || legs.some(Boolean)) {
    const legRows = legs.filter((l) => l && l.ground_total != null);
    const allOwn = legRows.length > 0 && legRows.every((l) => l.own);
    const someOwn = legRows.some((l) => l.own);
    lines.push({ key: 'between', eur: parts.between, kind: allOwn ? 'yours' : 'est', mixed: someOwn && !allOwn });
  }
  if (parts.car > 0) lines.push({ key: 'car', eur: parts.car, kind: 'est' });
  if (parts.daytrips > 0) lines.push({ key: 'daytrips', eur: parts.daytrips, kind: 'est' });
  const bedRows = stayCosts.filter(Boolean);
  const bedsOwn = bedRows.length > 0 && bedRows.every((s) => s.ownAccom);
  lines.push({ key: 'beds', eur: parts.beds, kind: bedsOwn ? 'yours' : 'est', mixed: !bedsOwn && bedRows.some((s) => s.ownAccom) });
  lines.push({ key: 'days', eur: parts.days, kind: 'est' });
  return lines;
}

/**
 * How many of the trip's prices the traveller has settled with their own
 * figure: the way there and home, each hop between stops, each bed. The
 * readiness line reads it ("3 of 5 prices are yours").
 */
export function tripReadiness(priced) {
  if (!priced) return { yours: 0, of: 0 };
  let of = 0;
  let yours = 0;
  const tr = priced.travelSplit || {};
  if (tr.legacy) { of += 1; yours += 1; } else {
    of += 2;
    if (tr.out > 0) yours += 1;
    if (tr.back > 0) yours += 1;
  }
  priced.legs.forEach((l) => { if (!l || l.no_road) return; of += 1; if (l.own) yours += 1; });
  priced.stayCosts.forEach((s) => { if (!s) return; of += 1; if (s.ownAccom) yours += 1; });
  return { yours, of };
}

/**
 * The planner state a wizard hand-over becomes: exactly what loadFromWizard
 * applies, as a pure transform, so the wizard can price the trip it is about
 * to hand over with the same function the planned view uses.
 */
export function wizardPlannerState(payload, { stayTier = 'home', lifestyle = null } = {}) {
  const p = payload || {};
  const stops = (p.stops || []).map((s) => ({
    destinationId: s.destinationId,
    nights: Math.max(1, s.nights || 1),
    activities: s.activities || [],
  }));
  const total = stops.reduce((sum, s) => sum + s.nights, 0);
  return {
    tripStart: p.startDate || '',
    tripEnd: p.startDate ? addDays(p.startDate, total) : '',
    stops,
    groupSize: Math.max(1, Math.min(MAX_PARTY, p.groupSize || 1)),
    children: Math.max(0, p.children || 0),
    babies: Math.max(0, p.babies || 0),
    transportPref: p.transport || 'auto',
    pace: p.pace || 'balanced',
    baggage: p.baggage || PLANNER_BAG,
    anchorId: p.anchorId || null,
    anchorOrigin: p.anchorOrigin || null,
    returnAnchorId: p.returnAnchorId || null,
    ownFlight: p.ownFlight || null,
    carHome: p.carHome || null,
    legModes: p.legModes || {},
    ownLegs: p.ownLegs || {},
    ownStays: p.ownStays || {},
    transferMode: { in: 'auto', out: 'auto' },
    stayTier,
    lifestyle,
  };
}
