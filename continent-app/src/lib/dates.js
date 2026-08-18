// Shared date helpers (UTC-safe, ISO 'YYYY-MM-DD' in/out), used by the
// planners so each tab doesn't re-implement its own copy.

import { useEffect, useState } from 'react';

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

/** The later of two ISO dates, ignoring blanks. ISO sorts lexically, so a
 *  string compare is the whole job. */
export function laterISO(a, b) {
  if (!a) return b || '';
  if (!b) return a;
  return a > b ? a : b;
}

/** Today's ISO date, kept current while the app stays open.
 *
 *  The catalogue's fare window starts on the day the fares were harvested,
 *  which is in the PAST by the time anyone opens the app. Every date bound in
 *  the planners therefore has to be `laterISO(meta.start_date, today)`, and
 *  `today` has to be a live value: a tab left open overnight would otherwise
 *  keep offering yesterday. Re-checks at the next midnight and whenever the
 *  tab is shown again.
 */
export function useToday() {
  const [today, setToday] = useState(todayISO);
  useEffect(() => {
    let timer;
    const sync = () => setToday((prev) => {
      const now = todayISO();
      return now === prev ? prev : now;
    });
    const schedule = () => {
      const now = new Date();
      // A few seconds past midnight, so a clock that is a touch fast doesn't
      // fire while it is still yesterday.
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
      timer = window.setTimeout(() => { sync(); schedule(); }, Math.max(1000, next - now));
    };
    const onVisible = () => { if (!document.hidden) sync(); };
    schedule();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return today;
}
