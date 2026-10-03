/**
 * Boot-time path handling (T223). Runs once, before React and before the nine
 * hash readers (trails.js, beaches.js, and the rest) look at the address.
 *
 * Direction one, always on: a content path from lib/urlScheme.js (for example
 * /spain/trails/176172-estels-del-sud) is turned into the legacy boot hash the
 * readers already understand, and the address bar goes back to `/`. Cloudflare
 * Pages answers an unknown path with index.html, so a path link opens the right
 * entity today, and keeps opening it once the prerender serves real HTML there.
 * A destination path opens its destination when the prerendered page says
 * which id it is (prerenderedBoot below); on the bare shell it is left alone,
 * since the client has no slug to id table (docs/SEO.md).
 *
 * Direction two, off until the prerender is live (VITE_PATH_URLS=1): a legacy
 * hash link is a one-shot redirect to its path, so a link shared before the
 * change lands on the indexable URL. Off by default because, with no
 * prerendered HTML behind the path, the redirect would only add a reload.
 *
 * Neither direction can loop: the first consumes the path, the second runs only
 * on a bare `/` carrying one of our own hashes, and lands on a path that the
 * first direction then consumes.
 */
import { parsePath, pathToLegacyHash, legacyHashToPath } from './urlScheme.js';

/**
 * A destination path names the dossier slug and the app opens a destination by
 * its airport or gem id, which only the page knows (T223-a). The prerendered
 * page (T221) carries the id as <meta name="carta:boot" content="#dest=...">;
 * only a #dest= value is accepted, so the tag can never open anything else.
 */
function prerenderedBoot(doc) {
  const v = doc?.querySelector?.('meta[name="carta:boot"]')?.getAttribute('content') || '';
  return /^#dest=(gem%3A[a-z0-9-]{1,60}|[A-Z]{3})$/.test(v) ? v : null;
}

export function bootPaths(loc = window.location, hist = window.history, flagOn = false, doc = globalThis.document) {
  try {
    const path = loc.pathname || '/';
    if (path !== '/') {
      const parsed = parsePath(path);
      // A destination's week page (T224) opens the destination it prices.
      const hash = pathToLegacyHash(parsed)
        || (parsed?.kind === 'dest' || parsed?.kind === 'cost' ? prerenderedBoot(doc) : null);
      if (hash && !(loc.hash || '').includes('=')) {
        hist.replaceState(null, '', `/${loc.search || ''}${hash}`);
        return 'path-to-hash';
      }
      return 'none';
    }
    if (flagOn) {
      const target = legacyHashToPath(loc.hash);
      if (target) {
        loc.replace(`${target}${loc.search || ''}`);
        return 'hash-to-path';
      }
    }
  } catch { /* the app still opens at the address it was given */ }
  return 'none';
}

if (typeof window !== 'undefined') {
  bootPaths(window.location, window.history, import.meta.env.VITE_PATH_URLS === '1');
}
