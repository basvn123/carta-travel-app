/**
 * vrienden.js, small shared rules of the Vrienden page (G16, decision 0017).
 *
 *   placeOf(destinations, ids)   the first catalogue place of a trip, and the
 *                                first one with a photo (a friend card shows a
 *                                real photo or none, never a stretched thumb)
 *   daysUntil(iso, today)        whole days to a departure, UTC-safe
 *   leadFill(days)               how full the countdown bar is: it fills over
 *                                the last 120 days before leaving
 *   drawAllowed()                whether a figure may draw in: never at the
 *                                app's first paint (a deep link straight onto
 *                                Vrienden shows end states), never with
 *                                reduced motion
 *   airportsOf(dest)             a place's own airport codes, for fares
 */

export function placeOf(destinations, ids) {
  const all = (ids || []).map((id) => destinations?.[id]).filter(Boolean);
  return { dest: all[0] || null, photo: all.find((d) => d?.image?.url) || null };
}

const DAY = 86400000;
export function daysUntil(iso, today = new Date().toISOString().slice(0, 10)) {
  if (!iso || !today) return null;
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / DAY);
}

export const FILL_DAYS = 120;
export function leadFill(days) {
  if (days == null) return 0;
  return Math.max(0.04, Math.min(1, 1 - days / FILL_DAYS));
}

// The app's first paint is over once it has been up for a moment; a page
// opened after that (from the door, a link inside the app) may draw in.
const FIRST_PAINT_MS = 1500;
export function drawAllowed() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  } catch { /* old browsers: no motion query, keep the rule below */ }
  return (window.performance?.now?.() || 0) > FIRST_PAINT_MS;
}

const IATA = /^[A-Z]{3}$/;
export function airportsOf(dest, destId = '') {
  const out = [];
  for (const c of [dest?.iata, dest?.anchor_airport, ...(dest?.airports || []).map((a) => a?.iata), destId]) {
    if (IATA.test(c || '') && !out.includes(c)) out.push(c);
  }
  return out;
}

/** A place's name for a proposal or a trip, from the catalogue. */
export function placeName(destinations, destId) {
  const d = destinations?.[destId];
  return d?.city || d?.name || String(destId || '').replace(/^gem:/, '').replace(/^\w/, (c) => c.toUpperCase());
}
