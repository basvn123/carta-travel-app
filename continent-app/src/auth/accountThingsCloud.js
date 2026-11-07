// Supabase reads and writes for the things a signed-in traveller's work
// syncs through (T1104, ROADMAP I5; table account_things, migration 065):
// kept trips, bookmarked Carta trips, trips in progress and the trip kept
// without an account, one row per thing, deleted_at a tombstone.
//
// accountSync.js takes this object as its `cloud`, so the node test hands it
// a stub with the same two calls. Callers handle errors: a project that has
// not run 065 yet answers PGRST205 or 42P01, and the sync turns itself off.
import { getSupabase } from '../lib/supabaseClient.js';

/** True for the error a missing table or an unreloaded schema gives. */
export const missingTable = (err) => ['PGRST205', '42P01', 'PGRST202'].includes(err?.code);

export const accountThingsCloud = {
  /** Every row of the account, tombstones included. */
  async fetch(userId) {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('account_things')
      .select('kind, item_id, body, updated_at, deleted_at')
      .eq('user_id', userId)
      .limit(1000);
    if (error) throw error;
    return data || [];
  },

  /** Insert or replace rows, each { user_id, kind, item_id, body, updated_at, deleted_at }. */
  async upsert(rows) {
    if (!rows.length) return;
    const supabase = await getSupabase();
    const { error } = await supabase
      .from('account_things')
      .upsert(rows, { onConflict: 'user_id,kind,item_id' });
    if (error) throw error;
  },
};
