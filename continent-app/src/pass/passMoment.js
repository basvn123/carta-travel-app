// T1171 (ROADMAP I14): where the paywall meets the journey. The flag and the
// pure rules of the Pass moment (pass/PassMoment.jsx), apart so the component
// file exports only components and node tests load these without React.

/*
 * The Pass moment is one inline card on the trip page, under the route, once
 * the trip is priced: what stays free, what a Trip Pass adds, one door to the
 * pass sheet and a "Not now" that hides it for LATER_DAYS. It never opens by
 * itself over the page and never blocks anything (T488-c, row T411-e).
 *
 * Built behind a flag that is OFF until the closed beta has tested it (row
 * T1171-a). Nothing a traveller sees changes while PASS_MOMENT is false.
 *
 *   Flip it for everyone: set PASS_MOMENT = true.
 *   Preview it:           any page with ?pm=on (kept for the tab's session,
 *                         so it survives the app's navigation); ?pm=off
 *                         turns the preview off again.
 */
export const PASS_MOMENT = false;
const PM_KEY = 'carta.pm';

/** Whether the moment is on. `search` and `store` are seams for tests. */
export function passMomentOn(search, store, flag = PASS_MOMENT) {
  let q = '';
  try { q = new URLSearchParams(search || '').get('pm') || ''; } catch { q = ''; }
  try {
    if (q === 'on' || q === 'off') store?.setItem(PM_KEY, q);
    q = q || store?.getItem(PM_KEY) || '';
  } catch { /* storage blocked: the query alone decides */ }
  if (q === 'on') return true;
  if (q === 'off') return false;
  return !!flag;
}

/**
 * Remember a ?pm= preview before the app rewrites the address (its state
 * writer drops the query on boot). hooks/usePaywall.jsx imports this module,
 * which the app loads before its first render; on the server it does nothing.
 */
export function rememberPassMomentPreview() {
  if (typeof window === 'undefined') return;
  let store = null;
  try { store = window.sessionStorage; } catch { store = null; }
  passMomentOn(window.location.search, store);
}
rememberPassMomentPreview();

/**
 * "Not now" hides the moment LATER_DAYS; after LATER_MAX dismissals it does
 * not come back by itself (research in the T1171 report: one offer, no
 * continuous prompting). The hard gates and Account's prices stay.
 */
export const LATER_DAYS = 14;
export const LATER_MAX = 2;
export const LATER_KEY = 'carta.pm.later.v1';

/** What "Not now" left: { until (ms), count }. */
export function readLater(store) {
  try {
    const o = JSON.parse(store?.getItem(LATER_KEY) || 'null');
    const until = Number(o?.until) || 0;
    const count = Number(o?.count) || 0;
    return { until: Number.isFinite(until) ? until : 0, count: Number.isFinite(count) ? count : 0 };
  } catch { return { until: 0, count: 0 }; }
}

/** Record one "Not now" at `now`. Returns the new record. */
export function hideForLater(store, now = Date.now()) {
  const prev = readLater(store);
  const next = { until: now + LATER_DAYS * 86400000, count: prev.count + 1 };
  try { store?.setItem(LATER_KEY, JSON.stringify(next)); } catch { /* private mode: hidden for this view only */ }
  return next;
}

/**
 * Whether the card shows: the flag (or preview) on, a trip with a price on
 * the page, a traveller who does not pay (guests included: the card says
 * what is free), and no "Not now" still running or used up.
 */
export function showPassMoment({ on, priced, paid, later = { until: 0, count: 0 }, now = Date.now() }) {
  if (!on || !priced || paid) return false;
  if ((later?.count || 0) >= LATER_MAX) return false;
  return !((later?.until || 0) > now);
}

/**
 * The card's two lists, as i18n keys and the figures they take. Every
 * figure comes from lib/pricing.js TIERS; nothing is typed into a string.
 * Each line is true of the product today (HANDBOOK, The Pass): planning,
 * prices, share links and planning together are free (T488-b); free keeps
 * one saved trip (useTripSave) and every GPX file (pass.subExport); the free
 * Carta bot plans are TIERS.free.aiPlans, once for the account.
 */
export function momentLines(tiers) {
  const free = [
    { key: 'paywall.free.plan' },
    { key: 'paywall.free.share' },
    { key: 'paywall.free.keep' },
    { key: 'paywall.free.ai', vars: { n: tiers.free.aiPlans } },
  ];
  const pass = [
    { key: 'pass.addExports' },
    { key: 'pass.addTrips' },
    { key: 'pass.addPlansTrip', vars: { n: tiers.trip.aiPlans } },
    { key: 'pass.addImport' },
  ];
  return { free, pass };
}
