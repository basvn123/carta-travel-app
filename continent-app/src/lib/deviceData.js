/**
 * This device's copy of a traveller's own things, and how to remove it (T1054,
 * ROADMAP N5, audit P-09).
 *
 * Carta keeps trips, plans, bookings, lists and companions in local storage so
 * they work signed out. Signing out does not touch them, which is right on the
 * traveller's own phone and wrong on a shared one: the next person would see
 * the bookings and the crew. They are not all in the account either (device
 * trips in carta.trips.v1 never move to it), so clearing them on every sign-out
 * would lose real work. Sign-out therefore asks, and this module does the
 * removal when the answer is yes.
 *
 * The list is the "your things" group of components/CookiesPage.jsx, which
 * documents every key. Settings (language, map state, folds, filters) and
 * one-off notes stay: they say nothing about the person. Add a key here when
 * you add one to "your things" there. The address mirror (continent.state.v1)
 * goes whole: it mixes view filters with the home point and the shortlist,
 * and a clean start is truer than a scrub that keeps unlisted keys.
 */
import { deviceKeys } from './stateKeys.js';

/** Exact keys, and prefixes ending in '.' or ':' that cover a family of keys.
 * Read from the one state table (lib/stateKeys.js): every key whose scope is
 * `person`. Add a key there, and to "your things" on the Cookies page. */
export const DEVICE_THING_KEYS = deviceKeys();

/** IndexedDB databases that hold the traveller's own files. */
export const DEVICE_THING_DATABASES = ['carta-files'];

/** True when a storage key is one of the traveller's own things. */
export function isDeviceThing(key) {
  if (typeof key !== 'string') return false;
  return DEVICE_THING_KEYS.some((k) => (
    k.endsWith('.') || k.endsWith(':') ? key.startsWith(k) : key === k
  ));
}

function keysOf(storage) {
  const out = [];
  if (!storage) return out;
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const k = storage.key(i);
      if (k != null) out.push(k);
    }
  } catch { /* storage blocked: nothing to list */ }
  return out;
}

/**
 * Remove this device's copy of the traveller's things from the given storages
 * (local and session by default) and delete the file database. Returns the
 * number of storage keys removed. Never throws: a blocked storage is skipped.
 */
export function clearDeviceThings({
  storages = [globalThis.localStorage, globalThis.sessionStorage],
  indexedDB = globalThis.indexedDB,
} = {}) {
  let removed = 0;
  for (const storage of storages) {
    for (const k of keysOf(storage).filter(isDeviceThing)) {
      try { storage.removeItem(k); removed += 1; } catch { /* skip */ }
    }
  }
  if (indexedDB && typeof indexedDB.deleteDatabase === 'function') {
    for (const name of DEVICE_THING_DATABASES) {
      try { indexedDB.deleteDatabase(name); } catch { /* skip */ }
    }
  }
  return removed;
}
