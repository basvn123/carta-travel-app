// Shared display formatting used across the panels/list/map.

import { activeLocale } from './localeState.js';

/** Rounded euro amount, e.g. "€1,234" (grouping follows the app language).
 *  Returns '-' for null/undefined or any non-finite value, so a single upstream
 *  NaN can't leak "€NaN" into the UI/PDF. */
export function eur(n) {
  return Number.isFinite(n) ? `€${Math.round(n).toLocaleString(activeLocale())}` : '-';
}

/** Grouped whole number in the app language, e.g. "1,570". Bare
 *  `n.toLocaleString()` follows the machine's locale instead, which is how the
 *  landing page ended up printing "1.570 destinations" next to "€1,083.48". */
export function count(n) {
  return Number.isFinite(n) ? Math.round(n).toLocaleString(activeLocale()) : '-';
}

/** Euro to the cent, e.g. "€24.99". The landing page receipt runs on this
 *  rather than eur(): rounding a €24.99 fare to €25 quietly turns the product's
 *  whole claim ("this is the real stored fare") into an estimate. */
export function eurExact(n) {
  return Number.isFinite(n)
    ? new Intl.NumberFormat(activeLocale(), {
      style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(n)
    : '-';
}

/** Decimal hours in human units: 0.17 -> "10 min", 2.5 -> "2 h 30 min".
 *  Nobody reads "0.17h each way" as ten minutes. */
export function fmtHours(h) {
  if (!Number.isFinite(h)) return '-';
  const m = Math.max(1, Math.round(h * 60));
  if (m < 60) return `${m} min`;
  const rest = m % 60;
  return rest ? `${Math.floor(m / 60)} h ${rest} min` : `${Math.floor(m / 60)} h`;
}

/** Stored flight times ('HH:MM/HH:MM', dep/arr local, from
 *  harvest_flight_times.py) -> { dep, arr } for display, or null when the
 *  times harvest doesn't cover this leg yet (arr may be null too). */
export function flightTimes(t) {
  if (typeof t !== 'string' || !t) return null;
  const [dep, arr] = t.split('/');
  return dep ? { dep, arr: arr || null } : null;
}

/** House style: no em/en dashes in shipped copy (see the memory note and
 *  CountryIntel's original cleanDash). Numeric ranges and tight word joins
 *  become a plain hyphen; spaced prose dashes become a comma pause. Applied at
 *  build time to every shipped string (scripts/sync-data.mjs) and reusable at
 *  render time. Non-strings pass through untouched. */
export function stripDashes(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/(\d)\s*[—–]\s*(\d)/g, '$1-$2')  // numeric ranges -> hyphen (1992-1995)
    .replace(/(\w)[—–](\w)/g, '$1-$2')         // tight word joins -> hyphen (Piraeus-Milos)
    .replace(/\s*[—–]\s*/g, ', ');             // remaining spaced prose dashes -> comma
}

/** Only allow http(s) URLs for links that come from harvested/remote data
 *  (activity links, image credit pages), anything else (javascript:, data:,
 *  vbscript:) is dropped so it can never become a stored-XSS click target. */
export function safeUrl(url) {
  if (typeof url !== 'string') return null;
  return /^https?:\/\//i.test(url.trim()) ? url : null;
}

// Human labels for dest.costs.price_source (on-the-ground spend).
export const PRICE_SOURCE_LABELS = {
  numbeo_city: 'city prices',
  numbeo_direct: 'country prices',
  pli_scaled: 'estimated prices',
};

// Human labels for dest.accommodation.price_source (Airbnb nightly rate).
export const ACCOM_SOURCE_LABELS = {
  inside_airbnb_city: 'Airbnb city rates',
  inside_airbnb_country: 'Airbnb country rates',
  airbnb_pli_scaled: 'estimated Airbnb rates',
};
