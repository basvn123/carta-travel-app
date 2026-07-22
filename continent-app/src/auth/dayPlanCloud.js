// Supabase reads/writes for day-plan sync (table: day_plans, one row per
// plan id per user, whole payload as jsonb, deleted_at as tombstone).
// See supabase/migrations/004_day_plans.sql. Callers handle errors: a
// project that has not run the migration yet must degrade to local-only.
import { supabase } from '../lib/supabaseClient.js';

export async function fetchDayPlanRows(userId) {
  const { data, error } = await supabase
    .from('day_plans')
    .select('plan_id, payload, updated_at, deleted_at')
    .eq('user_id', userId);
  if (error) throw error;
  return data || [];
}

/** Insert-or-replace one plan's cloud row. Passing deletedAt writes the
 *  tombstone (payload emptied: a deleted plan's content has no business
 *  outliving it in the account). Returns the updated_at written. */
export async function upsertDayPlanRow(userId, planId, payload, deletedAt = null) {
  const updatedAt = new Date().toISOString();
  const { error } = await supabase
    .from('day_plans')
    .upsert({
      user_id: userId,
      plan_id: planId,
      payload: deletedAt ? {} : (payload || {}),
      updated_at: updatedAt,
      deleted_at: deletedAt,
    }, { onConflict: 'user_id,plan_id' });
  if (error) throw error;
  return updatedAt;
}
