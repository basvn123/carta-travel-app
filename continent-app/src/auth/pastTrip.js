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
 * existing code paths, so a logged trip looks exactly like a lived one. What a
 * trip plan cannot hold (who came, what it cost, how it was, the photographs)
 * lives alongside it in pastTripMemory.js.
 *
 * A place the catalogue has never held is welcome here. It carries its own
 * geocoded coordinates and a `past:` id, so it pins on the record's map and
 * counts in the ledger without pretending to be a catalogue destination.
 */
import { createTripPlan, saveTripPlanStops, renameTripPlan } from './tripPlanStorage.js';
import { loadStandalonePlans, persistStandalonePlans } from '../planner/dayPlanStore.js';

/** ISO date `n` days after `iso`, in plain calendar days (no timezone drift:
 *  every stored trip date is a bare YYYY-MM-DD). */
export function isoAddDays(iso, n) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  const pad = (v) => String(v).padStart(2, '0');
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Whole nights from `a` to `b`; 0 when they are the same day. */
export function nightsBetween(a, b) {
  const ms = new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86400000));
}

/** Spread `total` nights over `k` stops, earlier stops taking the remainder,
 *  which is how a real route runs: the first city gets the extra night. */
export function splitNights(total, k) {
  if (k <= 0) return [];
  const per = Math.floor(total / k);
  const rem = total % k;
  return Array.from({ length: k }, (_, i) => per + (i < rem ? 1 : 0));
}

/** Move one night onto stop `i` and off its neighbour, so nudging how long you
 *  stayed somewhere never silently changes the dates of the trip. */
export function moveNight(nights, i, delta) {
  const next = [...nights];
  const donor = i === next.length - 1 ? i - 1 : i + 1;
  if (donor < 0 || donor >= next.length) return next;
  if (next[i] + delta < 0 || next[donor] - delta < 0) return next;
  next[i] += delta;
  next[donor] -= delta;
  return next;
}

/** Nights per place, falling back to an even split for places that have never
 *  been nudged. Always sums to the trip's own length. */
export function nightsFor(places, startDate, endDate) {
  const total = nightsBetween(startDate, endDate);
  const given = places.map((p) => (Number.isFinite(p.nights) ? p.nights : null));
  if (given.every((n) => n != null) && given.reduce((a, b) => a + b, 0) === total) return given;
  return splitNights(total, places.length);
}

/** A stable id for a place the catalogue does not hold. */
export function customPlaceId(city, country) {
  const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `past:${[fold(city), fold(country)].filter(Boolean).join('-')}`;
}

/** The id a place is stored under: its catalogue id, or its own `past:` id. */
export function placeStopId(p) {
  return p.id || customPlaceId(p.city, p.country);
}

/** Trip-planner stops: consecutive arrive/depart dates whose last depart is
 *  exactly the day the traveller came home. A place off the catalogue carries
 *  its coordinates in `choices`, the only free-form column a stop has. */
export function planStopsFor(places, startDate, endDate) {
  const nights = nightsFor(places, startDate, endDate);
  let cursor = startDate;
  return places.map((p, i) => {
    const arriveDate = cursor;
    const departDate = isoAddDays(cursor, nights[i]);
    cursor = departDate;
    return {
      destinationId: placeStopId(p),
      city: p.city,
      country: p.country || null,
      arriveDate,
      departDate,
      transportMode: p.arriveBy || null,
      choices: p.id ? { past: true } : {
        past: true, custom: true, lat: p.lat ?? null, lon: p.lon ?? null,
      },
    };
  });
}

/** Day-plan stops, which count days rather than nights: the home-coming day
 *  belongs to the last city, and no stop is ever shorter than one day. */
export function dayStopsFor(places, startDate, endDate) {
  const nights = nightsFor(places, startDate, endDate);
  return places.map((p, i) => ({
    destinationId: placeStopId(p),
    days: Math.max(1, nights[i] + (i === places.length - 1 ? 1 : 0)),
    // Off-catalogue places keep their own name and country here: nothing else
    // on the device can resolve a `past:` id.
    ...(p.id ? {} : { city: p.city, country: p.country || '', lat: p.lat ?? null, lon: p.lon ?? null }),
  }));
}

/** The name an unnamed trip carries: its countries, the way the wizard names
 *  the trips it builds ("Austria & Germany"), so a logged trip and a planned
 *  one wear the same kind of headline. */
export function defaultPastLabel(places) {
  const countries = [...new Set(places.map((p) => p.country).filter(Boolean))];
  if (!countries.length) return places[0]?.city || '';
  const head = countries.slice(0, 2).join(' & ');
  return countries.length > 2 ? `${head} +${countries.length - 2}` : head;
}

/** Writes the trip to the account. Returns the new trip plan id. */
export async function savePastTripToAccount(userId, { label, places, startDate, endDate }) {
  const id = await createTripPlan(userId, label || null);
  await saveTripPlanStops(id, userId, planStopsFor(places, startDate, endDate));
  return id;
}

/** Rewrites an account trip in place, keeping its id (and so its memory, its
 *  ledger and anything else keyed by it). */
export async function updatePastTripInAccount(userId, id, { label, places, startDate, endDate }) {
  await renameTripPlan(id, label || null);
  await saveTripPlanStops(id, userId, planStopsFor(places, startDate, endDate));
  return id;
}

/** Writes the trip to this device. Returns { plans, id }. */
export function savePastTripOnDevice({ label, places, startDate, endDate }) {
  const id = `local:${Date.now()}`;
  const plan = {
    id,
    label: label || '',
    startDate,
    stops: dayStopsFor(places, startDate, endDate),
  };
  const plans = [...loadStandalonePlans(), plan];
  persistStandalonePlans(plans);
  return { plans, id };
}

/** Rewrites a device trip in place. Returns { plans, id }. */
export function updatePastTripOnDevice(id, { label, places, startDate, endDate }) {
  const plans = loadStandalonePlans().map((sp) => (sp.id === id ? {
    ...sp,
    label: label || '',
    startDate,
    stops: dayStopsFor(places, startDate, endDate),
  } : sp));
  persistStandalonePlans(plans);
  return { plans, id };
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
