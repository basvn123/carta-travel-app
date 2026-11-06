/**
 * flowMemory.js (T1123, ROADMAP G4): where the traveller stood in the plan
 * flow, kept for this tab's session, so a reload (or a tab hop that remounts
 * the screen) lands on the same question or on the same priced trips
 * instead of the Plan opening or the trip's empty home.
 *
 * Two places are kept, each tied to the device trip it belongs to
 * (tripsStore's active id), so another trip never inherits them:
 *   opening   PlanFlow's setup screen ({ screen, kindAsked })
 *   trip      TripFlow's phase ({ phase, walked, quick })
 *
 * The answers themselves already live in the planner draft (useTripSettings);
 * this holds only the screen. Session storage, so a new tab or a new day
 * starts at the opening; a blocked storage falls back to this module's
 * memory. Every function takes the storage, so tests pass a fake one.
 */
export const FLOW_PLACE_KEY = 'carta.plan.place.v1';

let memory = {};

export function sessionStore() {
  try { return typeof window !== 'undefined' ? window.sessionStorage : null; } catch { return null; }
}

function readAll(storage) {
  if (!storage) return memory;
  try {
    const v = JSON.parse(storage.getItem(FLOW_PLACE_KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch { return memory; }
}

function writeAll(storage, all) {
  memory = all;
  if (!storage) return;
  try { storage.setItem(FLOW_PLACE_KEY, JSON.stringify(all)); } catch { /* memory holds it */ }
}

/** Keep (or with value null, forget) one place for this trip. */
export function rememberPlace(where, tripId, value, storage = sessionStore()) {
  const all = { ...readAll(storage) };
  if (value == null || !tripId) delete all[where];
  else all[where] = { ...value, trip: String(tripId) };
  writeAll(storage, all);
}

/**
 * The kept place for this trip, or null: another trip's place, a screen the
 * caller no longer offers (`allowed`, the screens valid now) and a broken
 * entry all read as nothing kept.
 */
export function recallPlace(where, tripId, allowed, storage = sessionStore()) {
  const v = readAll(storage)[where];
  if (!v || !tripId || v.trip !== String(tripId)) return null;
  const at = v.screen || v.phase;
  if (!at || (allowed && !allowed.includes(at))) return null;
  return v;
}

/** Tests only: forget the memory fallback. */
export function resetFlowMemory() { memory = {}; }
