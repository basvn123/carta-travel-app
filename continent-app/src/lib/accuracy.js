/**
 * The published accuracy figure for the food cost, and the only place it lives.
 *
 * Source: tools/benchmark/results/2026-10-01.md, section "Food per person per
 * day, country baskets" (run of 2026-10-01 on engine data generated
 * 2026-06-07, 2,673 destinations in 24 countries): 88.2% within EUR 6, 95%
 * interval resampling countries 79.4% to 93.2%.
 *
 * Only the food figure is published. The stay hold-out was 12 towns in 3
 * countries (register row T096-a), too small to quote, so no bed or weekly
 * figure belongs here until the owner prices real rooms. When a new run
 * replaces this one, change the numbers and the date together.
 */
export const FOOD_ACCURACY = {
  runDate: '2026-10-01',
  within: 88,
  lo: 79,
  hi: 93,
  eur: 6,
  destinations: 2673,
  countries: 24,
};

/** Template variables for the cost.accuracy* strings. The date is formatted in
 *  the reader's language; the rest are plain integers. */
export function accuracyVars(lang) {
  let when = FOOD_ACCURACY.runDate;
  try {
    when = new Intl.DateTimeFormat(lang || 'en', { day: 'numeric', month: 'long', year: 'numeric' })
      .format(new Date(`${FOOD_ACCURACY.runDate}T12:00:00Z`));
  } catch { /* keep the ISO date */ }
  return {
    pct: FOOD_ACCURACY.within,
    lo: FOOD_ACCURACY.lo,
    hi: FOOD_ACCURACY.hi,
    eur: FOOD_ACCURACY.eur,
    n: FOOD_ACCURACY.destinations.toLocaleString('en-GB'),
    countries: FOOD_ACCURACY.countries,
    when,
  };
}
