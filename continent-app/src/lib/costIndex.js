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
 *   stay   one person, one night, at the tier they picked. The measured
 *          dorm / private room / hotel rate where the town has one, and the
 *          entire-place anchor otherwise.
 *   food   one day of eating and drinking the way they said they travel,
 *          priced at this town's own rates.
 *   day    the two added up, the headline: "about 83 euro a day per person".
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
 *
 * LIFESTYLE. The figures answer to the Lifestyle panel, because a page that
 * shows a control and a price has promised the control moves the price. Food
 * is priced through groundSpendPerPerson, the same function the trip receipt
 * and the day planner use, so a card and a receipt cannot disagree about what
 * dinner costs. The bed is priced through stayTierNightly, so choosing a dorm
 * reprices every card that has a measured hostel.
 *
 * The GAUGE does not simply follow. If the five bands stayed fixed in euros,
 * picking Backpacker would paint the whole continent green and picking Foodie
 * would paint it red, and the one thing the gauge is for, telling a cheap
 * place from an expensive one, would be gone at exactly the moment somebody
 * started tuning their budget. So the cut points scale with the lifestyle:
 * the euro figure is what YOU would spend, and the gauge stays "how dear is
 * this place, for the way you travel". The scale factor comes from a frozen
 * reference basket (REF_PRICES) rather than from the loaded catalogue, so it
 * depends only on the lifestyle and stays reproducible.
 */
import {
  DEFAULT_LIFESTYLE, CLUB_DRINKS_PER_NIGHT, groundSpendPerPerson, stayTierNightly,
} from './runtime_pricing.js';

// Sanity gate on a harvested nightly rate. Below the floor the number is a
// broken harvest rather than a bargain (the shipped file carries seven exact
// zeros); above the ceiling it is a data error rather than a hotel.
const STAY_MIN_EUR = 6;
const STAY_MAX_EUR = 400;

/**
 * Band cut points in euros per person, at the DEFAULT lifestyle. Measured
 * against the shipped catalogue so the bands land on round, human numbers and
 * stay populated:
 *
 *   day   65 / 80 / 100 / 125  ->  582 / 652 / 1260 / 424 / 120 destinations
 *   stay  22 / 30 / 40 / 55    ->  501 / 714 / 1315 / 381 / 127
 *   food  40 / 50 / 62 / 78    ->  573 / 1100 / 1033 / 172 / 160
 *
 * The middle band is deliberately the fat one. Most of Europe really is
 * mid-priced, and a scale that forced a fifth of the continent into "very
 * cheap" to look balanced would be lying about the continent.
 *
 * These moved when food started being priced from the lifestyle: the old
 * fixed basket came to EUR 38 a day at the catalogue's median prices and the
 * default lifestyle comes to EUR 50, so leaving the old cuts in place would
 * have shifted a third of Europe one band dearer overnight for no reason.
 */
const CUTS = {
  day: [65, 80, 100, 125],
  stay: [22, 30, 40, 55],
  food: [40, 50, 62, 78],
};

/**
 * The catalogue's MEDIAN price for each thing a lifestyle buys, frozen. Used
 * only to work out how much dearer one lifestyle is than another, never to
 * price a destination: a real destination's own costs always do that.
 *
 * Frozen rather than computed so the band a place falls into depends on the
 * place and the lifestyle, and not on which other destinations happen to be
 * loaded beside it.
 */
const REF_PRICES = {
  meal_mid_eur: 32.8,
  meal_cheap_eur: 15,
  fastfood_eur: 10,
  drink_out_eur: 5,
  cocktail_eur: 12,
  coffee_eur: 3.45,
  grocery_day_eur: 12.42,
  club_entry_eur: 11.08,
};

// Median nightly per person at each stay tier, over the destinations that have
// a measured one. Same job as REF_PRICES: the RATIO between tiers is what is
// used, never the absolute number.
const REF_STAY = {
  home: 31.25, dorm: 28.98, private: 38.81, hotel: 42.5,
  hotel3: 50, hotel4: 70, hotel5: 120,
};

/** One day of eating and drinking at `lifestyle`, against the reference
 *  prices. The same arithmetic groundSpendPerPerson does, on one basket. */
function refDayFood(lifestyle) {
  const ls = { ...DEFAULT_LIFESTYLE, ...(lifestyle || {}) };
  const per = ls.cadence === 'day' ? 1 : 1 / 7;
  const club = (REF_PRICES.club_entry_eur + CLUB_DRINKS_PER_NIGHT * REF_PRICES.cocktail_eur);
  return (ls.dinners_per_week || 0) * per * REF_PRICES.meal_mid_eur
    + (ls.lunches_per_week || 0) * per * REF_PRICES.meal_cheap_eur
    + (ls.fastfood_per_week || 0) * per * REF_PRICES.fastfood_eur
    + (ls.drinks_per_week || 0) * per * REF_PRICES.drink_out_eur
    + (ls.coffees_per_day || 0) * REF_PRICES.coffee_eur
    + (ls.self_catered_days_per_week || 0) * per * REF_PRICES.grocery_day_eur
    + (ls.club_nights_per_week || 0) * per * club;
}

/**
 * How much the cut points have to move for this lifestyle, per scale.
 * Clamped: a lifestyle of nothing at all would otherwise divide the scale to
 * zero and make every destination "very pricey" against a cut of EUR 0.
 */
function bandScale(lifestyle, stayTier) {
  const foodRef = refDayFood(DEFAULT_LIFESTYLE);
  const food = Math.min(4, Math.max(0.25, refDayFood(lifestyle) / foodRef));
  const stay = Math.min(4, Math.max(0.25, (REF_STAY[stayTier] || REF_STAY.home) / REF_STAY.home));
  // The day scale is the two blended at the share each holds by default.
  const shareFood = foodRef / (foodRef + REF_STAY.home);
  return { food, stay, day: shareFood * food + (1 - shareFood) * stay };
}

/** Band 0 (cheapest) to 4 (priciest) for a euro figure on one of the scales.
 *  `scale` moves the cut points with the lifestyle (see bandScale). */
export function bandFor(kind, eur, scale = 1) {
  if (eur == null || !Number.isFinite(eur)) return null;
  const cuts = CUTS[kind];
  for (let i = 0; i < cuts.length; i += 1) if (eur < cuts[i] * scale) return i;
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

/**
 * One day of eating and drinking out at this destination's own prices, for
 * the way this traveller says they travel.
 *
 * Deliberately the SAME function the trip receipt and the day planner price
 * from. A card that said one thing and a receipt that said another about the
 * same dinner would cost more trust than either number is worth.
 */
export function foodPerDay(dest, lifestyle) {
  if (!dest?.costs) return null;
  const v = groundSpendPerPerson(dest, 1, lifestyle)?.total;
  return v > 0 ? v : null;
}

/**
 * One person, one night, at the tier they chose.
 *
 * A tier only prices where the town has a measured one: 226 of the 3,038
 * destinations carry hostel and hotel rates. Everywhere else falls back to the
 * entire-place anchor and says so through `tierFallback`, so a village never
 * quotes a dorm bed it does not have.
 */
function stayAtTier(dest, tier, groupSize) {
  const home = stayPerNight(dest);
  if (!tier || tier === 'home') return { eur: home, fallback: false };
  const t = stayTierNightly(dest?.accommodation, tier, groupSize);
  const v = t?.nightlyPp;
  if (v >= STAY_MIN_EUR && v <= STAY_MAX_EUR) return { eur: v, fallback: false };
  return { eur: home, fallback: true };
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
export function computeCosts(destinations, choices) {
  const lifestyle = choices?.lifestyle;
  const stayTier = choices?.stay_tier || 'home';
  const groupSize = choices?.group_size || 1;
  const scale = bandScale(lifestyle, stayTier);
  const medians = countryStayMedians(destinations);
  const out = new Map();
  for (const [id, d] of Object.entries(destinations || {})) {
    const at = stayAtTier(d, stayTier, groupSize);
    let stayEur = at.eur;
    let repaired = false;
    if (stayEur == null) {
      const m = medians.get(d.iso2);
      if (m != null) { stayEur = m; repaired = true; }
    }
    const foodEur = foodPerDay(d, lifestyle);
    const dayEur = stayEur != null && foodEur != null ? stayEur + foodEur : null;
    const a = d.accommodation || {};
    out.set(id, {
      stayEur,
      foodEur,
      dayEur,
      stayBand: bandFor('stay', stayEur, scale.stay),
      foodBand: bandFor('food', foodEur, scale.food),
      dayBand: bandFor('day', dayEur, scale.day),
      stayLevel: levelOf(a.level, repaired),
      foodLevel: levelOf(d.costs?.level, false),
      stayTier,
      tierFallback: at.fallback,
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
