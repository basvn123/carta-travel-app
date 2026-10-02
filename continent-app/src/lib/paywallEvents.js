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

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

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

/*
 * LEAVING THE PAGE WITH THE MODAL OPEN (T314, row T265-b).
 *
 * Closing the tab, reloading, or typing a new address while the pass modal
 * stands open never runs the modal's close handler, so before this the
 * funnel counted the offer as shown and never as dismissed. The provider
 * listens for pagehide while a gate is open and calls trackPaywallOnExit.
 *
 * Why not trackPaywall: supabase-js reads the session through a promise and
 * sends with a plain fetch, and a page that is being unloaded cancels both.
 * A fetch with keepalive survives the unload, but it has to be sent in the
 * same tick as the pagehide event, so everything it needs (the URL, the anon
 * key and the access token) must already be in hand. The token is cached
 * here from onAuthStateChange, which also fires on every refresh. Signed out
 * it falls back to the anon key, exactly what supabase-js sends, and
 * paywall_event (022) is granted to anon. navigator.sendBeacon cannot carry
 * the apikey header PostgREST needs, which is why this is a fetch.
 *
 * Buying is not a dismissal. startCheckout calls markCheckoutRedirect just
 * before it hands the page to Stripe, and the pagehide that navigation
 * causes is then skipped. A page restored from the back-forward cache
 * (somebody pressing Back on the Stripe page) clears the mark again.
 */
let accessToken = '';
let leavingForCheckout = false;

if (supabase) {
  try {
    supabase.auth.onAuthStateChange((_event, session) => {
      accessToken = session?.access_token || '';
    });
  } catch { /* no token cached; the anon key is used instead */ }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) leavingForCheckout = false;
  });
}

/** Called by startCheckout right before the page navigates to Stripe. */
export function markCheckoutRedirect() {
  leavingForCheckout = true;
}

/** True once the page is on its way to Stripe. */
export function isLeavingForCheckout() {
  return leavingForCheckout;
}

/**
 * Record one funnel event from a pagehide handler. Same contract as
 * trackPaywall (never throws, never awaited) but sent as a keepalive fetch so
 * it outlives the page. Returns true when a request was handed to the
 * browser, which says nothing about whether it arrived.
 *
 * @param {'shown'|'dismissed'|'checkout'} event
 * @param {string} [reason]
 * @param {string} [tier]
 */
export function trackPaywallOnExit(event, reason = '', tier = '') {
  if (!supabase || !SUPABASE_URL || !ANON_KEY || !EVENTS.has(event)) return false;
  if (seenJustNow(`${event}:${reason}:${tier}`)) return false;
  try {
    fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/rpc/paywall_event`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON_KEY,
        Authorization: `Bearer ${accessToken || ANON_KEY}`,
      },
      body: JSON.stringify({ p_event: event, p_reason: reason || null, p_tier: tier || null }),
    }).then(() => {}, () => {});
    return true;
  } catch {
    return false;
  }
}
