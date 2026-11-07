import { todayISO, addDays, fmtDate as fmtDateFull } from '../../lib/dates.js';
import { E2E_SEAMS } from '../../lib/e2eSeams.js';

// The day map's two filter axes, kept apart on purpose: WHAT a place is is the
// everyday question and stays on screen; HOW GOOD it is is an occasional
// narrowing and lives in the collapsible group.
const MAP_CATS = [
  { key: 'all', labelKey: 'day.mapCatAll' },
  { key: 'sight', labelKey: 'day.mapCatSights' },
  { key: 'nature', labelKey: 'day.mapCatNature' },
  { key: 'active', labelKey: 'day.mapCatActive' },
  { key: 'food', labelKey: 'day.mapCatFood' },
];

const MAP_RATINGS = [
  { key: 'all', labelKey: 'day.mapQualityAny' },
  { key: 'top', labelKey: 'day.mapQualityTop' },
  { key: 'must', labelKey: 'day.mapQualityMust' },
];

export const NO_PINS = Object.freeze({});

// How close a shortlisted place and a harvested POI have to be before they
// are treated as the same thing. 1.2 km is generous enough to survive the two
// sources disagreeing about where a long beach or a lake "is" (one may pin
// the car park, the other the water), and tight enough that it cannot snap
// onto a different landmark in a dense old town.
export const SHORTLIST_SNAP_KM = 1.2;

// Build the same { id, label, stops:[...] } shape the planner renders from a
// saved trip, so a standalone plan (single or multi-city) flows through the
// exact same view. Stop dates chain from the plan's start date.
export function buildStandalonePlan(sp) {
  let cursor = sp.startDate || todayISO();
  const stops = (sp.stops || []).map((st) => {
    const days = Math.max(1, st.days || 1);
    const arrive = cursor;
    cursor = addDays(cursor, days);
    return { destination_id: st.destinationId, arrive_date: arrive, depart_date: cursor };
  });
  return {
    id: sp.id,
    label: sp.label || '',
    standalone: true,
    stayCityId: sp.stayCityId || '',
    stayPoint: sp.stayPoint || null, // { label, shortLabel, lat, lon } from the address search
    stops,
  };
}

export function mockTripPlans() {
  const iso = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const stops = [
    { trip_plan_id: 'mp1', position: 0, destination_id: 'LIS', city: 'Lisbon', country: 'Portugal', arrive_date: iso(5), depart_date: iso(8) },
    { trip_plan_id: 'mp1', position: 1, destination_id: 'OPO', city: 'Porto', country: 'Portugal', arrive_date: iso(8), depart_date: iso(10) },
  ];
  return [{
    id: 'mp1', user_id: 'mock', label: null, cities: ['Lisbon', 'Porto'], countries: ['Portugal'],
    start_date: iso(5), end_date: iso(10), destination_ids: ['LIS', 'OPO'], stops, created_at: iso(-3),
  }];
}

export const fmtDate = (iso) => (iso ? fmtDateFull(iso).slice(0, 6) : '');

// ?savedmock verify seam, same precedent as the trips panel: one fixture trip
// stands in for the trip_plans table so the Continue-a-trip cards and the
// which-day sheet render in headless checks without a signed-in session.
// Compiled out of production builds with the rest of the seams.
export const SAVED_MOCK = E2E_SEAMS && typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).has('savedmock');
