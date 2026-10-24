/**
 * The price request (T662, plan "Carta prijslogica Explore" section 3 and
 * 4.2): one object holding every choice that can move a price. Every screen
 * asks the engine the same question with it; a choice that is not in here
 * must not move a price anywhere.
 *
 *   when        the traveller's "when", read through lib/when.js (the one
 *               date reader): { kind: 'exact' | 'month' | 'any', month,
 *               months, start, end, ym }. start/end only for 'exact'; ym is
 *               the 'YYYY-MM' a month request flies in. Never mixed (V7).
 *   nights      the date pair's nights (in every mode), else DEFAULT_NIGHTS
 *   group       { adults, children, babies } (lib/party.js partyOf, the one
 *               definition of a group)
 *   stay        a lib/stayPrice.js tier id
 *   lifestyle   the Lifestyle panel's frequencies
 *   transport   'any' | 'plane' | 'train' | 'bus' | 'car'
 *   origin, driveHome, baggage   for the way there (not the day price)
 *   view        'pp' (per person, the default) | 'total' (F4)
 *   excluded    items the traveller switched off (F4, rule 9)
 *   activities  chosen activities (F9), empty by default
 *   subArea     a part of the destination (after F2, micro-hubs)
 */
import { DEFAULT_LIFESTYLE, tripDaysBetween } from '../runtime_pricing.js';
import { resolveWhen } from '../when.js';
import { partyOf } from '../party.js';
import { rule } from './config.js';

/** The stay a price assumes when the traveller has set no dates (B5). */
export const DEFAULT_NIGHTS = rule('request.default_nights');

/** The items a price can hold, in the order a breakdown lists them. */
export const PRICE_ITEMS = ['bed', 'food', 'transport', 'car', 'activities', 'events', 'flight'];

/** The planner's bag when the traveller has picked none (T702, T713): the
 *  10 kg cabin bag, the same tier as the app's default (request.default_bag,
 *  priority_10kg), in the planner's own vocabulary (cabin, priority, checked). */
export const PLANNER_BAG = 'priority';

const ANY_WHEN = Object.freeze({ kind: 'any', month: null, months: Object.freeze([]), start: null, end: null, ym: null });

/**
 * B5 (owner, 2026-10-24): two people, an entire place, the Easygoing
 * lifestyle, the year's average. Explore, the destination page, Places, the
 * place pages, the prerender and the planners use this or the traveller's
 * own choices, never a variant of their own.
 */
export const DEFAULT_PRICE_REQUEST = Object.freeze({
  when: ANY_WHEN,
  nights: DEFAULT_NIGHTS,
  group: Object.freeze({ adults: 2, children: 0, babies: 0 }),
  stay: 'home',
  lifestyle: Object.freeze({ ...DEFAULT_LIFESTYLE }),
  transport: 'any',
  origin: null,
  driveHome: null,
  baggage: rule('request.default_bag'),
  view: 'pp',
  excluded: Object.freeze([]),
  activities: Object.freeze([]),
  subArea: null,
});

const pad2 = (n) => String(n).padStart(2, '0');

/** The next 'YYYY-MM' of `month` from `today` (this month counts). */
function nextYm(month, today) {
  const y = Number(String(today).slice(0, 4));
  const m = Number(String(today).slice(5, 7));
  return `${month >= m ? y : y + 1}-${pad2(month)}`;
}

/**
 * The request from the app's state: the choices App.jsx holds, the dates,
 * the date mode (dateFlex), whether the dates are the traveller's own, and
 * the Explore month filter (xm), which wins app-wide while it is on (B7).
 *
 * @param {object} s  { choices, departDate, returnDate, dateFlex, ownDates, xm, today }
 */
export function priceRequest(s = {}) {
  const c = s.choices || {};
  const w = resolveWhen({
    dateFlex: s.dateFlex, departDate: s.departDate, returnDate: s.returnDate, ownDates: s.ownDates, xm: s.xm,
  });
  let when = ANY_WHEN;
  // The pair's length is the traveller's trip length in every mode (a month
  // or any time keeps the pair, T578); only the exact mode reads its days.
  const paired = !!(s.departDate && s.returnDate && s.returnDate > s.departDate);
  const nights = paired ? Math.max(1, tripDaysBetween(s.departDate, s.returnDate)) : DEFAULT_NIGHTS;
  if (w.kind === 'exact' && paired) {
    when = { ...w, start: s.departDate, end: s.returnDate, ym: s.departDate.slice(0, 7) };
  } else if (w.kind === 'month') {
    const fromDates = s.departDate && Number(s.departDate.slice(5, 7)) === w.month ? s.departDate.slice(0, 7) : null;
    const today = s.today || new Date().toISOString().slice(0, 10);
    when = { ...w, start: null, end: null, ym: fromDates || nextYm(w.month, today) };
  }
  const p = partyOf(c);
  return {
    ...DEFAULT_PRICE_REQUEST,
    when,
    nights,
    group: { adults: p.adults, children: p.children, babies: p.babies },
    stay: c.stay_tier || DEFAULT_PRICE_REQUEST.stay,
    lifestyle: c.lifestyle || DEFAULT_PRICE_REQUEST.lifestyle,
    transport: c.transport_mode || DEFAULT_PRICE_REQUEST.transport,
    origin: c.origin ?? null,
    driveHome: c.drive_home ?? null,
    baggage: c.baggage_key || DEFAULT_PRICE_REQUEST.baggage,
    view: (c.price_view || s.view) === 'total' ? 'total' : DEFAULT_PRICE_REQUEST.view,
    // T695: items the traveller switched off in the opened price.
    excluded: (c.price_excluded || s.excluded || DEFAULT_PRICE_REQUEST.excluded).filter((k) => PRICE_ITEMS.includes(k)),
  };
}

/**
 * The same request at exact dates of a screen's own (a day planner stop's
 * arrival and departure, T666): every other choice stays the traveller's.
 * Without a valid pair the request comes back unchanged.
 */
export function atDates(req, start, end) {
  const r = req || DEFAULT_PRICE_REQUEST;
  if (!start || !end || !(end > start)) return r;
  const m = Number(String(start).slice(5, 7));
  const e = Number(String(end).slice(5, 7));
  const months = e && e !== m ? [m, e] : [m];
  return {
    ...r,
    when: { kind: 'exact', month: m, months, start, end, ym: String(start).slice(0, 7) },
    nights: Math.max(1, tripDaysBetween(start, end)),
  };
}

/** Seats: adults plus children (babies sit on a lap). */
export const seatsOf = (req) => Math.max(1, (req?.group?.adults || 0) + (req?.group?.children || 0));

/** A stable key for the request, for memo and cache keys. */
export function requestKey(req) {
  const r = req || DEFAULT_PRICE_REQUEST;
  return JSON.stringify([r.when.kind, r.when.start, r.when.end, r.when.month, r.nights,
    r.group.adults, r.group.children, r.group.babies, r.stay, r.lifestyle, r.transport,
    r.excluded, r.activities, r.subArea]);
}

/**
 * The choices lib/costIndex.js reads, from a request: the bed's dates only
 * for 'exact', its month only for 'month', nothing for 'any' (V7).
 */
export function costChoices(req) {
  const r = req || DEFAULT_PRICE_REQUEST;
  const out = {
    group_size: seatsOf(r), children: r.group.children || 0, babies: r.group.babies || 0,
    stay_tier: r.stay, lifestyle: r.lifestyle, nights: r.nights,
  };
  if (r.when.kind === 'exact') out.start = r.when.start;
  else if (r.when.kind === 'month') out.month = r.when.month;
  return out;
}

/**
 * The flight window that follows the same date mode as the bed (V7):
 *   { kind: 'exact', from, to }   the exact dates
 *   { kind: 'month', ym }         the month's cheapest return
 *   { kind: 'any' }               the year's cheapest return
 */
export function flightWindow(req) {
  const w = (req || DEFAULT_PRICE_REQUEST).when;
  if (w.kind === 'exact') return { kind: 'exact', from: w.start, to: w.end };
  if (w.kind === 'month') return { kind: 'month', ym: w.ym };
  return { kind: 'any' };
}
