/**
 * The destination page's price card, as arithmetic (T429, owner decision
 * 2026-10-13: one cost truth).
 *
 * The page prices a stay on the SAME basis as the Explore card and the map
 * pin: the computeCosts row at the traveller's Lifestyle (lib/costIndex.js),
 * whose stayEur and foodEur are euros per person per day. The card multiplies
 * that day by the nights and the party, so Rome reads the same day figure on
 * the card, the pin and the page, and the total is that figure times the
 * stay. The first-run receipt (lib/firstRun.js) still prices the trip page
 * and the landing page on its own seasoned basis; this file does not touch it.
 *
 *   costRow   the computeCosts row: { stayEur, foodEur, dayEur, stayLevel, foodLevel }
 *   nights    whole nights, at least 1
 *   people    the party, at least 1
 *   fare      the fare the traveller typed for the whole party, or null
 *   carta     Carta's return flight for the party near the dates, from
 *             flights/flights.js roundTripNear(), or null (T517); a typed
 *             fare wins over it
 *
 * Returns null when the row cannot price a day (no bed or no food figure),
 * else { lines, total, each, est, dayEur, nights, people }. Each line is
 * rounded to cents, and the total is the sum of the rounded lines, so the
 * receipt always adds up on screen. A line is an estimate when its figure is
 * not measured in this town; a typed fare is the traveller's own and never is.
 */

const round2 = (v) => Math.round(v * 100) / 100;

export function priceFromIndex(costRow, nights, people, fare = null, carta = null) {
  if (costRow?.stayEur == null || costRow?.foodEur == null) return null;
  const stay = Number(costRow.stayEur);
  const food = Number(costRow.foodEur);
  if (!Number.isFinite(stay) || !Number.isFinite(food)) return null;
  const n = Math.max(1, Math.round(Number(nights) || 1));
  const p = Math.max(1, Math.round(Number(people) || 1));

  // T695 (rule 9): an item switched off in the opened price leaves the
  // receipt, so the total is always the sum of the items that are on (V9).
  const off = new Set((costRow.lines || []).filter((l) => l.status === 'excluded').map((l) => l.key));
  const lines = [];
  const fareEur = Number(fare?.costTotal);
  if (Number.isFinite(fareEur) && fareEur > 0) {
    lines.push({ key: 'flight', eur: round2(fareEur), est: false });
  } else if (carta?.total > 0) {
    lines.push({ key: 'flight', eur: round2(carta.total), est: false, carta });
  }
  if (!off.has('bed')) lines.push({ key: 'stay', eur: round2(stay * n * p), est: costRow.stayLevel !== 'city' });
  if (!off.has('food')) lines.push({ key: 'ground', eur: round2(food * n * p), est: costRow.foodLevel !== 'city' });

  const total = round2(lines.reduce((s, l) => s + l.eur, 0));
  return {
    lines,
    total,
    each: p > 1 ? round2(total / p) : null,
    est: lines.some((l) => l.est),
    dayEur: (off.has('bed') ? 0 : stay) + (off.has('food') ? 0 : food),
    nights: n,
    people: p,
  };
}
