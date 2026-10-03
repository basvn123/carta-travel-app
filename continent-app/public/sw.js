/* ─────────────────────────────────────────────────────────────────────────
   Carta service worker: makes the app installable and usable offline.

   Strategy (GET on this origin or the data host; anything else passes through):
     • navigations      → network-first, fall back to the cached app shell
     • /boot.json       → stale-while-revalidate (instant repeat opens; see below)
     • /dest/*.json     → stale-while-revalidate, one cached copy per path (per
                          region shard, and one of the rank tier)
     • /{layer}/*.json  → network-first: these list per-item files by id, and a
                          stale list names ids the last export deleted
     • /assets/* hashed → cache-first (Vite fingerprints these; safe forever)
     • everything else  → stale-while-revalidate

   Bump CACHE_VERSION whenever the shell/precache list changes so old caches are
   cleaned out on activate.
   ───────────────────────────────────────────────────────────────────────── */
// v4: the content-layer wires moved from stale-while-revalidate to network
// first, and the bump is what evicts the stale country files already cached
// under v3, which are the ones naming trips that no longer exist.
// v5: cycling joined that list (it had been left out), and the bump is what
// evicts the cycling wires cached under v4: EuroVelo manifests whose every
// section was still called "EV1", and country files from before the export
// carried evidence on listed rows.
// v7: the boot index and the per-country files replaced app_data.json (T054),
// and the bump is what evicts the ~13 MB app_data.json cached under v6, which
// nothing requests any more.
const CACHE_VERSION = 'carta-v7';

// The data host the shards move to (CARTA_CLOUD_ARCHITECTURE.md 5.2, T054).
// Its objects sit under /data/ in the bucket; the prefix is stripped before
// the path rules below, so a shard gets the same treatment on either host.
// Listed here because this file is served as is, not built, so it cannot
// read VITE_DATA_BASE; keep it in step with the CSP's connect-src.
const DATA_ORIGINS = ['https://data.carta-europetravel.com'];

// The card half of every published layer. Deliberately NOT the per-item detail
// files (/trips/trip/*.json and friends): those are immutable for as long as
// their id exists, so serving one from cache is always correct.
// `cycling` was missing from this list, so its country files and index were
// served stale-while-revalidate while every other layer was network first:
// a browser that had opened the tab once kept showing the previous export
// until the cache happened to turn over.
//
// `cycling/family/*.json` is included deliberately even though it is nested
// one level deeper, because a EuroVelo family is a MANIFEST, not a detail
// file: it is recomposed on every export from whatever is published, so it
// changes exactly when the country files do. The per-route and per-tour
// details below it stay out, as those really are immutable per id.
const LAYER_WIRE =
  /^\/(trips|beaches|lakes|mountains|trails|cycling)\/[^/]+\.json$/;
const FAMILY_WIRE = /^\/cycling\/family\/[^/]+\.json$/;
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      // Take the open pages over at once. Without this the new worker sat
      // waiting behind the old one until every tab closed, which is why a
      // version bump used to need a hard reload to be seen; main.jsx reloads
      // once when control changes hands.
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh && fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}

// A shard is requested as /dest/<key>.json?v=<content hash>, so every weekly
// build adds a new URL. Keep exactly one per path: the entry being written
// replaces its siblings with the same path and another hash. The key is a
// region shard since T059 (a small country whole, a big one as grid tiles,
// "IT_1_41_12"), not a country, and /dest/_rank.json (T271) is one more path
// under the same rule. The cached boot index (itself stale-while-revalidate)
// still names the hashes that are cached, so offline the two halves match;
// the rank tier also carries the boot index's key and is ignored on a
// mismatch, so a stale pairing costs the fast first paint, never the data.
async function staleWhileRevalidateOnePerPath(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then(async (fresh) => {
      if (fresh && fresh.ok) {
        const old = await cache.keys(request, { ignoreSearch: true });
        await Promise.all(old.filter((k) => k.url !== request.url).map((k) => cache.delete(k)));
        await cache.put(request, fresh.clone());
      }
      return fresh;
    })
    .catch(() => cached);
  return cached || network;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((fresh) => {
      if (fresh && fresh.ok) cache.put(request, fresh.clone());
      return fresh;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const dataHost = DATA_ORIGINS.includes(url.origin);
  if (!sameOrigin && !dataHost) return; // let cross-origin (fonts, tiles) pass through
  const path = dataHost ? url.pathname.replace(/^\/data(?=\/)/, '') : url.pathname;

  if (sameOrigin && request.mode === 'navigate') {
    event.respondWith(networkFirst(request).catch(() => caches.match('/index.html')));
    return;
  }
  // activities_full.json is ~33 MB. Cached alongside app_data.json (~13 MB)
  // and the fares slices, one visitor who opens the day planner pushes ~50 MB
  // into Cache Storage. iOS Safari evicts an origin's storage all at once, so
  // that takes the app SHELL with it and offline silently stops working - to
  // save a file the day planner re-fetches anyway. Network-only; the browser
  // HTTP cache still covers repeat visits.
  if (path === '/activities_full.json') return;

  if (path.startsWith('/dest/')) {
    event.respondWith(staleWhileRevalidateOnePerPath(request));
    return;
  }
  if (path === '/boot.json'
      || path === '/country_insights.json' || path.startsWith('/fares/')) {
    // Stale-while-revalidate: repeat visits render instantly from cache while
    // a fresh copy downloads in the background (network-first made every
    // return visit wait out the multi-MB download again). Data one harvest
    // stale for one visit is a fine trade for an instant open.
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  // The published content layers are CROSS-REFERENCING wires: a country file
  // lists cards by id and each card points at /{layer}/trip/{id}.json. Served
  // stale-while-revalidate the two halves go stale independently, so a cached
  // country file from last month names ids that this month's export deleted,
  // and the page says the trip stopped passing its checks when it simply no
  // longer exists. The list has to be current or its links are lies. Network
  // first still falls back to the cache, so offline keeps working.
  if (LAYER_WIRE.test(path) || FAMILY_WIRE.test(path)) {
    event.respondWith(networkFirst(request));
    return;
  }
  if (sameOrigin && url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});
