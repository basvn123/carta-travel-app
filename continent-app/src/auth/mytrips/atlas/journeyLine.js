/**
 * The journey line's geometry (G12, My trips atlas): one pill per stop as
 * long as its nights, one bead per day on a 2 px ink line. The same object
 * draws "where am I" on Today, "what is coming" on the next-trip card and
 * "what did I spend each day" on the Uitgaven page (atlas/JourneyLine.jsx).
 *
 * Pure: no React, no i18n, no storage.
 *
 *   stops      [{ city, nights }] in trip order (lib/myTrips.tripStops)
 *   dayNum     today's day, 1 based; 0 when the trip has not started
 *   width      the line's width in px
 *   variant    'today' | 'card' | 'spend'
 *   dayTotals  spend only: [{ iso, eur }] one per day, eur null when the
 *              day holds no figure yet
 */

export const JL_GAP = 10;          // px between two stops' pills
export const JL_LABEL_MIN = 48;    // a stop name shows only on a pill this wide
export const JL_SMALL_AFTER = 21;  // more days than this: small beads
export const JL_PILLS_AFTER = 40;  // more days than this: pills only, today a tick
export const SPEND_MIN = 6;        // px, the smallest spend bead (diameter)
export const SPEND_MAX = 22;       // px, the largest

/** Every day the trip counts: the sum of its stops' nights (at least 1 each). */
export function journeyDays(stops = []) {
  return stops.reduce((n, s) => n + Math.max(1, Math.round(Number(s?.nights) || 1)), 0);
}

/**
 * A spend bead's diameter: its area grows with the day's total, so the
 * diameter follows the square root, 6 to 22 px against the trip's largest
 * day. A day with nothing (0 or no figure) is the 6 px open ring.
 */
export function spendDiameter(eur, max) {
  if (!(Number(eur) > 0) || !(Number(max) > 0)) return SPEND_MIN;
  const f = Math.sqrt(Math.min(eur, max) / max);
  return Math.round((SPEND_MIN + (SPEND_MAX - SPEND_MIN) * f) * 10) / 10;
}

/**
 * The line laid out on `width` px. Returns { days, mode, pills, beads,
 * todayX, max } where mode is 'beads', 'small' (over 21 days) or 'pills'
 * (over 40 days: no beads, today a tick at todayX); each pill is
 * { x, w, city, first, nights, here, label } and each bead
 * { day, cx, r, state, eur } with state 'done' | 'today' | 'later' and,
 * on the spend line, 'spend' (a day gone with a figure) or 'none'.
 */
export function journeyModel({ stops = [], dayNum = 0, width = 320, variant = 'today', dayTotals = null } = {}) {
  const list = stops.map((s) => ({ city: s?.city || '', nights: Math.max(1, Math.round(Number(s?.nights) || 1)) }));
  const days = journeyDays(list);
  if (!days) return { days: 0, mode: 'beads', pills: [], beads: [], todayX: null, max: 0 };
  const mode = days > JL_PILLS_AFTER ? 'pills' : days > JL_SMALL_AFTER ? 'small' : 'beads';
  const gap = list.length > 1 ? Math.min(JL_GAP, width / (list.length * 4)) : 0;
  const unit = Math.max(0, (width - gap * (list.length - 1)) / days);
  // Days to come are never counted: the largest day is among days gone and today.
  const eurOf = (day) => {
    const v = dayTotals?.[day - 1]?.eur;
    return Number.isFinite(v) ? v : null;
  };
  const max = variant === 'spend'
    ? Math.max(0, ...Array.from({ length: Math.min(dayNum, days) }, (_, i) => eurOf(i + 1) || 0))
    : 0;
  const baseR = mode === 'small' ? 3 : 5;
  const pills = [];
  const beads = [];
  let x = 0;
  let day = 0;
  let todayX = null;
  list.forEach((s) => {
    const w = s.nights * unit;
    const first = day + 1;
    const here = dayNum >= first && dayNum < first + s.nights;
    pills.push({ x, w, city: s.city, first, nights: s.nights, here, label: w >= JL_LABEL_MIN });
    for (let k = 0; k < s.nights; k += 1) {
      day += 1;
      const cx = x + unit * (k + 0.5);
      if (day === dayNum) todayX = cx;
      if (mode === 'pills') continue;
      if (variant === 'spend') {
        const gone = dayNum > 0 && day <= dayNum;
        const eur = gone ? eurOf(day) : null;
        const state = day === dayNum ? 'today' : !gone ? 'later' : eur > 0 ? 'spend' : 'none';
        beads.push({ day, cx, r: gone ? spendDiameter(eur, max) / 2 : SPEND_MIN / 2, state, eur });
        continue;
      }
      const state = variant !== 'today' || dayNum < 1 ? 'later'
        : day < dayNum ? 'done' : day === dayNum ? 'today' : 'later';
      beads.push({ day, cx, r: state === 'today' ? baseR + 2 : state === 'done' ? baseR : baseR - 1, state, eur: null });
    }
    x += w + gap;
  });
  return { days, mode, pills, beads, todayX, max };
}

/** Nights still to sleep in today's stop: 1 means tonight is the last. */
export function nightsLeft(stop, dayIndex) {
  const n = Math.max(1, Math.round(Number(stop?.nights) || 1));
  return Math.max(1, n - Math.max(0, Number(dayIndex) || 0));
}
