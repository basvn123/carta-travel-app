import React, { useEffect, useMemo, useState } from 'react';
import { TripMap } from '../map/TripMap.jsx';
import { Dropdown } from '../components/Dropdown.jsx';
import { DateField } from '../components/DateField.jsx';
import { tripDaysBetween, haversineKm } from '../lib/runtime_pricing.js';
import { fetchActivitiesFull } from '../lib/appData.js';
import { fetchTripPlans, fetchTripPlanWithStops } from '../auth/tripPlanStorage.js';
import { fetchWalkingRoute, googleMapsDirUrl } from '../lib/routing.js';
import { countriesFromData } from '../lib/tripGuide.js';
import { CountryIntel } from '../components/CountryIntel.jsx';
import { useCountryInsights } from '../hooks/useCountryInsights.js';
import { addDays, todayISO, fmtDate as fmtDateFull } from '../lib/dates.js';

const fmtDate = (iso) => (iso ? fmtDateFull(iso).slice(0, 6) : '');

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

// Selectable "when does your day start" options for the suggested schedule.
const DAY_STARTS = [
  { min: 8 * 60, label: '8 AM · early bird' },
  { min: 9 * 60, label: '9 AM · classic' },
  { min: 10 * 60, label: '10 AM · slow morning' },
];
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

// Standalone day plans - a single city planned day by day, independent of any
// saved trip. Stored entirely on this device (like the activity assignments
// above), so they work for guests and don't need a signed-in account or a
// Supabase round-trip. Each entry is lightweight metadata; the actual per-day
// activity picks live under the shared assignments key, keyed by the plan id.
const STANDALONE_KEY = 'carta.dayplans.v1';
function loadStandalonePlans() {
  if (typeof window === 'undefined') return [];
  try {
    const list = JSON.parse(window.localStorage.getItem(STANDALONE_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
function persistStandalonePlans(list) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STANDALONE_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}

// Build the same { id, label, stops:[...] } shape the planner renders from a
// saved trip, so a one-city standalone plan flows through the exact same view.
function buildStandalonePlan(sp) {
  const days = Math.max(1, sp.days || 1);
  return {
    id: sp.id,
    label: sp.label || '',
    standalone: true,
    stops: [{
      destination_id: sp.destinationId,
      arrive_date: sp.startDate,
      depart_date: addDays(sp.startDate, days),
    }],
  };
}

export function DayPlannerTab({ data, user, authConfigured }) {
  const destinations = data?.destinations || {};
  const countryInsights = useCountryInsights();

  const [savedPlans, setSavedPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plan, setPlan] = useState(null); // { id, label, stops: [...] }
  const [stopIdx, setStopIdx] = useState(0);
  const [dayIdx, setDayIdx] = useState(0);
  const [assignments, setAssignments] = useState({}); // { [stopIdx]: { [dayIdx]: [activityIdx,...] } }
  // When the traveller likes their sightseeing day to start (schedule anchor).
  const [dayStartMin, setDayStartMin] = useState(9 * 60);

  // Locally-stored "plan a day for any city" plans (see STANDALONE_KEY).
  const [standalonePlans, setStandalonePlans] = useState(() => loadStandalonePlans());
  // Builder inputs for a new standalone plan (pick a country, then a city).
  const [newCountry, setNewCountry] = useState('');
  const [newCityId, setNewCityId] = useState('');
  const [newStartDate, setNewStartDate] = useState(() => todayISO());
  const [newDays, setNewDays] = useState(1);

  useEffect(() => {
    if (!user) { setSavedPlans([]); return; }
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

  const openStandalone = (sp) => {
    setPlan(buildStandalonePlan(sp));
    setStopIdx(0);
    setDayIdx(0);
    setAssignments(loadAssignments(sp.id));
  };

  const startStandalone = () => {
    if (!newCityId) return;
    const sp = {
      id: `local:${Date.now()}`,
      destinationId: newCityId,
      label: destinations[newCityId]?.city || 'Day plan',
      startDate: newStartDate || todayISO(),
      days: Math.max(1, newDays),
    };
    const next = [sp, ...standalonePlans];
    setStandalonePlans(next);
    persistStandalonePlans(next);
    setNewCountry('');
    setNewCityId('');
    setNewDays(1);
    openStandalone(sp);
  };

  const deleteStandalone = (id) => {
    const next = standalonePlans.filter((sp) => sp.id !== id);
    setStandalonePlans(next);
    persistStandalonePlans(next);
    if (typeof window !== 'undefined') {
      try { window.localStorage.removeItem(assignmentsKey(id)); } catch { /* ignore */ }
    }
  };

  // Tack another day onto the current standalone plan (persists to its entry).
  const addStandaloneDay = () => {
    if (!plan?.standalone) return;
    const nextDays = (days.length || 1) + 1;
    const next = standalonePlans.map((sp) => (sp.id === plan.id ? { ...sp, days: nextDays } : sp));
    setStandalonePlans(next);
    persistStandalonePlans(next);
    setPlan((p) => ({
      ...p,
      stops: [{ ...p.stops[0], depart_date: addDays(p.stops[0].arrive_date, nextDays) }],
    }));
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

  // Full POI lists (with coordinates, for map pins) live in a separate lazily
  // fetched file so the boot-time dataset stays small. Kicked off on mount;
  // until it lands (or if it fails) we fall back to the short name-only list.
  const [actFull, setActFull] = useState(null); // { destId: items_full } | null
  useEffect(() => {
    let alive = true;
    fetchActivitiesFull().then((m) => { if (alive) setActFull(m); });
    return () => { alive = false; };
  }, []);

  const activities = useMemo(() => {
    const a = stop?.dest?.activities;
    if (!a) return { items: [], limited: true };
    const full = (a.items_full && a.items_full.length)
      ? a.items_full
      : actFull?.[stop.destination_id];
    if (full && full.length) return { items: full, limited: false };
    return { items: (a.items || []).map((it) => ({ ...it, lat: null, lon: null })), limited: true };
  }, [stop, actFull]);

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

  const mapPins = assignedItems
    .filter((it) => it.lat != null && it.lon != null)
    .map((it) => ({ lat: it.lat, lon: it.lon, city: it.name }));

  // Real street-following walking route + per-leg distance/time from OSRM
  // (keyless FOSSGIS foot instance, see lib/routing). Re-fetched whenever the
  // ordered stops change; keyed on the coordinate string so a stale response
  // for a since-changed day is ignored. Falls back to straight-line estimates
  // when it's unavailable (offline, too few stops, or the router had no answer).
  const routeKey = mapPins.map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`).join(';');
  const [route, setRoute] = useState(null); // { key, geometry, legs, km, min }
  useEffect(() => {
    if (mapPins.length < 2) { setRoute(null); return; }
    let alive = true;
    fetchWalkingRoute(mapPins).then((r) => { if (alive && r) setRoute({ key: routeKey, ...r }); });
    return () => { alive = false; };
  }, [routeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const routeOk = route && route.key === routeKey;

  // Per-segment legs align to assignedItems only when every stop has coordinates
  // (then mapPins === assignedItems in order); otherwise we can't map a leg to a
  // gap and fall back to haversine for that segment.
  const legsAlign = routeOk
    && assignedItems.length >= 2
    && assignedItems.every((it) => it.lat != null && it.lon != null)
    && route.legs.length === assignedItems.length - 1;

  // A suggested schedule for the day - dwell time by category + walking time
  // between consecutive stops, chained from a 9:00 AM start. Uses the real OSRM
  // leg time/distance when available, else a straight-line estimate. Not real
  // opening-hours or booking data (see the disclaimer shown with it).
  const timeline = useMemo(() => {
    let cursor = dayStartMin;
    return assignedItems.map((it, i) => {
      const arrive = cursor;
      const depart = arrive + estimateDwellMinutes(it.kind);
      const next = assignedItems[i + 1];
      let walkKm = null, walkMin = null, walkReal = false;
      if (next && legsAlign) {
        walkKm = route.legs[i].km;
        walkMin = route.legs[i].min;
        walkReal = true;
      } else if (next && it.lat != null && it.lon != null && next.lat != null && next.lon != null) {
        walkKm = haversineKm(it.lat, it.lon, next.lat, next.lon);
        walkMin = estimateWalkMinutes(walkKm);
      }
      cursor = depart + (walkMin || 0);
      return { item: it, arrive, depart, walkKm, walkMin, walkReal };
    });
  }, [assignedItems, legsAlign, route, dayStartMin]);

  const gmapsUrl = googleMapsDirUrl(mapPins, 'walking');

  // Country -> city cascading pickers for "plan a day for any city". Countries
  // (with a rough centroid) come from the shared helper; the map lets you pick
  // the city visually once a country is chosen.
  const countryList = useMemo(() => countriesFromData(destinations), [destinations]);
  const countryOptions = countryList.map((c) => ({ value: c.country, label: c.country }));
  const activeCountry = countryList.find((c) => c.country === newCountry) || null;
  const cityOptions = (activeCountry?.cities || [])
    .map(({ id, dest }) => ({ value: id, label: dest.city }))
    .sort((a, b) => a.label.localeCompare(b.label));
  // City pins for the picker map (coords only), and which one is selected.
  const pickerCities = (activeCountry?.cities || [])
    .filter(({ dest }) => dest.lat != null && dest.lon != null)
    .map(({ id, dest }) => ({ id, lat: dest.lat, lon: dest.lon, city: dest.city }));
  const pickerSelectedIdx = pickerCities.findIndex((c) => c.id === newCityId);

  // Landing screen: plan a day for any city (no trip required), reopen a saved
  // day plan, or pick one of your saved trips to plan its stops.
  if (!plan) {
    return (
      <div className="trip-planner-screen day-landing-screen">
        <div className="day-landing">
          <div className="section-title">Day planner</div>
          <p className="day-landing-lead">
            Plan any city day by day - pick a place, add the sights you want to see,
            and Carta lays them out in a walkable order with a suggested schedule.
          </p>

          {/* Plan a day for any city: pick the country, then the city (list or map) */}
          <div className="day-build">
            <div className="trip-block-title">Plan a day for any city</div>
            <div className="day-build-row">
              <label className="trip-field">
                <span className="trip-field-label">Country</span>
                <Dropdown
                  value={newCountry}
                  onChange={(c) => { setNewCountry(c); setNewCityId(''); }}
                  options={countryOptions}
                  placeholder="Which country?"
                  searchPlaceholder="Search countries"
                />
              </label>
              <label className="trip-field">
                <span className="trip-field-label">City</span>
                <Dropdown
                  value={newCityId}
                  onChange={setNewCityId}
                  options={cityOptions}
                  placeholder={newCountry ? 'Which city?' : 'Pick a country first'}
                  searchPlaceholder="Search cities"
                />
              </label>
            </div>
            {pickerCities.length > 0 && (
              <div className="day-build-map">
                <TripMap
                  stops={pickerCities}
                  padBottom={12}
                  onSelectStop={(i) => pickerCities[i] && setNewCityId(pickerCities[i].id)}
                  selectedIndex={pickerSelectedIdx >= 0 ? pickerSelectedIdx : null}
                />
              </div>
            )}
            <div className="day-build-row">
              <label className="trip-field">
                <span className="trip-field-label">Start date</span>
                <DateField value={newStartDate} onChange={setNewStartDate} placeholder="Start date" />
              </label>
              <label className="trip-field">
                <span className="trip-field-label">Days</span>
                <div className="trip-people">
                  <button type="button" onClick={() => setNewDays((n) => Math.max(1, n - 1))} disabled={newDays <= 1} aria-label="Fewer days">–</button>
                  <span>{newDays}</span>
                  <button type="button" onClick={() => setNewDays((n) => Math.min(30, n + 1))} disabled={newDays >= 30} aria-label="More days">+</button>
                </div>
              </label>
            </div>
            <button className="trip-save-btn day-build-btn" onClick={startStandalone} disabled={!newCityId}>
              Start planning
            </button>
          </div>

          {/* Your saved day plans (stored on this device) */}
          {standalonePlans.length > 0 && (
            <div className="day-landing-section">
              <div className="trip-block-title">Your day plans</div>
              <div className="trip-saved-list">
                {standalonePlans.map((sp) => (
                  <div className="trip-saved-item" key={sp.id}>
                    <button className="trip-saved-main" onClick={() => openStandalone(sp)}>
                      {sp.label || destinations[sp.destinationId]?.city || 'Day plan'}
                      <small className="day-saved-sub">
                        {', '}{fmtDate(sp.startDate)}{sp.days > 1 ? `, ${sp.days} days` : ''}
                      </small>
                    </button>
                    <button className="trip-saved-del" onClick={() => deleteStandalone(sp.id)} aria-label="Delete day plan" title="Delete">×</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Or plan a day from a saved trip */}
          {authConfigured && user && (
            <div className="day-landing-section">
              <div className="trip-block-title">Plan a day from a saved trip</div>
              {plansLoading ? (
                <p className="trip-note">Loading your saved trips…</p>
              ) : savedPlans.length === 0 ? (
                <p className="trip-note">No saved trips yet - build and save one in Trip planner to plan its stops here.</p>
              ) : (
                <div className="trip-saved-list">
                  {savedPlans.map((p) => (
                    <div className="trip-saved-item" key={p.id}>
                      <button className="trip-saved-main" onClick={() => openPlan(p.id)}>
                        {p.label || 'Untitled trip'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {authConfigured && !user && (
            <p className="trip-note">
              Sign in on the Trip planner tab to also plan days from your saved trips.
              Day plans you make here are saved on this device.
            </p>
          )}
          {!authConfigured && (
            <p className="trip-note">
              Accounts aren't set up for this deployment, but day plans you make here are saved on this device.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="trip-planner-screen">
      <TripMap stops={mapPins} padBottom={420} routeGeometry={routeOk ? route.geometry : null} />

      <div className="trip-topcard" onClick={(e) => e.stopPropagation()}>
        <div className="trip-topcard-name">{plan.label || 'Untitled trip'}</div>
        <div className="trip-topcard-sub">
          {stop?.dest?.city || 'No stops in this trip'}
          {days[dayIdx] ? `, ${fmtDate(days[dayIdx])}` : ''}
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
                {plan.standalone && (
                  <button className="day-chip day-chip-add" onClick={addStandaloneDay} title="Add another day">+ Day</button>
                )}
              </div>
              <div className="day-chip-row day-start-row">
                {DAY_STARTS.map((s) => (
                  <button
                    key={s.min}
                    className={`day-chip ${dayStartMin === s.min ? 'active' : ''}`}
                    onClick={() => setDayStartMin(s.min)}
                  >
                    {s.label}
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
                    Suggested order and times, from a {minutesToClock(dayStartMin)} start.
                    {legsAlign
                      ? ' Walking times follow real streets (OpenStreetMap routing).'
                      : ' Walking times are straight-line estimates.'}
                    {' '}Not real opening hours or bookings.
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
                              ? `↓ ${t.walkReal ? '' : '≈'}${t.walkMin} min walk, ${t.walkKm.toFixed(1)} km`
                              : '↓ walking time unknown (no coordinates for one of these stops)'}
                          </div>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                  {gmapsUrl && (
                    <a className="day-gmaps-link" href={gmapsUrl} target="_blank" rel="noreferrer">
                      Open today's route in Google Maps ↗
                    </a>
                  )}
                </>
              )}
            </div>
          )}

          {/* Local intel for the country you're exploring */}
          {stop?.dest?.country && countryInsights?.[stop.dest.country] && (
            <div className="trip-block">
              <div className="trip-block-title">Local tips</div>
              <CountryIntel country={stop.dest.country} rec={countryInsights[stop.dest.country]} compact />
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
            <button className="trip-newtrip-btn" onClick={() => setPlan(null)}>← Back to all day plans</button>
          </div>
        </div>
      </div>
    </div>
  );
}
