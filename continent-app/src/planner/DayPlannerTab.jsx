import React, { useEffect, useMemo, useState } from 'react';
import { TripMap } from '../map/TripMap.jsx';
import { DayExploreMap } from '../map/DayExploreMap.jsx';
import { Dropdown } from '../components/Dropdown.jsx';
import { DateField } from '../components/DateField.jsx';
import { ScoreChip, HiddenGemTag } from '../components/RatingBadge.jsx';
import { cityInsight } from '../lib/tripGuide.js';
import { tripDaysBetween, haversineKm, cityCoords, withCityCoords } from '../lib/runtime_pricing.js';
import { legTransportOptions } from '../lib/transport.js';
import { eur } from '../lib/format.js';
import { fetchActivitiesFull } from '../lib/appData.js';
import { fetchTripPlans, fetchTripPlanWithStops } from '../auth/tripPlanStorage.js';
import { fetchWalkingRoute, googleMapsDirUrl } from '../lib/routing.js';
import { geocodeAddress } from '../lib/geocode.js';
import { scenicWalksFor } from '../lib/scenicWalks.js';
import { CountryIntel } from '../components/CountryIntel.jsx';
import { useCountryInsights } from '../hooks/useCountryInsights.js';
import { addDays, todayISO, fmtDate as fmtDateFull } from '../lib/dates.js';
import {
  draftDays, tieredActivities, optimizeOrder, clusterIntoDays,
  walkableIdxSet, feasibilityLimits, isMustSee, dwellMinutes, VISIT_PACES,
  farWorthySights, scenicSuggestions, MAX_POI_KM_FROM_CITY, poiScore,
  isTransportInfraPoi, duplicatePoiIndices, poiIdentityKeys,
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
  FerryIcon, PencilIcon,
} from '../components/Icons.jsx';

const fmtDate = (iso) => (iso ? fmtDateFull(iso).slice(0, 6) : '');

const WALK_KMH = 4.8; // average walking pace, for the straight-line fallback
function estimateWalkMinutes(km) {
  return Math.max(1, Math.round((km / WALK_KMH) * 60));
}

/** "1 h 20 min" / "45 min" - visit durations in human units. */
function fmtDur(min) {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
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
          <SparkIcon size={11} /> You're staying right by {toDest.city}, so no
          inter-city travel is needed. Start your day on foot or hop on local
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
  // Bumped whenever we want the "Add to your trip" tiers to snap shut (e.g.
  // after adding a fresh day) so the browse shelves don't bury the day's plan.
  const [tiersCollapseKey, setTiersCollapseKey] = useState(0);
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
  // Free-text sight search across the city's FULL catalogue - including
  // big-name places beyond walking range (Mont-Saint-Michel from Saint-Malo).
  const [poiQuery, setPoiQuery] = useState('');
  // "Save this day trip to Saved trips" feedback for trip-based plans.
  const [daySaveState, setDaySaveState] = useState('idle');
  const [saveToast, setSaveToast] = useState('');
  // Landing explore map: which pin categories are shown (towns by default so
  // the map never opens overloaded), which pin is briefed in the side panel,
  // and which sights/beaches are picked alongside the towns in `newStops`.
  const [exploreCats, setExploreCats] = useState(() => new Set(['town']));
  const [exploreFocus, setExploreFocus] = useState('');
  const [selPois, setSelPois] = useState([]); // [{ key, destId, idx }]
  // When set, the explore/build screen is EDITING this existing plan (reached
  // via "Change places on the map") rather than composing a brand-new one.
  const [editingPlanId, setEditingPlanId] = useState(null);

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
    setEditingPlanId(null);
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
    // Jump to the fresh day and collapse the browse shelves, so the traveller
    // lands on that day's (empty) plan instead of a wall of open suggestions.
    setDayIdx(days.length);
    setTiersCollapseKey((k) => k + 1);
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

  // Trip-wide day numbering: days already spent in earlier cities, so day
  // labels continue across stops instead of restarting at 1 per city.
  const dayOffset = useMemo(
    () => stops.slice(0, stopIdx).reduce((n, s) => n + s.nights, 0),
    [stops, stopIdx],
  );

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
    if (!a) return { items: [], walkable: new Set(), suppressed: new Set(), limited: true };
    const full = (a.items_full && a.items_full.length)
      ? a.items_full
      : fullMap?.[s.destination_id];
    // Keep the FULL harvested list (stable indices, searchable, and far-away
    // greats like Mont-Saint-Michel stay findable); the `walkable` set marks
    // which indices are realistic for a walking day, and tiers/drafts stay
    // inside it so no plan ever "walks" across a strait.
    //
    // `suppressed` marks near-duplicate entries (same place under a translated
    // name, e.g. "Castle of Vezio" / "Castello di Vezio"). We drop them from
    // `walkable` so tiers and auto-drafts never surface the same place twice,
    // but leave the array (and every index) untouched, so saved assignments
    // and toggles that already reference an index stay valid.
    if (full && full.length) {
      const suppressed = duplicatePoiIndices(full);
      const walkable = walkableIdxSet(full, s.dest);
      suppressed.forEach((i) => walkable.delete(i));
      return { items: full, walkable, suppressed, limited: false };
    }
    const items = (a.items || []).map((it) => ({ ...it, lat: null, lon: null }));
    const suppressed = duplicatePoiIndices(items);
    const walkable = new Set(items.map((_, i) => i).filter((i) => !suppressed.has(i)));
    return { items, walkable, suppressed, limited: true };
  };

  const activities = useMemo(() => itemsForStop(stop), [stop, actFull]); // eslint-disable-line react-hooks/exhaustive-deps

  // Must-see / recommended / more / active tiers for the current stop's list.
  const tiers = useMemo(() => tieredActivities(activities.items, activities.walkable), [activities]);

  // Outstanding sights BEYOND walking range - their own excursion, but too
  // good not to mention (importance + beauty outweigh the distance).
  const farSights = useMemo(
    () => (stop?.dest
      ? farWorthySights(activities.items, stop.dest).filter((e) => !activities.suppressed.has(e.idx))
      : []),
    [activities, stop],
  );

  // Name/kind search over the full catalogue, strongest matches first, with
  // an honest distance note on anything beyond walking range.
  const poiSearch = useMemo(() => {
    const q = poiQuery.trim().toLowerCase();
    if (q.length < 2 || !stop?.dest) return [];
    const centre = cityCoords(stop.dest);
    return activities.items
      .map((item, idx) => ({ item, idx }))
      .filter(({ idx }) => !activities.suppressed.has(idx))
      .filter(({ item }) => !isTransportInfraPoi(item))
      .filter(({ item }) => (item.name || '').toLowerCase().includes(q)
        || (item.kind || '').toLowerCase().includes(q))
      .sort((a, b) => poiScore(b.item) - poiScore(a.item))
      .slice(0, 12)
      .map((e) => {
        const km = (e.item.lat != null && centre.lat != null)
          ? haversineKm(centre.lat, centre.lon, e.item.lat, e.item.lon)
          : null;
        return {
          ...e,
          note: km != null && km > MAX_POI_KM_FROM_CITY
            ? `${Math.round(km)} km from ${stop.dest.city} - a trip of its own`
            : null,
        };
      });
  }, [poiQuery, activities, stop]);

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
        const { items, walkable } = itemsForStop(s, fullMap);
        const lists = draftDays({
          items,
          numDays: s.nights,
          interests,
          paceKey: 'balanced',
          // Honest per-kind visit times, scaled by "how long at each stop".
          dwellFn: (kind) => dwellMinutes(kind, limits.dwellFactor),
          eligibleIdx: walkable,
          ...limits,
        });
        next[si] = {};
        lists.forEach((lst, di) => { if (lst.length) next[si][di] = lst; });
      });
    }
    setAssignments(next);
    persistAssignments(plan?.id, next);
    const savedPrefs = { style: p.style, interests: p.interests, dayLen: p.dayLen, walk: p.walk, fill: p.fill, visit: p.visit, routeMode };
    setPrefs(savedPrefs);
    persistPrefs(plan?.id, savedPrefs);
    setShowShape(false);
  };

  const dayAssignedIdx = assignments[stopIdx]?.[dayIdx] || [];
  const assignedItems = dayAssignedIdx.map((i) => activities.items[i]).filter(Boolean);

  // The stay address, entered ONCE (landing screen or in-plan), anchors the
  // whole day when it's actually in/near this city: the walking route starts
  // at the traveller's door, Carta orders stops from there, and the Google
  // Maps handoff includes it - it never has to be typed again.
  const stayAnchor = useMemo(() => {
    const p = plan?.stayPoint;
    if (!p || p.lat == null || p.lon == null || !stop?.dest) return null;
    const c = cityCoords(stop.dest);
    if (c.lat == null) return null;
    const km = haversineKm(p.lat, p.lon, c.lat, c.lon);
    return km != null && km <= 12 ? p : null;
  }, [plan, stop]);

  // "How long at each stop" answer scales the visit-time estimates shown on
  // the timeline and in the day total.
  const visitFactor = (VISIT_PACES.find((v) => v.key === prefs?.visit) || VISIT_PACES[1]).factor;
  const dwellFor = (it) => dwellMinutes(it.kind, visitFactor);
  const dwellTotal = assignedItems.reduce((n, it) => n + dwellFor(it), 0);

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
      commitDay(routeMode === 'auto' ? optimizeOrder(next, activities.items, stayAnchor) : next);
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
    commitDay(optimizeOrder(dayAssignedIdx, activities.items, stayAnchor));
    setRoute('auto');
  };

  const mapPins = assignedItems
    .filter((it) => it.lat != null && it.lon != null)
    .map((it) => ({ lat: it.lat, lon: it.lon, city: it.name }));

  // When the stay is in this city it leads the route: door -> first sight.
  const routePins = stayAnchor
    ? [{ lat: stayAnchor.lat, lon: stayAnchor.lon, city: 'Your stay', stay: true }, ...mapPins]
    : mapPins;

  // Real street-following walking route + per-leg distance/time from OSRM.
  const routeKey = routePins.map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`).join(';');
  const [route, setRouteGeom] = useState(null); // { key, geometry, legs, km, min }
  useEffect(() => {
    if (routePins.length < 2) { setRouteGeom(null); return; }
    let alive = true;
    fetchWalkingRoute(routePins).then((r) => { if (alive && r) setRouteGeom({ key: routeKey, ...r }); });
    return () => { alive = false; };
  }, [routeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const routeOk = route && route.key === routeKey;

  // Per-segment legs align to assignedItems only when every stop has
  // coordinates; with a stay anchor, leg 0 is door -> first sight.
  const stayLegOffset = stayAnchor ? 1 : 0;
  const legsAlign = routeOk
    && assignedItems.length >= 2
    && assignedItems.every((it) => it.lat != null && it.lon != null)
    && route.legs.length === assignedItems.length - 1 + stayLegOffset;

  // A real OSRM leg carries a ferry breakdown; the straight-line fallback has
  // no way to know about water, so it only ever reports an estimated walk.
  const legFrom = (l) => ({
    km: l.km, min: l.min, real: true,
    ferry: !!l.ferry, ferryKm: l.ferryKm || 0, ferryMin: l.ferryMin || 0,
    walkKm: l.walkKm || 0, walkMin: l.walkMin || 0,
  });

  const walkLeg = (i) => {
    const it = assignedItems[i];
    const next = assignedItems[i + 1];
    if (!next) return null;
    if (legsAlign) return legFrom(route.legs[i + stayLegOffset]);
    if (it.lat != null && it.lon != null && next.lat != null && next.lon != null) {
      const km = haversineKm(it.lat, it.lon, next.lat, next.lon);
      return { km, min: estimateWalkMinutes(km), real: false };
    }
    return null;
  };

  // Door -> first sight leg, shown at the top of the timeline.
  const stayLeg = (() => {
    if (!stayAnchor || !assignedItems.length) return null;
    if (legsAlign) return legFrom(route.legs[0]);
    const first = assignedItems[0];
    if (first.lat == null || first.lon == null) return null;
    const km = haversineKm(stayAnchor.lat, stayAnchor.lon, first.lat, first.lon);
    return km == null ? null : { km, min: estimateWalkMinutes(km), real: false };
  })();

  const gmapsUrl = googleMapsDirUrl(routePins, 'walking');

  // One timeline connector's label. A ferry leg (a lake/sea crossing OSRM
  // routes over) is called out as a ferry with its own icon - never presented
  // as a walk across the water.
  const legContent = (leg, stay = false) => {
    if (!leg) return <>↓ walking time unknown (no coordinates for one of these stops)</>;
    const prefix = stay ? 'From your stay: ' : '';
    if (leg.ferry) {
      const walkTail = leg.walkKm >= 0.15 ? `, then ${leg.walkMin} min walk` : '';
      return <><FerryIcon size={11} /> {prefix}ferry {leg.ferryMin} min{walkTail}, {leg.km.toFixed(1)} km</>;
    }
    const txt = `${prefix}${leg.real ? '' : '≈'}${leg.min} min walk, ${leg.km.toFixed(1)} km`;
    if (stay) return <><BedIcon size={11} /> {txt}</>;
    return <>↓ {txt}</>;
  };

  // Photogenic near-zero detours along today's walk (viewpoints, bridges,
  // squares...) - the walk itself should be beautiful, not just short.
  const scenic = useMemo(
    () => (routeMode === 'auto' ? scenicSuggestions(dayAssignedIdx, activities.items) : []),
    [dayAssignedIdx, activities, routeMode],
  );
  const addScenic = (sug) => {
    const current = [...dayAssignedIdx];
    current.splice(sug.afterPos + 1, 0, sug.idx);
    commitDay(current);
  };

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
    setSaveToast('Day plan saved to Saved trips.');
    window.setTimeout(() => setSaveToast(''), 3500);
  };

  // "In Saved trips" tap: save first if this is a trip-based plan that isn't
  // stored yet, then open a confirmation popup that also offers a way back to
  // the day-planner start page (the plan is safe under Saved trips).
  const handleSavedTripsClick = () => {
    if (!plan.standalone && daySaveState !== 'saved') saveToSavedTrips();
    setSavedInfo(true);
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
      // Day numbers continue across the whole trip (city 2 doesn't restart at 1).
      const cityDayOffset = stops.slice(0, si).reduce((n, x) => n + x.nights, 0);
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
        const dayDwell = dayItems.reduce((n, it) => n + dwellMinutes(it.kind, visitFactor), 0);
        const meta = [
          `${dayItems.length} ${dayItems.length === 1 ? 'stop' : 'stops'}`,
          dayKm > 0.05 ? `~${dayKm.toFixed(1)} km · ~${estimateWalkMinutes(dayKm)} min on foot` : '',
          dayDwell > 0 ? `~${fmtDur(dayDwell)} at the sights` : '',
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
            <div class="day-title">Day ${cityDayOffset + di + 1}<span class="date">${esc(fmtDateFull(date, true))}</span></div>
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

  // ---- Landing explore map: what's around the traveller's stay ----
  // Towns within day-trip reach, and (from the full POI catalogue) beaches &
  // nature, must-see sights and active outings - each behind its own filter
  // chip so the map never opens as a wall of pins.
  const EXPLORE_TOWN_KM = 85;
  const EXPLORE_POI_KM = 60;
  // A catalogue town this close to the stay IS the stay: the red stay pin
  // stands in for it, so we don't draw a duplicate town label on top of it.
  const STAY_TOWN_KM = 3;
  const BEACH_NATURE_RE = /beach|strand|playa|plage|nature|park|lake|waterfall|island|cliff|bay|lagoon|garden|dune|gorge|cave/i;

  const exploreTowns = useMemo(() => {
    if (!newStayPoint || newStayPoint.lat == null) return [];
    return Object.entries(destinations)
      .map(([id, d]) => {
        const c = cityCoords(d);
        if (c.lat == null) return null;
        const km = haversineKm(newStayPoint.lat, newStayPoint.lon, c.lat, c.lon);
        return km != null && km <= EXPLORE_TOWN_KM ? { id, dest: d, km: Math.round(km), ...c } : null;
      })
      .filter(Boolean)
      .sort((a, b) => (b.dest.rating?.score || 0) - (a.dest.rating?.score || 0))
      .slice(0, 22);
  }, [newStayPoint, destinations]);

  // The catalogue town the stay sits in (if any). Its pin is folded into the
  // red stay pin, which is clickable to brief it and everything around it.
  const stayTownId = useMemo(() => {
    let best = null;
    for (const t of exploreTowns) {
      if (t.km != null && (best == null || t.km < best.km)) best = t;
    }
    return best && best.km <= STAY_TOWN_KM ? best.id : null;
  }, [exploreTowns]); // eslint-disable-line react-hooks/exhaustive-deps

  const explorePois = useMemo(() => {
    if (!newStayPoint || newStayPoint.lat == null) return [];
    const out = [];
    for (const t of exploreTowns) {
      const items = (t.dest.activities?.items_full?.length
        ? t.dest.activities.items_full
        : actFull?.[t.id]) || [];
      const suppressed = duplicatePoiIndices(items); // dupes within this town
      items.forEach((item, idx) => {
        if (suppressed.has(idx)) return;
        if (item.lat == null || item.lon == null || isTransportInfraPoi(item)) return;
        const km = haversineKm(newStayPoint.lat, newStayPoint.lon, item.lat, item.lon);
        if (km == null || km > EXPLORE_POI_KM) return;
        const kindName = `${item.kind || ''} ${item.name || ''}`;
        const cat = BEACH_NATURE_RE.test(kindName) ? 'beach'
          : isMustSee(item) ? 'sight'
          : item.active ? 'active'
          : null;
        if (!cat) return;
        out.push({ key: `p:${t.id}:${idx}`, destId: t.id, idx, item, cat, km: Math.round(km), lat: item.lat, lon: item.lon });
      });
    }
    // Keep the strongest of each category near the top; cap so the map stays
    // legible. Sorting by strength first means that when the same place was
    // harvested into two overlapping towns, the richer copy is the one kept by
    // the cross-town dedup below.
    const byCat = { beach: [], sight: [], active: [] };
    const seen = new Set();
    out.sort((a, b) => poiScore(b.item) - poiScore(a.item));
    out.forEach((p) => {
      const keys = poiIdentityKeys(p.item);
      if (keys.some((k) => seen.has(k))) return; // same place from another town
      keys.forEach((k) => seen.add(k));
      if (byCat[p.cat].length < 28) byCat[p.cat].push(p);
    });
    return [...byCat.beach, ...byCat.sight, ...byCat.active];
  }, [newStayPoint, exploreTowns, actFull]);

  const exploreMarkers = useMemo(() => {
    const ms = [];
    if (exploreCats.has('town')) {
      exploreTowns.forEach((t) => {
        if (t.id === stayTownId) return; // folded into the red stay pin
        ms.push({
        id: `t:${t.id}`,
        label: t.dest.city,
        lat: t.lat,
        lon: t.lon,
        cat: 'town',
        selected: newStops.some((s) => s.destinationId === t.id),
        focused: exploreFocus === `t:${t.id}`,
        });
      });
    }
    explorePois.forEach((p) => {
      if (!exploreCats.has(p.cat)) return;
      ms.push({
        id: p.key,
        label: p.item.name,
        lat: p.lat,
        lon: p.lon,
        cat: p.cat,
        selected: selPois.some((x) => x.key === p.key),
        focused: exploreFocus === p.key,
      });
    });
    return ms;
  }, [exploreCats, exploreTowns, explorePois, newStops, selPois, exploreFocus, stayTownId]);

  const toggleExploreCat = (cat) => {
    setExploreCats((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  // What the side panel is briefing: a town or a specific place.
  const focusedExplore = useMemo(() => {
    if (!exploreFocus) return null;
    if (exploreFocus.startsWith('t:')) {
      const t = exploreTowns.find((x) => `t:${x.id}` === exploreFocus);
      return t ? { type: 'town', ...t } : null;
    }
    const p = explorePois.find((x) => x.key === exploreFocus);
    return p ? { type: 'poi', ...p } : null;
  }, [exploreFocus, exploreTowns, explorePois]);

  const togglePoiPick = (p) => {
    setSelPois((prev) => (prev.some((x) => x.key === p.key)
      ? prev.filter((x) => x.key !== p.key)
      : [...prev, { key: p.key, destId: p.destId, idx: p.idx }]));
  };

  // Reopen an existing plan on the explore/build map to change its towns and
  // picks. Its stay and towns are pre-loaded so the map opens on the same
  // place; hitting the button again updates that plan in place (see below).
  const editPlanOnMap = () => {
    const sp = standalonePlans.find((p) => p.id === plan?.id);
    if (!sp) return;
    setEditingPlanId(sp.id);
    setNewStayPoint(sp.stayPoint || null);
    setNewStops((sp.stops || []).map((s) => ({ destinationId: s.destinationId, days: s.days || 1 })));
    setNewStartDate(sp.startDate || todayISO());
    setSelPois([]);
    setNewCountry('');
    setStayQuery('');
    setStayResults(null);
    setExploreFocus('');
    setExploreCats(new Set(['town']));
    setPlan(null);
  };

  const cancelEditOnMap = () => {
    const id = editingPlanId;
    setEditingPlanId(null);
    setNewStops([]);
    setNewCountry('');
    setStayQuery('');
    setStayResults(null);
    setNewStayPoint(null);
    setSelPois([]);
    setExploreFocus('');
    const sp = standalonePlans.find((p) => p.id === id);
    if (sp) openStandalone(sp);
  };

  // Start planning from the explore picks. Towns each get their days; picked
  // beaches/sights/activities land pre-assigned on day 1 of their town (they
  // are already specific, so no wizard for them). Towns picked without
  // specific places open with the shape-your-day question exactly as before.
  const startExplorePlanning = () => {
    const stops = newStops.map((s) => ({ ...s }));
    for (const p of selPois) {
      if (!stops.some((s) => s.destinationId === p.destId)) {
        stops.push({ destinationId: p.destId, days: 1 });
      }
    }
    if (!stops.length) return;

    // Editing an existing plan: keep its id and, crucially, its day-by-day
    // arrangement. Assignments are re-keyed from destination id (stable) to the
    // new stop order, so adding, removing or reordering towns never scrambles
    // the picks already laid into days.
    if (editingPlanId) {
      const prev = standalonePlans.find((p) => p.id === editingPlanId);
      const prevAssign = loadAssignments(editingPlanId) || {};
      const byDest = {};
      (prev?.stops || []).forEach((s, i) => { if (prevAssign[i]) byDest[s.destinationId] = prevAssign[i]; });
      const remapped = {};
      stops.forEach((s, i) => { if (byDest[s.destinationId]) remapped[i] = byDest[s.destinationId]; });
      // Newly picked places land on day 1 of their town, appended to whatever
      // is already arranged there rather than replacing it.
      if (selPois.length) {
        const bySi = {};
        selPois.forEach((p) => {
          const si = stops.findIndex((s) => s.destinationId === p.destId);
          if (si >= 0) (bySi[si] = bySi[si] || []).push(p.idx);
        });
        Object.entries(bySi).forEach(([si, idxs]) => {
          const s = stops[Number(si)];
          const items = (destinations[s.destinationId]?.activities?.items_full?.length
            ? destinations[s.destinationId].activities.items_full
            : actFull?.[s.destinationId]) || [];
          const day0 = remapped[si]?.[0] || [];
          const fresh = idxs.filter((x) => !day0.includes(x));
          remapped[si] = { ...(remapped[si] || {}), 0: optimizeOrder([...day0, ...fresh], items, newStayPoint) };
        });
      }
      const updated = {
        ...prev,
        stayPoint: newStayPoint,
        startDate: newStartDate || prev?.startDate || todayISO(),
        stops,
        label: stops.map((s) => destinations[s.destinationId]?.city).filter(Boolean).join(' + ') || prev?.label || 'Day plan',
      };
      const next = standalonePlans.map((p) => (p.id === editingPlanId ? updated : p));
      setStandalonePlans(next);
      persistStandalonePlans(next);
      persistAssignments(editingPlanId, remapped);
      setEditingPlanId(null);
      setNewStops([]);
      setNewCountry('');
      setStayQuery('');
      setStayResults(null);
      setNewStayPoint(null);
      setSelPois([]);
      setExploreFocus('');
      openStandalone(updated);
      return;
    }

    const sp = {
      id: `local:${Date.now()}`,
      label: stops.map((s) => destinations[s.destinationId]?.city).filter(Boolean).join(' + ') || 'Day plan',
      startDate: newStartDate || todayISO(),
      stayPoint: newStayPoint,
      stops,
    };
    // Pre-assign the picked places to day 1 of their stop, in walking order.
    if (selPois.length) {
      const byStop = {};
      selPois.forEach((p) => {
        const si = stops.findIndex((s) => s.destinationId === p.destId);
        if (si < 0) return;
        (byStop[si] = byStop[si] || []).push(p.idx);
      });
      const pre = {};
      Object.entries(byStop).forEach(([si, idxs]) => {
        const s = stops[Number(si)];
        const items = (destinations[s.destinationId]?.activities?.items_full?.length
          ? destinations[s.destinationId].activities.items_full
          : actFull?.[s.destinationId]) || [];
        pre[si] = { 0: optimizeOrder(idxs, items, newStayPoint) };
      });
      persistAssignments(sp.id, pre);
    }
    const next = [sp, ...standalonePlans];
    setStandalonePlans(next);
    persistStandalonePlans(next);
    setNewStops([]);
    setNewCountry('');
    setStayQuery('');
    setStayResults(null);
    setNewStayPoint(null);
    setSelPois([]);
    setExploreFocus('');
    openStandalone(sp);
  };

  // Landing screen: plan a day for any city (no trip required), reopen a saved
  // day plan, or pick one of your saved trips to plan its stops.
  if (!plan) {
    return (
      <div className="trip-planner-screen day-landing-screen">
        <div className="day-landing">
          {editingPlanId && (
            <div className="day-edit-banner">
              <span><PencilIcon size={13} /> Changing places in this plan. Adjust the towns and sights on the map, then update.</span>
              <button className="day-edit-cancel" onClick={cancelEditOnMap}>Cancel</button>
            </div>
          )}
          <div className="section-title">{editingPlanId ? 'Change places' : 'Day planner'}</div>
          <p className="day-landing-lead">
            {editingPlanId
              ? 'Add or drop towns and sights around your stay. Your days keep the places they already hold.'
              : "Start with where you're staying. Carta pins it on the map, shows what's worth your time around it, and plans each day from your door."}
          </p>

          <div className="day-build">
            {/* 1. Where are you staying - town, street, hotel or apartment
                  address. It anchors everything: the map, the routes, the
                  getting-there advice. */}
            <label className="trip-field day-build-field">
              <span className="trip-field-label">Where are you staying?</span>
              {newStayPoint ? (
                <div className="day-stay-chosen">
                  <span className="day-stay-chosen-label">{newStayPoint.shortLabel || newStayPoint.label}</span>
                  <button className="trip-stop-remove" onClick={() => { setNewStayPoint(null); setStayResults(null); setExploreFocus(''); }} aria-label="Clear address" title="Clear">×</button>
                </div>
              ) : (
                <div className="day-stay-search">
                  <input
                    className="day-stay-input"
                    type="text"
                    value={stayQuery}
                    onChange={(e) => setStayQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') searchStay(); }}
                    placeholder="Town, street, hotel or apartment address"
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
                <p className="trip-note">No match for that address. Try adding the town name.</p>
              )
            )}

            <div className="day-build-row">
              <label className="trip-field">
                <span className="trip-field-label">First day</span>
                <DateField value={newStartDate} onChange={setNewStartDate} placeholder="Start date" />
              </label>
            </div>

            {/* 2. Explore what's around the stay: a zoomed-in map with filter
                  chips (towns by default so it never opens overloaded), a
                  briefing panel for whatever gets tapped, and multi-select. */}
            {newStayPoint && (
              <div className="day-explore">
                <div className="day-explore-filters">
                  {[
                    ['town', 'Towns & cities'],
                    ['beach', 'Beaches & nature'],
                    ['sight', 'Sights'],
                    ['active', 'Activities'],
                  ].map(([cat, label]) => (
                    <button
                      key={cat}
                      className={`guide-chip dem-chip-${cat} ${exploreCats.has(cat) ? 'on' : ''}`}
                      onClick={() => toggleExploreCat(cat)}
                      aria-pressed={exploreCats.has(cat)}
                    >{label}</button>
                  ))}
                </div>
                <div className="day-explore-wrap">
                  <DayExploreMap
                    stay={{ lat: newStayPoint.lat, lon: newStayPoint.lon, label: newStayPoint.shortLabel || 'Your stay' }}
                    markers={exploreMarkers}
                    onFocus={(id) => setExploreFocus((cur) => (cur === id ? '' : id))}
                    onStayClick={stayTownId ? () => setExploreFocus((cur) => (cur === `t:${stayTownId}` ? '' : `t:${stayTownId}`)) : null}
                    stayFocused={!!stayTownId && exploreFocus === `t:${stayTownId}`}
                  />
                  <div className="guide-city-side day-explore-side">
                    {!focusedExplore ? (
                      <div className="guide-flight-side-empty">
                        <MapPinIcon size={16} />
                        <p>Tap anything on the map, a town, a beach or a sight, to read about it and add it to your days. Pick as many as you like.</p>
                      </div>
                    ) : focusedExplore.type === 'town' ? (
                      <>
                        {focusedExplore.dest.image?.url && (
                          <div className="guide-city-side-photo" style={{ backgroundImage: `url(${focusedExplore.dest.image.url})` }} />
                        )}
                        <div className="guide-city-side-title">
                          <b>{focusedExplore.dest.city}</b>
                          {focusedExplore.dest.rating?.score != null && <ScoreChip rating={focusedExplore.dest.rating} size="xs" />}
                          {focusedExplore.dest.rating?.hidden_gem && <HiddenGemTag />}
                        </div>
                        <p className="guide-city-side-insight">
                          {focusedExplore.km} km from your stay. {cityInsight(focusedExplore.dest)}
                        </p>
                        {newStops.some((s) => s.destinationId === focusedExplore.id) ? (
                          <div className="guide-city-side-actions">
                            <div className="trip-people day-days-stepper">
                              <button type="button" onClick={() => setLandingDays(focusedExplore.id, (newStops.find((s) => s.destinationId === focusedExplore.id)?.days || 1) - 1)} aria-label="Fewer days">-</button>
                              <span>{newStops.find((s) => s.destinationId === focusedExplore.id)?.days || 1} {(newStops.find((s) => s.destinationId === focusedExplore.id)?.days || 1) === 1 ? 'day' : 'days'}</span>
                              <button type="button" onClick={() => setLandingDays(focusedExplore.id, (newStops.find((s) => s.destinationId === focusedExplore.id)?.days || 1) + 1)} aria-label="More days">+</button>
                            </div>
                            <button className="guide-back" onClick={() => removeLandingCity(focusedExplore.id)}>Remove</button>
                          </div>
                        ) : (
                          <button className="guide-next guide-city-side-add" onClick={() => addLandingCity(focusedExplore.id)}>
                            + Add to my days
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        {focusedExplore.item.img && (
                          <div className="guide-city-side-photo" style={{ backgroundImage: `url(${focusedExplore.item.img})` }} />
                        )}
                        <div className="guide-city-side-title">
                          <b>{focusedExplore.item.name}</b>
                          {isMustSee(focusedExplore.item) && <span className="day-badge-must" title="A true must-see"><StarIcon size={9} /></span>}
                        </div>
                        <p className="guide-city-side-insight">
                          {focusedExplore.item.kind ? `${focusedExplore.item.kind}, ` : ''}
                          {focusedExplore.km} km from your stay, near {destinations[focusedExplore.destId]?.city}.
                          {' '}{focusedExplore.item.desc || ''}
                        </p>
                        <p className="trip-note">Plan ~{fmtDur(dwellMinutes(focusedExplore.item.kind))} for a visit.</p>
                        {selPois.some((x) => x.key === focusedExplore.key) ? (
                          <button className="guide-back guide-city-side-add" onClick={() => togglePoiPick(focusedExplore)}>Remove from my days</button>
                        ) : (
                          <button className="guide-next guide-city-side-add" onClick={() => togglePoiPick(focusedExplore)}>
                            + Add to my days
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 3. Everything picked so far. */}
            {(newStops.length > 0 || selPois.length > 0) && (
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
                {selPois.map((p) => {
                  const item = explorePois.find((x) => x.key === p.key)?.item;
                  if (!item) return null;
                  return (
                    <div className="day-build-city" key={p.key}>
                      <span className="day-build-city-name">
                        {item.name}
                        <small>{item.kind}, near {destinations[p.destId]?.city}</small>
                      </span>
                      <button
                        className="trip-stop-remove"
                        onClick={() => setSelPois((prev) => prev.filter((x) => x.key !== p.key))}
                        aria-label={`Remove ${item.name}`}
                        title="Remove"
                      >×</button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Fallback: add cities by name (works without an address too). */}
            {!newStayPoint && (
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
            )}

            {!newStayPoint && landingCities.length > 0 && (
              <div className="day-build-map">
                <TripMap stops={landingCities} padBottom={12} showRoute={false} />
              </div>
            )}

            <button
              className="trip-save-btn day-build-btn"
              onClick={startExplorePlanning}
              disabled={newStops.length === 0 && selPois.length === 0}
            >
              {editingPlanId ? 'Update plan' : 'Start planning'}
            </button>
            {selPois.length > 0 && newStops.length === 0 && (
              <p className="trip-note">Your picked places are specific enough - Carta lays them straight into a day, no questionnaire.</p>
            )}
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
      {saveToast && <div className="trip-save-toast" role="status">{saveToast}</div>}
      {savedInfo && (
        <div className="day-saved-overlay" role="dialog" aria-modal="true" onClick={() => setSavedInfo(false)}>
          <div className="day-saved-card" onClick={(e) => e.stopPropagation()}>
            <button
              className="day-saved-close"
              onClick={() => { setSavedInfo(false); setPlan(null); }}
              aria-label="Back to all day plans"
              title="Back to all day plans"
            >×</button>
            <div className="day-saved-badge"><BookmarkIcon size={20} /></div>
            <h3>In your Saved trips</h3>
            <p>This day plan is stored in your Saved trips. Reopen it any time — every change you make here is kept automatically.</p>
            <button className="day-saved-done" onClick={() => setSavedInfo(false)}>Keep planning here</button>
          </div>
        </div>
      )}
      {showShape && stop && (
        <ShapeDayWizard
          city={stop.dest?.city || 'this city'}
          numDays={days.length}
          items={activities.items}
          eligibleIdx={activities.walkable}
          initial={prefs}
          onSkip={() => setShowShape(false)}
          onDraft={applyDraft}
        />
      )}
      <TripMap
        stops={routePins}
        padBottom={420}
        routeGeometry={routeOk ? route.geometry : null}
        routeSegments={routeOk ? route.segments : null}
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
                </>
              )}
              <button className="day-changeplaces-btn" onClick={editPlanOnMap}>
                <PencilIcon size={13} /> Change places on the map
              </button>
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
                {/* Day numbers run through the WHOLE trip: if Makarska ends on
                    day 2, Sibenik starts on day 3, not back at day 1. */}
                {days.map((d, i) => (
                  <button
                    key={i}
                    className={`day-chip ${i === dayIdx ? 'active' : ''}`}
                    onClick={() => setDayIdx(i)}
                  >
                    Day {dayOffset + i + 1}
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
                  <div className="day-poi-search day-stay-search">
                    <input
                      className="day-stay-input"
                      type="text"
                      value={poiQuery}
                      onChange={(e) => setPoiQuery(e.target.value)}
                      placeholder="Search any sight or place name"
                      aria-label="Search sights"
                    />
                    {poiQuery.trim().length > 0 && (
                      <button className="trip-stop-remove" onClick={() => setPoiQuery('')} aria-label="Clear search" title="Clear">×</button>
                    )}
                  </div>
                  {poiQuery.trim().length >= 2 && (
                    poiSearch.length ? (
                      <div className="day-activity-list day-search-results">
                        {poiSearch.map(({ item, idx, note }) => (
                          <ActivityRow
                            key={idx}
                            item={item}
                            variant={isMustSee(item) ? 'must' : ''}
                            added={dayAssignedIdx.includes(idx)}
                            onToggle={() => toggleActivity(idx)}
                            note={note}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="trip-note">Nothing catalogued matches "{poiQuery.trim()}" around {stop.dest?.city || 'here'}.</p>
                    )
                  )}
                  {tiers.must.length > 0 && (
                    <ActivitySection
                      key={`must-${tiersCollapseKey}`}
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
                      key={`worth-${tiersCollapseKey}`}
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
                      key={`active-${tiersCollapseKey}`}
                      title="Active & outdoors"
                      badge={<MountainIcon size={11} />}
                      entries={tiers.active}
                      variant="act"
                      assignedIdx={dayAssignedIdx}
                      onToggle={toggleActivity}
                    />
                  )}
                  {farSights.length > 0 && (
                    <ActivitySection
                      key={`far-${tiersCollapseKey}`}
                      title="Worth the detour"
                      badge={<MapPinIcon size={11} />}
                      entries={farSights.map(({ item, idx, km }) => ({
                        item, idx,
                        note: `${Math.round(km)} km from ${stop.dest?.city || 'town'} - a day trip of its own`,
                      }))}
                      variant="far"
                      assignedIdx={dayAssignedIdx}
                      onToggle={toggleActivity}
                    />
                  )}
                  {tiers.more.length > 0 && (
                    <ActivitySection
                      key={`more-${tiersCollapseKey}`}
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
                        ? <><SparkIcon size={11} /> Carta picks the best {routeOk && route.hasFerry ? 'route (walk + ferry)' : 'walking route'}</>
                        : 'Manual order'}
                    </span>
                    {routeMode === 'manual' && (
                      <button className="day-route-optimize" onClick={optimizeNow}>
                        <SparkIcon size={11} /> Let Carta reorder
                      </button>
                    )}
                  </div>

                  <div className="day-timeline">
                    {stayLeg && (
                      <div className={`day-timeline-walk day-timeline-stay${stayLeg.ferry ? ' day-timeline-ferry' : ''}`}>
                        {legContent(stayLeg, true)}
                      </div>
                    )}
                    {assignedItems.map((it, i) => (
                      <React.Fragment key={`${dayAssignedIdx[i]}`}>
                        <AssignedRow
                          item={it}
                          index={i}
                          last={i === assignedItems.length - 1}
                          dwellMin={dwellFor(it)}
                          onMoveUp={() => moveAssigned(i, -1)}
                          onMoveDown={() => moveAssigned(i, 1)}
                          onRemove={() => toggleActivity(dayAssignedIdx[i])}
                        />
                        {i < assignedItems.length - 1 && (() => {
                          const leg = walkLeg(i);
                          return (
                            <div className={`day-timeline-walk${leg?.ferry ? ' day-timeline-ferry' : ''}`}>
                              {legContent(leg)}
                            </div>
                          );
                        })()}
                      </React.Fragment>
                    ))}
                  </div>
                  {legsAlign && routeOk && (
                    <p className="day-route-total">
                      Full route: {route.km.toFixed(1)} km, about {route.min} min {route.hasFerry ? 'of walking and ferry rides' : 'of walking'}.
                      {dwellTotal > 0 && ` With time at each place, count on ~${fmtDur(dwellTotal + route.min)} out.`}
                    </p>
                  )}

                  {scenic.length > 0 && (
                    <div className="day-scenic">
                      <div className="day-scenic-title"><SparkIcon size={11} /> Make the walk itself beautiful</div>
                      {scenic.map((sug) => (
                        <button key={sug.idx} className="day-scenic-row" onClick={() => addScenic(sug)} title="Add it to today's route">
                          <span className="day-scenic-text">
                            <b>{sug.item.name}</b>
                            <small>{sug.item.kind}, only +{sug.extraMin} min off your route</small>
                          </span>
                          <span className="day-activity-add">+</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="day-actions-row">
                    {gmapsUrl && (
                      <a className="day-action-btn day-action-primary" href={gmapsUrl} target="_blank" rel="noreferrer">
                        <MapPinIcon size={14} /> Open in Google Maps
                      </a>
                    )}
                    <button
                      className="day-action-btn"
                      onClick={handleSavedTripsClick}
                      title={plan.standalone || daySaveState === 'saved' ? 'This day plan is in your Saved trips' : 'Keep this day plan in your Saved trips'}
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

          {/* Researched iconic walks: the walk itself is the sight. */}
          {stop && (() => {
            const walks = scenicWalksFor(stop.dest?.city || '');
            if (!walks.length) return null;
            return (
              <div className="trip-block">
                <div className="trip-block-title"><MountainIcon size={13} /> The most beautiful walk here</div>
                {walks.map((w) => (
                  <div key={w.name} className="day-walk">
                    <b>{w.name}</b>
                    <small>~{w.km} km. {w.note}</small>
                  </div>
                ))}
              </div>
            );
          })()}

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
function AssignedRow({ item, index, last, dwellMin, onMoveUp, onMoveDown, onRemove }) {
  const [infoOpen, setInfoOpen] = useState(false);
  return (
    <div className="day-timeline-row">
      <div className="day-timeline-num">{index + 1}</div>
      <div className="day-assigned-row day-assigned-with-info">
        {item.img && <span className="day-thumb" style={{ backgroundImage: `url(${item.img})` }} />}
        <div className="day-assigned-body">
          <span className="day-assigned-name">{item.name}</span>
          <span className="day-assigned-kind">
            {item.kind}
            {dwellMin ? ` · ~${fmtDur(dwellMin)} visit` : ''}
          </span>
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
              {!item.desc && isMustSee(item) ? ' Among the highest-rated sights here.' : ''}
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
          {entries.map(({ item, idx, note }) => (
            <ActivityRow
              key={idx}
              item={item}
              variant={variant}
              added={assignedIdx.includes(idx)}
              onToggle={() => onToggle(idx)}
              note={note}
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
function ActivityRow({ item, variant, added, onToggle, note }) {
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
          {note && <span className="day-poi-note">{note}</span>}
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
            {!item.desc && isMustSee(item) ? ' Among the highest-rated sights here.' : ''}
            {` Plan ~${fmtDur(dwellMinutes(item.kind))} for a visit.`}
          </p>
          {item.wiki && (
            <a href={item.wiki} target="_blank" rel="noreferrer">Read more on Wikipedia ↗</a>
          )}
        </div>
      )}
    </div>
  );
}
