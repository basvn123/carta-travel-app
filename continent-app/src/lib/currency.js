/**
 * currency.js, the app's small set of European currencies and near-enough
 * rates.
 *
 * Two surfaces need the same numbers: the group expense ledger (splitting a
 * dinner in Krakow) and a past trip's spend (what the week actually cost). The
 * rates are approximate mid-market values on purpose, so both stay offline and
 * neither pretends to be a bank. Anything that has to be exact is stored in
 * the currency it was paid in, and only the totals are converted.
 */

/** Approximate EUR value of one unit of each supported currency. */
export const EUR_RATES = {
  EUR: 1, GBP: 1.17, CHF: 1.05, PLN: 0.23, CZK: 0.041, HUF: 0.0025,
  SEK: 0.088, NOK: 0.086, DKK: 0.134, RON: 0.20, BGN: 0.51, TRY: 0.022,
};

export const CURRENCIES = Object.keys(EUR_RATES);

/** An amount in `currency`, valued in euro. */
export function toEur(amount, currency) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  return n * (EUR_RATES[currency] ?? 1);
}

/** A typed amount ("12,50") as a number, or null when it isn't one. */
export function parseAmount(input) {
  if (input == null) return null;
  const s = String(input).trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
