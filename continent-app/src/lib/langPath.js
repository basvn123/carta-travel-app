/**
 * Language in the address (T1212, ROADMAP I12).
 *
 * English lives at the root and is the x-default; nl, de, fr, es and it live
 * under a prefix (/nl/, /de/...), the same rule as urlScheme.js LANG_PREFIXES.
 * The router reads the prefix at boot (it names the language of the visit and
 * wins over a stored or detected choice) and writes it back whenever the
 * language changes, so a copied address opens in the language it was copied
 * in. Everything else the app keeps in the address (query, hash) is left as it
 * is.
 *
 * Pure functions only: no window, so Node tests and the prerender can import it.
 */
import { LANG_PREFIXES } from './urlScheme.js';

const PREFIX_RE = /^\/(nl|de|fr|es|it)(?=\/|$)/;

/** The language a pathname names: a prefix language, else null (the root says nothing). */
export function langFromPath(pathname) {
  const m = PREFIX_RE.exec(String(pathname || ''));
  return m ? m[1] : null;
}

/** The pathname without its language prefix, always starting with `/`. */
export function stripLang(pathname) {
  const p = String(pathname || '/');
  const rest = p.replace(PREFIX_RE, '');
  return rest.startsWith('/') ? rest : `/${rest}`;
}

/** The root of the app in a language: `/` for English, `/nl/` for Dutch. */
export function langRoot(lang) {
  return LANG_PREFIXES.includes(lang) ? `/${lang}/` : '/';
}

/**
 * The same pathname in another language. The app shell's own address (`/`)
 * becomes `/nl/`; a content path keeps its words (`/spain/malaga` becomes
 * `/nl/spain/malaga`). English drops the prefix.
 */
export function withLang(pathname, lang) {
  const bare = stripLang(pathname);
  if (!LANG_PREFIXES.includes(lang)) return bare;
  return bare === '/' ? `/${lang}/` : `/${lang}${bare}`;
}
