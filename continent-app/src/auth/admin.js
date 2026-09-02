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

// Which tables the admin surface depends on are actually present. Older
// projects predate some of the satellite migrations, and a missing table
// should read as a named gap rather than as a screen full of zeroes.
export const adminHealth = () => call('admin_health');

export const adminAnalytics = () => call('admin_analytics');

/**
 * The pass funnel: offers shown, offers dismissed, buy buttons pressed, and
 * passes actually granted. Counts only; there is no RPC that returns a single
 * event, deliberately (see migration 022_paywall_events.sql).
 */
export const adminPaywallFunnel = (days = 30) =>
  call('admin_paywall_funnel', { p_days: days });

export const adminListFeedback = (status, limit = 50, offset = 0) =>
  call('admin_list_feedback', { p_status: status || null, p_limit: limit, p_offset: offset });

export const adminSetFeedbackStatus = (id, status) =>
  call('admin_set_feedback_status', { p_id: id, p_status: status });

// Catalogue corrections over the static wire layers (beaches, lakes,
// mountains, trails, destinations). An empty patch clears the override and
// restores whatever the pipeline says.
export const adminSetOverride = (layer, itemId, patch, note = null) =>
  call('admin_set_override', {
    p_layer: layer, p_item: String(itemId), p_patch: patch, p_note: note,
  });

export const adminListOverrides = (layer = null) =>
  call('admin_list_overrides', { p_layer: layer });
