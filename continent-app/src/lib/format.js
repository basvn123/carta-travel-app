// Shared display formatting used across the panels/list/map.

import { activeLocale } from './localeState.js';
import { formatMoney } from './money.js';

/** Whole euros for comparison contexts (cards, pins, lists), e.g. "€1,234" or
 *  "1.234 €": the one formatter in money.js, so the symbol sits where the
 *  reader's language puts it (T423). '-' for a non-finite value. */
export function eur(n) {
  return formatMoney(n, { precision: 'whole' });
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
  return formatMoney(n, { precision: 'cents' });
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

/** Flight times ('HH:MM/HH:MM', dep/arr local) -> { dep, arr } for display,
 *  or null when the leg has no times (arr may be null too). */
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
    // currency ranges -> "to" (a dash between two euro figures would otherwise
    // fall to the comma rule below and read as two separate prices)
    .replace(/(\d)\s*[—–]\s*([€$£]\s?\d)/g, '$1 to $2')
    .replace(/(\d)\s*[—–]\s*(\d)/g, '$1-$2')  // numeric ranges -> hyphen (1992-1995)
    .replace(/(\w)[—–](\w)/g, '$1-$2')         // tight word joins -> hyphen (Piraeus-Milos)
    .replace(/\s*[—–]\s*/g, ', ');             // remaining spaced prose dashes -> comma
}

/** THE one place a range is joined. Money and other quantities that have a low
 *  and a high end render through here, with the word "to" (house style bans the
 *  dash). `fmt` formats one end; a missing or equal end collapses to one
 *  figure; returns '' when neither end is a number. Journey budgets, per-day
 *  figures and every {low, high} pair on the trip page come through this, so
 *  the join can never drift or be stripped back to a comma. */
/* The range word in each UI language (T423: it was English "to" everywhere,
   so German read "40 € to 60 €"). */
const RANGE_WORD = { en: 'to', nl: 'tot', de: 'bis', fr: 'à', es: 'a', it: 'a' };

export function formatRange(low, high, fmt = String) {
  const lo = Number.isFinite(low);
  const hi = Number.isFinite(high);
  const word = RANGE_WORD[String(activeLocale()).slice(0, 2)] || 'to';
  if (lo && hi && low !== high) return `${fmt(low)} ${word} ${fmt(high)}`;
  if (lo) return fmt(low);
  if (hi) return fmt(high);
  return '';
}

/** Only allow http(s) URLs for links that come from harvested/remote data
 *  (activity links, image credit pages), anything else (javascript:, data:,
 *  vbscript:) is dropped so it can never become a stored-XSS click target. */
export function safeUrl(url) {
  if (typeof url !== 'string') return null;
  return /^https?:\/\//i.test(url.trim()) ? url : null;
}

// Words a register keeps lower case inside a name ("Limnothalassa Gialovas
// kai Nisos Sfaktiria", "Ría de Vigo"), across the languages Europe's
// registers write in.
const NAME_SMALL = new Set([
  'a', 'al', 'am', 'and', 'au', 'aux', 'da', 'das', 'de', 'dei', 'del', 'della', 'der', 'des', 'di', 'do', 'dos',
  'du', 'e', 'el', 'en', 'et', 'i', 'im', 'in', 'kai', 'la', 'las', 'le', 'les', 'lo', 'los', 'of', 'on', 'sur',
  'the', 'und', 'van', 'von', 'y',
]);

/** A name a European register publishes in capitals ("VOIDOKILIA", a
 *  Natura 2000 site's "LIMNOTHALASSA GIALOVAS KAI NISOS SFAKTIRIA") in the
 *  case the page prints every other name in (T474, row T435-h). Only a name
 *  with no lower-case letter at all changes, so "Ría de Vigo", or an "EU"
 *  inside a mixed name, stays exactly as written; short ones (an "EU" alone)
 *  are left too. */
export function displayName(s, lang = 'en') {
  if (typeof s !== 'string') return s;
  const letters = s.replace(/[^\p{L}]/gu, '');
  if (letters.length < 4) return s;
  if (letters !== letters.toLocaleUpperCase(lang) || letters === letters.toLocaleLowerCase(lang)) return s;
  return s.toLocaleLowerCase(lang).replace(/(^|[\s\-('/’])(\p{L})(\p{L}*)/gu, (m, sep, first, rest, at) => {
    const word = first + rest;
    if (at > 0 && NAME_SMALL.has(word)) return sep + word;
    return sep + first.toLocaleUpperCase(lang) + rest;
  });
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
