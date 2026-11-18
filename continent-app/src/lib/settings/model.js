/**
 * The Settings model (G12, D10; .work/2026-11-18-search-settings contract.md):
 * the five things Explore's prices answer to, read in ONE place.
 *
 *   Start        origin_kind 'here' | 'place' | 'country', origin_country
 *                (ISO2) and here_town (the Carta town 'here' resolved to),
 *                beside the existing drive_home / origin / origins
 *   When         date_mode 'dates' | 'month' | 'any' | 'cheapest'; the dates
 *                are App's departDate and returnDate, the month is
 *                choices.when_month ('YYYY-MM'), trip_nights the length for every
 *                mode but dates. Switching modes keeps the other modes'
 *                values (the Airbnb reset bug the decision names).
 *   Getting there  transport_mode, as today ('any' reads "Best way")
 *   Prices shown   price_view 'pp' | 'total' and price_span 'day' | 'trip'
 *
 * The new fields live in `choices`, so the URL (lib/urlState.js), the
 * account sync and the price request carry them with everything else.
 * State written before this model had no date_mode: readSettings migrates
 * it from dateFlex, ownDates and the Explore month filter (xm), the way
 * lib/when.js read them, so an old link prices as it did.
 *
 * Pure: no React, no browser globals.
 */
import { partyOf } from '../party.js';
import { tripDaysBetween } from '../runtime_pricing.js';
import { rule } from '../price/config.js';
import { activeStyle, normalizeStyles, holdChoices } from '../travelStyles.js';

export const ORIGIN_KINDS = Object.freeze(['here', 'place', 'country']);
export const DATE_MODES = Object.freeze(['dates', 'month', 'any', 'cheapest']);
export const PRICE_SPANS = Object.freeze(['day', 'trip']);
export const DEFAULT_TRIP_NIGHTS = rule('request.default_nights');
export const MIN_TRIP_NIGHTS = 1;
// The sweep's pairs and the bed model both stop being honest past a month.
export const MAX_TRIP_NIGHTS = 30;

const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO2_RE = /^[A-Z]{2}$/;
const pad2 = (n) => String(n).padStart(2, '0');

export const isYm = (v) => typeof v === 'string' && YM_RE.test(v);
export const clampNights = (n) => {
  if (n == null || n === '') return null;
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.max(MIN_TRIP_NIGHTS, Math.min(MAX_TRIP_NIGHTS, v)) : null;
};

/** The next 'YYYY-MM' of month `m` (1 to 12) from `today` (this month counts). */
export function nextYm(m, today) {
  const y = Number(String(today).slice(0, 4));
  const now = Number(String(today).slice(5, 7));
  return `${m >= now ? y : y + 1}-${pad2(m)}`;
}

/** The month after `ym`. */
export function addMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad2(m + 1)}`;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * The model, from the choices and App's date state.
 * @param {object} choices  App choices
 * @param {object} legacy   { departDate, returnDate, dateFlex, ownDates, xm, today }
 * @returns {{ originKind, originCountry, hereTown, fromPlace, origin, origins,
 *   dateMode, dates, month, tripNights, nights, way, priceView, priceSpan,
 *   party, seats, migrated }}
 *   `nights` is the length every price uses: the pair's in dates mode,
 *   else tripNights. `dates` is { start, end } or null.
 */
export function readSettings(choices = {}, legacy = {}) {
  const c = choices || {};
  const today = legacy.today || todayIso();
  const start = ISO_RE.test(legacy.departDate || '') ? legacy.departDate : null;
  const end = ISO_RE.test(legacy.returnDate || '') ? legacy.returnDate : null;
  const pair = start && end && end > start ? { start, end } : null;
  const pairNights = pair ? Math.max(1, tripDaysBetween(start, end)) : null;

  let dateMode = DATE_MODES.includes(c.date_mode) ? c.date_mode : null;
  let month = isYm(c.when_month) ? c.when_month : null;
  const migrated = !dateMode;
  if (!dateMode) {
    const xm = Number(legacy.xm);
    if (Number.isInteger(xm) && xm >= 1 && xm <= 12) {
      dateMode = 'month';
      month = start && Number(start.slice(5, 7)) === xm ? start.slice(0, 7) : nextYm(xm, today);
    } else if (legacy.dateFlex === 'month' && start) {
      dateMode = 'month';
      month = start.slice(0, 7);
    } else if (legacy.dateFlex === 'any') {
      dateMode = 'any';
    } else if (legacy.ownDates && pair) {
      dateMode = 'dates';
    } else {
      dateMode = 'any';
    }
  }
  if (dateMode === 'month' && !month) month = start ? start.slice(0, 7) : addMonth(today.slice(0, 7));
  const tripNights = clampNights(c.trip_nights) ?? (migrated ? pairNights : null) ?? DEFAULT_TRIP_NIGHTS;
  // Dates without a pair cannot price days: they read as any time until the
  // traveller picks the second day.
  const datesOk = dateMode === 'dates' && !!pair;

  const originKind = ORIGIN_KINDS.includes(c.origin_kind) ? c.origin_kind : 'place';
  const priceView = c.price_view === 'total' ? 'total' : 'pp';
  // An old 'total' meant the group's stay over the nights (lib/price/display
  // before G12): it reads as the whole trip now, the closest of the four.
  const priceSpan = PRICE_SPANS.includes(c.price_span) ? c.price_span : (priceView === 'total' && !c.price_span ? 'trip' : 'day');
  const party = partyOf(c);
  return {
    originKind,
    originCountry: originKind === 'country' && ISO2_RE.test(c.origin_country || '') ? c.origin_country : null,
    hereTown: originKind === 'here' ? (c.here_town || null) : null,
    fromPlace: c.drive_home || null,
    startNames: cleanNames(c.start_names),
    origin: c.origin || null,
    origins: Array.isArray(c.origins) ? c.origins : [],
    dateMode,
    dates: pair,
    datesOk,
    month: dateMode === 'month' ? month : (month || null),
    tripNights,
    nights: datesOk ? pairNights : tripNights,
    way: ['any', 'plane', 'train', 'bus', 'car'].includes(c.transport_mode) ? c.transport_mode : 'any',
    priceView,
    priceSpan,
    excluded: Array.isArray(c.price_excluded) ? c.price_excluded : [],
    party,
    seats: party.seats,
    migrated,
  };
}

/* ---------------------------------------------------------------------------
 * Pure updaters: (choices) -> choices. The setters below wrap them for App's
 * setChoices; tests and the URL use them directly.
 * ------------------------------------------------------------------------- */

export const withDateMode = (mode) => (prev) => (DATE_MODES.includes(mode) ? { ...prev, date_mode: mode } : prev);
export const withMonth = (ym) => (prev) => (isYm(ym) ? { ...prev, date_mode: 'month', when_month: ym } : prev);
export const withTripNights = (n) => (prev) => {
  const v = clampNights(n);
  return v == null ? prev : { ...prev, trip_nights: v };
};
/** The way there. A way that is not the active style's main way HOLDS the
 *  style (fixes-r1 E1): without the hold, useTravelStyles rule 1 wrote the
 *  new way into the saved style; held, the heart gets its dot and the
 *  Studio offers Keep and Undo. The style itself is never rewritten here. */
export const withWay = (mode) => (prev) => {
  if (!['any', 'plane', 'train', 'bus', 'car'].includes(mode)) return prev;
  const style = activeStyle(normalizeStyles(prev.travel_styles));
  const next = { ...prev, transport_mode: mode };
  return style && style.way !== mode ? holdChoices(next) : next;
};
export const withPriceView = (view) => (prev) => ({ ...prev, price_view: view === 'total' ? 'total' : 'pp' });
export const withPriceSpan = (span) => (prev) => (PRICE_SPANS.includes(span) ? { ...prev, price_span: span } : prev);

/**
 * The start kind and its keys. Leaving 'country' drops the country's
 * airports unless a reach in hours ticked them (App's setFrom recomputes
 * those), so a town start never keeps flying from another country.
 */
export const withStart = (kind, { country = null, town = null, airports = null, origin = null, names = null } = {}) => (prev) => {
  if (!ORIGIN_KINDS.includes(kind)) return prev;
  const next = { ...prev, origin_kind: kind, origin_country: null, here_town: null, start_names: cleanNames(names) };
  if (kind === 'here') next.here_town = town || null;
  if (kind === 'country') {
    next.origin_country = ISO2_RE.test(country || '') ? country : null;
    if (Array.isArray(airports)) {
      next.origins = airports;
      // The reach in hours belonged to a town; a country's airports are its own.
      next.airport_hours = null;
      if (origin) next.origin = origin;
    }
  } else if (prev.origin_kind === 'country' && !prev.airport_hours) {
    next.origins = [];
  }
  return next;
};

/** A place's names by UI language ({ de: 'Brüssel' }), two-letter keys,
 *  short strings only; null when there are none (fixes-r1 E7). */
export function cleanNames(names) {
  if (!names || typeof names !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(names)) {
    if (/^[a-z]{2}$/.test(k) && typeof v === 'string' && v.trim() && v.length <= 80) out[k] = v.trim();
  }
  return Object.keys(out).length ? out : null;
}

/** The legacy dateFlex for a mode: screens that still read it (the planner,
 *  lib/when.js) see month as month and cheapest as any time. */
export const legacyFlex = (mode) => (mode === 'month' ? 'month' : mode === 'dates' ? null : 'any');
/** The legacy Explore month (1 to 12) for lib/when.js readers, or null. */
export const legacyXm = (mode, ym) => (mode === 'month' && isYm(ym) ? Number(ym.slice(5, 7)) : null);
