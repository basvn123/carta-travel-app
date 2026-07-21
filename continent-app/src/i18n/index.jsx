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
import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';
import { setActiveLocale } from '../lib/localeState.js';
import { en } from './en.js';
import { nl } from './nl.js';
import { de } from './de.js';
import { fr } from './fr.js';
import { es } from './es.js';
import { it } from './it.js';

const CATALOGS = { en, nl, de, fr, es, it };

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
    if (stored && CATALOGS[stored]) return stored;
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
  // Mirror into the plain-JS holder so non-React formatters (lib/format.js
  // number/date grouping) follow the active language too.
  setActiveLocale((LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0]).bcp47);

  const setLang = useCallback((code) => {
    if (!CATALOGS[code]) return;
    try { localStorage.setItem(LANG_KEY, code); } catch { /* storage unavailable */ }
    setLangState(code);
  }, []);

  const value = useMemo(() => {
    const catalog = CATALOGS[lang] || en;
    const t = (key, vars) => {
      const msg = catalog[key] ?? en[key] ?? key;
      return interpolate(msg, vars);
    };
    return { lang, setLang, t, languages: LANGUAGES };
  }, [lang, setLang]);

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
