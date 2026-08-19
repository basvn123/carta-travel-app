/**
 * friends.js, two accounts that have agreed to see each other's trips.
 *
 * The graph is a single table of edges with a status, and the rules that make
 * it safe live in SQL rather than here (supabase/migrations/011_friends.sql).
 * Two of them are worth repeating where they will be read:
 *
 *   The friend list is private. A friendship row is readable only by the two
 *   people named in it, so nothing in this module can list a third party's
 *   friends, and no amount of client code could make it.
 *
 *   Crew on somebody else's trip is a name, never a link. The projection that
 *   both a share link and a friend's trip come through strips the account id
 *   behind every crew member. Otherwise you would learn who your friend
 *   travels with, which is their business and not the trip's.
 *
 * Reading a friend's trips goes through two functions rather than through row
 * policies on trip_plans and day_plans. day_plans in particular carries the
 * expense ledger and the photographs in one blob, so "read the row" and "see
 * the trip" have to stay different permissions.
 */
import { supabase } from '../lib/supabaseClient.js';

/** What one edge means from the reader's side. `incoming` is a request you
 *  have not answered; `outgoing` is one you sent and they have not. */
export const LINK_KINDS = ['friend', 'incoming', 'outgoing'];

function kindOf(row, userId) {
  if (row.status === 'accepted') return 'friend';
  if (row.status === 'blocked') return null;
  return row.requester_id === userId ? 'outgoing' : 'incoming';
}

/**
 * Everyone you have a link with, in one shape, each carrying the other
 * person's profile.
 *
 * Two queries rather than an embed: friendships points at auth.users twice, so
 * PostgREST has no relationship to profiles to follow. The second query is
 * only allowed to return anything because migration 011 widened the profiles
 * policy to people you already have a link with, which is also why a stranger
 * stays a stranger.
 */
export async function fetchFriendLinks(userId) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from('friendships')
    .select('id, requester_id, addressee_id, status, created_at, responded_at')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rows = data || [];
  const otherIds = [...new Set(rows.map((r) => (r.requester_id === userId ? r.addressee_id : r.requester_id)))];
  if (!otherIds.length) return [];

  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('user_id, handle, display_name, avatar_emoji')
    .in('user_id', otherIds);
  if (pErr) throw pErr;
  const byId = new Map((profiles || []).map((p) => [p.user_id, p]));

  return rows
    .map((r) => {
      const kind = kindOf(r, userId);
      if (!kind) return null;
      const otherId = r.requester_id === userId ? r.addressee_id : r.requester_id;
      const p = byId.get(otherId);
      // A link whose profile did not come back is one the policy would not
      // show, so it is not shown at all rather than as a bare id.
      if (!p) return null;
      return {
        id: r.id,
        kind,
        userId: otherId,
        handle: p.handle,
        displayName: p.display_name || '',
        avatarEmoji: p.avatar_emoji || '',
        createdAt: r.created_at,
      };
    })
    .filter(Boolean);
}

export async function sendFriendRequest(userId, targetUserId) {
  const { error } = await supabase
    .from('friendships')
    .insert({ requester_id: userId, addressee_id: targetUserId, status: 'pending' });
  if (error) {
    // The direction-blind unique index: a link already exists, possibly the
    // other way round. Saying so is better than a raw constraint name.
    if (error.code === '23505') {
      const dup = new Error('already linked');
      dup.code = 'ALREADY_LINKED';
      throw dup;
    }
    throw error;
  }
}

export async function acceptFriendRequest(id) {
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/** Declining, cancelling and unfriending are the same act on the same row:
 *  the link stops existing, and either side may ask again later. */
export async function removeFriendLink(id) {
  const { error } = await supabase.from('friendships').delete().eq('id', id);
  if (error) throw error;
}

/* ---- reading their trips ---- */

export async function listFriendTrips() {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('list_friend_trips');
  if (error) throw error;
  return (data || []).map((r) => ({
    ownerId: r.owner_id,
    ownerHandle: r.owner_handle,
    ownerName: r.owner_name || '',
    ownerEmoji: r.owner_emoji || '',
    tripPlanId: r.trip_plan_id,
    label: r.label || '',
    startDate: r.start_date,
    endDate: r.end_date,
    cities: r.cities || [],
    countries: r.countries || [],
    destinationIds: r.destination_ids || [],
  }));
}

/** One friend's trip in full, or null when it was set back to private or the
 *  friendship ended between the list and the tap. */
export async function getFriendTrip(planId) {
  if (!supabase || !planId) return null;
  const { data, error } = await supabase.rpc('get_friend_trip', { wanted_plan: planId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    tripPlanId: row.trip_plan_id,
    ownerHandle: row.owner_handle,
    ownerName: row.owner_name || '',
    label: row.label || '',
    stops: Array.isArray(row.stops) ? row.stops : [],
    payload: row.payload && typeof row.payload === 'object' ? row.payload : {},
  };
}

/* ---- who a trip is shown to ---- */

export const VISIBILITIES = ['private', 'friends', 'link'];

export async function setTripVisibility(tripPlanId, visibility) {
  if (!VISIBILITIES.includes(visibility)) throw new Error('unknown visibility');
  const { error } = await supabase
    .from('trip_plans')
    .update({ visibility, updated_at: new Date().toISOString() })
    .eq('id', tripPlanId);
  if (error) throw error;
}
