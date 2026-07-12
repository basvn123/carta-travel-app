import React, { useEffect, useMemo, useState } from 'react';
import { TripMap } from './TripMap.jsx';
import { tripDaysBetween } from './runtime_pricing.js';
import { fetchTripPlans, fetchTripPlanWithStops } from './auth/tripPlanStorage.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]}`;
}

/** Add `n` days to an ISO 'YYYY-MM-DD' date (UTC-safe). */
function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Day-by-day activity assignments are a browsing/organizing aid, not part of
// the saved trip record (trip_plan_stops.choices is owned by the Trip Planner
// save flow) - kept locally per plan so they survive a reload without adding
// a second write path into the same Supabase columns.
function assignmentsKey(planId) {
  return `carta.dayplan.${planId}`;
}
function loadAssignments(planId) {
  if (!planId || typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(assignmentsKey(planId)) || '{}');
  } catch {
    return {};
  }
}
function persistAssignments(planId, assignments) {
  if (!planId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(assignmentsKey(planId), JSON.stringify(assignments));
  } catch { /* ignore */ }
}

export function DayPlannerTab({ data, user, authConfigured }) {
  const destinations = data?.destinations || {};

  const [savedPlans, setSavedPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plan, setPlan] = useState(null); // { id, label, stops: [...] }
  const [stopIdx, setStopIdx] = useState(0);
  const [dayIdx, setDayIdx] = useState(0);
  const [assignments, setAssignments] = useState({}); // { [stopIdx]: { [dayIdx]: [activityIdx,...] } }

  useEffect(() => {
    if (!user) return;
    setPlansLoading(true);
    fetchTripPlans(user.id).then(setSavedPlans).finally(() => setPlansLoading(false));
  }, [user?.id]);

  const openPlan = async (planId) => {
    const full = await fetchTripPlanWithStops(planId);
    setPlan(full);
    setStopIdx(0);
    setDayIdx(0);
    setAssignments(loadAssignments(planId));
  };

  const stops = useMemo(() => (plan?.stops || []).map((s) => ({
    ...s,
    dest: destinations[s.destination_id] || null,
    nights: Math.max(1, tripDaysBetween(s.arrive_date, s.depart_date) || 1),
  })), [plan, destinations]);

  const stop = stops[stopIdx] || null;
  const days = useMemo(() => {
    if (!stop) return [];
    return Array.from({ length: stop.nights }, (_, i) => addDays(stop.arrive_date, i));
  }, [stop]);

  // OpenTripMap-sourced destinations get items_full (with coordinates, for
  // map pins); everything else falls back to the name-only items list.
  const activities = useMemo(() => {
    const a = stop?.dest?.activities;
    if (!a) return { items: [], limited: true };
    if (a.items_full && a.items_full.length) return { items: a.items_full, limited: false };
    return { items: (a.items || []).map((it) => ({ ...it, lat: null, lon: null })), limited: true };
  }, [stop]);

  const dayAssignedIdx = assignments[stopIdx]?.[dayIdx] || [];
  const assignedItems = dayAssignedIdx.map((i) => activities.items[i]).filter(Boolean);

  const toggleActivity = (itemIdx) => {
    const current = assignments[stopIdx]?.[dayIdx] || [];
    const nextForDay = current.includes(itemIdx)
      ? current.filter((i) => i !== itemIdx)
      : [...current, itemIdx];
    const next = { ...assignments, [stopIdx]: { ...(assignments[stopIdx] || {}), [dayIdx]: nextForDay } };
    setAssignments(next);
    persistAssignments(plan?.id, next);
  };

  const mapPins = assignedItems
    .filter((it) => it.lat != null && it.lon != null)
    .map((it) => ({ lat: it.lat, lon: it.lon, city: it.name }));

  if (!authConfigured || !user) {
    return (
      <div className="trip-planner-screen day-empty-screen">
        <div className="day-empty">
          <div className="section-title">Day planner</div>
          <p>
            {authConfigured
              ? 'Sign in and save a trip in Trip planner first, then come back here to plan each day.'
              : "Accounts aren't set up for this deployment, so trips can't be saved or planned day by day."}
          </p>
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="trip-planner-screen day-empty-screen">
        <div className="day-empty">
          <div className="section-title">Day planner</div>
          {plansLoading ? (
            <p>Loading your saved trips…</p>
          ) : savedPlans.length === 0 ? (
            <p>Build and save a trip in Trip planner first, then pick it here to plan each day.</p>
          ) : (
            <>
              <p>Pick a saved trip to plan day by day.</p>
              <div className="trip-saved-list">
                {savedPlans.map((p) => (
                  <div className="trip-saved-item" key={p.id}>
                    <button className="trip-saved-main" onClick={() => openPlan(p.id)}>
                      {p.label || 'Untitled trip'}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="trip-planner-screen">
      <TripMap stops={mapPins} padBottom={420} />

      <div className="trip-topcard" onClick={(e) => e.stopPropagation()}>
        <div className="trip-topcard-name">{plan.label || 'Untitled trip'}</div>
        <div className="trip-topcard-sub">
          {stop?.dest?.city || 'No stops in this trip'}
          {days[dayIdx] ? ` · ${fmtDate(days[dayIdx])}` : ''}
        </div>
      </div>

      <div className="trip-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="trip-sheet-grip" />
        <div className="trip-sheet-scroll">

          {stops.length > 1 && (
            <div className="trip-block">
              <div className="trip-block-title">Stop</div>
              <div className="day-chip-row">
                {stops.map((s, i) => (
                  <button
                    key={i}
                    className={`day-chip ${i === stopIdx ? 'active' : ''}`}
                    onClick={() => { setStopIdx(i); setDayIdx(0); }}
                  >
                    {s.dest?.city || 'Unknown'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {stop && (
            <div className="trip-block">
              <div className="trip-block-title">Day</div>
              <div className="day-chip-row">
                {days.map((d, i) => (
                  <button
                    key={i}
                    className={`day-chip ${i === dayIdx ? 'active' : ''}`}
                    onClick={() => setDayIdx(i)}
                  >
                    Day {i + 1}
                  </button>
                ))}
              </div>
            </div>
          )}

          {stop && (
            <div className="trip-block">
              <div className="trip-block-title">
                Today's plan{assignedItems.length > 0 ? ` (${assignedItems.length})` : ''}
              </div>
              {assignedItems.length === 0 ? (
                <p className="trip-note">Tap an activity below to add it to this day.</p>
              ) : (
                <div className="day-assigned-list">
                  {assignedItems.map((it, i) => (
                    <div className="day-assigned-row" key={i}>
                      <span className="day-assigned-idx">{i + 1}</span>
                      <div className="day-assigned-body">
                        <span className="day-assigned-name">{it.name}</span>
                        <span className="day-assigned-kind">{it.kind}</span>
                      </div>
                      <button
                        className="trip-stop-remove"
                        onClick={() => toggleActivity(dayAssignedIdx[i])}
                        aria-label="Remove"
                        title="Remove"
                      >×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {stop && (
            <div className="trip-block">
              <div className="trip-block-title">Things to do in {stop.dest?.city}</div>
              {activities.limited && activities.items.length > 0 && (
                <p className="trip-note">Limited data for this destination - names only, no map pins.</p>
              )}
              {activities.items.length === 0 ? (
                <p className="trip-note">No activities catalogued for this destination yet.</p>
              ) : (
                <div className="day-activity-list">
                  {activities.items.map((it, i) => (
                    <button
                      key={i}
                      className={`day-activity-row ${dayAssignedIdx.includes(i) ? 'added' : ''}`}
                      onClick={() => toggleActivity(i)}
                    >
                      <div className="day-assigned-body">
                        <span className="day-assigned-name">{it.name}</span>
                        <span className="day-assigned-kind">{it.kind}</span>
                      </div>
                      <span className="day-activity-add">{dayAssignedIdx.includes(i) ? '✓' : '+'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="trip-block">
            <button className="trip-newtrip-btn" onClick={() => setPlan(null)}>← Choose a different trip</button>
          </div>
        </div>
      </div>
    </div>
  );
}
