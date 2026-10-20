/**
 * tripPrice.js (T431, T474): what a written week costs at the traveller's
 * Lifestyle.
 *
 * The trip's authored budget is four ranges a person (bed, food, getting
 * around, activities) and a total. Two shares place each line on its range,
 * from the low end (0) to the high end (1): where you sleep moves the bed
 * line, how you spend moves the other three. Both come from the one
 * Lifestyle the whole app prices from (carta-design "Lifestyle control":
 * there is one), through lifestyleShares() below, so the trip page never
 * carries a second control of its own (T474, row T435-c). The party
 * multiplies a person's total; a fare the traveller typed in for getting to
 * the start (lib/firstRun.js own fares, keyed journey:<id>) is added once, as
 * theirs. Carta never adds a flight of its own.
 *
 * Pure functions only, so the node tests import them.
 */
import { between } from './lifestyleSlider.js';
import { SLEEP_GROUPS, sleepGroupOf } from './sleepGroups.js';
import { refDayFood } from './costIndex.js';
import { PROFILES } from './lifestyleProfiles.js';

export const SLOTS = ['accommodation', 'food', 'transport', 'activities'];
const SLEEP_SLOT = 'accommodation';

// How a day of eating and drinking spreads across the presets, on the
// reference basket: the thriftiest preset is the low end of a trip's range,
// the most generous the high end.
const PRESET_DAYS = Object.values(PROFILES).map(refDayFood);
const SPEND_LOW = Math.min(...PRESET_DAYS);
const SPEND_HIGH = Math.max(...PRESET_DAYS);

const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5);

/**
 * Where the traveller's Lifestyle sits on a trip's written ranges.
 *
 *   sleepShare   the way to sleep, in the panel's order from the simplest bed
 *                to the most comfortable (dorm 0, private room, entire place,
 *                hotel 1): a dorm traveller pays the low end of the trip's
 *                bed range, a hotel traveller the high end, whatever beds the
 *                trip itself offers (a hut week's range is huts)
 *   spendShare   a day of eating and drinking at their habits, against the
 *                same reference basket the price bands use (costIndex.js),
 *                between the thriftiest preset (0) and the most generous (1)
 *
 * Unknown or missing settings land in the middle, the way the panel's own
 * defaults do.
 */
export function lifestyleShares(lifestyle, stayTier) {
  const at = SLEEP_GROUPS.findIndex((g) => g.key === sleepGroupOf(stayTier));
  const sleepShare = at >= 0 ? at / (SLEEP_GROUPS.length - 1) : 0.5;
  const spendShare = SPEND_HIGH > SPEND_LOW
    ? clamp01((refDayFood(lifestyle) - SPEND_LOW) / (SPEND_HIGH - SPEND_LOW))
    : 0.5;
  return { sleepShare, spendShare };
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
