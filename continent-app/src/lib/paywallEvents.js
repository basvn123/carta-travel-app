/**
 * paywallEvents.js, the client half of the pass funnel.
 *
 * Records three things and nothing else: an offer was shown, an offer was
 * dismissed, a buy button was pressed. Completed purchases are NOT recorded
 * here, because a client saying "I bought it" is worthless; they come from
 * pass_grants, which only the Stripe webhook writes. See migration
 * 022_paywall_events.sql for the whole argument.
 *
 * FIRE AND FORGET, ALWAYS. Every call resolves, none of them throw, and none
 * of them are awaited by the paywall. An analytics write that can fail a gate
 * is worse than no analytics at all, so the failure mode here is silence.
 *
 * There is no device id, no session id and no page path. The table cannot
 * answer a question this file does not send it, and keeping it that way is
 * cheaper now than arguing about it later.
 */
import { supabase } from './supabaseClient.js';

/** Events the server will accept. Anything else is dropped before the wire. */
const EVENTS = new Set(['shown', 'dismissed', 'checkout']);

/**
 * A gate opening twice in the same tick (React strict mode double-invokes
 * effects in development, and a re-render can re-run one) would double every
 * number in the funnel. Same event, same reason, inside this window, once.
 */
const DEDUPE_MS = 1500;
const recent = new Map();

function seenJustNow(key) {
  const now = Date.now();
  const last = recent.get(key);
  if (last && now - last < DEDUPE_MS) return true;
  recent.set(key, now);
  // The map only ever holds a handful of keys, but a long session should not
  // grow it without bound either.
  if (recent.size > 64) {
    for (const [k, t] of recent) if (now - t > DEDUPE_MS) recent.delete(k);
  }
  return false;
}

/**
 * Record one funnel event.
 *
 * @param {'shown'|'dismissed'|'checkout'} event
 * @param {string} [reason]  the gate reason code, or the tier on a checkout
 * @param {string} [tier]    the tier held at the time, or being bought
 */
export function trackPaywall(event, reason = '', tier = '') {
  if (!supabase || !EVENTS.has(event)) return;
  if (seenJustNow(`${event}:${reason}:${tier}`)) return;
  try {
    // Not awaited. The promise is caught so an offline browser does not log an
    // unhandled rejection on every gate.
    supabase
      .rpc('paywall_event', { p_event: event, p_reason: reason || null, p_tier: tier || null })
      .then(() => {}, () => {});
  } catch { /* the paywall carries on regardless */ }
}
