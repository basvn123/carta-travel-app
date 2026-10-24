/**
 * myTrips.js, what My trips knows about a traveller's trips (T434).
 *
 * The classification lived inside SavedTripsPanel, so no other screen could
 * ask "which trip is next" or "where has this person been" without copying
 * it. It is pure here: no React, no i18n, no storage, so tests/myTrips.test.mjs
 * can check it in node and any screen can import it.
 *
 * Every stored trip date is a plain YYYY-MM-DD string in the traveller's own
 * calendar, so comparisons are string comparisons against localToday().
 */
import { quoteTrip, PLANNER_BAG } from './tripTotal.js';

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Today in the traveller's own calendar, as YYYY-MM-DD. */
export function localToday(now = new Date()) {
  return isoOf(now);
}

/** Today shifted by `offset` days, as YYYY-MM-DD. */
export function addDaysIso(offset, now = new Date()) {
  const d = new Date(now);
  d.setDate(d.getDate() + offset);
  return isoOf(d);
}

/** Whole days from `todayIso` to `dateIso` (negative once it has passed). */
export function daysUntil(dateIso, todayIso) {
  return Math.round((new Date(`${dateIso}T00:00:00`) - new Date(`${todayIso}T00:00:00`)) / 86400000);
}

/** Nights between two dates, 0 when either is missing. */
export function nightsBetween(a, b) {
  if (!a || !b) return 0;
  return Math.max(0, daysUntil(b, a));
}

/** A standalone day plan's last calendar day. */
export function dayPlanEndDate(sp) {
  if (!sp?.startDate) return null;
  const total = sp.stops?.reduce((n, s) => n + (s.days || 1), 0) || 1;
  const d = new Date(`${sp.startDate}T00:00:00`);
  d.setDate(d.getDate() + total - 1);
  return isoOf(d);
}

/** First-seen-order dedupe that drops holes. */
export function orderedUnique(list) {
  const out = [];
  for (const v of list || []) if (v && !out.includes(v)) out.push(v);
  return out;
}

/**
 * Upcoming and past, decided by the dates and nothing else. A trip with no
 * end date is still being planned, so it is upcoming; one whose last day is
 * before today is past. Upcoming runs soonest first (undated last), past
 * newest first.
 */
export function classifyTrips({ plans = [], dayPlans = [], todayIso }) {
  const byStart = (a, b) => ((a || '9999') < (b || '9999') ? -1 : (a || '9999') > (b || '9999') ? 1 : 0);
  const upcomingPlans = plans
    .filter((p) => !p.end_date || p.end_date >= todayIso)
    .sort((a, b) => byStart(a.start_date, b.start_date));
  const pastPlans = plans
    .filter((p) => p.end_date && p.end_date < todayIso)
    .sort((a, b) => (a.end_date < b.end_date ? 1 : -1));
  const upcomingDayPlans = dayPlans
    .filter((sp) => { const end = dayPlanEndDate(sp); return !end || end >= todayIso; })
    .sort((a, b) => byStart(a.startDate, b.startDate));
  const pastDayPlans = dayPlans
    .filter((sp) => { const end = dayPlanEndDate(sp); return end && end < todayIso; })
    .sort((a, b) => (dayPlanEndDate(a) < dayPlanEndDate(b) ? 1 : -1));
  return { upcomingPlans, pastPlans, upcomingDayPlans, pastDayPlans };
}

/**
 * How far off a trip is, as an i18n key and a number:
 * { key: 'saved.inDaysN', n: 21 }, { key: 'saved.departsToday' },
 * { key: 'saved.underway' }, { key: 'saved.noDatesYet' }, or null once over.
 */
export function whenParts(start, end, todayIso) {
  if (!start) return { key: 'saved.noDatesYet' };
  const n = daysUntil(start, todayIso);
  if (n < 0) return (!end || end >= todayIso) ? { key: 'saved.underway' } : null;
  if (n === 0) return { key: 'saved.departsToday' };
  return { key: n === 1 ? 'saved.inDays1' : 'saved.inDaysN', n };
}

/** The calendar year of a date string, or null. */
export function yearOf(iso) {
  return iso && /^\d{4}/.test(iso) ? Number(iso.slice(0, 4)) : null;
}

/**
 * The planner state a saved trip row prices from: its stops with their
 * nights, and the answers the planner stored on the first stop (party,
 * transport, own figures). The same transform useTripPlanner.loadPlan
 * applies. T702 (plan F6): a trip saved since then keeps its own price
 * request (choices.priceRequest: the stay and the Lifestyle it was planned
 * with), so its figure does not move when the traveller's settings do; an
 * older trip prices at the traveller's settings now.
 */
export function plannerStateFromPlan(plan, { stayTier = 'home', lifestyle = null } = {}) {
  const stops = (plan?.stops || []).filter((s) => s.destination_id);
  if (!stops.length) return null;
  const c = plan.choices || stops[0].choices || {};
  return {
    tripStart: stops[0].arrive_date || '',
    stops: stops.map((s) => ({
      destinationId: s.destination_id,
      nights: Math.max(1, nightsBetween(s.arrive_date, s.depart_date) || s.nights || 1),
      activities: [],
    })),
    groupSize: c.groupSize || 2,
    children: c.children || 0,
    babies: c.babies || 0,
    transportPref: c.transportPref || 'auto',
    legModes: c.legModes || {},
    ownLegs: c.ownLegs || {},
    ownStays: c.ownStays || {},
    transferMode: c.transferMode,
    baggage: c.baggage || PLANNER_BAG,
    anchorId: c.anchorId || null,
    anchorOrigin: c.anchorOrigin || null,
    returnAnchorId: c.returnAnchorId || null,
    ownFlight: c.ownFlight || null,
    carHome: c.carHome || null,
    stayTier: c.priceRequest?.stay || stayTier,
    lifestyle: c.priceRequest?.lifestyle || lifestyle,
  };
}

/**
 * What a saved trip costs the whole party now: { total, perPerson, party,
 * est } or null when the catalogue cannot price any of it. `est` is true
 * when any part is Carta's estimate rather than the traveller's own figure,
 * which is every trip with a bed or a day Carta priced.
 */
export function tripFigure(plan, { data, stayTier, lifestyle } = {}) {
  const state = plannerStateFromPlan(plan, { stayTier, lifestyle });
  if (!state || !data?.destinations) return null;
  if (!state.stops.some((s) => data.destinations[s.destinationId])) return null;
  let priced;
  try { priced = quoteTrip(state, { data }); } catch { return null; }
  const total = priced?.grandTotal;
  if (!Number.isFinite(total) || total <= 0) return null;
  const p = priced.parts || {};
  const est = (p.beds || 0) + (p.days || 0) + (p.transfers || 0) + (p.between || 0) + (p.car || 0) > 0;
  const c = plan.choices || plan.stops?.[0]?.choices || {};
  // The one figure a trip card prints (owner 1.8: a person a day, whole
  // euros): what the trip costs one person, spread over its nights, each
  // night being a day with a bed and food, as a day price on Explore is.
  const nights = state.stops.reduce((n, s) => n + (s.nights || 1), 0) || 1;
  return {
    total, perPerson: priced.perPerson, perPersonDay: priced.perPerson / nights, nights,
    party: priced.party?.head || 1, partySet: c.groupSize != null, est,
  };
}

/** An ISO date `n` nights after `iso` (calendar arithmetic in UTC). */
function addNights(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The id the trip kept on this device wears in My trips. */
export const DEVICE_PLAN_ID = 'device-trip';

/**
 * The trip kept on this device without an account (planner/deviceTripStore,
 * T500) in the shape of an account trip row, so My trips classifies, prices
 * and draws it with the same code (T503, owner T500-a). Each stop's dates are
 * chained from the trip's start; an undated trip keeps its nights on the stop.
 * Null when there is no trip or it has no places.
 */
export function deviceTripAsPlan(stored, destinations = {}) {
  const trip = stored?.trip;
  const raw = (trip?.stops || []).filter((s) => s && s.destinationId);
  if (!raw.length) return null;
  const start = trip.tripStart || '';
  let at = start;
  const stops = raw.map((s) => {
    const nights = Math.max(1, Number(s.nights) || 1);
    const row = { destination_id: s.destinationId, nights };
    if (at) {
      row.arrive_date = at;
      row.depart_date = addNights(at, nights);
      at = row.depart_date;
    }
    return row;
  });
  const ids = stops.map((s) => s.destination_id);
  return {
    id: DEVICE_PLAN_ID,
    device: true,
    deviceKey: stored.key,
    label: trip.planLabel || null,
    start_date: start || null,
    end_date: start ? (trip.tripEnd && trip.tripEnd >= at ? trip.tripEnd : at) : null,
    destination_ids: ids,
    cities: orderedUnique(ids.map((id) => destinations[id]?.city)),
    countries: orderedUnique(ids.map((id) => destinations[id]?.country)),
    stops,
    choices: {
      groupSize: trip.groupSize || 2,
      children: trip.children || 0,
      babies: trip.babies || 0,
      transportPref: trip.transportPref,
      legModes: trip.legModes,
      ownLegs: trip.ownLegs,
      ownStays: trip.ownStays,
      transferMode: trip.transferMode,
      baggage: trip.baggage,
      anchorId: trip.anchorId,
      anchorOrigin: trip.anchorOrigin,
      returnAnchorId: trip.returnAnchorId,
      ownFlight: trip.ownFlight,
      carHome: trip.carHome,
    },
  };
}

/**
 * The visited record in one pass: countries and cities from finished trips,
 * places a memory names, and countries the traveller marked by hand.
 * Shortlisted places never count: a wish is not a visit.
 */
export function visitedRecord({ pastPlans = [], pastDayPlans = [], memories = {}, destinations = {}, manualCountries = [] }) {
  const countries = new Set();
  const cities = new Set();
  const fromTrips = new Set();
  let nights = 0;
  pastPlans.forEach((p) => {
    orderedUnique([...(p.countries || []), ...(p.destination_ids || []).map((id) => destinations[id]?.country)])
      .forEach((c) => { countries.add(c); fromTrips.add(c); });
    orderedUnique([...(p.cities || []), ...(p.destination_ids || []).map((id) => destinations[id]?.city)])
      .forEach((c) => cities.add(c));
    nights += nightsBetween(p.start_date, p.end_date);
  });
  pastDayPlans.forEach((sp) => {
    (sp.stops || []).forEach((s) => {
      const d = destinations[s.destinationId];
      if (d?.country) { countries.add(d.country); fromTrips.add(d.country); }
      if (d?.city) cities.add(d.city);
    });
    nights += Math.max(0, (sp.stops || []).reduce((n, s) => n + (s.days || 1), 0) - 1);
  });
  Object.values(memories).forEach((m) => {
    (m?.places || []).forEach((pl) => {
      if (pl.country) { countries.add(pl.country); fromTrips.add(pl.country); }
      if (pl.city) cities.add(pl.city);
    });
  });
  (manualCountries || []).forEach((c) => c && countries.add(c));
  return {
    countries: [...countries].sort((a, b) => a.localeCompare(b)),
    fromTrips,
    cities: [...cities],
    trips: pastPlans.length + pastDayPlans.length,
    nights,
  };
}
