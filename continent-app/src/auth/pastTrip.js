/**
 * pastTrip.js, filing a trip that already happened.
 *
 * The Visited tab never asked anyone to file anything: a trip plan whose last
 * date has passed classifies itself as a memory. A trip taken before Carta
 * existed has the same right to be in the record, so this module writes one in
 * the same shape the classifier already reads, rather than inventing a second
 * kind of thing for the record to special-case.
 *
 *   signed in  -> a trip plan with its stops, dated in the past (syncs, and is
 *                 openable and editable in the Trip planner like any other)
 *   guest      -> a standalone day plan on this device, which the Visited tab
 *                 already reads and the record already counts
 *
 * Either way the card, the map pins, the flags and the ledger come out of the
 * existing code paths, so a logged trip looks exactly like a lived one.
 */
import { createTripPlan, saveTripPlanStops } from './tripPlanStorage.js';
import { loadStandalonePlans, persistStandalonePlans } from '../planner/dayPlanStore.js';

/** ISO date `n` days after `iso`, in plain calendar days (no timezone drift:
 *  every stored trip date is a bare YYYY-MM-DD). */
export function isoAddDays(iso, n) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** Whole nights from `a` to `b`; 0 when they are the same day. */
export function nightsBetween(a, b) {
  const ms = new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86400000));
}

/** Spread `total` nights over `k` stops, earlier stops taking the remainder,
 *  which is how a real route runs: the first city gets the extra night. */
export function splitNights(total, k) {
  const per = Math.floor(total / k);
  const rem = total % k;
  return Array.from({ length: k }, (_, i) => per + (i < rem ? 1 : 0));
}

/** Trip-planner stops: consecutive arrive/depart dates whose last depart is
 *  exactly the day the traveller came home. */
export function planStopsFor(places, startDate, endDate) {
  const nights = splitNights(nightsBetween(startDate, endDate), places.length);
  let cursor = startDate;
  return places.map((p, i) => {
    const arriveDate = cursor;
    const departDate = isoAddDays(cursor, nights[i]);
    cursor = departDate;
    return {
      destinationId: p.id || null,
      city: p.city,
      country: p.country || null,
      arriveDate,
      departDate,
    };
  });
}

/** Day-plan stops, which count days rather than nights: the home-coming day
 *  belongs to the last city, and no stop is ever shorter than one day. */
export function dayStopsFor(places, startDate, endDate) {
  const nights = splitNights(nightsBetween(startDate, endDate), places.length);
  return places.map((p, i) => ({
    destinationId: p.id,
    days: Math.max(1, nights[i] + (i === places.length - 1 ? 1 : 0)),
  }));
}

/** The name an unnamed trip carries: its countries, the way the wizard names
 *  the trips it builds ("Austria & Germany"), so a logged trip and a planned
 *  one wear the same kind of headline. */
export function defaultPastLabel(places) {
  const countries = [...new Set(places.map((p) => p.country).filter(Boolean))];
  if (!countries.length) return '';
  const head = countries.slice(0, 2).join(' & ');
  return countries.length > 2 ? `${head} +${countries.length - 2}` : head;
}

/** Writes the trip to the account. Returns the new trip plan id. */
export async function savePastTripToAccount(userId, { label, places, startDate, endDate }) {
  const id = await createTripPlan(userId, label || null);
  await saveTripPlanStops(id, userId, planStopsFor(places, startDate, endDate));
  return id;
}

/** Writes the trip to this device. Returns the full new day-plan list. */
export function savePastTripOnDevice({ label, places, startDate, endDate }) {
  const plan = {
    id: `local:${Date.now()}`,
    label: label || '',
    startDate,
    stops: dayStopsFor(places, startDate, endDate),
  };
  const next = [...loadStandalonePlans(), plan];
  persistStandalonePlans(next);
  return next;
}

/** The same trip as a fetchTripPlans() row, for the optimistic insert that
 *  keeps the record in place while the account write lands. */
export function pastTripAsPlanRow(id, { label, places, startDate, endDate }) {
  return {
    id,
    label: label || null,
    start_date: startDate,
    end_date: endDate,
    cities: places.map((p) => p.city).filter(Boolean),
    countries: [...new Set(places.map((p) => p.country).filter(Boolean))],
    destination_ids: places.map((p) => p.id).filter(Boolean),
  };
}
