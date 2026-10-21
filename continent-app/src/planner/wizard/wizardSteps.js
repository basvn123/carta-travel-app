/**
 * The guided trip wizard's step list and the small pure rules around it
 * (T500, roadmap 1.3c). Kept free of React so the node tests can hold them.
 *
 * T490-c (owner): Booked and Who are ONE step, so the plain path is six
 * steps: Booked (with Who), When, Where, Stay or Trips, Getting there,
 * Review. Travel booked adds From after the first step; beds booked puts
 * Your stays in place of Where and the city picker; travel and beds booked
 * drops Getting there.
 */
import { formatEst, formatMoney } from '../../lib/money.js';

/** The step after Where, by how the trip is being built. */
export const STEP3 = { stays: 'Stays', ready: 'Trips', custom: 'Stay' };

export const STEP_LABEL_KEYS = {
  Booked: 'wizard.stepBasics',
  From: 'wizard.stepFrom',
  When: 'wizard.stepWhen',
  Where: 'wizard.stepWhere',
  Trips: 'wizard.stepTrips',
  Getting: 'wizard.stepGetting',
  Stay: 'wizard.stepStay',
  Stays: 'wizard.stepStays',
  Finish: 'plan.stepReview',
};

/** The steps for one path, by name. */
export function wizardSteps(booked = {}, buildMode = 'ready') {
  const travel = Boolean(booked.travel);
  const stays = Boolean(booked.stays);
  const third = stays ? STEP3.stays : (STEP3[buildMode] || 'Trips');
  const rest = travel && stays ? ['Finish'] : ['Getting', 'Finish'];
  const basics = travel ? ['Booked', 'From', 'When'] : ['Booked', 'When'];
  return stays ? [...basics, third, ...rest] : [...basics, 'Where', third, ...rest];
}

/**
 * The step number a saved draft reopens on. A draft written since T500
 * carries its step's name, which survives any renumbering. An older draft
 * carries only a number counted on the list that still had a Who step of
 * its own: Who folds into the first step and every step after it moves up one.
 */
export function restoreStep(draft = {}) {
  const steps = wizardSteps(draft.booked || {}, draft.buildMode || 'ready');
  const n = Number(draft.step) || 1;
  const clamp = (x) => Math.max(1, Math.min(steps.length, x));
  if (draft.stepName) {
    const i = steps.indexOf(draft.stepName);
    return i >= 0 ? i + 1 : clamp(n);
  }
  if (n <= 1) return 1;
  const whoAt = draft.booked?.travel ? 3 : 2;
  return clamp(n === whoAt ? 1 : n > whoAt ? n - 1 : n);
}

/**
 * A day's cost as the card writes it and as a screen reader says it (T490-i):
 * visible "~{price} est." for an estimate, "{price}" for a measured figure; spoken
 * "about {price}" or "{price}". Whole euros, the card precision. Null without a cost.
 */
export function dayCostText(cost, t, locale) {
  if (!cost || !Number.isFinite(cost.min)) return null;
  const opts = { precision: 'whole', locale };
  const plain = formatMoney(cost.min, opts);
  if (!cost.national) return { visible: plain, spoken: plain };
  return {
    visible: formatEst(cost.min, t('money.est'), opts),
    spoken: t('money.estSpoken', { price: plain }),
  };
}

/** The night count as one translated phrase: "1 night", "7 nights". */
export function nightsText(t, n) {
  return t(n === 1 ? 'plan.nightsOne' : 'plan.nightsMany', { n });
}

/**
 * The cheapest member's day per person, from the cost index rows of a trip's
 * stops (T490-e: a card says "from" the cheapest town, never an average).
 * `rows` are cost index rows ({ dayEur, stayLevel, foodLevel }); missing ones
 * are skipped. Null when none is priced.
 */
export function cheapestDay(rows) {
  let best = null;
  for (const row of rows || []) {
    if (!row || row.dayEur == null || !Number.isFinite(row.dayEur)) continue;
    const national = row.stayLevel !== 'city' || row.foodLevel !== 'city';
    if (!best || row.dayEur < best.min) best = { min: row.dayEur, national };
  }
  return best;
}
