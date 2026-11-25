/**
 * receiptDiff.js, what one change did to the price (G12 plan rethink, lane
 * L9, decision §3.3 "delta on a chip change"). Checked first: the AI
 * north-star lane 9 made no receiptDiff (no match on any `p15-*` branch,
 * 2026-11-24), so this is the one.
 *
 *   receiptOfTrip(trip)     a finder trip (lib/recommend/trips.js) as a receipt
 *   receiptOfQuote(priced)  a quoteTrip() result as a receipt (the cost tiles)
 *   receiptDiff(a, b)       b minus a, line by line and in total
 *
 * A receipt is { total, lines: { [id]: euros for the group | null } }; null
 * is a line with no price yet ("Not yet"). Honest numbers: a total
 * difference exists only when both receipts have the same live lines (the
 * same ids priced and the same ones "Not yet"); with a "Not yet" line in
 * both, the difference is only the priced lines' (`partial`, worded as a
 * difference on those lines, never as a cheaper or dearer whole trip).
 * Pure: tests/receiptDiff.test.mjs.
 */
import { costTiles } from './tiles.js';

/** A difference under this many euros is no difference. */
export const MIN_DIFF = 1;

const num = (v) => (Number.isFinite(v) ? v : null);

export function receiptOfTrip(trip) {
  if (!trip || !Array.isArray(trip.slots)) return null;
  const lines = {};
  for (const s of trip.slots) {
    if (s.id === 'activities' || s.id === 'where') continue;
    lines[s.id] = s.eur == null ? null : num(s.eurGroup) ?? num(s.eur);
  }
  return { total: num(trip.total?.group), lines };
}

export function receiptOfQuote(priced) {
  const tiles = costTiles(priced);
  if (!tiles.length) return null;
  const lines = {};
  for (const x of tiles) lines[x.key] = x.missing ? null : x.eur;
  return { total: num(priced.grandTotal), lines };
}

/** The live-line key: which lines are priced and which are "Not yet". */
const shapeOf = (r) => Object.keys(r.lines).sort().map((k) => `${k}:${r.lines[k] == null ? 0 : 1}`).join('|');

/**
 * b minus a: { comparable, total, partial, lines: [{ id, diff }], notYet: [id] }
 * or null when either is missing. `total` is null unless comparable; `lines`
 * holds only the priced lines that moved by MIN_DIFF or more, biggest first.
 */
export function receiptDiff(a, b) {
  if (!a || !b) return null;
  const comparable = shapeOf(a) === shapeOf(b);
  const notYet = Object.keys(b.lines).filter((k) => b.lines[k] == null);
  if (!comparable) return { comparable: false, total: null, partial: false, lines: [], notYet };
  const lines = Object.keys(b.lines)
    .filter((k) => b.lines[k] != null)
    .map((id) => ({ id, diff: Math.round(b.lines[id] - a.lines[id]) }))
    .filter((x) => Math.abs(x.diff) >= MIN_DIFF)
    .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
  const partial = notYet.length > 0;
  let total = a.total != null && b.total != null ? Math.round(b.total - a.total) : lines.reduce((n, x) => n + x.diff, 0);
  if (Math.abs(total) < MIN_DIFF) total = 0;
  return { comparable: true, total, partial, lines, notYet };
}
