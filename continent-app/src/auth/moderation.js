/**
 * The owner's side of a moderation decision (migration 039).
 *
 * When a moderator takes a public guide down, the database writes a
 * statement of reasons (DSA Article 17) on public.moderation_statements.
 * The owner reads their own rows straight from the table: RLS lets a
 * signed-in user see only rows where owner_id is their id, and a column
 * grant keeps back which moderator decided and the content hash. So the
 * select below names its columns; `select *` would be refused.
 *
 * The complaint (Article 20) goes through contest_moderation_decision, a
 * definer RPC that accepts one complaint per statement from its owner,
 * within six months, free of charge.
 *
 * There is no email route for this in the project, so the app is the
 * delivery: SavedTripsPanel shows the statement against the plan.
 */
import { supabase } from '../lib/supabaseClient.js';

const BASE_COLS = [
  'id', 'plan_id', 'plan_label', 'source', 'notice_count', 'facts', 'automated',
  'created_at', 'contest_until', 'complaint_status', 'complaint_note', 'reinstated',
];
// The ground of the decision (migration 051, T365): 'illegal' with the law
// relied on, or 'terms' with the item of the content rule in the Terms
// ('c1' to 'c7'). Null on statements written before 051.
const OWNER_COLS = [...BASE_COLS, 'ground', 'ground_ref'].join(', ');

/** Every statement about the signed-in user's plans, newest first. Until
 *  051 is pasted the two ground columns do not exist (Postgres 42703), so
 *  the read falls back to the columns 039 grants and the notice shows no
 *  ground, rather than hiding every statement. */
export async function fetchMyStatements() {
  if (!supabase) return [];
  const read = (cols) => supabase
    .from('moderation_statements')
    .select(cols)
    .order('created_at', { ascending: false });
  let { data, error } = await read(OWNER_COLS);
  if (error && error.code === '42703') ({ data, error } = await read(BASE_COLS.join(', ')));
  if (error) throw error;
  return data || [];
}

/**
 * Lodge a complaint against one statement. Resolves to { ok, status } or
 * throws an Error whose `code` is the RPC's word: bad_reason, not_found,
 * already_contested, too_late, forbidden.
 */
export async function contestStatement(statementId, body) {
  if (!supabase) {
    const err = new Error('auth_not_configured');
    err.code = 'auth_not_configured';
    throw err;
  }
  const { data, error } = await supabase.rpc('contest_moderation_decision', {
    p_statement_id: statementId,
    p_body: body,
  });
  if (error) throw error;
  if (data && data.error) {
    const err = new Error(data.error);
    err.code = data.error;
    throw err;
  }
  return data;
}

/** The newest statement per plan id, for looking one up against a card. */
export function latestByPlan(rows) {
  const out = {};
  for (const r of rows || []) {
    if (!out[r.plan_id]) out[r.plan_id] = r;
  }
  return out;
}
