// Clock model for a planned day. The timeline used to be purely ordinal
// ("stop 3 of 6"); this walks the same ordered stops with the per-kind dwell
// estimates and the real (or estimated) legs between them to produce arrival
// and departure clock times, a lunch pause once the morning runs past it, and
// the honest leftover: how much of the day is still open to fill. Pure
// functions, shared by the timeline UI and the calendar (.ics) export so both
// speak the same times.

export const DAY_START_MIN = 9 * 60 + 30; // matches the AI planner's 09:30 start
export const DAY_END_MIN = 18 * 60;       // "open time" measures to a 18:00 dinner
export const LUNCH_EARLIEST_MIN = 12 * 60 + 30;
export const LUNCH_BREAK_MIN = 45;
// Below this leftover the day is effectively full; suggesting more would just
// pack it. Matches the classic 45-minute usable-gap threshold.
export const GAP_SUGGEST_MIN = 45;
// Straight-line fallback when a leg's minutes are unknown (no coords yet).
const UNKNOWN_LEG_MIN = 15;

/** Minutes-from-midnight to a 24h clock label ("09:30"). */
export function fmtClock(min) {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60) % 24;
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Same clock, rounded out to the nearest quarter hour. A holiday runs on
 *  "around four-ish", not on 16:07, so every time the traveller actually reads
 *  is softened; the exact minutes stay in the model for the calendar export. */
export function fmtClockLoose(min, stepMin = 15) {
  return fmtClock(Math.round(Math.max(0, min) / stepMin) * stepMin);
}

/**
 * The macro blocks a leisure day is really lived in. The minute-level clock
 * keeps running underneath (the calendar export and the "still open" maths
 * need it), but the timeline shows a traveller which PHASE a stop falls in,
 * so one slow lunch never reads as breaking a timetable.
 * `untilMin` is exclusive: a stop is in the first phase it starts before.
 */
export const DAY_PHASES = [
  { key: 'morning', labelKey: 'day.phaseMorning', untilMin: 12 * 60 },
  { key: 'midday', labelKey: 'day.phaseMidday', untilMin: 14 * 60 },
  { key: 'afternoon', labelKey: 'day.phaseAfternoon', untilMin: 17 * 60 },
  { key: 'evening', labelKey: 'day.phaseEvening', untilMin: Infinity },
];

/** The phase a given minute-of-day falls in. Never returns undefined. */
export function dayPhase(min) {
  const m = Math.max(0, Math.round(min || 0));
  return DAY_PHASES.find((p) => m < p.untilMin) || DAY_PHASES[DAY_PHASES.length - 1];
}

/** "09:30" -> minutes past midnight, or null for anything unparseable. The AI
 *  returns its arrival times as clock strings. */
export function clockToMin(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/**
 * Phase labels for a list of AI stops, announced ONCE per block instead of a
 * clock on every row. Returns a sparse array of i18n keys aligned to `stops`:
 * entry i is the label to print above stop i, or null when that stop just
 * continues the block before it. A stop with no parseable time inherits the
 * running block rather than restarting one.
 */
export function stopPhaseLabels(stops) {
  const out = [];
  let prev = null;
  (stops || []).forEach((s, i) => {
    const min = clockToMin(s?.arrive);
    const key = min == null ? prev : dayPhase(min).labelKey;
    out[i] = key && key !== prev ? key : null;
    if (key) prev = key;
  });
  return out;
}

/**
 * Build the day's clock schedule.
 *   items       - today's stops, already in walking order
 *   legMin(i)   - minutes from stop i to stop i+1 (null/undefined = unknown)
 *   dwellMin(x) - minutes spent at stop x
 *   stayLegMin  - minutes of the door -> first stop leg (0 = no stay anchor)
 *   startMin    - when the day starts (defaults to 09:30)
 *
 * Returns { rows, lunch, endMin, freeMin }:
 *   rows[i]  - { arriveMin, departMin } aligned to items
 *   lunch    - { afterIndex, startMin, endMin } | null; slotted into the first
 *              pause between stops after 12:30, never mid-visit
 *   endMin   - when the last visit wraps up
 *   freeMin  - minutes still open before DAY_END_MIN (never negative)
 */
export function buildDaySchedule({ items, legMin, dwellMin, stayLegMin = 0, startMin = DAY_START_MIN }) {
  let t = startMin + Math.max(0, Math.round(stayLegMin || 0));
  const rows = [];
  let lunch = null;
  (items || []).forEach((it, i) => {
    const arriveMin = t;
    const departMin = arriveMin + Math.max(0, Math.round(dwellMin(it) || 0));
    rows.push({ arriveMin, departMin });
    t = departMin;
    if (i < items.length - 1) {
      if (!lunch && departMin >= LUNCH_EARLIEST_MIN) {
        lunch = { afterIndex: i, startMin: t, endMin: t + LUNCH_BREAK_MIN };
        t += LUNCH_BREAK_MIN;
      }
      const l = legMin(i);
      t += Math.max(0, Math.round(l == null ? UNKNOWN_LEG_MIN : l));
    }
  });
  return {
    rows,
    lunch,
    endMin: t,
    freeMin: Math.max(0, DAY_END_MIN - t),
  };
}
