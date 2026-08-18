import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TripMap } from '../map/TripMap.jsx';
import { DayExploreMap } from '../map/DayExploreMap.jsx';
import { Dropdown } from '../components/Dropdown.jsx';
import { DateField } from '../components/DateField.jsx';
import { ScoreChip, HiddenGemTag } from '../components/RatingBadge.jsx';
import { cityInsight } from '../lib/tripGuide.js';
import { tripDaysBetween, haversineKm, cityCoords, withCityCoords } from '../lib/runtime_pricing.js';
import { legTransportOptions } from '../lib/transport.js';
import { eur, safeUrl } from '../lib/format.js';
import { fetchActivitiesFull } from '../lib/appData.js';
import { fetchTripPlans, fetchTripPlanWithStops } from '../auth/tripPlanStorage.js';
import { fetchWalkingRoute, fetchDrivingRoute, googleMapsDirUrl } from '../lib/routing.js';
import { useI18n } from '../i18n/index.jsx';
import { localIntelFor } from '../lib/localIntel.js';
import { geocodeAddress } from '../lib/geocode.js';
import { scenicWalksFor } from '../lib/scenicWalks.js';
import { findCitytrip, resolveCitytripStops, loadTrail } from '../lib/citytrips.js';
import { CountryIntel } from '../components/CountryIntel.jsx';
import { useCountryInsights } from '../hooks/useCountryInsights.js';
import { addDays, todayISO, fmtDate as fmtDateFull } from '../lib/dates.js';
import {
  draftDays, tieredActivities, optimizeOrder, pickerDeck, poiCategory, poiMapCat,
  walkableIdxSet, feasibilityLimits, isMustSee, dwellMinutes, VISIT_PACES,
  farWorthySights, scenicSuggestions, MAX_POI_KM_FROM_CITY, poiScore, poiKind,
  poiRating, isTransportInfraPoi, isCommercialNoisePoi, duplicatePoiIndices,
  canonicalPoiIndices, poiIdentityKeys, DAY_STYLES,
} from './dayDraft.js';
import { AiDayPlanModal } from './AiDayPlanModal.jsx';
import { PassModal } from '../components/PassModal.jsx';
import { useEntitlement } from '../hooks/useEntitlement.js';
import { CartaChatPlanner } from './CartaChatPlanner.jsx';
import {
  buildAiCandidates, requestAiDayPlan, splitAiPlan, decorateAiStops,
} from './aiDayPlan.js';
import { buildCityCandidates, requestCitySuggestion } from './aiCitySuggest.js';
import { openDayPlanPdf } from './dayPlanPdf.js';
import { openDayPlanKml } from './dayPlanKml.js';
import { openDayPlanIcs } from './dayPlanIcs.js';
import { MODE_META, DayTripTransport } from './DayTripTransport.jsx';
import { CartaGuidePanel } from './CartaGuidePanel.jsx';
import { estimateWalkMinutes, fmtDur } from './dayFormat.js';
import {
  buildDaySchedule, fmtClockLoose, dayPhase, GAP_SUGGEST_MIN,
} from './daySchedule.js';
import { searchFold } from '../lib/textSearch.js';
import { Collapsible, AssignedRow, ActivitySection, ActivityRow, PoiThumb } from './DayActivityRows.jsx';
import {
  loadStandalonePlans, persistStandalonePlans, deleteStandalonePlan,
  loadAssignments, persistAssignments, loadPrefs, persistPrefs,
  subscribeDayPlanStore, TRIP_DRAFT_PLAN_ID,
} from './dayPlanStore.js';
import { loadTripDraft } from './tripDraftStore.js';
import {
  loadDiscovered, saveDiscovered, removeDiscovered, subscribeDiscovered, isStale,
} from './discoveredStore.js';
import { researchCity } from '../lib/cityResearch.js';
import {
  SparkIcon, StarIcon, InfoIcon, MountainIcon, ShareIcon, MapPinIcon,
  BedIcon, BookmarkIcon, DownloadIcon, RouteIcon,
  FerryIcon, PencilIcon, SearchIcon, HomeIcon, CheckIcon, CalendarIcon,
  ClockIcon, CoffeeIcon, FilterIcon, ChevronDownIcon, ChevronRightIcon,
  UploadIcon,
} from '../components/Icons.jsx';
import { MagicImportZone } from './MagicImportZone.jsx';
import { toInboxItems } from './bookingImport.js';

// How the explore search & "Let Carta guide you" name each pin category.
// i18n keys, resolved with t() at render time.
const EXPLORE_CAT_KEY = { town: 'day.catTown', beach: 'day.catBeach', sight: 'day.catSight', active: 'day.catActive' };

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

// Beyond this, a bot plan's own walking total is not a day anyone walked: it
// came from a plan saved before the server enforced a walking budget. Well
// clear of the 40 km ceiling the chat profile allows a keen hiker to ask for.
const AI_MAX_TRUSTED_WALK_KM = 45;

/** A place's own description, trimmed to a timeline-sized sentence or two on a
 *  word boundary (never mid-word, never mid-sentence if a full stop is near
 *  the limit), so every stop can carry context without the card ballooning. */
function shortDesc(text, limit = 165) {
  const s = (text || '').trim();
  if (s.length <= limit) return s;
  const cut = s.slice(0, limit);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (stop > limit * 0.55) return cut.slice(0, stop + 1);
  const space = cut.lastIndexOf(' ');
  return `${cut.slice(0, space > 0 ? space : limit).replace(/[,;:]$/, '')}...`;
}


const fmtDate = (iso) => (iso ? fmtDateFull(iso).slice(0, 6) : '');

// Remembered height of the mobile day-plan bottom sheet (px). Mirrors the trip
// planner's SHEET_H_KEY so the two sheets behave the same but keep their own
// remembered heights.
const DAY_SHEET_H_KEY = 'carta.daySheetH.v1';


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


export function DayPlannerTab({ data, user, authConfigured, openPlanId, onOpenPlanConsumed }) {
  const { t, lang } = useI18n();
  // Towns the traveller asked Carta to research (discoveredStore.js). They are
  // real destinations from here on: pins, POI lists, search hits and plan
  // stops all read them out of the same map as the catalogue.
  const [discovered, setDiscovered] = useState(loadDiscovered);
  useEffect(() => subscribeDiscovered(() => setDiscovered(loadDiscovered())), []);
  // A researched town whose name and place the catalogue has since caught up
  // with is retired: the pipeline's record has prices and ratings this one
  // never will, and two pins on one town is the worse outcome.
  const supersededIds = useMemo(() => {
    const base = Object.values(data?.destinations || {});
    const isSameTown = (a, b) => {
      if (a.city !== b.city) return false;
      const ca = cityCoords(a);
      const cb = cityCoords(b);
      return (haversineKm(ca.lat, ca.lon, cb.lat, cb.lon) ?? 99) <= 3;
    };
    return Object.entries(discovered)
      .filter(([, d]) => base.some((b) => isSameTown(b, d)))
      .map(([id]) => id);
  }, [data, discovered]);
  useEffect(() => { supersededIds.forEach(removeDiscovered); }, [supersededIds]);
  const destinations = useMemo(() => {
    const out = { ...(data?.destinations || {}) };
    Object.entries(discovered).forEach(([id, d]) => {
      if (!supersededIds.includes(id)) out[id] = d;
    });
    return out;
  }, [data, discovered, supersededIds]);
  const countryInsights = useCountryInsights();
  // What this traveller's pass allows. A hint for the UI only, the Edge
  // Functions enforce it; see useEntitlement.
  const entitlement = useEntitlement();
  // '' when closed, otherwise the reason it opened ('plans' | 'ground' | 'browse'),
  // which decides whether the modal leads with what just ran out.
  const [passReason, setPassReason] = useState('');

  const [savedPlans, setSavedPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plan, setPlan] = useState(null); // { id, label, stops: [...] }
  const [stopIdx, setStopIdx] = useState(0);
  const [dayIdx, setDayIdx] = useState(0);
  // Bumped whenever we want the "Add to your trip" tiers to snap shut (e.g.
  // after adding a fresh day) so the browse shelves don't bury the day's plan.
  const [tiersCollapseKey, setTiersCollapseKey] = useState(0);
  const [assignments, setAssignments] = useState({}); // { [stopIdx]: { [dayIdx]: [activityIdx,...] } }
  // Carta-plan answers (null until asked) + whether the inline plan panel
  // (the "Shape day N" questions in the rail) is open.
  const [prefs, setPrefs] = useState(null);
  // The AI day-planner dialog (plan-day Edge Function). Applied AI schedules
  // live in prefs.aiPlans keyed "stopIdx:dayIdx", so they survive reloads and
  // ride the same per-plan cloud sync as every other answer.
  const [aiOpen, setAiOpen] = useState(false);
  // The published ready-made day for the selected city (trails wire,
  // category citytrip), when one exists. Null for most towns.
  const [citytrip, setCitytrip] = useState(null);
  // Carta keeps the walking order optimal on every add ('auto'); manual
  // reordering switches to 'manual' until "Best route" is tapped again.
  const [routeMode, setRouteMode] = useState('auto');
  const [shareState, setShareState] = useState('idle'); // idle | copied
  // "How Carta routed this" explainer, tucked behind an info icon in the plan.
  const [routeInfoOpen, setRouteInfoOpen] = useState(false);

  // Mobile bottom-sheet drag for the open day-plan view: on phones the panel is
  // a draggable sheet you can pull down to reveal the map underneath (and swipe
  // back up), matching the trip planner. On desktop (>=769px) it's a fixed left
  // column and all of this is inert.
  const [sheetHeight, setSheetHeight] = useState(() => {
    if (typeof window === 'undefined') return null;
    const v = Number(localStorage.getItem(DAY_SHEET_H_KEY));
    return v > 0 ? v : null;
  });
  const [sheetPx, setSheetPx] = useState(420); // measured sheet height -> map bottom pad
  const [sheetDragging, setSheetDragging] = useState(false);
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches,
  );
  const sheetRef = useRef(null);
  const sheetDragRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = (e) => setIsNarrow(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Keep the map's bottom padding in sync with the sheet's real height so the
  // whole route stays visible in the strip above it. Re-attaches when the plan
  // view mounts (the sheet only exists once a plan is open).
  useEffect(() => {
    const el = sheetRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setSheetPx(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [plan]);

  const persistSheetHeight = (h) => {
    try { localStorage.setItem(DAY_SHEET_H_KEY, String(Math.round(h))); } catch { /* private mode */ }
  };

  // Drag the grip (or the header card) to raise/lower the sheet; a plain tap
  // toggles between a small peek and (nearly) full height.
  const onSheetGripDown = (e) => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    sheetDragRef.current = { startY: e.clientY, startH: sheet.offsetHeight, moved: false };
    setSheetDragging(true);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
  };
  const onSheetGripMove = (e) => {
    if (!sheetDragRef.current) return;
    const screen = sheetRef.current?.parentElement;
    if (!screen) return;
    const dy = sheetDragRef.current.startY - e.clientY; // drag up -> taller
    if (Math.abs(dy) > 4) sheetDragRef.current.moved = true;
    const maxH = screen.clientHeight - 14;
    setSheetHeight(Math.max(120, Math.min(maxH, sheetDragRef.current.startH + dy)));
  };
  const onSheetGripUp = (e) => {
    const st = sheetDragRef.current;
    sheetDragRef.current = null;
    setSheetDragging(false);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* older browsers */ }
    const screen = sheetRef.current?.parentElement;
    if (!st || !screen) return;
    if (st.moved) {
      persistSheetHeight(sheetRef.current.offsetHeight);
    } else {
      // Tap: toggle peek <-> expanded around the halfway mark.
      const maxH = screen.clientHeight - 14;
      const next = sheetRef.current.offsetHeight > screen.clientHeight * 0.5 ? 150 : maxH;
      setSheetHeight(next);
      persistSheetHeight(next);
    }
  };

  // Locally-stored "plan a day for any city" plans (see dayPlanStore).
  const [standalonePlans, setStandalonePlans] = useState(() => loadStandalonePlans());

  // Account sync can rewrite plans underneath us (a pull from another
  // device); refresh the list so Saved plans matches what arrived. Local
  // writes already go through setStandalonePlans by hand.
  useEffect(() => subscribeDayPlanStore(({ remote }) => {
    if (remote) setStandalonePlans(loadStandalonePlans());
  }), []);
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
  // The landing is a guided flow, one decision per screen, so nothing is on
  // show before it is needed: stay -> when -> how, then either the manual
  // explore map or the Carta chat planner.
  const [landingStep, setLandingStep] = useState('stay');
  const [howToOpen, setHowToOpen] = useState(false);
  // "Add another city" picker inside an open standalone plan.
  const [addCityId, setAddCityId] = useState('');
  // Free-text sight search across the city's FULL catalogue, including
  // big-name places beyond walking range (Mont-Saint-Michel from Saint-Malo).
  const [poiQuery, setPoiQuery] = useState('');
  // "Save this day trip to Saved trips" feedback for trip-based plans.
  const [daySaveState, setDaySaveState] = useState('idle');
  const [saveToast, setSaveToast] = useState('');
  const [savedInfo, setSavedInfo] = useState(false);
  // Landing explore map: which pin categories are shown (towns by default so
  // the map never opens overloaded), which pin is briefed in the side panel,
  // and which sights/beaches are picked alongside the towns in `newStops`.
  const [exploreCats, setExploreCats] = useState(() => new Set(['town']));
  const [exploreFocus, setExploreFocus] = useState('');
  // On phones the explore map fills the screen, so the briefing a pin tap
  // populates sits below it, nudge it into view on selection (mobile only).
  const exploreSideRef = useRef(null);
  useEffect(() => {
    if (!exploreFocus || !exploreSideRef.current || typeof window === 'undefined') return;
    if (!window.matchMedia?.('(max-width: 700px)').matches) return;
    requestAnimationFrame(() => exploreSideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }, [exploreFocus]);
  const [selPois, setSelPois] = useState([]); // [{ key, destId, idx }]
  // When set, the explore/build screen is EDITING this existing plan (reached
  // via "Change places on the map") rather than composing a brand-new one.
  const [editingPlanId, setEditingPlanId] = useState(null);
  // Free-text search over everything on the explore map (towns, sights,
  // beaches, activities); picking a result briefs it and glides the map there.
  const [exploreQuery, setExploreQuery] = useState('');
  const [exploreFly, setExploreFly] = useState(null); // { lat, lon, k } - map glide target
  // Whether the "Let Carta guide you" question -> recommendations panel is
  // open. Closed by default: the map is the standard view, and the guide only
  // opens when its button on the side rail is tapped.
  const [guideOpen, setGuideOpen] = useState(false);

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
    // A rejected fetch (offline, or a session whose token no longer verifies)
    // must not escape as an unhandled rejection: the trip-based plans simply
    // stay absent, and standalone day plans carry on working from this device.
    fetchTripPlans(user.id)
      .then(setSavedPlans)
      .catch(() => setSavedPlans([]))
      .finally(() => setPlansLoading(false));
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
  // handoff ({ planId|null, stopIndex, dayIndex }), null planId means the
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

  // The traveller's own places for a destination (typed into the search, or
  // taken from an imported document), stored per plan in prefs.customPois so
  // they ride the same save/sync rails as everything else in the plan. They
  // merge APPENDED to the catalogue, so a custom place is an ordinary item
  // everywhere downstream: assignments index it, the schedule times it, the
  // map pins it, the PDF prints it. Append-only per destination: removing or
  // reordering entries would shift the indices saved assignments point at.
  const customPoisFor = (destId) => (prefs?.customPois?.[destId] || [])
    .map((c) => ({ ...c, custom: true }));

  const itemsForStop = (s, fullMap = actFull) => {
    const a = s?.dest?.activities;
    if (!a) return { items: [], walkable: new Set(), suppressed: new Set(), canon: new Map(), limited: true };
    const customs = customPoisFor(s.destination_id);
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
      const merged = customs.length ? [...full, ...customs] : full;
      const { suppressed, canon } = canonicalPoiIndices(merged);
      const walkable = walkableIdxSet(merged, s.dest);
      suppressed.forEach((i) => walkable.delete(i));
      return { items: merged, walkable, suppressed, canon, limited: false };
    }
    const items = [
      ...(a.items || []).map((it) => ({ ...it, lat: null, lon: null })),
      ...customs,
    ];
    const { suppressed, canon } = canonicalPoiIndices(items);
    const walkable = new Set(items.map((_, i) => i).filter((i) => !suppressed.has(i)));
    return { items, walkable, suppressed, canon, limited: true };
  };

  const activities = useMemo(() => itemsForStop(stop), [stop, actFull, prefs?.customPois]); // eslint-disable-line react-hooks/exhaustive-deps

  // Saved plans can predate a dedupe improvement, so a day may already hold
  // BOTH copies of a place ("Parafia ..." next to "Kosciol pw. ..."). Repair
  // the stored assignments in place: remap every duplicate index to its
  // surviving twin and drop the repeats within each day. Only runs against
  // the full coordinate-bearing list (the one assignments were made against);
  // the repaired plan is persisted, so this is a one-time migration per plan.
  // Guard so this genuinely runs once per plan. itemsForStop() runs the O(n^2)
  // canonical-POI dedupe, and this effect calls it for every stop; without the
  // guard it re-ran that whole pass on every add/remove/reorder (each edit
  // changes `assignments`, a dependency). We only mark a plan repaired once the
  // full coordinate list (actFull) was actually available for the pass.
  const repairedRef = useRef(new Set());
  useEffect(() => {
    const pid = plan?.id ?? '__draft__';
    if (!stops.length || !Object.keys(assignments).length) return;
    if (repairedRef.current.has(pid)) return;
    let changed = false;
    let hadFull = false;
    const next = {};
    Object.entries(assignments).forEach(([si, days]) => {
      const s = stops[Number(si)];
      const info = s ? itemsForStop(s) : null;
      if (!info || info.limited || !info.canon.size) { next[si] = days; return; }
      hadFull = true;
      const nd = {};
      Object.entries(days || {}).forEach(([di, idxs]) => {
        const seen = new Set();
        const mapped = [];
        (idxs || []).forEach((i) => {
          const c = info.canon.get(i) ?? i;
          if (seen.has(c)) { changed = true; return; }
          if (c !== i) changed = true;
          seen.add(c);
          mapped.push(c);
        });
        nd[di] = mapped;
      });
      next[si] = nd;
    });
    if (changed) {
      setAssignments(next);
      persistAssignments(plan?.id, next);
    }
    // Only consider the plan migrated once the real (coordinate-bearing) list
    // was loaded; before actFull arrives the pass can't dedupe anything.
    if (hadFull) repairedRef.current.add(pid);
  }, [assignments, stops, actFull, plan?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Must-see / recommended / more / active tiers for the current stop's list.
  const tiers = useMemo(() => tieredActivities(activities.items, activities.walkable), [activities]);

  // ---- The big map's pickable pins ----
  // Every genuinely worthwhile place in town sits on the day map from the
  // start, as a tappable pin: one tap adds it to the selected day (the pin
  // then becomes a numbered stop of the route). Filterable by category so a
  // busy city never turns into a wall of pins.
  const [mapCat, setMapCat] = useState('all');
  // Second filter axis: minimum rating ('all' | 'top' | 'must'), so a busy
  // city can be cut down to only its strongest places in one tap.
  const [mapRating, setMapRating] = useState('all');
  // "Show selected": the map shows ONLY what's already picked, today's stops
  // as the numbered route plus the city's other days as check-marked pins.
  // This is a VIEW STATE, not a filter over the catalogue, so it lives in its
  // own control layer rather than among the quality filters.
  const [showSel, setShowSel] = useState(false);
  // The quality filter is a collapsible group: kind-of-place is what people
  // reach for constantly, how-good-is-it is an occasional narrowing, so only
  // one of the two costs permanent space over the map.
  const [qualityOpen, setQualityOpen] = useState(false);
  // Where the map is looking right now ({ zoom, bounds }), fed back by
  // TripMap so zooming in can reveal more of the catalogue.
  const [mapView, setMapView] = useState(null);
  useEffect(() => {
    setMapCat('all'); setMapRating('all'); setShowSel(false); setQualityOpen(false);
  }, [stopIdx, plan?.id]);

  // Places already laid into ANY day of this city: their pins are hidden, so
  // a place can't be double-added across days from the map.
  const assignedAnyDay = useMemo(() => {
    const used = new Set();
    Object.values(assignments[stopIdx] || {}).forEach((lst) => (lst || []).forEach((i) => used.add(i)));
    return used;
  }, [assignments, stopIdx]);

  // Places already on the city's OTHER days: the route picker excludes them
  // from a single-day route so no place lands twice in the same stay.
  const usedOtherDays = useMemo(() => {
    const used = new Set();
    Object.entries(assignments[stopIdx] || {}).forEach(([di, lst]) => {
      if (Number(di) !== dayIdx) (lst || []).forEach((i) => used.add(i));
    });
    return used;
  }, [assignments, stopIdx, dayIdx]);

  const mapDeck = useMemo(
    () => (stop?.dest
      ? pickerDeck(activities.items, [], 48, activities.walkable)
        .filter(({ idx }) => !assignedAnyDay.has(idx))
      : []),
    [activities, stop, assignedAnyDay],
  );

  // Zoomed in, the map behaves like Google Maps: beyond the always-on top
  // deck, every catalogued place inside the current viewport surfaces as a
  // pin, so a dense neighbourhood reveals its depth as you lean in, and the
  // wider city (not just the 48 strongest places) stays explorable.
  const ZOOM_REVEAL = 12.8;
  const zoomDeck = useMemo(() => {
    if (!stop?.dest || !mapView || mapView.zoom < ZOOM_REVEAL || !mapView.bounds) return [];
    const [w, s, e, n] = mapView.bounds;
    const inDeck = new Set(mapDeck.map((d) => d.idx));
    const out = [];
    activities.items.forEach((item, idx) => {
      if (inDeck.has(idx) || assignedAnyDay.has(idx) || activities.suppressed.has(idx)) return;
      if (item.lat == null || item.lon == null) return;
      if (item.lat < s || item.lat > n || item.lon < w || item.lon > e) return;
      if (isTransportInfraPoi(item) || isCommercialNoisePoi(item)) return;
      out.push({ item, idx });
    });
    out.sort((a, b) => poiScore(b.item) - poiScore(a.item));
    return out.slice(0, 220);
  }, [stop, mapView, mapDeck, activities, assignedAnyDay]);

  const visibleDeck = useMemo(() => [...mapDeck, ...zoomDeck], [mapDeck, zoomDeck]);

  const passRating = (item) => mapRating === 'all'
    || (mapRating === 'must' ? isMustSee(item) : poiRating(item).tier >= 2);

  const mapCatCounts = useMemo(() => {
    const c = { all: visibleDeck.length, sight: 0, nature: 0, active: 0, food: 0, top: 0, must: 0 };
    visibleDeck.forEach(({ item }) => {
      c[poiCategory(item)] += 1;
      if (isMustSee(item)) c.must += 1;
      if (poiRating(item).tier >= 2) c.top += 1;
    });
    return c;
  }, [visibleDeck]);

  const mapPois = useMemo(() => {
    // "Show selected": today's picks are already the numbered route, so the
    // pins are the city's OTHER days' picks, check-marked, not addable twice.
    if (showSel) {
      const today = new Set(assignments[stopIdx]?.[dayIdx] || []);
      return [...assignedAnyDay]
        .filter((idx) => !today.has(idx))
        .map((idx) => ({ item: activities.items[idx], idx }))
        .filter(({ item }) => item && item.lat != null && item.lon != null)
        .map(({ item, idx }) => ({
          id: String(idx),
          label: item.name,
          lat: item.lat,
          lon: item.lon,
          cat: poiMapCat(item),
          must: isMustSee(item),
          sel: true,
        }));
    }
    return visibleDeck
      .filter(({ item }) => mapCat === 'all' || poiCategory(item) === mapCat)
      .filter(({ item }) => passRating(item))
      .map(({ item, idx }) => ({
        id: String(idx),
        label: item.name,
        lat: item.lat,
        lon: item.lon,
        cat: poiMapCat(item),
        must: isMustSee(item),
      }));
  }, [visibleDeck, mapCat, mapRating, showSel, assignedAnyDay, assignments, stopIdx, dayIdx, activities]); // eslint-disable-line react-hooks/exhaustive-deps

  // Outstanding sights BEYOND walking range, their own excursion, but too
  // good not to mention (importance + beauty outweigh the distance).
  const farSights = useMemo(
    () => (stop?.dest
      ? farWorthySights(activities.items, stop.dest).filter((e) => !activities.suppressed.has(e.idx))
      : []),
    [activities, stop],
  );

  // Name/kind search over the full catalogue, strongest matches first, with
  // an honest distance note on anything beyond walking range. Diacritic-folded
  // so "etoile" finds "Maison de l'Étoile".
  const poiSearch = useMemo(() => {
    const q = searchFold(poiQuery);
    if (q.length < 2 || !stop?.dest) return [];
    const centre = cityCoords(stop.dest);
    return activities.items
      .map((item, idx) => ({ item, idx }))
      .filter(({ idx }) => !activities.suppressed.has(idx))
      .filter(({ item }) => !isTransportInfraPoi(item))
      .filter(({ item }) => searchFold(item.name).includes(q)
        || searchFold(item.kind).includes(q))
      .sort((a, b) => poiScore(b.item) - poiScore(a.item))
      .slice(0, 12)
      .map((e) => {
        const km = (e.item.lat != null && centre.lat != null)
          ? haversineKm(centre.lat, centre.lon, e.item.lat, e.item.lon)
          : null;
        return {
          ...e,
          note: km != null && km > MAX_POI_KM_FROM_CITY
            ? t('day.kmFromTrip', { km: Math.round(km), city: stop.dest.city })
            : null,
        };
      });
  }, [poiQuery, activities, stop, t]);

  // Carta's own deterministic draft for THIS city, never the whole plan. It
  // is the fallback behind the AI planner: same answers, no network, no
  // quota, so the planner button always ends in a planned day. scope 'day'
  // drafts only the selected day (places already laid into the city's other
  // days stay put and are never duplicated); scope 'stay' drafts every day
  // of the current city.
  const applyDraft = async (p) => {
    const fullMap = actFull ?? await fetchActivitiesFull();
    if (!actFull && fullMap) setActFull(fullMap);
    const interests = new Set(p.interests || []);
    // The feasibility answers (how long out, how much walking) bound every
    // draft so nothing unrealistic gets scheduled.
    const limits = feasibilityLimits(p);
    const { items, walkable } = itemsForStop(stop, fullMap);
    const eligibleBase = p.areaIdx
      ? new Set([...walkable].filter((i) => p.areaIdx.has(i)))
      : walkable;
    const dwellFn = (kind) => dwellMinutes(kind, limits.dwellFactor);
    const next = { ...assignments };
    if (p.scope === 'stay') {
      const lists = draftDays({
        items,
        numDays: stop?.nights || 1,
        interests,
        paceKey: 'balanced',
        dwellFn,
        eligibleIdx: eligibleBase,
        ...limits,
      });
      next[stopIdx] = {};
      lists.forEach((lst, di) => { if (lst.length) next[stopIdx][di] = lst; });
    } else {
      const usedElsewhere = new Set();
      Object.entries(next[stopIdx] || {}).forEach(([di, lst]) => {
        if (Number(di) !== dayIdx) (lst || []).forEach((i) => usedElsewhere.add(i));
      });
      const eligible = new Set([...eligibleBase].filter((i) => !usedElsewhere.has(i)));
      const lists = draftDays({
        items,
        numDays: 1,
        interests,
        paceKey: 'balanced',
        dwellFn,
        eligibleIdx: eligible,
        ...limits,
      });
      next[stopIdx] = { ...(next[stopIdx] || {}), [dayIdx]: lists[0] || [] };
    }
    setAssignments(next);
    persistAssignments(plan?.id, next);
    const savedPrefs = {
      style: p.style, interests: p.interests, dayLen: p.dayLen, walk: p.walk,
      fill: p.fill, visit: p.visit, areaKey: p.areaKey,
      routeMode, tripModes: prefs?.tripModes,
      dayWalks: prefs?.dayWalks, dayWalkLen: prefs?.dayWalkLen,
      aiPlans: prunedAiPlans(p.scope),
    };
    setPrefs(savedPrefs);
    persistPrefs(plan?.id, savedPrefs);
  };

  /* ---- Ready-made day: the published citytrip for this city ---- */

  useEffect(() => {
    let live = true;
    setCitytrip(null);
    const dest = stop?.dest;
    if (dest?.iso2 && dest?.id) {
      findCitytrip(dest.iso2, dest.id).then((ct) => { if (live) setCitytrip(ct); });
    }
    return () => { live = false; };
  }, [stop?.dest?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lay the citytrip's stops into the selected day, in their composed
  // walking order. Same assignment shape as a hand-built or drafted day, so
  // everything downstream (route, clock, exports) just works. Stops whose
  // catalogue POI no longer resolves are skipped, never invented.
  const applyCitytrip = async () => {
    if (!citytrip || !stop?.dest) return;
    const fullMap = actFull ?? await fetchActivitiesFull();
    if (!actFull && fullMap) setActFull(fullMap);
    const detail = await loadTrail(citytrip.id);
    if (!detail) return;
    const { items } = itemsForStop(stop, fullMap);
    const { indices } = resolveCitytripStops(detail, items, stop.dest.id);
    if (!indices.length) return;
    const next = {
      ...assignments,
      [stopIdx]: { ...(assignments[stopIdx] || {}), [dayIdx]: indices },
    };
    setAssignments(next);
    persistAssignments(plan?.id, next);
  };

  /* ---- AI day planner (plan-day Edge Function) ---- */

  const aiKey = `${stopIdx}:${dayIdx}`;
  const aiPlan = prefs?.aiPlans?.[aiKey] || null;

  // A redraft invalidates the AI schedule it replaces: drop this day's entry
  // (or every entry of this city when the whole stay was redrafted).
  function prunedAiPlans(scope) {
    const m = { ...(prefs?.aiPlans || {}) };
    Object.keys(m).forEach((k) => {
      if (scope === 'stay' ? k.startsWith(`${stopIdx}:`) : k === aiKey) delete m[k];
    });
    return m;
  }

  const runAi = async (answers) => {
    const style = DAY_STYLES.find((s) => s.key === answers.vibe) || DAY_STYLES[4];
    if (!stop?.dest) return { ok: false, code: 'too_few' };
    // Remember the traveller's own date/party answers so the next day of the
    // trip opens with them already filled in.
    const remembered = {
      ...(prefs || {}),
      aiDate: answers.date || null,
      aiGroupSize: answers.groupSize || null,
    };
    setPrefs(remembered);
    persistPrefs(plan?.id, remembered);
    // Coordinates live in the lazily fetched full list, so wait for it the way
    // the built-in draft does. Asking the bot in the first seconds after a plan
    // opens used to read the placeholder list and answer "not enough
    // catalogued places here", which is a wrong sentence about a full city.
    const fullMap = actFull ?? await fetchActivitiesFull();
    if (!actFull && fullMap) setActFull(fullMap);
    const { items, walkable } = itemsForStop(stop, fullMap);
    // The AI only ever sequences OUR researched candidates: same quality bar
    // as the map's pins, minus what the city's other days already claimed.
    const candidates = buildAiCandidates({
      items,
      walkable,
      excludeIdx: usedOtherDays,
      interests: style.interests,
    });
    if (candidates.length < 3) return { ok: false, code: 'too_few' };
    const centre = cityCoords(stop.dest);
    const res = await requestAiDayPlan({
      dest: {
        id: stop.destination_id,
        city: stop.dest.city,
        country: stop.dest.country,
        lat: centre.lat,
        lon: centre.lon,
      },
      date: answers.date || days[dayIdx] || null,
      groupSize: answers.groupSize || aiGroupSize(),
      pace: answers.pace,
      vibe: answers.vibe,
      avoidHills: answers.avoidHills,
      freeText: answers.freeText,
      wantEvents: !!answers.wantEvents,
      refine: answers.refine || '',
      prevStops: answers.prevStops || [],
      lang,
      stay: stayAnchor ? { lat: stayAnchor.lat, lon: stayAnchor.lon } : null,
      candidates,
    });
    // The bot answers with names and reasons; the photos are already here.
    return res.ok ? { ...res, plan: decorateAiStops(res.plan, items) } : res;
  };

  // Group size only exists on the trip planner's draft; standalone day plans
  // default to a couple, which just means standard walking speed.
  const aiGroupSize = () => {
    if (plan?.id === TRIP_DRAFT_PLAN_ID) {
      const g = Number(loadTripDraft()?.groupSize);
      if (Number.isFinite(g) && g >= 1) return Math.min(20, Math.round(g));
    }
    return 2;
  };

  // "Put it on the map": catalogue stops become the day's assignments in the
  // AI's optimized order (numbered pins + OSRM walking route redraw on their
  // own), discoveries become spark pins, and the schedule card is kept in
  // prefs. Route mode flips to manual so the AI's deliberate chronology
  // (indoor stops in the hot hours) is not instantly reshuffled.
  const applyAiResult = (result) => {
    const { orderedIdx } = splitAiPlan(result, activities.items);
    if (orderedIdx.length) {
      const next = {
        ...assignments,
        [stopIdx]: { ...(assignments[stopIdx] || {}), [dayIdx]: orderedIdx },
      };
      setAssignments(next);
      persistAssignments(plan?.id, next);
    }
    setRouteMode('manual');
    const saved = {
      ...(prefs || {}),
      routeMode: 'manual',
      aiPlans: {
        ...(prefs?.aiPlans || {}),
        [aiKey]: {
          summary: result.summary || '',
          stops: result.stops || [],
          totals: result.totals || null,
          meta: result.meta || null,
          appliedAt: Date.now(),
        },
      },
    };
    setPrefs(saved);
    persistPrefs(plan?.id, saved);
    setAiOpen(false);
  };

  const dismissAi = () => {
    const saved = { ...(prefs || {}), aiPlans: prunedAiPlans('day') };
    setPrefs(saved);
    persistPrefs(plan?.id, saved);
  };

  // Every AI failure path lands here: the deterministic built-in draft, fed
  // with the same answers, so the button always ends in a planned day.
  const fallbackAi = (answers) => {
    setAiOpen(false);
    const style = DAY_STYLES.find((s) => s.key === answers.vibe) || DAY_STYLES[4];
    applyDraft({
      scope: 'day',
      style: style.key,
      interests: style.interests,
      dayLen: 'full',
      walk: answers.avoidHills ? 'light' : 'moderate',
      fill: answers.pace === 'relaxed' ? 'light' : answers.pace === 'packed' ? 'packed' : 'balanced',
      visit: answers.pace === 'relaxed' ? 'deep' : answers.pace === 'packed' ? 'quick' : 'standard',
      areaKey: 'all',
      areaIdx: null,
    });
  };

  // The AI's out-of-catalogue discoveries for the selected day get their own
  // spark pins on the map. Status pins, not controls: there is no catalogue
  // entry behind them to add to the plan.
  const aiDiscoveryPins = useMemo(() => (
    (aiPlan?.stops || [])
      .filter((s) => s.external && Number.isFinite(s.lat) && Number.isFinite(s.lon))
      .map((s, i) => ({
        id: `ai:${i}`,
        label: s.name,
        lat: s.lat,
        lon: s.lon,
        cat: 'sight',
        discovery: true,
        event: !!s.isEvent,
      }))
  ), [aiPlan]);

  // The AI's one-line reason per catalogue stop, keyed by the same item index
  // the day's assignments speak. The bot's schedule is NOT a second list any
  // more: importing a plan lays its stops into the one timeline, and this is
  // how each row keeps the sentence that explained why it is there.
  const aiWhyByIdx = useMemo(() => {
    const m = {};
    (aiPlan?.stops || []).forEach((s) => {
      if (s.external || !s.why) return;
      const idx = Number(s.id);
      if (Number.isInteger(idx)) m[idx] = s.why;
    });
    return m;
  }, [aiPlan]);

  // Discoveries live outside the catalogue, so they can never become timeline
  // rows. They stay listed once, under the plan, next to their map pins.
  const aiDiscoveries = useMemo(
    () => (aiPlan?.stops || []).filter((s) => s.external && s.name),
    [aiPlan],
  );

  // Plans imported before the server learned to hold a walking budget carry
  // totals like "89.4 km on foot, done around 11:32" (the clock used to wrap
  // at midnight, so an impossible day read as a pleasant morning). They are
  // saved on the device and would keep saying it forever, so a total no one
  // could walk means the line is not shown at all. The day itself, its stops
  // and its own timeline totals, is unaffected.
  const aiTotalsTrustworthy = (aiPlan?.totals?.walkKm ?? 0) <= AI_MAX_TRUSTED_WALK_KM;

  const dayAssignedIdx = assignments[stopIdx]?.[dayIdx] || [];
  const assignedItems = dayAssignedIdx.map((i) => activities.items[i]).filter(Boolean);

  // Curated "where it's actually nicest" guide for this city (localIntel.js),
  // each named place resolved against the catalogue so it's one-tap addable.
  const intel = useMemo(() => {
    const g = localIntelFor(stop?.dest?.city || '');
    if (!g) return null;
    const areas = g.areas.map((a) => {
      const q = (a.match || a.name).toLowerCase();
      const idx = activities.items.findIndex((it, i) => !activities.suppressed.has(i)
        && (it.name || '').toLowerCase().includes(q));
      return { ...a, idx: idx >= 0 ? idx : null, item: idx >= 0 ? activities.items[idx] : null };
    });
    return { ...g, areas };
  }, [stop, activities]);

  // The stay address, entered ONCE (landing screen or in-plan), anchors the
  // whole day when it's actually in/near this city: the walking route starts
  // at the traveller's door, Carta orders stops from there, and the Google
  // Maps handoff includes it, it never has to be typed again.
  const stayAnchor = useMemo(() => {
    const p = plan?.stayPoint;
    if (!p || p.lat == null || p.lon == null || !stop?.dest) return null;
    const c = cityCoords(stop.dest);
    if (c.lat == null) return null;
    const km = haversineKm(p.lat, p.lon, c.lat, c.lon);
    return km != null && km <= 12 ? p : null;
  }, [plan, stop]);

  // ---- Day-trip transport: stay -> this city, ONE source of truth ----
  // The "Getting there" card, the timeline's first leg and the Google Maps
  // handoff all speak the same chosen mode, so "car is your best bet" never
  // sits above a three-hour "walk from your stay".
  const dayTripFrom = useMemo(() => {
    if (!plan?.standalone || !stop) return null;
    // Both ends are measured to the CITY centre, never the airport: for
    // airport-tier destinations dest.lat/lon is the runway, so a stay downtown
    // would otherwise read as a needless inter-city hop.
    return plan.stayPoint
      ? {
          city: plan.stayPoint.shortLabel || 'your stay',
          // The real address geocodes in Google Maps; '' forces the lat,lon
          // fallback rather than letting "your stay, Italy" become a query.
          gmapsName: plan.stayPoint.label || plan.stayPoint.shortLabel || '',
          lat: plan.stayPoint.lat,
          lon: plan.stayPoint.lon,
          country: stop.dest?.country,
        }
      : withCityCoords(destinations[plan.stayCityId] || null);
  }, [plan, stop, destinations]);

  const dayTrip = useMemo(() => {
    if (!dayTripFrom || dayTripFrom.lat == null || !stop?.dest) return null;
    const toDest = withCityCoords(stop.dest);
    if (!toDest || toDest.lat == null) return null;
    const kmAway = haversineKm(dayTripFrom.lat, dayTripFrom.lon, toDest.lat, toDest.lon);
    if (dayTripFrom.city === toDest.city || (kmAway != null && kmAway < 8)) {
      return { local: true, toDest };
    }
    const opts = legTransportOptions(dayTripFrom, toDest, 1, {
      carModel: data?.meta?.car_model || null,
      countryInsights,
    });
    return opts ? { ...opts, toDest } : null;
  }, [dayTripFrom, stop, data, countryInsights]);

  // Real road km + driving minutes from OSRM for the stay -> city leg. The
  // flat straight-line*1.3 model calls a 50-minute lakeside drive "24 min";
  // the actual routed road fixes both the distance and every mode's time.
  const [dayRoad, setDayRoad] = useState(null); // { key, km, min }
  const dayRoadKey = (dayTrip && !dayTrip.local && dayTrip.modes && dayTripFrom)
    ? `${dayTripFrom.lat.toFixed(4)},${dayTripFrom.lon.toFixed(4)}>${dayTrip.toDest.lat.toFixed(4)},${dayTrip.toDest.lon.toFixed(4)}`
    : null;
  useEffect(() => {
    if (!dayRoadKey) { setDayRoad(null); return; }
    let alive = true;
    fetchDrivingRoute([dayTripFrom, dayTrip.toDest]).then((r) => {
      if (alive && r) setDayRoad({ key: dayRoadKey, km: r.km, min: r.min });
    });
    return () => { alive = false; };
  }, [dayRoadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ride time per mode from a routed road leg: cars near the routed time
  // plus a dynamic parking padding, buses the same road with stops and a
  // wait, trains their own (rail-speed) model. Shared by the card and the
  // timeline's ride leg.
  const rideMinutes = (mode, roadKm, drivingMin) => {
    if (mode === 'car') {
      // Raw routed minutes lie: nobody teleports from the wheel to the sight.
      // Pad with 15% of the drive (floor 5, cap 20) for parking, paying and
      // walking in, so a 60-minute drive honestly reads as ~69.
      const parkPad = Math.min(20, Math.max(5, Math.round(drivingMin * 0.15)));
      return Math.max(5, Math.round(drivingMin + parkPad));
    }
    if (mode === 'bus') return Math.max(10, Math.round(drivingMin * 1.55 + 12));
    return Math.max(10, Math.round((roadKm / (roadKm < 60 ? 68 : 95)) * 60 + 15));
  };

  // What the card and timeline actually speak: the engine's estimate, refined
  // with the real routed road and filtered down to modes that exist where the
  // traveller is going (thin local transit = no train to offer).
  const dayTripView = useMemo(() => {
    if (!dayTrip || dayTrip.local || !dayTrip.modes) return dayTrip;
    const v = { ...dayTrip, modes: { ...dayTrip.modes } };
    const road = dayRoad && dayRoad.key === dayRoadKey ? dayRoad : null;
    const r2 = (x) => Math.round(x * 100) / 100;
    if (road) {
      const ratio = dayTrip.road_km > 0 ? road.km / dayTrip.road_km : 1;
      v.road_km = Math.round(road.km);
      v.real_road = true;
      v.modes.car = {
        ...v.modes.car,
        hours: r2(rideMinutes('car', road.km, road.min) / 60),
        eur_pp: r2((v.modes.car.eur_pp ?? 0) * ratio),
        eur_total: r2((v.modes.car.eur_total ?? 0) * ratio),
      };
      v.modes.bus = {
        ...v.modes.bus,
        hours: r2(rideMinutes('bus', road.km, road.min) / 60),
        eur_pp: r2(Math.max(5, 0.075 * road.km)),
      };
      if (v.modes.train) {
        v.modes.train = {
          ...v.modes.train,
          hours: r2(rideMinutes('train', road.km, road.min) / 60),
          eur_pp: r2(Math.max(8, 0.15 * road.km)),
        };
      }
    }
    // Only offer what's actually there: the pipeline's per-destination
    // transit_quality knows Lake Como's shore has no rail line.
    const lt = stop?.dest?.local_transport;
    if (lt?.transit_quality === 'poor') {
      delete v.modes.train;
      v.train_dropped = true;
    }
    if (lt?.reason && (lt.transit_quality === 'poor' || lt.transit_quality === 'limited')) {
      v.transit_reason = lt.reason;
    }
    // Re-pick the recommendation from the refined times and surviving modes.
    const score = (m) => (m.eur_pp ?? 99) + (m.hours ?? 9) * 3;
    v.recommended = Object.entries(v.modes).sort((a, b) => score(a[1]) - score(b[1]))[0][0];
    return v;
  }, [dayTrip, dayRoad, dayRoadKey, stop]);

  // The traveller's chosen way there (persisted per city); Carta's
  // recommendation until they tap a different mode in the compare panel.
  const tripMode = useMemo(() => {
    const saved = prefs?.tripModes?.[stopIdx];
    if (saved && dayTripView?.modes?.[saved]) return saved;
    return dayTripView?.recommended || null;
  }, [prefs, stopIdx, dayTripView]);

  const setTripMode = (m) => {
    const savedPrefs = { ...(prefs || {}), tripModes: { ...(prefs?.tripModes || {}), [stopIdx]: m } };
    setPrefs(savedPrefs);
    persistPrefs(plan?.id, savedPrefs);
  };

  // Iconic walks the traveller pinned onto a day ("the walk itself is the
  // sight"). They aren't POIs with catalogue indices, so they live beside the
  // assignments in the plan's prefs, keyed stop -> day -> walk names, and
  // travel with the plan through the same persist/sync rails.
  const dayWalks = prefs?.dayWalks?.[stopIdx]?.[dayIdx] || [];
  const toggleWalk = (name) => {
    const cur = prefs?.dayWalks?.[stopIdx]?.[dayIdx] || [];
    const next = cur.includes(name) ? cur.filter((w) => w !== name) : [...cur, name];
    const savedPrefs = {
      ...(prefs || {}),
      dayWalks: {
        ...(prefs?.dayWalks || {}),
        [stopIdx]: { ...(prefs?.dayWalks?.[stopIdx] || {}), [dayIdx]: next },
      },
    };
    setPrefs(savedPrefs);
    persistPrefs(plan?.id, savedPrefs);
  };

  // How much of a pinned walk the traveller wants: the full route, about
  // half, or just a taste. Stored per walk beside the pins (prefs.dayWalkLen)
  // so the day plan, the km shown and the PDF all speak the chosen length.
  const WALK_LENGTHS = [
    { key: 1, label: 'Full' },
    { key: 0.5, label: 'Half' },
    { key: 0.25, label: 'Taste' },
  ];
  const walkLenOf = (name) => prefs?.dayWalkLen?.[stopIdx]?.[dayIdx]?.[name] ?? 1;
  const setWalkLen = (name, frac) => {
    const savedPrefs = {
      ...(prefs || {}),
      dayWalkLen: {
        ...(prefs?.dayWalkLen || {}),
        [stopIdx]: {
          ...(prefs?.dayWalkLen?.[stopIdx] || {}),
          [dayIdx]: { ...(prefs?.dayWalkLen?.[stopIdx]?.[dayIdx] || {}), [name]: frac },
        },
      },
    };
    setPrefs(savedPrefs);
    persistPrefs(plan?.id, savedPrefs);
  };
  const walkKmFor = (w, name) => Math.max(0.3, Math.round(w.km * walkLenOf(name) * 10) / 10);

  // The pinned walks as plan rows (shown under today's route, whether or not
  // the day has POI stops yet). Rendered from the walk catalogue so the km
  // and the note stay with the name.
  const pinnedWalksBlock = stop && dayWalks.length > 0 ? (
    <div className="day-plan-walks">
      <div className="day-scenic-title"><MountainIcon size={11} /> Today's walk</div>
      {dayWalks.map((name) => {
        const w = scenicWalksFor(stop.dest?.city || '').find((x) => x.name === name);
        const frac = walkLenOf(name);
        return (
          <div key={name} className="day-plan-walk">
            <span className="day-plan-walk-text">
              <b>{name}</b>
              {w && <small>~{walkKmFor(w, name)} km{frac < 1 ? ` of ${w.km} km` : ''}. {w.note}</small>}
              {w && (
                <span className="day-walk-len" role="group" aria-label="How long should this walk be?">
                  {WALK_LENGTHS.map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      className={`day-walk-len-btn ${frac === o.key ? 'on' : ''}`}
                      onClick={() => setWalkLen(name, o.key)}
                      aria-pressed={frac === o.key}
                      title={`Walk ${o.label.toLowerCase() === 'full' ? 'the whole route' : o.key === 0.5 ? 'about half of it' : 'a short taste of it'} (~${Math.max(0.3, Math.round(w.km * o.key * 10) / 10)} km)`}
                    >{o.label}</button>
                  ))}
                </span>
              )}
            </span>
            <button
              className="trip-stop-remove"
              onClick={() => toggleWalk(name)}
              aria-label="Remove this walk from today"
              title="Remove"
            >×</button>
          </div>
        );
      })}
    </div>
  ) : null;

  // "How long at each stop" answer scales the visit-time estimates shown on
  // the timeline and in the day total.
  const visitFactor = (VISIT_PACES.find((v) => v.key === prefs?.visit) || VISIT_PACES[1]).factor;

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

  // A place the catalogue does not know (Gaisberg, a cousin's restaurant, a
  // spot from an imported itinerary) still belongs on the day. Best effort to
  // pin it for real: one explicit Nominatim lookup scoped to the city; a hit
  // within day-trip range gives it true coordinates, anything else (miss,
  // offline, wrong-country namesake) falls back to the city centre with
  // unmapped:true, so the day keeps scheduling and the row says the location
  // is approximate. Never a thrown error, never a silently-lost place.
  const CUSTOM_POI_MAX_KM = 60;
  const [customBusy, setCustomBusy] = useState(false);
  // `dropIdeaId` folds "and take it out of the import-ideas drawer" into the
  // SAME prefs write: two sequential writes both derived from the same stale
  // `prefs` would have raced, and the loser's change would silently vanish.
  const addCustomPlace = async (rawName, { kind = 'Custom place', note = '', dropIdeaId = null } = {}) => {
    const name = (rawName || '').trim().slice(0, 90);
    if (!name || !stop?.dest || customBusy) return;
    setCustomBusy(true);
    const centre = cityCoords(stop.dest);
    let lat = null;
    let lon = null;
    try {
      const hits = await geocodeAddress(`${name}, ${stop.dest.city}`);
      const near = hits.find((h) => {
        const km = haversineKm(centre.lat, centre.lon, h.lat, h.lon);
        return km != null && km <= CUSTOM_POI_MAX_KM;
      });
      if (near) { lat = near.lat; lon = near.lon; }
    } catch { /* geocoder down: the centre fallback below carries the day */ }
    const unmapped = lat == null;
    const item = {
      id: `c${Date.now()}`,
      name,
      kind,
      desc: note || '',
      lat: unmapped ? centre.lat : lat,
      lon: unmapped ? centre.lon : lon,
      custom: true,
      ...(unmapped ? { unmapped: true } : {}),
    };
    const destKey = stop.destination_id;
    const savedPrefs = {
      ...(prefs || {}),
      customPois: {
        ...(prefs?.customPois || {}),
        [destKey]: [...(prefs?.customPois?.[destKey] || []), item],
      },
      ...(dropIdeaId ? {
        ideaInbox: {
          ...(prefs?.ideaInbox || {}),
          [destKey]: (prefs?.ideaInbox?.[destKey] || []).filter((i) => i.id !== dropIdeaId),
        },
      } : {}),
    };
    // The merged list appends customs at the end, so the new item's index is
    // simply the current length; assign it to today in the same breath.
    const newIdx = activities.items.length;
    const current = assignments[stopIdx]?.[dayIdx] || [];
    const nextAssign = {
      ...assignments,
      [stopIdx]: { ...(assignments[stopIdx] || {}), [dayIdx]: [...current, newIdx] },
    };
    setPrefs(savedPrefs);
    persistPrefs(plan?.id, savedPrefs);
    setAssignments(nextAssign);
    persistAssignments(plan?.id, nextAssign);
    setPoiQuery('');
    setCustomBusy(false);
    return item;
  };

  // ---- Import ideas: documents or a link in, one-tap custom stops out ----
  // Extracted activities wait per destination in prefs.ideaInbox (same rails,
  // same sync as everything else in the plan) until each is added to the open
  // day as a custom place, or discarded.
  const ideaList = prefs?.ideaInbox?.[stop?.destination_id] || [];
  const stageIdeas = (result) => {
    if (!stop) return { filled: 0, staged: 0 };
    const destKey = stop.destination_id;
    const fresh = toInboxItems(result.activities, {
      existingNames: [
        ...ideaList.map((i) => i.name),
        ...customPoisFor(destKey).map((c) => c.name),
      ],
    });
    if (fresh.length) {
      const saved = {
        ...(prefs || {}),
        ideaInbox: { ...(prefs?.ideaInbox || {}), [destKey]: [...ideaList, ...fresh] },
      };
      setPrefs(saved);
      persistPrefs(plan?.id, saved);
    }
    return { filled: 0, staged: fresh.length };
  };
  const discardIdea = (idea) => {
    if (!stop) return;
    const destKey = stop.destination_id;
    const saved = {
      ...(prefs || {}),
      ideaInbox: {
        ...(prefs?.ideaInbox || {}),
        [destKey]: ideaList.filter((i) => i.id !== idea.id),
      },
    };
    setPrefs(saved);
    persistPrefs(plan?.id, saved);
  };
  // What the parse-booking prompt matches against: the one open city.
  const dayImportContext = stop?.dest ? {
    stops: [{
      city: stop.dest.city,
      country: stop.dest.country || '',
      arrive: '',
      nights: 1,
    }],
    groupSize: prefs?.aiGroupSize || 2,
  } : null;

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

  // `no` is the stop's number in TODAY'S timeline, carried onto the map so the
  // two can never disagree: a stop the map cannot plot (a catalogue entry with
  // no coordinates) leaves a gap in the pins rather than renumbering every stop
  // after it.
  const mapPins = assignedItems
    .map((it, i) => ({ it, no: i + 1 }))
    .filter(({ it }) => it.lat != null && it.lon != null)
    // The Google Maps route link is built from the coordinates only; the name
    // is for on-map labels and never geocoded.
    .map(({ it, no }) => ({
      lat: it.lat, lon: it.lon, city: it.name, no,
      name: [it.name, stop?.dest?.city].filter(Boolean).join(', '),
    }));

  // Door -> first sight distance decides how the day STARTS: on foot when the
  // first stop is genuinely walkable from the stay, otherwise as a ride in the
  // chosen day-trip mode. Nobody walks three hours to their first sight.
  const STAY_WALK_MAX_KM = 2.5;
  const stayGapKm = (() => {
    if (!stayAnchor || !assignedItems.length) return null;
    const first = assignedItems[0];
    if (first.lat == null || first.lon == null) return null;
    return haversineKm(stayAnchor.lat, stayAnchor.lon, first.lat, first.lon);
  })();
  const stayLegRide = stayGapKm != null && stayGapKm > STAY_WALK_MAX_KM;

  // Real routed road for the door -> first sight ride (distance + minutes).
  const [stayRideRoad, setStayRideRoad] = useState(null); // { key, km, min }
  const stayRideKey = (stayLegRide && assignedItems[0]?.lat != null)
    ? `${stayAnchor.lat.toFixed(4)},${stayAnchor.lon.toFixed(4)}>${assignedItems[0].lat.toFixed(4)},${assignedItems[0].lon.toFixed(4)}`
    : null;
  useEffect(() => {
    if (!stayRideKey) { setStayRideRoad(null); return; }
    let alive = true;
    fetchDrivingRoute([stayAnchor, assignedItems[0]]).then((r) => {
      if (alive && r) setStayRideRoad({ key: stayRideKey, km: r.km, min: r.min });
    });
    return () => { alive = false; };
  }, [stayRideKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // The map always shows the stay pin; the WALKING route only starts there
  // when the door-to-first-sight leg is actually a walk.
  const routePins = stayAnchor
    ? [{
        lat: stayAnchor.lat, lon: stayAnchor.lon, city: t('day.yourStay'), stay: true,
        name: stayAnchor.label || stayAnchor.shortLabel || '',
      }, ...mapPins]
    : mapPins;
  const walkPins = stayAnchor && !stayLegRide ? routePins : mapPins;

  // Real street-following walking route + per-leg distance/time from OSRM.
  const routeKey = walkPins.map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`).join(';');
  const [route, setRouteGeom] = useState(null); // { key, geometry, legs, km, min }
  useEffect(() => {
    if (walkPins.length < 2) { setRouteGeom(null); return; }
    let alive = true;
    fetchWalkingRoute(walkPins).then((r) => { if (alive && r) setRouteGeom({ key: routeKey, ...r }); });
    return () => { alive = false; };
  }, [routeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const routeOk = route && route.key === routeKey;

  // Per-segment legs align to assignedItems only when every stop has
  // coordinates; with a walkable stay anchor, leg 0 is door -> first sight.
  const stayLegOffset = stayAnchor && !stayLegRide ? 1 : 0;
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

  // Door -> first sight leg, shown at the top of the timeline. Beyond walking
  // range it becomes a ride in the traveller's chosen day-trip mode, with its
  // own directions link, never a fantasy three-hour walk. Distance and
  // minutes come from the real routed road when OSRM has answered.
  const stayLeg = (() => {
    if (!stayAnchor || !assignedItems.length) return null;
    if (stayLegRide) {
      const first = assignedItems[0];
      const mode = dayTripView?.modes?.[tripMode] ? tripMode : 'car';
      const road = stayRideRoad && stayRideRoad.key === stayRideKey ? stayRideRoad : null;
      const roadKm = road ? road.km : stayGapKm * 1.3;
      const drivingMin = road ? road.min : (roadKm / 50) * 60;
      return {
        ride: true,
        mode,
        real: !!road,
        km: roadKm,
        min: rideMinutes(mode, roadKm, drivingMin),
        dirUrl: googleMapsDirUrl(
          [
            { ...stayAnchor, name: stayAnchor.label || stayAnchor.shortLabel || '' },
            { lat: first.lat, lon: first.lon, name: [first.name, stop?.dest?.city].filter(Boolean).join(', ') },
          ],
          mode === 'car' ? 'driving' : 'transit',
        ),
      };
    }
    if (legsAlign) return legFrom(route.legs[0]);
    const first = assignedItems[0];
    if (first.lat == null || first.lon == null) return null;
    const km = haversineKm(stayAnchor.lat, stayAnchor.lon, first.lat, first.lon);
    return km == null ? null : { km, min: estimateWalkMinutes(km), real: false };
  })();

  const gmapsUrl = googleMapsDirUrl(walkPins, 'walking');

  // Timeline row <-> map marker sync. Marker order is routePins (all of which
  // carry coordinates): the stay pin, when present, shifts every stop marker
  // by one, and mapPins carries `no` (row index + 1), so a coordinate-less
  // stop can never desync the two directions.
  const [planOpen, setPlanOpen] = useState(false);
  const [hoverRow, setHoverRow] = useState(null);
  const [flashRow, setFlashRow] = useState(null); // { idx, at }
  const rowRefs = useRef({});
  const stayPinOffset = stayAnchor ? 1 : 0;
  const markerIdxForRow = (r) => {
    const j = mapPins.findIndex((p) => p.no === r + 1);
    return j < 0 ? null : j + stayPinOffset;
  };
  const focusRow = hoverRow != null ? hoverRow : (flashRow ? flashRow.idx : null);
  const selectedMarkerIdx = focusRow != null ? markerIdxForRow(focusRow) : null;
  // A tapped pin opens the plan card if it was folded, then scrolls to and
  // flashes its row; the tiny delay lets the collapsible body mount first.
  const onMapStopClick = (i) => {
    const p = mapPins[i - stayPinOffset];
    if (!p) return;
    setPlanOpen(true);
    setFlashRow({ idx: p.no - 1, at: Date.now() });
  };
  useEffect(() => {
    if (!flashRow) return undefined;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const scrollT = window.setTimeout(() => {
      rowRefs.current[flashRow.idx]?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    }, 80);
    const clearT = window.setTimeout(() => setFlashRow(null), 1800);
    return () => { window.clearTimeout(scrollT); window.clearTimeout(clearT); };
  }, [flashRow]);

  // The export menu: one compact popover in place of a row of six buttons.
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef(null);
  useEffect(() => {
    if (!exportOpen) return undefined;
    const onDown = (e) => { if (!exportRef.current?.contains(e.target)) setExportOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setExportOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [exportOpen]);

  // The clock behind the timeline: per-kind visit estimates plus the real
  // (or estimated) legs give every stop an arrival time, slot a lunch pause
  // into the first opening past 12:30, and expose how much of the day is
  // honestly still unscheduled. Cheap (a handful of stops), so it simply
  // recomputes with the render it describes.
  const schedule = assignedItems.length
    ? buildDaySchedule({
      items: assignedItems,
      legMin: (i) => walkLeg(i)?.min ?? null,
      dwellMin: (it) => dwellMinutes(poiKind(it), visitFactor),
      stayLegMin: stayLeg?.min || 0,
    })
    : null;

  // Where each macro phase of the day starts, as a sparse array aligned to
  // assignedItems: phaseHeads[i] is the phase to announce above stop i, or
  // null when that stop just continues the phase before it. The traveller
  // reads "Afternoon", never "14:07".
  const phaseHeads = useMemo(() => {
    if (!schedule) return [];
    const out = [];
    let prev = null;
    schedule.rows.forEach((r, i) => {
      const p = dayPhase(r.arriveMin);
      out[i] = p.key === prev ? null : p;
      prev = p.key;
    });
    return out;
  }, [schedule]);

  // Open-time ideas: the strongest unpicked walkable places whose visit still
  // fits in the leftover. One tap adds them; in auto mode the walking order
  // re-optimizes like any other add.
  const gapIdeas = (schedule && schedule.freeMin >= GAP_SUGGEST_MIN)
    ? mapDeck
      .filter(({ item }) => dwellMinutes(poiKind(item), visitFactor) + 15 <= schedule.freeMin)
      .slice(0, 3)
    : [];

  // One timeline connector's label. A ferry leg (a lake/sea crossing OSRM
  // routes over) is called out as a ferry with its own icon, never presented
  // as a walk across the water. A ride leg (stay beyond walking range) wears
  // the chosen mode's icon and carries its own directions link.
  const legContent = (leg, stay = false) => {
    if (!leg) return <>↓ {t('day.walkUnknown')}</>;
    const prefix = stay ? t('day.fromYourStay') : '';
    if (leg.ride) {
      const M = MODE_META[leg.mode] || MODE_META.car;
      return (
        <>
          <M.Icon size={11} /> {prefix}{t('day.rideLeg', { min: leg.min, mode: t(M.labelKey).toLowerCase(), km: leg.km.toFixed(1) })}
          {leg.dirUrl && (
            <>
              {', '}
              <a className="day-timeline-ride-dir" href={leg.dirUrl} target="_blank" rel="noreferrer">{t('day.directions')}</a>
            </>
          )}
        </>
      );
    }
    // An honest flag on any leg that asks for more than an hour on foot: it
    // is probably a stop that belongs to another day (or a bus/taxi hop).
    const longWalk = (leg.ferry ? (leg.walkMin || 0) : leg.min) > 60;
    const longNote = longWalk
      ? <small className="day-timeline-longwalk"> {t('day.longWalkNote')}</small>
      : null;
    if (leg.ferry) {
      const walkTail = leg.walkKm >= 0.15 ? t('day.thenWalk', { min: leg.walkMin }) : '';
      return <><FerryIcon size={11} /> {prefix}{t('day.ferryLeg', { min: leg.ferryMin, tail: walkTail, km: leg.km.toFixed(1) })}{longNote}</>;
    }
    const txt = `${prefix}${leg.real ? '' : '≈'}${t('day.walkLeg', { min: leg.min, km: leg.km.toFixed(1) })}`;
    if (stay) return <><BedIcon size={11} /> {txt}{longNote}</>;
    return <>↓ {txt}{longNote}</>;
  };

  // Photogenic near-zero detours along today's walk (viewpoints, bridges,
  // squares...), the walk itself should be beautiful, not just short.
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
    setSaveToast(t('day.savedToast'));
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
  // shareable file, no libraries, no external services, and it wears the
  // app's own palette (warm paper, deep ink, one rust accent). Every place
  // gets an explanation, and each place + each day carries a Google Maps link.
  const downloadPdf = () => openDayPlanPdf({
    stop, stops, assignments, plan, days, visitFactor,
    itemsForStop, estimateWalkMinutes, fmtDur,
  });

  // The same walk as the PDF, but as a KML download: every planned day a
  // My Maps folder of pins in walking order. The toast repeats the import
  // steps because mymaps.google.com is not a path most travellers know.
  const downloadKmlFile = () => {
    const ok = openDayPlanKml({ stop, stops, assignments, plan, visitFactor, itemsForStop });
    if (ok) {
      setSaveToast(t('export.myMapsHint'));
      window.setTimeout(() => setSaveToast(''), 9000);
    }
  };

  // Every planned day as timed calendar blocks, spoken in the same clock the
  // timeline shows, so the plan lands in Google/Apple/Outlook calendars.
  const downloadIcsFile = () => {
    const ok = openDayPlanIcs({ stop, stops, assignments, plan, visitFactor, itemsForStop });
    if (ok) {
      setSaveToast(t('export.calendarHint'));
      window.setTimeout(() => setSaveToast(''), 6000);
    }
  };

  const shareDay = async () => {
    const cityName = stop?.dest?.city || t('day.myDay');
    const lines = assignedItems.map((it, i) => `${i + 1}. ${it.name}`);
    const text = [t('day.shareTextTitle', { city: cityName }), ...lines, gmapsUrl ? t('day.shareRoute', { url: gmapsUrl }) : '']
      .filter(Boolean).join('\n');
    try {
      if (navigator.share) {
        await navigator.share({ title: t('day.shareTitle', { city: cityName }), text });
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
  // and small gems alike), used by the landing multi-city picker and the
  // in-plan "add another city" picker.
  const allCityOptions = useMemo(() => Object.entries(destinations)
    .map(([id, d]) => {
      const c = cityCoords(d);
      return { value: id, label: `${d.city}, ${d.country}`, lat: c.lat, lon: c.lon };
    })
    .sort((a, b) => a.label.localeCompare(b.label)), [destinations]);

  // Snap an arbitrary point (a geocode hit, an AI web discovery) to the
  // nearest real destination, so the day planner always ends up with a
  // catalogue id it has POIs for. One rule, shared by every "anywhere"
  // entry point into the town picker.
  const resolveNearestTown = useMemo(() => (lat, lon) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    let best = null;
    let bestKm = Infinity;
    for (const [id, d] of Object.entries(destinations)) {
      const c = cityCoords(d);
      if (c.lat == null) continue;
      const km = haversineKm(lat, lon, c.lat, c.lon);
      if (km != null && km < bestKm) { bestKm = km; best = { id, dest: d }; }
    }
    if (!best || bestKm > 150) return null;
    return {
      id: best.id, dest: best.dest, label: `${best.dest.city}, ${best.dest.country}`, km: Math.round(bestKm),
    };
  }, [destinations]);

  // A town this close to what was asked for is that town under another
  // spelling, not a new place: reuse the record instead of researching a
  // duplicate ("Gent" when the catalogue says "Ghent").
  const SAME_TOWN_KM = 3;

  /**
   * "Carta doesn't have this town, go and get it." Harvests the place from
   * open data (see lib/cityResearch.js), stores it on this device and returns
   * the destination id, which from here on is an ordinary id: the wizard, the
   * map, the POI picker and saved plans all take it without knowing it was
   * researched a moment ago.
   *
   * Resolves { ok: true, id, label } or { ok: false, code }.
   */
  const researchTown = async (place, onStage = () => {}) => {
    const { name, country = '', lat = null, lon = null } = place || {};
    if (!name) return { ok: false, code: 'not_found' };

    const near = resolveNearestTown(lat, lon);
    if (near && near.km <= SAME_TOWN_KM) return { ok: true, id: near.id, label: near.label };

    // Already researched, and recently enough to still be current.
    const seen = Object.entries(discovered).find(([, d]) => {
      const c = cityCoords(d);
      const km = haversineKm(lat, lon, c.lat, c.lon);
      return d.city?.toLowerCase() === name.toLowerCase() || (km != null && km <= SAME_TOWN_KM);
    });
    if (seen && !isStale(seen[1])) {
      return { ok: true, id: seen[0], label: `${seen[1].city}, ${seen[1].country}` };
    }

    const res = await researchCity({
      name, country, lat, lon, nearest: near?.dest || null, onStage,
    });
    if (!res.ok) return res;
    saveDiscovered(res.dest);
    setDiscovered(loadDiscovered());
    return { ok: true, id: res.dest.id, label: `${res.dest.city}, ${res.dest.country}` };
  };

  // Quick-fill starting points for the stay step, so the first screen is never
  // a bare search box. Population keeps these to cities people actually stay
  // in; without it, the top of a rating sort is the best-rated hamlet in
  // Europe, which nobody is looking for.
  const POPULAR_STAY_MIN_POP = 150000;
  const popularStays = useMemo(() => {
    const rows = [];
    for (const [id, d] of Object.entries(destinations)) {
      const c = cityCoords(d);
      if (c.lat == null) continue;
      rows.push({
        id,
        dest: d,
        lat: c.lat,
        lon: c.lon,
        pop: d.geonames?.population ?? 0,
        score: d.rating?.score ?? 0,
      });
    }
    const big = rows.filter((r) => r.pop >= POPULAR_STAY_MIN_POP);
    // Multi-airport cities repeat the same centre ("Milan (Malpensa)" and
    // "(Linate)"): one chip per real city. The airport suffix is a catalogue
    // detail, never what a traveller calls the place they are staying in, so
    // the chip carries the bare city name.
    const byCity = new Map();
    for (const r of (big.length >= 6 ? big : rows)) {
      const name = (r.dest.city || '').replace(/\s*\(.*\)\s*$/, '').trim();
      const key = `${name}|${r.dest.country}`;
      const cur = byCity.get(key);
      if (!cur || r.score > cur.score) byCity.set(key, { ...r, name });
    }
    return [...byCity.values()].sort((a, b) => b.score - a.score).slice(0, 6);
  }, [destinations]);

  const pickPopularStay = (row) => {
    setStayQuery('');
    setStayResults(null);
    setNewStayPoint({
      lat: row.lat,
      lon: row.lon,
      label: `${row.name}, ${row.dest.country}`,
      shortLabel: row.name,
    });
  };

  // The same popular cities as explore-map pins, so the first step can be
  // answered on the map instead of only in the form beside it. Once a stay is
  // chosen they clear out: the map's job then is to show that one place.

  // The three dates almost every day trip actually falls on, so the date step
  // is one tap rather than a calendar hunt. "This weekend" is the coming
  // Saturday (today, when today IS Saturday).
  const quickDates = useMemo(() => {
    const today = todayISO();
    const [y, m, d] = today.split('-').map(Number);
    const toSaturday = (6 - new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 7) % 7;
    const all = [
      { key: 'today', labelKey: 'day.quickToday', iso: today },
      { key: 'tomorrow', labelKey: 'day.quickTomorrow', iso: addDays(today, 1) },
      { key: 'weekend', labelKey: 'day.quickWeekend', iso: addDays(today, toSaturday) },
    ];
    // On a Friday "tomorrow" IS the weekend, and on a Saturday so is "today":
    // two chips carrying the same date read as a bug, so the earlier, more
    // specific wording wins and the duplicate drops.
    const seen = new Set();
    return all.filter((q) => !seen.has(q.iso) && seen.add(q.iso));
  }, []);

  // ---- Landing explore map: what's around the traveller's stay ----
  // Towns within day-trip reach, and (from the full POI catalogue) beaches &
  // nature, must-see sights and active outings, each behind its own filter
  // chip so the map never opens as a wall of pins.
  const EXPLORE_TOWN_KM = 110;
  const EXPLORE_POI_KM = 60;
  // Every town this close is a realistic outing regardless of its rating, so
  // nearby ones are guaranteed a pin before the wider circle competes.
  const EXPLORE_NEAR_KM = 30;
  const EXPLORE_TOWN_CAP = 34;
  // A catalogue town this close to the stay IS the stay: the red stay pin
  // stands in for it, so we don't draw a duplicate town label on top of it.
  const STAY_TOWN_KM = 3;

  const exploreTowns = useMemo(() => {
    if (!newStayPoint || newStayPoint.lat == null) return [];
    const all = Object.entries(destinations)
      .map(([id, d]) => {
        const c = cityCoords(d);
        if (c.lat == null) return null;
        const km = haversineKm(newStayPoint.lat, newStayPoint.lon, c.lat, c.lon);
        return km != null && km <= EXPLORE_TOWN_KM ? { id, dest: d, km: Math.round(km), ...c } : null;
      })
      .filter(Boolean);
    // Multi-airport cities ("Milan (Malpensa)" / "(Linate)" / "(Bergamo)") all
    // share the same city-centre pin: keep one per base city name so the map
    // never stacks three identical Milans.
    const byBaseCity = new Map();
    for (const t of all) {
      const key = `${(t.dest.city || '').replace(/\s*\(.*\)\s*$/, '')}|${t.dest.country}`;
      const cur = byBaseCity.get(key);
      if (!cur || t.km < cur.km) byBaseCity.set(key, t);
    }
    const deduped = [...byBaseCity.values()];
    // Close-by towns first (they're the realistic day trips), each set ranked
    // by rating, then the best of the wider circle fills the remaining pins.
    const byScore = (a, b) => (b.dest.rating?.score || 0) - (a.dest.rating?.score || 0);
    const near = deduped.filter((t) => t.km <= EXPLORE_NEAR_KM).sort(byScore);
    const far = deduped.filter((t) => t.km > EXPLORE_NEAR_KM).sort(byScore);
    return [...near, ...far].slice(0, EXPLORE_TOWN_CAP);
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
        if (item.lat == null || item.lon == null || isTransportInfraPoi(item) || isCommercialNoisePoi(item)) return;
        const km = haversineKm(newStayPoint.lat, newStayPoint.lon, item.lat, item.lon);
        if (km == null || km > EXPLORE_POI_KM) return;
        // Same classifier as the in-day picker map (poiCategory), so the two
        // maps never disagree on what counts as nature. Non-must-see plain
        // sights still stay off this wide map to keep it legible.
        const cat0 = poiCategory(item);
        const cat = cat0 === 'nature' ? 'beach'
          : cat0 === 'active' ? 'active'
          : isMustSee(item) ? 'sight'
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
        // The airport suffix is flight-speak; the day map talks about towns.
        label: (t.dest.city || '').replace(/\s*\(.*\)\s*$/, ''),
        lat: t.lat,
        lon: t.lon,
        cat: 'town',
        score: t.dest.rating?.score ?? null,
        tier: t.dest.rating?.tier ?? null,
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
        must: isMustSee(p.item),
        selected: selPois.some((x) => x.key === p.key),
        focused: exploreFocus === p.key,
      });
    });
    return ms;
  }, [exploreCats, exploreTowns, explorePois, newStops, selPois, exploreFocus, stayTownId]);

  // How many places each filter chip is holding back, shown on the chip so
  // an off category never reads as "there's nothing here".
  const exploreCounts = useMemo(() => {
    const c = { town: exploreTowns.filter((t) => t.id !== stayTownId).length, beach: 0, sight: 0, active: 0 };
    explorePois.forEach((p) => { c[p.cat] += 1; });
    return c;
  }, [exploreTowns, explorePois, stayTownId]);

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

  // A focused town's three strongest sights, a taste of what "going in depth
  // later" will offer, right in the briefing panel.
  const focusedTownSights = useMemo(() => {
    if (focusedExplore?.type !== 'town') return [];
    const t = focusedExplore;
    const items = (t.dest.activities?.items_full?.length
      ? t.dest.activities.items_full
      : actFull?.[t.id]) || [];
    const suppressed = duplicatePoiIndices(items);
    return items
      .map((item, idx) => ({ item, idx }))
      .filter(({ item, idx }) => !suppressed.has(idx) && item.name && !isTransportInfraPoi(item))
      .sort((a, b) => poiScore(b.item) - poiScore(a.item))
      .slice(0, 3);
  }, [focusedExplore, actFull]);

  const togglePoiPick = (p) => {
    setSelPois((prev) => (prev.some((x) => x.key === p.key)
      ? prev.filter((x) => x.key !== p.key)
      : [...prev, { key: p.key, destId: p.destId, idx: p.idx }]));
  };

  // Search across EVERYTHING on the explore map at once, towns, sights,
  // beaches & nature and activities, regardless of which filter chips are on,
  // so a place is findable by name even when its category is hidden. Strongest
  // matches first (towns get a small nudge so a searched town leads its sights).
  const exploreSearch = useMemo(() => {
    const query = searchFold(exploreQuery);
    if (query.length < 2) return [];
    const t2 = t; // the town loop below shadows `t`
    const out = [];
    for (const t of exploreTowns) {
      if (t.id === stayTownId) continue; // that town is the red stay pin itself
      if (searchFold(t.dest.city).includes(query)) {
        out.push({
          id: `t:${t.id}`, cat: 'town', label: t.dest.city,
          sub: `${t2(EXPLORE_CAT_KEY.town)}, ${t2('day.kmFromStay', { km: t.km })}`,
          rating: t.dest.rating || null,
          lat: t.lat, lon: t.lon,
          score: (t.dest.rating?.score || 0) + 6,
        });
      }
    }
    for (const p of explorePois) {
      if (searchFold(`${p.item.name || ''} ${p.item.kind || ''}`).includes(query)) {
        const flag = isMustSee(p.item) ? t2('day.mustSeeTag')
          : (p.item.rate ?? 0) >= 2 ? t2('day.topRated')
          : p.item.heritage ? t2('day.heritageTag') : '';
        out.push({
          id: p.key, cat: p.cat, label: p.item.name,
          sub: `${p.item.kind || t2(EXPLORE_CAT_KEY[p.cat])}, ${t2('day.kmAway', { km: p.km })}${flag ? `, ${flag}` : ''}`,
          lat: p.lat, lon: p.lon,
          score: poiScore(p.item),
        });
      }
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 8);
  }, [exploreQuery, exploreTowns, explorePois, stayTownId, t]);

  // Selecting a search hit: reveal its category (so the pin is drawn), brief it
  // in the side panel, and glide the map to it.
  const pickExploreSearch = (r) => {
    setExploreCats((prev) => (prev.has(r.cat) ? prev : new Set([...prev, r.cat])));
    setExploreFocus(r.id);
    setExploreFly((prev) => ({ lat: r.lat, lon: r.lon, k: (prev?.k || 0) + 1 }));
    setExploreQuery('');
  };

  // Bring one of Carta's recommendations onto the map: reveal its category,
  // brief it in the side panel, and glide the map to it (without adding it).
  const previewExplore = (cat, lat, lon, focusId) => {
    setExploreCats((prev) => (prev.has(cat) ? prev : new Set([...prev, cat])));
    setExploreFocus(focusId);
    setExploreFly((prev) => ({ lat, lon, k: (prev?.k || 0) + 1 }));
  };

  // Reopen an existing plan on the explore/build map to change its towns and
  // picks. Its stay and towns are pre-loaded so the map opens on the same
  // place; hitting the button again updates that plan in place (see below).
  // A fresh (or cleared) stay resets the explore search and closes the guide
  // panel so nothing stale carries over from the last place explored.
  const guideAfterEditRef = useRef(false);
  useEffect(() => {
    setExploreQuery('');
    // "Let Carta guide you" from the day view: land on the edit map with the
    // guide panel already open, instead of making the traveller find it again.
    if (guideAfterEditRef.current) {
      guideAfterEditRef.current = false;
      setGuideOpen(true);
    } else {
      setGuideOpen(false);
    }
  }, [newStayPoint]); // eslint-disable-line react-hooks/exhaustive-deps

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

  /* ---- Carta chat planner (landing): answers -> AI day -> new plan ---- */

  // The chat's chosen town, resolved to its destination record and full POI
  // list. Everything the chat does hangs off this one lookup.
  const chatDest = async (destId) => {
    const dest = destinations[destId];
    if (!dest) return null;
    const fullMap = actFull ?? await fetchActivitiesFull();
    if (!actFull && fullMap) setActFull(fullMap);
    const items = (dest.activities?.items_full?.length
      ? dest.activities.items_full
      : fullMap?.[destId]) || [];
    if (!items.length) return null;
    const { suppressed } = canonicalPoiIndices(items);
    const walkable = walkableIdxSet(items, dest);
    suppressed.forEach((i) => walkable.delete(i));
    return { dest, items, walkable };
  };

  // The chat's answers speak the traveller's language; the ranking engine and
  // the prompt speak interests and pace. Translate once, here.
  const chatInterests = (a) => {
    const map = {
      landmarks: ['culture', 'architecture', 'photo'],
      museums: ['museums', 'culture'],
      food: ['food'],
      nature: ['outdoors'],
      beach: ['beaches', 'outdoors'],
      active: ['sports', 'outdoors'],
      photo: ['photo'],
      local: ['food', 'cafes', 'shopping'],
    };
    const out = new Set();
    (a.interests || []).forEach((k) => (map[k] || []).forEach((v) => out.add(v)));
    if (a.focus === 'nature') ['outdoors', 'beaches'].forEach((v) => out.add(v));
    if (a.focus === 'city') ['culture', 'architecture'].forEach((v) => out.add(v));
    return [...out];
  };

  // `onStage` reports the real milestones of a build to the chat's route
  // animation, so the wait shows the work rather than three dots: how many
  // places were read, how many survived the traveller's answers, and when the
  // sequencing call actually went out.
  const runChatAi = async (a, onStage = () => {}) => {
    const destId = a.town || exploreTowns[0]?.id;
    const info = await chatDest(destId);
    if (!info) return { ok: false, code: 'too_few' };
    onStage({ key: 'read', vars: { n: info.items.length, city: info.dest.city } });
    const candidates = buildAiCandidates({
      items: info.items,
      walkable: info.walkable,
      excludeIdx: null,
      interests: chatInterests(a),
      limit: 24,
    });
    if (candidates.length < 3) return { ok: false, code: 'too_few' };
    onStage({ key: 'shortlist', vars: { n: candidates.length } });
    onStage({ key: 'route', vars: { km: Number(a.distance) || 5 } });
    const centre = cityCoords(info.dest);
    const res = await requestAiDayPlan({
      dest: {
        id: destId, city: info.dest.city, country: info.dest.country,
        lat: centre.lat, lon: centre.lon,
      },
      date: newStartDate || todayISO(),
      groupSize: prefs?.aiGroupSize || 2,
      pace: a.dayLength === 'half' ? 'relaxed' : a.dayLength === 'evening' ? 'packed' : 'balanced',
      vibe: a.focus === 'nature' ? 'active' : (a.interests || []).includes('museums') ? 'culture'
        : (a.interests || []).includes('food') ? 'foodie' : a.focus === 'city' ? 'classic' : 'mix',
      avoidHills: a.terrain === 'flat',
      freeText: a.freeText || '',
      wantEvents: a.events === 'yes',
      // The full answer profile rides along so the prompt can honour the
      // things no single existing field captures (walking budget, terrain
      // appetite, first visit or not, what they want to eat).
      profile: {
        focus: a.focus || null,
        known: a.known || null,
        interests: a.interests || [],
        maxWalkKm: Number(a.distance) || null,
        terrain: a.terrain || null,
        dayLength: a.dayLength || null,
        food: a.food || null,
      },
      refine: a.refine || '',
      prevStops: a.prevStops || [],
      lang,
      stay: newStayPoint ? { lat: newStayPoint.lat, lon: newStayPoint.lon } : null,
      candidates,
    });
    // Rejoin each proposed stop with the catalogue photo it came from, so the
    // proposal shows the places rather than only naming them.
    return res.ok ? { ...res, plan: decorateAiStops(res.plan, info.items) } : res;
  };

  // The "ask AI" town tab: a wider, coarser candidate list than the nearby
  // map (which caps at 110km/34 towns to stay legible) since a suggestion
  // can reasonably range further than a browsable list.
  const SUGGEST_TOWN_KM = 300;
  const SUGGEST_TOWN_CAP = 150;

  const suggestCityAi = async (freeText, a) => {
    if (!newStayPoint || newStayPoint.lat == null) return { ok: false, code: 'too_few' };
    const wide = Object.entries(destinations)
      .map(([id, d]) => {
        const c = cityCoords(d);
        if (c.lat == null) return null;
        const km = haversineKm(newStayPoint.lat, newStayPoint.lon, c.lat, c.lon);
        return km != null && km <= SUGGEST_TOWN_KM ? { id, dest: d, km, ...c } : null;
      })
      .filter(Boolean)
      .sort((x, y) => (y.dest.rating?.score || 0) - (x.dest.rating?.score || 0))
      .slice(0, SUGGEST_TOWN_CAP);
    const candidates = buildCityCandidates(wide);
    if (candidates.length < 3) return { ok: false, code: 'too_few' };
    return requestCitySuggestion({
      stay: { lat: newStayPoint.lat, lon: newStayPoint.lon },
      focus: a?.focus || null,
      interests: a?.interests || [],
      freeText,
      lang,
      candidates,
    });
  };

  // Import: build the standalone plan the chat just designed, carry the AI
  // schedule into its prefs, and open it. From here it is an ordinary day
  // plan, editable like any other.
  const importChatPlan = async (result, a) => {
    const destId = a.town || exploreTowns[0]?.id;
    const info = await chatDest(destId);
    if (!info) return;
    const { orderedIdx } = splitAiPlan(result, info.items);
    const sp = {
      id: `local:${Date.now()}`,
      label: info.dest.city || t('day.dayPlanFallback'),
      startDate: newStartDate || todayISO(),
      stayPoint: newStayPoint,
      stops: [{ destinationId: destId, days: 1 }],
    };
    if (orderedIdx.length) persistAssignments(sp.id, { 0: { 0: orderedIdx } });
    persistPrefs(sp.id, {
      routeMode: 'manual',
      aiPlans: {
        '0:0': {
          summary: result.summary || '',
          stops: result.stops || [],
          totals: result.totals || null,
          meta: result.meta || null,
          appliedAt: Date.now(),
        },
      },
    });
    const next = [sp, ...standalonePlans];
    setStandalonePlans(next);
    persistStandalonePlans(next);
    setStayQuery('');
    setStayResults(null);
    setNewStayPoint(null);
    setSelPois([]);
    setExploreFocus('');
    setLandingStep('stay');
    openStandalone(sp);
  };

  // What tells two saved trips apart when their labels match: the window they
  // cover and how many stops they hold. Both ride on the row fetchTripPlans
  // already returns, so this costs no extra query.
  const tripPlanSub = (p) => [
    p.start_date ? `${fmtDate(p.start_date)} → ${fmtDate(p.end_date)}` : '',
    p.cities?.length ? t(p.cities.length === 1 ? 'saved.stops1' : 'saved.stopsN', { n: p.cities.length }) : '',
  ].filter(Boolean).join(', ');

  // Landing screen: a guided flow (stay -> when -> how), then either the
  // manual explore map or the chat planner. Saved plans stay reachable from
  // the first step.
  if (!plan) {
    const FLOW = [
      { key: 'stay', labelKey: 'day.stepStay' },
      { key: 'when', labelKey: 'day.stepWhen' },
      { key: 'how', labelKey: 'day.stepHow' },
    ];
    const activeIdx = FLOW.findIndex((s) => s.key === landingStep);
    const flowIdx = activeIdx >= 0 ? activeIdx : FLOW.length - 1;
    return (
      <div className="trip-planner-screen day-flow-screen">
        <div className={`day-flow${landingStep === 'manual' ? ' day-flow-manual' : ''}${
          landingStep === 'stay' || landingStep === 'when' || landingStep === 'how' ? ' day-flow-split-host' : ''
        }`}>
          {editingPlanId && (
            <div className="day-edit-banner">
              <span><PencilIcon size={13} /> {t('day.editBanner')}</span>
              <button className="day-edit-cancel" onClick={cancelEditOnMap}>{t('day.cancel')}</button>
            </div>
          )}

          {/* One decision per screen. The step rail doubles as back navigation
              (a completed step is tappable); everything explanatory hides
              behind the help button so the screen itself stays a question.
              The rail is on screen from the FIRST question, not from the
              second: a progress indicator that appears halfway through tells
              the traveller where they are only once they no longer need it. */}
          <div className="day-flow-top">
            <nav className="day-flow-steps" aria-label={t('day.progressAria')}>
              {FLOW.map((s, i) => (
                <React.Fragment key={s.key}>
                  {/* The connector is what makes three pills read as one
                      journey with a position on it. */}
                  {i > 0 && (
                    <span className={`day-flow-step-rail${i <= flowIdx ? ' done' : ''}`} aria-hidden="true" />
                  )}
                  <button
                    type="button"
                    className={`day-flow-step-dot${i === flowIdx ? ' on' : ''}${i < flowIdx ? ' done' : ''}`}
                    onClick={() => { if (i < flowIdx) setLandingStep(s.key); }}
                    disabled={i > flowIdx}
                    aria-current={i === flowIdx ? 'step' : undefined}
                  >
                    <span className="day-flow-step-num">{i < flowIdx ? '✓' : i + 1}</span>
                    <span className="day-flow-step-label">{t(s.labelKey)}</span>
                  </button>
                </React.Fragment>
              ))}
            </nav>
            <span className="day-flow-stepcount">
              {t('day.stepXofN', { x: flowIdx + 1, n: FLOW.length })}
            </span>
            <button
              className="day-flow-help"
              onClick={() => setHowToOpen((v) => !v)}
              aria-expanded={howToOpen}
              aria-label={t('day.howItWorks')}
              title={t('day.howItWorks')}
            >
              <InfoIcon size={16} />
            </button>
          </div>
          {howToOpen && (
            <div className="day-flow-help-card">
              <b>{t('day.howItWorks')}</b>
              <p>{editingPlanId ? t('day.editLead') : t('day.landingLead')}</p>
              <button className="day-flow-help-close" onClick={() => setHowToOpen(false)}>{t('common.gotIt')}</button>
            </div>
          )}

          {/* The three landing questions share one canvas: the form column on
              the left, a live map on the right that follows the answer. The
              questions used to float alone on an empty page, which gave a
              spatial decision (where are you staying?) no spatial context at
              all. The map is mounted ONCE around all three steps so moving
              between them pans it rather than tearing it down and rebuilding. */}
          {(landingStep === 'stay' || landingStep === 'when' || landingStep === 'how') && (
          <div className={`day-flow-split${landingStep === 'how' ? ' day-flow-split-wide' : ''}`}>
          <div className="day-flow-forms">

          {/* Past step 1, the chosen destination rides above the question:
              the locator map used to be what kept saying "Salzburg" while a
              date was picked; now a compact banner does, wearing the city's
              catalogue photo, and it is the way back to change the answer. */}
          {(landingStep === 'when' || landingStep === 'how') && newStayPoint && (() => {
            const near = resolveNearestTown(newStayPoint.lat, newStayPoint.lon);
            return (
              <div className="day-flow-dest">
                <PoiThumb img={near?.dest?.image?.url} name={near?.dest?.city || ''} Glyph={MapPinIcon} />
                <span className="day-flow-dest-text">
                  <b className="day-flow-dest-name">{newStayPoint.shortLabel || newStayPoint.label}</b>
                  {landingStep === 'how' && newStartDate && (
                    <small className="day-flow-dest-date">{fmtDateFull(newStartDate, true)}</small>
                  )}
                </span>
                <button
                  className="day-flow-dest-change"
                  onClick={() => setLandingStep('stay')}
                  title={t('day.clearAddress')}
                >
                  {t('day.change')}
                </button>
              </div>
            );
          })()}

          {/* STEP 1, where are you staying */}
          {landingStep === 'stay' && (
            <div className="day-flow-step">
              <div className="day-flow-panel">
                <h2 className="day-flow-q">{t('day.whereStaying')}</h2>
                {/* Once a place is chosen it BECOMES the field. Leaving the
                    search box filled with the old query above a chosen-city
                    badge showed the same answer twice, in two different
                    states, and left it ambiguous which one counted. */}
                {newStayPoint ? (
                  <div className="day-stay-chosen day-flow-chosen">
                    <MapPinIcon size={14} />
                    <span className="day-stay-chosen-label">{newStayPoint.shortLabel || newStayPoint.label}</span>
                    <button
                      className="day-flow-chosen-change"
                      onClick={() => { setNewStayPoint(null); setStayResults(null); setStayQuery(''); setExploreFocus(''); }}
                      aria-label={t('day.clearAddress')}
                    >{t('day.change')}</button>
                  </div>
                ) : (
                <div className="day-stay-search day-flow-search">
                  <input
                    className="day-stay-input"
                    type="text"
                    value={stayQuery}
                    onChange={(e) => setStayQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') searchStay(); }}
                    placeholder={t('day.stayPlaceholder')}
                    aria-label={t('day.stayAria')}
                    autoFocus
                  />
                  <button className="trip-add-btn" onClick={searchStay} disabled={staySearching || stayQuery.trim().length < 3}>
                    {staySearching ? '…' : t('day.find')}
                  </button>
                </div>
                )}
                {newStayPoint ? null : stayResults ? (
                  stayResults.length ? (
                    <div className="day-stay-results day-flow-results">
                      {stayResults.map((r, i) => (
                        <button key={i} className="day-stay-result" onClick={() => setNewStayPoint(r)}>
                          {r.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="trip-note">{t('day.noAddressMatchTown')}</p>
                  )
                ) : popularStays.length > 0 && (
                  // Nothing typed yet: the popular cities double as the
                  // "what does an answer look like?" example and a one-tap
                  // way past the empty box.
                  <div className="day-flow-suggest">
                    <span className="day-flow-suggest-label">{t('day.popularStays')}</span>
                    <div className="day-flow-chips">
                      {popularStays.map((r) => (
                        <button key={r.id} className="day-flow-chip" onClick={() => pickPopularStay(r)}>
                          <MapPinIcon size={13} />
                          <span>{r.name}</span>
                          {r.dest.rating?.score != null && <ScoreChip rating={r.dest.rating} size="xs" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {newStayPoint && (
                  <button className="day-flow-next" onClick={() => setLandingStep('when')}>
                    {t('day.next')}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* STEP 2, when */}
          {landingStep === 'when' && (
            <div className="day-flow-step">
              <div className="day-flow-panel">
                <h2 className="day-flow-q">{t('day.whenVisiting')}</h2>
                <div className="day-flow-chips day-flow-chips-center">
                  {quickDates.map((q) => (
                    <button
                      key={q.key}
                      className={`day-flow-chip${newStartDate === q.iso ? ' on' : ''}`}
                      onClick={() => setNewStartDate(q.iso)}
                      aria-pressed={newStartDate === q.iso}
                    >
                      <CalendarIcon size={13} />
                      <span>{t(q.labelKey)}</span>
                      <small>{fmtDateFull(q.iso, true)}</small>
                    </button>
                  ))}
                </div>
                {/* The calendar is on the page, not behind an underlined bit
                    of text. A single flat field reading "24 Jul 2026" gave no
                    sense of the surrounding week, which is exactly what you
                    need when deciding which day to spend somewhere. */}
                <div className="day-flow-date">
                  <span className="day-flow-suggest-label">{t('day.orPickDate')}</span>
                  <DateField
                    inline
                    value={newStartDate}
                    rangeStart={newStartDate}
                    rangeEnd={newStartDate}
                    onChange={setNewStartDate}
                    placeholder={t('day.startDate')}
                  />
                </div>
                <button className="day-flow-next" onClick={() => setLandingStep('how')} disabled={!newStartDate}>
                  {t('day.next')}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3, how do you want to plan it */}
          {landingStep === 'how' && (
            <div className="day-flow-step">
              <div className="day-flow-panel day-flow-panel-wide">
                <h2 className="day-flow-q">{t('day.howToPlan')}</h2>
                {/* Both cards end in the action they perform. The recommended
                    one used to be the only one that looked pressable, which
                    left "plan it myself" reading as an explanatory panel that
                    happened to sit beside a button. */}
                <div className="day-flow-cards">
                  <button className="day-flow-card primary" onClick={() => setLandingStep('chat')}>
                    <span className="day-flow-card-top">
                      <span className="day-flow-card-ico"><SparkIcon size={22} /></span>
                      <span className="day-flow-card-tag">{t('day.recommendedTag')}</span>
                    </span>
                    <b>{t('day.useChatbot')}</b>
                    <small>{t('day.useChatbotSub')}</small>
                    <ul className="day-flow-card-points">
                      <li><CheckIcon size={12} /> {t('day.chatPoint1')}</li>
                      <li><CheckIcon size={12} /> {t('day.chatPoint2')}</li>
                      <li><CheckIcon size={12} /> {t('day.chatPoint3')}</li>
                    </ul>
                    <span className="day-flow-card-go">
                      {t('day.cardGoBot')}<ChevronRightIcon size={14} />
                    </span>
                  </button>
                  <button className="day-flow-card" onClick={() => setLandingStep('manual')}>
                    <span className="day-flow-card-top">
                      <span className="day-flow-card-ico"><MapPinIcon size={22} /></span>
                    </span>
                    <b>{t('day.planManually')}</b>
                    <small>{t('day.planManuallySub')}</small>
                    <ul className="day-flow-card-points">
                      <li><CheckIcon size={12} /> {t('day.manualPoint1')}</li>
                      <li><CheckIcon size={12} /> {t('day.manualPoint2')}</li>
                      <li><CheckIcon size={12} /> {t('day.manualPoint3')}</li>
                    </ul>
                    <span className="day-flow-card-go">
                      {t('day.cardGoManual')}<ChevronRightIcon size={14} />
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Work you already have belongs UNDER the question it continues,
              in the same column. Sitting below the whole split it started
              level with the bottom of a 620px map, which left the question
              column half empty and pushed saved plans off the fold. */}
          {landingStep === 'stay' && (
            <div className="day-flow-saved">
              {standalonePlans.length > 0 && (
                <div className="day-landing-section">
                  <div className="trip-block-title">{t('day.yourDayPlans')}</div>
                  <div className="trip-saved-list">
                    {standalonePlans.map((sp) => {
                      // The row wears the face of its city: the catalogue's
                      // hero photo as a small thumb, the same photo language
                      // the timeline rows speak. No photo, a pin glyph.
                      const spDest = destinations[sp.stops?.[0]?.destinationId];
                      return (
                      <div className="trip-saved-item" key={sp.id}>
                        {/* The chevron is the row's affordance: without it a
                            bordered box holding a name reads as a filled-in text
                            field, not as a saved plan you can open. */}
                        <button className="trip-saved-main" onClick={() => openStandalone(sp)}>
                          <PoiThumb img={spDest?.image?.url} name={spDest?.city || ''} Glyph={MapPinIcon} />
                          <span className="trip-saved-label">
                            {sp.label || destinations[sp.stops?.[0]?.destinationId]?.city || t('day.dayPlanFallback')}
                            <small className="day-saved-sub">
                              {fmtDate(sp.startDate)}
                              {(sp.stops?.reduce((n, s) => n + (s.days || 1), 0) || 1) > 1
                                ? t('day.nDaysSuffix', { n: sp.stops.reduce((n, s) => n + (s.days || 1), 0) })
                                : ''}
                              {(sp.stops?.length || 1) > 1 ? t('day.nCitiesSuffix', { n: sp.stops.length }) : ''}
                            </small>
                          </span>
                          <span className="trip-saved-go" aria-hidden="true"><ChevronRightIcon size={14} /></span>
                        </button>
                        <button className="trip-saved-del" onClick={() => deleteStandalone(sp.id)} aria-label={t('day.deleteDayPlan')} title={t('day.delete')}>×</button>
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Or plan a day from a saved trip */}
              {authConfigured && user && (
                <div className="day-landing-section">
                  <div className="trip-block-title">{t('day.planFromSavedTrip')}</div>
                  {plansLoading ? (
                    <p className="trip-note">{t('day.loadingSavedTrips')}</p>
                  ) : savedPlans.length === 0 ? (
                    <p className="trip-note">{t('day.noSavedTrips')}</p>
                  ) : (
                    <div className="trip-saved-list">
                      {savedPlans.map((p) => {
                        const pDest = destinations[p.destination_ids?.[0]];
                        return (
                        <div className="trip-saved-item" key={p.id}>
                          <button className="trip-saved-main" onClick={() => openPlan(p.id)}>
                            <PoiThumb img={pDest?.image?.url} name={pDest?.city || ''} Glyph={RouteIcon} />
                            <span className="trip-saved-label">
                              {p.label || t('day.untitledTrip')}
                              {/* Two trips can honestly carry the same label
                                  ("Austria & Germany" planned twice), and two
                                  identical rows are unpickable. Their dates and
                                  stop count are what tells them apart. */}
                              {tripPlanSub(p) && <small className="day-saved-sub">{tripPlanSub(p)}</small>}
                            </span>
                            <span className="trip-saved-go" aria-hidden="true"><ChevronRightIcon size={14} /></span>
                          </button>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {authConfigured && !user && <p className="trip-note">{t('day.signInNote')}</p>}
              {!authConfigured && <p className="trip-note">{t('day.noAuthNote')}</p>}
            </div>
          )}

          </div>
          </div>
          )}

          {/* The chat planner: questions, a proposed route, then import. */}
          {landingStep === 'chat' && (
            <CartaChatPlanner
              towns={exploreTowns}
              dateISO={newStartDate}
              groupSize={prefs?.aiGroupSize || 2}
              signedIn={!!user && authConfigured}
              onRun={runChatAi}
              onImport={importChatPlan}
              onBack={() => setLandingStep('how')}
              onManual={() => setLandingStep('manual')}
              stayPoint={newStayPoint}
              cityOptions={allCityOptions}
              onSuggestCity={suggestCityAi}
              resolveNearest={resolveNearestTown}
              onResearchCity={researchTown}
            />
          )}

          {landingStep === 'manual' && (
          <div className="day-build">

            {/* 2. Explore what's around the stay: a zoomed-in map with filter
                  chips (towns by default so it never opens overloaded), a
                  briefing panel for whatever gets tapped, and multi-select. */}
            {newStayPoint && (
              <div className="day-explore">
                <span className="trip-field-label day-explore-steplabel">
                  <span className="day-step-num">2</span> {t('day.pickPlaces')}
                </span>
                {/* The map is the standard view: search it by name or filter
                    its pins; "Let Carta guide you" lives on the side rail and
                    only opens when tapped. The toolbar shares a column with
                    the map, so the search + chips end where the map ends. */}
                <div className="day-explore-wrap">
                <div className="day-explore-main">
                <div className="day-explore-tools">
                  <div className="day-explore-search">
                    <SearchIcon size={14} className="day-explore-search-ico" />
                    <input
                      className="day-explore-search-input"
                      type="text"
                      value={exploreQuery}
                      onChange={(e) => setExploreQuery(e.target.value)}
                      placeholder={t('day.exploreSearchPlaceholder')}
                      aria-label={t('day.exploreSearchAria')}
                    />
                    {exploreQuery.trim().length > 0 && (
                      <button className="day-explore-search-clear" onClick={() => setExploreQuery('')} aria-label={t('day.clearSearch')} title={t('day.clear')}>×</button>
                    )}
                    {exploreQuery.trim().length >= 2 && (
                      <div className="day-explore-search-results">
                        {exploreSearch.length ? exploreSearch.map((r) => (
                          <button key={r.id} className="day-explore-search-result" onClick={() => pickExploreSearch(r)}>
                            <span className={`day-explore-search-dot cat-${r.cat}`} />
                            <span className="day-explore-search-text">
                              <b>{r.label}{r.rating?.score != null && <ScoreChip rating={r.rating} size="xs" />}</b>
                              <small>{r.sub}</small>
                            </span>
                          </button>
                        )) : (
                          <div className="day-explore-search-empty">{t('day.exploreSearchEmpty')}</div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="day-explore-filters">
                    {[
                      ['town', t('day.moodTowns')],
                      ['beach', t('day.moodBeaches')],
                      ['sight', t('day.chipSights')],
                      ['active', t('day.chipActivities')],
                    ].map(([cat, label]) => (
                      <button
                        key={cat}
                        className={`guide-chip dem-chip-${cat} ${exploreCats.has(cat) ? 'on' : ''}`}
                        onClick={() => toggleExploreCat(cat)}
                        aria-pressed={exploreCats.has(cat)}
                      >{label}{exploreCounts[cat] > 0 && <span className="dem-chip-count">{exploreCounts[cat]}</span>}</button>
                    ))}
                  </div>
                </div>
                  <DayExploreMap
                    stay={{ lat: newStayPoint.lat, lon: newStayPoint.lon, label: newStayPoint.shortLabel || t('day.yourStay') }}
                    markers={exploreMarkers}
                    flyTo={exploreFly}
                    onFocus={(id) => setExploreFocus((cur) => (cur === id ? '' : id))}
                    onStayClick={stayTownId ? () => setExploreFocus((cur) => (cur === `t:${stayTownId}` ? '' : `t:${stayTownId}`)) : null}
                    stayFocused={!!stayTownId && exploreFocus === `t:${stayTownId}`}
                  />
                </div>
                  <div className="day-explore-side" ref={exploreSideRef}>
                    {!guideOpen && (
                      <button
                        className="day-guide-btn"
                        onClick={() => setGuideOpen(true)}
                        aria-expanded={guideOpen}
                        title={t('day.guideBtnTitle')}
                      >
                        <SparkIcon size={13} /> {t('day.guideBtn')}
                      </button>
                    )}
                    {/* The guide stays MOUNTED (its answers survive) but steps
                        aside whenever a pin is tapped: the tapped place's
                        briefing takes the panel, with a way back. */}
                    {guideOpen && (
                      <div className="day-explore-side-guide" style={{ display: focusedExplore ? 'none' : 'contents' }}>
                        <CartaGuidePanel
                          towns={exploreTowns}
                          pois={explorePois}
                          stayTownId={stayTownId}
                          pickedTownIds={new Set(newStops.map((s) => s.destinationId))}
                          pickedPoiKeys={new Set(selPois.map((s) => s.key))}
                          onToggleTown={(t) => (newStops.some((s) => s.destinationId === t.id)
                            ? removeLandingCity(t.id) : addLandingCity(t.id))}
                          onTogglePoi={togglePoiPick}
                          onPreview={previewExplore}
                          onClose={() => setGuideOpen(false)}
                        />
                      </div>
                    )}
                    {(!guideOpen || focusedExplore) && (
                    <div className="guide-city-side">
                    {guideOpen && focusedExplore && (
                      <button className="day-guide-back day-explore-back" onClick={() => setExploreFocus('')}>
                        {t('day.backToSuggestions')}
                      </button>
                    )}
                    {!focusedExplore ? (
                      <div className="guide-flight-side-empty">
                        <MapPinIcon size={16} />
                        <p>{t('day.exploreEmptyHint')}</p>
                      </div>
                    ) : focusedExplore.type === 'town' ? (
                      <>
                        {focusedExplore.dest.image?.url ? (
                          <div className="guide-city-side-photo" style={{ backgroundImage: `url(${focusedExplore.dest.image.url})` }} />
                        ) : (
                          <div className="guide-city-side-photo guide-city-side-photo-empty" aria-hidden="true">
                            <HomeIcon size={22} />
                          </div>
                        )}
                        <div className="guide-city-side-title">
                          <b>{focusedExplore.dest.city}</b>
                          {focusedExplore.dest.rating?.score != null && <ScoreChip rating={focusedExplore.dest.rating} size="xs" />}
                          {focusedExplore.dest.rating?.hidden_gem && <HiddenGemTag />}
                        </div>
                        <span className="day-explore-type-tag type-town"><HomeIcon size={10} /> {t('day.wholeTown')}</span>
                        <p className="guide-city-side-insight">
                          {t('day.kmFromStayDot', { km: focusedExplore.km })} {cityInsight(focusedExplore.dest)}
                        </p>
                        {focusedTownSights.length > 0 && (
                          <div className="day-explore-topsights">
                            <span className="day-explore-topsights-title">{t('day.strongestSights')}</span>
                            {focusedTownSights.map(({ item, idx }) => (
                              <span className="day-explore-topsight" key={idx}>
                                {isMustSee(item) && <StarIcon size={9} />}
                                {item.name}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="day-explore-depth-note">
                          <InfoIcon size={11} /> {t('day.townDepthNote')}
                        </p>
                        {newStops.some((s) => s.destinationId === focusedExplore.id) ? (
                          <div className="guide-city-side-actions">
                            <div className="trip-people day-days-stepper">
                              <button type="button" onClick={() => setLandingDays(focusedExplore.id, (newStops.find((s) => s.destinationId === focusedExplore.id)?.days || 1) - 1)} aria-label={t('day.fewerDays')}>-</button>
                              <span>{newStops.find((s) => s.destinationId === focusedExplore.id)?.days || 1} {(newStops.find((s) => s.destinationId === focusedExplore.id)?.days || 1) === 1 ? t('day.dayWord') : t('day.daysWord')}</span>
                              <button type="button" onClick={() => setLandingDays(focusedExplore.id, (newStops.find((s) => s.destinationId === focusedExplore.id)?.days || 1) + 1)} aria-label={t('day.moreDays')}>+</button>
                            </div>
                            <button className="guide-back" onClick={() => removeLandingCity(focusedExplore.id)}>{t('day.remove')}</button>
                          </div>
                        ) : (
                          <button className="guide-next guide-city-side-add" onClick={() => addLandingCity(focusedExplore.id)}>
                            {t('day.addToMyDays')}
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        {focusedExplore.item.img ? (
                          <div className="guide-city-side-photo" style={{ backgroundImage: `url(${focusedExplore.item.img})` }} />
                        ) : (
                          <div className="guide-city-side-photo guide-city-side-photo-empty" aria-hidden="true">
                            <MapPinIcon size={22} />
                          </div>
                        )}
                        <div className="guide-city-side-title">
                          <b>{focusedExplore.item.name}</b>
                          {isMustSee(focusedExplore.item) && <span className="day-guide-badge must"><StarIcon size={9} /> {t('day.mustSee')}</span>}
                          {!isMustSee(focusedExplore.item) && (focusedExplore.item.rate ?? 0) >= 2 && <span className="day-guide-badge rated">{t('day.highlyRated')}</span>}
                          {focusedExplore.item.heritage && <span className="day-guide-badge heritage">{t('day.heritage')}</span>}
                        </div>
                        <span className={`day-explore-type-tag type-${focusedExplore.cat}`}>
                          <MapPinIcon size={10} /> {EXPLORE_CAT_KEY[focusedExplore.cat] ? t(EXPLORE_CAT_KEY[focusedExplore.cat]) : t('day.place')}
                        </span>
                        <p className="guide-city-side-insight">
                          {poiKind(focusedExplore.item) ? `${poiKind(focusedExplore.item)}, ` : ''}
                          {t('day.kmFromStayNear', { km: focusedExplore.km, city: destinations[focusedExplore.destId]?.city })}
                          {' '}{focusedExplore.item.desc || ''}
                        </p>
                        <p className="day-explore-depth-note">
                          <InfoIcon size={11} /> {t('day.poiDepthNote')}
                        </p>
                        {selPois.some((x) => x.key === focusedExplore.key) ? (
                          <button className="guide-back guide-city-side-add" onClick={() => togglePoiPick(focusedExplore)}>{t('day.removeFromMyDays')}</button>
                        ) : (
                          <button className="guide-next guide-city-side-add" onClick={() => togglePoiPick(focusedExplore)}>
                            {t('day.addToMyDays')}
                          </button>
                        )}
                      </>
                    )}
                    </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 3. Everything picked so far. */}
            {(newStops.length > 0 || selPois.length > 0) && (
              <div className="day-build-cities">
                <span className="trip-field-label day-explore-steplabel day-picks-steplabel">
                  <span className="day-step-num">3</span> {t('day.yourPicks')}
                  {/* What is actually planned so far, stated once. */}
                  <span className="day-picks-status">
                    {t('day.picksStatus', {
                      days: newStops.reduce((n, s) => n + (s.days || 1), 0),
                      towns: newStops.length,
                      pois: selPois.length,
                    })}
                  </span>
                </span>
                {newStops.map((s) => {
                  const d = destinations[s.destinationId];
                  return (
                    <div className="day-build-city" key={s.destinationId}>
                      <span className="day-build-city-name">
                        {d?.city || t('day.unknown')}
                        <small>{d?.country}</small>
                      </span>
                      {/* Days are set in the briefing panel, where the town is
                          actually being judged. A second identical stepper
                          here meant two controls for one number on one screen;
                          this row states the answer and leaves editing to the
                          one place that has the context for it. */}
                      <span className="day-build-city-days">
                        {s.days} {s.days === 1 ? t('day.dayWord') : t('day.daysWord')}
                      </span>
                      <button
                        className="trip-stop-remove"
                        onClick={() => removeLandingCity(s.destinationId)}
                        aria-label={t('day.removeX', { name: d?.city || 'city' })}
                        title={t('day.remove')}
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
                        <small>{poiKind(item)}, {t('day.nearCity', { city: destinations[p.destId]?.city })}</small>
                      </span>
                      <button
                        className="trip-stop-remove"
                        onClick={() => setSelPois((prev) => prev.filter((x) => x.key !== p.key))}
                        aria-label={t('day.removeX', { name: item.name })}
                        title={t('day.remove')}
                      >×</button>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              className="trip-save-btn day-build-btn"
              onClick={startExplorePlanning}
              disabled={newStops.length === 0 && selPois.length === 0}
            >
              {editingPlanId ? t('day.updatePlan') : t('day.startPlanning')}
            </button>
            {selPois.length > 0 && newStops.length === 0 && (
              <p className="trip-note">{t('day.picksSpecificNote')}</p>
            )}
          </div>
          )}

        </div>
      </div>
    );
  }

  // Collapsed "Today's plan" still has to say where you'll go at a glance;
  // the full route, tools and place-adding live inside the expanded card.
  const planNames = assignedItems.map((it) => it.name).filter(Boolean);
  const planSummaryText = planNames.length === 0
    ? ''
    : planNames.length <= 4
      ? planNames.join(', ')
      : `${planNames.slice(0, 3).join(', ')} ${t('day.plusNMore', { n: planNames.length - 3 })}`;

  // The route explanation, kept behind an info icon inside the plan card
  // instead of shouting a mono-uppercase banner over the timeline.
  const routeSummary = (() => {
    if (routeMode !== 'auto') return t('day.routeManualNote');
    const parts = [];
    if (stayLeg?.ride) parts.push(t((MODE_META[stayLeg.mode] || MODE_META.car).labelKey).toLowerCase());
    parts.push(t('day.routeWalk'));
    if (routeOk && route.hasFerry) parts.push(t('day.routeFerry'));
    const kind = parts.length > 1 ? t('day.routeKindCombo', { parts: parts.join(' + ') }) : t('day.routeKindWalking');
    return t('day.routePickedNote', { kind });
  })();

  // The "add places" browser (search + tiers): shared by the empty-day state
  // and the expanded plan card, so a place is always one tap away.
  const addPlacesInner = !stop ? null : (
    activities.items.length === 0 ? (
      <p className="trip-note">{t('day.noActivities')}</p>
    ) : (
      <>
        {activities.limited && (
          <p className="trip-note">{t('day.limitedData')}</p>
        )}
        <div className="day-poi-search day-stay-search">
          <input
            className="day-stay-input"
            type="text"
            value={poiQuery}
            onChange={(e) => setPoiQuery(e.target.value)}
            placeholder={t('day.poiSearchPlaceholder')}
            aria-label={t('day.poiSearchAria')}
          />
          {poiQuery.trim().length > 0 && (
            <button className="trip-stop-remove" onClick={() => setPoiQuery('')} aria-label={t('day.clearSearch')} title={t('day.clear')}>×</button>
          )}
        </div>
        {poiQuery.trim().length >= 2 && (
          <>
            {poiSearch.length > 0 && (
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
            )}
            {/* The catalogue is a head start, not a gatekeeper: whatever was
                typed can always become a custom stop on today's plan. Shown
                whenever no catalogue name matches the query exactly, so
                "Gaisberg" is one tap from the timeline instead of a dead
                "nothing matches" wall. */}
            {poiQuery.trim().length >= 3
              && !poiSearch.some(({ item }) => searchFold(item.name) === searchFold(poiQuery))
              && (
                <button
                  className="day-custom-add"
                  onClick={() => addCustomPlace(poiQuery)}
                  disabled={customBusy}
                >
                  {customBusy
                    ? <><span className="day-custom-spin" aria-hidden="true" /> {t('day.customAdding')}</>
                    : <>+ {t('day.customAdd', { q: poiQuery.trim() })}</>}
                </button>
              )}
            {poiSearch.length === 0 && (
              <p className="trip-note">{t('day.poiSearchEmpty', { q: poiQuery.trim(), city: stop.dest?.city || 'here' })}</p>
            )}
          </>
        )}
        {tiers.must.length > 0 && (
          <ActivitySection
            key={`must-${tiersCollapseKey}`}
            title={t('day.mustSee')}
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
            title={t('day.recommended')}
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
            title={t('day.moodActive')}
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
            title={t('day.worthDetour')}
            badge={<MapPinIcon size={11} />}
            entries={farSights.map(({ item, idx, km }) => ({
              item, idx,
              note: t('day.kmFromDayTrip', { km: Math.round(km), city: stop.dest?.city || 'town' }),
            }))}
            variant="far"
            assignedIdx={dayAssignedIdx}
            onToggle={toggleActivity}
          />
        )}
        {tiers.more.length > 0 && (
          <ActivitySection
            key={`more-${tiersCollapseKey}`}
            title={t('day.morePlaces')}
            entries={tiers.more}
            assignedIdx={dayAssignedIdx}
            onToggle={toggleActivity}
          />
        )}
      </>
    )
  );

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
            <p>This day plan is stored in your Saved trips. Reopen it any time, and every change you make here is kept automatically.</p>
            <button className="day-saved-done" onClick={() => setSavedInfo(false)}>Keep planning here</button>
          </div>
        </div>
      )}
      {aiOpen && stop && (
        <AiDayPlanModal
          city={stop.dest?.city || ''}
          dayNumber={dayOffset + dayIdx + 1}
          dateISO={days[dayIdx] || prefs?.aiDate || ''}
          groupSize={prefs?.aiGroupSize || aiGroupSize()}
          signedIn={!!user && authConfigured}
          onRun={runAi}
          onApply={applyAiResult}
          onFallback={fallbackAi}
          onClose={() => setAiOpen(false)}
          entitlement={entitlement}
          onOpenPass={(reason) => setPassReason(reason || 'browse')}
        />
      )}
      {passReason && (
        <PassModal
          entitlement={entitlement}
          reason={passReason}
          signedIn={!!user && authConfigured}
          onClose={() => { setPassReason(''); entitlement.refresh(); }}
          onSignIn={() => setPassReason('')}
        />
      )}
      <TripMap
        stops={routePins}
        padBottom={isNarrow ? Math.min(sheetPx, 420) : 420}
        routeGeometry={routeOk ? route.geometry : null}
        routeSegments={routeOk ? route.segments : null}
        focus={stop?.dest?.lat != null ? { ...cityCoords(stop.dest), zoom: 12.2 } : null}
        pois={aiDiscoveryPins.length ? [...mapPois, ...aiDiscoveryPins] : mapPois}
        onPoiClick={(id) => toggleActivity(Number(id))}
        onSelectStop={onMapStopClick}
        selectedIndex={selectedMarkerIdx}
        easeToSelected={false}
        onViewChange={setMapView}
        fitMaxZoom={13}
      />

      {/* Floating map tools. One containerized card so map detail can't bleed
          up between the controls, and three separate layers inside it: WHAT
          kind of place (always-on chips), HOW GOOD (a collapsible group, an
          occasional narrowing), and the view toggle for what you already
          picked, which is a state and not a filter at all. The hint sits below
          the card with real air around it, not squeezed under the pills. */}
      {stop && mapDeck.length > 0 && (
        <div className="day-map-tools" onClick={(e) => e.stopPropagation()}>
          <div className="day-map-card">
            <div className="day-map-chips" role="group" aria-label={t('day.mapFilterCat')}>
              {MAP_CATS
                .filter(({ key }) => key === 'all' || mapCatCounts[key] > 0)
                .map(({ key, labelKey }) => (
                  <button
                    key={key}
                    type="button"
                    className={`day-map-chip ${mapCat === key && !showSel ? 'on' : ''}`}
                    onClick={() => { setMapCat(key); setShowSel(false); }}
                    aria-pressed={mapCat === key && !showSel}
                    disabled={showSel}
                  >
                    {t(labelKey)}
                    <span className="day-map-count">{mapCatCounts[key]}</span>
                  </button>
                ))}
            </div>

            <div className="day-map-card-foot">
              <button
                type="button"
                className={`day-map-chip day-map-quality-btn ${mapRating !== 'all' && !showSel ? 'on' : ''} ${qualityOpen ? 'open' : ''}`}
                onClick={() => setQualityOpen((v) => !v)}
                aria-expanded={qualityOpen}
                disabled={showSel}
              >
                <FilterIcon size={11} />
                {t(MAP_RATINGS.find((r) => r.key === mapRating)?.labelKey || 'day.mapQualityAny')}
                <ChevronDownIcon size={11} className={qualityOpen ? 'day-map-caret up' : 'day-map-caret'} />
              </button>
              {assignedAnyDay.size > 0 && (
                <>
                  <span className="day-map-divider" aria-hidden="true" />
                  <button
                    type="button"
                    className={`day-map-chip day-map-toggle ${showSel ? 'on' : ''}`}
                    onClick={() => setShowSel((v) => !v)}
                    role="switch"
                    aria-checked={showSel}
                    title={t('day.mapOnlyPicksTitle')}
                  >
                    <CheckIcon size={10} /> {t('day.mapOnlyPicks')}
                    <span className="day-map-count">{assignedAnyDay.size}</span>
                  </button>
                </>
              )}
            </div>

            {qualityOpen && !showSel && (
              <div className="day-map-quality" role="radiogroup" aria-label={t('day.mapFilterQuality')}>
                {MAP_RATINGS
                  .filter(({ key }) => key === 'all' || mapCatCounts[key] > 0)
                  .map(({ key, labelKey }) => (
                    <button
                      key={`r-${key}`}
                      type="button"
                      className={`day-map-chip ${mapRating === key ? 'on' : ''}`}
                      onClick={() => { setMapRating(key); setQualityOpen(false); }}
                      role="radio"
                      aria-checked={mapRating === key}
                    >
                      {t(labelKey)}
                      {key !== 'all' && <span className="day-map-count">{mapCatCounts[key]}</span>}
                    </button>
                  ))}
              </div>
            )}
          </div>

          <p className="day-map-hint">
            <InfoIcon size={12} />
            <span>
              {showSel
                ? t('day.mapHintPicked', { city: stop?.dest?.city || t('day.thisCity'), n: dayOffset + dayIdx + 1 })
                : t('day.mapHintTap', { n: dayOffset + dayIdx + 1 })}
            </span>
          </p>
        </div>
      )}

      <div
        className={`trip-sheet ${sheetDragging ? 'dragging' : ''}`}
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
        style={isNarrow && sheetHeight != null ? { height: sheetHeight } : undefined}
      >
        <div
          className="trip-sheet-grip-hit"
          onPointerDown={onSheetGripDown}
          onPointerMove={onSheetGripMove}
          onPointerUp={onSheetGripUp}
          onPointerCancel={onSheetGripUp}
          role="separator"
          aria-label="Drag to resize the panel"
          title="Drag up or down to move this panel, or tap to expand"
        >
          <div className="trip-sheet-grip" />
        </div>

        {/* Plan header, at the top of the sheet. On phones the whole card
            doubles as a drag handle (like the trip planner) so the sheet can be
            swiped down to reveal the map and back up again; the save button opts
            out - tapping it must not start a drag. */}
        <div
          className="trip-topcard"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={isNarrow ? (e) => { if (!e.target.closest('input, button')) onSheetGripDown(e); } : undefined}
          onPointerMove={isNarrow ? onSheetGripMove : undefined}
          onPointerUp={isNarrow ? onSheetGripUp : undefined}
          onPointerCancel={isNarrow ? onSheetGripUp : undefined}
          style={isNarrow ? { touchAction: 'none' } : undefined}
        >
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
          {/* The day's honest numbers, always in view above the scroll: how
              many stops, how far on foot, when you are roughly done. */}
          {assignedItems.length > 0 && (
            <div className="day-topcard-stats">
              <span>{t('day.statStops', { n: assignedItems.length })}</span>
              {legsAlign && routeOk && (
                <>
                  <span className="day-stat-sep" aria-hidden="true" />
                  <span>{t('day.statWalk', { km: route.km.toFixed(1) })}</span>
                </>
              )}
              {schedule && (
                <>
                  <span className="day-stat-sep" aria-hidden="true" />
                  <span>{t('day.statDone', { time: fmtClockLoose(schedule.endMin) })}</span>
                </>
              )}
            </div>
          )}
        </div>

        <div className="trip-sheet-scroll">

          {/* 1. Where are you staying - the anchor for the whole day, right at
              the top and editable in place. No buttons hanging below it. */}
          {plan.standalone && (
            <div className="trip-block daytrip-base day-stay-top">
              <div className="trip-block-title"><BedIcon size={13} /> Where are you staying?</div>
              <div className="day-stay-search">
                <input
                  className="day-stay-input"
                  type="text"
                  value={stayQuery !== '' ? stayQuery : (plan.stayPoint?.shortLabel || plan.stayPoint?.label || '')}
                  onChange={(e) => setStayQuery(e.target.value)}
                  onFocus={() => {
                    if (stayQuery === '' && plan.stayPoint) {
                      setStayQuery(plan.stayPoint.shortLabel || plan.stayPoint.label || '');
                    }
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') searchStay(); }}
                  placeholder="Town, street, hotel or apartment"
                  aria-label="Address of your stay"
                />
                {(stayQuery !== '' || plan.stayPoint) && (
                  <button
                    className="trip-stop-remove"
                    onClick={() => {
                      setStayQuery('');
                      setStayResults(null);
                      if (plan.stayPoint) patchStandalone((sp) => { sp.stayPoint = null; return sp; });
                    }}
                    aria-label="Clear stay"
                    title="Clear"
                  >×</button>
                )}
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
            </div>
          )}

          {/* 2. Which city, which day. Sticky so switching days never means
              scrolling back up. */}
          {stop && (
            <div className="trip-block day-strip">
              {stops.length > 1 && (
                <div className="day-chip-row day-strip-cities">
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
              )}
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

          {/* 3. Today's plan. An empty day leads with the AI planner as the
              one big call to action; building by hand stays available right
              underneath (map pins or the place browser). A planned day shows
              the collapsible plan card instead. */}
          {stop && assignedItems.length === 0 && (
            <div className="trip-block day-plan-block">
              <div className="trip-block-title">Today's plan</div>
              <button className="day-ai-hero" onClick={() => setAiOpen(true)}>
                <span className="day-ai-hero-ico"><SparkIcon size={18} /></span>
                <span className="day-ai-hero-text">
                  <b>{t('ai.btnEmpty', { n: dayOffset + dayIdx + 1 })}</b>
                  <small>{t('ai.btnEmptySub')}</small>
                </span>
              </button>
              {citytrip && (
                <button className="day-ai-hero day-citytrip-hero" onClick={applyCitytrip}>
                  <span className="day-ai-hero-ico"><RouteIcon size={18} /></span>
                  <span className="day-ai-hero-text">
                    <b>{t('day.readyMade', { city: stop.dest?.city || '' })}</b>
                    <small>{t('day.readyMadeSub', {
                      n: citytrip.n_stops,
                      km: (citytrip.distance_m / 1000).toFixed(1),
                    })}</small>
                  </span>
                </button>
              )}
              <p className="trip-note">
                Or build it yourself: tap the pins on the map, or add places
                below. Carta keeps the walking order optimal as you add.
              </p>
              {pinnedWalksBlock}
              <Collapsible
                className="day-nested"
                title={`Add places${stop.dest?.city ? ` in ${stop.dest.city}` : ''}`}
                defaultOpen
              >
                {addPlacesInner}
              </Collapsible>
            </div>
          )}

          {stop && assignedItems.length > 0 && (
            <Collapsible
              className="day-plan-block day-plan-collapse"
              title="Today's plan"
              count={assignedItems.length}
              summary={<span className="day-plan-summary-text">{planSummaryText}</span>}
              open={planOpen}
              onOpenChange={setPlanOpen}
            >
              <div className="day-route-mode">
                <button
                  className={`day-route-info-btn ${routeInfoOpen ? 'open' : ''}`}
                  onClick={() => setRouteInfoOpen(!routeInfoOpen)}
                  aria-expanded={routeInfoOpen}
                  title="How Carta built this route"
                >
                  <InfoIcon size={13} /> How Carta routed this
                </button>
                {routeMode === 'manual' && (
                  <button className="day-route-optimize" onClick={optimizeNow}>
                    <SparkIcon size={11} /> Let Carta reorder
                  </button>
                )}
                <button className="day-route-optimize day-ai-replan" onClick={() => setAiOpen(true)}>
                  <SparkIcon size={11} /> {t('ai.btnReplan')}
                </button>
              </div>
              {routeInfoOpen && <p className="day-route-info-note">{routeSummary}</p>}

              {/* An imported bot plan is a HEADER on the day, not a second copy
                  of it: its stops are already the timeline below, each keeping
                  the model's one-line reason on its own row. Only the framing
                  the timeline cannot carry lives here, the bot's summary of the
                  day and its walking total. Dismissable. */}
              {aiPlan && (
                <div className="ai-day-panel">
                  <div className="ai-day-panel-head">
                    <span className="ai-day-panel-title">
                      <SparkIcon size={11} /> {t('ai.summaryTitle', { n: dayOffset + dayIdx + 1 })}
                    </span>
                    <button
                      className="trip-stop-remove"
                      onClick={dismissAi}
                      aria-label={t('ai.dismiss')}
                      title={t('ai.dismiss')}
                    >×</button>
                  </div>
                  {aiPlan.summary && <p className="ai-day-panel-summary">{aiPlan.summary}</p>}
                  {aiTotalsTrustworthy && (
                    <p className="ai-plan-note">
                      {t('ai.totals', { km: aiPlan.totals?.walkKm ?? 0, t: aiPlan.totals?.endTime ?? '' })}
                    </p>
                  )}
                </div>
              )}

              <div className="day-timeline">
                {stayLeg && (
                  <div className={`day-timeline-walk day-timeline-stay${stayLeg.ferry ? ' day-timeline-ferry' : ''}${stayLeg.ride ? ' day-timeline-ride' : ''}`}>
                    {legContent(stayLeg, true)}
                    {stayLeg.ride && (
                      <small className="day-timeline-ride-note">
                        Park up or hop off; from here today's route is on foot.
                        {stayLeg.mode === 'car' ? ' The estimate already includes parking and walking in.' : ''}
                      </small>
                    )}
                  </div>
                )}
                {assignedItems.map((it, i) => (
                  <React.Fragment key={`${dayAssignedIdx[i]}`}>
                    {/* Morning / midday / afternoon / evening, in place of a
                        per-stop clock. A holiday runs on phases, and a phase
                        cannot be "missed" by leaving one museum late. */}
                    {phaseHeads[i] && (
                      <div className="day-phase-head">
                        <span className="day-phase-label">{t(phaseHeads[i].labelKey)}</span>
                      </div>
                    )}
                    <AssignedRow
                      item={it}
                      index={i}
                      last={i === assignedItems.length - 1}
                      stayLabel={t('day.estStay', { dur: fmtDur(dwellMinutes(poiKind(it), visitFactor)) })}
                      note={aiWhyByIdx[dayAssignedIdx[i]] || shortDesc(it.desc)}
                      noteFromAi={!!aiWhyByIdx[dayAssignedIdx[i]]}
                      onMoveUp={() => moveAssigned(i, -1)}
                      onMoveDown={() => moveAssigned(i, 1)}
                      onRemove={() => toggleActivity(dayAssignedIdx[i])}
                      rowRef={(el) => { rowRefs.current[i] = el; }}
                      mapFocus={flashRow?.idx === i}
                      onHoverChange={(on) => setHoverRow((cur) => (on ? i : (cur === i ? null : cur)))}
                    />
                    {schedule?.lunch?.afterIndex === i && (
                      <div className="day-timeline-walk day-timeline-lunch">
                        <CoffeeIcon size={11} /> {t('day.lunchBreak', {
                          dur: fmtDur(schedule.lunch.endMin - schedule.lunch.startMin),
                        })}
                      </div>
                    )}
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
                </p>
              )}
              {schedule && (
                <p className="day-route-total day-done-line">
                  {/* One soft anchor for the whole day, rounded to the quarter
                      hour: enough to know whether dinner still fits, not a
                      deadline anyone can run late for. */}
                  <ClockIcon size={11} /> {t('day.doneAround', { time: fmtClockLoose(schedule.endMin) })}
                  {schedule.freeMin >= GAP_SUGGEST_MIN && <> {t('day.openTime', { dur: fmtDur(schedule.freeMin) })}</>}
                </p>
              )}

              {/* The bot's out-of-catalogue finds. They have no catalogue entry
                  to become a timeline row, so they are listed once here beside
                  their violet map pins instead of inside the plan. */}
              {aiDiscoveries.length > 0 && (
                <div className="day-scenic day-ai-finds">
                  <div className="day-scenic-title">
                    <MapPinIcon size={11} /> {t('ai.discoveryTitle')}
                  </div>
                  {aiDiscoveries.map((s, i) => (
                    <div key={i} className="day-ai-find">
                      <b>
                        {s.name}
                        {s.isEvent && <span className="ai-disc-tag ai-event-tag">{t('ai.eventTag')}</span>}
                        {/* The bot knew the place but could not place it: the
                            find is kept, labelled, and simply has no pin. */}
                        {s.unmapped && <span className="ai-disc-tag ai-unmapped-tag">{t('ai.unmappedTag')}</span>}
                      </b>
                      {s.why && <small>{s.why}</small>}
                    </div>
                  ))}
                </div>
              )}
              {gapIdeas.length > 0 && (
                <div className="day-scenic day-gap-ideas">
                  <div className="day-scenic-title">
                    <ClockIcon size={11} /> {t('day.gapTitle', { dur: fmtDur(schedule.freeMin) })}
                  </div>
                  {gapIdeas.map(({ item, idx }) => (
                    <button key={idx} className="day-scenic-row" onClick={() => toggleActivity(idx)} title={t('day.gapAddTitle')}>
                      <span className="day-scenic-text">
                        <b>{item.name}</b>
                        <small>{poiKind(item)}, {t('day.gapFits', { dur: fmtDur(dwellMinutes(poiKind(item), visitFactor)) })}</small>
                      </span>
                      <span className="day-activity-add">+</span>
                    </button>
                  ))}
                </div>
              )}

              {pinnedWalksBlock}

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

              {/* Two controls instead of six: the route link the day actually
                  runs on, and one menu holding every export. A row of large
                  stacked buttons was pushing the plan itself below the fold. */}
              <div className="day-actions-row">
                {gmapsUrl && (
                  <a className="day-action-btn day-action-primary" href={gmapsUrl} target="_blank" rel="noreferrer">
                    <MapPinIcon size={14} /> {t('export.openInGmaps')}
                  </a>
                )}
                <div className="day-export" ref={exportRef}>
                  <button
                    className={`day-action-btn day-export-btn ${exportOpen ? 'open' : ''}`}
                    onClick={() => setExportOpen((v) => !v)}
                    aria-haspopup="menu"
                    aria-expanded={exportOpen}
                  >
                    <DownloadIcon size={14} /> {t('export.exportAndShare')}
                    <ChevronDownIcon size={11} className={exportOpen ? 'day-map-caret up' : 'day-map-caret'} />
                  </button>
                  {exportOpen && (
                    <div className="day-export-menu" role="menu">
                      <button className="day-export-item" role="menuitem" onClick={() => { setExportOpen(false); downloadPdf(); }} title={t('day.downloadPdfTitle')}>
                        <DownloadIcon size={14} /> {t('day.downloadPdf')}
                      </button>
                      <button className="day-export-item" role="menuitem" onClick={() => { setExportOpen(false); downloadKmlFile(); }} title={t('export.myMapsTitle')}>
                        <RouteIcon size={14} /> {t('export.myMaps')}
                      </button>
                      <button className="day-export-item" role="menuitem" onClick={() => { setExportOpen(false); downloadIcsFile(); }} title={t('export.calendarTitle')}>
                        <CalendarIcon size={14} /> {t('export.calendar')}
                      </button>
                      {/* Share stays open so "Copied!" is seen where it was clicked. */}
                      <button className="day-export-item" role="menuitem" onClick={shareDay}>
                        <ShareIcon size={14} /> {shareState === 'copied' ? t('day.copied') : t('day.share')}
                      </button>
                      <button
                        className="day-export-item"
                        role="menuitem"
                        onClick={() => { setExportOpen(false); handleSavedTripsClick(); }}
                        title={plan.standalone || daySaveState === 'saved' ? 'This day plan is in your Saved trips' : 'Keep this day plan in your Saved trips'}
                      >
                        <BookmarkIcon size={14} />
                        {plan.standalone || daySaveState === 'saved' ? 'In Saved trips' : 'Save to Saved trips'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <button
                className="day-carta-btn day-carta-reshape"
                onClick={() => setAiOpen(true)}
                title={t('ai.replanTitle')}
              >
                <SparkIcon size={12} /> {t('ai.replanCta', { n: dayOffset + dayIdx + 1 })}
              </button>

              {/* Add more places / another city, tucked inside the plan card so
                  the sheet stays calm until you go looking. */}
              <Collapsible
                className="day-nested"
                title={`Add more places${stop.dest?.city ? ` in ${stop.dest.city}` : ''}`}
              >
                {addPlacesInner}
              </Collapsible>
              {plan.standalone && (
                <Collapsible className="day-nested" title="Add another city">
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
                </Collapsible>
              )}
            </Collapsible>
          )}

          {/* 3.5 Import ideas: a blog's "one day in Salzburg", an itinerary
              PDF, a pasted link. Carta extracts the activities; each one is a
              tap from becoming a custom stop on the open day, so an already
              planned day grows without retyping anything. */}
          {stop && dayImportContext && (
            <Collapsible
              className="day-import-collapse"
              titleIcon={<UploadIcon size={13} />}
              title={t('day.importTitle')}
              count={ideaList.length ? ideaList.length : null}
            >
              <MagicImportZone
                onResult={stageIdeas}
                importContext={dayImportContext}
                leadKey="day.importLead"
              />
              {ideaList.map((idea) => (
                <div className="day-idea-row" key={idea.id}>
                  <span className="day-idea-text">
                    <b>{idea.name}</b>
                    {(idea.note || idea.durationMin != null) && (
                      <small>
                        {[idea.durationMin != null ? `~${idea.durationMin} min` : null, idea.note]
                          .filter(Boolean).join(', ')}
                      </small>
                    )}
                  </span>
                  <button
                    className="day-idea-add"
                    disabled={customBusy}
                    onClick={() => addCustomPlace(idea.name, { note: idea.note || '', dropIdeaId: idea.id })}
                    title={t('day.importAddTitle', { n: dayOffset + dayIdx + 1 })}
                  >
                    + {t('day.importAddHere', { n: dayOffset + dayIdx + 1 })}
                  </button>
                  <button className="trip-stop-remove" onClick={() => discardIdea(idea)} aria-label={t('extras.removeTitle')} title={t('extras.removeTitle')}>×</button>
                </div>
              ))}
            </Collapsible>
          )}

          {/* 4. Carta's local intel - hand-curated orientation for places whose
              geography a POI list can't explain (Lake Como's Golden Triangle):
              where it's nicest, why, and one-tap adds. Collapsed by default. */}
          {stop && intel && (
            <Collapsible className="day-intel-collapse" titleIcon={<SparkIcon size={13} />} title="Carta's local intel">
              <p className="day-intel-intro">{intel.intro}</p>
              {intel.areas.map((a) => {
                const added = a.idx != null && dayAssignedIdx.includes(a.idx);
                return (
                  <div className={`day-intel-row ${added ? 'added' : ''}`} key={a.name}>
                    <span className="day-intel-body">
                      <span className="day-intel-name">
                        {a.name}
                        <span className="day-intel-tag">{a.tag}</span>
                        {a.item && isMustSee(a.item) && <span className="day-badge-must" title="A true must-see here"><StarIcon size={9} /></span>}
                        {a.item && !isMustSee(a.item) && (a.item.rate ?? 0) >= 2 && <span className="day-badge-rated">top rated</span>}
                      </span>
                      <span className="day-intel-note">{a.note}</span>
                    </span>
                    {a.idx != null && (
                      <button
                        className="day-activity-add day-intel-add"
                        onClick={() => toggleActivity(a.idx)}
                        title={added ? 'Remove from today' : 'Add to today'}
                        aria-pressed={added}
                      >{added ? '✓' : '+'}</button>
                    )}
                  </div>
                );
              })}
              <p className="day-intel-tip"><InfoIcon size={11} /> {intel.tip}</p>
            </Collapsible>
          )}

          {/* 5. How do you get there for the day? Stay -> this city, in the
              chosen mode. Sits below the plan and the local intel. */}
          {plan.standalone && stop && dayTripView && (
            <DayTripTransport
              fromDest={dayTripFrom}
              toDest={dayTripView.toDest}
              opts={dayTripView}
              mode={tripMode}
              onPickMode={setTripMode}
            />
          )}

          {/* Researched iconic walks: the walk itself is the sight. One tap
              pins a walk onto the selected day, so the most beautiful walk is
              part of the plan, not just a tip you read and lose. */}
          {stop && (() => {
            const walks = scenicWalksFor(stop.dest?.city || '');
            if (!walks.length) return null;
            return (
              <Collapsible titleIcon={<MountainIcon size={13} />} title="The most beautiful walk here">
                {walks.map((w) => {
                  const added = dayWalks.includes(w.name);
                  return (
                    <div key={w.name} className={`day-walk${added ? ' added' : ''}`}>
                      <span className="day-walk-text">
                        <b>{w.name}</b>
                        <small>~{w.km} km. {w.note}</small>
                      </span>
                      <button
                        className="day-activity-add day-walk-add"
                        onClick={() => toggleWalk(w.name)}
                        title={added ? 'Remove from this day' : `Add to day ${dayOffset + dayIdx + 1}`}
                        aria-pressed={added}
                      >{added ? '✓' : '+'}</button>
                    </div>
                  );
                })}
              </Collapsible>
            );
          })()}

          {/* Local intel for the country you're exploring */}
          {stop?.dest?.country && countryInsights?.[stop.dest.country] && (
            <Collapsible title="Local tips">
              <CountryIntel country={stop.dest.country} rec={countryInsights[stop.dest.country]} compact />
            </Collapsible>
          )}

          <div className="trip-block">
            <button className="trip-newtrip-btn" onClick={() => setPlan(null)}>← Back to all day plans</button>
          </div>
        </div>
      </div>
    </div>
  );
}
