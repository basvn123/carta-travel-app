/**
 * "Plan this trip" (TF2, T801): one priced trip, with every swap the
 * receipt made, handed to the planner so nothing is asked twice and the
 * Finish total is the receipt's total.
 *
 * The plan carries what the trip finder priced the trip with (trips.js
 * plannerState): the places and their nights in the finder's order, the
 * dates, the party, the gateway the flight lands at, the stay tier, the
 * Lifestyle, the getting-around mode, the flight ranking, and the live
 * flights the traveller took in the picker. The wizard keeps these while
 * the places stay as picked (`appliesTo`); it prices the trip through
 * `withPlan`, the same quoteTrip request the finder made.
 *
 * This file is the wizard's side and stays light (the wizard is in the Plan
 * tab's first load); the plan itself is made in the finder's lazy chunk
 * (planOf.js). Pure: node tests hold the proof (tests/finderHandoff.test.mjs).
 */
import { wizardPlannerState } from '../../lib/tripTotal.js';

/** Does the plan still describe these stops (the same places, in any order)? */
export function appliesTo(plan, ids) {
  if (!plan || !ids?.length || ids.length !== plan.order.length) return false;
  const want = new Set(plan.order);
  return ids.every((id) => want.has(id));
}

/** The planner's steps a seeded trip skips: Where always, Stay unless the stay is the traveller's. */
export function landingStep(plan, steps) {
  const after = plan.yours.includes('stay') ? 'Stay' : 'Getting';
  for (const name of [after, 'Getting', 'Finish']) if (steps.includes(name)) return name;
  return steps[0];
}

/** The wizard's hand-over with the plan's choices in it (what the planned trip loads). */
export function withPlan(handOver, plan) {
  return {
    ...handOver,
    stops: plan.order.map((id) => handOver.stops.find((s) => s.destinationId === id)).filter(Boolean),
    stayTier: plan.stayTier || handOver.stayTier,
    transport: plan.transport,
    pace: 'balanced',
    anchorId: plan.anchorId,
    returnAnchorId: plan.returnAnchorId,
    anchorOrigin: plan.anchorOrigin,
    carHome: plan.carHome || handOver.carHome || null,
  };
}

/** The quoteTrip request for a seeded hand-over: the finder's own. */
export function planState(handOver, plan) {
  return {
    ...wizardPlannerState(handOver, { stayTier: plan.stayTier || handOver.stayTier, lifestyle: plan.lifestyle }),
    flightRank: plan.flightRank,
    ...(plan.liveFlights.length ? { liveFlights: new Map(plan.liveFlights) } : {}),
    // T855: the card's flight each way, on its own day and airport (planOf flightsOf).
    ...(plan.flights ? { handedFlights: plan.flights } : {}),
  };
}

/**
 * The wizard draft that opens the planner on this trip (plannerStore.setWizard).
 * T859: the countries already picked (the places Tell Carta's words named)
 * are kept after the trip's own, not overwritten, at most three (the
 * compare limit).
 */
export function draftFor(plan, steps, kept = []) {
  const stepName = landingStep(plan, steps);
  return {
    stepName,
    step: steps.indexOf(stepName) + 1,
    countries: [...new Set([plan.country, ...(Array.isArray(kept) ? kept : [])].filter(Boolean))].slice(0, 3),
    buildMode: 'custom',
    tripPickId: null,
    booked: { travel: false, stays: false },
    dateMode: 'exact',
    nights: plan.nights,
    order: plan.order,
    pace: 'balanced',
    finder: plan,
  };
}
