/**
 * Seasons and closures (T1202, ROADMAP D18): the months a place is shut,
 * from the destination's `season` block (pipeline/harvest_seasons.py, OSM
 * opening_hours and seasonal tags).
 *
 *   season.open   the months the place can be visited, only on a place
 *                 that closes part of the year (its own hut, lift or lido
 *                 says so, or every ferry to the island is seasonal)
 *   season.conf   high | medium | low (low: a seasonal=summer word only)
 *   season.items  seasonal huts, lifts and ferries nearby, listed only
 *
 * The plan flow skips a place only on medium or high confidence (SKIP_CONF):
 * a low one is drawn on the strip as "may be closed" and still suggested, so
 * a guessed season never hides a place. Pure and node-runnable.
 */

export const SKIP_CONF = Object.freeze(['high', 'medium']);

const isMonth = (m) => Number.isInteger(m) && m >= 1 && m <= 12;

/** The months (sorted) a place is closed, or [] when nothing says so. */
export function closedMonths(season) {
  const open = Array.isArray(season?.open) ? season.open.filter(isMonth) : [];
  if (!open.length || open.length >= 12) return [];
  const set = new Set(open);
  return Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => !set.has(m));
}

/** Whether the plan flow may suggest this destination in month m (1 to 12). */
export function openIn(d, m) {
  if (!isMonth(m)) return true;
  const s = d?.season;
  if (!s || !SKIP_CONF.includes(s.conf)) return true;
  const closed = closedMonths(s);
  return !closed.includes(m);
}

/** The seasonal items nearby, at most `max`, with a usable month list. */
export function seasonItems(season, max = 4) {
  const rows = Array.isArray(season?.items) ? season.items : [];
  return rows
    .filter((r) => r && r.n && Array.isArray(r.open) && r.open.some(isMonth) && r.open.length < 12)
    .slice(0, max);
}
