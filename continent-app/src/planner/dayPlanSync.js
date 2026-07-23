/**
 * dayPlanSync.js, keeps a signed-in account's day plans on every device.
 *
 * Day plans always live in localStorage first (guests keep working offline,
 * and the Day planner itself never waits on the network). This module is a
 * write-through shadow: bindDayPlanCloud(userId) runs one newest-wins merge
 * against the day_plans table, then listens to the store and pushes local
 * edits up, debounced, one row per plan.
 *
 * Merge rules, per plan id:
 *   - remote tombstone newer than the local edit  -> delete locally
 *   - remote row newer than the local edit        -> write locally (remote: true)
 *   - local edit newer, or plan unknown remotely  -> push
 * The unsaved trip draft (TRIP_DRAFT_PLAN_ID) never syncs: its parent trip
 * only exists in this device's tripDraftStore.
 *
 * If the table is missing (migration not run) or Supabase is down, sync
 * marks itself unavailable after a few failures and the app carries on
 * local-only, exactly as before this module existed.
 */

import { fetchDayPlanRows, upsertDayPlanRow } from '../auth/dayPlanCloud.js';
import {
  loadStandalonePlans, persistStandalonePlans, deleteStandalonePlan,
  loadAssignments, persistAssignments, loadPrefs, persistPrefs,
  loadTripExtras, persistTripExtras, hasTripExtras,
  planTouchedAt, markPlanSynced, listLocalPlanIds, subscribeDayPlanStore,
  TRIP_DRAFT_PLAN_ID,
} from './dayPlanStore.js';

const PUSH_DEBOUNCE_MS = 1500;
const MAX_CONSECUTIVE_FAILURES = 3;

let boundUserId = null;
let unsubscribe = null;
let pushTimer = null;
let flushing = false;
const dirty = new Map(); // planId -> 'change' | 'delete'
let failures = 0;
let unavailable = false;

function warnOnce(err) {
  if (unavailable) return;
  unavailable = true;
  console.warn('[day-plan sync] unavailable, staying local-only:', err?.message || err);
}

function schedulePush() {
  if (!boundUserId || unavailable) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { flush().catch(() => {}); }, PUSH_DEBOUNCE_MS);
}

async function flush() {
  if (!boundUserId || unavailable || flushing || !dirty.size) return;
  flushing = true;
  const userId = boundUserId;
  const entries = [...dirty.entries()];
  dirty.clear();
  try {
    for (const [planId, kind] of entries) {
      if (userId !== boundUserId) return; // signed out mid-flush
      if (kind === 'delete') {
        await upsertDayPlanRow(userId, planId, null, new Date().toISOString());
      } else {
        const plan = loadStandalonePlans().find((p) => p.id === planId) || null;
        const written = await upsertDayPlanRow(userId, planId, {
          plan,
          assignments: loadAssignments(planId),
          prefs: loadPrefs(planId),
          extras: hasTripExtras(planId) ? loadTripExtras(planId) : null,
        });
        // Local clock and DB clock can disagree; adopting the written stamp
        // keeps the next merge from seeing our own push as "remote is newer".
        markPlanSynced(planId, Date.parse(written) || Date.now());
      }
    }
    failures = 0;
  } catch (err) {
    // Put everything back and retry on the next debounce, up to the cap.
    entries.forEach(([planId, kind]) => { if (!dirty.has(planId)) dirty.set(planId, kind); });
    failures += 1;
    if (failures >= MAX_CONSECUTIVE_FAILURES) warnOnce(err);
    else schedulePush();
  } finally {
    flushing = false;
    // Edits that arrived while this flush ran hit the `flushing` guard; make
    // sure they get their own pass instead of waiting for the next edit.
    if (dirty.size) schedulePush();
  }
}

async function merge(userId) {
  let rows;
  try {
    rows = await fetchDayPlanRows(userId);
  } catch (err) {
    warnOnce(err);
    return;
  }
  if (userId !== boundUserId) return; // signed out while fetching

  const remoteIds = new Set();
  let list = loadStandalonePlans();
  let listChanged = false;

  rows.forEach((row) => {
    const planId = row.plan_id;
    if (planId === TRIP_DRAFT_PLAN_ID) return;
    remoteIds.add(planId);
    const localAt = planTouchedAt(planId);
    const remoteAt = Date.parse(row.updated_at) || 0;

    if (row.deleted_at) {
      // A tombstone only beats local knowledge that is older than it.
      const existsLocally = list.some((p) => p.id === planId)
        || Object.keys(loadAssignments(planId)).length > 0
        || hasTripExtras(planId);
      if (remoteAt > localAt && existsLocally) {
        deleteStandalonePlan(planId, { remote: true });
        list = list.filter((p) => p.id !== planId);
        markPlanSynced(planId, remoteAt);
      } else if (localAt > remoteAt) {
        dirty.set(planId, 'change'); // edited here after deleting elsewhere: revive
      }
      return;
    }

    if (remoteAt > localAt) {
      const payload = row.payload || {};
      if (payload.plan) {
        const at = list.findIndex((p) => p.id === planId);
        if (at >= 0) list[at] = payload.plan; else list.unshift(payload.plan);
        listChanged = true;
      }
      if (payload.assignments) persistAssignments(planId, payload.assignments, { remote: true });
      if (payload.prefs != null) persistPrefs(planId, payload.prefs, { remote: true });
      if (payload.extras != null) persistTripExtras(planId, payload.extras, { remote: true });
      markPlanSynced(planId, remoteAt);
    } else if (localAt > remoteAt) {
      dirty.set(planId, 'change');
    }
  });

  if (listChanged) persistStandalonePlans(list, { remote: true });

  // First sign-in on a device with existing local plans: send them up.
  listLocalPlanIds().forEach((planId) => {
    if (!remoteIds.has(planId)) dirty.set(planId, 'change');
  });

  if (dirty.size) schedulePush();
}

/**
 * Point the shadow at an account (or null for guests / sign-out). Idempotent
 * per user id: App calls this from an effect on every auth change.
 */
export function bindDayPlanCloud(userId) {
  if (userId === boundUserId) return;
  boundUserId = userId;
  dirty.clear();
  failures = 0;
  unavailable = false;
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  if (!userId) return;

  unsubscribe = subscribeDayPlanStore(({ planId, kind, remote }) => {
    if (remote || planId === TRIP_DRAFT_PLAN_ID || !boundUserId) return;
    // A delete supersedes queued changes for the same plan, never vice versa.
    if (kind === 'delete' || dirty.get(planId) !== 'delete') dirty.set(planId, kind);
    schedulePush();
  });
  merge(userId).catch((err) => warnOnce(err));
}
