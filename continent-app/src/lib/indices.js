/**
 * indices.js, the two price-level indices the Explore page shows instead of
 * an all-in trip price: how cheap it is to SLEEP somewhere and how cheap it
 * is to EAT AND DRINK there, each 0 to 10 where 10 is the cheapest in the
 * catalogue.
 *
 * Why an index and not euros: the fare pipeline is being retired, and a
 * euro figure promises a precision the remaining data cannot keep. A rank
 * against the rest of Europe is exactly what the underlying data (Inside
 * Airbnb anchors, Numbeo-derived cost baskets) does support, it never goes
 * stale the way a quoted fare does, and it answers the question travellers
 * actually bring to a comparison page: "is this place cheap for what it is?"
 *
 * Both indices are percentile ranks over the loaded catalogue, computed once
 * per app load from the same wire fields the receipt used to price from:
 *   stay  accommodation.entire_home_night_eur / typical_capacity, falling
 *         back to per_person_night_eur: one person, one night, entire place
 *         economics, the app's classic anchor.
 *   food  a day of eating out on a budget: one cheap sit-down meal, one
 *         fast-food meal, two drinks out and a coffee. The same basket for
 *         every destination, so only the place moves the number.
 *
 * Every destination carries both source fields (country-level at worst), so
 * the indices are total: no card ever shows a blank. The level travels along
 * ('city' means measured in this town, 'country' means the national basket)
 * and the UI says so instead of hiding it.
 */

/** Per-person nightly stay cost the index ranks on. */
export function stayBasis(dest) {
  const a = dest?.accommodation;
  if (!a) return null;
  if (a.entire_home_night_eur != null) {
    const cap = a.typical_capacity || 4;
    return a.entire_home_night_eur / Math.max(1, cap);
  }
  return a.per_person_night_eur ?? null;
}

/** One budget day of eating and drinking out, in euros. */
export function foodBasis(dest) {
  const c = dest?.costs;
  if (!c) return null;
  const parts = [c.meal_cheap_eur, c.fastfood_eur, c.drink_out_eur, c.drink_out_eur, c.coffee_eur];
  if (parts.some((v) => v == null)) return null;
  return parts.reduce((s, v) => s + v, 0);
}

function percentileIndex(values) {
  // value -> 0..10 where the CHEAPEST place scores 10. Ties share a rank so
  // forty towns on the same national basket get the same index, as they must.
  const sorted = [...values].filter((v) => v != null).sort((a, b) => a - b);
  const n = sorted.length;
  return (v) => {
    if (v == null || n === 0) return null;
    // rank of first occurrence (lower bound) + half the tie run, over n.
    let lo = 0, hi = n;
    while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; }
    let up = lo;
    while (up < n && sorted[up] === v) up += 1;
    const mid = (lo + up) / 2;
    const pct = 1 - mid / n;             // cheap -> high
    return Math.round(pct * 100) / 10;   // one decimal, 0..10
  };
}

/**
 * Map destId -> { stay, food, stayLevel, foodLevel } for the whole catalogue.
 * Compute once (useMemo on `data`) and hand around; it is one pass plus two
 * sorts over ~3,000 rows.
 */
export function computeIndices(destinations) {
  const ids = Object.keys(destinations || {});
  const stayVals = ids.map((id) => stayBasis(destinations[id]));
  const foodVals = ids.map((id) => foodBasis(destinations[id]));
  const stayIdx = percentileIndex(stayVals);
  const foodIdx = percentileIndex(foodVals);
  const out = new Map();
  ids.forEach((id, i) => {
    const d = destinations[id];
    out.set(id, {
      stay: stayIdx(stayVals[i]),
      food: foodIdx(foodVals[i]),
      stayLevel: d.accommodation?.level || null,   // 'city' | 'country'
      foodLevel: d.costs?.level || null,
    });
  });
  return out;
}

/** The two cheapest months to stay, from the Airbnb seasonality curve, or
 *  null when this destination has no measured curve. 1-based months. */
export function cheapestStayMonths(dest) {
  const s = dest?.accommodation?.seasonality;
  if (!Array.isArray(s) || s.length !== 12) return null;
  return s
    .map((v, i) => [v, i + 1])
    .sort((a, b) => a[0] - b[0])
    .slice(0, 2)
    .map(([, m]) => m)
    .sort((a, b) => a - b);
}
