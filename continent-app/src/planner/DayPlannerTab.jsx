import React, { useEffect, useMemo, useState } from 'react';
import { TripMap } from '../map/TripMap.jsx';
import { Dropdown } from '../components/Dropdown.jsx';
import { DateField } from '../components/DateField.jsx';
import { tripDaysBetween, haversineKm, cityCoords, withCityCoords } from '../lib/runtime_pricing.js';
import { legTransportOptions } from '../lib/transport.js';
import { eur } from '../lib/format.js';
import { fetchActivitiesFull } from '../lib/appData.js';
import { fetchTripPlans, fetchTripPlanWithStops } from '../auth/tripPlanStorage.js';
import { fetchWalkingRoute, googleMapsDirUrl } from '../lib/routing.js';
import { geocodeAddress } from '../lib/geocode.js';
import { CountryIntel } from '../components/CountryIntel.jsx';
import { useCountryInsights } from '../hooks/useCountryInsights.js';
import { addDays, todayISO, fmtDate as fmtDateFull } from '../lib/dates.js';
import {
  draftDays, tieredActivities, optimizeOrder, clusterIntoDays,
  saneItemsForCity, feasibilityLimits, isMustSee,
} from './dayDraft.js';
import { ShapeDayWizard } from './ShapeDayWizard.jsx';
import {
  loadStandalonePlans, persistStandalonePlans, deleteStandalonePlan,
  loadAssignments, persistAssignments, loadPrefs, persistPrefs,
  TRIP_DRAFT_PLAN_ID,
} from './dayPlanStore.js';
import { loadTripDraft } from './tripDraftStore.js';
import {
  SparkIcon, StarIcon, InfoIcon, MountainIcon, ShareIcon, MapPinIcon,
  TrainIcon, BusIcon, CarIcon, BedIcon, BookmarkIcon, DownloadIcon,
} from '../components/Icons.jsx';

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
  return {
    id: sp.id,
    label: sp.label || '',
    standalone: true,
    stayCityId: sp.stayCityId || '',
    stayPoint: sp.stayPoint || null, // { label, shortLabel, lat, lon } from the address search
    stops,
  };
}

const MODE_META = {
  train: { Icon: TrainIcon, label: 'Train' },
  bus: { Icon: BusIcon, label: 'Bus' },
  car: { Icon: CarIcon, label: 'Car' },
};

/**
 * "How do you get there for the day?" - the most efficient way from the
 * traveller's base (their stay city) to the day-trip destination, using the
 * same per-leg transport engine the Trip planner prices with: train / bus /
 * car, honest distance-based estimates, national-operator booking links, and
 * a day-return framing (costs shown both ways).
 */
function DayTripTransport({ fromDest, toDest, carModel, countryInsights }) {
  const [open, setOpen] = useState(false);
  if (!fromDest || !toDest) return null;
  // Staying in - or right next to - the day-trip city itself: there's no
  // inter-city hop to recommend, but say so plainly rather than showing
  // nothing (a blank space reads as "the feature is broken").
  const kmAway = haversineKm(fromDest.lat, fromDest.lon, toDest.lat, toDest.lon);
  if (fromDest.city === toDest.city || (kmAway != null && kmAway < 8)) {
    return (
      <div className="trip-block daytrip-transport">
        <div className="trip-block-title">Getting to {toDest.city}</div>
        <p className="trip-note daytrip-here">
          <SparkIcon size={11} /> You're staying right by {toDest.city} - no
          inter-city travel needed. Start your day on foot or hop on local
          transit; Carta lays your stops out in a walkable order below.
        </p>
      </div>
    );
  }
  const opts = legTransportOptions(fromDest, toDest, 1, { carModel, countryInsights });
  if (!opts) return null;
  if (opts.no_road) {
    return (
      <div className="trip-block">
        <div className="trip-block-title">Getting there from {fromDest.city}</div>
        <p className="trip-note">{opts.note || 'No overland route. Look at ferries or a flight.'}</p>
      </div>
    );
  }
  const rec = opts.modes[opts.recommended];
  const RecIcon = MODE_META[opts.recommended].Icon;
  // A day trip only works if you can be there by mid-morning and back for
  // dinner: flag long rides and suggest when to set off.
  const oneWayH = rec.hours;
  const feasible = oneWayH <= 3;
  const departHint = oneWayH <= 1 ? 'an easy start around 9:00'
    : oneWayH <= 2 ? 'set off by 8:30 to get a full day'
    : oneWayH <= 3 ? 'leave by 8:00, it\'s a long ride but doable'
    : 'honestly too far for a day trip, consider staying overnight';

  return (
    <div className="trip-block daytrip-transport">
      <div className="trip-block-title">Getting there from {fromDest.city}</div>
      <div className="daytrip-reco">
        <span className="daytrip-reco-icon"><RecIcon size={15} /></span>
        <span className="daytrip-reco-main">
          <b><SparkIcon size={10} /> {MODE_META[opts.recommended].label} is your best bet</b>
          <small>
            ~{opts.road_km} km, about {rec.hours}h each way, est. {eur(rec.eur_pp)}/person one way
            ({eur(rec.eur_pp * 2)} day return)
          </small>
          <small className={feasible ? 'daytrip-hint' : 'daytrip-hint warn'}>{departHint}</small>
        </span>
        <button className="daytrip-more" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Less' : 'Compare'}
        </button>
      </div>
      {open && (
        <>
          <div className="trip-leg-modes daytrip-modes">
            {Object.entries(opts.modes).map(([m, o]) => (
              <div key={m} className={`trip-leg-mode ${opts.recommended === m ? 'on' : ''}`}>
                <span>{React.createElement(MODE_META[m].Icon, { size: 12 })} {MODE_META[m].label}</span>
                <b>{eur(o.eur_pp)}{m === 'car' ? '/car' : '/p'}</b>
                <small>~{o.hours}h each way</small>
              </div>
            ))}
          </div>
          <div className="trip-leg-links">
            {rec.links.map((l, j) => (
              <a key={j} href={l.url} target="_blank" rel="noreferrer">{l.label} ↗</a>
            ))}
          </div>
          {rec.note && <p className="trip-leg-note">{rec.note}</p>}
          <p className="trip-leg-disclaimer">Estimates, not live fares. Check the links for real times &amp; prices.</p>
        </>
      )}
    </div>
  );
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
  // Builder inputs for a new standalone plan: any number of cities from all of
  // Europe (no country filter), days per city, a start date, and optionally
  // the address where the traveller is staying.
  const [newStops, setNewStops] = useState([]); // [{ destinationId, days }]
  const [newCountry, setNewCountry] = useState(''); // country chosen before its cities
  const [newStartDate, setNewStartDate] = useState(() => todayISO());
  const [stayQuery, setStayQuery] = useState('');
  const [stayResults, setStayResults] = useState(null); // null = not searched
  const [staySearching, setStaySearching] = useState(false);
  const [newStayPoint, setNewStayPoint] = useState(null);
  // "Add another city" picker inside an open standalone plan.
  const [addCityId, setAddCityId] = useState('');
  // "Save this day trip to Saved trips" feedback for trip-based plans.
  const [daySaveState, setDaySaveState] = useState('idle');

  const searchStay = async () => {
    if (staySearching || stayQuery.trim().length < 3) return;
    setStaySearching(true);
    const results = await geocodeAddress(stayQuery);
    setStayResults(results);
    setStaySearching(false);
  };

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
    setDaySaveState('idle');
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

  // The Trip planner's UNSAVED draft, opened as a plannable trip: same shape a
  // saved plan has, with dates chained from the draft's start date. Picks made
  // here persist under TRIP_DRAFT_PLAN_ID and move with the trip when saved.
  const openTripDraft = (draft) => {
    let cursor = draft.tripStart || todayISO();
    const stops = (draft.stops || []).map((st) => {
      const nights = Math.max(1, st.nights || 1);
      const arrive = cursor;
      cursor = addDays(cursor, nights);
      return { destination_id: st.destinationId, arrive_date: arrive, depart_date: cursor };
    });
    setPlan({ id: TRIP_DRAFT_PLAN_ID, label: draft.planLabel || 'Your trip', tripDraft: true, stops });
    bootPlan(TRIP_DRAFT_PLAN_ID);
  };

  // Deep-link into the planner: a plain id opens a saved day plan from the
  // Saved-trips overview; an object is the Trip planner's "plan this day"
  // handoff ({ planId|null, stopIndex, dayIndex }) - null planId means the
  // still-unsaved draft.
  useEffect(() => {
    if (!openPlanId) return;
    (async () => {
      if (typeof openPlanId === 'object') {
        const { planId: targetPlanId, stopIndex, dayIndex } = openPlanId;
        let opened = false;
        if (targetPlanId) {
          try { await openPlan(targetPlanId); opened = true; } catch { /* plan gone */ }
        } else {
          const draft = loadTripDraft();
          if (draft) { openTripDraft(draft); opened = true; }
        }
        if (opened) {
          if (stopIndex != null) setStopIdx(Math.max(0, stopIndex));
          if (dayIndex != null) setDayIdx(Math.max(0, dayIndex));
        }
      } else {
        const sp = standalonePlans.find((x) => x.id === openPlanId);
        if (sp) openStandalone(sp);
        else { try { await openPlan(openPlanId); } catch { /* not found */ } }
      }
      onOpenPlanConsumed && onOpenPlanConsumed();
    })();
  }, [openPlanId]); // eslint-disable-line react-hooks/exhaustive-deps

  const addLandingCity = (id) => {
    if (!id || newStops.some((s) => s.destinationId === id)) return;
    setNewStops((prev) => [...prev, { destinationId: id, days: 1 }]);
  };
  const setLandingDays = (id, days) => {
    setNewStops((prev) => prev.map((s) => (
      s.destinationId === id ? { ...s, days: Math.max(1, Math.min(30, days)) } : s
    )));
  };
  const removeLandingCity = (id) => {
    setNewStops((prev) => prev.filter((s) => s.destinationId !== id));
  };

  const startStandalone = () => {
    if (!newStops.length) return;
    const sp = {
      id: `local:${Date.now()}`,
      label: newStops.map((s) => destinations[s.destinationId]?.city).filter(Boolean).join(' + ') || 'Day plan',
      startDate: newStartDate || todayISO(),
      stayPoint: newStayPoint,
      stops: newStops.map((s) => ({ ...s })),
    };
    const next = [sp, ...standalonePlans];
    setStandalonePlans(next);
    persistStandalonePlans(next);
    setNewStops([]);
    setNewCountry('');
    setStayQuery('');
    setStayResults(null);
    setNewStayPoint(null);
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
    // Drop harvested POIs that are unrealistically far from the city itself
    // (e.g. across a strait): they can only produce impossible walking days.
    if (full && full.length) return { items: saneItemsForCity(full, s.dest), limited: false };
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
    // The feasibility answers (how long out, how much walking) bound every
    // draft so nothing unrealistic gets scheduled.
    const limits = feasibilityLimits(p);
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
          ...limits,
        });
        next[si] = {};
        lists.forEach((lst, di) => { if (lst.length) next[si][di] = lst; });
      });
    }
    setAssignments(next);
    persistAssignments(plan?.id, next);
    const savedPrefs = { style: p.style, interests: p.interests, dayLen: p.dayLen, walk: p.walk, routeMode };
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

  // Snapshot a trip-based day plan (saved trip / trip draft) into the local
  // day-plan store, so it shows up under Saved trips like any standalone plan.
  const saveToSavedTrips = () => {
    if (!plan || plan.standalone || daySaveState === 'saved') return;
    const newId = `local:${Date.now()}`;
    const sp = {
      id: newId,
      label: plan.label || stops.map((s) => s.dest?.city).filter(Boolean).join(' + ') || 'Day plan',
      startDate: stops[0]?.arrive_date || todayISO(),
      stayCityId: plan.stayCityId || '',
      stayPoint: plan.stayPoint || null,
      stops: stops.map((s) => ({ destinationId: s.destination_id, days: s.nights })),
    };
    const next = [sp, ...loadStandalonePlans()];
    setStandalonePlans(next);
    persistStandalonePlans(next);
    persistAssignments(newId, assignments);
    if (prefs) persistPrefs(newId, prefs);
    setDaySaveState('saved');
  };

  // A clean, printable booklet of every planned day across the whole trip.
  // Opens the browser's print dialog, where "Save as PDF" produces the
  // shareable file - no libraries, no external services, and it wears the
  // app's own palette (warm paper, deep ink, one rust accent). Every place
  // gets an explanation, and each place + each day carries a Google Maps link.
  const downloadPdf = () => {
    if (!stop) return;
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));

    // Every place earns an explanation. Prefer the harvested Wikipedia summary;
    // otherwise compose an honest one-liner from what we do know (kind, whether
    // it's heritage-listed). A short accolade adds the "why go" for the best.
    const blurb = (it, city) => {
      const d = (it.desc || '').trim();
      if (d) return /[.!?]$/.test(d) ? d : `${d}.`;
      const kind = (it.kind || 'place').toLowerCase();
      const article = /^[aeiou]/.test(kind) ? 'An' : 'A';
      let s = `${article} ${kind} in ${city}`;
      if (it.heritage) s += ', on the cultural-heritage register';
      return `${s}.`;
    };
    const accolade = (it) => {
      if (isMustSee(it)) return "One of the city's essential sights.";
      if ((it.rate ?? 0) >= 2) return 'A well-loved stop, worth the time.';
      if (it.active) return 'A good pick for an active, outdoors stretch.';
      return '';
    };
    const placeUrl = (it) => (it.lat != null && it.lon != null)
      ? `https://www.google.com/maps/search/?api=1&query=${it.lat},${it.lon}` : null;

    // Walk everything so a multi-city plan prints as one complete booklet.
    let totalPlaces = 0;
    let plannedDays = 0;
    const cityBlocks = stops.map((s, si) => {
      const { items } = itemsForStop(s);
      const cityName = s.dest?.city || 'This city';
      const cityDays = Array.from({ length: s.nights }, (_, i) => addDays(s.arrive_date, i));
      const daySections = cityDays.map((date, di) => {
        const dayItems = (assignments[si]?.[di] || []).map((i) => items[i]).filter(Boolean);
        if (!dayItems.length) return '';
        plannedDays += 1;
        totalPlaces += dayItems.length;
        const pins = dayItems.filter((it) => it.lat != null && it.lon != null)
          .map((it) => ({ lat: it.lat, lon: it.lon }));
        const gurl = googleMapsDirUrl(pins, 'walking');
        // Straight-line walking estimate for the whole day (consistent offline).
        let dayKm = 0;
        for (let i = 0; i < dayItems.length - 1; i += 1) {
          const a = dayItems[i]; const b = dayItems[i + 1];
          if (a.lat != null && a.lon != null && b.lat != null && b.lon != null) {
            const km = haversineKm(a.lat, a.lon, b.lat, b.lon);
            if (km != null) dayKm += km;
          }
        }
        const meta = [
          `${dayItems.length} ${dayItems.length === 1 ? 'stop' : 'stops'}`,
          dayKm > 0.05 ? `~${dayKm.toFixed(1)} km · ~${estimateWalkMinutes(dayKm)} min on foot` : '',
        ].filter(Boolean).join(' &middot; ');

        const rows = dayItems.map((it, i) => {
          const next = dayItems[i + 1];
          let walk = '';
          if (next && it.lat != null && it.lon != null && next.lat != null && next.lon != null) {
            const km = haversineKm(it.lat, it.lon, next.lat, next.lon);
            if (km != null) walk = `<div class="walk">&darr;&ensp;~${estimateWalkMinutes(km)} min walk &middot; ${km.toFixed(1)} km</div>`;
          }
          const acc = accolade(it);
          const purl = placeUrl(it);
          const links = [
            purl ? `<a href="${purl}">Open in Maps</a>` : '',
            it.wiki ? `<a href="${esc(it.wiki)}">Read more</a>` : '',
          ].filter(Boolean).join('');
          return `<li class="stop">
            <div class="stop-row">
              <span class="num">${i + 1}</span>
              <div class="stop-body">
                <div class="stop-head">
                  <span class="stop-name">${esc(it.name)}</span>
                  ${it.kind ? `<span class="tag">${esc(it.kind)}</span>` : ''}
                  ${isMustSee(it) ? '<span class="chip must">Must see</span>' : ''}
                  ${it.heritage ? '<span class="chip heritage">Heritage</span>' : ''}
                </div>
                <p class="blurb">${esc(blurb(it, cityName))}${acc ? ` <span class="accolade">${esc(acc)}</span>` : ''}</p>
                ${links ? `<div class="stop-links">${links}</div>` : ''}
              </div>
            </div>
            ${walk}
          </li>`;
        }).join('');

        return `<section class="day">
          <div class="day-head">
            <div class="day-title">Day ${di + 1}<span class="date">${esc(fmtDateFull(date, true))}</span></div>
            <div class="day-meta">${meta}</div>
          </div>
          <ol>${rows}</ol>
          ${gurl ? `<div class="day-route"><a href="${gurl}">Open the whole day in Google Maps &rarr;</a></div>` : ''}
        </section>`;
      }).filter(Boolean).join('');
      if (!daySections) return '';
      const multi = stops.length > 1;
      return multi
        ? `<div class="city"><h2 class="city-head">${esc(cityName)}<span>${esc(s.dest?.country || '')}</span></h2>${daySections}</div>`
        : daySections;
    }).filter(Boolean).join('');
    if (!totalPlaces) return;

    const title = plan.label || stop.dest?.city || 'Your day plan';
    const citiesWithPlans = stops.filter((s, si) => {
      const { items } = itemsForStop(s);
      return Array.from({ length: s.nights }).some((_, di) => (
        (assignments[si]?.[di] || []).some((i) => items[i])
      ));
    }).length;
    const subParts = [
      days[0] ? `From ${esc(fmtDateFull(stops[0]?.arrive_date || days[0], true))}` : '',
      `${plannedDays} planned ${plannedDays === 1 ? 'day' : 'days'}`,
      `${totalPlaces} ${totalPlaces === 1 ? 'place' : 'places'}`,
      citiesWithPlans > 1 ? `${citiesWithPlans} cities` : '',
    ].filter(Boolean).join(' &middot; ');

    const html = `<!doctype html><html><head><meta charset="utf-8">
      <title>${esc(title)} &middot; day plan</title>
      <style>
        :root {
          --paper:#f5f1e8; --paper-dim:#ebe6d8; --ink:#1a1a1a; --ink-soft:#4a4a48;
          --ink-mute:#8a8780; --rule:#c4bea9; --accent:#c8501e; --accent-bg:#f3d9c8;
          --display:'Fraunces','Iowan Old Style',Georgia,'Times New Roman',serif;
          --ui:'Inter Tight',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
        }
        * { box-sizing:border-box; margin:0; padding:0; }
        html { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        body { font-family:var(--ui); color:var(--ink); background:var(--paper); padding:48px 54px; line-height:1.5; }
        a { color:inherit; }

        .cover { border-bottom:2px solid var(--ink); padding-bottom:20px; }
        .kicker { font-size:11px; letter-spacing:.26em; text-transform:uppercase; color:var(--accent); font-weight:600; }
        h1 { font-family:var(--display); font-size:38px; font-weight:600; line-height:1.05; letter-spacing:-.01em; margin-top:11px; }
        .cover-sub { font-size:12.5px; color:var(--ink-soft); margin-top:11px; }
        .cover-note { font-size:11px; color:var(--ink-mute); margin-top:14px; max-width:560px; line-height:1.55; }

        .city-head { font-family:var(--display); font-size:25px; font-weight:600; margin:40px 0 2px; }
        .city-head span { font-family:var(--ui); font-size:11px; font-weight:500; text-transform:uppercase; letter-spacing:.14em; color:var(--ink-mute); margin-left:12px; vertical-align:middle; }

        .day { margin-top:28px; page-break-inside:auto; }
        .day-head { display:flex; align-items:baseline; justify-content:space-between; gap:14px; border-bottom:1.5px solid var(--rule); padding-bottom:8px; margin-bottom:6px; }
        .day-title { font-family:var(--display); font-size:19px; font-weight:600; }
        .day-title .date { font-family:var(--ui); font-size:11.5px; font-weight:400; color:var(--ink-mute); margin-left:12px; letter-spacing:.02em; }
        .day-meta { font-size:10px; color:var(--ink-mute); text-transform:uppercase; letter-spacing:.09em; white-space:nowrap; }

        ol { list-style:none; }
        li.stop { padding:11px 0; break-inside:avoid; border-bottom:1px solid rgba(196,190,169,.45); }
        li.stop:last-child { border-bottom:none; }
        .stop-row { display:flex; gap:14px; }
        .num { flex:none; width:26px; height:26px; border-radius:50%; background:var(--ink); color:var(--paper); font-family:var(--ui); font-size:12px; font-weight:600; display:flex; align-items:center; justify-content:center; margin-top:1px; }
        .stop-body { flex:1; min-width:0; }
        .stop-head { display:flex; align-items:baseline; flex-wrap:wrap; gap:2px 0; }
        .stop-name { font-family:var(--display); font-size:15.5px; font-weight:600; }
        .tag { font-size:9px; text-transform:uppercase; letter-spacing:.12em; color:var(--ink-mute); margin-left:9px; }
        .chip { font-size:8.5px; font-weight:600; text-transform:uppercase; letter-spacing:.08em; padding:2px 7px; border-radius:3px; margin-left:7px; }
        .chip.must { background:var(--accent-bg); color:var(--accent); }
        .chip.heritage { background:var(--paper-dim); color:var(--ink-soft); border:1px solid var(--rule); }
        .blurb { font-size:11.5px; color:var(--ink-soft); line-height:1.55; margin-top:4px; max-width:580px; }
        .accolade { color:var(--accent); }
        .stop-links { margin-top:6px; font-size:10.5px; }
        .stop-links a { color:var(--accent); text-decoration:none; font-weight:500; margin-right:16px; }
        .walk { font-size:10px; color:var(--ink-mute); padding:6px 0 1px 40px; letter-spacing:.02em; }

        .day-route { margin-top:13px; }
        .day-route a { display:inline-block; font-family:var(--ui); font-size:11px; font-weight:600; color:var(--paper); background:var(--accent); padding:8px 15px; border-radius:6px; text-decoration:none; letter-spacing:.02em; }

        footer { margin-top:44px; padding-top:12px; border-top:1px solid var(--rule); font-size:10px; color:var(--ink-mute); display:flex; justify-content:space-between; gap:12px; }

        @page { margin:15mm; }
        @media print { body { padding:0; background:var(--paper); } .day-route a { border:1px solid var(--accent); } }
      </style></head><body>
      <header class="cover">
        <div class="kicker">Carta &middot; Europe Travel</div>
        <h1>${esc(title)}</h1>
        <div class="cover-sub">${subParts}</div>
        <p class="cover-note">Your day-by-day plan, in walking order. Every place has a short note on what it is, a link to open it in Google Maps, and each day closes with a link to the whole route. Walking times are straight-line estimates.</p>
      </header>
      ${cityBlocks}
      <footer><span>Planned with Carta &middot; Europe Travel</span><span>carta.travel</span></footer>
      </body></html>`;

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    const fire = () => { try { w.focus(); w.print(); } catch { /* window closed */ } };
    // Wait for fonts to settle so headings print in the right face; fall back
    // on a timeout if the fonts API isn't available or is slow.
    if (w.document.fonts && w.document.fonts.ready) {
      let done = false;
      w.document.fonts.ready.then(() => { if (!done) { done = true; fire(); } });
      setTimeout(() => { if (!done) { done = true; fire(); } }, 700);
    } else {
      setTimeout(fire, 400);
    }
  };

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

  // Every destination in one searchable list (the whole of Europe, big cities
  // and small gems alike) - used by the landing multi-city picker and the
  // in-plan "add another city" picker.
  const allCityOptions = useMemo(() => Object.entries(destinations)
    .map(([id, d]) => ({ value: id, label: `${d.city}, ${d.country}` }))
    .sort((a, b) => a.label.localeCompare(b.label)), [destinations]);

  // The landing picker chooses a country first, then a city within it. Every
  // distinct country in the dataset, then the towns that belong to the one
  // currently selected (minus any already added), labelled by city alone since
  // the country is already known.
  const countryOptions = useMemo(() => Array.from(
    new Set(Object.values(destinations).map((d) => d.country).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b)).map((c) => ({ value: c, label: c })), [destinations]);

  const cityOptionsForCountry = useMemo(() => Object.entries(destinations)
    .filter(([id, d]) => d.country === newCountry && !newStops.some((s) => s.destinationId === id))
    .map(([id, d]) => ({ value: id, label: d.city }))
    .sort((a, b) => a.label.localeCompare(b.label)), [destinations, newCountry, newStops]);

  // Map preview of the cities picked on the landing screen - pinned at the
  // city centre (not the airport) so a picked "Stockholm" doesn't drop 90 km
  // out at Skavsta.
  const landingCities = newStops
    .map((s) => destinations[s.destinationId])
    .filter((d) => d && d.lat != null)
    .map((d) => ({ ...cityCoords(d), city: d.city }));

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
            <div className="trip-block-title">Plan your days</div>

            {/* 1. Where are you staying - comes first because it anchors every
                  route: once Carta knows your door, it works out the smartest
                  way to reach each place you plan below. Free-text, geocoded. */}
            <label className="trip-field day-build-field">
              <span className="trip-field-label">Where are you staying?</span>
              {newStayPoint ? (
                <div className="day-stay-chosen">
                  <span className="day-stay-chosen-label">{newStayPoint.shortLabel || newStayPoint.label}</span>
                  <button className="trip-stop-remove" onClick={() => { setNewStayPoint(null); setStayResults(null); }} aria-label="Clear address" title="Clear">×</button>
                </div>
              ) : (
                <div className="day-stay-search">
                  <input
                    className="day-stay-input"
                    type="text"
                    value={stayQuery}
                    onChange={(e) => setStayQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') searchStay(); }}
                    placeholder="Street, hotel or apartment address"
                    aria-label="Address of your stay"
                  />
                  <button className="trip-add-btn" onClick={searchStay} disabled={staySearching || stayQuery.trim().length < 3}>
                    {staySearching ? '…' : 'Find'}
                  </button>
                </div>
              )}
            </label>
            {!newStayPoint && stayResults && (
              stayResults.length ? (
                <div className="day-stay-results">
                  {stayResults.map((r, i) => (
                    <button key={i} className="day-stay-result" onClick={() => setNewStayPoint(r)}>
                      {r.label}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="trip-note">No match for that address. Try adding the city name.</p>
              )
            )}
            {!newStayPoint && (
              <p className="trip-note day-build-hint">
                Tell Carta where you sleep and it recommends the smartest, most
                efficient way to reach each place you plan below - it's optional,
                but it's what makes getting there effortless.
              </p>
            )}

            {/* 2. Which cities - pick a country first, then a city within it.
                  Any number of cities, anywhere in Europe. */}
            <div className="day-build-row day-build-place-row">
              <label className="trip-field">
                <span className="trip-field-label">Country</span>
                <Dropdown
                  value={newCountry}
                  onChange={(c) => setNewCountry(c)}
                  options={countryOptions}
                  placeholder="Pick a country"
                  searchPlaceholder="Search countries"
                />
              </label>
              <label className="trip-field">
                <span className="trip-field-label">City</span>
                <Dropdown
                  value=""
                  onChange={addLandingCity}
                  options={cityOptionsForCountry}
                  placeholder={newCountry ? 'Pick a city' : 'Choose a country first'}
                  searchPlaceholder="Search cities"
                  disabled={!newCountry}
                />
              </label>
            </div>

            {newStops.length > 0 && (
              <div className="day-build-cities">
                {newStops.map((s) => {
                  const d = destinations[s.destinationId];
                  return (
                    <div className="day-build-city" key={s.destinationId}>
                      <span className="day-build-city-name">
                        {d?.city || 'Unknown'}
                        <small>{d?.country}</small>
                      </span>
                      <div className="trip-people day-days-stepper">
                        <button type="button" onClick={() => setLandingDays(s.destinationId, s.days - 1)} disabled={s.days <= 1} aria-label="Fewer days">-</button>
                        <span>{s.days} {s.days === 1 ? 'day' : 'days'}</span>
                        <button type="button" onClick={() => setLandingDays(s.destinationId, s.days + 1)} aria-label="More days">+</button>
                      </div>
                      <button
                        className="trip-stop-remove"
                        onClick={() => removeLandingCity(s.destinationId)}
                        aria-label={`Remove ${d?.city || 'city'}`}
                        title="Remove"
                      >×</button>
                    </div>
                  );
                })}
              </div>
            )}

            {landingCities.length > 0 && (
              <div className="day-build-map">
                <TripMap stops={landingCities} padBottom={12} showRoute={false} />
              </div>
            )}

            {/* 3. When. */}
            <div className="day-build-row">
              <label className="trip-field">
                <span className="trip-field-label">Start date</span>
                <DateField value={newStartDate} onChange={setNewStartDate} placeholder="Start date" />
              </label>
            </div>

            <button className="trip-save-btn day-build-btn" onClick={startStandalone} disabled={newStops.length === 0}>
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
        focus={stop?.dest?.lat != null ? { ...cityCoords(stop.dest), zoom: 11.5 } : null}
      />

      <div className="trip-topcard" onClick={(e) => e.stopPropagation()}>
        <div className="day-topcard-row">
          <div>
            <div className="trip-topcard-name">{plan.label || 'Untitled trip'}</div>
            <div className="trip-topcard-sub">
              {stop?.dest?.city || 'No stops in this trip'}
              {days[dayIdx] ? `, ${fmtDate(days[dayIdx])}` : ''}
            </div>
          </div>
          {/* Always-visible save state: standalone plans (and their picks)
              persist on this device automatically; trip-based plans get an
              explicit one-tap save into Saved trips. */}
          {plan.standalone ? (
            <span className="day-save-btn saved" title="Every change to this day plan is saved on this device automatically">
              ✓ Saved
            </span>
          ) : (
            <button
              className={`day-save-btn ${daySaveState === 'saved' ? 'saved' : ''}`}
              onClick={saveToSavedTrips}
              disabled={daySaveState === 'saved'}
              title="Keep this day plan in your Saved trips"
            >
              <BookmarkIcon size={12} /> {daySaveState === 'saved' ? 'Saved ✓' : 'Save day plan'}
            </button>
          )}
        </div>
      </div>

      <div className="trip-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="trip-sheet-grip" />
        <div className="trip-sheet-scroll">

          {/* Day trips: where is the traveller based? Filling this in unlocks
              the door-to-door "how do you get there" recommendation below. */}
          {plan.standalone && (
            <div className="trip-block daytrip-base">
              <div className="trip-block-title"><BedIcon size={13} /> Where are you staying?</div>
              {plan.stayPoint ? (
                <div className="day-stay-chosen">
                  <span className="day-stay-chosen-label">{plan.stayPoint.shortLabel || plan.stayPoint.label}</span>
                  <button
                    className="trip-stop-remove"
                    onClick={() => patchStandalone((sp) => { sp.stayPoint = null; return sp; })}
                    aria-label="Clear address"
                    title="Clear"
                  >×</button>
                </div>
              ) : (
                <>
                  <div className="day-stay-search">
                    <input
                      className="day-stay-input"
                      type="text"
                      value={stayQuery}
                      onChange={(e) => setStayQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') searchStay(); }}
                      placeholder="Street, hotel or apartment address"
                      aria-label="Address of your stay"
                    />
                    <button className="trip-add-btn" onClick={searchStay} disabled={staySearching || stayQuery.trim().length < 3}>
                      {staySearching ? '…' : 'Find'}
                    </button>
                  </div>
                  {stayResults && (
                    stayResults.length ? (
                      <div className="day-stay-results">
                        {stayResults.map((r, i) => (
                          <button
                            key={i}
                            className="day-stay-result"
                            onClick={() => {
                              patchStandalone((sp) => { sp.stayPoint = r; return sp; });
                              setStayQuery('');
                              setStayResults(null);
                            }}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="trip-note">No match for that address. Try adding the city name.</p>
                    )
                  )}
                  <p className="trip-note">Tell Carta where you sleep and it recommends the smartest way to get to each day-trip city.</p>
                </>
              )}
            </div>
          )}

          {plan.standalone && stop && (() => {
            // Travel advice starts at the stay address when one is set;
            // otherwise the legacy base-city choice still works. Both ends are
            // measured to the CITY centre, never the airport: for airport-tier
            // destinations dest.lat/lon is the runway, so a stay downtown would
            // otherwise read as a needless inter-city hop.
            const fromDest = plan.stayPoint
              ? {
                  city: plan.stayPoint.shortLabel || 'your stay',
                  lat: plan.stayPoint.lat,
                  lon: plan.stayPoint.lon,
                  country: stop.dest?.country,
                }
              : withCityCoords(destinations[plan.stayCityId] || null);
            return (
              <DayTripTransport
                fromDest={fromDest}
                toDest={withCityCoords(stop.dest)}
                carModel={data?.meta?.car_model || null}
                countryInsights={countryInsights}
              />
            );
          })()}

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
              </div>
            </div>
          )}

          {stop && (
            <div className="trip-block">
              <div className="trip-block-title">Add to your trip{stop.dest?.city ? ` in ${stop.dest.city}` : ''}</div>
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
                      assignedIdx={dayAssignedIdx}
                      onToggle={toggleActivity}
                    />
                  )}
                  {tiers.worth.length > 0 && (
                    <ActivitySection
                      title="Recommended"
                      badge={<SparkIcon size={11} />}
                      entries={tiers.worth}
                      variant="worth"
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

          {stop && (
            <div className="trip-block">
              <div className="trip-block-title">
                Today's plan{assignedItems.length > 0 ? ` (${assignedItems.length})` : ''}
              </div>
              {assignedItems.length === 0 ? (
                <>
                  <p className="trip-note">Tap a place below to add it to this day. Carta keeps the walking order optimal as you add.</p>
                  <button className="day-carta-btn" onClick={() => setShowShape(true)}>
                    <SparkIcon size={12} /> Let Carta plan this city for me
                  </button>
                </>
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
                        <AssignedRow
                          item={it}
                          index={i}
                          last={i === assignedItems.length - 1}
                          onMoveUp={() => moveAssigned(i, -1)}
                          onMoveDown={() => moveAssigned(i, 1)}
                          onRemove={() => toggleActivity(dayAssignedIdx[i])}
                        />
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
                      Full route: {route.km.toFixed(1)} km, about {route.min} min of walking.
                    </p>
                  )}

                  <div className="day-actions-row">
                    {gmapsUrl && (
                      <a className="day-action-btn day-action-primary" href={gmapsUrl} target="_blank" rel="noreferrer">
                        <MapPinIcon size={14} /> Open in Google Maps
                      </a>
                    )}
                    <button
                      className="day-action-btn"
                      onClick={saveToSavedTrips}
                      disabled={plan.standalone || daySaveState === 'saved'}
                      title={plan.standalone ? 'Day plans made here are saved automatically' : 'Keep this day plan in your Saved trips'}
                    >
                      <BookmarkIcon size={14} />
                      {plan.standalone || daySaveState === 'saved' ? 'In Saved trips' : 'Save to Saved trips'}
                    </button>
                    <button className="day-action-btn" onClick={downloadPdf} title="A clean, printable PDF of your planned days">
                      <DownloadIcon size={14} /> Download PDF
                    </button>
                    <button className="day-action-btn" onClick={shareDay}>
                      <ShareIcon size={14} /> {shareState === 'copied' ? 'Copied!' : 'Share'}
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

          <div className="trip-block">
            <button className="trip-newtrip-btn" onClick={() => setPlan(null)}>← Back to all day plans</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One stop of today's timeline: photo, name + kind, reorder/remove tools and
 *  an ⓘ toggle so a planned day stays revisitable (what is this place again?)
 *  without leaving the plan. */
function AssignedRow({ item, index, last, onMoveUp, onMoveDown, onRemove }) {
  const [infoOpen, setInfoOpen] = useState(false);
  return (
    <div className="day-timeline-row">
      <div className="day-timeline-num">{index + 1}</div>
      <div className="day-assigned-row day-assigned-with-info">
        {item.img && <span className="day-thumb" style={{ backgroundImage: `url(${item.img})` }} />}
        <div className="day-assigned-body">
          <span className="day-assigned-name">{item.name}</span>
          <span className="day-assigned-kind">{item.kind}</span>
        </div>
        <div className="day-timeline-tools">
          <button
            className={`day-activity-info ${infoOpen ? 'open' : ''}`}
            onClick={() => setInfoOpen(!infoOpen)}
            aria-expanded={infoOpen}
            title={`What is ${item.name}?`}
          ><InfoIcon size={13} /></button>
          <button className="trip-stop-move" onClick={onMoveUp} disabled={index === 0} aria-label="Move earlier" title="Move earlier">↑</button>
          <button className="trip-stop-move" onClick={onMoveDown} disabled={last} aria-label="Move later" title="Move later">↓</button>
          <button className="trip-stop-remove" onClick={onRemove} aria-label="Remove" title="Remove">×</button>
        </div>
        {infoOpen && (
          <div className="day-activity-detail day-timeline-detail">
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
            {(variant === 'must' || isMustSee(item)) && <span className="day-badge-must" title="A true must-see here"><StarIcon size={9} /></span>}
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
