/**
 * costIndex.js, what a day on the ground actually costs, in euros.
 *
 * REPLACES the two 0-to-10 percentile "cheapness indices" this page used to
 * show (lib/indices.js). Those were wrong in three ways a reader could feel
 * without being able to name:
 *
 *   1. FALSE PRECISION. Across the shipped 3,038 destinations there are only
 *      88 distinct food baskets and 156 distinct stay rates, because 88% of
 *      food and 74% of stay are NATIONAL numbers carried down to every town.
 *      A percentile painted on that produced "8.7" for 310 towns at once and
 *      "8.6" for the next 281: a one-decimal figure whose last digit was a
 *      country flag rather than a measurement of the place.
 *   2. NOT REPRODUCIBLE. A percentile is a rank against whatever else happens
 *      to be loaded, so the same town's score moved every time the catalogue
 *      grew, with nothing about the town having changed.
 *   3. IT LAUNDERED BAD DATA. Seven destinations ship a harvested nightly rate
 *      of exactly 0 (Geneva among them, off 991 listings). Ranked, a zero is
 *      the cheapest number there is, so Geneva scored 10.0 out of 10, cheapest
 *      in Europe, on the strength of a broken harvest.
 *
 * What replaces it is what the data can actually support: the euro figures
 * themselves, per person per day, with a five-step band as the at-a-glance
 * summary and the provenance said out loud.
 *
 *   stay   accommodation.entire_home_night_eur / typical_capacity, falling
 *          back to per_person_night_eur: one person, one night, entire place.
 *   food   one budget day of eating out: a cheap sit-down meal, a fast-food
 *          meal, two drinks and a coffee. The same basket everywhere, so only
 *          the place moves the number.
 *   day    the two added up, the headline: "about 71 euro a day per person".
 *
 * The bands are FIXED euro cut points, not ranks, so a town keeps its band
 * when the catalogue doubles, and two people reading the same number a year
 * apart read the same band. They were chosen once from the shipped
 * distribution (see CUTS) and are frozen here on purpose.
 *
 * Provenance travels with every figure and the UI prints it: 'city' means
 * measured in this town, 'country' means the national basket stood in. A
 * number from a national basket is still useful and still true, it just is
 * not a measurement of this town, and saying so is the difference between an
 * instrument and a guess.
 */

// Sanity gate on a harvested nightly rate. Below the floor the number is a
// broken harvest rather than a bargain (the shipped file carries seven exact
// zeros); above the ceiling it is a data error rather than a hotel.
const STAY_MIN_EUR = 6;
const STAY_MAX_EUR = 400;

/**
 * Fixed band cut points in euros, per person. Derived once from the shipped
 * catalogue so the bands land on round, human numbers AND stay populated:
 *
 *   day   52 / 68 / 84 / 108   ->  475 / 697 / 1275 / 468 / 116 destinations
 *   stay  22 / 30 / 40 / 55    ->  501 / 714 / 1310 / 379 / 127
 *   food  28 / 36 / 46 / 58    ->  389 / 585 / 1599 / 296 / 169
 *
 * The middle band is deliberately the fat one. Most of Europe really is
 * mid-priced, and a scale that forced a fifth of the continent into "very
 * cheap" to look balanced would be lying about the continent.
 */
const CUTS = {
  day: [52, 68, 84, 108],
  stay: [22, 30, 40, 55],
  food: [28, 36, 46, 58],
};

/** Band 0 (cheapest) to 4 (priciest) for a euro figure on one of the scales. */
export function bandFor(kind, eur) {
  if (eur == null || !Number.isFinite(eur)) return null;
  const cuts = CUTS[kind];
  for (let i = 0; i < cuts.length; i += 1) if (eur < cuts[i]) return i;
  return cuts.length;
}

/** i18n keys for the five bands, so the five words live in one place. */
export const BAND_KEY = ['cost.band0', 'cost.band1', 'cost.band2', 'cost.band3', 'cost.band4'];

/** Per-person nightly stay cost, or null when the wire has nothing usable. */
export function stayPerNight(dest) {
  const a = dest?.accommodation;
  if (!a) return null;
  let v = null;
  if (a.entire_home_night_eur != null) {
    const cap = a.typical_capacity || 4;
    v = a.entire_home_night_eur / Math.max(1, cap);
  }
  if (!(v > 0) && a.per_person_night_eur != null) v = a.per_person_night_eur;
  // The gate is the whole point: a zero is a broken harvest, not a bargain.
  if (!(v >= STAY_MIN_EUR && v <= STAY_MAX_EUR)) return null;
  return v;
}

/** One budget day of eating and drinking out, in euros. */
export function foodPerDay(dest) {
  const c = dest?.costs;
  if (!c) return null;
  const parts = [c.meal_cheap_eur, c.fastfood_eur, c.drink_out_eur, c.drink_out_eur, c.coffee_eur];
  if (parts.some((v) => v == null)) return null;
  const v = parts.reduce((s, x) => s + x, 0);
  return v > 0 ? v : null;
}

/**
 * Where a figure came from, as the UI has to say it:
 *   'city'     measured in this town
 *   'country'  the national basket stood in
 *   'region'   a neighbouring measurement stood in (a repaired zero)
 */
function levelOf(raw, repaired) {
  if (repaired) return 'region';
  return raw === 'city' ? 'city' : 'country';
}

/**
 * Country medians over the destinations whose stay rate survived the gate.
 * These repair the seven zeros without inventing anything: the town gets the
 * number its own country's measured towns actually show, and is labelled as
 * borrowed rather than measured.
 */
function countryStayMedians(destinations) {
  const byCc = new Map();
  for (const d of Object.values(destinations || {})) {
    const v = stayPerNight(d);
    if (v == null || !d.iso2) continue;
    if (!byCc.has(d.iso2)) byCc.set(d.iso2, []);
    byCc.get(d.iso2).push(v);
  }
  const out = new Map();
  for (const [cc, arr] of byCc) {
    arr.sort((a, b) => a - b);
    out.set(cc, arr[arr.length >> 1]);
  }
  return out;
}

/**
 * Map destId -> the cost row the cards and the panel render from.
 * Compute once (useMemo on `data`) and hand around: two passes over the rows.
 *
 *   stayEur / foodEur / dayEur       euros per person
 *   stayBand / foodBand / dayBand    0 (cheapest) to 4
 *   stayLevel / foodLevel            'city' | 'country' | 'region'
 *   listings / captured / source     how many stays were measured, when, where
 */
export function computeCosts(destinations) {
  const medians = countryStayMedians(destinations);
  const out = new Map();
  for (const [id, d] of Object.entries(destinations || {})) {
    let stayEur = stayPerNight(d);
    let repaired = false;
    if (stayEur == null) {
      const m = medians.get(d.iso2);
      if (m != null) { stayEur = m; repaired = true; }
    }
    const foodEur = foodPerDay(d);
    const dayEur = stayEur != null && foodEur != null ? stayEur + foodEur : null;
    const a = d.accommodation || {};
    out.set(id, {
      stayEur,
      foodEur,
      dayEur,
      stayBand: bandFor('stay', stayEur),
      foodBand: bandFor('food', foodEur),
      dayBand: bandFor('day', dayEur),
      stayLevel: levelOf(a.level, repaired),
      foodLevel: levelOf(d.costs?.level, false),
      listings: repaired ? null : (a.n_listings ?? null),
      captured: repaired ? null : (a.captured ?? null),
      source: repaired ? null : (a.source_place ?? null),
    });
  }
  return out;
}

/** Whole euros, the only precision the underlying data earns. */
export const eurDay = (v) => (v == null ? null : `€${Math.round(v)}`);

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
