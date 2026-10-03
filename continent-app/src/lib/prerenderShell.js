/**
 * The prerender contract (T221): which content paths have a static page, where
 * that page sits in the prerender bucket, and how a page is laid into the app
 * shell when it is served.
 *
 * Three callers share it, so they cannot disagree:
 *   scripts/prerender/build.mjs   writes each page under prerenderKey(path)
 *   functions/[[path]].js         the one Pages Function, reads the same key
 *   public/_routes.json           the paths that invoke the Function, checked
 *                                 against routesJson() by verify_prerender.mjs
 *
 * Pure functions only, like urlScheme.js: no window, no fetch, no Node APIs.
 * The Pages Function bundles this file with esbuild and Node imports it as is.
 *
 * Why a page is a fragment and not a finished document. The app shell
 * (index.html) names the hashed JS and CSS of the deploy it came from. A page
 * on R2 that carried those names would break the app for a person the first
 * time a new deploy changed them, and the bucket would have to be rewritten on
 * every deploy. So the bucket holds only what the data decides (head tags and
 * the readable body), and the Function lays it into whatever shell the current
 * deploy serves. Data and deploy then move on their own cadences.
 */
import { parsePath, COUNTRY_SLUGS } from './urlScheme.js';

/** Marker comments a stored page carries around its two parts. */
export const HEAD_OPEN = '<!--carta:head-->';
export const HEAD_CLOSE = '<!--/carta:head-->';
export const BODY_OPEN = '<!--carta:body-->';
export const BODY_CLOSE = '<!--/carta:body-->';

/** Page kinds the prerender writes. Guides are not prerendered: they are
 *  noindex community pages. cost (a destination's week) and days (a country
 *  for n days, optionally under a day budget) are T224's two families. */
export const PRERENDER_KINDS = Object.freeze([
  'country', 'dest', 'section', 'trail', 'cycle', 'tour',
  'beach', 'lake', 'mountain', 'region', 'trip', 'journey', 'cost', 'days',
]);

/** Languages that have pages in the bucket. hreflang wave one is English only
 *  (docs/SEO.md); a language joins here when its pages are built, and the
 *  routes below grow with it. */
export const PRERENDER_LANGS = Object.freeze(['en']);

/**
 * The bucket key for a content path, or null when the path has no static page.
 * The key carries the identifier and never the title slug, so a trail that is
 * retitled keeps its object and a request with a stale slug still finds it
 * (the page's canonical names the current slug).
 */
export function prerenderKey(pathname) {
  const p = parsePath(pathname);
  if (!p || !PRERENDER_KINDS.includes(p.kind) || !PRERENDER_LANGS.includes(p.lang)) return null;
  const cw = COUNTRY_SLUGS[p.cc];
  const k = (rest) => `${p.lang}/${rest}.html`;
  switch (p.kind) {
    case 'country': return k(cw);
    case 'dest': return k(p.slug);
    // The cost page sits under its destination's key: en/spain/malaga/cost.html
    // beside en/spain/malaga.html. A dossier slug never ends in a reserved word.
    case 'cost': return k(`${p.slug}/cost`);
    case 'days': return k(p.band ? `${cw}/${p.days}-days/under-${p.band}` : `${cw}/${p.days}-days`);
    // Page n of a list is p{n}: a bare number would be the key of trail or
    // cycling id n, whose key is its id alone.
    case 'section': return k(p.page > 1 ? `${cw}/${p.section}/p${p.page}` : `${cw}/${p.section}`);
    case 'trail': return k(`${cw}/trails/${p.id}`);
    case 'cycle': return k(`${cw}/cycling/${p.id}`);
    case 'tour': return k(`${cw}/cycling/tours/${p.slug}`);
    case 'beach': return k(`${cw}/beaches/${p.id.toLowerCase()}`);
    case 'lake': return k(`${cw}/lakes/${p.id.toLowerCase()}`);
    case 'mountain': return k(`${cw}/mountains/${p.id.toLowerCase()}`);
    case 'region': return k(`${cw}/regions/${p.id.toLowerCase()}`);
    case 'trip': return k(`trips/${p.id}`);
    case 'journey': return k(`journeys/${p.id}`);
    default: return null;
  }
}

/** A page's share card (T212-b) sits beside it: /og/p/en/austria.png is the
 *  card of /austria, stored as og/en/austria.png. Null for anything else. */
export function cardKey(pathname) {
  const m = /^\/og\/p\/([a-z]{2}(?:\/[a-z0-9_-]+)+)\.png$/.exec(String(pathname || ''));
  return m && !m[1].includes('..') ? `og/${m[1]}.png` : null;
}

/** A sitemap file (T222) sits in the same bucket under sitemaps/: /sitemap.xml
 *  is the index, /sitemap-trails-en.xml one type, -2 and so on a split file.
 *  Null for anything else. */
export function sitemapKey(pathname) {
  const m = /^\/(sitemap(?:-[a-z]+-en(?:-[0-9]{1,3})?)?\.xml)$/.exec(String(pathname || ''));
  return m ? `sitemaps/${m[1]}` : null;
}

/**
 * The _routes.json the deploy needs: only the content prefixes invoke the
 * Function, so the app shell, the assets and the boot index stay free static
 * serving and never count against the Functions request budget. Each country
 * needs two rules because `/spain/*` does not match `/spain` itself.
 * 43 countries x 2 + trips + journeys + the cards + the two sitemap rules =
 * 91 rules of the 100 Pages allows. A language joining PRERENDER_LANGS adds one rule, `/nl/*`.
 */
export function routesJson() {
  const include = [];
  for (const cw of Object.values(COUNTRY_SLUGS).sort()) include.push(`/${cw}`, `/${cw}/*`);
  include.push('/trips/*', '/journeys/*', '/og/p/*', '/sitemap.xml', '/sitemap-*');
  for (const l of PRERENDER_LANGS) if (l !== 'en') include.push(`/${l}/*`);
  return { version: 1, include, exclude: [] };
}

const between = (s, open, close) => {
  const a = s.indexOf(open);
  const b = s.indexOf(close, a + open.length);
  return a < 0 || b < 0 ? null : s.slice(a + open.length, b);
};

// The shell's own per-page tags, which a page replaces rather than repeats.
const SHELL_PAGE_TAGS = [
  /<title>[\s\S]*?<\/title>\s*/i,
  /<meta\s+name="description"[^>]*>\s*/gi,
  /<link\s+rel="canonical"[^>]*>\s*/gi,
  /<meta\s+property="og:(?:type|url|title|description|image|image:type|image:width|image:height|image:alt|locale)"[^>]*>\s*/gi,
  /<meta\s+name="twitter:[^"]*"[^>]*>\s*/gi,
  /<meta\s+name="robots"[^>]*>\s*/gi,
];

/**
 * Lays a stored page into the app shell. Returns the finished document, or
 * null when either side is not what it should be (no markers in the page, no
 * empty root in the shell), in which case the caller serves the plain shell
 * and a person still gets the app.
 */
export function spliceShell(shellHtml, pageHtml) {
  const shell = String(shellHtml || '');
  const page = String(pageHtml || '');
  const head = between(page, HEAD_OPEN, HEAD_CLOSE);
  const body = between(page, BODY_OPEN, BODY_CLOSE);
  if (head == null || body == null) return null;
  const root = /<div id="root"><\/div>/;
  if (!root.test(shell) || !/<\/head>/i.test(shell)) return null;
  let out = shell;
  for (const re of SHELL_PAGE_TAGS) out = out.replace(re, '');
  const lang = /<html[^>]*\slang="([a-z]{2})"/i.exec(page)?.[1] || 'en';
  out = out.replace(/<html([^>]*)\slang="[^"]*"/i, `<html$1 lang="${lang}"`);
  out = out.replace(/<\/head>/i, `${HEAD_OPEN}${head}${HEAD_CLOSE}\n  </head>`);
  // A function replacement, so a "$&" or "$1" in page text is never read as a
  // pattern reference.
  out = out.replace(root, () => `<div id="root">${BODY_OPEN}${body}${BODY_CLOSE}</div>`);
  return out;
}

/** True when a stored page asks not to be indexed (a row below the floor). */
export function pageIsNoindex(pageHtml) {
  const head = between(String(pageHtml || ''), HEAD_OPEN, HEAD_CLOSE) || '';
  return /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(head);
}
