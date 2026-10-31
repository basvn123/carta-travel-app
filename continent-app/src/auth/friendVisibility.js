/**
 * friendVisibility.js, what you show your friends and what they show you
 * (T932, migration 056).
 *
 * Your own "Friends see" switches are one row in friend_visibility that only
 * you write. What a friend shows you comes back through list_friend_shares(),
 * which applies THEIR switches on the server: a save or a tip that is not
 * switched on never reaches this browser, so nothing here has to hide it.
 * What a trip cost is never shared with friends at all (owner, T937).
 *
 * Trips stay chosen one by one (trip_plans.visibility, 011); that is not a
 * switch here.
 *
 * On a project without 056 every read answers the defaults or nothing, and
 * the page shows only what list_friend_trips already shows.
 */
import { getSupabase } from '../lib/supabaseClient.js';
import { removeFriendLink } from './friends.js';

/** The defaults 056 writes, and what a missing row means. Saves stay off
 *  until the account switches them on. There is no cost switch (T937). */
export const DEFAULT_VISIBILITY = Object.freeze({
  showCountries: true, showSaves: false, showTips: true, showMeet: true,
});

export const VISIBILITY_KEYS = ['showCountries', 'showSaves', 'showTips', 'showMeet'];
const COL = {
  showCountries: 'show_countries', showSaves: 'show_saves', showTips: 'show_tips', showMeet: 'show_meet',
};

/** A missing table or function: the migration is not applied yet. */
export function isMissing(error) {
  return Boolean(error) && ['42P01', 'PGRST205', 'PGRST202', '42883'].includes(error.code);
}

function fromRow(r) {
  const out = { ...DEFAULT_VISIBILITY };
  if (!r) return out;
  for (const k of VISIBILITY_KEYS) if (typeof r[COL[k]] === 'boolean') out[k] = r[COL[k]];
  return out;
}

/** Your switches: { visibility, missing }. */
export async function fetchMyVisibility(userId) {
  const supabase = await getSupabase();
  if (!supabase || !userId) return { visibility: { ...DEFAULT_VISIBILITY }, missing: true };
  const { data, error } = await supabase
    .from('friend_visibility')
    .select('show_countries, show_saves, show_tips, show_meet')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { visibility: { ...DEFAULT_VISIBILITY }, missing: isMissing(error) };
  return { visibility: fromRow(data), missing: false };
}

/** Writes the whole row (upsert), so a first switch creates it. */
export async function saveMyVisibility(userId, visibility) {
  const supabase = await getSupabase();
  const row = { user_id: userId, updated_at: new Date().toISOString() };
  for (const k of VISIBILITY_KEYS) row[COL[k]] = Boolean(visibility[k]);
  const { error } = await supabase.from('friend_visibility').upsert(row, { onConflict: 'user_id' });
  if (error) throw error;
}

/**
 * What each accepted friend shows you, as a Map friendId ->
 *   { showCountries, showSaves, showTips, showMeet,
 *     countries: [name], saves: [favKey],
 *     trips: Map tripPlanId -> { stops, tip } }
 * An empty Map without 056.
 */
export async function listFriendShares() {
  const supabase = await getSupabase();
  if (!supabase) return new Map();
  const { data, error } = await supabase.rpc('list_friend_shares');
  if (error) {
    if (!isMissing(error)) console.warn('[friends] could not read what friends share:', error.message || error);
    return new Map();
  }
  const out = new Map();
  for (const r of data || []) {
    const trips = new Map();
    for (const tr of Array.isArray(r.trips) ? r.trips : []) {
      if (!tr?.trip_plan_id) continue;
      trips.set(tr.trip_plan_id, {
        stops: Array.isArray(tr.stops) ? tr.stops : [],
        tip: typeof tr.tip === 'string' && tr.tip.trim() ? tr.tip.trim() : null,
      });
    }
    out.set(r.friend_id, {
      ...fromRow(r),
      countries: Array.isArray(r.countries) ? r.countries.filter((c) => typeof c === 'string') : [],
      saves: Array.isArray(r.saves) ? r.saves.filter((c) => typeof c === 'string') : [],
      trips,
    });
  }
  return out;
}

/** Block, silently. Without 056 it removes the link instead, which is the
 *  closest thing 011 offers and is as silent. */
export async function blockFriendLink(linkId) {
  const supabase = await getSupabase();
  const { error } = await supabase.rpc('block_friend_link', { link: linkId });
  if (error) {
    if (isMissing(error)) { await removeFriendLink(linkId); return; }
    throw error;
  }
}
