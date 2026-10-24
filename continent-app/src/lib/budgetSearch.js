/**
 * budgetSearch.js, search on a total budget (T506, roadmap 1.19, first
 * working version of the 4.22 search).
 *
 * The question is the traveller's own: "we have 1,500 for five days in
 * October, the two of us, where can we go". The answer is a rule, not a
 * model: every destination is priced with the one price engine,
 * `quoteTrip()` in lib/tripTotal.js, for a one-stop trip of that length in
 * that month for that party at the traveller's Lifestyle and bed, and the
 * total for the group is held against the budget. No second formula lives
 * here; this file only builds the state quoteTrip reads, rounds its parts
 * to whole euros (owner 1.8: whole euros everywhere, the receipt too), adds
 * the buffer (T475-d: 10% and on by default) and sorts the outcome.
 *
 * What it prices today: the bed and the food and drink, the two parts
 * quoteTrip prices for a stay, and in 'fly' mode getting there (T518): the
 * return flight from the home airport's swept file (flights/flights.js
 * roundTripNear, the same helper the city cards use, bags included at the
 * traveller's baggage choice) plus quoteTrip's airport transfers. What it
 * does not price yet, and never folds into the total: getting there by car,
 * train or bus (3.11), local transport and tickets (2.22, 2.23). Those are
 * receipt lines without an amount.
 *
 * Pure: no React, no i18n, so tests/budgetSearch.test.mjs runs it in node.
 */
import { quoteTrip, MAX_PARTY } from './tripTotal.js';
import { addDays } from './dates.js';
import { roundTripNear } from './flights/flights.js';
import { destAnchor } from './origins.js';

export const BUFFER_DEFAULT = 0.1;
export const BUFFER_STEPS = [0, 0.05, 0.1, 0.15, 0.2];
export const DAYS_MIN = 2;
export const DAYS_MAX = 21;
export const DAYS_DEFAULT = 5;
export const ADULTS_DEFAULT = 2;
/** How you get there: your own car, a train or a bus, or a flight (only
 *  'fly' is priced, T518, and only when the home airport's flights are loaded). */
export const MODES = ['car', 'public', 'fly'];
export const MODE_DEFAULT = 'public';
/** "Just over": a place whose total is at most this share above the budget. */
export const NEAR_OVER = 0.15;
/** The "with {price} more" figure rounds up to this many euros. */
export const MORE_STEP = 50;
/** The lines the receipt names without an amount, in this order. */
export const UNPRICED = ['there', 'local', 'tickets'];
const BUDGET_MAX = 999999;

/**
 * A typed budget as whole euros, or null. Accepts "1500", "1.500", "1,500",
 * a leading euro sign with spaces as thousands, "1500,50" (the cents are dropped:
 * the search is in whole euros).
 */
export function parseBudget(text) {
  if (typeof text === 'number') {
    return Number.isFinite(text) && text > 0 ? Math.min(BUDGET_MAX, Math.floor(text)) : null;
  }
  let s = String(text ?? '').replace(/[^\d.,]/g, '');
  if (!s) return null;
  // A trailing separator with one or two digits is cents; any other
  // separator groups thousands.
  s = s.replace(/[.,]\d{1,2}$/, '');
  s = s.replace(/[.,]/g, '');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.min(BUDGET_MAX, Math.floor(n)) : null;
}

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * The first day the trip prices from: the first Saturday of that month, in
 * the next year where that Saturday has already passed. Bed prices move by
 * the month (the seasonality curve), so any day inside it gives the month's
 * price; the dates are no longer bounded by the flight window (2.22 plan).
 */
export function startForMonth(month, today = new Date()) {
  const m = Math.min(12, Math.max(1, Math.round(month || 1)));
  const todayIso = isoOf(today);
  for (const year of [today.getFullYear(), today.getFullYear() + 1]) {
    // From the 1st, or from today inside the month that is running now.
    const fromIso = year === today.getFullYear() && m === today.getMonth() + 1 ? todayIso : null;
    const from = fromIso ? new Date(year, m - 1, today.getDate()) : new Date(year, m - 1, 1);
    const sat = new Date(year, m - 1, from.getDate() + ((6 - from.getDay() + 7) % 7));
    const iso = isoOf(sat);
    if (sat.getMonth() === m - 1 && iso >= todayIso) return iso;
  }
  return `${today.getFullYear() + 1}-${pad(m)}-01`;
}

/** Next month, 1 to 12: the "when" a search starts with. */
export function nextMonth(today = new Date()) {
  return (today.getMonth() + 1) % 12 + 1;
}

/**
 * Every input of a search, filled in and clamped. Only the budget has no
 * default; a query without one is not run.
 *   budget   whole euros for the whole group, everything Carta prices
 *   adults   12 and over; children 3 to 11 count half for beds and food
 *   days     trip days; nights = days - 1 (5 days is 4 nights)
 *   month    1 to 12
 *   mode     'car' | 'public' | 'fly', how they get there ('fly' is priced
 *            when a flights file is given, the others are named only)
 *   buffer   a share of the priced parts, one of BUFFER_STEPS
 */
export function normalizeQuery(q = {}, today = new Date()) {
  const adults = Math.max(1, Math.min(MAX_PARTY, Math.round(Number(q.adults) || ADULTS_DEFAULT)));
  const children = Math.max(0, Math.min(MAX_PARTY - adults, Math.round(Number(q.children) || 0)));
  const days = Math.max(DAYS_MIN, Math.min(DAYS_MAX, Math.round(Number(q.days) || DAYS_DEFAULT)));
  const month = Number(q.month) >= 1 && Number(q.month) <= 12 ? Math.round(Number(q.month)) : nextMonth(today);
  const buffer = BUFFER_STEPS.includes(q.buffer) ? q.buffer : BUFFER_DEFAULT;
  const nights = days - 1;
  const start = startForMonth(month, today);
  return {
    budget: parseBudget(q.budget),
    adults,
    children,
    head: adults + children,
    days,
    nights,
    month,
    start,
    end: addDays(start, nights),
    mode: MODES.includes(q.mode) ? q.mode : MODE_DEFAULT,
    buffer,
  };
}

/** True when this search prices the flight: 'fly' with the home airport's file. */
export function fliesPriced(q, opts = {}) {
  return q?.mode === 'fly' && !!opts.flights;
}

/** The planner state of the one-stop trip a search prices. */
export function budgetTripState(destId, q, { lifestyle = null, stayTier = 'home', flights = null, bagKey = null } = {}) {
  const fly = fliesPriced(q, { flights });
  return {
    stops: [{ destinationId: destId, nights: q.nights, activities: [] }],
    tripStart: q.start,
    tripEnd: q.end,
    groupSize: q.adults,
    children: q.children,
    babies: 0,
    // The stay alone: with 'owncar', no home in the context and no typed
    // figure, quoteTrip routes no flight, prices no drive and no transfer,
    // so getting there stays its own line, not priced yet. Flying (T518):
    // 'auto' routes the flight's airport, so quoteTrip adds the transfer
    // from the runway to the bed; the fare itself is roundTripNear's.
    transportPref: fly ? 'auto' : 'owncar',
    baggage: bagKey || 'priority_10kg',
    ownFlight: null,
    carHome: null,
    stayTier,
    lifestyle,
  };
}

/** A figure is an estimate when it stands in for the town (isNational()'s
 *  rule in CostSummary.jsx): a bed not measured in the town (v18 q), or a
 *  basket read at country level. */
export function isEstimate(dest) {
  return dest?.accommodation?.q !== 'measured' || dest?.costs?.level !== 'city';
}

/**
 * One destination priced for a search, or null when the data is too thin to
 * price it (no bed rate or no food basket: "no figure when the data is too
 * thin"). Every euro is whole; the total is the sum of the lines as shown.
 */
export function priceForBudget(dest, q, opts = {}) {
  if (!dest?.id || !dest.accommodation || !dest.costs) return null;
  const fly = fliesPriced(q, opts);
  // The return flight first: flying with the flights loaded, a place with
  // no flight near these dates has no total ("no figure when the data is
  // too thin"), never a total that quietly leaves the flight out.
  const flight = fly
    ? roundTripNear(opts.flights, destAnchor(dest), q.start, q.end,
      { paying: q.head, bagKey: opts.bagKey || 'priority_10kg' })
    : null;
  if (fly && !flight) return null;
  const priced = quoteTrip(
    budgetTripState(dest.id, q, opts),
    { data: { destinations: { [dest.id]: dest } } },
  );
  const stay = priced.stayCosts[0];
  if (!stay?.accom || !stay?.ground) return null;
  const beds = Math.round(priced.parts.beds);
  const days = Math.round(priced.parts.days);
  if (!(beds > 0) || !(days > 0)) return null;
  // Getting there by plane: the fare and bags both ways for every seat that
  // pays, plus the transfer between the airport and the town both ways.
  const transfers = fly ? Math.round(priced.parts.transfers || 0) : 0;
  const there = flight ? Math.round(flight.total) + transfers : null;
  const core = beds + days + (there || 0);
  const buffer = Math.round(core * q.buffer);
  const total = core + buffer;
  return {
    id: dest.id,
    beds,
    days,
    there,
    // The flight behind `there`, for the receipt: the legs (airline, day,
    // checked) and what the bags add, Carta's estimate.
    flight: flight ? {
      out: flight.out, back: flight.back, total: Math.round(flight.total),
      bags: flight.bags, bagsKnown: flight.bagsKnown, transfers,
    } : null,
    core,
    buffer,
    total,
    // The day price a person under the group total (T475-c): bed plus food
    // and drink, the same basis as the Explore card, without the buffer and
    // without the flight.
    dayPp: Math.round((beds + days) / Math.max(1, q.head) / Math.max(1, q.nights)),
    est: isEstimate(dest),
  };
}

/** Fits, tight or over, and what is left. */
export function verdictOf(p, budget) {
  if (p.total <= budget) return { group: 'fits', left: budget - p.total };
  if (p.buffer > 0 && p.core <= budget) return { group: 'tight', left: budget - p.core };
  return { group: 'over', left: budget - p.total };
}

const inMonth = (dest, month) => (dest?.climate?.best || []).includes(month);

/**
 * The search. `dests` is a list of destination records (airport gateways
 * already merged by the caller); returns the two groups the page shows,
 * each sorted (in season first, then the Score, then what is left), and a
 * summary of the places just over the budget.
 */
export function budgetSearch(dests, query, opts = {}, today = new Date()) {
  const q = query?.head ? query : normalizeQuery(query, today);
  const out = { query: q, fits: [], tight: [], over: { count: 0, more: 0 }, priced: 0 };
  if (!q.budget) return out;
  let worstNear = 0;
  for (const dest of dests || []) {
    const p = priceForBudget(dest, q, opts);
    if (!p) continue;
    out.priced += 1;
    const v = verdictOf(p, q.budget);
    if (v.group === 'over') {
      if (p.total <= q.budget * (1 + NEAR_OVER)) {
        out.over.count += 1;
        worstNear = Math.max(worstNear, p.total - q.budget);
      }
      continue;
    }
    out[v.group].push({
      ...p,
      ...v,
      inSeason: inMonth(dest, q.month),
      score: dest.rating?.score ?? null,
      dest,
    });
  }
  const order = (a, b) => (Number(b.inSeason) - Number(a.inSeason))
    || ((b.score ?? -1) - (a.score ?? -1))
    || (b.left - a.left)
    || String(a.dest.city || a.id).localeCompare(String(b.dest.city || b.id));
  out.fits.sort(order);
  out.tight.sort(order);
  out.over.more = worstNear > 0 ? Math.ceil(worstNear / MORE_STEP) * MORE_STEP : 0;
  return out;
}

/**
 * The receipt of one result, in its fixed order: the priced lines, the
 * buffer, the total, then the lines Carta does not price yet. Every screen
 * that shows a search total renders these lines and adds none of its own.
 */
export function budgetReceipt(result, q) {
  if (!result) return null;
  // Getting there, when it is priced (a flight, T518), leads the receipt
  // and leaves the "not in the total" list. The fare is Google Flights'
  // own; the line is an estimate when bags or a transfer are added to it.
  const there = result.there != null
    ? [{
      key: 'there', mode: q.mode, eur: result.there,
      est: (result.flight?.bags || 0) > 0 || (result.flight?.transfers || 0) > 0,
    }]
    : [];
  return {
    lines: [
      ...there,
      { key: 'beds', eur: result.beds, est: result.est },
      { key: 'days', eur: result.days, est: result.est },
      { key: 'buffer', eur: result.buffer, pct: q.buffer, est: false },
    ].filter((l) => l.key !== 'buffer' || q.buffer > 0),
    total: result.total,
    est: result.est,
    dayPp: result.dayPp,
    left: q.budget != null ? q.budget - result.total : null,
    unpriced: UNPRICED
      .filter((key) => key !== 'there' || result.there == null)
      .map((key) => ({ key, mode: key === 'there' ? q.mode : null })),
  };
}
