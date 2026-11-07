/**
 * accountSync.js, accounts that keep your work (T1104, ROADMAP I5, HANDBOOK
 * "Accounts that keep your work").
 *
 * Four things a traveller makes live in this browser first, so they work
 * signed out: the trips kept from the trip finder (carta.keptTrips.v1),
 * Carta's trips they bookmarked (carta.savedJourneys.v1), the trips in
 * progress on the Plan home (carta.trips.v1) and the one trip kept without an
 * account (carta.deviceTrip.v1). Signed in, this module mirrors them into the
 * account (table account_things, migration 065), so a second device gets
 * them. Settings, the shortlist, saved lists and visited countries already
 * ride in user_settings (hooks/useAccountSync.js) and day plans in day_plans
 * (planner/dayPlanSync.js); this covers what was left.
 *
 * THE MERGE RULE, per thing (kind + id), run on sign-in and after every
 * local change (debounced):
 *   - on this device only, never synced     -> moved to the account (counted
 *                                              as "moved" for the notice)
 *   - in the account only, never here       -> brought to this device
 *   - on both, the same                     -> nothing
 *   - on both, different                    -> the newer change wins
 *   - removed here since the last sync      -> removed from the account
 *                                              (a tombstone), unless the
 *                                              account copy changed later
 *   - removed in the account (tombstone)    -> removed here, unless this
 *                                              device changed it later
 * Nothing is ever dropped because of a sign-in: a signed-out device's work is
 * added to the account, never replaced by it.
 *
 * ANOTHER ACCOUNT ON THE SAME DEVICE. The sync state remembers which account
 * the device last synced with and which things came from it. Signing in as a
 * different account removes that previous account's things from this device
 * (they are safe in that account) and does NOT copy them into the new one;
 * things made signed out since then move to the new account as usual. Sign-
 * out itself keeps everything (lib/deviceData.js asks whether to clear).
 *
 * Every function takes the storage and the cloud as arguments so the node
 * test (tests/accountSync.test.mjs) runs two simulated devices against one
 * stubbed account. The binder at the bottom wires it to the browser.
 */

import { KEPT_KEY, MAX_KEPT } from '../lib/recommend/keptStore.js';
import { SAVES_KEY } from '../lib/journeySaves.js';
import {
  TRIPS_KEY, readKeys, hasContent, ensure as ensureTrips, deleteTrip as deleteTripEntry,
} from '../planner/tripsStore.js';
import { DEVICE_TRIP_KEY, loadDeviceTrip } from '../planner/deviceTripStore.js';

export const SYNC_KEY = 'carta.accountSync.v1';
export const KINDS = ['kept', 'journey', 'trip', 'device_trip'];
const MAX_JOURNEYS = 200;
const ID_OK = /^[^\p{Cc}]{1,120}$/u;
const MAX_BODY_CHARS = 250000; // under the table's 256 KB check

/* ---- small helpers ---- */

function readJson(storage, key) {
  try { return JSON.parse(storage?.getItem(key) ?? 'null'); } catch { return null; }
}
function writeRaw(storage, key, raw) {
  try {
    if (storage?.getItem(key) === raw) return false;
    storage?.setItem(key, raw);
    return true;
  } catch { return false; }
}
const toMs = (v) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Date.parse(v || '');
  return Number.isFinite(n) ? n : 0;
};

/** A stable hash of a body: key order does not matter. */
export function hashBody(body) {
  const canon = (v) => {
    if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
    if (v && typeof v === 'object') {
      return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
    }
    return JSON.stringify(v ?? null);
  };
  const s = canon(body);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${s.length.toString(36)}.${h.toString(36)}`;
}

/* ---- the sync state: which account, and what was last in sync ---- */

export function readSyncState(storage) {
  const st = readJson(storage, SYNC_KEY);
  if (!st || st.v !== 1 || typeof st.seen !== 'object' || !st.seen) return { v: 1, owner: null, seen: {} };
  return st;
}
function writeSyncState(storage, st) {
  try { storage?.setItem(SYNC_KEY, JSON.stringify(st)); } catch { /* full or blocked */ }
}

/* ---- one adapter per kind: read the device's things, write them back ---- */
// read(storage) -> Map(id -> { body, stamp }) where stamp is the thing's own
// last-change time in ms, or null when it has none (a bookmark).
// locked(storage) -> Set of ids this device must not overwrite or remove now.
// write(storage, next: Map) -> Set of ids that are on the device afterwards.

const keptAdapter = {
  kind: 'kept',
  key: KEPT_KEY,
  read(storage) {
    const list = readJson(storage, KEPT_KEY);
    const out = new Map();
    for (const r of Array.isArray(list) ? list : []) {
      if (r && typeof r.id === 'string' && !out.has(r.id)) out.set(r.id, { body: r, stamp: toMs(r.keptAt) || null });
    }
    return out;
  },
  locked: () => new Set(),
  write(storage, next) {
    const list = [...next.values()]
      .sort((a, b) => (b.stamp || 0) - (a.stamp || 0))
      .slice(0, MAX_KEPT)
      .map((x) => x.body);
    const changed = writeRaw(storage, KEPT_KEY, JSON.stringify(list));
    return { placed: new Set(list.map((r) => r.id)), changed };
  },
};

const journeyAdapter = {
  kind: 'journey',
  key: SAVES_KEY,
  read(storage) {
    const list = readJson(storage, SAVES_KEY);
    const out = new Map();
    for (const id of Array.isArray(list) ? list : []) {
      if (typeof id === 'string' && !out.has(id)) out.set(id, { body: {}, stamp: null });
    }
    return out;
  },
  locked: () => new Set(),
  write(storage, next, before) {
    // Keep this device's order (newest bookmark first) and put the ones
    // brought from the account in front of it, newest first.
    const kept = [...before.keys()].filter((id) => next.has(id));
    const added = [...next.entries()].filter(([id]) => !before.has(id))
      .sort((a, b) => (b[1].stamp || 0) - (a[1].stamp || 0)).map(([id]) => id);
    const list = [...added, ...kept].slice(0, MAX_JOURNEYS);
    const changed = writeRaw(storage, SAVES_KEY, JSON.stringify(list));
    return { placed: new Set(list), changed };
  },
};

function tripsRec(storage) {
  const rec = readJson(storage, TRIPS_KEY);
  return rec && rec.v === 1 && Array.isArray(rec.trips) ? rec : null;
}

const tripAdapter = {
  kind: 'trip',
  key: TRIPS_KEY,
  read(storage) {
    const out = new Map();
    const rec = tripsRec(storage);
    if (!rec) return out;
    for (const e of rec.trips) {
      if (!e || typeof e.id !== 'string') continue;
      // The open trip's entry can lag its live keys (tripsStore snapshots it
      // on the next list); what syncs is what the traveller sees.
      let body = e;
      if (e.id === rec.activeId) {
        const live = readKeys(storage);
        if (hasContent(live)) body = { ...e, keys: live };
      }
      out.set(e.id, { body, stamp: toMs(e.updatedAt) || null });
    }
    return out;
  },
  // The open trip is the planner's: its keys are being edited right now.
  locked(storage) {
    const rec = tripsRec(storage);
    return new Set(rec?.activeId ? [rec.activeId] : []);
  },
  write(storage, next) {
    if (!next.size && !tripsRec(storage)) return { placed: new Set(), changed: false };
    const rec = tripsRec(storage) || ensureTrips(storage);
    const byId = new Map(rec.trips.map((e) => [e.id, e]));
    const trips = [];
    for (const [id, x] of next) {
      if (id === rec.activeId && byId.has(id)) trips.push(byId.get(id));
      else trips.push({ ...x.body, id });
    }
    const out = { ...rec, trips };
    const changed = writeRaw(storage, TRIPS_KEY, JSON.stringify(out));
    return { placed: new Set(trips.map((e) => e.id)), changed };
  },
};

const deviceTripAdapter = {
  kind: 'device_trip',
  key: DEVICE_TRIP_KEY,
  read(storage) {
    const d = loadDeviceTrip(storage);
    return d ? new Map([[d.key, { body: d, stamp: toMs(d.savedAt) || null }]]) : new Map();
  },
  locked: () => new Set(),
  // One slot. The trip already in it stays its own (updated when the account
  // holds a newer copy of the same trip); an empty slot takes the account's
  // newest. A device trip that does not fit stays in the account.
  write(storage, next) {
    const here = loadDeviceTrip(storage);
    let pick = here && next.has(here.key) ? next.get(here.key) : null;
    if (!pick && !here) {
      pick = [...next.values()].sort((a, b) => (b.stamp || 0) - (a.stamp || 0))[0] || null;
    }
    if (pick) {
      const changed = writeRaw(storage, DEVICE_TRIP_KEY, JSON.stringify(pick.body));
      return { placed: new Set([pick.body.key]), changed };
    }
    if (here && !next.has(here.key)) {
      try { storage.removeItem(DEVICE_TRIP_KEY); } catch { /* blocked */ }
      return { placed: new Set(), changed: true };
    }
    return { placed: new Set(here ? [here.key] : []), changed: false };
  },
};

export const ADAPTERS = [keptAdapter, journeyAdapter, tripAdapter, deviceTripAdapter];

/* ---- the merge, one kind at a time (pure) ---- */

/**
 * local: Map(id -> { body, stamp }), remote: Map(id -> { body, stamp, deleted }),
 * seen: { id: { s, h } } from the last sync, locked: Set, now: ms.
 * Returns the device's next things, the rows to push and what happened.
 */
export function mergeKind({ local, remote, seen = {}, locked = new Set(), now }) {
  const next = new Map();
  const push = [];
  const stats = { moved: 0, pulled: 0, pushed: 0, removed: 0, tombstoned: 0 };
  const ids = new Set([...local.keys(), ...remote.keys()]);
  for (const id of ids) {
    const l = local.get(id);
    const r = remote.get(id);
    const s = seen[id];
    const hl = l ? hashBody(l.body) : null;
    // This device's time for its copy: its own stamp when that moved on since
    // the last sync; "now" when the content changed without one; else the
    // stamp it had.
    let ls = null;
    if (l) {
      const own = l.stamp || 0;
      if (s && own > s.s) ls = own;
      else if (s && hl !== s.h) ls = Math.max(now, own);
      else ls = own || (s ? s.s : now);
    }
    const dirty = Boolean(l && (!s || hl !== s.h));
    if (l && !r) {
      next.set(id, { body: l.body, stamp: ls });
      push.push({ id, body: l.body, stamp: ls });
      stats.pushed += 1;
      if (!s) stats.moved += 1;
    } else if (!l && r && !r.deleted) {
      if (s && r.stamp <= s.s) {
        // Removed here after the last sync, and nobody changed it since.
        push.push({ id, deleted: true, stamp: Math.max(now, r.stamp + 1) });
        stats.tombstoned += 1;
      } else {
        next.set(id, { body: r.body, stamp: r.stamp });
        stats.pulled += 1;
      }
    } else if (!l && r && r.deleted) {
      // Gone everywhere.
    } else if (l && r.deleted) {
      if (locked.has(id) || (dirty && ls > r.stamp)) {
        next.set(id, { body: l.body, stamp: Math.max(ls, r.stamp + 1) });
        push.push({ id, body: l.body, stamp: Math.max(ls, r.stamp + 1) });
        stats.pushed += 1;
      } else {
        stats.removed += 1;
      }
    } else if (hl === hashBody(r.body)) {
      next.set(id, { body: l.body, stamp: Math.max(ls || 0, r.stamp) });
    } else if (ls > r.stamp) {
      next.set(id, { body: l.body, stamp: ls });
      push.push({ id, body: l.body, stamp: ls });
      stats.pushed += 1;
    } else if (locked.has(id)) {
      // The account has a newer copy of the trip open in the planner: leave
      // the planner alone; the newer one arrives once another trip is open.
      next.set(id, { body: l.body, stamp: ls, hold: true });
    } else {
      next.set(id, { body: r.body, stamp: r.stamp });
      stats.pulled += 1;
    }
  }
  return { next, push, stats };
}

/* ---- one full sync ---- */

function remoteByKind(rows) {
  const out = Object.fromEntries(KINDS.map((k) => [k, new Map()]));
  for (const row of rows || []) {
    if (!out[row.kind] || typeof row.item_id !== 'string') continue;
    out[row.kind].set(row.item_id, {
      body: row.body && typeof row.body === 'object' ? row.body : {},
      stamp: toMs(row.updated_at),
      deleted: Boolean(row.deleted_at),
    });
  }
  return out;
}

const shippable = (id, body) => ID_OK.test(id) && JSON.stringify(body ?? {}).length <= MAX_BODY_CHARS;

/**
 * Sync this device with the account once: read the account, merge per the
 * rule above, write the device, push the difference, remember what is in
 * sync. Returns { moved, movedByKind, pulled, pushed, removed, dropped,
 * changedKeys } (changedKeys: the storage keys this wrote, for the stores
 * to read again). Throws when the account cannot be read or written; the
 * device is then left as it was before the push.
 */
export async function syncAccountThings({ userId, storage, cloud, now = Date.now() }) {
  if (!userId || !storage || !cloud) throw new Error('syncAccountThings: userId, storage and cloud are required');
  const state = readSyncState(storage);
  const changedKeys = new Set();
  let dropped = 0;

  // Another account synced here last: its things leave this device and are
  // not copied into this account.
  if (state.owner && state.owner !== userId) {
    for (const a of ADAPTERS) {
      const seen = state.seen[a.kind] || {};
      if (a.kind === 'trip') {
        // tripsStore's own delete, so the open trip's planner keys go too and
        // cannot come back as this account's work on the next snapshot.
        for (const id of Object.keys(seen)) {
          if (a.read(storage).has(id)) { deleteTripEntry(id, storage, now); dropped += 1; changedKeys.add(a.key); }
        }
        continue;
      }
      const local = a.read(storage);
      const before = new Map(local);
      for (const id of Object.keys(seen)) if (local.delete(id)) dropped += 1;
      if (local.size !== before.size) {
        const { changed } = a.write(storage, local, before);
        if (changed) changedKeys.add(a.key);
      }
    }
    state.seen = {};
  }

  const remote = remoteByKind(await cloud.fetch(userId));
  const rows = [];
  const result = { moved: 0, movedByKind: {}, pulled: 0, pushed: 0, removed: 0, dropped, changedKeys: [] };
  const nextSeen = {};

  for (const a of ADAPTERS) {
    const local = a.read(storage);
    const { next, push, stats } = mergeKind({
      local, remote: remote[a.kind], seen: state.seen[a.kind] || {}, locked: a.locked(storage), now,
    });
    const { placed, changed } = a.write(storage, next, local);
    if (changed) changedKeys.add(a.key);
    const seenKind = {};
    for (const id of placed) {
      const x = next.get(id);
      // A held copy (the open trip) keeps its old mark, so the newer account
      // copy is still seen as newer next time.
      if (x?.hold) { if (state.seen[a.kind]?.[id]) seenKind[id] = state.seen[a.kind][id]; continue; }
      if (x) seenKind[id] = { s: x.stamp || now, h: hashBody(x.body) };
    }
    nextSeen[a.kind] = seenKind;
    let movedHere = 0;
    for (const p of push) {
      if (!shippable(p.id, p.body)) continue;
      // A thing the device could not keep (a full list) is not pushed as new.
      if (!p.deleted && !placed.has(p.id)) continue;
      if (!p.deleted && !(state.seen[a.kind] || {})[p.id] && !remote[a.kind].has(p.id)) movedHere += 1;
      rows.push({
        user_id: userId,
        kind: a.kind,
        item_id: p.id,
        body: p.deleted ? {} : p.body,
        updated_at: new Date(p.stamp || now).toISOString(),
        deleted_at: p.deleted ? new Date(now).toISOString() : null,
      });
    }
    result.movedByKind[a.kind] = movedHere;
    result.moved += movedHere;
    result.pulled += stats.pulled;
    result.removed += stats.removed;
  }

  await cloud.upsert(rows);
  result.pushed = rows.length;
  writeSyncState(storage, { v: 1, owner: userId, seen: nextSeen, at: now });
  result.changedKeys = [...changedKeys];
  return result;
}

/* ---- the browser binding ---- */

const DEBOUNCE_MS = 2000;
const MAX_FAILURES = 3;
let bound = null; // { userId, cloud, timer, running, again, failures, off }

function browserStorage() {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

/** Tell the stores that read these keys to read again (their storage listeners). */
function announce(keys) {
  if (typeof window === 'undefined' || !keys.length) return;
  for (const key of keys) {
    try { window.dispatchEvent(new StorageEvent('storage', { key })); } catch { /* old browser */ }
  }
  window.dispatchEvent(new Event('carta:kept'));
}

async function runBound() {
  const b = bound;
  if (!b || b.off) return;
  if (b.running) { b.again = true; return; }
  b.running = true;
  try {
    const res = await syncAccountThings({ userId: b.userId, storage: browserStorage(), cloud: b.cloud });
    if (bound !== b) return;
    b.failures = 0;
    b.applying = true;
    announce(res.changedKeys);
    b.applying = false;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('carta:account-sync', { detail: res }));
    }
  } catch (err) {
    b.failures += 1;
    const missing = ['PGRST205', '42P01', 'PGRST202'].includes(err?.code);
    if (missing || b.failures >= MAX_FAILURES) {
      b.off = true;
      console.warn('[account sync] unavailable, staying on this device:', err?.message || err);
    }
  } finally {
    b.running = false;
    if (b.again && !b.off && bound === b) { b.again = false; schedule(); }
  }
}

function schedule() {
  const b = bound;
  if (!b || b.off || b.applying) return;
  if (b.timer) clearTimeout(b.timer);
  b.timer = setTimeout(() => { b.timer = null; runBound(); }, DEBOUNCE_MS);
}

const WATCHED = new Set([KEPT_KEY, SAVES_KEY, TRIPS_KEY, DEVICE_TRIP_KEY, 'carta.plannerDraft.v1', 'carta.tripDraft.v1']);
function onStorage(e) { if (!e.key || WATCHED.has(e.key)) schedule(); }
function onVisible() { if (typeof document !== 'undefined' && document.visibilityState === 'visible') schedule(); }

/**
 * Start syncing for a signed-in account: one sync now, then again after
 * local changes (debounced) and whenever the tab comes back into view. A
 * second call for the same account does nothing; for another account it
 * rebinds. Returns the unbind function.
 */
export function bindAccountSync(userId, cloud) {
  if (!userId || !cloud) return unbindAccountSync;
  if (bound?.userId === userId) return unbindAccountSync;
  unbindAccountSync();
  bound = { userId, cloud, timer: null, running: false, again: false, failures: 0, off: false, applying: false };
  if (typeof window !== 'undefined') {
    window.addEventListener('carta:kept', schedule);
    window.addEventListener('carta:journey-saves', schedule);
    window.addEventListener('storage', onStorage);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
  }
  runBound();
  return unbindAccountSync;
}

export function unbindAccountSync() {
  if (!bound) return;
  if (bound.timer) clearTimeout(bound.timer);
  bound.off = true;
  bound = null;
  if (typeof window !== 'undefined') {
    window.removeEventListener('carta:kept', schedule);
    window.removeEventListener('carta:journey-saves', schedule);
    window.removeEventListener('storage', onStorage);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
  }
}
