import React, { useEffect, useMemo, useState } from 'react';
import { TripMap } from './TripMap.jsx';
import { tripDaysBetween, haversineKm } from './runtime_pricing.js';
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

// Typical time actually spent at a place, by category - a rough default used
// only to lay out a SUGGESTED schedule (see the disclaimer in the UI); this
// is not real opening-hours or visit-duration data.
const DWELL_MINUTES_BY_KIND = {
  museum: 120, gallery: 120, zoo: 120, aquarium: 120,
  castle: 90, palace: 90, fortress: 90, citadel: 90,
  'ancient site': 90, ruins: 90, 'roman site': 90,
  park: 75, garden: 75, beach: 75, lake: 75,
  church: 30, cathedral: 30, basilica: 30, monastery: 30, temple: 30,
  mosque: 30, synagogue: 30, chapel: 30, convent: 30,
  square: 20, monument: 20, memorial: 20, statue: 20, fountain: 20,
  viewpoint: 20, tower: 20, gate: 20, bridge: 20, lighthouse: 20,
  market: 45, brewery: 45, winery: 45,
};
const DEFAULT_DWELL_MIN = 45;
function estimateDwellMinutes(kind) {
  return DWELL_MINUTES_BY_KIND[(kind || '').toLowerCase()] ?? DEFAULT_DWELL_MIN;
}

const WALK_KMH = 4.8; // average walking pace, for a rough time estimate
function estimateWalkMinutes(km) {
  return Math.max(1, Math.round((km / WALK_KMH) * 60));
}

const DAY_START_MIN = 9 * 60; // suggested schedule starts at 9:00 AM
function minutesToClock(totalMin) {
  const h24 = Math.floor((totalMin / 60) % 24);
  const m = Math.round(totalMin % 60);
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/** Reorders a day's assigned activity indices to minimize backtracking - a
 *  simple nearest-neighbour walk starting from the first-added stop with
 *  coordinates. Activities without coordinates (limited-data destinations)
 *  can't be routed, so they're kept, appended at the end in add order. */
function optimizeOrder(idxArray, itemsAll) {
  const withCoords = [];
  const withoutCoords = [];
  for (const idx of idxArray) {
    const it = itemsAll[idx];
    (it && it.lat != null && it.lon != null ? withCoords : withoutCoords).push(idx);
  }
  if (withCoords.length <= 1) return [...withCoords, ...withoutCoords];

  const remaining = new Set(withCoords);
  let current = withCoords[0];
  const ordered = [current];
  remaining.delete(current);
  while (remaining.size > 0) {
    const curItem = itemsAll[current];
    let best = null, bestDist = Infinity;
    for (const cand of remaining) {
      const c = itemsAll[cand];
      const d = haversineKm(curItem.lat, curItem.lon, c.lat, c.lon);
      if (d != null && d < bestDist) { bestDist = d; best = cand; }
    }
    if (best == null) break;
    ordered.push(best);
    remaining.delete(best);
    current = best;
  }
  return [...ordered, ...withoutCoords];
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

  const commitDay = (nextForDay) => {
    const next = { ...assignments, [stopIdx]: { ...(assignments[stopIdx] || {}), [dayIdx]: nextForDay } };
    setAssignments(next);
    persistAssignments(plan?.id, next);
  };

  // Adding a stop re-optimizes the whole day's route (nearest-neighbour) so
  // it's never left zigzagging; removing just drops it in place.
  const toggleActivity = (itemIdx) => {
    const current = assignments[stopIdx]?.[dayIdx] || [];
    if (current.includes(itemIdx)) {
      commitDay(current.filter((i) => i !== itemIdx));
    } else {
      commitDay(optimizeOrder([...current, itemIdx], activities.items));
    }
  };

  // Manual override of the auto-optimized order.
  const moveAssigned = (pos, dir) => {
    const current = assignments[stopIdx]?.[dayIdx] || [];
    const j = pos + dir;
    if (j < 0 || j >= current.length) return;
    const nextForDay = [...current];
    [nextForDay[pos], nextForDay[j]] = [nextForDay[j], nextForDay[pos]];
    commitDay(nextForDay);
  };

  // A suggested schedule for the day - dwell time by category + walking time
  // between consecutive stops, chained from a 9:00 AM start. Not real
  // opening-hours or booking data (see the disclaimer shown with it).
  const timeline = useMemo(() => {
    let cursor = DAY_START_MIN;
    return assignedItems.map((it, i) => {
      const arrive = cursor;
      const depart = arrive + estimateDwellMinutes(it.kind);
      const next = assignedItems[i + 1];
      let walkKm = null, walkMin = null;
      if (next && it.lat != null && it.lon != null && next.lat != null && next.lon != null) {
        walkKm = haversineKm(it.lat, it.lon, next.lat, next.lon);
        walkMin = estimateWalkMinutes(walkKm);
      }
      cursor = depart + (walkMin || 0);
      return { item: it, arrive, depart, walkKm, walkMin };
    });
  }, [assignedItems]);

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
                <p className="trip-note">Tap an activity below to add it to this day - the route auto-orders itself to avoid zigzagging.</p>
              ) : (
                <>
                  <p className="trip-note day-timeline-note">
                    Suggested order and times, from a 9:00 AM start - not real opening hours or bookings.
                  </p>
                  <div className="day-timeline">
                    {timeline.map((t, i) => (
                      <React.Fragment key={i}>
                        <div className="day-timeline-row">
                          <div className="day-timeline-time">{minutesToClock(t.arrive)}</div>
                          <div className="day-assigned-row">
                            <div className="day-assigned-body">
                              <span className="day-assigned-name">{t.item.name}</span>
                              <span className="day-assigned-kind">{t.item.kind}</span>
                            </div>
                            <div className="day-timeline-tools">
                              <button className="trip-stop-move" onClick={() => moveAssigned(i, -1)} disabled={i === 0} aria-label="Move earlier" title="Move earlier">↑</button>
                              <button className="trip-stop-move" onClick={() => moveAssigned(i, 1)} disabled={i === timeline.length - 1} aria-label="Move later" title="Move later">↓</button>
                              <button className="trip-stop-remove" onClick={() => toggleActivity(dayAssignedIdx[i])} aria-label="Remove" title="Remove">×</button>
                            </div>
                          </div>
                        </div>
                        {i < timeline.length - 1 && (
                          <div className="day-timeline-walk">
                            {t.walkMin != null
                              ? `↓ ${t.walkMin} min walk · ${t.walkKm.toFixed(1)} km`
                              : '↓ walking time unknown (no coordinates for one of these stops)'}
                          </div>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </>
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
