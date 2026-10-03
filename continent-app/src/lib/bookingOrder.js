/**
 * The booking order (T169, spec M4): trip.logistics.bookingWindows is one
 * authored paragraph ("beds three to four months out, restaurants two to four
 * weeks"). It is a checklist wearing a paragraph, so this turns it into rows
 * in the order a traveller has to act: the furthest lead time first.
 *
 * There is no new data. The text is split into clauses, each clause is read
 * for a lead time, and the clauses that carry one become tickable steps. A
 * clause with no lead time ("unstaffed refuges cannot be booked at all")
 * stays as a note under the steps, so no authored word is dropped.
 *
 * Nothing here prices anything. A flight clause is only ever a lead time.
 */

const UNIT_DAYS = { d: 1, w: 7, m: 30 };

const NUM_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12,
};
const NUM = String.raw`(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve)`;
const UNIT = String.raw`(day|week|month|wk|mo)s?`;
const SEP = String.raw`(?:\s*[-\u2010-\u2014]\s*|\s+to\s+)`;
const RANGE = new RegExp(String.raw`\b${NUM}${SEP}${NUM}\s*${UNIT}\b`, 'i');
const SINGLE = new RegExp(String.raw`\b(?:(a|an)|${NUM})\+?\s*${UNIT}\b`, 'i');

const num = (s) => (/^\d+$/.test(s) ? Number(s) : NUM_WORDS[s.toLowerCase()]);
const unitKey = (u) => ({ day: 'd', week: 'w', wk: 'w', month: 'm', mo: 'm' }[u.toLowerCase()]);

/** Split on sentence ends and semicolons; keep the authored punctuation. */
export function clauses(text) {
  return String(text || '')
    .replace(/\*\*/g, '')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9\u00C0-\u024F"'(])|;\s+/)
    .map((s) => s.trim().replace(/^[\u2014-]\s*/, ''))
    .filter(Boolean);
}

/**
 * Read one clause for its lead time. Returns { days, kind, lo, hi, unit } or
 * null. days is the longest end of the range and is only used to sort.
 */
export function leadOf(clause) {
  const s = clause;
  let best = null;
  const take = (cand) => { if (!best || cand.days > best.days) best = cand; };

  const r = s.match(RANGE);
  if (r) {
    const u = unitKey(r[3]);
    const lo = num(r[1]); const hi = num(r[2]);
    if (lo && hi) take({ kind: 'range', lo, hi, unit: u, days: Math.max(lo, hi) * UNIT_DAYS[u] });
  }
  const one = s.match(SINGLE);
  if (one) {
    const n = one[1] ? 1 : num(one[2]);
    const u = unitKey(one[3]);
    if (n) take({ kind: 'range', lo: n, hi: n, unit: u, days: n * UNIT_DAYS[u] });
  }
  if (best) return best;

  if (/\bas soon as\b|\bwhen (?:the )?(?:season|booking|sales?|bookings?) opens?\b|\bthe day (?:they|it) open/i.test(s)) {
    return { kind: 'soon', days: 365 };
  }
  if (/\bmonths\b/i.test(s)) return { kind: 'months', days: 90 };
  if (/\ba few weeks\b|\bcouple of weeks\b|\bweeks\b/i.test(s)) return { kind: 'weeks', days: 21 };
  if (/\ba few days\b|\bcouple of days\b|\bdays (?:ahead|before|in advance)\b/i.test(s)) {
    return { kind: 'days', days: 3 };
  }
  if (/\bsame[- ]day\b|\bwalk[- ]up\b|\bno (?:advance )?(?:booking|reservation|ticket)\b|\bon the day\b/i.test(s)) {
    return { kind: 'same', days: 0 };
  }
  return null;
}

/** Plain, language-free fallback label; the page uses i18n for the words. */
export function leadShort(lead, units) {
  if (!lead) return '';
  if (lead.kind === 'range') {
    const u = units[lead.unit];
    return lead.lo === lead.hi ? `${lead.lo} ${u}` : `${lead.lo}-${lead.hi} ${u}`;
  }
  return units[lead.kind] || '';
}

/**
 * The booking order for one trip: { steps, notes }. steps are sorted furthest
 * lead time first (stable, so equal lead times keep the authored order);
 * notes are the clauses with no lead time, in authored order.
 */
export function bookingOrder(text) {
  const steps = [];
  const notes = [];
  clauses(text).forEach((c, i) => {
    const lead = leadOf(c);
    if (lead) steps.push({ id: hashId(c), text: c, lead, i });
    else notes.push({ id: hashId(c), text: c, i });
  });
  steps.sort((a, b) => b.lead.days - a.lead.days || a.i - b.i);
  return { steps, notes };
}

function hashId(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * Where a trip's order comes from: logistics.bookingWindows first; for the
 * trips with no such paragraph, the two data-sheet slots that say the same
 * thing (typeSpecific.bookingTimeline, hutBooking). Null when there is none.
 */
export function bookingSource(trip) {
  const parts = [
    trip?.logistics?.bookingWindows,
    trip?.typeSpecific?.bookingTimeline,
    trip?.typeSpecific?.hutBooking,
  ].filter((x) => typeof x === 'string' && x.trim());
  return parts.length ? parts.join(' ') : null;
}
