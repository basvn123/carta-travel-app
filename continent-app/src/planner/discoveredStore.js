/**
 * discoveredStore.js, the towns Carta researched on request.
 *
 * When a traveller asks for a place the catalogue doesn't hold, cityResearch.js
 * builds a destination record for it (see that file for the sources). The
 * record lands here and is merged into the day planner's destination map, so
 * from that moment the town behaves like any other: it has a pin, a POI list, a
 * search entry, and days can be planned in it.
 *
 * Device-local, like day plans themselves (they work for guests, with no
 * account and no Supabase round trip). A saved plan stores only the town's id,
 * so keeping the record here is what makes that id resolvable on the next
 * visit. Nothing is ever written back into app_data.json: the catalogue stays
 * the pipeline's, and a researched town is clearly marked as this device's.
 */

const KEY = 'carta.discovered.v1';
// A researched town is a snapshot of open data. Past this it is re-researched
// on next use rather than shown as current.
const MAX_AGE_DAYS = 180;

const listeners = new Set();

/** cb() on every write. Returns an unsubscribe function. */
export function subscribeDiscovered(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notify() {
  listeners.forEach((cb) => {
    try { cb(); } catch { /* one bad listener never blocks the rest */ }
  });
}

function read() {
  if (typeof window === 'undefined') return {};
  try {
    const m = JSON.parse(window.localStorage.getItem(KEY) || '{}');
    return m && typeof m === 'object' && !Array.isArray(m) ? m : {};
  } catch {
    return {};
  }
}

function write(map) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map));
  } catch { /* quota or private mode: the town still works this session */ }
}

/** Every researched town as { id: dest }, ready to spread into the catalogue. */
export function loadDiscovered() {
  const map = read();
  const out = {};
  Object.entries(map).forEach(([id, dest]) => {
    if (dest && typeof dest === 'object' && dest.city) out[id] = dest;
  });
  return out;
}

/** Is this record old enough to be worth harvesting again? */
export function isStale(dest) {
  const at = Date.parse(dest?.discovered?.at || '');
  if (!Number.isFinite(at)) return true;
  return (Date.now() - at) / 86400000 > MAX_AGE_DAYS;
}

/** Store (or refresh) a researched town. Returns its id. */
export function saveDiscovered(dest) {
  if (!dest?.id) return null;
  const map = read();
  map[dest.id] = dest;
  write(map);
  notify();
  return dest.id;
}

export function removeDiscovered(id) {
  const map = read();
  if (!(id in map)) return;
  delete map[id];
  write(map);
  notify();
}
