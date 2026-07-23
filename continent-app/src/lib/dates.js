// Shared date helpers (UTC-safe, ISO 'YYYY-MM-DD' in/out), used by the
// planners so each tab doesn't re-implement its own copy.

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Add `n` days to an ISO 'YYYY-MM-DD' date (UTC-safe).
 *
 *  Memoized: the pricing pass calls this for every destination with the SAME
 *  few dates (trip window sweeps, fare-window scans), which at full catalogue
 *  scale meant millions of Date allocations for a handful of distinct inputs.
 *  The input domain per session is tiny, so a simple bounded map wins. */
const addDaysCache = new Map();
export function addDays(iso, n) {
  if (!iso) return '';
  const key = `${iso}|${n}`;
  const hit = addDaysCache.get(key);
  if (hit !== undefined) return hit;
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  const out = d.toISOString().slice(0, 10);
  if (addDaysCache.size > 20000) addDaysCache.clear();
  addDaysCache.set(key, out);
  return out;
}

/** '2026-09-04' -> '04 Sep 2026', or 'Fri 04 Sep' with `withWeekday`. */
export function fmtDate(iso, withWeekday = false) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const base = `${String(d).padStart(2, '0')} ${MONTHS[m - 1]}`;
  if (!withWeekday) return `${base} ${y}`;
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${wd} ${base}`;
}

/** Today's local date as ISO 'YYYY-MM-DD'. */
export function todayISO() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

/** [5,6,9] -> 'May, Jun, Sep'. */
export function fmtMonths(nums) {
  return (nums || []).map((n) => MONTHS[n - 1]).filter(Boolean).join(', ');
}
