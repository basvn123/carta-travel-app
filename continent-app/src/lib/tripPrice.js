/**
 * tripPrice.js (T431): what a written week costs at the traveller's choices.
 *
 * The trip's authored budget is four ranges a person (bed, food, getting
 * around, activities) and a total. Two choices place each line on its
 * range: where you sleep moves the bed line, how you spend moves the other
 * three, each from the low end (0) to the high end (1). The party multiplies
 * a person's total; a fare the traveller typed in for getting to the start
 * (lib/firstRun.js own fares, keyed journey:<id>) is added once, as theirs.
 * Carta never adds a flight of its own.
 *
 * Pure functions only, so the node tests import them.
 */
import { between } from './lifestyleSlider.js';

export const SLOTS = ['accommodation', 'food', 'transport', 'activities'];
const SLEEP_SLOT = 'accommodation';

/** How you spend, three stops from the low end of each range to the high. */
export const SPEND_STOPS = [
  { key: 'save', share: 0, labelKey: 'journey.spendSave' },
  { key: 'mid', share: 0.5, labelKey: 'journey.spendMid' },
  { key: 'treat', share: 1, labelKey: 'journey.spendTreat' },
];
export const SPEND_KEY = 'carta.tripSpend';

/** Where you sleep, over the trip's own written bed range: its simplest
 *  beds to its most comfortable (a hut week's range is huts, a city week's is
 *  hostels to hotels), so the stops never name a bed the trip does not offer
 *  (T430 critique: "Entire place" on a refuge week). */
export const SLEEP_STOPS = [
  { key: 'low', share: 0, labelKey: 'journey.sleepLow' },
  { key: 'mid', share: 0.5, labelKey: 'journey.sleepMid' },
  { key: 'high', share: 1, labelKey: 'journey.sleepHigh' },
];

export function readSpend() {
  try {
    const v = window.localStorage.getItem(SPEND_KEY);
    return SPEND_STOPS.some((s) => s.key === v) ? v : 'mid';
  } catch { return 'mid'; }
}
export function writeSpend(key) {
  try { window.localStorage.setItem(SPEND_KEY, key); } catch { /* blocked store: this page only */ }
}

/**
 * The week at the choices: { rows {slot: eur|null}, perPerson, perDay,
 * party, fare, total, est }. perPerson is the sum of the lines when every
 * line has a figure, else the authored total at the spend share. total is
 * perPerson times the party plus the traveller's own fare.
 */
export function tripPrice(budget, { sleepShare = 0.5, spendShare = 0.5, days = 7, party = 1, fare = 0 } = {}) {
  if (!budget?.totalEur) return null;
  const rows = {};
  for (const slot of SLOTS) {
    const row = budget.breakdown?.[slot];
    rows[slot] = row ? between(row.lowEur, row.highEur, slot === SLEEP_SLOT ? sleepShare : spendShare) : null;
  }
  const lines = SLOTS.map((s) => rows[s]).filter((v) => v != null);
  const perPerson = lines.length === SLOTS.length
    ? lines.reduce((a, b) => a + b, 0)
    : between(budget.totalEur.low, budget.totalEur.high, spendShare);
  const n = Math.max(1, Math.round(party) || 1);
  const own = Number.isFinite(fare) && fare > 0 ? fare : 0;
  return {
    rows,
    perPerson,
    perDay: perPerson != null && days > 0 ? Math.round(perPerson / days) : null,
    party: n,
    fare: own,
    total: perPerson != null ? perPerson * n + own : null,
  };
}

/** What the figure covers and what it leaves out, as IncludedList rows
 *  before translation: { key, in, labelKey, params }. A trip's own
 *  included[] and notIncluded[] strings win; otherwise the budget's lines say
 *  what is in, and travel to the start (unless the traveller added it),
 *  insurance and personal spending are out. */
export function includedRows(trip, { nights = 6, fare = 0 } = {}) {
  const own = (trip?.included || []).filter(Boolean);
  const ownOut = (trip?.notIncluded || []).filter(Boolean);
  if (own.length || ownOut.length) {
    return [
      ...own.map((text, i) => ({ key: `in-${i}`, in: true, text })),
      ...ownOut.map((text, i) => ({ key: `out-${i}`, in: false, text })),
    ];
  }
  const b = trip?.budget?.breakdown || {};
  const out = [];
  if (b.accommodation) out.push({ key: 'beds', in: true, labelKey: 'journey.incBeds', params: { n: nights } });
  if (b.food) out.push({ key: 'food', in: true, labelKey: 'journey.incFood' });
  if (b.transport) out.push({ key: 'transport', in: true, labelKey: 'journey.incTransport' });
  if (b.activities) out.push({ key: 'activities', in: true, labelKey: 'journey.incActivities' });
  out.push(fare > 0
    ? { key: 'travel', in: true, labelKey: 'journey.incTravelOwn' }
    : { key: 'travel', in: false, labelKey: 'journey.incTravel' });
  out.push({ key: 'insurance', in: false, labelKey: 'journey.incInsurance' });
  out.push({ key: 'personal', in: false, labelKey: 'journey.incPersonal' });
  return out;
}
