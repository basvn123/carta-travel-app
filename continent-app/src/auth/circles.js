/**
 * circles.js, kringen: a lasting group of friends that proposes trips, votes
 * them up or down, marks the dates it can travel and compares each member's
 * fare (G16, decision 0017, migration 078).
 *
 * Every rule that keeps a kring private is in SQL: only the owner invites,
 * only accepted friends of the owner, and each member writes only their own
 * votes, dates and home airport.
 *
 * Works before 078 is applied: a missing table or function answers
 * `{ missing: true, circles: [] }`, and the Vrienden page shows no Kringen
 * section rather than an error, the way groupTrips.js does for 055.
 *
 * Under ?friendsmock the Together store never calls this module: its
 * fixture (src/together/circleMock.js) stands in and changes in memory.
 */
import { getSupabase } from '../lib/supabaseClient.js';
import { isMissing } from './friendVisibility.js';
import { createTripPlan, saveTripPlanStops } from './tripPlanStorage.js';
import { inviteCoplanner } from './coplanners.js';

const MISSING = { missing: true, circles: [] };

/* A kring link (#circle=<id>): in the hash like every link this app hands
 * out, held in this tab's session storage through a sign-in round trip. */
const CIRCLE_PARAM = 'circle';
const CIRCLE_KEY = 'carta.pendingCircle';
const CIRCLE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function circleLink(id) {
  if (typeof window === 'undefined' || !CIRCLE_ID.test(id || '')) return null;
  return `${window.location.origin}${window.location.pathname}#${CIRCLE_PARAM}=${id}`;
}

export function readCircleFromUrl() {
  if (typeof window === 'undefined') return null;
  const hash = (window.location.hash || '').replace(/^#/, '');
  const fromHash = hash.includes(`${CIRCLE_PARAM}=`) ? new URLSearchParams(hash).get(CIRCLE_PARAM) : null;
  let held = null;
  try { held = sessionStorage.getItem(CIRCLE_KEY); } catch { /* private mode */ }
  const id = fromHash || held;
  return CIRCLE_ID.test(id || '') ? id : null;
}

export function holdCircle(id) {
  try { if (id) sessionStorage.setItem(CIRCLE_KEY, id); else sessionStorage.removeItem(CIRCLE_KEY); } catch { /* private mode */ }
}

export function stripCircleFromUrl() {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
  if (!params.has(CIRCLE_PARAM)) return;
  params.delete(CIRCLE_PARAM);
  const rest = params.toString();
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${rest ? `#${rest}` : ''}`);
}

/** Your kringen with everything the screens draw. */
export async function listCircles(userId) {
  const supabase = await getSupabase();
  if (!supabase || !userId) return MISSING;
  const { data: rows, error } = await supabase
    .from('circles')
    .select('id, owner_id, name, created_at')
    .order('created_at', { ascending: false });
  if (error) {
    if (!isMissing(error)) console.warn('[circles] could not read kringen:', error.message || error);
    return MISSING;
  }
  if (!rows?.length) return { missing: false, circles: [] };
  const ids = rows.map((c) => c.id);
  const [people, proposals, votes, avail] = await Promise.all([
    supabase.rpc('circle_people'),
    supabase.from('circle_proposals').select('id, circle_id, destination_id, created_by, created_at').in('circle_id', ids).order('created_at'),
    supabase.from('circle_votes').select('circle_id, proposal_id, user_id, value').in('circle_id', ids),
    supabase.from('circle_availability').select('id, circle_id, user_id, start_date, end_date').in('circle_id', ids).order('start_date'),
  ]);
  const by = (res) => {
    const m = new Map();
    for (const r of res?.data || []) { if (!m.has(r.circle_id)) m.set(r.circle_id, []); m.get(r.circle_id).push(r); }
    return m;
  };
  const peopleBy = by(people);
  const propBy = by(proposals);
  const voteBy = by(votes);
  const availBy = by(avail);
  const circles = rows.map((c) => {
    const members = (peopleBy.get(c.id) || []).map((p) => ({
      userId: p.user_id, status: p.status, handle: p.handle, name: p.display_name || `@${p.handle}`,
      emoji: p.avatar_emoji || '', homeAirport: p.home_airport || null,
    }));
    const myStatus = c.owner_id === userId ? 'joined' : (members.find((m) => m.userId === userId)?.status || 'invited');
    return {
      id: c.id,
      name: c.name,
      ownerId: c.owner_id,
      createdAt: c.created_at,
      myStatus,
      members,
      proposals: (propBy.get(c.id) || []).map((p) => ({ id: p.id, destId: p.destination_id, createdBy: p.created_by, created_at: p.created_at })),
      votes: voteBy.get(c.id) || [],
      availability: availBy.get(c.id) || [],
    };
  });
  return { missing: false, circles };
}

/** A new kring with its first invitations. Returns the id. */
export async function createCircle(userId, name, friendIds = []) {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('circles')
    .insert({ owner_id: userId, name: String(name || '').trim().slice(0, 40) })
    .select('id')
    .single();
  if (error) throw error;
  if (friendIds.length) {
    const { error: mErr } = await supabase.from('circle_members').insert(
      friendIds.map((id) => ({ circle_id: data.id, user_id: id, invited_by: userId, status: 'invited' })),
    );
    if (mErr) throw mErr;
  }
  return data.id;
}

export async function respondCircleInvite(circleId, userId, yes) {
  const supabase = await getSupabase();
  const q = yes
    ? supabase.from('circle_members').update({ status: 'joined', responded_at: new Date().toISOString() })
    : supabase.from('circle_members').delete();
  const { error } = await q.eq('circle_id', circleId).eq('user_id', userId);
  if (error) throw error;
}

export async function addProposal(circleId, destId) {
  const supabase = await getSupabase();
  const { error } = await supabase.from('circle_proposals').insert({ circle_id: circleId, destination_id: destId });
  if (error) throw error;
}

export async function deleteProposal(proposalId) {
  const supabase = await getSupabase();
  const { error } = await supabase.from('circle_proposals').delete().eq('id', proposalId);
  if (error) throw error;
}

/** Your vote on a proposal: 1, -1, or 0 to take it back. */
export async function castCircleVote(circleId, proposalId, userId, value) {
  const supabase = await getSupabase();
  if (!value) {
    const { error } = await supabase.from('circle_votes').delete().eq('proposal_id', proposalId).eq('user_id', userId);
    if (error) throw error;
    return;
  }
  // Change the vote first, insert only when there is none. An upsert would
  // also try to update circle_id, proposal_id and user_id, which migration
  // 078 rightly does not grant (members may change only value and updated_at).
  const now = new Date().toISOString();
  const { data, error: uErr } = await supabase.from('circle_votes')
    .update({ value, updated_at: now })
    .eq('proposal_id', proposalId).eq('user_id', userId)
    .select('proposal_id');
  if (uErr) throw uErr;
  if (data && data.length) return;
  const { error } = await supabase.from('circle_votes').insert(
    { circle_id: circleId, proposal_id: proposalId, user_id: userId, value, updated_at: now },
  );
  if (error) throw error;
}

/** Your date ranges, replaced as a whole ([{ start, end }], at most 20). */
export async function setMyAvailability(circleId, userId, ranges) {
  const supabase = await getSupabase();
  const { error: dErr } = await supabase.from('circle_availability').delete().eq('circle_id', circleId).eq('user_id', userId);
  if (dErr) throw dErr;
  const rows = (ranges || []).slice(0, 20).map((r) => ({ circle_id: circleId, user_id: userId, start_date: r.start, end_date: r.end }));
  if (!rows.length) return;
  const { error } = await supabase.from('circle_availability').insert(rows);
  if (error) throw error;
}

export async function setMyHomeAirport(circleId, userId, code) {
  const supabase = await getSupabase();
  const iata = code && /^[A-Z]{3}$/.test(code) ? code : null;
  const { error } = await supabase.from('circle_members')
    .update({ home_airport: iata, updated_at: new Date().toISOString() })
    .eq('circle_id', circleId).eq('user_id', userId);
  if (error) throw error;
}

/**
 * Make the trip: a trip plan at the chosen place and dates, with the other
 * joined members invited as co-planners through the coplan flow (each is an
 * accepted friend of the owner, which is what 020 requires). Owner only.
 * Returns the new plan id.
 */
export async function makeCircleTrip(circle, userId, { destId, city, country, start, end }) {
  const planId = await createTripPlan(userId, circle.name);
  await saveTripPlanStops(planId, userId, [{
    destinationId: destId, city, country, arriveDate: start, departDate: end,
  }]);
  for (const m of circle.members) {
    if (m.userId === userId || m.status !== 'joined') continue;
    try { await inviteCoplanner(planId, userId, m.userId); } catch (err) {
      if (err?.code !== 'ALREADY_ON_TRIP') console.warn('[circles] could not invite a member:', err?.message || err);
    }
  }
  return planId;
}
