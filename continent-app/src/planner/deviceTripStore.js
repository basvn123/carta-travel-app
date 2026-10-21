/**
 * deviceTripStore.js, the one trip kept on this device without an account
 * (T500, roadmap 1.3c section 4, 2.19; owner T473 and T490-f).
 *
 * "Save trip" with no account writes the trip here, not into the draft
 * (carta.tripDraft.v1): the draft is the trip being worked on, this is the
 * trip the traveller chose to keep. One trip; a second one asks for the pass,
 * as a second account trip does.
 *
 * Shape: { v: 1, key, savedAt, trip } where trip is useTripPlanner's
 * snapshot (the draft's own fields) and key tells this trip from another.
 *
 * Every read and write is in try/catch: a private window or a full store
 * throws or keeps nothing, and the planner shows that the browser did not
 * keep the trip instead of claiming it did.
 */

export const DEVICE_TRIP_KEY = 'carta.deviceTrip.v1';

function store() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** The kept trip, or null when there is none or it cannot be read. */
export function loadDeviceTrip(storage = store()) {
  if (!storage) return null;
  try {
    const d = JSON.parse(storage.getItem(DEVICE_TRIP_KEY) || 'null');
    if (!d || !d.key || !d.trip || !Array.isArray(d.trip.stops) || !d.trip.stops.length) return null;
    return d;
  } catch {
    return null;
  }
}

/** A fresh key for a trip kept on this device. */
export function newDeviceKey() {
  return `dt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Keep a trip. Returns true only when the store gave the trip back as written,
 * so a browser that silently keeps nothing reads as a failure.
 */
export function saveDeviceTrip({ key, trip }, storage = store(), now = Date.now()) {
  if (!storage || !key || !trip) return false;
  const rec = { v: 1, key, savedAt: now, trip };
  try {
    const raw = JSON.stringify(rec);
    storage.setItem(DEVICE_TRIP_KEY, raw);
    return storage.getItem(DEVICE_TRIP_KEY) === raw;
  } catch {
    return false;
  }
}

export function clearDeviceTrip(storage = store()) {
  if (!storage) return;
  try { storage.removeItem(DEVICE_TRIP_KEY); } catch { /* private mode */ }
}

/**
 * What "Save trip" does without an account:
 *   'write'   no trip kept yet, or this IS the kept trip: keep it (again)
 *   'second'  another trip is already kept: a second trip asks for the pass
 */
export function deviceSaveDecision(stored, currentKey) {
  if (!stored) return 'write';
  return stored.key && stored.key === currentKey ? 'write' : 'second';
}

/**
 * A device trip meets an account at sign-in (T490-f):
 *   'none'    nothing kept on the device
 *   'move'    the account has room (no trip yet, or a pass): move it across
 *   'choose'  the account already holds a trip on the free plan: the
 *             traveller chooses which one to keep
 */
export function deviceMeetsAccount(stored, accountTripCount, paid) {
  if (!stored) return 'none';
  if (paid || !(accountTripCount > 0)) return 'move';
  return 'choose';
}
