/**
 * funnelCounts.js, product analytics without cookies or identifiers (I11, T1129).
 *
 * Six steps, each one tick on a per-day counter on the server (migration 070):
 * Explore opened, a place opened, a plan started, a priced draft reached, a
 * trip saved, a trip shared. Same shape as launchEvents.js (048) and
 * channelCounts.js (067): first-party RPC, no script, nothing stored on the
 * device, so no consent banner.
 *
 * What is sent: one step name. Nothing else: no place, trip or user id, no
 * path, no referrer, no time of day. The server keeps one integer per day per
 * step. A step counts once per page load (a Set in memory, gone on reload), so
 * browsing 30 places is one 'place_opened'; that is a count of visits that got
 * that far, not of clicks, and it needs nothing remembered about a person.
 *
 * FIRE AND FORGET: never throws, never awaited, a missing backend is silent.
 */
export const FUNNEL_STEPS = ['explore_opened', 'place_opened', 'plan_started', 'priced_draft', 'trip_saved', 'shared'];

/** The funnel step an app tab stands for, or null. Pure. */
export function stepOfTab(tab) {
  if (tab === 'map' || tab === 'places') return 'explore_opened';
  if (tab === 'planstart') return 'plan_started';
  return null;
}

const sent = new Set();

/** Count one step, once per page load. */
export function trackFunnel(step) {
  if (!step || !FUNNEL_STEPS.includes(step) || sent.has(step)) return;
  sent.add(step);
  try {
    // Loaded on demand so the pure helpers import cleanly under node.
    import('./supabaseClient.js')
      .then(({ authConfigured, getSupabase }) => (authConfigured ? getSupabase() : null))
      .then((supabase) => supabase && supabase.rpc('funnel_step', { p_step: step }))
      .then(() => {}, () => {});
  } catch { /* the traveller carries on regardless */ }
}

/** Test seam: forget what this page load has sent. */
export function resetFunnelForTests() { sent.clear(); }

/**
 * Shape admin_funnel_weekly for display: weeks newest first, each step with
 * its count and its share of the first step. Pure.
 */
export function funnelWeeksView(report) {
  if (!report || report.error || !Array.isArray(report.weeks)) return null;
  const weeks = report.weeks.map((w) => {
    const by = new Map((w.steps || []).map((s) => [s.step, Number(s.n) || 0]));
    const base = by.get(FUNNEL_STEPS[0]) || 0;
    const steps = FUNNEL_STEPS.map((step) => {
      const n = by.get(step) || 0;
      return { step, n, share: base > 0 ? n / base : null };
    });
    return { week: w.week, steps };
  }).sort((a, b) => (a.week < b.week ? 1 : -1));
  return { weeks, current: weeks[0] || null };
}
