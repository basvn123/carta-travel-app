/**
 * window.js, the Datums step of a kring (G16, decision 0017).
 *
 * Each member marks the date ranges they can travel. Per day we count the
 * members who are free; the best window is the run of days with the most
 * members free, then the longest such run, then the earliest. A run must
 * hold at least `minNights` nights (a stay from the 12th to the 15th is
 * three nights), so a lone free Saturday never wins over a real trip.
 *
 * Dates are ISO 'YYYY-MM-DD' and the maths runs on whole UTC day numbers,
 * so a range across a month end or a clock change counts the same anywhere.
 */

const DAY = 86400000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function dayNumber(iso) {
  if (typeof iso !== 'string' || !ISO.test(iso)) return null;
  const n = Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Number.isFinite(n) ? Math.round(n / DAY) : null;
}

export function isoOfDay(n) {
  return new Date(n * DAY).toISOString().slice(0, 10);
}

/** Free members per day, as a Map from day number to a Set of user ids. */
function freeByDay(availability, memberIds) {
  const members = new Set(memberIds || []);
  const out = new Map();
  for (const r of availability || []) {
    if (!r || !members.has(r.user_id)) continue;
    const a = dayNumber(r.start_date);
    const b = dayNumber(r.end_date);
    if (a == null || b == null || b < a) continue;
    for (let d = a; d <= b; d += 1) {
      if (!out.has(d)) out.set(d, new Set());
      out.get(d).add(r.user_id);
    }
  }
  return out;
}

/** The heat calendar's figures: ISO day to the count of members free. */
export function dayCounts(availability, memberIds) {
  const out = new Map();
  for (const [d, who] of freeByDay(availability, memberIds)) out.set(isoOfDay(d), who.size);
  return out;
}

/** Who is free on a day (for a day's label). */
export function freeOn(availability, memberIds, iso) {
  const d = dayNumber(iso);
  const who = d == null ? null : freeByDay(availability, memberIds).get(d);
  return who ? [...who] : [];
}

export function bestWindow(availability, memberIds, { minNights = 1 } = {}) {
  const total = new Set(memberIds || []).size;
  if (!total) return null;
  const free = freeByDay(availability, memberIds);
  if (!free.size) return null;
  const days = [...free.keys()].sort((a, b) => a - b);
  const need = Math.max(0, Math.round(minNights) || 0);
  for (let level = total; level >= 1; level -= 1) {
    let best = null;
    let runStart = null;
    let prev = null;
    const close = (end) => {
      if (runStart == null) return;
      const nights = end - runStart;
      if (nights >= need && (!best || nights > best.nights)) best = { a: runStart, b: end, nights };
    };
    for (const d of days) {
      const ok = free.get(d).size >= level;
      if (ok && runStart != null && d === prev + 1) { prev = d; continue; }
      close(prev);
      runStart = ok ? d : null;
      prev = d;
    }
    close(prev);
    if (best) return { start: isoOfDay(best.a), end: isoOfDay(best.b), nights: best.nights, count: level, total };
  }
  return null;
}
