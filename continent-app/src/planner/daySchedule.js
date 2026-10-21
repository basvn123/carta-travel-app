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

export const DINNER_EARLIEST_MIN = 18 * 60;
export const DINNER_BREAK_MIN = 75;

/**
 * The three parts of a day (T501, roadmap 1.3d, owner T492-c and T492-l):
 * Morning to 12:00, Afternoon to 17:00, Evening after. A gentle suggestion
 * the traveller can opt into ("Parts of the day"), never a timetable: the
 * minute clock keeps running underneath, and a stop belongs to the part it
 * starts in. `fromMin` is where a stop pinned to the part waits until;
 * `untilMin` is exclusive. Midday is gone: lunch heads the afternoon.
 */
export const DAY_BANDS = [
  { key: 'morning', labelKey: 'day.phaseMorning', fromMin: 0, untilMin: 12 * 60 },
  { key: 'afternoon', labelKey: 'day.phaseAfternoon', fromMin: 12 * 60, untilMin: 17 * 60 },
  { key: 'evening', labelKey: 'day.phaseEvening', fromMin: 17 * 60, untilMin: Infinity },
];

/** The part a given minute-of-day falls in. Never returns undefined. */
export function dayPhase(min) {
  const m = Math.max(0, Math.round(min || 0));
  return DAY_BANDS.find((p) => m < p.untilMin) || DAY_BANDS[DAY_BANDS.length - 1];
}

/** Position of a part by key (0 morning, 1 afternoon, 2 evening); -1 unknown. */
export function bandIndex(key) {
  return DAY_BANDS.findIndex((b) => b.key === key);
}

/** The minute a stop pinned to `key` may start at the earliest (0 = no wait). */
export function bandStartMin(key) {
  const b = DAY_BANDS[bandIndex(key)];
  return b ? b.fromMin : 0;
}

/** The part each row of a schedule starts in, as keys aligned to the rows. */
export function rowBands(schedule) {
  return (schedule?.rows || []).map((r) => dayPhase(r.arriveMin).key);
}

/**
 * Move a stop one place earlier or later with a tap (T501, no drag). Inside
 * a part it swaps with its neighbour; at the edge of a part it crosses into
 * the next part, one part at a time, by pinning the stop to that part (a pin
 * means "not before this part starts"). When a pin cannot pull a stop into
 * the earlier part (the stop before it runs on past the boundary) it jumps
 * over that stop instead.
 *
 *   order     the day's stop ids in walking order
 *   pins      { [id]: bandKey } the parts stops are pinned to
 *   i, dir    the row and -1 (earlier) or 1 (later)
 *   bandsFor  (order, pins) => band keys aligned to order (the clock)
 *
 * Returns { order, pins } or null when the stop cannot move that way.
 */
export function moveStopInDay({ order, pins = {}, i, dir, bandsFor }) {
  const n = order.length;
  if (i < 0 || i >= n || !dir) return null;
  const bands = bandsFor(order, pins);
  const b = bandIndex(bands[i]);
  const id = order[i];
  const swap = (j) => {
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  };
  if (dir < 0) {
    if (i > 0 && bands[i - 1] === bands[i]) return { order: swap(i - 1), pins };
    if (b <= 0) return i > 0 ? { order: swap(i - 1), pins } : null;
    const tryPins = { ...pins, [id]: DAY_BANDS[b - 1].key };
    if (b - 1 === 0) delete tryPins[id];
    const after = bandsFor(order, tryPins);
    if (bandIndex(after[i]) < b || i === 0) return { order, pins: tryPins };
    const jumped = { ...pins };
    const prevBand = bands[i - 1];
    if (bandIndex(prevBand) > 0) jumped[id] = prevBand; else delete jumped[id];
    return { order: swap(i - 1), pins: jumped };
  }
  if (i < n - 1 && bands[i + 1] === bands[i]) return { order: swap(i + 1), pins };
  if (b >= DAY_BANDS.length - 1 || b < 0) return null;
  return { order, pins: { ...pins, [id]: DAY_BANDS[b + 1].key } };
}

/** Whether a row can move earlier or later at all, for the menu's state. */
export function canMoveStop(bands, i, dir) {
  const b = bandIndex(bands[i]);
  if (dir < 0) return i > 0 || b > 0;
  return i < bands.length - 1 || (b >= 0 && b < DAY_BANDS.length - 1);
}

/**
 * Where a stop added to a part goes (T501): at the end of that part, before
 * the first stop of a later part, pinned to it so the clock starts it there.
 * `band` null appends it to the end of the day with no pin.
 * Returns { order, pins }.
 */
export function insertStopInBand({ order, pins = {}, id, band, bands }) {
  if (!band || bandIndex(band) < 0) return { order: [...order, id], pins };
  const target = bandIndex(band);
  let at = order.length;
  for (let k = 0; k < order.length; k += 1) {
    if (bandIndex(bands[k]) > target) { at = k; break; }
  }
  const next = [...order];
  next.splice(at, 0, id);
  const nextPins = { ...pins };
  if (target > 0) nextPins[id] = band; else delete nextPins[id];
  return { order: next, pins: nextPins };
}

/**
 * "Best route" inside the parts (T501, owner T492-e): each part keeps its
 * stops; only the order within a part is improved. `optimize(ids, anchor)`
 * is the walking-order solver; `anchorOf(lastId)` gives the start of a part
 * (null for the first part, the last stop of the part before for the rest).
 */
export function optimizeWithinBands({ order, bands, optimize, anchorOf }) {
  const groups = [];
  order.forEach((id, k) => {
    const last = groups[groups.length - 1];
    if (last && last.band === bands[k]) last.ids.push(id);
    else groups.push({ band: bands[k], ids: [id] });
  });
  const out = [];
  groups.forEach((g, gi) => {
    const anchor = anchorOf(gi === 0 ? null : out[out.length - 1]);
    out.push(...(g.ids.length > 1 ? optimize(g.ids, anchor) : g.ids));
  });
  return out;
}

/** The pins of one day, with stops no longer on it and morning pins dropped. */
export function prunePins(pins, order) {
  const keep = new Set(order.map(String));
  return Object.fromEntries(Object.entries(pins || {}).filter(([id, b]) => keep.has(String(id)) && bandIndex(b) > 0));
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
export function buildDaySchedule({
  items, legMin, dwellMin, stayLegMin = 0, startMin = DAY_START_MIN, pinOf = null,
}) {
  let t = startMin + Math.max(0, Math.round(stayLegMin || 0));
  const rows = [];
  let lunch = null;
  let dinner = null;
  (items || []).forEach((it, i) => {
    // A stop pinned to a part of the day waits for that part (T501): the
    // gap before it is free time, never a stretched visit.
    const pin = pinOf ? pinOf(it, i) : null;
    const arriveMin = Math.max(t, bandStartMin(pin));
    const departMin = arriveMin + Math.max(0, Math.round(dwellMin(it) || 0));
    rows.push({ arriveMin, departMin });
    t = departMin;
    if (i < items.length - 1) {
      if (!lunch && departMin >= LUNCH_EARLIEST_MIN) {
        lunch = { afterIndex: i, startMin: t, endMin: t + LUNCH_BREAK_MIN };
        t += LUNCH_BREAK_MIN;
      } else if (!dinner && departMin >= DINNER_EARLIEST_MIN) {
        dinner = { afterIndex: i, startMin: t, endMin: t + DINNER_BREAK_MIN };
        t += DINNER_BREAK_MIN;
      }
      const l = legMin(i);
      t += Math.max(0, Math.round(l == null ? UNKNOWN_LEG_MIN : l));
    }
  });
  // Dinner (T501): slotted in the loop after the first visit that ends at or
  // past 18:00 with more to come; otherwise after the last visit, never
  // before 18:00. It has no amount of its own: the food is already in the
  // day's price.
  if (!dinner && rows.length) {
    const at = Math.max(t, DINNER_EARLIEST_MIN);
    dinner = { afterIndex: rows.length - 1, startMin: at, endMin: at + DINNER_BREAK_MIN };
  }
  return {
    rows,
    lunch,
    dinner,
    endMin: t,
    freeMin: Math.max(0, DAY_END_MIN - t),
  };
}
