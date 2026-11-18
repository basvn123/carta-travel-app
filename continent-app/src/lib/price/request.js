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
 *   lifestyle   the travel style's eating and drinking frequencies (the studio's spend step)
 *   transport   'any' | 'plane' | 'train' | 'bus' | 'car'
 *   origin, driveHome, baggage   for the way there (not the day price)
 *   view        'pp' (per person, the default) | 'total' (F4)
 *   excluded    items the traveller switched off (F4, rule 9)
 *   activities  chosen activities (F9), empty by default
 *   subArea     a part of the destination (after F2, micro-hubs)
 *
 * G12 (D10, the Settings model, lib/settings/model.js) adds:
 *   dateMode    'dates' | 'month' | 'any' | 'cheapest'; `when` stays the
 *               three kinds every bed and month reader knows (cheapest reads
 *               as any time there), the flight reads dateMode
 *   span        'day' | 'trip' (Prices shown)
 *   originKind, originCountry   the Start kind
 * and `nights` is the trip length in month, any and cheapest modes.
 */
import { DEFAULT_LIFESTYLE, tripDaysBetween } from '../runtime_pricing.js';
import { resolveWhen } from '../when.js';
import { readSettings } from '../settings/model.js';
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
  // R4: true only when a planned trip HIRES a car there (planner transport
  // 'car'). Explore's transport 'car' is driving one's own car there, so it
  // cannot stand for "has a car at the stop"; this flag does.
  hire: false,
  origin: null,
  driveHome: null,
  baggage: rule('request.default_bag'),
  view: 'pp',
  excluded: Object.freeze([]),
  activities: Object.freeze([]),
  subArea: null,
  dateMode: 'any',
  // null: the pre-G12 reading, where 'total' is the trip (display.js spanOf).
  span: null,
  originKind: 'place',
  originCountry: null,
});

/**
 * The request from the app's state: the choices App.jsx holds (with the
 * Settings model's fields, lib/settings/model.js), the dates, and for state
 * from before that model the date mode (dateFlex), whether the dates are the
 * traveller's own and the Explore month filter (xm), which readSettings
 * migrates. With a date_mode in the choices, xm no longer moves a price.
 *
 * @param {object} s  { choices, departDate, returnDate, dateFlex, ownDates, xm, today }
 */
export function priceRequest(s = {}) {
  const c = s.choices || {};
  const m = readSettings(c.price_view || !s.view ? c : { ...c, price_view: s.view }, s);
  let when = ANY_WHEN;
  if (m.dateMode === 'dates' && m.datesOk) {
    const w = resolveWhen({ departDate: m.dates.start, returnDate: m.dates.end, ownDates: true });
    when = { ...w, start: m.dates.start, end: m.dates.end, ym: m.dates.start.slice(0, 7) };
  } else if (m.dateMode === 'month') {
    const month = Number(m.month.slice(5, 7));
    when = { kind: 'month', month, months: [month], start: null, end: null, ym: m.month };
  }
  const p = m.party;
  return {
    ...DEFAULT_PRICE_REQUEST,
    when,
    nights: m.nights || DEFAULT_NIGHTS,
    // Dates without a second day read as any time (readSettings datesOk).
    dateMode: m.dateMode === 'dates' && !m.datesOk ? 'any' : m.dateMode,
    span: m.priceSpan,
    originKind: m.originKind,
    originCountry: m.originCountry,
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
    dateMode: 'dates',
  };
}

/** Seats: adults plus children (babies sit on a lap). */
export const seatsOf = (req) => Math.max(1, (req?.group?.adults || 0) + (req?.group?.children || 0));

/** Car seats: everyone, babies too. A baby has no plane seat but rides in
 *  its own car seat, which takes one of the car's places (R4: the trip hire
 *  and the day's car line count cars the same way). */
export const carSeatsOf = (req) => seatsOf(req) + Math.max(0, req?.group?.babies || 0);

/** A stable key for the request, for memo and cache keys. G12: every
 *  choice that moves a shown figure is in it (the logic critic found the
 *  way there, the start and the basis missing), so a memo on this key
 *  cannot hand back a figure for other settings. */
export function requestKey(req) {
  const r = req || DEFAULT_PRICE_REQUEST;
  const dh = r.driveHome;
  return JSON.stringify([r.when.kind, r.when.start, r.when.end, r.when.month, r.when.ym || null, r.nights,
    r.group.adults, r.group.children, r.group.babies, r.stay, r.lifestyle, r.transport, !!r.hire,
    r.excluded, r.activities, r.subArea, r.dateMode || null, r.span || null, r.view || null,
    r.origin || null, dh ? [dh.lat, dh.lon] : null, r.baggage || null, r.originKind || null, r.originCountry || null]);
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
 *   { kind: 'month', ym }         the month's cheapest return of the trip length
 *   { kind: 'cheapest' }          the cheapest checked return of the trip length (G12)
 *   { kind: 'any' }               any time: the route's typical fare on a card
 */
export function flightWindow(req) {
  const r = req || DEFAULT_PRICE_REQUEST;
  const w = r.when;
  if (w.kind === 'exact') return { kind: 'exact', from: w.start, to: w.end };
  if (w.kind === 'month') return { kind: 'month', ym: w.ym };
  if (r.dateMode === 'cheapest') return { kind: 'cheapest' };
  return { kind: 'any' };
}
