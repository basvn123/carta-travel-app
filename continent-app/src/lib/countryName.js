/*
 * A country's name in the reader's language (T444, row T442-e). The
 * catalogue stores one English name per place ("Germany"); every surface
 * that prints it on a card, a row, a pin or a list reads it through here,
 * so a German screen says "Deutschland". Intl.DisplayNames knows every code
 * the catalogue holds (AD to XK); an unknown code falls back to the
 * catalogue's own name.
 */
import { activeLocale } from './localeState.js';

const cache = new Map();

function displayNames(locale) {
  if (!cache.has(locale)) {
    let dn = null;
    try { dn = new Intl.DisplayNames([locale], { type: 'region' }); } catch { /* old browser */ }
    cache.set(locale, dn);
  }
  return cache.get(locale);
}

/** countryName('DE', 'Germany') -> 'Deutschland' on a German screen. */
export function countryName(iso2, fallback = '', locale = activeLocale()) {
  if (!iso2) return fallback;
  const code = String(iso2).toUpperCase();
  const name = displayNames(locale)?.of(code);
  return name && name !== code ? name : (fallback || code);
}
