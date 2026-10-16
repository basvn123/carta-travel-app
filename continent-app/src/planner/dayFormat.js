// Small pure formatters shared by the day-planner UI (the tab, the activity
// rows, and the PDF builder) so they aren't re-declared per component.

const WALK_KMH = 4.8; // average walking pace, for the straight-line fallback

/** Straight-line walking minutes for a distance in km (offline fallback). */
export function estimateWalkMinutes(km) {
  return Math.max(1, Math.round((km / WALK_KMH) * 60));
}

/** A distance in km with one decimal in the reader's notation ("4,4" in
 *  German), never a raw toFixed (T433). */
export function fmtKm(km, lang = 'en') {
  if (!Number.isFinite(Number(km))) return '?';
  const loc = lang === 'en' ? 'en-GB' : lang;
  return new Intl.NumberFormat(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(km));
}

/** "1 h 20 min" / "45 min", visit durations in human units. */
export function fmtDur(min) {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}
