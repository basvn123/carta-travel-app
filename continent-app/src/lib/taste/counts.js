/**
 * How often a taste chip is accepted, without cookies or identifiers (T1152,
 * ROADMAP F3). Same shape as lib/funnelCounts.js (070): one first-party RPC,
 * `taste_tick` (migration 072), nothing stored on the device, so no banner.
 *
 * What is sent: an event ('shown', 'accept', 'reject'), the chip's facet and
 * its position bucket (1: places 1 to 3, 2: 4 to 6, 3: 7 on). No node, no
 * place, trip or account id, no path, no time of day. The server keeps one
 * integer per day per event, facet and bucket. 'shown' counts once per chip
 * per page load. Acceptance rate = accept / (accept + reject); the decision
 * rate (accept + reject) / shown sits beside it, because a chip left alone
 * is not an acceptance.
 *
 * FIRE AND FORGET: never throws, never awaited, a missing backend is silent.
 */
export const TASTE_EVENTS = ['shown', 'accept', 'reject'];
export const TASTE_FACETS = ['activity', 'setting', 'vibe', 'traveller', 'practical'];

const shownOnce = new Set();
let sender = null;

function send(args) {
  if (sender) { sender(args); return; }
  try {
    import('../supabaseClient.js')
      .then(({ authConfigured, getSupabase }) => (authConfigured ? getSupabase() : null))
      .then((supabase) => supabase && supabase.rpc('taste_tick', args))
      .then(() => {}, () => {});
  } catch { /* the traveller carries on regardless */ }
}

/** Count one event for a chip. `node` only keys the once-per-load set; it is never sent. */
export function tickTaste(event, { node, facet, bucket }) {
  if (!TASTE_EVENTS.includes(event) || !TASTE_FACETS.includes(facet) || ![1, 2, 3].includes(bucket)) return false;
  if (event === 'shown') {
    if (shownOnce.has(node)) return false;
    shownOnce.add(node);
  }
  send({ p_event: event, p_facet: facet, p_pos: bucket });
  return true;
}

/** Shape admin_taste_weekly for display: per week, accepted, rejected, shown and the two rates. Pure. */
export function tasteWeeksView(report) {
  if (!report || report.error || !Array.isArray(report.weeks)) return null;
  return report.weeks.map((w) => {
    const sum = (ev) => (w.rows || []).filter((r) => r.event === ev).reduce((a, r) => a + (Number(r.n) || 0), 0);
    const accept = sum('accept');
    const reject = sum('reject');
    const shown = sum('shown');
    return {
      week: w.week, accept, reject, shown,
      acceptance: accept + reject > 0 ? accept / (accept + reject) : null,
      decision: shown > 0 ? (accept + reject) / shown : null,
    };
  }).sort((a, b) => (a.week < b.week ? 1 : -1));
}

/** Test seams. */
export function setTasteSenderForTests(fn) { sender = fn; }
export function resetTasteCountsForTests() { shownOnce.clear(); sender = null; }
