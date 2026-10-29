/**
 * tripsStore.js (T809), the trips kept on this device: every trip a traveller
 * starts in Plan, guests included, so the Plan home can list them and a new
 * trip never writes over the last one.
 *
 * The app still plans ONE trip at a time, in the keys below (the planner
 * draft with the trip settings, the trip draft, and the day plans of a trip
 * not saved yet). A list entry is a snapshot of those keys, raw strings as
 * stored, with a short summary for the card. Switching trips snapshots the
 * open one, writes the target's keys back and tells the stores to read
 * again (onTripSwitch, which plannerStore.reload answers; App remounts the
 * planner tabs on the active id, as useTripPlanner reads its draft once on
 * mount).
 *
 * Record: { v: 1, activeId, trips: [{ id, keys, meta, updatedAt }] }.
 * The trip kept without an account (deviceTripStore) is not a trip key: it
 * is the one trip "Save trip" keeps, and its free-plan rule stays its own.
 *
 * Every function takes the storage as its last argument (deviceTripStore's
 * pattern) so the node test runs them on a plain object.
 */

export const TRIPS_KEY = 'carta.trips.v1';

/** The keys that together are "the trip in progress". */
export const TRIP_KEYS = [
  'carta.plannerDraft.v1',
  'carta.tripDraft.v1',
  // dayPlanStore's sidecars for the unsaved trip (TRIP_DRAFT_PLAN_ID).
  'carta.dayplan.tripdraft',
  'carta.dayprefs.tripdraft',
  'carta.tripextras.tripdraft',
];

function local() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function parse(raw) {
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export function newTripId(now = Date.now()) {
  return `tr-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** The trip keys as stored right now, only those that hold something. */
export function readKeys(storage) {
  const out = {};
  if (!storage) return out;
  for (const k of TRIP_KEYS) {
    try {
      const v = storage.getItem(k);
      if (v != null) out[k] = v;
    } catch { /* blocked */ }
  }
  return out;
}

/**
 * The card's facts from a set of keys: name, cover, dates or months,
 * nights, the stops' ids, status ('planning' with no stops yet, 'planned'
 * with a route), the account plan and device key it carries.
 */
export function summarize(keys = {}) {
  const pd = parse(keys['carta.plannerDraft.v1']) || {};
  const td = parse(keys['carta.tripDraft.v1']) || {};
  const s = pd.settings || {};
  const tr = s.trip || {};
  const w = s.when || {};
  const stops = (Array.isArray(td.stops) ? td.stops : []).filter((x) => x && x.destinationId);
  const answered = Array.isArray(s.answered) ? s.answered : [];
  const stopNights = stops.reduce((n, x) => n + (Number(x.nights) || 0), 0);
  const nights = stopNights || (answered.includes('when') ? Number(w.nights) || null : null);
  return {
    name: String(tr.name || td.planLabel || ''),
    cover: String(tr.cover || ''),
    start: td.tripStart || w.start || '',
    end: td.tripEnd || w.end || '',
    months: w.mode === 'months' && Array.isArray(w.months) ? w.months : [],
    nights,
    stops: stops.map((x) => String(x.destinationId)),
    status: stops.length ? 'planned' : 'planning',
    planId: td.planId || null,
    deviceKey: td.deviceKey || null,
    created: Number(tr.created) || 0,
  };
}

/** A trip worth listing: created in the flow, given stops, or an account plan. */
export function hasContent(keys) {
  const m = summarize(keys);
  return Boolean(m.created || m.stops.length || m.planId);
}

function readRec(storage) {
  let rec = null;
  try { rec = parse(storage?.getItem(TRIPS_KEY)); } catch { rec = null; }
  if (!rec || rec.v !== 1 || !Array.isArray(rec.trips)) return null;
  return rec;
}

function writeRec(storage, rec) {
  try { storage?.setItem(TRIPS_KEY, JSON.stringify(rec)); return true; } catch { return false; }
}

function clearKeys(storage) {
  for (const k of TRIP_KEYS) {
    try { storage?.removeItem(k); } catch { /* blocked */ }
  }
}

/**
 * The record, made the first time it is asked for. A device that already
 * holds one trip in progress (every device before T809) gets it as the
 * first entry, so nothing is lost on the way to the list.
 */
export function ensure(storage = local(), now = Date.now()) {
  const had = readRec(storage);
  if (had) return had;
  const rec = { v: 1, activeId: newTripId(now), trips: [] };
  const keys = readKeys(storage);
  if (hasContent(keys)) rec.trips.push({ id: rec.activeId, keys, meta: summarize(keys), updatedAt: now });
  writeRec(storage, rec);
  return rec;
}

/**
 * The open trip written into its entry. A trip with nothing in it yet has no
 * entry (a Start planning left at the first sheet lists nothing); one that
 * changed takes the new time, so the list keeps the latest work first.
 */
export function snapshotActive(storage = local(), now = Date.now()) {
  const rec = ensure(storage, now);
  const keys = readKeys(storage);
  const i = rec.trips.findIndex((x) => x.id === rec.activeId);
  if (!hasContent(keys)) {
    if (i >= 0) { rec.trips.splice(i, 1); writeRec(storage, rec); }
    return rec;
  }
  const prev = i >= 0 ? rec.trips[i] : null;
  if (prev && JSON.stringify(prev.keys) === JSON.stringify(keys)) return rec;
  const entry = { id: rec.activeId, keys, meta: summarize(keys), updatedAt: now };
  if (i >= 0) rec.trips[i] = entry; else rec.trips.push(entry);
  writeRec(storage, rec);
  return rec;
}

/** Every trip, the latest work first, each { id, meta, updatedAt, active }. */
export function listTrips(storage = local(), now = Date.now()) {
  const rec = snapshotActive(storage, now);
  return rec.trips
    .map((x) => ({ id: x.id, meta: x.meta || summarize(x.keys), updatedAt: x.updatedAt || 0, active: x.id === rec.activeId }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Open one trip: the open one kept, the target's keys written back. */
export function openTrip(id, storage = local(), now = Date.now()) {
  const rec = snapshotActive(storage, now);
  if (id === rec.activeId) return false;
  const target = rec.trips.find((x) => x.id === id);
  if (!target) return false;
  clearKeys(storage);
  for (const [k, v] of Object.entries(target.keys || {})) {
    try { storage?.setItem(k, v); } catch { /* full */ }
  }
  rec.activeId = id;
  writeRec(storage, rec);
  return true;
}

/** A new trip: the open one kept in the list, the trip keys cleared. */
export function startNewTrip(storage = local(), now = Date.now()) {
  const rec = snapshotActive(storage, now);
  clearKeys(storage);
  rec.activeId = newTripId(now);
  writeRec(storage, rec);
  return rec.activeId;
}

/**
 * The entry a match picks (an account plan id, a device key), opened; with
 * none, a new trip, so loading a saved trip never writes over another one.
 * Returns true when the open trip changed.
 */
export function openOrStart(match, storage = local(), now = Date.now()) {
  const rec = snapshotActive(storage, now);
  const hit = rec.trips.find((x) => match(x.meta || summarize(x.keys)));
  if (hit) return openTrip(hit.id, storage, now);
  const open = rec.trips.find((x) => x.id === rec.activeId);
  if (!open) return false; // the open trip is empty: load into it
  startNewTrip(storage, now);
  return true;
}

/** Delete one trip from this device. Deleting the open one leaves a new, empty trip open. */
export function deleteTrip(id, storage = local(), now = Date.now()) {
  const rec = snapshotActive(storage, now);
  rec.trips = rec.trips.filter((x) => x.id !== id);
  if (id === rec.activeId) {
    clearKeys(storage);
    rec.activeId = newTripId(now);
  }
  writeRec(storage, rec);
  return rec.activeId;
}

export function activeTripId(storage = local()) {
  return ensure(storage).activeId;
}

/* ---- The app's one store: the same calls with a change signal ---- */

const listeners = new Set();
const reloaders = new Set();
let activeCache = null;

/** A store that holds trip keys in memory registers here to read them again
 *  when another trip is opened (plannerStore does). */
export function onTripSwitch(fn) {
  reloaders.add(fn);
  return () => reloaders.delete(fn);
}

function changed() {
  activeCache = activeTripId();
  for (const r of reloaders) r();
  for (const l of listeners) l();
}

export const tripsStore = {
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  getActiveId() {
    if (activeCache == null) activeCache = activeTripId();
    return activeCache;
  },
  list: () => listTrips(),
  open(id) { const did = openTrip(id); if (did) changed(); return did; },
  startNew() { const id = startNewTrip(); changed(); return id; },
  openOrStart(match) { const did = openOrStart(match); if (did) changed(); return did; },
  remove(id) { const before = tripsStore.getActiveId(); deleteTrip(id); if (activeTripId() !== before) changed(); else for (const l of listeners) l(); },
};
