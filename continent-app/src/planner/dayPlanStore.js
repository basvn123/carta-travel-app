/**
 * dayPlanStore.js, device-local storage for standalone day plans.
 *
 * Day plans work for guests (no account, no Supabase round-trip), so they live
 * in localStorage. Split out of DayPlannerTab so the Saved-trips panel can show
 * the same list as an overview.
 *
 * Plan shape (v2, multi-city):
 *   { id, label, startDate, stops: [{ destinationId, days }] }
 * Legacy v1 entries ({ id, label, destinationId, startDate, days }) are
 * migrated on read.
 *
 * Cloud sync (see dayPlanSync.js) rides on two additions here rather than on
 * its own storage: a per-plan touched-at timestamp (so newest-wins merging is
 * possible across devices) and a change subscription. Every write is tagged
 * with where it came from: local edits bump the timestamp and are pushed to
 * the account; writes applied FROM the account (remote: true) do neither,
 * they only notify the UI, so a pull can never echo back up as a push.
 */

const STANDALONE_KEY = 'carta.dayplans.v1';
const META_KEY = 'carta.dayplan.meta.v1';

// The Day planner can plan days for the Trip planner's UNSAVED draft too; its
// picks live under this well-known plan id until the trip is saved, at which
// point useTripPlanner re-keys them to the real Supabase plan id.
export const TRIP_DRAFT_PLAN_ID = 'tripdraft';

// Per-plan sidecar keys: the day-by-day activity picks, the shape-your-day
// answers, and the trip extras (bookings, notes, packing list), all keyed by
// plan id (a trip_plans uuid, 'local:<ms>' or the tripdraft id).
export function assignmentsKey(planId) {
  return `carta.dayplan.${planId}`;
}
export function prefsKey(planId) {
  return `carta.dayprefs.${planId}`;
}
export function extrasKey(planId) {
  return `carta.tripextras.${planId}`;
}

/* ---- change subscription (UI refresh + cloud push) ---- */

const listeners = new Set();

/** cb({ planId, kind: 'change'|'delete', remote }) on every store write. */
export function subscribeDayPlanStore(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notify(planId, kind, remote) {
  listeners.forEach((cb) => {
    try { cb({ planId, kind, remote }); } catch { /* one bad listener never blocks the rest */ }
  });
}

/* ---- per-plan touched-at timestamps (the merge currency) ---- */

function loadMeta() {
  if (typeof window === 'undefined') return {};
  try {
    const m = JSON.parse(window.localStorage.getItem(META_KEY) || '{}');
    return m && typeof m === 'object' ? m : {};
  } catch {
    return {};
  }
}

function saveMeta(meta) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch { /* ignore */ }
}

/** Epoch ms of the last LOCAL edit to this plan (0 = never/unknown). */
export function planTouchedAt(planId) {
  return Number(loadMeta()[planId]) || 0;
}

/** Record a plan's timestamp without notifying anyone: the sync layer calls
 *  this after a pull or push so local time never drifts ahead of the cloud. */
export function markPlanSynced(planId, epochMs) {
  const meta = loadMeta();
  meta[planId] = epochMs;
  saveMeta(meta);
}

function touch(planId) {
  markPlanSynced(planId, Date.now());
}

/** Every plan id with any local presence (list entry, picks or trip extras),
 *  the unsaved trip draft excluded. Used by sync to find data that belongs to
 *  a saved TRIP (keyed by its uuid) and so is absent from the standalone list. */
export function listLocalPlanIds() {
  const ids = new Set(loadStandalonePlans().map((p) => p.id));
  if (typeof window !== 'undefined') {
    for (const prefix of [assignmentsKey(''), extrasKey('')]) {
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const k = window.localStorage.key(i) || '';
        if (k.startsWith(prefix) && k !== META_KEY) ids.add(k.slice(prefix.length));
      }
    }
  }
  ids.delete(TRIP_DRAFT_PLAN_ID);
  return [...ids];
}

/* ---- plans ---- */

function migrate(sp) {
  if (sp && !Array.isArray(sp.stops)) {
    return {
      id: sp.id,
      label: sp.label || '',
      startDate: sp.startDate,
      stops: [{ destinationId: sp.destinationId, days: Math.max(1, sp.days || 1) }],
    };
  }
  return sp;
}

export function loadStandalonePlans() {
  if (typeof window === 'undefined') return [];
  try {
    const list = JSON.parse(window.localStorage.getItem(STANDALONE_KEY) || '[]');
    return Array.isArray(list) ? list.map(migrate).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function persistStandalonePlans(list, { remote = false } = {}) {
  if (typeof window === 'undefined') return;
  const prev = loadStandalonePlans();
  try {
    window.localStorage.setItem(STANDALONE_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
  // Tell listeners which plans actually changed, not just "the list did":
  // the cloud push is per plan, and a rename of one plan must not re-upload
  // every other plan alongside it.
  const prevById = new Map(prev.map((p) => [p.id, JSON.stringify(p)]));
  list.forEach((p) => {
    if (prevById.get(p.id) !== JSON.stringify(p)) {
      if (!remote) touch(p.id);
      notify(p.id, 'change', remote);
    }
    prevById.delete(p.id);
  });
  // Anything left in prevById was removed without deleteStandalonePlan.
  prevById.forEach((_, id) => {
    if (!remote) touch(id);
    notify(id, 'delete', remote);
  });
}

export function deleteStandalonePlan(id, { remote = false } = {}) {
  const next = loadStandalonePlans().filter((sp) => sp.id !== id);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STANDALONE_KEY, JSON.stringify(next));
      window.localStorage.removeItem(assignmentsKey(id));
      window.localStorage.removeItem(prefsKey(id));
      window.localStorage.removeItem(extrasKey(id));
    } catch { /* ignore */ }
  }
  if (!remote) touch(id);
  notify(id, 'delete', remote);
  return next;
}

/* ---- per-plan picks + prefs ---- */

export function loadAssignments(planId) {
  if (!planId || typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(assignmentsKey(planId)) || '{}');
  } catch {
    return {};
  }
}
export function persistAssignments(planId, assignments, { remote = false } = {}) {
  if (!planId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(assignmentsKey(planId), JSON.stringify(assignments));
  } catch { /* ignore */ }
  if (!remote) touch(planId);
  notify(planId, 'change', remote);
}

/* ---- trip extras: bookings, notes, packing list ---- */

const EMPTY_EXTRAS = {
  bookings: {}, notes: '', checklist: [], expenses: [], people: [],
  // Magic-import staging: activities parsed out of uploaded documents wait in
  // `inbox` until the traveller routes each one to a trip day; the routed ones
  // live in `dayExtras`, keyed by trip day number.
  inbox: [], dayExtras: {},
  // A trip that already happened, told by hand: who came, how you travelled,
  // what it cost, how it was, the photographs (see auth/pastTripMemory.js).
  // Null on every trip the app itself planned.
  memory: null,
};

/** Always returns the full shape, never null: callers render straight off it. */
export function loadTripExtras(planId) {
  if (!planId || typeof window === 'undefined') return { ...EMPTY_EXTRAS };
  try {
    const raw = JSON.parse(window.localStorage.getItem(extrasKey(planId)) || 'null');
    if (!raw || typeof raw !== 'object') return { ...EMPTY_EXTRAS };
    return {
      bookings: raw.bookings && typeof raw.bookings === 'object' ? raw.bookings : {},
      notes: typeof raw.notes === 'string' ? raw.notes : '',
      checklist: Array.isArray(raw.checklist) ? raw.checklist : [],
      // Group expense ledger: shared spends + custom traveller names.
      expenses: Array.isArray(raw.expenses) ? raw.expenses : [],
      people: Array.isArray(raw.people) ? raw.people : [],
      inbox: Array.isArray(raw.inbox) ? raw.inbox : [],
      dayExtras: raw.dayExtras && typeof raw.dayExtras === 'object' ? raw.dayExtras : {},
      memory: raw.memory && typeof raw.memory === 'object' ? raw.memory : null,
    };
  } catch {
    return { ...EMPTY_EXTRAS };
  }
}

/** Whether extras were ever stored for this plan (tombstone bookkeeping). */
export function hasTripExtras(planId) {
  if (!planId || typeof window === 'undefined') return false;
  return window.localStorage.getItem(extrasKey(planId)) != null;
}

export function persistTripExtras(planId, extras, { remote = false } = {}) {
  if (!planId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(extrasKey(planId), JSON.stringify(extras));
  } catch { /* ignore */ }
  if (!remote) touch(planId);
  notify(planId, 'change', remote);
}

export function loadPrefs(planId) {
  if (!planId || typeof window === 'undefined') return null;
  try {
    return JSON.parse(window.localStorage.getItem(prefsKey(planId)) || 'null');
  } catch {
    return null;
  }
}
export function persistPrefs(planId, prefs, { remote = false } = {}) {
  if (!planId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(prefsKey(planId), JSON.stringify(prefs));
  } catch { /* ignore */ }
  if (!remote) touch(planId);
  notify(planId, 'change', remote);
}
