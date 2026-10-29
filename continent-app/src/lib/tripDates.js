// The trip's dates as the Plan flow chooses and carries them (T815): pure,
// UTC-safe helpers on ISO 'YYYY-MM-DD' strings, with no imports so the trip
// settings and their node tests can read them. lib/dates.js keeps the
// display helpers; these are the rules the When question, the wizard's When
// step, the trip settings and the planned trip share.

/** The most nights a trip may have, in every When control (the flow, the
 *  wizard and the settings agree; the wizard stopped at 21 before T815). */
export const MAX_TRIP_NIGHTS = 60;

/** `iso` plus `n` days, in UTC, so no time zone moves the day (a local noon
 *  read back with toISOString() is a day early east of UTC+12). */
export function addDaysUTC(iso, n) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Whole nights from `a` to `b`; 0 when either is missing or b is not after a. */
export function nightsBetween(a, b) {
  if (!a || !b) return 0;
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.max(0, Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000));
}

/** `iso` held between `min` and `max`, either may be blank (ISO sorts as text). */
export function clampISO(iso, min = '', max = '') {
  if (!iso) return iso;
  if (min && iso < min) return min;
  if (max && iso > max) return max;
  return iso;
}

/**
 * The months picked, the next one to come first (this month included).
 * Stored months are sorted 1 to 12, so on 29 October [1, 11] means November
 * first, then January; reading months[0] planned the trip in January while
 * Explore priced November.
 */
export function monthsByNext(months, today = new Date()) {
  const now = today.getMonth() + 1;
  return [...(months || [])].sort((a, b) => ((a - now + 12) % 12) - ((b - now + 12) % 12));
}

/**
 * An exact When made whole: an end on or before the start is dropped (a
 * booking imported after the old end made the trip end before it began),
 * and the nights follow the two dates when both are there.
 */
export function exactWindow(w) {
  const start = w.start || '';
  const end = start && w.end && w.end > start ? w.end : (start ? '' : w.end || '');
  const n = nightsBetween(start, end);
  return { ...w, start, end, nights: n ? Math.min(MAX_TRIP_NIGHTS, n) : w.nights };
}

/**
 * The start and end a pick in the When calendar gives: the start keeps the
 * trip's length, and the end stays inside the last day that may be planned.
 */
export function windowFromStart(start, keepNights, max = '') {
  const end = clampISO(addDaysUTC(start, Math.max(1, keepNights || 7)), '', max);
  return { start, end, nights: nightsBetween(start, end) || Math.max(1, keepNights || 7) };
}

/**
 * Where a planned trip moves when the trip settings' When changes (T815):
 * null when the When is not two dates or says what the trip already says;
 * else the new start and end. The end is the settings' end when it is after
 * the start, else the start plus the nights planned. `short` is true when
 * the stops hold more nights than the new window.
 */
export function movedWindow(when, tripStart, tripEnd, plannedNights = 0) {
  if (!when || when.mode !== 'exact' || !when.start) return null;
  const end = when.end && when.end > when.start
    ? when.end
    : addDaysUTC(when.start, Math.max(1, plannedNights || when.nights || 1));
  if (when.start === tripStart && end === tripEnd) return null;
  return { start: when.start, end, short: plannedNights > nightsBetween(when.start, end) };
}
