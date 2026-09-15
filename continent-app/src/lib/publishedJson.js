/**
 * publishedJson.js — the one fetch under every published layer.
 *
 * beaches, lakes, mountains, trails, trips, cycling and regions each carried
 * a byte-identical copy of isJson/loadJson/cached. They also carried the same
 * bug: `.catch(() => null)` folded a dropped connection into the same answer
 * as a file that is legitimately not published. The consumer coerced that
 * null to [] and the tab said "nothing here matches", which is a factual
 * claim about the catalogue, when the truth was that the request never
 * arrived. Worse, the re-fetch guards read `if (rows) return;` and [] is
 * truthy, so the tab never tried again for the life of the session.
 *
 * So there are three outcomes now, not two:
 *
 *   data   the file was fetched and parsed
 *   null   ABSENT. This layer is not published for that country. Under
 *          public/ a missing JSON is served as the SPA index with status
 *          200 and r.json() throws on "<!doctype", so a 404 and a
 *          wrong-content-type answer both mean the same thing: no file.
 *   throw  a LayerFetchError. The network failed, or the server answered
 *          5xx. Nothing is known about the catalogue. Say so, and offer
 *          the traveller a retry.
 *
 * Absent answers are cached, because a layer that is not published will not
 * become published inside a session. Failures are NOT cached: the whole point
 * of distinguishing them is that retrying is worth something.
 */

export class LayerFetchError extends Error {
  constructor(url, cause) {
    super(`could not load ${url}`);
    this.name = 'LayerFetchError';
    this.url = url;
    this.cause = cause;
  }
}

/** True when the response carries a JSON body we can parse. */
function isJson(res) {
  return res.ok && (res.headers.get('content-type') || '').includes('json');
}

/**
 * One published file. Resolves the parsed body, resolves null when the file
 * is not published, and REJECTS with a LayerFetchError when the request
 * itself failed.
 */
export function fetchPublished(url) {
  return fetch(url).then(
    (r) => {
      // 5xx is the server falling over, not a missing file: a layer that is
      // genuinely unpublished answers 200-with-index or 404, never 503.
      if (r.status >= 500) throw new LayerFetchError(url, new Error(`http ${r.status}`));
      if (!isJson(r)) return null;
      // A body that will not parse is a broken file, not a broken network.
      // Treat it as absent so one bad export cannot wedge the tab behind a
      // retry button that can never succeed.
      return r.json().catch(() => null);
    },
    (cause) => { throw new LayerFetchError(url, cause); },
  );
}

/**
 * Per-URL cache. Published files never change inside a session, so a
 * resolved promise is kept; a rejected one is evicted so the next caller
 * (a retry button, a re-entered tab) actually goes back to the network.
 */
export function makeCache() {
  const cache = new Map();
  return function cached(url) {
    if (!cache.has(url)) {
      cache.set(url, fetchPublished(url).catch((e) => {
        cache.delete(url);
        throw e;
      }));
    }
    return cache.get(url);
  };
}
