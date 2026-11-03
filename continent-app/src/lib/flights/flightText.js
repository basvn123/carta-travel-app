/**
 * Words for a flight shared by its screens (T1019, from components/flights/
 * Flights.jsx): its stops and when its price was checked.
 */
import { fmtDate } from '../dates.js';

/** "Direct", "1 stop", "2 stops"; empty when the stops are unknown. */
export const stopsText = (t, n) => (n == null ? '' : n === 0 ? t('flight.direct') : n === 1 ? t('flight.stop1') : t('flight.stops', { n }));

/** "Google Flights, checked 14:05" today, "checked 31 Oct 2026" before. */
export function checkedLabel(t, checked) {
  if (!checked) return null;
  const at = new Date(checked);
  const today = new Date().toDateString() === at.toDateString();
  return today
    ? t('flight.checked', { time: at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })
    : t('flight.checkedDay', { date: fmtDate(at.toISOString().slice(0, 10)) });
}
