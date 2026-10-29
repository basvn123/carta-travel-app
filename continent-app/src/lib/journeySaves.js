/**
 * Carta's own trips a traveller saved (T824): the bookmark on each card of
 * Carta's trips page. Ids only, kept on this device with a change event so
 * every card and the Saved filter move together. Light on purpose: no
 * engine, no flight files.
 */
import { useSyncExternalStore } from 'react';

export const SAVES_KEY = 'carta.savedJourneys.v1';
const EVENT = 'carta:journey-saves';
const MAX = 200;

const store = () => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };
let cache = null;
function read() {
  if (cache) return cache;
  try {
    const v = JSON.parse(store()?.getItem(SAVES_KEY) ?? '[]');
    cache = Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch { cache = []; }
  return cache;
}
function write(list) {
  cache = list.slice(0, MAX);
  try { store()?.setItem(SAVES_KEY, JSON.stringify(cache)); } catch { /* full or blocked: this visit only */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

export function savedJourneys() { return read(); }
export function isSavedJourney(id) { return read().includes(id); }
export function toggleSavedJourney(id) {
  const list = read();
  write(list.includes(id) ? list.filter((x) => x !== id) : [id, ...list]);
}

function subscribe(fn) {
  if (typeof window === 'undefined') return () => {};
  const other = (e) => { if (!e.key || e.key === SAVES_KEY) { cache = null; fn(); } };
  window.addEventListener(EVENT, fn);
  window.addEventListener('storage', other);
  return () => { window.removeEventListener(EVENT, fn); window.removeEventListener('storage', other); };
}

/** The saved ids, kept current. */
export function useSavedJourneys() {
  return useSyncExternalStore(subscribe, read, () => []);
}
