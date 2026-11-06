/**
 * The taste verdicts and the profile in the account (T1152, ROADMAP F3), in
 * account_things where the account sync keeps a traveller's work (T1104,
 * migration 065), under kind 'taste' (allowed by migration 072):
 *
 *   item_id <node id>   body { v: 'accept' | 'reject', at }, deleted_at a tombstone
 *   item_id '_profile'  body profileSnapshot() (the chips with their evidence counts)
 *
 * So both are deletable (account delete cascades; "Start over" writes
 * tombstones) and in the GDPR export (export_user_data's accountThings, 069,
 * and the client fallback in AuthContext). It runs beside accountSync.js,
 * not inside it, so a project without 072 (the kind check refuses 'taste',
 * 23514) turns only this off and the trips keep syncing.
 *
 * Merge per node: newest `at` wins, a tombstone included. A device that last
 * synced another account drops that account's verdicts first and never
 * copies them over; verdicts made signed out move to the account.
 */
import { readTasteState, writeTasteState } from './store.js';

export const TASTE_KIND = 'taste';
export const PROFILE_ID = '_profile';
const OFF_CODES = ['PGRST205', '42P01', 'PGRST202', '23514'];
const toMs = (v) => { const n = Date.parse(v || ''); return Number.isFinite(n) ? n : 0; };

/** Pure: merge local verdicts with the account's rows. Returns { state, rows } (rows to upsert). */
export function mergeTaste(local, remoteRows, userId) {
  const st = local.owner && local.owner !== userId
    ? { v: 1, owner: userId, verdicts: {}, removed: {} }
    : { ...local, owner: userId, verdicts: { ...local.verdicts }, removed: { ...local.removed } };
  const remote = new Map();
  for (const r of remoteRows || []) {
    if (r.kind !== TASTE_KIND || r.item_id === PROFILE_ID) continue;
    const at = r.deleted_at ? toMs(r.deleted_at) : (Number(r.body?.at) || toMs(r.updated_at));
    remote.set(r.item_id, { v: r.deleted_at ? null : r.body?.v, at });
  }
  const rows = [];
  const nodes = new Set([...Object.keys(st.verdicts), ...Object.keys(st.removed), ...remote.keys()]);
  for (const node of nodes) {
    const mine = st.verdicts[node] ? { v: st.verdicts[node].v, at: st.verdicts[node].at }
      : st.removed[node] ? { v: null, at: st.removed[node] } : null;
    const theirs = remote.get(node) || null;
    if (mine && (!theirs || mine.at > theirs.at)) {
      if (!theirs && mine.v == null) { delete st.removed[node]; continue; }
      if (!theirs || theirs.v !== mine.v || theirs.at !== mine.at) {
        rows.push({
          user_id: userId, kind: TASTE_KIND, item_id: node,
          body: mine.v ? { v: mine.v, at: mine.at } : {},
          updated_at: new Date(mine.at).toISOString(),
          deleted_at: mine.v ? null : new Date(mine.at).toISOString(),
        });
      }
    } else if (theirs) {
      if (theirs.v) { st.verdicts[node] = { v: theirs.v, at: theirs.at }; delete st.removed[node]; }
      else { delete st.verdicts[node]; delete st.removed[node]; }
    }
    if (st.removed[node] && remote.has(node)) delete st.removed[node];
  }
  return { state: st, rows };
}

const off = new Set();

/**
 * One sync for a signed-in account: pull, merge, push the changed verdicts
 * and the profile snapshot. Never throws; a project without 065 or 072
 * stops trying for this page load.
 */
export async function syncTaste({ userId, storage, cloud, snapshot = null, now = Date.now() }) {
  if (!userId || !cloud || off.has(userId)) return { ok: false };
  try {
    const remote = await cloud.fetch(userId);
    const { state, rows } = mergeTaste(readTasteState(storage), remote, userId);
    if (snapshot) {
      rows.push({
        user_id: userId, kind: TASTE_KIND, item_id: PROFILE_ID, body: snapshot,
        updated_at: new Date(now).toISOString(), deleted_at: null,
      });
    }
    await cloud.upsert(rows);
    writeTasteState(storage, state);
    return { ok: true, pushed: rows.length };
  } catch (err) {
    if (OFF_CODES.includes(err?.code)) off.add(userId);
    return { ok: false, error: err?.code || String(err?.message || err) };
  }
}

/** Test seam. */
export function resetTasteSyncForTests() { off.clear(); }
