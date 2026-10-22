/**
 * Money, the one formatter (T423, roadmap 1.2).
 *
 * Every euro the traveller reads goes through formatMoney(), so two screens
 * can never write the same figure two ways. The rules (DESIGN.md, PRODUCT.md
 * "Numbers", owner decisions 2026-10-13):
 *
 *   precision  'whole' where many places are compared at once: cards, pins,
 *              lists, rails, filters, chips. 'cents' on receipts, totals,
 *              ledgers, pass prices and exports.
 *   locale     the reader's language decides where the symbol goes and how
 *              digits group (€1,268 in English, 1.268 € in German). Defaults
 *              to the app language.
 *   est        an estimate is written ~€87, the tilde alone (owner decision 4,
 *              2026-10-22, T590: the estimate word left the screen):
 *              formatApprox() or formatEst() for a string, <Money est> in
 *              JSX. Never "~ €87".
 *   missing    what a non-finite value prints. Callers that can say "price on
 *              request" in words do so; the default keeps a NaN from ever
 *              reaching the screen as "€NaN".
 *
 * Strings never carry a euro sign: an i18n template takes a formatted figure
 * ({price}, {eur}) from here.
 */
import { activeLocale } from './localeState.js';
import { formatRange } from './format.js';

const cache = new Map();

function numberFormat(locale, digits) {
  const key = `${locale}|${digits}`;
  let f = cache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(locale, {
        style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits,
      });
    } catch {
      f = new Intl.NumberFormat('en-GB', {
        style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits,
      });
    }
    cache.set(key, f);
  }
  return f;
}

/** One euro figure: formatMoney(87.4) -> "€87", formatMoney(87.4, { precision: 'cents' }) -> "€87.40". */
export function formatMoney(value, { precision = 'whole', locale, missing = '-' } = {}) {
  if (!Number.isFinite(value)) return missing;
  const cents = precision === 'cents';
  return numberFormat(locale || activeLocale(), cents ? 2 : 0).format(cents ? value : Math.round(value));
}

/** The estimate form of a figure: "~€87". */
export function formatApprox(value, opts) {
  const s = formatMoney(value, opts);
  return Number.isFinite(value) ? `~${s}` : s;
}

/** The whole estimate in one string: "~€87", the same as formatApprox (T590).
 *  The second argument, the estimate word, is kept for its callers and no
 *  longer printed. */
export function formatEst(value, estWord, opts) {
  return formatApprox(value, opts);
}

/** A range in the house join: "€40 to €60". */
export function formatMoneyRange(low, high, opts) {
  return formatRange(low, high, (n) => formatMoney(n, opts));
}
