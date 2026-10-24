// T649: the traveller's "when", read in ONE place.
//
// The settings line holds three kinds of answer (exact dates, a month, any
// time) and the Explore month filter (xm) can set a month of its own. Every
// surface that speaks of "the month" (the Crowds stat, the Explore quiet flag,
// the month fact, the rails) reads it through resolveWhen(), never from
// departDate directly, so two screens cannot disagree about the month.
//
//   { kind: 'exact', month, months }  exact dates: month is the start month;
//                                     months holds both when the trip spans two
//   { kind: 'month', month, months }  a month picked (dateFlex 'month' or xm)
//   { kind: 'any',   month: null, months: [] }  no month: the yearly pattern
//
// Carta's own default dates are not the traveller's choice: they read as 'any'
// (carta-design "Month": a month is shown only when the traveller has one).

const monthOfIso = (iso) => {
  const m = /^\d{4}-(\d{2})/.exec(String(iso || ''));
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 12 ? n : null;
};

const ANY = Object.freeze({ kind: 'any', month: null, months: Object.freeze([]) });

/**
 * @param {object} s  { dateFlex, departDate, returnDate, ownDates, xm }
 *   xm is the Explore month filter (1 to 12); when set it wins.
 */
export function resolveWhen(s = {}) {
  const xm = Number(s.xm);
  if (Number.isInteger(xm) && xm >= 1 && xm <= 12) return { kind: 'month', month: xm, months: [xm] };
  if (s.dateFlex === 'any') return ANY;
  const start = monthOfIso(s.departDate);
  if (!start) return ANY;
  if (s.dateFlex === 'month') return { kind: 'month', month: start, months: [start] };
  if (!s.ownDates) return ANY;
  const end = monthOfIso(s.returnDate);
  const spans = end && end !== start && String(s.returnDate) >= String(s.departDate);
  return { kind: 'exact', month: start, months: spans ? [start, end] : [start] };
}

/** The single month the traveller has (the start month), or null. This is the
 *  value App.jsx publishes as travelMonth. */
export const whenMonth = (w) => (w && w.kind !== 'any' ? w.month : null);

/**
 * The month a per-month series should be read at: the one month, or for a
 * trip spanning two the busier of them by `share` (crowd share), else the
 * first. Null for 'any'.
 */
export function busiestMonth(w, share) {
  if (!w || w.kind === 'any' || !w.months.length) return null;
  if (w.months.length === 1 || !Array.isArray(share)) return w.months[0];
  return w.months.reduce((best, m) => ((share[m - 1] ?? -1) > (share[best - 1] ?? -1) ? m : best), w.months[0]);
}
