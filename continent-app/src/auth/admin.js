/**
 * The admin surface's only door to the database. Every function here calls a
 * SECURITY DEFINER RPC from migration 014 that re-checks admin membership on
 * the server before touching anything, so this file holds no privileges of
 * its own and nothing in it is trusted.
 *
 * The RPCs answer jsonb with an `error` field on refusal ("forbidden",
 * "confirm_mismatch", "target_is_admin", ...). That field is promoted to a
 * thrown Error with `code` set, so callers handle transport failures and
 * refusals through one catch.
 */
import { supabase } from '../lib/supabaseClient.js';

async function call(fn, args) {
  if (!supabase) {
    const err = new Error('auth_not_configured');
    err.code = 'auth_not_configured';
    throw err;
  }
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  if (data && data.error) {
    const err = new Error(data.error);
    err.code = data.error;
    throw err;
  }
  return data;
}

export const adminStats = () => call('admin_stats');

export const adminListUsers = (search, limit = 50, offset = 0) =>
  call('admin_list_users', { p_search: search || null, p_limit: limit, p_offset: offset });

export const adminGetUser = (userId) =>
  call('admin_get_user', { p_user: userId });

export const adminSetTier = (userId, tier, days = null) =>
  call('admin_set_tier', { p_user: userId, p_tier: tier, p_days: days });

export const adminResetQuota = (userId) =>
  call('admin_reset_quota', { p_user: userId });

export const adminDeleteUser = (userId, confirmText) =>
  call('admin_delete_user', { p_user: userId, p_confirm: confirmText });

export const adminSetConfig = (key, value) =>
  call('admin_set_config', { p_key: key, p_value: value });

export const adminGetAudit = (limit = 50, offset = 0) =>
  call('admin_get_audit', { p_limit: limit, p_offset: offset });

export const adminBanUser = (userId, days) =>
  call('admin_ban_user', { p_user: userId, p_days: days });

export const adminUnbanUser = (userId) =>
  call('admin_unban_user', { p_user: userId });

export const adminAddNote = (userId, note) =>
  call('admin_add_note', { p_user: userId, p_note: note });

export const adminMark = (action, userId) =>
  call('admin_mark', { p_action: action, p_target: userId });
