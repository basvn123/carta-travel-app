/**
 * edgeFailure.js, the one writer for AI failure telemetry.
 *
 * plan-day, suggest-city and parse-booking answer a failure with a typed
 * code, and the wrappers (aiDayPlan.js, aiCitySuggest.js, bookingImport.js)
 * turn it into the { ok: false, code } the screens show a message for. Each
 * wrapper calls reportEdgeFailure on its way out, so the failure is sent
 * before the caller ever sees the result, and therefore before any message
 * is on screen. The table and its limits are in migration 040_edge_errors.sql.
 *
 * FIRST PARTY, NOTHING ON THE DEVICE. This is one RPC through the Supabase
 * client and the session the traveller already has. No cookie, no local
 * storage, no device or session id, no page path, no URL they pasted, no
 * document content, no error text. That is why it needs no consent banner
 * where a Sentry SDK would (see Execution/P4/T071-error-telemetry.md).
 *
 * FIRE AND FORGET. Never awaited, never throws. Until 040 is pasted the RPC
 * answers "function not found" and that answer is dropped here, so the
 * failure path the traveller is already on is never made worse by this.
 */
import { supabase } from '../lib/supabaseClient.js';

/**
 * The codes that mean the service failed, as opposed to the traveller's own
 * state (signed out, out of plans, too few places) or a switched-off
 * function. Only these are recorded; the table refuses anything else too.
 *
 * client_crash is the ErrorBoundary's code (T083): a render error the
 * traveller saw as the crash panel. It travels through the same RPC with
 * fn 'app' and origin 'client'. Until a migration widens 040's two closed
 * lists (fn and code) the writer drops it exactly as it drops any other
 * unknown code, which costs nothing on the traveller's side; register row
 * T083-b carries the SQL.
 */
const RECORDED = new Set(['ai_timeout', 'ai_bad_output', 'url_unreachable', 'ai_error', 'client_crash']);

const httpStatus = (n) => (Number.isInteger(n) && n >= 100 && n <= 599 ? n : null);

/**
 * The ErrorBoundary's one call. What is sent is the fact of a crash and
 * nothing else: no message, no stack, no component name, no page, for the
 * same reason the edge failures carry no body (see the header). The console
 * keeps the detail for whoever is looking at the screen; the row says only
 * that the app fell over for a signed-in traveller, and when.
 */
export function reportClientCrash() {
  reportEdgeFailure('app', 'client_crash', { origin: 'client' });
}

/**
 * @param {'plan-day'|'suggest-city'|'parse-booking'|'app'} fn
 * @param {string} code  the code the wrapper is about to return
 * @param {{ origin?: 'edge'|'client', http?: number, upstream?: number }} [meta]
 *   origin 'client' when the function answered 2xx and the wrapper's own
 *   shape check refused the body; http is the function's answer status;
 *   upstream is the status the function passed on from Gemini or the site.
 */
export function reportEdgeFailure(fn, code, { origin = 'edge', http = null, upstream = null } = {}) {
  if (!supabase || !RECORDED.has(code)) return;
  try {
    supabase
      .rpc('log_edge_error', {
        p_fn: fn,
        p_code: code,
        p_origin: origin,
        p_http: httpStatus(http),
        p_upstream: httpStatus(upstream),
      })
      .then(() => {}, () => {});
  } catch { /* the failure path carries on regardless */ }
}
