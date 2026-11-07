/**
 * Heat and fire months (ROADMAP D20, T1200). The pipeline (pipeline/heat_fire.py)
 * ships `climate.heat` and `climate.fire` month lists beside `climate.best`;
 * this is the ONE rule that uses them: for a family or a traveller who avoids
 * heat, the best months drop the heat and fire months. Thresholds live in
 * config/pricing.json `when.heat`; the app only reads the lists.
 */
import { rule } from './price/config.js';

const { min_best: MIN_BEST } = rule('when.heat');

const list = (x) => (Array.isArray(x) ? x.filter((m) => Number.isInteger(m) && m >= 1 && m <= 12) : []);

/** { heat, fire, any } month lists for a climate block (empty when the wire has none). */
export function riskMonths(climate) {
  const heat = list(climate?.heat);
  const fire = list(climate?.fire);
  return { heat, fire, any: [...new Set([...heat, ...fire])].sort((a, b) => a - b) };
}

/** True for a party with children or babies, or an "avoid heat" answer. */
export function guardsHeat({ children = 0, babies = 0, avoid = [] } = {}) {
  return Number(children) > 0 || Number(babies) > 0 || (Array.isArray(avoid) && avoid.includes('heat'));
}

/**
 * The best months to show. Unguarded travellers get climate.best as shipped.
 * Guarded ones get it minus heat and fire months, unless that would leave
 * fewer than min_best months (then the shipped list stands and the note
 * carries the warning). `dropped` lists what was removed.
 */
export function bestMonthsFor(climate, guard = false) {
  const best = list(climate?.best);
  if (!guard) return { best, dropped: [] };
  const { any } = riskMonths(climate);
  const kept = best.filter((m) => !any.includes(m));
  if (kept.length < MIN_BEST) return { best, dropped: [] };
  return { best: kept, dropped: best.filter((m) => any.includes(m)) };
}
