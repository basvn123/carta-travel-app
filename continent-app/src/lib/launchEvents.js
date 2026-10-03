/**
 * launchEvents.js, the client half of the launch counters (migration 048).
 *
 * Three counts and nothing else: a priced trip was finished in the wizard, a
 * decorated partner link was followed, an AI function was called. Each one
 * is a tick on a per-day counter on the server. There is no event row, no
 * device id, no session id, no page path and no time of day, so the counter
 * cannot be turned into a trail of what one person did. That is the T214
 * decision (Execution/P12/T214-analytics-decision.md): first-party RPCs only,
 * nothing stored on the device, no script, so no consent banner.
 *
 * FIRE AND FORGET, ALWAYS. Every call resolves, none throws, none is awaited.
 * Until 048 is pasted the RPC answers "function not found" and that answer is
 * dropped here, so a link or a wizard is never made worse by a counter.
 */
import { supabase } from './supabaseClient.js';
import { aviasalesClickOf } from './affiliate.js';
import { activityClickOf } from './activityAffiliates.js';
import { omioClickOf } from './omio.js';

const EVENTS = new Set(['trip_priced', 'affiliate_click', 'ai_call']);

/**
 * The same tick twice inside this window counts once: React strict mode runs
 * some handlers twice in development, and a double click on a link or on the
 * wizard's last button is one intention.
 */
const DEDUPE_MS = 1500;
const recent = new Map();

function seenJustNow(key) {
  const now = Date.now();
  const last = recent.get(key);
  if (last && now - last < DEDUPE_MS) return true;
  recent.set(key, now);
  if (recent.size > 64) {
    for (const [k, t] of recent) if (now - t > DEDUPE_MS) recent.delete(k);
  }
  return false;
}

/**
 * Count one launch event.
 *
 * @param {'trip_priced'|'affiliate_click'|'ai_call'} event
 * @param {string} [target]   the partner or the AI function
 * @param {string} [surface]  the sub-ID, or 'built' / 'ready' for a trip
 * @param {string} [dedupeKey] what makes two ticks the same; defaults to the three fields
 */
export function trackLaunch(event, target = '', surface = '', dedupeKey = '') {
  if (!supabase || !EVENTS.has(event)) return;
  if (seenJustNow(dedupeKey || `${event}:${target}:${surface}`)) return;
  try {
    supabase
      .rpc('launch_count', { p_event: event, p_target: target || null, p_surface: surface || null })
      .then(() => {}, () => {});
  } catch { /* the traveller carries on regardless */ }
}

/** One AI call, counted before the request goes out (the denominator of the
 *  AI failures card). Every call counts, retries included, because each one
 *  is a request a failure could be recorded against. Not deduplicated. */
export function trackAiCall(fn) {
  if (!supabase) return;
  try {
    supabase
      .rpc('launch_count', { p_event: 'ai_call', p_target: fn, p_surface: null })
      .then(() => {}, () => {});
  } catch { /* the AI call carries on regardless */ }
}

/**
 * Which partner and surface a link belongs to, or null when it is not one of
 * Carta's decorated links. Each module recognises only the decoration it adds
 * itself, so an unmarked link (no partner id configured in this build) is
 * never counted as a click that could earn.
 */
export function affiliateClickOf(href) {
  return aviasalesClickOf(href) || omioClickOf(href) || activityClickOf(href);
}

/**
 * One listener on the document for every partner link in the app, however and
 * wherever it was rendered: the detail panel, the trip legs, the destination
 * page. Capture phase, so a component that stops propagation on its own click
 * handler cannot hide the click. A middle click opens the link too, so
 * auxclick with the middle button counts as well. Links inside an exported
 * PDF or a printed page are outside the app and are not counted.
 *
 * Installed once, from main.jsx. Returns a function that removes it.
 */
let installed = null;
export function installAffiliateClickCounter(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc || installed) return installed || (() => {});
  const onClick = (e) => {
    if (e.type === 'auxclick' && e.button !== 1) return;
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    const hit = affiliateClickOf(a.href);
    if (!hit) return;
    trackLaunch('affiliate_click', hit.partner, hit.surface, `affiliate:${a.href}`);
  };
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('auxclick', onClick, true);
  installed = () => {
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('auxclick', onClick, true);
    installed = null;
  };
  return installed;
}
