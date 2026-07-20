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
import { CountryIntel } from '../components/CountryIntel.jsx';
import { useCountryInsights } from '../hooks/useCountryInsights.js';
import { addDays, todayISO, fmtDate as fmtDateFull } from '../lib/dates.js';
import {
  draftDays, tieredActivities, optimizeOrder, pickerDeck, poiCategory, poiMapCat,
  walkableIdxSet, feasibilityLimits, isMustSee, dwellMinutes, VISIT_PACES,
  farWorthySights, scenicSuggestions, MAX_POI_KM_FROM_CITY, poiScore, poiKind,
  isTransportInfraPoi, duplicatePoiIndices, canonicalPoiIndices, poiIdentityKeys,
} from './dayDraft.js';
import { CartaPlanPanel } from './CartaPlanPanel.jsx';
import { openDayPlanPdf } from './dayPlanPdf.js';
import {
  loadStandalonePlans, persistStandalonePlans, deleteStandalonePlan,
  loadAssignments, persistAssignments, loadPrefs, persistPrefs,
  TRIP_DRAFT_PLAN_ID,
} from './dayPlanStore.js';
import { loadTripDraft } from './tripDraftStore.js';
import {
  SparkIcon, StarIcon, InfoIcon, MountainIcon, ShareIcon, MapPinIcon,
  TrainIcon, BusIcon, CarIcon, BedIcon, BookmarkIcon, DownloadIcon,
  FerryIcon, PencilIcon, SearchIcon, CastleIcon, TreeIcon, HomeIcon, CheckIcon,
} from '../components/Icons.jsx';

// How the explore search & "Let Carta guide you" name each pin category.
// i18n keys, resolved with t() at render time.
const EXPLORE_CAT_KEY = { town: 'day.catTown', beach: 'day.catBeach', sight: 'day.catSight', active: 'day.catActive' };

// "Let Carta guide you" questionnaire options (labelKey/subKey -> t()).
const GUIDE_MOODS = [
  { key: 'sight', labelKey: 'day.moodSights', label: 'Sights', Icon: CastleIcon },
  { key: 'beach', labelKey: 'day.moodBeaches', label: 'Beaches & nature', Icon: TreeIcon },
  { key: 'town', labelKey: 'day.moodTowns', label: 'Towns', Icon: HomeIcon },
  { key: 'active', labelKey: 'day.moodActive', label: 'Active', Icon: MountainIcon },
];
const GUIDE_RANGES = [
  { key: 'near', labelKey: 'day.rangeNear', subKey: 'day.rangeNearSub', km: 25 },
  { key: 'far', labelKey: 'day.rangeFar', subKey: 'day.rangeFarSub', km: 1e9 },
];
// Section headings shown in the "Let Carta guide you" recommendation list. This
// panel is not internationalized (its prompts are hardcoded English), so the
// labels are plain strings rather than i18n keys.
const GUIDE_GROUP_LABEL = { town: 'Towns', sight: 'Sights', beach: 'Beaches & nature', active: 'Active' };

const fmtDate = (iso) => (iso ? fmtDateFull(iso).slice(0, 6) : '');

// Remembered height of the mobile day-plan bottom sheet (px). Mirrors the trip
// planner's SHEET_H_KEY so the two sheets behave the same but keep their own
// remembered heights.
const DAY_SHEET_H_KEY = 'carta.daySheetH.v1';

const WALK_KMH = 4.8; // average walking pace, for the straight-line fallback
function estimateWalkMinutes(km) {
  return Math.max(1, Math.round((km / WALK_KMH) * 60));
}

/** "1 h 20 min" / "45 min", visit durations in human units. */
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
  train: { Icon: TrainIcon, labelKey: 'day.modeTrain' },
  bus: { Icon: BusIcon, labelKey: 'day.modeBus' },
  car: { Icon: CarIcon, labelKey: 'day.modeCar' },
};

/**
 * "How do you get there for the day?", from the traveller's base (their stay)
 * to the day-trip destination, using the same per-leg transport engine the
 * Trip planner prices with: train / bus / car, honest distance-based
 * estimates, national-operator booking links, and a day-return framing.
 *
 * The three modes are BUTTONS: the traveller can overrule Carta's pick, and
 * the chosen mode is what the day's timeline and Google Maps handoff use,  * one decision, spoken everywhere.
 *
 *   opts        legTransportOptions result (parent computes it once), or
 *               { local: true } when the stay is already in/next to the city
 *   mode        the active mode key ('train'|'bus'|'car')
 *   onPickMode  choose a different mode (persisted with the plan)
 */
function DayTripTransport({ fromDest, toDest, opts, mode, onPickMode }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (!fromDest || !toDest || !opts) return null;
  // Staying in, or right next to, the day-trip city itself: there's no
  // inter-city hop to recommend, but say so plainly rather than showing
  // nothing (a blank space reads as "the feature is broken").
  if (opts.local) {
    return (
      <div className="trip-block daytrip-transport">
        <div className="trip-block-title">{t('day.gettingTo', { city: toDest.city })}</div>
        <p className="trip-note daytrip-here">
          <SparkIcon size={11} /> {t('day.stayLocalNote', { city: toDest.city })}
        </p>
      </div>
    );
  }
  if (opts.no_road) {
    return (
      <div className="trip-block">
        <div className="trip-block-title">{t('day.gettingThereFrom', { city: fromDest.city })}</div>
        <p className="trip-note">{opts.note || t('day.noOverland')}</p>
      </div>
    );
  }
  const active = opts.modes[mode] ? mode : opts.recommended;
  const cur = opts.modes[active];
  const CurIcon = MODE_META[active].Icon;
  const isRec = active === opts.recommended;
  // A day trip only works if you can be there by mid-morning and back for
  // dinner: flag long rides and suggest when to set off.
  const oneWayH = cur.hours;
  const feasible = oneWayH <= 3;
  const departHint = oneWayH <= 1 ? t('day.departEasy')
    : oneWayH <= 2 ? t('day.depart830')
    : oneWayH <= 3 ? t('day.depart800')
    : t('day.departTooFar');
  const perLabel = active === 'car' ? t('day.perCarSuffix') : t('day.perPersonSuffix');

  return (
    <div className="trip-block daytrip-transport">
      <div className="trip-block-title">{t('day.gettingThereFrom', { city: fromDest.city })}</div>
      <div className="daytrip-reco">
        <span className="daytrip-reco-icon"><CurIcon size={15} /></span>
        <span className="daytrip-reco-main">
          <b>
            {isRec
              ? <><SparkIcon size={10} /> {t('day.bestBet', { mode: t(MODE_META[active].labelKey) })}</>
              : <>{t('day.yourPick', { mode: t(MODE_META[active].labelKey) })}</>}
          </b>
          <small>
            {t('day.modeSummary', {
              km: opts.road_km,
              dur: fmtDur(cur.hours * 60),
              fare: `${eur(cur.eur_pp)}${perLabel}`,
              ret: eur(cur.eur_pp * 2),
              split: active === 'car' ? t('day.splitWithGroup') : '',
            })}
          </small>
          <small className={feasible ? 'daytrip-hint' : 'daytrip-hint warn'}>{departHint}</small>
          {opts.transit_reason && (
            <small className="daytrip-hint warn">{opts.transit_reason}</small>
          )}
          {!isRec && (
            <small className="daytrip-hint">
              {t('day.cartaPickWouldBe', { mode: t(MODE_META[opts.recommended].labelKey).toLowerCase() })}
            </small>
          )}
        </span>
        <button className="daytrip-more" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? t('day.less') : t('day.compare')}
        </button>
      </div>
      {open && (
        <>
          <div className="trip-leg-modes daytrip-modes">
            {Object.entries(opts.modes).map(([m, o]) => (
              <button
                key={m}
                type="button"
                className={`trip-leg-mode daytrip-mode-btn ${active === m ? 'on' : ''}`}
                onClick={() => onPickMode?.(m)}
                aria-pressed={active === m}
                title={t('day.planAroundMode', { mode: t(MODE_META[m].labelKey).toLowerCase() })}
              >
                <span>
                  {React.createElement(MODE_META[m].Icon, { size: 12 })} {t(MODE_META[m].labelKey)}
                  {opts.recommended === m && <SparkIcon size={9} />}
                </span>
                <b>{eur(o.eur_pp)}{m === 'car' ? t('day.perCarShort') : t('day.perPersonShort')}</b>
                <small>{t('day.eachWay', { dur: fmtDur(o.hours * 60) })}</small>
              </button>
            ))}
          </div>
          <p className="trip-leg-note daytrip-pick-note">{t('day.tapMode')}</p>
          {opts.train_dropped && (
            <p className="trip-leg-note">
              {t('day.noRailLink', { city: toDest.city })}
            </p>
          )}
          <div className="trip-leg-links">
            {cur.links.map((l, j) => (
              <a key={j} href={l.url} target="_blank" rel="noreferrer">{l.label} ↗</a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function DayPlannerTab({ data, user, authConfigured, openPlanId, onOpenPlanConsumed }) {
  const { t } = useI18n();
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
  // Carta-plan answers (null until asked) + whether the inline plan panel
  // (the "Shape day N" questions in the rail) is open.
  const [prefs, setPrefs] = useState(null);
  const [showShape, setShowShape] = useState(false);
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
    // Land straight on the big map with its pickable pins, no modal in the
    // way. The Carta-plan panel stays one tap away in the rail.
    setShowShape(false);
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

  const itemsForStop = (s, fullMap = actFull) => {
    const a = s?.dest?.activities;
    if (!a) return { items: [], walkable: new Set(), suppressed: new Set(), canon: new Map(), limited: true };
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
      const { suppressed, canon } = canonicalPoiIndices(full);
      const walkable = walkableIdxSet(full, s.dest);
      suppressed.forEach((i) => walkable.delete(i));
      return { items: full, walkable, suppressed, canon, limited: false };
    }
    const items = (a.items || []).map((it) => ({ ...it, lat: null, lon: null }));
    const { suppressed, canon } = canonicalPoiIndices(items);
    const walkable = new Set(items.map((_, i) => i).filter((i) => !suppressed.has(i)));
    return { items, walkable, suppressed, canon, limited: true };
  };

  const activities = useMemo(() => itemsForStop(stop), [stop, actFull]); // eslint-disable-line react-hooks/exhaustive-deps

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
  useEffect(() => { setMapCat('all'); }, [stopIdx, plan?.id]);

  // Places already laid into ANY day of this city: their pins are hidden, so
  // a place can't be double-added across days from the map.
  const assignedAnyDay = useMemo(() => {
    const used = new Set();
    Object.values(assignments[stopIdx] || {}).forEach((lst) => (lst || []).forEach((i) => used.add(i)));
    return used;
  }, [assignments, stopIdx]);

  const mapDeck = useMemo(
    () => (stop?.dest
      ? pickerDeck(activities.items, [], 48, activities.walkable)
        .filter(({ idx }) => !assignedAnyDay.has(idx))
      : []),
    [activities, stop, assignedAnyDay],
  );

  const mapCatCounts = useMemo(() => {
    const c = { all: mapDeck.length, sight: 0, nature: 0, active: 0, food: 0 };
    mapDeck.forEach(({ item }) => { c[poiCategory(item)] += 1; });
    return c;
  }, [mapDeck]);

  const mapPois = useMemo(
    () => mapDeck
      .filter(({ item }) => mapCat === 'all' || poiCategory(item) === mapCat)
      .map(({ item, idx }) => ({
        id: String(idx),
        label: item.name,
        lat: item.lat,
        lon: item.lon,
        cat: poiMapCat(item),
        must: isMustSee(item),
      })),
    [mapDeck, mapCat],
  );

  // Outstanding sights BEYOND walking range, their own excursion, but too
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
            ? t('day.kmFromTrip', { km: Math.round(km), city: stop.dest.city })
            : null,
        };
      });
  }, [poiQuery, activities, stop, t]);

  // Draft from the Carta-plan answers, scoped to THIS city, never the whole
  // plan. scope 'day' redrafts only the selected day (places already laid
  // into the city's other days stay put and are never duplicated); scope
  // 'stay' redrafts every day of the current city. `areaIdx` (the which-part-
  // of-town answer) narrows what a draft may use, so a big city's draft stays
  // in the centre unless the traveller asked otherwise.
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
    };
    setPrefs(savedPrefs);
    persistPrefs(plan?.id, savedPrefs);
    setShowShape(false);
  };

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
  // (plus parking), buses the same road with stops and a wait, trains their
  // own (rail-speed) model. Shared by the card and the timeline's ride leg.
  const rideMinutes = (mode, roadKm, drivingMin) => {
    if (mode === 'car') return Math.max(5, Math.round(drivingMin * 1.08 + 5));
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

  // "How long at each stop" answer scales the visit-time estimates shown on
  // the timeline and in the day total.
  const visitFactor = (VISIT_PACES.find((v) => v.key === prefs?.visit) || VISIT_PACES[1]).factor;
  const dwellFor = (it) => dwellMinutes(poiKind(it), visitFactor);
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
    // name feeds the Google Maps export: "<sight>, <city>" geocodes to the
    // real listing instead of a nameless "Dropped pin" at the coordinates.
    .map((it) => ({
      lat: it.lat, lon: it.lon, city: it.name,
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
              {' · '}
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
    .map(([id, d]) => ({ value: id, label: `${d.city}, ${d.country}` }))
    .sort((a, b) => a.label.localeCompare(b.label)), [destinations]);

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
  const BEACH_NATURE_RE = /beach|strand|playa|plage|nature|park|lake|waterfall|island|cliff|bay|lagoon|garden|dune|gorge|cave/i;

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
    const query = exploreQuery.trim().toLowerCase();
    if (query.length < 2) return [];
    const t2 = t; // the town loop below shadows `t`
    const out = [];
    for (const t of exploreTowns) {
      if (t.id === stayTownId) continue; // that town is the red stay pin itself
      if ((t.dest.city || '').toLowerCase().includes(query)) {
        out.push({
          id: `t:${t.id}`, cat: 'town', label: t.dest.city,
          sub: `${t2(EXPLORE_CAT_KEY.town)} · ${t2('day.kmFromStay', { km: t.km })}`,
          rating: t.dest.rating || null,
          lat: t.lat, lon: t.lon,
          score: (t.dest.rating?.score || 0) + 6,
        });
      }
    }
    for (const p of explorePois) {
      if (`${p.item.name || ''} ${p.item.kind || ''}`.toLowerCase().includes(query)) {
        const flag = isMustSee(p.item) ? t2('day.mustSeeTag')
          : (p.item.rate ?? 0) >= 2 ? t2('day.topRated')
          : p.item.heritage ? t2('day.heritageTag') : '';
        out.push({
          id: p.key, cat: p.cat, label: p.item.name,
          sub: `${p.item.kind || t2(EXPLORE_CAT_KEY[p.cat])} · ${t2('day.kmAway', { km: p.km })}${flag ? ` · ${flag}` : ''}`,
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

  // Landing screen: plan a day for any city (no trip required), reopen a saved
  // day plan, or pick one of your saved trips to plan its stops.
  if (!plan) {
    return (
      <div className="trip-planner-screen day-landing-screen">
        <div className={`day-landing${newStayPoint ? ' day-landing-wide' : ''}`}>
          {editingPlanId && (
            <div className="day-edit-banner">
              <span><PencilIcon size={13} /> {t('day.editBanner')}</span>
              <button className="day-edit-cancel" onClick={cancelEditOnMap}>{t('day.cancel')}</button>
            </div>
          )}
          <div className="section-title">{editingPlanId ? t('day.changePlaces') : t('day.dayPlanner')}</div>
          <p className="day-landing-lead">
            {editingPlanId
              ? t('day.editLead')
              : t('day.landingLead')}
          </p>

          <div className="day-build">
            {/* 1. Where are you staying - town, street, hotel or apartment
                  address. It anchors everything: the map, the routes, the
                  getting-there advice. */}
            <div className="day-build-row day-build-top">
              <label className="trip-field day-build-field">
                <span className="trip-field-label"><span className="day-step-num">1</span> {t('day.whereStaying')}</span>
                {newStayPoint ? (
                  <div className="day-stay-chosen">
                    <span className="day-stay-chosen-label">{newStayPoint.shortLabel || newStayPoint.label}</span>
                    <button className="trip-stop-remove" onClick={() => { setNewStayPoint(null); setStayResults(null); setExploreFocus(''); }} aria-label={t('day.clearAddress')} title={t('day.clear')}>×</button>
                  </div>
                ) : (
                  <div className="day-stay-search">
                    <input
                      className="day-stay-input"
                      type="text"
                      value={stayQuery}
                      onChange={(e) => setStayQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') searchStay(); }}
                      placeholder={t('day.stayPlaceholder')}
                      aria-label={t('day.stayAria')}
                    />
                    <button className="trip-add-btn" onClick={searchStay} disabled={staySearching || stayQuery.trim().length < 3}>
                      {staySearching ? '…' : t('day.find')}
                    </button>
                  </div>
                )}
              </label>
              <label className="trip-field day-build-date">
                <span className="trip-field-label">{t('day.firstDay')}</span>
                <DateField value={newStartDate} onChange={setNewStartDate} placeholder={t('day.startDate')} />
              </label>
            </div>
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
                <p className="trip-note">{t('day.noAddressMatchTown')}</p>
              )
            )}

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
                        <p className="trip-note">{t('day.planVisitDur', { dur: fmtDur(dwellMinutes(poiKind(focusedExplore.item))) })}</p>
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
                </span>
                {newStops.map((s) => {
                  const d = destinations[s.destinationId];
                  return (
                    <div className="day-build-city" key={s.destinationId}>
                      <span className="day-build-city-name">
                        {d?.city || t('day.unknown')}
                        <small>{d?.country}</small>
                      </span>
                      <div className="trip-people day-days-stepper">
                        <button type="button" onClick={() => setLandingDays(s.destinationId, s.days - 1)} disabled={s.days <= 1} aria-label={t('day.fewerDays')}>-</button>
                        <span>{s.days} {s.days === 1 ? t('day.dayWord') : t('day.daysWord')}</span>
                        <button type="button" onClick={() => setLandingDays(s.destinationId, s.days + 1)} aria-label={t('day.moreDays')}>+</button>
                      </div>
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

          {/* Your saved day plans (stored on this device) */}
          {standalonePlans.length > 0 && (
            <div className="day-landing-section">
              <div className="trip-block-title">{t('day.yourDayPlans')}</div>
              <div className="trip-saved-list">
                {standalonePlans.map((sp) => (
                  <div className="trip-saved-item" key={sp.id}>
                    <button className="trip-saved-main" onClick={() => openStandalone(sp)}>
                      {sp.label || destinations[sp.stops?.[0]?.destinationId]?.city || t('day.dayPlanFallback')}
                      <small className="day-saved-sub">
                        {', '}{fmtDate(sp.startDate)}
                        {(sp.stops?.reduce((n, s) => n + (s.days || 1), 0) || 1) > 1
                          ? t('day.nDaysSuffix', { n: sp.stops.reduce((n, s) => n + (s.days || 1), 0) })
                          : ''}
                        {(sp.stops?.length || 1) > 1 ? t('day.nCitiesSuffix', { n: sp.stops.length }) : ''}
                      </small>
                    </button>
                    <button className="trip-saved-del" onClick={() => deleteStandalone(sp.id)} aria-label={t('day.deleteDayPlan')} title={t('day.delete')}>×</button>
                  </div>
                ))}
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
                  {savedPlans.map((p) => (
                    <div className="trip-saved-item" key={p.id}>
                      <button className="trip-saved-main" onClick={() => openPlan(p.id)}>
                        {p.label || t('day.untitledTrip')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {authConfigured && !user && (
            <p className="trip-note">
              {t('day.signInNote')}
            </p>
          )}
          {!authConfigured && (
            <p className="trip-note">
              {t('day.noAuthNote')}
            </p>
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
            <p className="trip-note">{t('day.poiSearchEmpty', { q: poiQuery.trim(), city: stop.dest?.city || 'here' })}</p>
          )
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
      <TripMap
        stops={routePins}
        padBottom={isNarrow ? Math.min(sheetPx, 420) : 420}
        routeGeometry={routeOk ? route.geometry : null}
        routeSegments={routeOk ? route.segments : null}
        focus={stop?.dest?.lat != null ? { ...cityCoords(stop.dest), zoom: 12.2 } : null}
        pois={mapPois}
        onPoiClick={(id) => toggleActivity(Number(id))}
        fitMaxZoom={13}
      />

      {/* Floating map tools: category chips filter the pickable pins, and the
          hint says what tapping one does. Sits over the map, never over the
          rail, and collapses to a scrollable row on phones. */}
      {stop && mapDeck.length > 0 && (
        <div className="day-map-tools" onClick={(e) => e.stopPropagation()}>
          <div className="day-map-chips">
            {[
              ['all', 'All'],
              ['sight', 'Sights'],
              ['nature', 'Nature'],
              ['active', 'Active'],
              ['food', 'Food'],
            ].filter(([k]) => k === 'all' || mapCatCounts[k] > 0).map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={`shape-cat-chip day-map-chip ${mapCat === k ? 'on' : ''}`}
                onClick={() => setMapCat(k)}
                aria-pressed={mapCat === k}
              >
                {label}
                <span className="shape-cat-count">{mapCatCounts[k]}</span>
              </button>
            ))}
          </div>
          <span className="day-map-hint">
            Tap a pin to add it to day {dayOffset + dayIdx + 1}
          </span>
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

          {/* 3. Today's plan. The Carta-plan panel (when open) takes this
              spot: one compact screen of pre-answered questions that drafts
              the SELECTED day right here in the rail - the big map and its
              pins stay in view the whole time. Otherwise: empty days get the
              CTA + place browser, planned days the collapsible plan card. */}
          {stop && showShape && (
            <CartaPlanPanel
              city={stop.dest?.city || 'this city'}
              cityDest={stop.dest}
              dayNumber={dayOffset + dayIdx + 1}
              numDays={days.length}
              items={activities.items}
              walkable={activities.walkable}
              stayPoint={stayAnchor}
              initial={prefs}
              onDraft={applyDraft}
              onClose={() => setShowShape(false)}
            />
          )}
          {stop && !showShape && assignedItems.length === 0 && (
            <div className="trip-block day-plan-block">
              <div className="trip-block-title">Today's plan</div>
              <button className="day-carta-btn" onClick={() => setShowShape(true)}>
                <SparkIcon size={12} /> Let Carta plan day {dayOffset + dayIdx + 1} for me
              </button>
              <p className="trip-note">
                Or build it yourself: tap the pins on the map, or add places
                below. Carta keeps the walking order optimal as you add.
              </p>
              <Collapsible
                className="day-nested"
                title={`Add places${stop.dest?.city ? ` in ${stop.dest.city}` : ''}`}
                defaultOpen
              >
                {addPlacesInner}
              </Collapsible>
            </div>
          )}

          {stop && !showShape && assignedItems.length > 0 && (
            <Collapsible
              className="day-plan-block day-plan-collapse"
              title="Today's plan"
              count={assignedItems.length}
              summary={<span className="day-plan-summary-text">{planSummaryText}</span>}
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
              </div>
              {routeInfoOpen && <p className="day-route-info-note">{routeSummary}</p>}

              <div className="day-timeline">
                {stayLeg && (
                  <div className={`day-timeline-walk day-timeline-stay${stayLeg.ferry ? ' day-timeline-ferry' : ''}${stayLeg.ride ? ' day-timeline-ride' : ''}`}>
                    {legContent(stayLeg, true)}
                    {stayLeg.ride && (
                      <small className="day-timeline-ride-note">
                        Park up or hop off; from here today's route is on foot.
                      </small>
                    )}
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
                    <MapPinIcon size={14} /> {t('export.openInGmaps')}
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
                <button className="day-action-btn" onClick={downloadPdf} title={t('day.downloadPdfTitle')}>
                  <DownloadIcon size={14} /> {t('day.downloadPdf')}
                </button>
                <button className="day-action-btn" onClick={shareDay}>
                  <ShareIcon size={14} /> {shareState === 'copied' ? t('day.copied') : t('day.share')}
                </button>
              </div>
              <button
                className="day-carta-btn day-carta-reshape"
                onClick={() => setShowShape(true)}
                title="Answer the quick questions again and let Carta redraft this day"
              >
                <SparkIcon size={12} /> Not happy? Let Carta reshape day {dayOffset + dayIdx + 1}
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

          {/* Researched iconic walks: the walk itself is the sight. */}
          {stop && (() => {
            const walks = scenicWalksFor(stop.dest?.city || '');
            if (!walks.length) return null;
            return (
              <Collapsible titleIcon={<MountainIcon size={13} />} title="The most beautiful walk here">
                {walks.map((w) => (
                  <div key={w.name} className="day-walk">
                    <b>{w.name}</b>
                    <small>~{w.km} km. {w.note}</small>
                  </div>
                ))}
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

/**
 * "Let Carta guide you", the alternative to hunting on the map yourself.
 * Two quick questions (what are you in the mood for, and how far you'll roam),
 * then Carta recommends the best-rated towns, sights, beaches and activities
 * around the stay. Each recommendation shows its rating and a short note, can
 * be previewed on the map, and added to the day with one tap.
 *
 *   towns / pois     the same explore candidates the map is built from
 *   pickedTownIds    Set of destinationIds already in the plan
 *   pickedPoiKeys    Set of poi keys already picked
 *   onToggleTown(t)  add/remove a town   onTogglePoi(p) add/remove a place
 *   onPreview(cat, lat, lon, focusId)    glide the map to a recommendation
 */
function CartaGuidePanel({ towns, pois, stayTownId, pickedTownIds, pickedPoiKeys, onToggleTown, onTogglePoi, onPreview, onClose }) {
  const [moods, setMoods] = useState(() => new Set(['sight', 'beach', 'town', 'active']));
  const [range, setRange] = useState('far');
  const [topOnly, setTopOnly] = useState(false); // only the genuinely highly-rated
  const [phase, setPhase] = useState('ask');      // 'ask' | 'results'

  const toggleMood = (k) => setMoods((prev) => {
    const n = new Set(prev);
    n.has(k) ? n.delete(k) : n.add(k);
    return n;
  });

  const cap = (GUIDE_RANGES.find((r) => r.key === range) || GUIDE_RANGES[1]).km;

  // Build the recommendation groups from the chosen moods, distance and quality
  // bar. Towns rank by their 0-10 rating; places by Carta's POI score (already
  // the order they arrive in), keeping the strongest of each kind on top.
  const groups = useMemo(() => {
    const g = [];
    if (moods.has('town')) {
      const list = towns
        .filter((t) => t.id !== stayTownId && t.km <= cap)
        .filter((t) => !topOnly || (t.dest.rating?.score || 0) >= 7.5 || t.dest.rating?.hidden_gem)
        .sort((a, b) => (b.dest.rating?.score || 0) - (a.dest.rating?.score || 0))
        .slice(0, 5)
        .map((t) => ({ type: 'town', key: `t:${t.id}`, town: t }));
      if (list.length) g.push({ cat: 'town', label: GUIDE_GROUP_LABEL.town, items: list });
    }
    for (const cat of ['sight', 'beach', 'active']) {
      if (!moods.has(cat)) continue;
      const list = pois
        .filter((p) => p.cat === cat && p.km <= cap)
        .filter((p) => !topOnly || isMustSee(p.item) || (p.item.rate ?? 0) >= 2 || p.item.heritage)
        .slice(0, 5)
        .map((p) => ({ type: 'poi', key: p.key, poi: p }));
      if (list.length) g.push({ cat, label: GUIDE_GROUP_LABEL[cat], items: list });
    }
    return g;
  }, [moods, cap, topOnly, towns, pois, stayTownId]);

  const total = groups.reduce((n, grp) => n + grp.items.length, 0);

  return (
    <div className="day-guide-panel">
      <div className="day-guide-panel-head">
        <span className="day-guide-panel-title"><SparkIcon size={13} /> Let Carta guide you</span>
        <button className="day-guide-panel-close" onClick={onClose} aria-label="Close">×</button>
      </div>

      {phase === 'ask' ? (
        <div className="day-guide-ask">
          <span className="day-guide-q">What are you in the mood for?</span>
          <div className="day-guide-moods">
            {GUIDE_MOODS.map((m) => (
              <button
                key={m.key}
                className={`day-guide-mood ${moods.has(m.key) ? 'on' : ''}`}
                onClick={() => toggleMood(m.key)}
                aria-pressed={moods.has(m.key)}
              >
                <m.Icon size={17} />
                <span>{m.label}</span>
              </button>
            ))}
          </div>

          <span className="day-guide-q">How far will you roam?</span>
          <div className="day-guide-range">
            {GUIDE_RANGES.map((r) => (
              <button
                key={r.key}
                className={`day-guide-range-opt ${range === r.key ? 'on' : ''}`}
                onClick={() => setRange(r.key)}
                aria-pressed={range === r.key}
              >
                <b>{r.label}</b>
                <small>{r.sub}</small>
              </button>
            ))}
          </div>

          <button
            className={`day-guide-toponly ${topOnly ? 'on' : ''}`}
            onClick={() => setTopOnly((v) => !v)}
            aria-pressed={topOnly}
          >
            {topOnly && <CheckIcon size={11} />} Only show the highly rated
          </button>

          <button
            className="day-guide-go"
            onClick={() => setPhase('results')}
            disabled={moods.size === 0}
          >
            <SparkIcon size={12} /> Show me what Carta recommends
          </button>
        </div>
      ) : (
        <div className="day-guide-results">
          <button className="day-guide-back" onClick={() => setPhase('ask')}>← Change answers</button>
          {total === 0 ? (
            <p className="trip-note">Nothing around your stay fits that yet. Try widening the range, or turning off "highly rated only".</p>
          ) : (
            groups.map((grp) => (
              <div className="day-guide-group" key={grp.cat}>
                <div className="day-guide-group-title">
                  <span className={`day-explore-search-dot cat-${grp.cat}`} /> {grp.label}
                </div>
                {grp.items.map((rec) => {
                  if (rec.type === 'town') {
                    const t = rec.town;
                    const picked = pickedTownIds.has(t.id);
                    return (
                      <div className={`day-guide-rec ${picked ? 'picked' : ''}`} key={rec.key}>
                        <button
                          className="day-guide-rec-main"
                          onClick={() => onPreview('town', t.lat, t.lon, `t:${t.id}`)}
                          title="Show on the map"
                        >
                          {t.dest.image?.url
                            ? <span className="day-guide-rec-photo" style={{ backgroundImage: `url(${t.dest.image.url})` }} />
                            : <span className="day-guide-rec-photo day-guide-rec-photo-empty">{t.dest.city.slice(0, 1)}</span>}
                          <span className="day-guide-rec-body">
                            <span className="day-guide-rec-name">
                              {t.dest.city}
                              {t.dest.rating?.score != null && <ScoreChip rating={t.dest.rating} size="xs" />}
                              {t.dest.rating?.hidden_gem && <HiddenGemTag />}
                            </span>
                            <span className="day-guide-rec-meta">{t.km} km from your stay</span>
                            <span className="day-guide-rec-desc">{cityInsight(t.dest)}</span>
                          </span>
                        </button>
                        <button className={`day-guide-rec-add ${picked ? 'on' : ''}`} onClick={() => onToggleTown(t)}>
                          {picked ? <><CheckIcon size={11} /> Added</> : '+ Add'}
                        </button>
                      </div>
                    );
                  }
                  const p = rec.poi;
                  const item = p.item;
                  const picked = pickedPoiKeys.has(p.key);
                  const must = isMustSee(item);
                  return (
                    <div className={`day-guide-rec ${picked ? 'picked' : ''}`} key={rec.key}>
                      <button
                        className="day-guide-rec-main"
                        onClick={() => onPreview(p.cat, p.lat, p.lon, p.key)}
                        title="Show on the map"
                      >
                        {item.img
                          ? <span className="day-guide-rec-photo" style={{ backgroundImage: `url(${item.img})` }} />
                          : <span className="day-guide-rec-photo day-guide-rec-photo-empty">{(item.kind || '·').slice(0, 1)}</span>}
                        <span className="day-guide-rec-body">
                          <span className="day-guide-rec-name">
                            {item.name}
                            {must && <span className="day-guide-badge must"><StarIcon size={9} /> Must see</span>}
                            {!must && (item.rate ?? 0) >= 2 && <span className="day-guide-badge rated">Highly rated</span>}
                            {item.heritage && <span className="day-guide-badge heritage">Heritage</span>}
                          </span>
                          <span className="day-guide-rec-meta">
                            {poiKind(item) ? `${poiKind(item)}, ` : ''}{p.km} km away · ~{fmtDur(dwellMinutes(poiKind(item)))} visit
                          </span>
                          {item.desc && <span className="day-guide-rec-desc">{item.desc}</span>}
                        </span>
                      </button>
                      <button className={`day-guide-rec-add ${picked ? 'on' : ''}`} onClick={() => onTogglePoi(p)}>
                        {picked ? <><CheckIcon size={11} /> Added</> : '+ Add'}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** One stop of today's timeline: photo, name + kind, reorder/remove tools and
 *  an ⓘ toggle so a planned day stays revisitable (what is this place again?)
 *  without leaving the plan. */
/**
 * A titled, collapsible card. Collapsed by default (pass defaultOpen to lead
 * open), the whole header is one big tap target, good for thumbs, and the
 * optional `summary` line shows, while collapsed, what's tucked inside so the
 * card is never a mystery box. `count` renders a small pill after the title.
 */
function Collapsible({ title, titleIcon, count, summary, defaultOpen = false, className = '', children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`trip-block day-collapse ${open ? 'open' : ''} ${className}`}>
      <button className="day-collapse-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="day-collapse-headline">
          <span className="day-collapse-title">
            {titleIcon}
            {title}
            {count != null && <span className="day-collapse-count">{count}</span>}
          </span>
          <span className="day-collapse-caret" aria-hidden="true">{open ? '−' : '+'}</span>
        </span>
        {!open && summary && <span className="day-collapse-summary">{summary}</span>}
      </button>
      {open && <div className="day-collapse-body">{children}</div>}
    </div>
  );
}

function AssignedRow({ item, index, last, dwellMin, onMoveUp, onMoveDown, onRemove }) {
  const [infoOpen, setInfoOpen] = useState(false);
  return (
    <div className="day-timeline-row">
      <div className="day-timeline-num">{index + 1}</div>
      <div className="day-assigned-row day-assigned-with-info">
        {item.img && <span className="day-thumb" style={{ backgroundImage: `url(${item.img})` }} />}
        <div className="day-assigned-body">
          <span className="day-assigned-name">
            {item.name}
            {isMustSee(item) && <span className="day-badge-must" title="A true must-see here"><StarIcon size={9} /></span>}
            {!isMustSee(item) && (item.rate ?? 0) >= 2 && <span className="day-badge-rated" title="Among the best-rated places here">top rated</span>}
            {item.heritage && <span className="day-badge-heritage" title="On a cultural-heritage register">heritage</span>}
          </span>
          <span className="day-assigned-kind">
            {poiKind(item)}
            {dwellMin ? `, ~${fmtDur(dwellMin)} visit` : ''}
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
              {item.desc || `${poiKind(item) || 'Place'} in this city.`}
              {!item.desc && isMustSee(item) ? ' Among the highest-rated sights here.' : ''}
            </p>
            {safeUrl(item.wiki) && (
              <a href={safeUrl(item.wiki)} target="_blank" rel="noreferrer">Read more on Wikipedia ↗</a>
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
            {!isMustSee(item) && variant !== 'must' && (item.rate ?? 0) >= 2 && <span className="day-badge-rated" title="Among the best-rated places here">top rated</span>}
            {item.heritage && <span className="day-badge-heritage" title="On a cultural-heritage register">heritage</span>}
          </span>
          <span className="day-assigned-kind">{poiKind(item)}</span>
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
            {item.desc || `${poiKind(item) || 'Place'} in this city.`}
            {!item.desc && isMustSee(item) ? ' Among the highest-rated sights here.' : ''}
            {` Plan ~${fmtDur(dwellMinutes(poiKind(item)))} for a visit.`}
          </p>
          {safeUrl(item.wiki) && (
            <a href={safeUrl(item.wiki)} target="_blank" rel="noreferrer">Read more on Wikipedia ↗</a>
          )}
        </div>
      )}
    </div>
  );
}
