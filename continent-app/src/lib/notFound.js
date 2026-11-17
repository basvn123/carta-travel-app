/**
 * Which addresses have no page (house style G1, 2026-11, the brand lane's
 * 404). Pages answers an unknown path with 404.html, a copy of the app
 * shell (scripts/build-pages.mjs), so before this the app opened the bare
 * map at an address that means nothing. Now that address shows the 404
 * view; every path the app understands behaves exactly as before.
 *
 * Unknown means: not `/`, not a language root (`/nl/`), not the shell's own
 * file, and not a path lib/urlScheme.js parses (countries, places, weeks,
 * trips, journeys, guides, in any language). A path the scheme parses but
 * the client cannot open on the bare shell keeps today's behaviour.
 *
 * Read after lib/pathBoot.js has run (it is imported first in main.jsx), so
 * /pricing and every path it turns into a hash are already `/` by then.
 */
import { parsePath } from './urlScheme.js';
import { langFromPath } from './langPath.js';

export function isUnknownPath(pathname) {
  const p = String(pathname || '/');
  if (p === '/' || p === '/index.html' || p === '/404.html') return false;
  const lang = langFromPath(p);
  if (lang && (p === `/${lang}` || p === `/${lang}/`)) return false;
  return parsePath(p) == null;
}
