/**
 * profiles.js, the name another account can address you by.
 *
 * Carta had no such thing until now. auth.users is not readable from the
 * client and user_metadata.full_name is visible only to its owner, so one
 * account could not learn another account's name at all. Friends cannot exist
 * until they can.
 *
 * A profile is deliberately thin: a handle, a display name and an emoji. Every
 * field is meant to be seen by somebody else, so anything that is not (email,
 * where you live, how much you travel) is not allowed in.
 *
 * Lookup is by exact handle only. There is no prefix search, no listing, and
 * no lookup by email, because finding people by email turns the database into
 * an oracle answering "does this address have a Carta account" for any address
 * anybody cares to try. See supabase/migrations/010_profiles.sql, which holds
 * the reasoning and the enforcement.
 */
import { supabase } from '../lib/supabaseClient.js';

/** The same rule as the DB check constraint. Kept in both places on purpose:
 *  here so a traveller is told before they submit, there because that is the
 *  one that actually holds. */
export const HANDLE_RE = /^[a-z0-9_]{3,24}$/;
export const HANDLE_MIN = 3;
export const HANDLE_MAX = 24;

/** What a handle field should do to what somebody types, as they type it.
 *  Lowercases and drops what cannot appear, rather than rejecting the whole
 *  entry, so a capital letter is quietly accepted instead of scolded. */
export function normaliseHandle(input) {
  return String(input || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, HANDLE_MAX);
}

/** Which rule a handle breaks, as an i18n key, or null when it is fine. */
export function handleProblem(handle) {
  const h = String(handle || '');
  if (h.length < HANDLE_MIN) return 'profile.errHandleShort';
  if (h.length > HANDLE_MAX) return 'profile.errHandleLong';
  if (!HANDLE_RE.test(h)) return 'profile.errHandleChars';
  return null;
}

export async function fetchMyProfile(userId) {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, handle, display_name, avatar_emoji')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * Writes the parts of a profile its owner can change.
 *
 * A taken handle comes back from Postgres as a unique violation (23505). It is
 * turned into its own error here so the caller can say "that handle is taken"
 * without ever asking who took it: the answer to "is this free" is public by
 * necessity, the answer to "whose is it" is not.
 */
export async function saveMyProfile(userId, patch) {
  const row = { updated_at: new Date().toISOString() };
  if (patch.handle !== undefined) row.handle = normaliseHandle(patch.handle);
  if (patch.displayName !== undefined) row.display_name = patch.displayName?.trim() || null;
  if (patch.avatarEmoji !== undefined) row.avatar_emoji = patch.avatarEmoji || null;

  const { error } = await supabase.from('profiles').update(row).eq('user_id', userId);
  if (error) {
    if (error.code === '23505') {
      const taken = new Error('handle taken');
      taken.code = 'HANDLE_TAKEN';
      throw taken;
    }
    // 23514 is the check constraint: the client validated first, so reaching
    // this means the two rules have drifted apart and the DB one won.
    if (error.code === '23514') {
      const bad = new Error('handle rejected');
      bad.code = 'HANDLE_INVALID';
      throw bad;
    }
    throw error;
  }
}

/** One account, by exact handle, or null. Signed-in callers only, enforced by
 *  the grant on the function rather than by this module. */
export async function findByHandle(handle) {
  if (!supabase) return null;
  const wanted = normaliseHandle(handle);
  if (handleProblem(wanted)) return null;
  const { data, error } = await supabase.rpc('find_profile_by_handle', { wanted });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    userId: row.user_id,
    handle: row.handle,
    displayName: row.display_name || '',
    avatarEmoji: row.avatar_emoji || '',
  };
}

/** How a profile should be named on screen: what they chose to be called, or
 *  their handle when they have not chosen. Never their email. */
export function profileLabel(profile) {
  if (!profile) return '';
  return profile.displayName?.trim() || profile.display_name?.trim() || `@${profile.handle}`;
}
