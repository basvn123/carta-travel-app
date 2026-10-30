/**
 * Change your trip, in numbers (T888): the start days around the trip's own
 * and what each does to the total. Pure, so the node tests read it.
 */
import { nightsBetween } from '../../lib/tripDates.js';

const DAY_MS = 86400000;
const addDays = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * The start days around the trip's own (T888): three before and three after,
 * none in the past, each with what it does to the total for the group
 * (quoteDelta, the trip priced with the dates moved and the nights kept).
 */
export function shiftDays(tripStart, tripEnd, quoteDelta, { today = todayISO(), span = 3 } = {}) {
  if (!tripStart || !tripEnd) return [];
  const nights = nightsBetween(tripStart, tripEnd);
  const out = [];
  for (let k = -span; k <= span; k++) {
    const start = addDays(tripStart, k);
    if (start < today) continue;
    const end = addDays(tripEnd, k);
    const delta = k === 0 ? 0 : (quoteDelta ? quoteDelta({ tripStart: start, tripEnd: end }) : null);
    out.push({ k, start, end, nights, delta: Number.isFinite(delta) ? delta : null });
  }
  return out;
}
