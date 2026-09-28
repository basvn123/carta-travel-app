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

export const adminAiModelReport = (days = 30) =>
  call('admin_ai_model_report', { p_days: days });

/**
 * AI failures recorded by the planner and import wrappers (migration 040):
 * ai_timeout, ai_bad_output, url_unreachable and ai_error, per code, per
 * function, per upstream status and per day. Counts only; no RPC returns a
 * single failure. The window is capped at the 90-day retention.
 */
export const adminEdgeErrors = (days = 30) =>
  call('admin_edge_errors', { p_days: days });

/**
 * The ai_plan_cache hit rate (migration 029). One row per plan-day lookup,
 * hit or miss, so the rate is a division rather than a guess.
 *
 * This is the money number on the AI side: a hit is a Gemini generation not
 * bought and a plan the traveller gets immediately. The report is broken down
 * per day and per cache key version, so a change to the key (T039 normalised
 * it and moved it to v5) shows as a step in byVersion rather than as a
 * blended average that hides whether it worked.
 *
 * Returns { error } on a project where 029 has not been applied; the panel
 * treats that as "no section" rather than as a screen full of zeroes.
 */
export const adminAiCacheReport = (days = 30) =>
  call('admin_ai_cache_report', { p_days: days });

/**
 * The AI cost picture in one object (migration 030): daily consumption against
 * the shared ceiling, the headline cache hit rate, the ten heaviest accounts,
 * and how many requests were refused by a user cap versus by the global one.
 *
 * Plan and ground are separated everywhere, and must stay that way wherever
 * this is rendered. They are not two flavours of the same unit. A plan unit is
 * tokens on Gemini Flash and costs effectively nothing; a ground unit is a
 * billed Google Search query. Adding them together hides the only line item
 * that reliably costs money behind the one that does not.
 *
 * globalCap comes back alongside the percentages because SQL cannot read the
 * real ceiling: it lives in the Edge Function environment as
 * AI_GLOBAL_DAILY_CAP. The RPC reads a site_config mirror if one exists and
 * otherwise assumes 200, matching the function defaults, so the panel labels
 * the figure as assumed rather than presenting a percentage against a number
 * it cannot verify.
 *
 * Returns { error } on a project where 030 has not been applied; the panel
 * treats that as "no section" rather than as a screen full of zeroes.
 */
export const adminAiUsage = (days = 30) =>
  call('admin_ai_usage', { p_days: days });

/**
 * The VAT threshold monitor (migration 026). Cumulative cross-border EU B2C
 * sales per calendar year against the EUR 10,000 Article 59c limit, above
 * which the place of supply moves from Belgium to each buyer's member state
 * and a One Stop Shop registration is required.
 *
 * Stripe Tax does its own threshold monitoring in the Dashboard and that
 * remains the authoritative source, because it sees each transaction's tax
 * treatment and not just its amount. This is the backstop: the same figure
 * computed from our own pass_grants ledger, so nobody has to log into Stripe
 * to know how close the line is. If the two disagree, Stripe is right and
 * this is the thing that said to go and look.
 *
 * Returns thresholdCents, a years array (each with cents, sales, countries,
 * pct and breached), the current year's figure, and two integrity counts:
 * unknownCountry and unknownAmount. Those two matter, because a total built
 * from a ledger with holes in it is a floor and not the answer.
 *
 * No UI reads this yet. It is called from the SQL editor or from a later
 * admin task; the query is documented in Execution/P2/T033-stripe-tax-and-oss.md.
 */
export const adminOssThreshold = () => call('admin_oss_threshold');

/**
 * One calendar month of unit economics (migration 031), Europe/Amsterdam.
 *
 * This is the instrument for CARTA_UNIT_ECONOMICS.md. That document asserts a
 * blended contribution of EUR 6.85 per purchase and builds every strategic
 * conclusion on it: the EUR 0.17 allowable spend per visitor, the decision
 * that paid acquisition does not work, the ranking of the seven levers. None
 * of it had ever been checked against a sale. This RPC computes the same five
 * lines from the ledgers the product already writes and returns the
 * difference in cents and in percent.
 *
 * Read `basis` on each figure before quoting any of it. Two of the five lines
 * are observed and three are modelled. Sales and AI units are real. VAT is
 * applied at the rate the Article 59c posture implies rather than read from
 * Stripe, which is the only place the real tax is known. The Stripe fee is the
 * documented percentage plus the fixed fee, because nothing in this schema
 * stores the fee from the charge. Infrastructure comes from public.infra_ledger,
 * which is seeded with the unit economics document's own Tier 0 figures until
 * T016 puts real invoices in it.
 *
 * p_months_back is an offset, not a date: 0 is the month in progress and 1 is
 * the last closed month, which is the only month worth reconciling. The panel
 * opens on 1 and the RPC returns `closed` so an in-progress month is never
 * read as a result.
 *
 * Returns { error } on a project where 031 has not been applied; the panel
 * treats that as "no section" rather than as a screen full of zeroes.
 */
export const adminMargin = (monthsBack = 1) =>
  call('admin_margin', { p_months_back: monthsBack });

/**
 * Record one line of infrastructure spend for one month (migration 031).
 *
 * Passing source 'actual' is what turns a month from modelled into
 * reconcilable, and it is the only thing that does. A month with any
 * modelled row left in it reports reconciled false, because a reconciliation
 * against our own model proves only that the model equals itself.
 */
export const adminSetInfraCost = (month, item, cents, source = 'actual', note = null) =>
  call('admin_set_infra_cost', {
    p_month: month, p_item: item, p_cents: cents, p_source: source, p_note: note,
  });

export const adminListFeedback = (status, limit = 50, offset = 0) =>
  call('admin_list_feedback', { p_status: status || null, p_limit: limit, p_offset: offset });

export const adminSetFeedbackStatus = (id, status) =>
  call('admin_set_feedback_status', { p_id: id, p_status: status });

/**
 * Every published guide (trip_plans.visibility = 'public'), newest first,
 * with the author's email from auth.users and the view count (migration
 * 036). The email is read inside the SECURITY DEFINER function; the client
 * never touches auth.users.
 *
 * Returns { total, viewsCounted, rows }. viewsCounted is false because no
 * view counter exists in the schema yet, so every row's views is 0; the tab
 * says so rather than presenting 0 as a measurement. No arguments and no
 * limit: the plan asks for all of them (register row T067-b for paging).
 */
export const adminListPublicGuides = () => call('admin_list_public_guides');

/**
 * The DSA notice queue: reports visitors filed against public guides through
 * report_guide (migration 037), newest first. The table itself is private;
 * this definer RPC is the only read. status is 'new', 'actioned',
 * 'dismissed' or null for all.
 *
 * Returns { total, new, rows }; each row carries the reason, the reporter's
 * contact email when they gave one, the guide's title as reported and now,
 * whether it is still public, its owner, and how many reports share the
 * reporter's source and the guide.
 */
export const adminListContentReports = (status, limit = 50, offset = 0) =>
  call('admin_list_content_reports', { p_status: status || null, p_limit: limit, p_offset: offset });

/**
 * The takedown (migration 038): the guide goes private, nothing is deleted,
 * and the reason lands in the audit log. The owner keeps the trip. Every
 * report on the guide still marked new moves to actioned.
 *
 * Returns { ok, changed, visibility, reportsActioned }. changed is false when
 * the plan was already not public; nothing is written then. Refusals:
 * forbidden, slow_down, bad_reason (blank or over 2000 characters),
 * not_found.
 */
export const adminUnpublishGuide = (planId, reason) =>
  call('admin_unpublish_guide', { p_plan_id: planId, p_reason: reason });

/**
 * The decisions around a takedown (migration 039). Since 039 the takedown
 * above also writes a statement of reasons the owner reads in My trips and
 * returns its statementId.
 *
 * Dismiss: a report nobody acts on goes from new to dismissed with who,
 * when and why. { ok, changed, status }; changed false when the report was
 * already decided. Refusals: forbidden, slow_down, bad_reason, not_found.
 *
 * Decide: the answer to an owner's complaint, 'upheld' or 'reversed', with
 * a reason the owner reads. { ok, changed, outcome, reinstated }; reversing
 * republishes only when the owner changed nothing a reader would see and
 * left the plan private. Refusals: forbidden, slow_down, bad_outcome,
 * bad_reason, not_found, no_complaint.
 *
 * List: the complaints queue, { total, open, rows }.
 */
export const adminDismissContentReport = (reportId, reason) =>
  call('admin_dismiss_content_report', { p_report_id: reportId, p_reason: reason });

export const adminDecideComplaint = (statementId, outcome, reason) =>
  call('admin_decide_complaint', { p_statement_id: statementId, p_outcome: outcome, p_reason: reason });

export const adminListModerationComplaints = (status = 'open', limit = 50, offset = 0) =>
  call('admin_list_moderation_complaints', { p_status: status || null, p_limit: limit, p_offset: offset });

// Catalogue corrections over the static wire layers (beaches, lakes,
// mountains, trails, destinations). An empty patch clears the override and
// restores whatever the pipeline says.
export const adminSetOverride = (layer, itemId, patch, note = null) =>
  call('admin_set_override', {
    p_layer: layer, p_item: String(itemId), p_patch: patch, p_note: note,
  });

export const adminListOverrides = (layer = null) =>
  call('admin_list_overrides', { p_layer: layer });

/**
 * The pipeline's own health, from migration 041: when run_pipeline.py last
 * finished, which task keys ran / were skipped / failed / soft-failed, a row
 * count per natural-feature layer (beaches, lakes, mountains, trails,
 * cycling, regions), and the fare model's drift-gate verdict.
 *
 * The pipeline writes one row to pipeline_runs at the end of every run,
 * through a direct PostgREST insert with the service role key, from
 * wherever it happens to run (a laptop today; see Execution/P4/
 * T072-pipeline-health-metrics.md for why this does not assume Hetzner).
 * This RPC only reads the most recent row.
 *
 * Returns { hasRun: false } when no run has ever reported (a project where
 * 041 is applied but CARTA_SUPABASE_URL/CARTA_SUPABASE_SERVICE_KEY were
 * never set on the machine running the pipeline, or no run has happened
 * since). driftGate is null when the fare model has not trained yet or did
 * not run in the reported run, not a fabricated "ok".
 */
export const adminPipelineHealth = () => call('admin_pipeline_health');
