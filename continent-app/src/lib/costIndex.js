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
 * dinner costs. The bed is priced through bedPrice (lib/stayPrice.js), the
 * same function the planner's Beds line uses, for the traveller's party, tier
 * and month or dates, over the default trip length, fees included, so a card
 * times the nights is the planner's number (T534).
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
  DEFAULT_LIFESTYLE, CLUB_DRINKS_PER_NIGHT, groundSpendPerPerson,
} from './runtime_pricing.js';
import { bedPrice, cheapestMonths } from './stayPrice.js';
import { staysDataVersion } from './staysData.js';
import { foodShare, partyOf } from './party.js';
import { formatMoney } from './money.js';
import { rule } from './price/config.js';

// Sanity gate on a nightly rate, a person a night, per stay tier (T692,
// config stay.bounds_pp_night). Below the floor the number is a broken
// harvest rather than a bargain (the shipped file carries seven exact zeros);
// above the ceiling it is a data error rather than a bed. One bound of 6 to
// 400 for every tier used to throw out a solo 5-star room and let a EUR 439
// dorm bed through.
const BOUNDS = rule('stay.bounds_pp_night');
const boundsOf = (tier) => BOUNDS[tier] || BOUNDS.default;
const inBounds = (v, tier) => {
  const [lo, hi] = boundsOf(tier);
  return v >= lo && v <= hi;
};

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
const CUTS = rule('bands.cuts');

/**
 * The catalogue's MEDIAN price for each thing a lifestyle buys, frozen. Used
 * only to work out how much dearer one lifestyle is than another, never to
 * price a destination: a real destination's own costs always do that.
 *
 * Frozen rather than computed so the band a place falls into depends on the
 * place and the lifestyle, and not on which other destinations happen to be
 * loaded beside it.
 */
const REF_PRICES = rule('bands.ref_prices');

// Median nightly per person at each stay tier, over the destinations that have
// a measured one. Same job as REF_PRICES: the RATIO between tiers is what is
// used, never the absolute number.
const REF_STAY = rule('bands.ref_stay');

// The stay a card prices when the traveller has set no dates: the default
// trip length, so Airbnb's cleaning fee and weekly discount land the way the
// planner lands them for the same week.
const CARD_NIGHTS = rule('request.default_nights');
const [SCALE_MIN, SCALE_MAX] = rule('bands.scale_clamp');

/** One day of eating and drinking at `lifestyle`, against the reference
 *  prices. The same arithmetic groundSpendPerPerson does, on one basket.
 *  Exported for lib/tripPrice.js, which places a written trip budget at the
 *  traveller's Lifestyle by the same measure (T474). */
export function refDayFood(lifestyle) {
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
  const food = Math.min(SCALE_MAX, Math.max(SCALE_MIN, refDayFood(lifestyle) / foodRef));
  const stay = Math.min(SCALE_MAX, Math.max(SCALE_MIN, (REF_STAY[stayTier] || REF_STAY.home) / REF_STAY.home));
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

/** Per-person nightly stay cost (an entire place for two, a week, fees in),
 *  or null when the wire has nothing usable. */
export function stayPerNight(dest) {
  const b = bedPrice({ dest, tier: 'home', adults: 2, nights: CARD_NIGHTS });
  const v = b ? b.perPerson / CARD_NIGHTS : null;
  // The gate is the whole point: a zero is a broken harvest, not a bargain.
  if (!inBounds(v, b?.tier || 'home')) return null;
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
 * One person, one night, at the tier they chose, for their party and their
 * month or dates (`when` = { start, month, nights }).
 *
 * A town that cannot price the tier (no hostel, no 5-star hotel) falls back
 * to the entire place and says so through `fallback`, so a village never
 * quotes a dorm bed it does not have.
 */
function stayAtTier(dest, tier, party, when) {
  const nights = when?.nights || CARD_NIGHTS;
  // T662: the party's own adults and children (lib/party.js partyOf), so a
  // child shares a room and takes half a dorm bed the way bedPrice says.
  const b = bedPrice({ dest, tier, adults: party.adults, children: party.children, nights, start: when?.start || null,
    month: when?.month || null, fees: when?.fees || null });
  if (!b) return { eur: null, fallback: false, bed: null };
  const v = b.perPerson / nights;
  if (!inBounds(v, b.tier)) return { eur: null, fallback: false, bed: null, outOfBounds: true };
  return { eur: v, fallback: b.fallback, bed: b };
}

/**
 * Where a figure came from, as the UI has to say it:
 *   'city'     measured in this town
 *   'country'  the national basket stood in
 *   'region'   a neighbouring measurement stood in (a repaired zero)
 */
function levelOf(raw, repaired) {
  if (repaired) return 'region';
  // 'live' (T540): tonight's prices for the traveller's own nights.
  return raw === 'city' || raw === 'measured' || raw === 'live' ? 'city'
    : raw === 'nearby' ? 'region' : 'country';
}

/**
 * Country medians over the destinations whose stay rate survived the gate,
 * for the SAME tier, party and dates the request prices (T692, plan 6.1,
 * config stay.repair). They repair a broken or missing bed without inventing
 * anything: the town gets the number its own country's towns show for that
 * stay, and is labelled as borrowed. Before, every repair borrowed the entire
 * place for two over the year, so a broken 5-star night became a cheap flat.
 *
 * Cached per catalogue object and request, and dropped when a country's
 * stays file arrives (staysDataVersion), so a later month curve counts.
 */
const MEDIANS = new WeakMap();
function countryStayMedians(destinations, tier, party, when) {
  const key = JSON.stringify([tier, party.adults, party.children, when.start, when.month, when.nights, staysDataVersion()]);
  const cacheable = destinations && typeof destinations === 'object';
  let byReq = cacheable ? MEDIANS.get(destinations) : null;
  if (byReq?.has(key)) return byReq.get(key);
  // Each place's bed is kept (atById), so the rows reuse it instead of
  // pricing every bed twice (T692).
  const byCc = new Map();
  const atById = new Map();
  for (const [id, d] of Object.entries(destinations || {})) {
    if (!d) continue;
    const at = stayAtTier(d, tier, party, when);
    atById.set(id, at);
    const v = at.eur;
    if (v == null || !d.iso2) continue;
    if (!byCc.has(d.iso2)) byCc.set(d.iso2, []);
    byCc.get(d.iso2).push(v);
  }
  const medians = new Map();
  for (const [cc, arr] of byCc) {
    arr.sort((a, b) => a - b);
    medians.set(cc, arr[arr.length >> 1]);
  }
  const out = { medians, atById };
  if (cacheable) {
    if (!byReq) { byReq = new Map(); MEDIANS.set(destinations, byReq); }
    if (byReq.size > 24) byReq.clear();
    byReq.set(key, out);
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
 *   stayBasis / foodBasis            the price_source behind each figure (T098)
 *
 * choices.month (1..12, the Explore month filter) or choices.start (the
 * traveller's first night, with choices.nights) price the bed for that time
 * of year; without either the bed is the year's average.
 */
export function computeCosts(destinations, choices) {
  const ctx = costContext(destinations, choices);
  const out = new Map();
  for (const [id, d] of Object.entries(destinations || {})) out.set(id, costRow(d, ctx));
  return out;
}

/**
 * What every row of one pricing shares (T662): the choices read once, the
 * band scale and the country medians of `destinations` (the whole catalogue,
 * so a place priced on its own is repaired the way the catalogue repairs it).
 * lib/price/ builds this from a price request; computeCosts from choices.
 */
export function costContext(destinations, choices) {
  const lifestyle = choices?.lifestyle;
  const stayTier = choices?.stay_tier || 'home';
  // Two, the app's default party: a bed is one person's share of a room or
  // a place for two unless the traveller says otherwise.
  const party = partyOf(choices);
  const when = { start: choices?.start || null, month: choices?.month || null,
    nights: choices?.nights || null, fees: choices?.accommodation_model || null };
  return {
    lifestyle, stayTier, party, when,
    scale: bandScale(lifestyle, stayTier),
    eatShare: foodShare(party),
    ...countryStayMedians(destinations, stayTier, party, when),
  };
}

/** One destination's cost row (the shape computeCosts documents) in `ctx`. */
export function costRow(d, ctx) {
  const { lifestyle, stayTier, party, when, scale, eatShare, medians, atById } = ctx;
  const at = (d.id != null && atById?.get(d.id)) || stayAtTier(d, stayTier, party, when);
  let stayEur = at.eur;
  let repaired = false;
  if (stayEur == null) {
    const m = medians.get(d.iso2);
    if (m != null) { stayEur = m; repaired = true; }
  }
  // T579: children eat less and a baby a little, so a seat's food is the
  // party's average (1 for adults only).
  const foodBase = foodPerDay(d, lifestyle);
  const foodEur = foodBase != null ? foodBase * eatShare : null;
  const dayEur = stayEur != null && foodEur != null ? stayEur + foodEur : null;
  const a = d.accommodation || {};
  return {
    stayEur,
    foodEur,
    dayEur,
    stayBand: bandFor('stay', stayEur, scale.stay),
    foodBand: bandFor('food', foodEur, scale.food),
    dayBand: bandFor('day', dayEur, scale.day),
    stayLevel: levelOf(at.bed?.q || a.q, repaired),
    stayBasis: repaired ? null : (at.bed?.q || a.q || null),
    foodBasis: d.costs?.price_source || null,
    foodLevel: levelOf(d.costs?.level, false),
    stayTier,
    tierFallback: at.fallback,
    listings: null,
    captured: repaired ? null : (a.captured ?? null),
    source: repaired ? null : (at.bed?.from ?? null),
    stayKm: repaired ? null : (at.bed?.km ?? null),
    stayScaled: !!at.bed?.scaled,
    stayLive: at.bed?.q === 'live' ? at.bed.captured : null,
    // T662: what the engine (lib/price/) reports as each line's basis.
    stayRepaired: repaired,
    stayUnits: at.bed ? { unit: at.bed.unit, units: at.bed.units, tier: at.bed.tier, basis: at.bed.basis } : null,
  };
}

/** Whole euros, the only precision the underlying data earns. */
export const eurDay = (v) => (v == null ? null : formatMoney(v, { precision: 'whole' }));

/** The two cheapest months to stay, from the measured month curve (stays
 *  wire), or null when this destination has none yet. 1-based months. */
export function cheapestStayMonths(dest) {
  return cheapestMonths(dest);
}
