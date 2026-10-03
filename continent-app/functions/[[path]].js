/**
 * The one Pages Function (T221, owner decision T272 on row T205-a).
 *
 * A crawler that asks for /spain/trails/176172-estels-del-sud gets that trail
 * as readable HTML: title, description, canonical, JSON-LD, the facts and the
 * links, inside the normal app shell. A person gets the same document, and the
 * app boots over it as it does on any other path (src/lib/pathBoot.js turns
 * the path into the entity the app opens).
 *
 * Why a Function and not files in the deploy: Pages refuses more than 20,000
 * files, and the catalogue is about 32,000 pages. The pages live in their own
 * R2 bucket (binding PRERENDER in wrangler.toml), which no custom domain
 * exposes, so the same HTML is never reachable on a second host.
 *
 * Which requests reach this file is decided by public/_routes.json: only the
 * country prefixes, /trips/*, /journeys/*, the cards and the sitemaps. The shell, the assets and the
 * boot index never invoke it, so they never count against the daily Functions
 * request allowance.
 *
 * Every failure falls through to next(), the static deploy: no binding, no
 * object for the key, a shell without the expected root. Pages then serves
 * 404.html (a copy of index.html, T294-a), so a person still gets the app and
 * a crawler gets an honest 404 for a page that does not exist. Deploying this
 * file before the bucket is filled therefore changes nothing a person sees.
 *
 * Headers. Pages does not apply public/_headers to a Function's own response,
 * so the response starts from the headers of the shell it was built from,
 * which the static server did apply them to (the CSP and the five security
 * headers). If the shell ever arrives without a Content-Security-Policy the
 * Function refuses to serve the page rather than serve it unprotected.
 */
import {
  prerenderKey, cardKey, sitemapKey, spliceShell, pageIsNoindex,
} from '../src/lib/prerenderShell.js';

const HTML = 'text/html; charset=utf-8';

/** A page's share card from the same bucket. A card changes only when its
 *  record does, and previewers fetch it rarely, so a day of caching is safe. */
async function serveCard(env, key, method, next) {
  if (!env.PRERENDER) return next();
  let obj;
  try { obj = await env.PRERENDER.get(key); } catch { return next(); }
  if (!obj) return next();
  return new Response(method === 'HEAD' ? null : obj.body, {
    status: 200,
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=86400',
      'x-content-type-options': 'nosniff',
    },
  });
}

/** A sitemap file from the same bucket (T222). The deploy's static
 *  public/sitemap.xml is the fallback while the bucket holds none. The
 *  Function's own response gets no _headers, so the caching is set here. */
async function serveSitemap(env, key, method, next) {
  if (!env.PRERENDER) return next();
  let obj;
  try { obj = await env.PRERENDER.get(key); } catch { return next(); }
  if (!obj) return next();
  return new Response(method === 'HEAD' ? null : obj.body, {
    status: 200,
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
    },
  });
}

export async function onRequest(context) {
  const { request, env, next } = context;
  if (request.method !== 'GET' && request.method !== 'HEAD') return next();
  const url = new URL(request.url);
  const sitemap = sitemapKey(url.pathname);
  if (sitemap) return serveSitemap(env, sitemap, request.method, next);
  const card = cardKey(url.pathname);
  if (card) return serveCard(env, card, request.method, next);
  // A dotted last segment is a file (a shard on a same-origin build, a
  // favicon probe); never a page.
  if (/\.[a-z0-9]{1,8}$/i.test(url.pathname)) return next();
  const key = prerenderKey(url.pathname);
  if (!key || !env.PRERENDER) return next();

  let page;
  let shellRes;
  try {
    const [obj, shell] = await Promise.all([
      env.PRERENDER.get(key),
      env.ASSETS.fetch(new Request(new URL('/', url), { headers: { accept: 'text/html' } })),
    ]);
    if (!obj || !shell.ok) return next();
    page = await obj.text();
    shellRes = shell;
  } catch {
    return next();
  }
  if (!shellRes.headers.get('content-security-policy')) return next();
  const html = spliceShell(await shellRes.text(), page);
  if (!html) return next();

  const headers = new Headers(shellRes.headers);
  headers.set('content-type', HTML);
  headers.delete('content-length');
  headers.delete('etag');
  headers.delete('content-encoding');
  // The document embeds this deploy's asset names, so it must not outlive it.
  headers.set('cache-control', 'public, max-age=0, must-revalidate');
  headers.set('x-carta-prerender', key);
  if (pageIsNoindex(page)) headers.set('x-robots-tag', 'noindex');
  return new Response(request.method === 'HEAD' ? null : html, { status: 200, headers });
}
