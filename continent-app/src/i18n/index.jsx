/**
 * i18n, the app's language layer.
 *
 * What translates and what deliberately does NOT:
 *   - UI chrome (buttons, labels, wizard questions, notices) -> t() catalogs.
 *   - Sight/POI NAMES stay in their language of origin: they must match what
 *     is written on street signs and inside Google Maps, or the traveller
 *     can't find the place. ("Maison du Cygne" is findable; a translated
 *     "Swan House" is not.)
 *   - Sight DESCRIPTIONS, city taglines and area guides are English editorial
 *     data from the pipeline, they follow the data, not the UI language.
 *   - City/country names stay in their English/anglicized data form (they are
 *     also lookup keys throughout the dataset).
 *
 * Catalogs are flat key -> string maps with {var} interpolation. English is
 * the source of truth; any missing key falls back to English, then to the
 * key itself, so a partially-translated catalog never breaks the UI.
 */
import React, {
  createContext, useContext, useMemo, useState, useCallback, useEffect,
} from 'react';
import { setActiveLocale } from '../lib/localeState.js';
import { en } from './en.js';

/* Only English is bundled into the entry chunk. The other five catalogs are
 * ~190 KB of source each (~960 KB together, roughly 38% of the main JS bundle
 * pre-split) and the app defaults to English, so every visitor used to
 * download and parse five languages they had not asked for. Each one is now
 * its own chunk, fetched the first time that language is actually selected.
 *
 * English stays static because it is the fallback for every missing key
 * (see the t() below) and the catalog the app opens on. */
const LOADERS = {
  nl: () => import('./nl.js').then((m) => m.nl),
  de: () => import('./de.js').then((m) => m.de),
  fr: () => import('./fr.js').then((m) => m.fr),
  es: () => import('./es.js').then((m) => m.es),
  it: () => import('./it.js').then((m) => m.it),
};

/* Catalogs resolved so far this session, English seeded. A language already in
 * here renders synchronously, so switching back and forth never re-fetches and
 * never flashes English. */
const CATALOGS = { en };

/** true for every language the picker offers, loaded or not. */
const isLang = (code) => code === 'en' || Object.hasOwn(LOADERS, code);

/** Languages offered in the picker. `flag` is an ISO2 country code for
 *  CountryFlag (the app's SVG flags, no emoji). Labels are endonyms so
 *  everyone can find their own language regardless of the active one. */
export const LANGUAGES = [
  { code: 'en', flag: 'GB', label: 'English', bcp47: 'en-GB' },
  { code: 'nl', flag: 'NL', label: 'Nederlands', bcp47: 'nl-NL' },
  { code: 'de', flag: 'DE', label: 'Deutsch', bcp47: 'de-DE' },
  { code: 'fr', flag: 'FR', label: 'Français', bcp47: 'fr-FR' },
  { code: 'es', flag: 'ES', label: 'Español', bcp47: 'es-ES' },
  { code: 'it', flag: 'IT', label: 'Italiano', bcp47: 'it-IT' },
];

const LANG_KEY = 'continent.lang.v1';

function initialLang() {
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored && isLang(stored)) return stored;
  } catch { /* storage unavailable */ }
  // First visit: default to English. (We used to auto-match the browser
  // language, but the app's editorial data is English-first, so English is the
  // intended default; a visitor can still switch via the language picker, and
  // that choice is honored above on the next visit.)
  return 'en';
}

const interpolate = (msg, vars) => (vars
  ? msg.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m))
  : msg);

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(initialLang);
  // Bumped when a catalog finishes downloading, so the tree re-renders with
  // the real strings. Until then t() falls through to English, which is the
  // same fallback a partially-translated catalog already relied on - so a
  // stored non-English choice paints in English for one frame rather than
  // holding the whole app on a blank screen.
  const [loaded, setLoaded] = useState(0);
  // Mirror into the plain-JS holder so non-React formatters (lib/format.js
  // number/date grouping) follow the active language too.
  setActiveLocale((LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0]).bcp47);

  useEffect(() => {
    if (CATALOGS[lang] || !LOADERS[lang]) return undefined;
    let live = true;
    LOADERS[lang]()
      .then((catalog) => {
        CATALOGS[lang] = catalog;
        if (live) setLoaded((n) => n + 1);
      })
      // A failed chunk fetch (offline, stale deploy) leaves the language on
      // English rather than taking the app down: every key resolves.
      .catch(() => {});
    return () => { live = false; };
  }, [lang]);

  const setLang = useCallback((code) => {
    if (!isLang(code)) return;
    try { localStorage.setItem(LANG_KEY, code); } catch { /* storage unavailable */ }
    // Start the download on the click rather than waiting for the effect, so
    // the catalog is usually in hand by the time React commits.
    if (!CATALOGS[code] && LOADERS[code]) LOADERS[code]().then((c) => { CATALOGS[code] = c; }).catch(() => {});
    setLangState(code);
  }, []);

  const value = useMemo(() => {
    const catalog = CATALOGS[lang] || en;
    const t = (key, vars) => {
      const msg = catalog[key] ?? en[key] ?? key;
      return interpolate(msg, vars);
    };
    return { lang, setLang, t, languages: LANGUAGES };
    // `loaded` is in the deps on purpose: it is the signal that CATALOGS[lang]
    // just became real, and it is what rebuilds t() around it.
  }, [lang, setLang, loaded]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** { lang, setLang, t, languages }, t(key, vars) with {var} interpolation. */
export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Render outside the provider (tests, isolated mounts): plain English.
    return { lang: 'en', setLang: () => {}, t: (key, vars) => interpolate(en[key] ?? key, vars), languages: LANGUAGES };
  }
  return ctx;
}
