/*
 * The range calendar's rules, without React (G12 Settings, When step; a11y
 * critique: one grid, one tab stop, arrows by day, the range announced).
 * Dates are ISO 'YYYY-MM-DD' strings in UTC, as everywhere in the app, so
 * a summer-time change never moves a day.
 */

const DAY = 86400000;
const toMs = (iso) => Date.parse(`${iso}T00:00:00Z`);
const toIso = (ms) => new Date(ms).toISOString().slice(0, 10);

export function addDays(iso, n) {
  return toIso(toMs(iso) + n * DAY);
}

export function nightsBetween(a, b) {
  if (!a || !b) return 0;
  return Math.max(0, Math.round((toMs(b) - toMs(a)) / DAY));
}

/** 'YYYY-MM' of a date. */
export const monthOf = (iso) => String(iso || '').slice(0, 7);

/** The month `n` months after 'YYYY-MM'. */
export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** The same day `n` months on, held to the last day of a shorter month. */
export function addMonthsDay(iso, n) {
  const ym = addMonths(monthOf(iso), n);
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const day = Math.min(Number(iso.slice(8, 10)), last);
  return `${ym}-${String(day).padStart(2, '0')}`;
}

/** Monday 0 to Sunday 6 (Europe's week starts on a Monday). */
export function weekdayIndex(iso) {
  return (new Date(toMs(iso)).getUTCDay() + 6) % 7;
}

/**
 * A month as weeks of seven cells, Monday first. A cell outside the month
 * is null, so the grid draws a blank there and never offers a day of the
 * next month twice.
 */
export function monthWeeks(ym) {
  const first = `${ym}-01`;
  const [y, m] = ym.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Array(weekdayIndex(first)).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${ym}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Holds a date inside [min, max]; an empty bound is open. */
export function clampDay(iso, min = '', max = '') {
  if (min && iso < min) return min;
  if (max && iso > max) return max;
  return iso;
}

/**
 * Where a key moves the focused day, or null for a key the grid leaves
 * alone. Arrows by a day and a week, Home and End to the week's ends,
 * Page Up and Down by a month (with Shift, a year), as the WAI-ARIA date
 * picker grid does.
 */
export function moveDay(iso, key, shift = false) {
  switch (key) {
    case 'ArrowLeft': return addDays(iso, -1);
    case 'ArrowRight': return addDays(iso, 1);
    case 'ArrowUp': return addDays(iso, -7);
    case 'ArrowDown': return addDays(iso, 7);
    case 'Home': return addDays(iso, -weekdayIndex(iso));
    case 'End': return addDays(iso, 6 - weekdayIndex(iso));
    case 'PageUp': return addMonthsDay(iso, shift ? -12 : -1);
    case 'PageDown': return addMonthsDay(iso, shift ? 12 : 1);
    default: return null;
  }
}

/** A day's place in the range: 'start', 'end', 'in' or ''. */
export function rangeState(iso, start, end) {
  if (!iso || !start) return '';
  if (iso === start) return 'start';
  if (!end) return '';
  if (iso === end) return 'end';
  return iso > start && iso < end ? 'in' : '';
}

/**
 * One tap on the calendar. The first tap sets the leaving day and waits for
 * the return; the second sets the return, unless it lands on or before the
 * leaving day, which then starts again from there. Returns the new
 * { start, end } (end '' while it waits) and whether the pair is complete.
 */
export function pickDay(range, iso) {
  const { start = '', end = '' } = range || {};
  if (!start || end) return { start: iso, end: '', complete: false };
  if (iso <= start) return { start: iso, end: '', complete: false };
  return { start, end: iso, complete: true };
}
