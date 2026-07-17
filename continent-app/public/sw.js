/* ─────────────────────────────────────────────────────────────────────────
   Carta service worker: makes the app installable and usable offline.

   Strategy (same-origin GET only; cross-origin requests pass straight through):
     • navigations      → network-first, fall back to the cached app shell
     • /app_data.json   → network-first (fresh fares win), fall back to cache
     • /assets/* hashed → cache-first (Vite fingerprints these; safe forever)
     • everything else  → stale-while-revalidate

   Bump CACHE_VERSION whenever the shell/precache list changes so old caches are
   cleaned out on activate.
   ───────────────────────────────────────────────────────────────────────── */
const CACHE_VERSION = 'carta-v2';
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
      || url.pathname === '/country_insights.json') {
    event.respondWith(networkFirst(request));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});
