/**
 * groupTrips.js, a few friends deciding one trip (T931, migration 055).
 *
 * Every rule that makes this safe is in SQL: who may be invited (an
 * accepted friend of the owner), one vote per member per question, and the
 * private budget that only its owner can read. The band comes back from
 * group_trip_band() as one number; no other member's maximum is ever read.
 *
 * Works before 055 is applied: a missing table or function answers
 * `{ missing: true, groups: [] }`, and the Together page shows no Group trips
 * block rather than an error.
 *
 * Under ?friendsmock the Together store (src/together/useTogether.js) never
 * calls this module: its fixture stands in and changes in memory.
 */
import { getSupabase } from '../lib/supabaseClient.js';
import { isMissing } from './friendVisibility.js';
import { bandState } from '../together/groupBand.js';
import { createTripPlan, saveTripPlanStops } from './tripPlanStorage.js';
import { inviteCoplanner } from './coplanners.js';

const MISSING = { missing: true, groups: [] };

function optionFromRow(r) {
  return r.kind === 'when'
    ? { id: r.id, kind: 'when', start: r.start_date, end: r.end_date, createdBy: r.created_by }
    : { id: r.id, kind: 'where', destId: r.destination_id, createdBy: r.created_by };
}

/** Your group trips with everything the page draws. */
export async function listGroupTrips(userId) {
  const supabase = await getSupabase();
  if (!supabase || !userId) return MISSING;
  const { data: trips, error } = await supabase
    .from('group_trips')
    .select('id, owner_id, title, booked_plan_id, created_at')
    .order('created_at', { ascending: false });
  if (error) {
    if (!isMissing(error)) console.warn('[groups] could not read group trips:', error.message || error);
    return MISSING;
  }
  if (!trips?.length) return { missing: false, groups: [] };
  const ids = trips.map((g) => g.id);
  const [people, options, votes, budgets] = await Promise.all([
    supabase.rpc('group_trip_people'),
    supabase.from('group_trip_options').select('id, group_id, kind, start_date, end_date, destination_id, created_by, created_at').in('group_id', ids).order('created_at'),
    supabase.from('group_trip_votes').select('group_id, kind, user_id, option_id').in('group_id', ids),
    supabase.from('group_trip_budgets').select('group_id, max_day').eq('user_id', userId).in('group_id', ids),
  ]);
  const by = (rows, key = 'group_id') => {
    const m = new Map();
    for (const r of rows || []) { if (!m.has(r[key])) m.set(r[key], []); m.get(r[key]).push(r); }
    return m;
  };
  const peopleBy = by(people.data);
  const optBy = by(options.data);
  const voteBy = by(votes.data);
  const budgetBy = new Map((budgets.data || []).map((b) => [b.group_id, b.max_day]));
  const groups = await Promise.all(trips.map(async (g) => {
    const members = (peopleBy.get(g.id) || []).map((p) => ({
      userId: p.user_id, status: p.status, handle: p.handle, name: p.display_name || `@${p.handle}`, emoji: p.avatar_emoji || '',
    }));
    const myStatus = g.owner_id === userId ? 'joined' : (members.find((m) => m.userId === userId)?.status || 'invited');
    let band = bandState(null);
    if (myStatus === 'joined') {
      const { data } = await supabase.rpc('group_trip_band', { g: g.id });
      band = bandState(Array.isArray(data) ? data[0] : data);
    }
    return {
      id: g.id,
      title: g.title,
      ownerId: g.owner_id,
      bookedPlanId: g.booked_plan_id || null,
      myStatus,
      members,
      options: (optBy.get(g.id) || []).map(optionFromRow),
      votes: (voteBy.get(g.id) || []).map((v) => ({ kind: v.kind, userId: v.user_id, optionId: v.option_id })),
      myBudget: budgetBy.has(g.id) ? Number(budgetBy.get(g.id)) : null,
      band,
    };
  }));
  return { missing: false, groups };
}

/** A new group trip with its first invitations. Returns the id. */
export async function createGroupTrip(userId, title, friendIds = []) {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('group_trips')
    .insert({ owner_id: userId, title: String(title || '').trim().slice(0, 80) })
    .select('id')
    .single();
  if (error) throw error;
  if (friendIds.length) {
    const { error: mErr } = await supabase.from('group_trip_members').insert(
      friendIds.map((id) => ({ group_id: data.id, user_id: id, invited_by: userId, status: 'invited' })),
    );
    if (mErr) throw mErr;
  }
  return data.id;
}

export async function respondGroupInvite(groupId, userId, yes) {
  const supabase = await getSupabase();
  const q = yes
    ? supabase.from('group_trip_members').update({ status: 'joined', responded_at: new Date().toISOString() })
    : supabase.from('group_trip_members').delete();
  const { error } = await q.eq('group_id', groupId).eq('user_id', userId);
  if (error) throw error;
}

/** A date option ({ start, end }) or a place option ({ destId }). */
export async function addGroupOption(groupId, option) {
  const supabase = await getSupabase();
  const row = option.kind === 'when'
    ? { group_id: groupId, kind: 'when', start_date: option.start, end_date: option.end }
    : { group_id: groupId, kind: 'where', destination_id: option.destId };
  const { error } = await supabase.from('group_trip_options').insert(row);
  if (error) throw error;
}

/** Your one vote on a question; null optionId takes it back. */
export async function castGroupVote(groupId, userId, kind, optionId) {
  const supabase = await getSupabase();
  if (!optionId) {
    const { error } = await supabase.from('group_trip_votes').delete()
      .eq('group_id', groupId).eq('kind', kind).eq('user_id', userId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from('group_trip_votes')
    .upsert({ group_id: groupId, kind, user_id: userId, option_id: optionId }, { onConflict: 'group_id,kind,user_id' });
  if (error) throw error;
}

/** Your private maximum a day, whole euros; null removes it. */
export async function setGroupBudget(groupId, userId, maxDay) {
  const supabase = await getSupabase();
  if (maxDay == null) {
    const { error } = await supabase.from('group_trip_budgets').delete().eq('group_id', groupId).eq('user_id', userId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from('group_trip_budgets').upsert(
    { group_id: groupId, user_id: userId, max_day: Math.round(maxDay), updated_at: new Date().toISOString() },
    { onConflict: 'group_id,user_id' },
  );
  if (error) throw error;
}

/**
 * Book it for the group: a trip plan at the winning place and dates, the
 * other joined members invited as co-planners (each is an accepted friend of
 * the owner, which is what 020 requires), and the group marked booked.
 * Owner only. Returns the new plan id.
 */
export async function bookGroupTrip(group, userId, { destId, city, country, start, end }) {
  const planId = await createTripPlan(userId, group.title);
  await saveTripPlanStops(planId, userId, [{
    destinationId: destId, city, country, arriveDate: start, departDate: end,
  }]);
  for (const m of group.members) {
    if (m.userId === userId || m.status !== 'joined') continue;
    try { await inviteCoplanner(planId, userId, m.userId); } catch (err) {
      if (err?.code !== 'ALREADY_ON_TRIP') console.warn('[groups] could not invite a member:', err?.message || err);
    }
  }
  const supabase = await getSupabase();
  const { error } = await supabase.from('group_trips')
    .update({ booked_plan_id: planId, updated_at: new Date().toISOString() }).eq('id', group.id);
  if (error) throw error;
  return planId;
}

