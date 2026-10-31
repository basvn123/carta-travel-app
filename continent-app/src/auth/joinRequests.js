/**
 * joinRequests.js, "Ask to join" a friend's trip (T939, migration 057).
 *
 * A friend asks to join a trip you show them; you answer under "To answer"
 * in Together. Yes makes them a co-planner through 020's own table
 * (trip_collaborators, accepted), so they then have the trip exactly as if
 * they had taken your invitation (coplanners.js lists and removes them as
 * before). No is silent.
 *
 * Every check lives in SQL: the trip must be shown to friends, its owner an
 * accepted friend, and only the owner answers. Before 057 is applied every
 * read answers `{ missing: true }` and nothing is drawn.
 */
import { getSupabase } from '../lib/supabaseClient.js';
import { isMissing } from './friendVisibility.js';

const NONE = Object.freeze({ missing: true, toMe: [], mine: new Set() });

/**
 * { missing, toMe, mine }
 *   toMe  requests to your trips: [{ id, tripPlanId, requesterId, handle,
 *         name, emoji, label, createdAt }]
 *   mine  the trip ids you asked to join and that wait for an answer
 */
export async function listJoinRequests() {
  const supabase = await getSupabase();
  if (!supabase) return NONE;
  const { data, error } = await supabase.rpc('list_join_requests');
  if (error) {
    if (!isMissing(error)) console.warn('[join] could not read join requests:', error.message || error);
    return NONE;
  }
  const toMe = [];
  const mine = new Set();
  for (const r of data || []) {
    if (r.mine) { mine.add(r.trip_plan_id); continue; }
    toMe.push({
      id: r.id,
      tripPlanId: r.trip_plan_id,
      requesterId: r.requester_id,
      handle: r.handle || '',
      name: r.display_name || (r.handle ? `@${r.handle}` : ''),
      emoji: r.avatar_emoji || '',
      label: r.trip_label || '',
      createdAt: r.created_at,
    });
  }
  return { missing: false, toMe, mine };
}

/** Ask to join a friend's trip. Answers 'requested', 'already' or 'gone'. */
export async function askToJoin(planId) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('ask_to_join', { plan: planId });
  if (error) throw error;
  return data;
}

/** The trip's owner answers. Answers 'joined', 'declined' or 'gone'. */
export async function answerJoinRequest(requestId, yes) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('answer_join_request', { req: requestId, yes: Boolean(yes) });
  if (error) throw error;
  return data;
}
