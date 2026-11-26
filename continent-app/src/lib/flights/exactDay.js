/**
 * The found trip's flight looked up live on its exact days (T855).
 *
 * The finder prices a trip from the sweep: a fare checked on the trip's own
 * day, or on a nearby day when the trip's dates cannot move. Opening the
 * found trip asks /api/flights for the trip's exact way out and way home
 * (two calls, the same searchDay path; never for list cards), and the trip
 * is priced again through quoteTrip with those answers (repriceTrip), so
 * the flight home is on the day of check-out. What the screen says:
 *
 *   loading   the swept fare stays, marked as an estimate for its own day
 *   failed    the swept fare stays, and the line says which day it is for
 *   live      the flight line's like-for-like change (receiptDiff), or the
 *             same price
 *
 * Pure; the hook is useExactDayFlights in planner/finder/finderHooks.js.
 */
import { liveKey } from './useLiveFlights.js';
import { fmtDate } from '../dates.js';

/** The flight's two exact-day searches, or null when it is not a swept Google fare. */
export function exactDayQueries(trip) {
  const facts = trip?.slots?.find((s) => s.id === 'flight')?.pick?.facts;
  const queries = trip?.quote?.cartaFlight?.queries;
  if (!facts || facts.source !== 'swept' || !Array.isArray(queries) || queries.length !== 2) return null;
  return queries.every((q) => q?.o && q?.d && q?.date) ? queries : null;
}

/** The answers that came back, keyed as quoteTrip reads them; [] while none did. */
export function exactDayLive(queries, answers) {
  if (!queries) return [];
  return queries.map((q, i) => [liveKey(q.o, q.d, q.date), answers[i]]).filter(([, a]) => a && Array.isArray(a.flights));
}

/**
 * The line under the price: { key, vars } or null.
 * statuses: useLiveDay's status for the way out and the way home.
 * facts: the swept flight's facts (out and back carry their own dates).
 * diff: receiptDiff(before, after) once the live trip is priced, else null.
 */
export function exactDayNote({ facts, statuses, diff, money }) {
  if (!facts) return null;
  const days = [facts.out?.date, facts.back?.date].filter(Boolean).map((d) => fmtDate(d, true)).join(', ');
  if (diff) {
    const line = diff.lines?.find((x) => x.id === 'flight');
    return line ? { key: 'tf.tp.flightLive', vars: { date: days, diff: money(line.diff) } } : { key: 'tf.tp.flightLiveSame', vars: { date: days } };
  }
  if (statuses.some((s) => s === 'loading')) return { key: 'tf.tp.flightEstimate', vars: { date: days } };
  if (statuses.length && statuses.every((s) => s === 'error')) return { key: 'tf.tp.flightFailed', vars: { date: days } };
  return null;
}
