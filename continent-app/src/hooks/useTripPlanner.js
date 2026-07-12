import { useState, useMemo, useCallback } from 'react';
import {
  tripDaysBetween, accommodationPerPerson, groundSpendPerPerson, DEFAULT_LIFESTYLE, haversineKm,
} from '../runtime_pricing.js';
import { combineTripLegs, interCityGroundEstimate, suggestNextStops } from '../trip_planner_pricing.js';
import {
  fetchTripPlans, fetchTripPlanWithStops, createTripPlan, deleteTripPlan, saveTripPlanStops,
} from '../auth/tripPlanStorage.js';

function round2(v) {
  return v == null ? null : Math.round(v * 100) / 100;
}

/** Add `n` days to an ISO 'YYYY-MM-DD' date (UTC-safe). */
function addDays(iso, n) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const DEFAULT_STOP_NIGHTS = 2;

/** Draft-plan state + pricing for the Trip Planner tab.
 *
 *  The traveller first picks the window they want to travel (tripStart -
 *  tripEnd), then adds an ordered list of stops, each with a number of nights.
 *  Arrival/departure dates chain automatically from the trip start, so there's
 *  no per-stop date juggling: bumping a stop's nights just shifts everything
 *  after it. Pricing then reuses each destination's own real fare data
 *  (combineTripLegs: fly into the first stop, out of the last) plus an
 *  estimated overland leg between consecutive stops (interCityGroundEstimate).
 */
export function useTripPlanner(data) {
  const destinations = data?.destinations || {};

  const [tripStart, setTripStart] = useState('');
  const [tripEnd, setTripEnd] = useState('');
  const [stops, setStops] = useState([]); // [{ destinationId, nights, activities: string[] }]
  const [groupSize, setGroupSize] = useState(2);
  const [planId, setPlanId] = useState(null);
  const [planLabel, setPlanLabel] = useState('');
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved
  const [savedPlans, setSavedPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [planned, setPlanned] = useState(false); // true = show the day-by-day itinerary view

  // Chain each stop's arrive/depart dates from the trip start. A stop with no
  // trip start yet still carries its nights so the UI can show "2 nights".
  const stopDetails = useMemo(() => {
    let cursor = tripStart;
    return stops.map((s) => {
      const nights = Math.max(0, s.nights || 0);
      const arriveDate = cursor || '';
      const departDate = cursor ? addDays(cursor, nights) : '';
      cursor = departDate;
      return {
        ...s,
        nights,
        activities: s.activities || [],
        arriveDate,
        departDate,
        dest: destinations[s.destinationId] || null,
      };
    });
  }, [stops, destinations, tripStart]);

  const plannedNights = useMemo(
    () => stops.reduce((sum, s) => sum + Math.max(0, s.nights || 0), 0),
    [stops],
  );
  const windowNights = useMemo(() => tripDaysBetween(tripStart, tripEnd), [tripStart, tripEnd]);

  const addStop = useCallback((destinationId, nights = DEFAULT_STOP_NIGHTS, activities = []) => {
    setStops((prev) => [...prev, { destinationId, nights, activities }]);
  }, []);

  const setStopActivities = useCallback((index, activities) => {
    setStops((prev) => prev.map((s, i) => (i === index ? { ...s, activities } : s)));
  }, []);

  const removeStop = useCallback((index) => {
    setStops((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const setStopNights = useCallback((index, nights) => {
    setStops((prev) => prev.map((s, i) => (
      i === index ? { ...s, nights: Math.max(0, Math.min(60, nights)) } : s
    )));
  }, []);

  const moveStop = useCallback((index, dir) => {
    setStops((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }, []);

  // Move the stop at `from` to sit at position `to` (drag-and-drop reorder).
  const reorderStop = useCallback((from, to) => {
    setStops((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  // Reorder the stops into an efficient nearest-neighbour route from the first
  // stop (the "let Carta plan this" payoff). Keeps stop 1 as the entry point.
  const optimizeRoute = useCallback(() => {
    setStops((prev) => {
      if (prev.length < 3) return prev;
      const nodes = prev.map((s) => ({ s, dest: destinations[s.destinationId] }));
      if (nodes.some((n) => !n.dest || n.dest.lat == null)) return prev;
      const ordered = [nodes[0]];
      const remaining = nodes.slice(1);
      let cur = nodes[0];
      while (remaining.length) {
        let bi = 0;
        let bd = Infinity;
        remaining.forEach((n, idx) => {
          const km = haversineKm(cur.dest.lat, cur.dest.lon, n.dest.lat, n.dest.lon);
          if (km != null && km < bd) { bd = km; bi = idx; }
        });
        cur = remaining[bi];
        ordered.push(cur);
        remaining.splice(bi, 1);
      }
      return ordered.map((n) => n.s);
    });
  }, [destinations]);

  const clearPlan = useCallback(() => {
    setStops([]);
    setPlanId(null);
    setPlanLabel('');
    setPlanned(false);
  }, []);

  // Load a whole itinerary the guided wizard just assembled: a start date, an
  // ordered list of { destinationId, nights, activities }, and an optional name.
  const loadFromWizard = useCallback(({ startDate, stops: wizardStops, label }) => {
    const total = wizardStops.reduce((sum, s) => sum + Math.max(0, s.nights || 0), 0);
    setTripStart(startDate || '');
    setTripEnd(startDate ? addDays(startDate, total) : '');
    setStops(wizardStops.map((s) => ({
      destinationId: s.destinationId,
      nights: Math.max(1, s.nights || 1),
      activities: s.activities || [],
    })));
    if (label != null) setPlanLabel(label);
    setPlanId(null);
    setPlanned(false);
  }, []);

  // Candidate next stops from wherever the itinerary currently ends, ranked to
  // surface the most beautiful/characterful places (see suggestNextStops).
  const nextStopSuggestions = useMemo(() => {
    const last = stopDetails[stopDetails.length - 1];
    if (!last || !last.dest) return [];
    return suggestNextStops(last.dest, destinations, last.departDate, {
      firstDest: stopDetails[0]?.dest || null,
    });
  }, [stopDetails, destinations]);

  // Real combined flight fare: into the first stop, out of the last stop.
  const flight = useMemo(() => {
    const first = stopDetails[0];
    const last = stopDetails[stopDetails.length - 1];
    if (!first?.dest || !last?.dest) return null;
    return combineTripLegs(first.dest, first.arriveDate, last.dest, last.departDate, groupSize);
  }, [stopDetails, groupSize]);

  // Estimated ground transport between each consecutive pair of stops.
  const legs = useMemo(() => {
    const out = [];
    for (let i = 0; i < stopDetails.length - 1; i++) {
      const a = stopDetails[i].dest;
      const b = stopDetails[i + 1].dest;
      out.push(a && b ? interCityGroundEstimate(a, b, groupSize) : null);
    }
    return out;
  }, [stopDetails, groupSize]);

  // Accommodation + on-the-ground spend per stop (default lifestyle - the full
  // sliders live in the Map tab's Lifestyle panel; a trip spanning several
  // destinations isn't the place to re-tune per-stop dining habits in v1).
  const stayCosts = useMemo(() => stopDetails.map((s) => {
    if (!s.dest) return null;
    const accom = accommodationPerPerson(s.dest, s.nights, s.arriveDate);
    const ground = groundSpendPerPerson(s.dest, s.nights, DEFAULT_LIFESTYLE);
    const accomTotal = round2((accom ? accom.total : 0) * groupSize);
    const groundTotal = round2((ground ? ground.total : 0) * groupSize);
    return { accom, ground, accomTotal, groundTotal, total: round2(accomTotal + groundTotal) };
  }), [stopDetails, groupSize]);

  const grandTotal = useMemo(() => {
    let total = 0;
    if (flight?.combinable) total += flight.fare_total + flight.ground_total;
    legs.forEach((l) => { if (l) total += l.ground_total; });
    stayCosts.forEach((s) => { if (s) total += s.total; });
    return round2(total);
  }, [flight, legs, stayCosts]);

  // Continuous day-by-day itinerary: one entry per day on the ground, tagged
  // with the city you're staying in and that day's share of its chosen
  // attractions (spread round-robin across the stay). Powers the Overview /
  // Day 1 / Day 2 ... view once the trip is "planned".
  const dayPlan = useMemo(() => {
    const days = [];
    let dayNum = 1;
    stopDetails.forEach((s, stopIndex) => {
      const nDays = Math.max(1, s.nights);
      const acts = s.activities || [];
      const buckets = Array.from({ length: nDays }, () => []);
      acts.forEach((a, ai) => buckets[ai % nDays].push(a));
      for (let di = 0; di < nDays; di++) {
        days.push({
          dayNum: dayNum++,
          dayOfStay: di + 1,
          staysOfCity: nDays,
          date: s.arriveDate ? addDays(s.arriveDate, di) : '',
          stop: s,
          stopIndex,
          activities: buckets[di],
        });
      }
    });
    return days;
  }, [stopDetails]);

  const loadSavedPlans = useCallback(async (userId) => {
    if (!userId) return;
    setPlansLoading(true);
    try {
      setSavedPlans(await fetchTripPlans(userId));
    } finally {
      setPlansLoading(false);
    }
  }, []);

  const loadPlan = useCallback(async (tripPlanId) => {
    const plan = await fetchTripPlanWithStops(tripPlanId);
    const sorted = (plan.stops || []).slice();
    setPlanId(plan.id);
    setPlanLabel(plan.label || '');
    // Reconstruct the trip window + per-stop nights from the stored dates.
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    setTripStart(first?.arrive_date || '');
    setTripEnd(last?.depart_date || '');
    setStops(sorted.map((s) => ({
      destinationId: s.destination_id,
      nights: tripDaysBetween(s.arrive_date, s.depart_date) || DEFAULT_STOP_NIGHTS,
      activities: Array.isArray(s.choices?.activities) ? s.choices.activities : [],
    })));
    setPlanned(false);
  }, []);

  const removeSavedPlan = useCallback(async (tripPlanId) => {
    await deleteTripPlan(tripPlanId);
    setSavedPlans((prev) => prev.filter((p) => p.id !== tripPlanId));
    if (planId === tripPlanId) clearPlan();
  }, [planId, clearPlan]);

  const savePlan = useCallback(async (userId) => {
    if (!userId || stops.length < 1) return null;
    setSaveState('saving');
    try {
      const id = planId || await createTripPlan(userId, planLabel || null);
      await saveTripPlanStops(id, userId, stopDetails.map((s, i) => {
        const isLast = i === stopDetails.length - 1;
        return {
          destinationId: s.destinationId,
          city: s.dest?.city,
          country: s.dest?.country,
          arriveDate: s.arriveDate,
          departDate: s.departDate,
          transportMode: isLast ? 'flight' : 'ground_estimate',
          transportNotes: isLast ? flight : legs[i],
          choices: { nights: s.nights, groupSize, activities: s.activities || [] },
        };
      }));
      setPlanId(id);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
      return id;
    } catch (e) {
      setSaveState('idle');
      throw e;
    }
  }, [planId, planLabel, stops, stopDetails, groupSize, legs, flight]);

  return {
    tripStart, setTripStart, tripEnd, setTripEnd,
    stops, stopDetails, plannedNights, windowNights,
    groupSize, setGroupSize,
    addStop, removeStop, setStopNights, setStopActivities, moveStop, reorderStop,
    optimizeRoute, clearPlan, loadFromWizard,
    nextStopSuggestions, flight, legs, stayCosts, grandTotal, dayPlan,
    planned, setPlanned,
    planId, planLabel, setPlanLabel, saveState, savePlan,
    savedPlans, plansLoading, loadSavedPlans, loadPlan, removeSavedPlan,
  };
}
