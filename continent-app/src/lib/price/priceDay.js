/**
 * The day price (T662, plan section 3): what one day at a destination costs
 * one person, for one price request. The only door every day-price screen
 * goes through (V1, V2); it wraps lib/costIndex.js, which wraps bedPrice
 * (lib/stayPrice.js) and groundSpendPerPerson (lib/runtime_pricing.js), so
 * the bounds (EUR 6 to 400 a night), the country repair, the child share and
 * the rounding are the same on every path.
 *
 * The answer is the cost row computeCosts documents (stayEur, foodEur,
 * dayEur, bands, levels) with two changes and one addition:
 *
 *   rounding  every line is euros per person per day in whole cents, and
 *             dayEur is the sum of the included lines, so for any stay of
 *             n nights and p seats: total = dayEur x p x n = the sum of the
 *             line totals, and dayEur = total / p / n (rule 7, B6, V3)
 *   lines     one per item (bed, food, transport, car, activities):
 *               { key, status, eur, quality, basis, provenance }
 *             status   'included' | 'optional' | 'not_included' | 'excluded'
 *             quality  'live' | 'measured' | 'modelled' | 'missing'
 *             An item without data carries eur null and quality 'missing':
 *             it is never counted as zero (rule 8, V5).
 *             basis and provenance are stored with every price and are for
 *             internal views only (rule 5); a traveller sees the amount.
 *   request   the request the row was priced for
 */
import { costContext, costRow } from '../costIndex.js';
import { groundSpendPerPerson } from '../runtime_pricing.js';
import { foodShare } from '../party.js';
import { DEFAULT_PRICE_REQUEST, costChoices, seatsOf } from './request.js';

const cents = (v) => Math.round(v * 100) / 100;
const num = (v) => (v != null && Number.isFinite(v) ? cents(v) : null);

function bedQuality(row) {
  if (row.stayEur == null) return 'missing';
  if (row.stayLive) return 'live';
  return row.stayLevel === 'city' && !row.stayRepaired ? 'measured' : 'modelled';
}

function linesOf(row, req) {
  const off = new Set(req.excluded || []);
  const st = (key, status) => (off.has(key) ? 'excluded' : status);
  const car = req.transport === 'car';
  return [
    {
      key: 'bed', status: st('bed', 'included'), eur: num(row.stayEur), quality: bedQuality(row),
      basis: { tier: row.stayTier, tierFallback: !!row.tierFallback, nights: req.nights, seats: seatsOf(req),
        when: req.when.kind, ...(row.stayUnits || {}) },
      provenance: { level: row.stayLevel, source: row.stayBasis, from: row.source, km: row.stayKm,
        captured: row.captured, repaired: !!row.stayRepaired, scaled: !!row.stayScaled, live: row.stayLive },
    },
    {
      key: 'food', status: st('food', 'included'), eur: num(row.foodEur),
      quality: row.foodEur == null ? 'missing' : row.foodLevel === 'city' ? 'measured' : 'modelled',
      basis: { share: foodShare({ ...req.group, seats: seatsOf(req) }) },
      provenance: { level: row.foodLevel, source: row.foodBasis },
    },
    // F8 prices local transport; until then the item is known to be missing.
    { key: 'transport', status: st('transport', 'not_included'), eur: null, quality: 'missing', basis: null, provenance: null },
    // F6 adds the car line (rentalEstimate) when the traveller travels by car.
    { key: 'car', status: st('car', 'not_included'), eur: null, quality: 'missing', basis: { chosen: car }, provenance: null },
    // F9: activities are optional and off by default.
    { key: 'activities', status: st('activities', 'optional'), eur: null, quality: 'missing', basis: null, provenance: null },
  ];
}

function answer(row, req) {
  const lines = linesOf(row, req);
  const counted = lines.filter((l) => l.status === 'included');
  // A day needs every included line priced: a bed or food line without data
  // leaves the day unpriced rather than cheaper (rule 8).
  const dayEur = counted.length && counted.every((l) => l.eur != null)
    ? cents(counted.reduce((s, l) => s + l.eur, 0)) : null;
  return {
    ...row,
    stayEur: lines[0].eur,
    foodEur: lines[1].eur,
    dayEur,
    lines,
    request: req,
  };
}

/**
 * Every destination's day price for one request: Map id -> answer. Compute
 * once per request (useMemo) and hand around.
 */
export function priceDays(destinations, req = DEFAULT_PRICE_REQUEST) {
  const r = req || DEFAULT_PRICE_REQUEST;
  const ctx = costContext(destinations, costChoices(r));
  const out = new Map();
  for (const [id, d] of Object.entries(destinations || {})) out.set(id, answer(costRow(d, ctx), r));
  return out;
}

/**
 * One destination's day price. Pass the catalogue as `destinations` so a
 * place priced on its own gets the same country repair the catalogue gives
 * it; without it the place is repaired against nothing. Null without a record.
 */
export function priceDay(dest, req = DEFAULT_PRICE_REQUEST, destinations = null) {
  if (!dest) return null;
  const r = req || DEFAULT_PRICE_REQUEST;
  const ctx = costContext(destinations || { [dest.id]: dest }, costChoices(r));
  return answer(costRow(dest, ctx), r);
}

/**
 * The food line item by item (dinners, lunches, ...), euros per person over
 * `days` at the request's lifestyle and child share: the same figures the
 * food line sums. For the destination's food fold and the prerendered week.
 */
export function foodBreakdown(dest, req = DEFAULT_PRICE_REQUEST, days = 1) {
  const r = req || DEFAULT_PRICE_REQUEST;
  if (!dest?.costs) return null;
  const g = groundSpendPerPerson(dest, days, r.lifestyle);
  if (!g) return null;
  const share = foodShare({ ...r.group, seats: seatsOf(r) });
  const out = {};
  for (const [k, v] of Object.entries(g)) out[k] = typeof v === 'number' ? v * share : v;
  return out;
}
