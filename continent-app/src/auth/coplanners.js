/**
 * coplanners.js, two accounts building one itinerary.
 *
 * WHAT A CO-PLANNER GETS, in one sentence, because a control that shares
 * without saying what it shares is the whole problem: the trip's name and its
 * stops, which they can edit. Not the day plan, and therefore not the expense
 * ledger, the booking references, the private notes or the photographs. Those
 * live in one jsonb payload keyed on the account (migration 004) and stay with
 * their owner. Migration 020 carries the reasoning and proves it on apply.
 *
 * ONLY AN ACCEPTED FRIEND CAN BE INVITED, and only by the trip's owner. That
 * is enforced in the insert policy, not here: somebody who can rewrite your
 * route is not a stranger whose guide you liked.
 *
 * WHAT A CO-PLANNER CANNOT DO, whatever this module asks for: delete the trip,
 * publish it, change who it is shown to, or hand it to a third account. Those
 * are pinned by a trigger rather than refused by a policy, so the edit lands
 * and the fields simply do not move.
 *
 * THE CREW IS NOT TOUCHED. `extras.people` is positional, because the expense
 * ledger's paidBy and sharers index into it (see tripCrew.js), so adding a
 * co-planner deliberately does NOT write a crew entry: renumbering that array
 * would silently re-assign who paid for what. Crew and co-planners answer
 * different questions, "who is coming" and "who can edit this", and they are
 * kept apart on purpose.
 */
import { supabase } from '../lib/supabaseClient.js';

/* The verify seam, same precedent as ?savedmock, ?sharemock, ?badgemock and
 * ?guidesmock: fixtures stand in for the RPCs so the flow can be checked
 * headlessly and so the surface can be looked at before migration 020 is
 * applied. Display only, never on unless typed. */
const MOCK = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('coplanmock');

const MOCK_INVITES = [{
  tripPlanId: 'ftrip-9',
  label: 'Ten days in the Alps',
  ownerHandle: 'sofie_v',
  ownerName: 'Sofie Vermeulen',
  cities: ['Innsbruck', 'Bolzano'],
  countries: ['Austria', 'Italy'],
  status: 'pending',
  createdAt: '2026-08-27T10:00:00Z',
}];

const MOCK_ON_TRIP = [
  { userId: 'u-a1', handle: 'jonas', displayName: 'Jonas Peeters', avatarEmoji: '', status: 'accepted', createdAt: '2026-08-20T10:00:00Z' },
  { userId: 'u-a2', handle: 'ana_r', displayName: 'Ana Rocha', avatarEmoji: '', status: 'pending', createdAt: '2026-08-26T10:00:00Z' },
];

/** Everyone on one trip, pending and accepted, for the owner and the accepted
 *  co-planners. Returns [] on a project without migration 020, so the control
 *  can ship before the migration is pasted. */
export async function listTripCoplanners(planId) {
  if (MOCK) return MOCK === 'none' ? [] : MOCK_ON_TRIP;
  if (!supabase || !planId) return [];
  const { data, error } = await supabase.rpc('list_trip_coplanners', { wanted_plan: planId });
  if (error) {
    console.warn('[coplan] could not read the people on this trip:', error.message || error);
    return [];
  }
  return (data || []).map((r) => ({
    userId: r.user_id,
    handle: r.handle,
    displayName: r.display_name || '',
    avatarEmoji: r.avatar_emoji || '',
    status: r.status,
    createdAt: r.created_at,
  }));
}

/** The invitations waiting on you. */
export async function listCoplanInvites() {
  if (MOCK) return MOCK === 'none' ? [] : MOCK_INVITES;
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('list_coplan_invites');
  if (error) {
    console.warn('[coplan] could not read your invitations:', error.message || error);
    return [];
  }
  return (data || []).map((r) => ({
    tripPlanId: r.trip_plan_id,
    label: r.label || '',
    ownerHandle: r.owner_handle,
    ownerName: r.owner_name || '',
    cities: r.cities || [],
    countries: r.countries || [],
    status: r.status,
    createdAt: r.created_at,
  }));
}

export async function inviteCoplanner(planId, ownerId, userId) {
  const { error } = await supabase
    .from('trip_collaborators')
    .insert({
      trip_plan_id: planId, user_id: userId, invited_by: ownerId, status: 'pending',
    });
  if (error) {
    // The primary key: they are already on this trip, pending or accepted.
    if (error.code === '23505') {
      const dup = new Error('already invited');
      dup.code = 'ALREADY_ON_TRIP';
      throw dup;
    }
    throw error;
  }
}

/** Accepting is an update the invitee is the only person allowed to make.
 *  Both keys are pinned so a stray planId cannot answer somebody else's. */
export async function acceptCoplanInvite(planId, myUserId) {
  const { error } = await supabase
    .from('trip_collaborators')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('trip_plan_id', planId)
    .eq('user_id', myUserId);
  if (error) throw error;
}

/** Declining, withdrawing and leaving are the same act on the same row. */
export async function removeCoplanner(planId, userId) {
  const { error } = await supabase
    .from('trip_collaborators')
    .delete()
    .eq('trip_plan_id', planId)
    .eq('user_id', userId);
  if (error) throw error;
}
