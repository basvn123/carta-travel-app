/**
 * langs.mjs, the language pages of the prerender (T1212, ROADMAP I12).
 *
 * English is the root and the x-default. The five other languages get a page
 * under their prefix for each kind in prerenderShell.js LANG_PAGE_KINDS
 * (destinations, trips, journeys): build.mjs calls the same page builder with
 * ctx.lang set, and langVariant() moves every link that has a page in that
 * language under the prefix. Links to kinds that are English only keep their
 * English address.
 *
 * Indexing. A language page is indexable only when its English page is and
 * REVIEWED names its language and kind: the chrome (strings.mjs) and the lead
 * sentences (the app catalogues, T1170) are machine-drafted until a native
 * speaker has read them, and Google's scaled-content policy treats unreviewed
 * automated translation as thin (research in Execution/P15/T1212). Until then
 * a language page ships noindex,follow, carries no hreflang, stays out of the
 * sitemap, and its English page does not name it as an alternate (an hreflang
 * set only lists indexable pages). Adding a kind to REVIEWED is the switch
 * (owner step T1212-a); nothing else changes.
 */
import { parsePath, LANG_PREFIXES } from '../../src/lib/urlScheme.js';
import { LANG_PAGE_KINDS } from '../../src/lib/prerenderShell.js';
import { ORIGIN } from './html.mjs';
import { S } from './strings.mjs';

/** The languages that get pages besides English. */
export const LANGS = Object.freeze([...LANG_PREFIXES]);

/**
 * The language and kind pairs a native speaker has reviewed: those pages are
 * indexed. Empty today: every language page is machine-drafted.
 * Shape: { nl: ['dest', 'trip'], de: [] ... }
 */
export const REVIEWED = Object.freeze({ nl: [], de: [], fr: [], es: [], it: [] });

/** True when pages of `kind` in `lang` may be indexed. */
export function isReviewed(lang, kind, reviewed = REVIEWED) {
  return LANGS.includes(lang) && LANG_PAGE_KINDS.includes(kind) && (reviewed[lang] || []).includes(kind);
}

/** Reads `--reviewed nl:dest+trip,de:dest` into the REVIEWED shape (a preview of the switch). */
export function parseReviewed(arg) {
  if (!arg) return REVIEWED;
  const out = Object.fromEntries(LANGS.map((l) => [l, []]));
  for (const part of String(arg).split(',')) {
    const [l, kinds] = part.split(':');
    if (!LANGS.includes(l)) continue;
    out[l] = String(kinds || '').split('+').filter((k) => LANG_PAGE_KINDS.includes(k));
  }
  return out;
}

/**
 * An English site path as it reads on a page in `lang`: the home page becomes
 * /nl/, a path of a kind with language pages gets the prefix, anything else
 * (a trail, a country page, a section list) keeps its English address.
 */
export function localizePath(p, lang) {
  if (!p || !LANGS.includes(lang)) return p;
  if (p === '/') return `/${lang}/`;
  const parsed = parsePath(p);
  if (!parsed || parsed.lang !== 'en' || !LANG_PAGE_KINDS.includes(parsed.kind)) return p;
  return `/${lang}${p}`;
}

/** A page model built with ctx.lang, with its own and its links' paths in that language. */
export function langVariant(page, lang) {
  if (!page || !page.path) return null;
  const loc = (p) => localizePath(p, lang);
  const links = (rows) => (rows || []).map((l) => (l && l.path ? { ...l, path: loc(l.path) } : l));
  return {
    ...page,
    lang,
    enPath: page.path,
    path: loc(page.path),
    ...(page.canonical ? { canonical: loc(page.canonical) } : {}),
    crumbs: links(page.crumbs),
    sections: (page.sections || []).map((s) => (s && s.links ? { ...s, links: links(s.links) } : s)),
    ...(page.pager ? { pager: links(page.pager) } : {}),
    // The photo credit's one English word.
    ...(page.image?.credit ? { image: { ...page.image, credit: S(lang, 'photo', { by: String(page.image.credit).replace(/^Photo: /, '') }) } } : {}),
  };
}

/**
 * The reciprocal hreflang set of an English path: English, x-default (also
 * English) and each language in `langs`. Every page in the set carries the
 * same list, itself included.
 */
export function hreflangLinks(enPath, langs) {
  const out = [{ hreflang: 'en', href: `${ORIGIN}${enPath}` }];
  for (const l of langs) out.push({ hreflang: l, href: `${ORIGIN}/${l}${enPath}` });
  out.push({ hreflang: 'x-default', href: `${ORIGIN}${enPath}` });
  return out;
}
