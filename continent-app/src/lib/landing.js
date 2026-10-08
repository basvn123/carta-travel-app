/**
 * landing.js (T209): the facts behind the landing page, which is also the
 * home page (owner decision 2026-10-07, T362; T194 makes it the app's home).
 * browse/LandingPage.jsx draws it; everything here is pure, so the receipt
 * demonstration and the coverage figures can be tested without a browser
 * (tests/landing.test.mjs).
 *
 * The receipt demonstration prices one real town from the catalogue the app
 * already loaded, through T099's first-run receipt arithmetic
 * (lib/firstRun.js priceReceipt and receiptFooter), so the landing page and
 * the first result on a destination or trip page cannot disagree by a cent.
 * That in turn prices through the engine functions the planner and the
 * Explore cards use: accommodationPerPerson for the bed (season, length of
 * stay, cleaning and platform fees, the stay tier asked for) and
 * groundSpendPerPerson for eating and drinking.
 *
 * What this file adds is only what the landing page needs and the first-run
 * receipt does not: the three demo towns, the default stay, a footer that
 * names an input this page has (the stay or the nights, never the dates,
 * which the landing page does not ask), the coverage counts and the priced
 * list of towns to walk from. Since T382 both pages draw the receipt through
 * components/ReceiptCard.jsx (register row T209-a); FirstRunReceipt keeps
 * its own primary ("Set your dates") and the flight door, and the landing
 * page keeps one primary of its own.
 *
 * Carta prices no flight (owner decision 2026-10-02, T272, T273); no fare
 * table is read here and no fare is passed in.
 */
import { priceReceipt as firstRunReceipt, receiptFooter } from './firstRun.js';
import { addDays } from './dates.js';

/**
 * The three towns the demonstration offers, in order, by catalogue id. Picked
 * from the shipped catalogue (public/app_data.json, 2026-10-06) for what
 * their receipts show, since the receipt's provenance rows are the point:
 *
 *   EDI           Edinburgh: the bed measured from Inside Airbnb listings in
 *                 Edinburgh itself, the food a national basket. One measured
 *                 line and one estimate on the same receipt.
 *   gem:chamonix  Chamonix: a walking base whose bed and food both stand in
 *                 from the national figures, so every line wears its tilde.
 *   OPO           Porto, where the Camino Portugues starts: bed, food, dorm
 *                 beds and private rooms all measured in the city, so
 *                 nothing on the receipt is an estimate.
 *
 * All three are towns people walk from (the launch speaks to hikers first,
 * T203). A town missing from a later catalogue is skipped, and when none of
 * the three is left the busiest measured town stands in, so the page never
 * shows an empty demonstration.
 */
export const DEMO_TOWNS = ['EDI', 'gem:chamonix', 'OPO'];

/** The stay tiers the demonstration lets you pick, cheapest first. */
export const DEMO_TIERS = ['dorm', 'private', 'home', 'hotel3', 'hotel4', 'hotel5'];
export const DEMO_PEOPLE = [1, 2, 3, 4, 5, 6];
export const DEMO_NIGHTS = [2, 3, 4, 5, 6, 7, 8, 10, 14];
export const DEMO_DEFAULTS = { people: 2, nights: 7, tier: 'home' };

/** How far out the default stay starts, and on which weekday: the rule
 *  docs/ONBOARDING_AND_EMPTY_STATES.md sets for the app's default dates, the
 *  same one firstRun.js calendarDefaultWindow applies. */
export const LEAD_DAYS = 28;
const SATURDAY = 6;

/** The first Saturday at least four weeks after `todayIso` (YYYY-MM-DD). */
export function defaultStart(todayIso) {
  if (!todayIso) return null;
  const start = addDays(todayIso, LEAD_DAYS);
  const dow = new Date(`${start}T00:00:00Z`).getUTCDay();
  return addDays(start, (SATURDAY - dow + 7) % 7);
}

/** Today in UTC as YYYY-MM-DD. */
export function todayIso(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/** The receipt options firstRun.js reads, for the landing page's inputs.
 *  Since T382 the inputs are the app's shared choices (people, stay tier,
 *  the shared dates), and `costRow` is the town's cost index row, the one
 *  the first-run receipt passes too, so a broken harvest is repaired the
 *  same way on both pages and the two receipts agree to the cent. */
export function receiptOpts({ people, nights, tier, start, lifestyle, model, costRow }) {
  if (!start) return null;
  return {
    from: start,
    to: addDays(start, nights),
    people,
    stayTier: tier,
    lifestyle,
    accommodationModel: model,
    costRow: costRow || null,
  };
}

/** The first-run receipt for one town and the landing page's inputs. */
function price(dest, input) {
  const opts = receiptOpts(input);
  if (!dest || !opts) return null;
  return firstRunReceipt(dest, opts);
}

/** The towns to offer: DEMO_TOWNS that exist and price, else the measured
 *  town with the most listings. Returns destination records. */
export function pickDemoTowns(destinations, start = '2026-11-07') {
  const all = destinations || {};
  const ok = (d) => !!price(d, { ...DEMO_DEFAULTS, start });
  const picked = DEMO_TOWNS.map((id) => all[id]).filter(ok);
  if (picked.length) return picked;
  let best = null;
  for (const d of Object.values(all)) {
    const n = d?.accommodation?.level === 'city' ? (d.accommodation.n_listings || 0) : 0;
    if (n > (best?.accommodation?.n_listings || 0) && ok(d)) best = d;
  }
  return best ? [best] : [];
}

/**
 * The whole receipt for one town and one set of inputs: the first-run
 * receipt ({ lines, total, each, est, nights, people, from, to }) with the
 * stay and ground lines picked out, and `alt`, the footer: what one changed
 * input on this page would do to the total, as { kind: 'tier', tier, total,
 * est } (the first-run footer's choice of stay, so the two pages name the
 * same alternative) or { kind: 'nights', nights, total, est } where the town
 * measures no other bed. Null when the town cannot be priced.
 */
export function priceReceipt(dest, input) {
  const r = price(dest, input);
  if (!r) return null;
  const stay = r.lines.find((l) => l.key === 'stay');
  const ground = r.lines.find((l) => l.key === 'ground');
  let alt = receiptFooter(dest, r, receiptOpts(input),
    { datesOwn: false, meta: { stay_tiers_available: DEMO_TIERS.filter((k) => k !== 'home') } });
  if (alt?.kind !== 'tier') {
    const altNights = input.nights === 4 ? 7 : 4;
    const n = price(dest, { ...input, nights: altNights });
    alt = n ? { kind: 'nights', nights: altNights, total: n.total, est: n.est } : null;
  }
  return { ...r, stay, ground, each: r.people > 1 ? r.each : null, alt };
}

/**
 * The catalogue's own coverage, counted from the records in hand (the rank
 * tier carries `accommodation` and `costs` in full, so this is right before
 * the shards arrive):
 *   places     destinations in the catalogue
 *   countries  distinct countries among them
 *   bedsMeasured  places whose bed price comes from measured listings
 *                 (accommodation.level 'city'; the receipt names the place
 *                 the listings were measured in)
 *   foodMeasured  places whose food prices are their own (costs.level 'city')
 */
export function catalogueFacts(destinations, meta) {
  const rows = Object.values(destinations || {});
  const countries = new Set();
  let bedsMeasured = 0;
  let foodMeasured = 0;
  for (const d of rows) {
    if (d?.iso2) countries.add(d.iso2);
    if (d?.accommodation?.level === 'city') bedsMeasured += 1;
    if (d?.costs?.level === 'city') foodMeasured += 1;
  }
  const places = meta?.n_destinations || rows.length;
  // The catalogue's own date, for the instrument line under the title
  // (T382): the day the pipeline wrote this catalogue, never today.
  const asOf = typeof meta?.generated_at === 'string' ? meta.generated_at.slice(0, 10) : null;
  return { places, countries: countries.size, bedsMeasured, foodMeasured, asOf };
}

/** The catalogue category a town to walk from carries (the launch speaks to
 *  hikers first, T203). */
export const WALK_CATEGORY = 'hiking';
export const CHEAPEST_N = 5;

/**
 * The priced list for the undecided (T382, rule R1 of DIRECTION.md part 9):
 * the towns to walk from with the lowest day cost per person, cheapest
 * first, read from the cost index the Explore cards render
 * (lib/costIndex.js computeCosts, handed down as FirstRunContext.indices),
 * so each figure is the Explore card's figure for the same inputs. Returns
 * [{ id, dest, dayEur, est }] with at most `n` rows; `est` is true when a
 * national figure (or the country median) stands in for the bed or the food.
 * Ties fall back to the id so the order never flickers between renders.
 */
export function cheapestToWalk(destinations, indices, n = CHEAPEST_N) {
  if (!destinations || !indices?.get) return [];
  const rows = [];
  for (const [id, d] of Object.entries(destinations)) {
    if (!d || !Array.isArray(d.categories) || !d.categories.includes(WALK_CATEGORY)) continue;
    const c = indices.get(id);
    if (!c || !(c.dayEur > 0)) continue;
    rows.push({ id, dest: d, dayEur: c.dayEur, est: c.stayLevel !== 'city' || c.foodLevel !== 'city' });
  }
  rows.sort((a, b) => (a.dayEur - b.dayEur) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return rows.slice(0, n);
}

/** The layers the coverage table lists, in the order the page shows them. */
export const COVERAGE_LAYERS = ['trail', 'cycling', 'beach', 'lake', 'mountain'];

/**
 * Per layer, from public/coverage.json: published rows (rated and shown),
 * listed rows (known and shown without a rating), and how many of the
 * regions where the layer applies have nothing at all. The same counts
 * scripts/explainer/numbers.mjs prints on /about/numbers, so the two pages
 * cannot disagree. Null when the file is not usable.
 */
export function coverageRows(coverage) {
  const regions = coverage?.regions;
  if (!regions || typeof regions !== 'object') return null;
  const out = COVERAGE_LAYERS.map((key) => {
    let published = 0;
    let listed = 0;
    let empty = 0;
    let applies = 0;
    for (const reg of Object.values(regions)) {
      const row = reg?.[key];
      if (!row || row.status === 'na') continue;
      applies += 1;
      if (row.status === 'empty') empty += 1;
      published += row.r || 0;
      listed += row.l || 0;
    }
    return { key, published, listed, empty, applies };
  });
  if (!out.some((r) => r.published > 0)) return null;
  return {
    rows: out,
    regions: Object.keys(regions).length,
    asOf: coverage.generated_at || null,
  };
}
