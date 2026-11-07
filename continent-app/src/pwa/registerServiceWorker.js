/**
 * registerServiceWorker.js, the one place the app registers public/sw.js
 * (T1169, ROADMAP I7; moved here from main.jsx).
 *
 * Production only: the dev server serves /src and has no built worker.
 * Once the worker is ready, the page tells it which files it already loaded
 * before the worker took over (the boot index, region shards, the detail
 * file of a saved trip), so the first visit is enough for the shell and a
 * saved trip to open offline. The worker applies its own rules to that list:
 * the API and the account are never stored.
 */

/** Same-origin and data-host URLs the page has fetched so far. */
export function loadedUrls(perf = globalThis.performance, origin = globalThis.location?.origin) {
  if (!perf || typeof perf.getEntriesByType !== 'function' || !origin) return [];
  const out = new Set();
  for (const e of perf.getEntriesByType('resource')) {
    let url;
    try { url = new URL(e.name); } catch { continue; }
    if (url.origin !== origin && url.hostname !== 'data.carta-europetravel.com') continue;
    if (url.pathname.startsWith('/api/')) continue;
    out.add(url.href);
  }
  return [...out];
}

/** Ask the active worker to keep what the page already loaded. */
export function warmCache(sw = globalThis.navigator?.serviceWorker) {
  if (!sw || !sw.ready) return Promise.resolve(false);
  return sw.ready.then((reg) => {
    const worker = reg && reg.active;
    if (!worker) return false;
    worker.postMessage({ type: 'carta:warm', urls: loadedUrls() });
    return true;
  }).catch(() => false);
}

export function registerServiceWorker({ prod = import.meta.env.PROD } = {}) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || !prod) return;
  // A new worker (skipWaiting + clients.claim in sw.js) takes the page over
  // while it is open; one reload then serves everything from the new cache.
  // Only when a controller is being REPLACED: the first install of all has
  // no previous controller and must not reload the page it just loaded.
  let reloading = false;
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(() => warmCache())
      .catch((err) => { console.warn('Service worker registration failed:', err); });
  });
}
