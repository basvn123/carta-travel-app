import { useState, useMemo, useCallback } from 'react';
import {
  tripDaysBetween, accommodationPerPerson, groundSpendPerPerson, DEFAULT_LIFESTYLE,
} from '../runtime_pricing.js';
import { combineTripLegs, interCityGroundEstimate, suggestNextStops } from '../trip_planner_pricing.js';
import {
  fetchTripPlans, fetchTripPlanWithStops, createTripPlan, deleteTripPlan, saveTripPlanStops,
} from '../auth/tripPlanStorage.js';

function round2(v) {
  return v == null ? null : Math.round(v * 100) / 100;
}

/** Draft-plan state + pricing for the Trip Planner tab: an ordered list of
 *  stops, each with its own arrive/depart dates, priced by combining each
 *  destination's own real fare data (combineTripLegs) plus an estimated
 *  ground-transport leg between consecutive stops (interCityGroundEstimate).
 */
export function useTripPlanner(data) {
  const destinations = data?.destinations || {};

  const [stops, setStops] = useState([]); // [{ destinationId, arriveDate, departDate }]
  const [groupSize, setGroupSize] = useState(2);
  const [planId, setPlanId] = useState(null);
  const [planLabel, setPlanLabel] = useState('');
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved
  const [savedPlans, setSavedPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(false);

  const stopDetails = useMemo(() => stops.map((s) => ({
    ...s,
    dest: destinations[s.destinationId] || null,
    nights: tripDaysBetween(s.arriveDate, s.departDate),
  })), [stops, destinations]);

  const addStop = useCallback((destinationId, arriveDate, departDate) => {
    setStops((prev) => [...prev, { destinationId, arriveDate, departDate }]);
  }, []);

  const removeStop = useCallback((index) => {
    setStops((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateStop = useCallback((index, patch) => {
    setStops((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }, []);

  const clearPlan = useCallback(() => {
    setStops([]);
    setPlanId(null);
    setPlanLabel('');
  }, []);

  // Candidate next stops from wherever the itinerary currently ends.
  const nextStopSuggestions = useMemo(() => {
    const last = stopDetails[stopDetails.length - 1];
    if (!last || !last.dest) return [];
    return suggestNextStops(last.dest, destinations, last.departDate);
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
    setPlanId(plan.id);
    setPlanLabel(plan.label || '');
    setStops((plan.stops || []).map((s) => ({
      destinationId: s.destination_id,
      arriveDate: s.arrive_date,
      departDate: s.depart_date,
    })));
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
      await saveTripPlanStops(id, userId, stops.map((s, i) => {
        const dest = destinations[s.destinationId];
        const isLast = i === stops.length - 1;
        return {
          destinationId: s.destinationId,
          city: dest?.city,
          country: dest?.country,
          arriveDate: s.arriveDate,
          departDate: s.departDate,
          transportMode: isLast ? 'flight' : 'ground_estimate',
          transportNotes: isLast ? flight : legs[i],
          choices: {},
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
  }, [planId, planLabel, stops, destinations, legs, flight]);

  return {
    stops, stopDetails, groupSize, setGroupSize,
    addStop, removeStop, updateStop, clearPlan,
    nextStopSuggestions, flight, legs, stayCosts, grandTotal,
    planId, planLabel, setPlanLabel, saveState, savePlan,
    savedPlans, plansLoading, loadSavedPlans, loadPlan, removeSavedPlan,
  };
}
