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
  const head = priced.party?.head || 1;
  return {
    total, perPerson: priced.perPerson, perPersonDay: priced.perPerson / nights, nights,
    party: head, partySet: c.groupSize != null, est,
    // T923, T924: the beds for the whole party (the price nudge compares it
    // over time) and the plan's food and drink a person a day (what a day on
    // the ground is planned to cost, against the day's spend).
    beds: Number.isFinite(p.beds) ? p.beds : null,
    foodDayPP: Number.isFinite(p.days) && p.days > 0 ? p.days / nights / head : null,
    // T943: each stop's bed a person a night at its own dates, as the plan
    // price is stored (planBedOf), or null where the traveller typed their
    // own stay or Carta has no bed price.
    bedNights: (priced.stayCosts || []).map(bedNightOf),
  };
}

/** A stop's priced bed a person a night, or null (typed stay, no price). */
function bedNightOf(stay) {
  const n = stay && !stay.ownAccom ? stay.accom?.per_night : null;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The bed price a stop is saved with (T943): what the planner priced a person
 * a night for that stop at the moment of saving, and the day. Null where the
 * planner priced no bed (a typed stay, a pass-through, no price).
 */
export function planBedOf(stay, todayIso) {
  const night = bedNightOf(stay);
  return night == null ? null : { night: Math.round(night * 100) / 100, at: todayIso || null };
}

// A bed must have fallen this share of the plan price, and by at least this
// many euros a person a night, before the card says so (T923, T943).
export const PLAN_NUDGE_MIN_SHARE = 0.03;
export const PLAN_NUDGE_MIN_EUR = 1;

/**
 * Today's beds against the plan's (T943). `plan` is a trip row whose stops
 * carry `choices.planBed` from the save; `bedNights` is tripFigure's
 * bedNights for today, the same dates and the same stops in order.
 *
 *   { stored: false }                 no stop carries a plan price (an older
 *                                     trip): the caller falls back to the
 *                                     first price My trips saw (T923).
 *   { stored: true, nudge: null }     stored, and no bed is enough under it.
 *   { stored: true, nudge: { destId, share, fall, at } }
 *                                     the stop whose bed fell the most, as a
 *                                     share of its plan price.
 *
 * A stop with its own stay tier is left out: My trips prices every stop at
 * the trip's tier, so the two figures would not be the same bed.
 */
export function planBedNudge(plan, bedNights = [], { minShare = PLAN_NUDGE_MIN_SHARE, minEur = PLAN_NUDGE_MIN_EUR } = {}) {
  const stops = (plan?.stops || []).filter((s) => s && s.destination_id);
  let stored = false;
  let best = null;
  stops.forEach((s, i) => {
    const pb = s.choices?.planBed;
    if (!pb || !Number.isFinite(pb.night) || pb.night <= 0) return;
    stored = true;
    if (s.choices?.stayTier) return;
    const now = bedNights[i];
    if (!Number.isFinite(now)) return;
    const fall = pb.night - now;
    const share = fall / pb.night;
    if (fall < minEur || share < minShare) return;
    if (!best || share > best.share) best = { destId: s.destination_id, share, fall, at: pb.at || null };
  });
  return { stored, nudge: best };
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
  // T943: the plan's bed prices ride beside the stops, by the stop's index.
  const beds = Array.isArray(trip?.planBeds) ? trip.planBeds : [];
  const raw = (trip?.stops || []).map((s, i) => (s && s.destinationId ? { ...s, planBed: beds[i] || null } : null)).filter(Boolean);
  if (!raw.length) return null;
  const start = trip.tripStart || '';
  let at = start;
  const stops = raw.map((s) => {
    const nights = Math.max(1, Number(s.nights) || 1);
    const row = { destination_id: s.destinationId, nights };
    if (s.planBed && Number.isFinite(s.planBed.night)) row.choices = { planBed: s.planBed, ...(s.stayTier ? { stayTier: s.stayTier } : {}) };
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

/* ───────────── T923 to T926: readiness, the day today, the record ───────────── */

/** A booking row the traveller has filled: a reference, a price or a link. */
const filled = (b) => Boolean(b && (b.ref || (b.price != null && b.price !== '') || b.url));
const FLIGHT_ROWS = ['flight-out', 'flight'];
const FLIGHT_KINDS = ['flight_out', 'flight', 'transfer'];

/**
 * The trip's stops with their nights and dates, in order: what the planner
 * makes its days from (useTripPlanner dayPlan: one day per night of a stop).
 */
export function tripStops(plan) {
  return (plan?.stops || []).filter((s) => s && s.destination_id).map((s) => ({
    id: s.destination_id,
    city: s.city || '',
    arrive: s.arrive_date || null,
    depart: s.depart_date || null,
    nights: Math.max(1, nightsBetween(s.arrive_date, s.depart_date) || s.nights || 1),
  }));
}

/**
 * The trip days that hold something the traveller planned, as day numbers
 * (1 based, the planner's own numbering): places picked in the day planner
 * (assignments), a day's own words (dayNotes) and booked things put on a day
 * (dayExtras).
 */
export function plannedDayNumbers(plan, { assignments = {}, extras = {} } = {}) {
  const out = new Set();
  const stops = tripStops(plan);
  let first = 1;
  stops.forEach((s, i) => {
    const days = assignments?.[i] || {};
    Object.entries(days).forEach(([di, list]) => {
      const d = Number(di);
      if (Array.isArray(list) && list.length && d >= 0 && d < s.nights) out.add(first + d);
    });
    first += s.nights;
  });
  Object.entries(extras?.dayNotes || {}).forEach(([n, text]) => { if (String(text || '').trim()) out.add(Number(n)); });
  Object.entries(extras?.dayExtras || {}).forEach(([n, list]) => { if (Array.isArray(list) && list.length) out.add(Number(n)); });
  return [...out].filter((n) => Number.isFinite(n) && n >= 1).sort((a, b) => a - b);
}

/**
 * Ready for the trip (T923): four steps from what the trip and its bookings
 * and day plans hold, nothing guessed.
 *   dates    the trip has a start and an end
 *   travel   the way there is booked: the planner's own flight marked booked,
 *            or a filled outbound booking row (a reference, a price or a link)
 *   beds     stops whose stay is booked (a filled stay row, or a stay price
 *            the traveller typed) of the stops
 *   days     trip days with a plan of the trip's days
 * Returns { steps: [{ key, done, n, of }], done, total, next } where next is
 * the first step not done, or null.
 */
export function readinessSteps(plan, { assignments = {}, extras = {} } = {}) {
  const c = plan?.choices || plan?.stops?.[0]?.choices || {};
  const stops = tripStops(plan);
  const bookings = extras?.bookings || {};
  const customs = Object.entries(bookings).filter(([k]) => k.startsWith('custom:')).map(([, b]) => b);
  const dates = Boolean(plan?.start_date && plan?.end_date);
  const travel = Boolean(c.ownFlight?.booked)
    || FLIGHT_ROWS.some((k) => filled(bookings[k]))
    || customs.some((b) => FLIGHT_KINDS.includes(b?.kind) && filled(b));
  const bedsBooked = stops.filter((s, i) => filled(bookings[`stay-${i}`]) || c.ownStays?.[s.id] != null).length;
  const totalDays = stops.reduce((n, s) => n + s.nights, 0);
  const planned = Math.min(totalDays, plannedDayNumbers(plan, { assignments, extras }).length);
  const steps = [
    { key: 'dates', done: dates },
    { key: 'travel', done: travel },
    { key: 'beds', done: stops.length > 0 && bedsBooked >= stops.length, n: bedsBooked, of: stops.length },
    { key: 'days', done: totalDays > 0 && planned >= totalDays, n: planned, of: totalDays },
  ];
  const done = steps.filter((s) => s.done).length;
  return { steps, done, total: steps.length, next: steps.find((s) => !s.done)?.key || null };
}

/** Is the trip happening on `todayIso` (its first day to its last)? */
export function isHappening(plan, todayIso) {
  return Boolean(plan?.start_date && plan.start_date <= todayIso && (!plan.end_date || plan.end_date >= todayIso));
}

/**
 * Where a trip is today (T924): { dayNum, of, stopIndex, dayIndex, stop,
 * tomorrow } or null when it is not happening. The departure day counts as
 * the last planned day, the planner having no day of its own for it.
 */
export function tripToday(plan, todayIso) {
  if (!isHappening(plan, todayIso)) return null;
  const stops = tripStops(plan);
  const of = stops.reduce((n, s) => n + s.nights, 0);
  if (!of) return null;
  const dayNum = Math.min(of, Math.max(1, daysUntil(todayIso, plan.start_date) + 1));
  const locate = (n) => {
    let first = 1;
    for (let i = 0; i < stops.length; i += 1) {
      if (n < first + stops[i].nights) return { stopIndex: i, dayIndex: n - first, stop: stops[i] };
      first += stops[i].nights;
    }
    return null;
  };
  const here = locate(dayNum);
  const next = dayNum < of ? locate(dayNum + 1) : null;
  return {
    dayNum, of, ...here,
    tomorrow: next ? { dayNum: dayNum + 1, ...next, moves: next.stopIndex !== here.stopIndex } : null,
  };
}

/** The calendar day a ledger row was spent on: its own date, else the day its
 *  id was minted (the ledger's ids are the time a row was entered). */
export function expenseDay(row) {
  if (row?.date && /^\d{4}-\d{2}-\d{2}$/.test(row.date)) return row.date;
  const ms = Number(row?.id);
  if (!Number.isFinite(ms) || ms < 1e12) return null;
  return isoOf(new Date(ms));
}

/**
 * What was spent on one day, from the expense ledger (T924): { total, byCat,
 * rows } in euro, `toEur` converting a foreign amount. Rows a past-trip
 * memory wrote (src 'memory') are the whole trip's spend, never a day's.
 */
export function spendOnDay(expenses = [], dayIso, toEur = (n) => n) {
  const byCat = {};
  let total = 0;
  const rows = (expenses || []).filter((x) => x && x.src !== 'memory' && expenseDay(x) === dayIso && Number(x.amount) > 0);
  rows.forEach((x) => {
    const eur = toEur(Number(x.amount), x.currency || 'EUR');
    if (!Number.isFinite(eur)) return;
    const cat = x.cat || 'other';
    byCat[cat] = (byCat[cat] || 0) + eur;
    total += eur;
  });
  return { total, byCat, rows };
}

/* ───────────── Your Europe (T926) ───────────── */

/** Small regions a traveller can complete, by ISO code. Facts, not goals. */
export const REGIONS = [
  { key: 'benelux', cc: ['BE', 'NL', 'LU'] },
  { key: 'baltics', cc: ['EE', 'LV', 'LT'] },
  { key: 'iberia', cc: ['ES', 'PT'] },
  { key: 'nordics', cc: ['DK', 'NO', 'SE', 'FI', 'IS'] },
  { key: 'alps', cc: ['AT', 'CH', 'LI'] },
  { key: 'isles', cc: ['GB', 'IE'] },
];

/**
 * Factual milestones from what the record holds, at most `max`:
 *   region      every country of a small region visited ("All of Benelux")
 *   next        a region the next trip completes ("Portugal completes Iberia")
 *   nightTrain  a logged leg marked as a night train
 *   longest     the longest trip, with its nights (only from two trips on)
 *   north       the furthest north stayed (only from 55 degrees north)
 * Each { key, region?, cc?, n?, title?, city?, lat?, when? }. None when the
 * data cannot back them.
 */
export function europeMilestones({ beenIso = [], nextIso = [], trips = [], points = [], legs = [], max = 5 } = {}) {
  const out = [];
  const been = new Set(beenIso);
  REGIONS.forEach((r) => {
    if (r.cc.every((c) => been.has(c))) out.push({ key: 'region', region: r.key, n: r.cc.length });
  });
  const next = new Set(nextIso);
  REGIONS.forEach((r) => {
    const missing = r.cc.filter((c) => !been.has(c));
    if (missing.length && missing.every((c) => next.has(c))) {
      out.push({ key: 'next', region: r.key, cc: missing });
    }
  });
  if (legs.some((l) => l && (l.night === true || l.mode === 'nighttrain'))) out.push({ key: 'nightTrain' });
  const dated = trips.filter((x) => x.nights > 0);
  if (dated.length >= 2) {
    const long = dated.reduce((a, b) => (b.nights > a.nights ? b : a));
    out.push({ key: 'longest', n: long.nights, title: long.title, when: long.end || null });
  }
  const north = points.filter((p) => Number.isFinite(p.lat)).reduce((a, b) => (!a || b.lat > a.lat ? b : a), null);
  if (north && north.lat >= 55) out.push({ key: 'north', city: north.city, lat: north.lat });
  return out.slice(0, max);
}

/**
 * The record's money (T926), from the spend logged on past trips only:
 *   avgDay         what a day cost a person on the trips with spend and nights
 *   vsEstimate     that figure minus Carta's estimate for the same trips, only
 *                  when every trip counted has both
 *   cheapestGreat  the lowest day a person on a trip whose place scores in
 *                  the Excellent band or above: { eur, title, score, when }
 * trips: [{ id, title, nights, spendPP, estDayPP, score, end }].
 */
export function europeMoney(trips = [], { greatScore = 8.3 } = {}) {
  const spent = trips.filter((x) => Number.isFinite(x.spendPP) && x.spendPP > 0 && x.nights > 0);
  if (!spent.length) return { avgDay: null, vsEstimate: null, cheapestGreat: null, trips: 0 };
  const nights = spent.reduce((n, x) => n + x.nights, 0);
  const avgDay = spent.reduce((n, x) => n + x.spendPP, 0) / nights;
  const both = spent.every((x) => Number.isFinite(x.estDayPP) && x.estDayPP > 0);
  const est = both ? spent.reduce((n, x) => n + x.estDayPP * x.nights, 0) / nights : null;
  const great = spent
    .filter((x) => Number.isFinite(x.score) && x.score >= greatScore)
    .map((x) => ({ eur: x.spendPP / x.nights, title: x.title, score: x.score, when: x.end || null }))
    .sort((a, b) => a.eur - b.eur)[0] || null;
  return { avgDay, vsEstimate: est != null ? avgDay - est : null, cheapestGreat: great, trips: spent.length };
}
