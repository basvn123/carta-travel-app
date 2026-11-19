/**
 * funnel.js, the AI funnel in one place (ai fix program wave 1, S4 of the
 * gemini-rag decision; ROADMAP E4).
 *
 * Six events tell whether Ask Carta leads to a plan and a Pass:
 *   ask_answer      an Ask answer was shown            funnel_step (migration 078)
 *   ask_to_plan     Ask handed a route to the planner  funnel_step (migration 078)
 *   plan_started    the planner opened                 funnel_step (070), fired by funnelCounts.trackFunnel
 *   paywall_shown   a Pass offer was shown             paywall_event 'shown' (022), fired by paywallEvents
 *   checkout_click  a buy button was pressed           paywall_event 'checkout' (022), fired by paywallEvents
 *   partner_click   a decorated partner link followed  launch_count 'affiliate_click' (048), fired by launchEvents
 * The four older ones already fire where they happen; this module names them
 * so the funnel has one definition, and fires the two new Ask steps itself.
 *
 * Same privacy shape as funnelCounts.js: one step name per page load, no
 * place, trip, user, device or session id, no path, no time of day, so no
 * consent banner. FIRE AND FORGET: never throws, never awaited; a missing
 * backend or a database without 078 is silent.
 */

/** The six funnel events and the counter each one lands in. */
export const AI_FUNNEL = Object.freeze({
  ask_answer: { counter: 'funnel_step', step: 'ask_answer', firedBy: 'src/lib/ai/funnel.js (AskChat)' },
  ask_to_plan: { counter: 'funnel_step', step: 'ask_to_plan', firedBy: 'src/lib/ai/funnel.js (AskChat, AskSearchFull)' },
  plan_started: { counter: 'funnel_step', step: 'plan_started', firedBy: 'src/lib/funnelCounts.js' },
  paywall_shown: { counter: 'paywall_event', event: 'shown', firedBy: 'src/lib/paywallEvents.js' },
  checkout_click: { counter: 'paywall_event', event: 'checkout', firedBy: 'src/lib/paywallEvents.js' },
  partner_click: { counter: 'launch_count', event: 'affiliate_click', firedBy: 'src/lib/launchEvents.js' },
});

/** The events this module sends itself; the other four already have a sender. */
export const OWN_STEPS = Object.freeze(['ask_answer', 'ask_to_plan']);

const sent = new Set();

/**
 * Count one Ask funnel step, once per page load. Returns true when a request
 * was started (for tests), which says nothing about whether it arrived.
 * `rpc` is for tests: (fn, args) => Promise.
 */
export function aiFunnel(name, { rpc = null } = {}) {
  if (!OWN_STEPS.includes(name) || sent.has(name)) return false;
  sent.add(name);
  try {
    const send = rpc
      ? Promise.resolve(rpc('funnel_step', { p_step: name }))
      // Loaded on demand so the module imports cleanly under node.
      : import('../supabaseClient.js')
        .then(({ authConfigured, getSupabase }) => (authConfigured ? getSupabase() : null))
        .then((supabase) => supabase && supabase.rpc('funnel_step', { p_step: name }));
    send.then(() => {}, () => {});
  } catch { /* the traveller carries on regardless */ }
  return true;
}

/** Test seam: forget what this page load has sent. */
export function resetAiFunnelForTests() { sent.clear(); }
