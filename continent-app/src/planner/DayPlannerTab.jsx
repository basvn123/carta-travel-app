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
import { draftDays, tieredActivities, optimizeOrder, clusterIntoDays } from './dayDraft.js';
import { ShapeDayWizard } from './ShapeDayWizard.jsx';
import {
  loadStandalonePlans, persistStandalonePlans, deleteStandalonePlan,
  loadAssignments, persistAssignments, loadPrefs, persistPrefs,
} from './dayPlanStore.js';
import { SparkIcon, StarIcon, InfoIcon, MountainIcon, ShareIcon, MapPinIcon } from '../components/Icons.jsx';

const fmtDate = (iso) => (iso ? fmtDateFull(iso).slice(0, 6) : '');

const WALK_KMH = 4.8; // average walking pace, for the straight-line fallback
function estimateWalkMinutes(km) {
  return Math.max(1, Math.round((km / WALK_KMH) * 60));
}

// Build the same { id, label, stops:[...] } shape the planner renders from a
// saved trip, so a standalone plan (single or multi-city) flows through the
// exact same view. Stop dates chain from the plan's start date.
function buildStandalonePlan(sp) {
  let cursor = sp.startDate || todayISO();
  const stops = (sp.stops || []).map((st) => {
    const days = Math.max(1, st.days || 1);
    const arrive = cursor;
    cursor = addDays(cursor, days);
    return { destination_id: st.destinationId, arrive_date: arrive, depart_date: cursor };
  });
  return { id: sp.id, label: sp.label || '', standalone: true, stops };
}

export function DayPlannerTab({ data, user, authConfigured, openPlanId, onOpenPlanConsumed }) {
  const destinations = data?.destinations || {};
  const countryInsights = useCountryInsights();

  const [savedPlans, setSavedPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plan, setPlan] = useState(null); // { id, label, stops: [...] }
  const [stopIdx, setStopIdx] = useState(0);
  const [dayIdx, setDayIdx] = useState(0);
  const [assignments, setAssignments] = useState({}); // { [stopIdx]: { [dayIdx]: [activityIdx,...] } }
  // "Shape your day" answers (null until asked) + whether the wizard is open.
  const [prefs, setPrefs] = useState(null);
  const [showShape, setShowShape] = useState(false);
  // Carta keeps the walking order optimal on every add ('auto'); manual
  // reordering switches to 'manual' until "Best route" is tapped again.
  const [routeMode, setRouteMode] = useState('auto');
  const [shareState, setShareState] = useState('idle'); // idle | copied

  // Locally-stored "plan a day for any city" plans (see dayPlanStore).
  const [standalonePlans, setStandalonePlans] = useState(() => loadStandalonePlans());
  // Builder inputs for a new standalone plan (pick a country, then a city).
  const [newCountry, setNewCountry] = useState('');
  const [newCityId, setNewCityId] = useState('');
  const [newStartDate, setNewStartDate] = useState(() => todayISO());
  const [newDays, setNewDays] = useState(1);
  // "Add another city" picker inside an open standalone plan.
  const [addCityId, setAddCityId] = useState('');

  useEffect(() => {
    if (!user) { setSavedPlans([]); return; }
    setPlansLoading(true);
    fetchTripPlans(user.id).then(setSavedPlans).finally(() => setPlansLoading(false));
  }, [user?.id]);

  // Shared open-plan bootstrap: restore assignments + shape-your-day answers,
  // and lead with the wizard when nothing is planned yet.
  const bootPlan = (planId) => {
    setStopIdx(0);
    setDayIdx(0);
    const a = loadAssignments(planId);
    setAssignments(a);
    const p = loadPrefs(planId);
    setPrefs(p);
    setRouteMode(p?.routeMode || 'auto');
    setShowShape(Object.keys(a).length === 0);
  };

  const openPlan = async (planId) => {
    const full = await fetchTripPlanWithStops(planId);
    setPlan(full);
    bootPlan(planId);
  };

  const openStandalone = (sp) => {
    setPlan(buildStandalonePlan(sp));
    bootPlan(sp.id);
  };

  // Deep-link from the Saved-trips overview: open that day plan directly.
  useEffect(() => {
    if (!openPlanId) return;
    const sp = standalonePlans.find((x) => x.id === openPlanId);
    if (sp) openStandalone(sp);
    onOpenPlanConsumed && onOpenPlanConsumed();
  }, [openPlanId]); // eslint-disable-line react-hooks/exhaustive-deps

  const startStandalone = () => {
    if (!newCityId) return;
    const sp = {
      id: `local:${Date.now()}`,
      label: destinations[newCityId]?.city || 'Day plan',
      startDate: newStartDate || todayISO(),
      stops: [{ destinationId: newCityId, days: Math.max(1, newDays) }],
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
    setStandalonePlans(deleteStandalonePlan(id));
  };

  // Update the open standalone plan's stored stops and refresh the view.
  const patchStandalone = (mutate) => {
    if (!plan?.standalone) return;
    let patched = null;
    const next = standalonePlans.map((sp) => {
      if (sp.id !== plan.id) return sp;
      patched = mutate({ ...sp, stops: sp.stops.map((s) => ({ ...s })) });
      return patched;
    });
    if (!patched) return;
    setStandalonePlans(next);
    persistStandalonePlans(next);
    setPlan(buildStandalonePlan(patched));
  };

  // Tack another day onto the CURRENT city of the standalone plan.
  const addStandaloneDay = () => {
    patchStandalone((sp) => {
      if (sp.stops[stopIdx]) sp.stops[stopIdx].days += 1;
      return sp;
    });
  };

  // Multi-city: append another city to this day trip. Its picks live under
  // the same assignments record, keyed by the new stop index.
  const addStandaloneCity = () => {
    if (!addCityId) return;
    patchStandalone((sp) => {
      sp.stops.push({ destinationId: addCityId, days: 1 });
      sp.label = sp.stops.map((s) => destinations[s.destinationId]?.city).filter(Boolean).join(' + ');
      return sp;
    });
    setAddCityId('');
  };

  const removeStandaloneCity = (i) => {
    patchStandalone((sp) => {
      sp.stops.splice(i, 1);
      sp.label = sp.stops.map((s) => destinations[s.destinationId]?.city).filter(Boolean).join(' + ') || sp.label;
      return sp;
    });
    // Drop that stop's picks and reindex the ones after it.
    const next = {};
    Object.entries(assignments).forEach(([si, days]) => {
      const n = Number(si);
      if (n === i) return;
      next[n > i ? n - 1 : n] = days;
    });
    setAssignments(next);
    persistAssignments(plan?.id, next);
    setStopIdx(0);
    setDayIdx(0);
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
  // fetched file so the boot-time dataset stays small.
  const [actFull, setActFull] = useState(null); // { destId: items_full } | null
  useEffect(() => {
    let alive = true;
    fetchActivitiesFull().then((m) => { if (alive) setActFull(m); });
    return () => { alive = false; };
  }, []);

  const itemsForStop = (s, fullMap = actFull) => {
    const a = s?.dest?.activities;
    if (!a) return { items: [], limited: true };
    const full = (a.items_full && a.items_full.length)
      ? a.items_full
      : fullMap?.[s.destination_id];
    if (full && full.length) return { items: full, limited: false };
    return { items: (a.items || []).map((it) => ({ ...it, lat: null, lon: null })), limited: true };
  };

  const activities = useMemo(() => itemsForStop(stop), [stop, actFull]); // eslint-disable-line react-hooks/exhaustive-deps

  // Must-see / recommended / more / active tiers for the current stop's list.
  const tiers = useMemo(() => tieredActivities(activities.items), [activities]);

  // Draft from the traveller's answers. 'picks' fills the CURRENT city's days
  // with their accepted cards; 'auto' lets Carta draft every city of the plan.
  const applyDraft = async (p) => {
    const fullMap = actFull ?? await fetchActivitiesFull();
    if (!actFull && fullMap) setActFull(fullMap);
    const interests = new Set(p.interests || []);
    let next;
    if (p.mode === 'picks' && p.pickIdx?.length) {
      const { items } = itemsForStop(stop, fullMap);
      const lists = clusterIntoDays(p.pickIdx, items, stop?.nights || 1);
      next = { ...assignments, [stopIdx]: {} };
      lists.forEach((lst, di) => { if (lst.length) next[stopIdx][di] = lst; });
    } else {
      next = {};
      stops.forEach((s, si) => {
        const { items } = itemsForStop(s, fullMap);
        const lists = draftDays({
          items,
          numDays: s.nights,
          interests,
          paceKey: 'balanced',
          dwellFn: () => 60,
        });
        next[si] = {};
        lists.forEach((lst, di) => { if (lst.length) next[si][di] = lst; });
      });
    }
    setAssignments(next);
    persistAssignments(plan?.id, next);
    const savedPrefs = { style: p.style, interests: p.interests, routeMode };
    setPrefs(savedPrefs);
    persistPrefs(plan?.id, savedPrefs);
    setShowShape(false);
  };

  const dayAssignedIdx = assignments[stopIdx]?.[dayIdx] || [];
  const assignedItems = dayAssignedIdx.map((i) => activities.items[i]).filter(Boolean);

  const commitDay = (nextForDay) => {
    const next = { ...assignments, [stopIdx]: { ...(assignments[stopIdx] || {}), [dayIdx]: nextForDay } };
    setAssignments(next);
    persistAssignments(plan?.id, next);
  };

  const setRoute = (mode) => {
    setRouteMode(mode);
    const savedPrefs = { ...(prefs || {}), routeMode: mode };
    setPrefs(savedPrefs);
    persistPrefs(plan?.id, savedPrefs);
  };

  // Adding a stop re-optimizes the whole day's route (nearest-neighbour) when
  // Carta is in charge of the order; removing just drops it in place.
  const toggleActivity = (itemIdx) => {
    const current = assignments[stopIdx]?.[dayIdx] || [];
    if (current.includes(itemIdx)) {
      commitDay(current.filter((i) => i !== itemIdx));
    } else {
      const next = [...current, itemIdx];
      commitDay(routeMode === 'auto' ? optimizeOrder(next, activities.items) : next);
    }
  };

  // Manual override of the auto-optimized order: switches to manual mode so
  // Carta stops rearranging what the traveller deliberately ordered.
  const moveAssigned = (pos, dir) => {
    const current = assignments[stopIdx]?.[dayIdx] || [];
    const j = pos + dir;
    if (j < 0 || j >= current.length) return;
    const nextForDay = [...current];
    [nextForDay[pos], nextForDay[j]] = [nextForDay[j], nextForDay[pos]];
    if (routeMode !== 'manual') setRoute('manual');
    commitDay(nextForDay);
  };

  const optimizeNow = () => {
    commitDay(optimizeOrder(dayAssignedIdx, activities.items));
    setRoute('auto');
  };

  const mapPins = assignedItems
    .filter((it) => it.lat != null && it.lon != null)
    .map((it) => ({ lat: it.lat, lon: it.lon, city: it.name }));

  // Real street-following walking route + per-leg distance/time from OSRM.
  const routeKey = mapPins.map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`).join(';');
  const [route, setRouteGeom] = useState(null); // { key, geometry, legs, km, min }
  useEffect(() => {
    if (mapPins.length < 2) { setRouteGeom(null); return; }
    let alive = true;
    fetchWalkingRoute(mapPins).then((r) => { if (alive && r) setRouteGeom({ key: routeKey, ...r }); });
    return () => { alive = false; };
  }, [routeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const routeOk = route && route.key === routeKey;

  // Per-segment legs align to assignedItems only when every stop has coordinates.
  const legsAlign = routeOk
    && assignedItems.length >= 2
    && assignedItems.every((it) => it.lat != null && it.lon != null)
    && route.legs.length === assignedItems.length - 1;

  const walkLeg = (i) => {
    const it = assignedItems[i];
    const next = assignedItems[i + 1];
    if (!next) return null;
    if (legsAlign) return { km: route.legs[i].km, min: route.legs[i].min, real: true };
    if (it.lat != null && it.lon != null && next.lat != null && next.lon != null) {
      const km = haversineKm(it.lat, it.lon, next.lat, next.lon);
      return { km, min: estimateWalkMinutes(km), real: false };
    }
    return null;
  };

  const gmapsUrl = googleMapsDirUrl(mapPins, 'walking');

  const shareDay = async () => {
    const cityName = stop?.dest?.city || 'my day';
    const lines = assignedItems.map((it, i) => `${i + 1}. ${it.name}`);
    const text = [`My day in ${cityName} (Carta):`, ...lines, gmapsUrl ? `Route: ${gmapsUrl}` : '']
      .filter(Boolean).join('\n');
    try {
      if (navigator.share) {
        await navigator.share({ title: `Day in ${cityName}`, text });
        return;
      }
    } catch { /* cancelled - fall through to clipboard */ }
    try {
      await navigator.clipboard.writeText(text);
      setShareState('copied');
      setTimeout(() => setShareState('idle'), 2000);
    } catch { /* clipboard unavailable */ }
  };

  // Country -> city cascading pickers for "plan a day for any city".
  const countryList = useMemo(() => countriesFromData(destinations), [destinations]);
  const countryOptions = countryList.map((c) => ({ value: c.country, label: c.country }));
  const activeCountry = countryList.find((c) => c.country === newCountry) || null;
  const cityOptions = (activeCountry?.cities || [])
    .map(({ id, dest }) => ({ value: id, label: dest.city }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const pickerCities = (activeCountry?.cities || [])
    .filter(({ dest }) => dest.lat != null && dest.lon != null)
    .map(({ id, dest }) => ({ id, lat: dest.lat, lon: dest.lon, city: dest.city }));
  const pickerSelectedIdx = pickerCities.findIndex((c) => c.id === newCityId);

  // Every destination, for the in-plan "add another city" picker.
  const allCityOptions = useMemo(() => Object.entries(destinations)
    .map(([id, d]) => ({ value: id, label: `${d.city}, ${d.country}` }))
    .sort((a, b) => a.label.localeCompare(b.label)), [destinations]);

  // Landing screen: plan a day for any city (no trip required), reopen a saved
  // day plan, or pick one of your saved trips to plan its stops.
  if (!plan) {
    return (
      <div className="trip-planner-screen day-landing-screen">
        <div className="day-landing">
          <div className="section-title">Day planner</div>
          <p className="day-landing-lead">
            Plan any city day by day. Pick a place, add the sights you want to see,
            and Carta lays them out in a walkable order.
          </p>

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
                  showRoute={false}
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
                <div className="trip-people day-days-stepper">
                  <button type="button" onClick={() => setNewDays((n) => Math.max(1, n - 1))} disabled={newDays <= 1} aria-label="Fewer days">-</button>
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
                      {sp.label || destinations[sp.stops?.[0]?.destinationId]?.city || 'Day plan'}
                      <small className="day-saved-sub">
                        {', '}{fmtDate(sp.startDate)}
                        {(sp.stops?.reduce((n, s) => n + (s.days || 1), 0) || 1) > 1
                          ? `, ${sp.stops.reduce((n, s) => n + (s.days || 1), 0)} days`
                          : ''}
                        {(sp.stops?.length || 1) > 1 ? `, ${sp.stops.length} cities` : ''}
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
                <p className="trip-note">No saved trips yet. Build and save one in Trip planner to plan its stops here.</p>
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
      {showShape && stop && (
        <ShapeDayWizard
          city={stop.dest?.city || 'this city'}
          numDays={days.length}
          items={activities.items}
          initial={prefs}
          onSkip={() => setShowShape(false)}
          onDraft={applyDraft}
        />
      )}
      <TripMap
        stops={mapPins}
        padBottom={420}
        routeGeometry={routeOk ? route.geometry : null}
        focus={stop?.dest?.lat != null ? { lat: stop.dest.lat, lon: stop.dest.lon, zoom: 11.5 } : null}
      />

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
              <div className="trip-block-title">City</div>
              <div className="day-chip-row">
                {stops.map((s, i) => (
                  <span key={i} className={`day-chip day-city-chip ${i === stopIdx ? 'active' : ''}`}>
                    <button
                      className="day-city-chip-main"
                      onClick={() => { setStopIdx(i); setDayIdx(0); }}
                    >
                      {s.dest?.city || 'Unknown'}
                    </button>
                    {plan.standalone && stops.length > 1 && (
                      <button
                        className="day-city-chip-del"
                        onClick={() => removeStandaloneCity(i)}
                        aria-label={`Remove ${s.dest?.city || 'city'}`}
                        title="Remove this city"
                      >×</button>
                    )}
                  </span>
                ))}
              </div>
              <p className="trip-note">Each city has its own days and its own picks below.</p>
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
                <button className="day-chip day-chip-shape" onClick={() => setShowShape(true)} title="Let Carta guide your picks for this city">
                  <SparkIcon size={11} /> Shape my day
                </button>
              </div>
            </div>
          )}

          {stop && (
            <div className="trip-block">
              <div className="trip-block-title">
                Today's plan{assignedItems.length > 0 ? ` (${assignedItems.length})` : ''}
              </div>
              {assignedItems.length === 0 ? (
                <p className="trip-note">Tap a place below to add it to this day. Carta keeps the walking order optimal as you add.</p>
              ) : (
                <>
                  <div className="day-route-mode">
                    <span className={`day-route-status ${routeMode}`}>
                      {routeMode === 'auto'
                        ? <><SparkIcon size={11} /> Carta picks the best walking route</>
                        : 'Manual order'}
                    </span>
                    {routeMode === 'manual' && (
                      <button className="day-route-optimize" onClick={optimizeNow}>
                        <SparkIcon size={11} /> Let Carta reorder
                      </button>
                    )}
                  </div>

                  <div className="day-timeline">
                    {assignedItems.map((it, i) => (
                      <React.Fragment key={`${dayAssignedIdx[i]}`}>
                        <div className="day-timeline-row">
                          <div className="day-timeline-num">{i + 1}</div>
                          <div className="day-assigned-row">
                            {it.img && <span className="day-thumb" style={{ backgroundImage: `url(${it.img})` }} />}
                            <div className="day-assigned-body">
                              <span className="day-assigned-name">{it.name}</span>
                              <span className="day-assigned-kind">{it.kind}</span>
                            </div>
                            <div className="day-timeline-tools">
                              <button className="trip-stop-move" onClick={() => moveAssigned(i, -1)} disabled={i === 0} aria-label="Move earlier" title="Move earlier">↑</button>
                              <button className="trip-stop-move" onClick={() => moveAssigned(i, 1)} disabled={i === assignedItems.length - 1} aria-label="Move later" title="Move later">↓</button>
                              <button className="trip-stop-remove" onClick={() => toggleActivity(dayAssignedIdx[i])} aria-label="Remove" title="Remove">×</button>
                            </div>
                          </div>
                        </div>
                        {i < assignedItems.length - 1 && (() => {
                          const leg = walkLeg(i);
                          return (
                            <div className="day-timeline-walk">
                              {leg
                                ? `↓ ${leg.real ? '' : '≈'}${leg.min} min walk, ${leg.km.toFixed(1)} km`
                                : '↓ walking time unknown (no coordinates for one of these stops)'}
                            </div>
                          );
                        })()}
                      </React.Fragment>
                    ))}
                  </div>
                  {legsAlign && routeOk && (
                    <p className="day-route-total">
                      Full route: {route.km.toFixed(1)} km, about {route.min} min of walking (OpenStreetMap street routing).
                    </p>
                  )}

                  <div className="day-actions-row">
                    {gmapsUrl && (
                      <a className="day-action-btn day-action-primary" href={gmapsUrl} target="_blank" rel="noreferrer">
                        <MapPinIcon size={14} /> Open in Google Maps
                      </a>
                    )}
                    <button className="day-action-btn" onClick={shareDay}>
                      <ShareIcon size={14} /> {shareState === 'copied' ? 'Copied!' : 'Share this day'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Multi-city: extend this day trip with another city. */}
          {plan.standalone && (
            <div className="trip-block">
              <div className="trip-block-title">Add another city</div>
              <div className="trip-add-row">
                <Dropdown
                  value={addCityId}
                  onChange={setAddCityId}
                  options={allCityOptions}
                  placeholder="Search a city"
                  searchPlaceholder="Search"
                />
                <button className="trip-add-btn" onClick={addStandaloneCity} disabled={!addCityId}>Add</button>
              </div>
              <p className="trip-note">Turns this into a multi-city day trip: each city gets its own days and picks.</p>
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
                <p className="trip-note">Limited data for this destination, names only, no map pins.</p>
              )}
              {activities.items.length === 0 ? (
                <p className="trip-note">No activities catalogued for this destination yet.</p>
              ) : (
                <>
                  {tiers.must.length > 0 && (
                    <ActivitySection
                      title="Must see"
                      badge={<StarIcon size={11} />}
                      entries={tiers.must}
                      variant="must"
                      defaultOpen
                      assignedIdx={dayAssignedIdx}
                      onToggle={toggleActivity}
                    />
                  )}
                  {tiers.worth.length > 0 && (
                    <ActivitySection
                      title="Recommended"
                      entries={tiers.worth}
                      assignedIdx={dayAssignedIdx}
                      onToggle={toggleActivity}
                    />
                  )}
                  {tiers.active.length > 0 && (
                    <ActivitySection
                      title="Active & outdoors"
                      badge={<MountainIcon size={11} />}
                      entries={tiers.active}
                      variant="act"
                      assignedIdx={dayAssignedIdx}
                      onToggle={toggleActivity}
                    />
                  )}
                  {tiers.more.length > 0 && (
                    <ActivitySection
                      title="More places"
                      entries={tiers.more}
                      assignedIdx={dayAssignedIdx}
                      onToggle={toggleActivity}
                    />
                  )}
                </>
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

/** One gradation tier of the "Things to do" list: a collapsible header plus
 *  its rows. `entries` is [{ item, idx }] with idx = the item's ORIGINAL index
 *  in activities.items (what assignments and toggleActivity speak). */
function ActivitySection({ title, badge, entries, variant = '', defaultOpen = false, assignedIdx, onToggle }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`day-tier day-tier-${variant} ${open ? 'open' : ''}`}>
      <button className="day-tier-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        {badge && <span className="day-tier-badge">{badge}</span>}
        {title}
        <span className="day-tier-count">{entries.length}</span>
        <span className="day-tier-caret">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="day-activity-list">
          {entries.map(({ item, idx }) => (
            <ActivityRow
              key={idx}
              item={item}
              variant={variant}
              added={assignedIdx.includes(idx)}
              onToggle={() => onToggle(idx)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** A pickable place: thumbnail, name + kind, must-see star when it earns one,
 *  and an ⓘ that expands what-it-is details (description + Wikipedia link)
 *  without toggling the pick. */
function ActivityRow({ item, variant, added, onToggle }) {
  const [infoOpen, setInfoOpen] = useState(false);
  return (
    <div className={`day-activity-row day-activity-rich ${variant} ${added ? 'added' : ''}`}>
      <button className="day-activity-main" onClick={onToggle}>
        {item.img
          ? <span className="day-thumb" style={{ backgroundImage: `url(${item.img})` }} />
          : <span className="day-thumb day-thumb-empty" aria-hidden="true">{(item.kind || '·').slice(0, 1)}</span>}
        <span className="day-assigned-body">
          <span className="day-assigned-name">
            {item.name}
            {(item.rate ?? 0) >= 3 && <span className="day-badge-must" title="A true must-see here"><StarIcon size={9} /></span>}
            {item.heritage && <span className="day-badge-heritage" title="On a cultural-heritage register">heritage</span>}
          </span>
          <span className="day-assigned-kind">{item.kind}</span>
        </span>
        <span className="day-activity-add">{added ? '✓' : '+'}</span>
      </button>
      <button
        className={`day-activity-info ${infoOpen ? 'open' : ''}`}
        onClick={() => setInfoOpen(!infoOpen)}
        aria-expanded={infoOpen}
        title={`What is ${item.name}?`}
      ><InfoIcon size={14} /></button>
      {infoOpen && (
        <div className="day-activity-detail">
          <p>
            {item.desc || `${item.kind || 'Place'} in this city.`}
            {(item.rate ?? 0) >= 3 ? ' One of the city\'s true must-sees.' : ''}
          </p>
          {item.wiki && (
            <a href={item.wiki} target="_blank" rel="noreferrer">Read more on Wikipedia ↗</a>
          )}
        </div>
      )}
    </div>
  );
}
