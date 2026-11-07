/**
 * First-visit language (T1170, ROADMAP I8).
 *
 * A saved choice always wins (the caller checks it first). With none, the
 * first browser language we ship wins: navigator.languages is the ordered
 * preference list, so "fr-CH" maps to fr and "pt, de" skips pt and lands on de.
 * Nothing we ship means English. Pure, so it is testable without a browser.
 */
export const SHIPPED_LANGS = ['en', 'nl', 'de', 'fr', 'es', 'it'];

export function detectBrowserLang(nav) {
  const n = nav === undefined ? (typeof navigator === 'undefined' ? null : navigator) : nav;
  if (!n) return 'en';
  const prefs = Array.isArray(n.languages) && n.languages.length
    ? n.languages : [n.language];
  for (const tag of prefs) {
    if (typeof tag !== 'string') continue;
    const base = tag.toLowerCase().split(/[-_]/)[0];
    if (SHIPPED_LANGS.includes(base)) return base;
  }
  return 'en';
}
