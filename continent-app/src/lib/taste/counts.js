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

/**
 * A rate is only shown on enough counts (T1215, T1152-d): the acceptance on
 * at least MIN_DECISIONS decisions (accept + reject), the decision rate on
 * at least MIN_DECISIONS chips shown. Under that the cell keeps its counts
 * and says "too few" (rate null): three yeses of four is not 75 percent of
 * anything yet.
 */
export const MIN_DECISIONS = 10;
export const TASTE_BUCKETS = [1, 2, 3];

/** One cell from counter rows: the counts and the two rates, each null under the bar. Pure. */
export function tasteCell(rows = []) {
  const sum = (ev) => rows.filter((r) => r.event === ev).reduce((a, r) => a + (Number(r.n) || 0), 0);
  const accept = sum('accept');
  const reject = sum('reject');
  const shown = sum('shown');
  const decisions = accept + reject;
  return {
    accept, reject, shown, decisions,
    acceptance: decisions >= MIN_DECISIONS ? accept / decisions : null,
    decision: shown >= MIN_DECISIONS ? decisions / shown : null,
  };
}

/** Shape admin_taste_weekly for display: per week, newest first, the counts and the two rates. Pure. */
export function tasteWeeksView(report) {
  if (!report || report.error || !Array.isArray(report.weeks)) return null;
  return report.weeks.map((w) => ({ week: w.week, ...tasteCell(w.rows || []) }))
    .sort((a, b) => (a.week < b.week ? 1 : -1));
}

/**
 * The admin card's whole window (T1215, T1152-d): the total, then split by
 * position bucket (1: places 1 to 3, 2: 4 to 6, 3: 7 on) and by facet, and
 * the weeks (tasteWeeksView). null when the report is missing or refused.
 */
export function tasteWindowView(report) {
  const weeks = tasteWeeksView(report);
  if (!weeks) return null;
  const rows = report.weeks.flatMap((w) => w.rows || []);
  return {
    since: report.since || null,
    total: tasteCell(rows),
    byBucket: TASTE_BUCKETS.map((bucket) => ({ bucket, ...tasteCell(rows.filter((r) => Number(r.pos) === bucket)) })),
    byFacet: TASTE_FACETS.map((facet) => ({ facet, ...tasteCell(rows.filter((r) => r.facet === facet)) })),
    weeks,
  };
}

/** Test seams. */
export function setTasteSenderForTests(fn) { sender = fn; }
export function resetTasteCountsForTests() { shownOnce.clear(); sender = null; }
