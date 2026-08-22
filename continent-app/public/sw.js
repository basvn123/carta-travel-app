/* ─────────────────────────────────────────────────────────────────────────
   Carta service worker: makes the app installable and usable offline.

   Strategy (same-origin GET only; cross-origin requests pass straight through):
     • navigations      → network-first, fall back to the cached app shell
     • /app_data.json   → network-first (fresh fares win), fall back to cache
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
const CACHE_VERSION = 'carta-v4';

// The card half of every published layer. Deliberately NOT the per-item detail
// files (/trips/trip/*.json and friends): those are immutable for as long as
// their id exists, so serving one from cache is always correct.
const LAYER_WIRE = /^\/(trips|beaches|lakes|mountains|trails)\/[^/]+\.json$/;
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
  if (url.origin !== self.location.origin) return; // let cross-origin (fonts, tiles) pass through

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request).catch(() => caches.match('/index.html')));
    return;
  }
  if (url.pathname === '/app_data.json' || url.pathname === '/activities_full.json'
      || url.pathname === '/country_insights.json' || url.pathname.startsWith('/fares/')) {
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
  if (LAYER_WIRE.test(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});
