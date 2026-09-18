import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TripMap } from '../map/TripMap.jsx';
import { DayExploreMap } from '../map/DayExploreMap.jsx';
import { Dropdown } from '../components/Dropdown.jsx';
import { DateField } from '../components/DateField.jsx';
import { ScoreChip, HiddenGemTag } from '../components/RatingBadge.jsx';
import { tripDaysBetween, haversineKm, cityCoords, withCityCoords } from '../lib/runtime_pricing.js';
import { legTransportOptions } from '../lib/transport.js';
import { eur, safeUrl } from '../lib/format.js';
import { cityLabel, cityKeyName } from '../lib/placeName.js';
import { fetchDestPoiMap } from '../lib/appData.js';
import { fetchTripPlans, fetchTripPlanWithStops } from '../auth/tripPlanStorage.js';
import { fetchWalkingRoute, fetchDrivingRoute, googleMapsDirUrl } from '../lib/routing.js';
import { useI18n } from '../i18n/index.jsx';
import { localIntelFor } from '../lib/localIntel.js';
import { geocodeAddress, reverseGeocode, geoLines } from '../lib/geocode.js';
import { scenicWalksFor } from '../lib/scenicWalks.js';
import { findCitytrip, resolveCitytripStops, loadTrail } from '../lib/citytrips.js';
import { useCountryInsights } from '../hooks/useCountryInsights.js';
import { addDays, todayISO, laterISO, useToday, fmtDate as fmtDateFull } from '../lib/dates.js';
import {
  draftDays, tieredActivities, optimizeOrder, pickerDeck, poiCategory, poiMapCat,
  walkableIdxSet, feasibilityLimits, isMustSee, dwellMinutes, VISIT_PACES,
  farWorthySights, scenicSuggestions, MAX_POI_KM_FROM_CITY, poiScore, poiKind,
  poiRating, isTransportInfraPoi, isCommercialNoisePoi, duplicatePoiIndices,
  canonicalPoiIndices, poiIdentityKeys, DAY_STYLES, routeCandidates,
} from './dayDraft.js';
import { AiDayPlanModal } from './AiDayPlanModal.jsx';
import { usePaywall } from '../hooks/usePaywall.jsx';
import { CartaChatPlanner } from './CartaChatPlanner.jsx';
import {
  buildAiCandidates, requestAiDayPlan, splitAiPlan, decorateAiStops,
} from './aiDayPlan.js';
import { buildCityCandidates, requestCitySuggestion } from './aiCitySuggest.js';
import { openDayPlanPdf } from './dayPlanPdf.js';
import { openDayPlanKml } from './dayPlanKml.js';
import { openDayPlanIcs } from './dayPlanIcs.js';
import { DayTripTransport } from './DayTripTransport.jsx';
import { DayExploreBuilder } from './DayExploreBuilder.jsx';
import { estimateWalkMinutes, fmtDur } from './dayFormat.js';
import {
  buildDaySchedule, fmtClockLoose, GAP_SUGGEST_MIN, DAY_START_MIN,
} from './daySchedule.js';
import { formatSteps, kmToSteps, stepsToKm } from '../lib/steps.js';
import { fetchForecast, weatherKind } from '../lib/weather.js';
import { loadDossier } from '../lib/dossier.js';
import { searchFold } from '../lib/textSearch.js';
import { useShortlistPoints, resolveFeatureRow } from '../hooks/useFavoriteItems.js';
import { PoiThumb } from './DayActivityRows.jsx';
import { DayIdeasStep } from './DayIdeasStep.jsx';
import { DayPlanPanel } from './DayPlanPanel.jsx';
import { DayAddPanel } from './DayAddPanel.jsx';
import { DayFilesPanel } from './DayFilesPanel.jsx';
import {
  DayStayBar, DayTipsPanel, CartaBotFab, DayTabsRail, BOT_PROMPTS,
} from './DayWorkspaceChrome.jsx';
import {
  loadStandalonePlans, persistStandalonePlans, deleteStandalonePlan,
  loadAssignments, persistAssignments, loadPrefs, persistPrefs,
  loadTripExtras, persistTripExtras,
  subscribeDayPlanStore, TRIP_DRAFT_PLAN_ID,
} from './dayPlanStore.js';
import { loadTripDraft } from './tripDraftStore.js';
import { plannerStore } from './plannerStore.js';
import {
  loadDiscovered, saveDiscovered, removeDiscovered, subscribeDiscovered, isStale,
} from './discoveredStore.js';
import { researchCity } from '../lib/cityResearch.js';
import {
  SparkIcon, StarIcon, InfoIcon, MountainIcon, ShareIcon, MapPinIcon,
  BedIcon, BookmarkIcon, DownloadIcon, RouteIcon,
  PencilIcon, SearchIcon, HomeIcon, CheckIcon, CalendarIcon,
  ClockIcon, CoffeeIcon, FilterIcon, ChevronDownIcon, ChevronRightIcon,
  UploadIcon, CrosshairIcon, TownIcon,
  ArrowLeftIcon,
} from '../components/Icons.jsx';
import {
  ContinueTripCards, DayPlanCards, hasImminentTrip,
} from './DayTripCards.jsx';
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

// How close a shortlisted place and a harvested POI have to be before they
// are treated as the same thing. 1.2 km is generous enough to survive the two
// sources disagreeing about where a long beach or a lake "is" (one may pin
// the car park, the other the water), and tight enough that it cannot snap
// onto a different landmark in a dense old town.
const SHORTLIST_SNAP_KM = 1.2;

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


// The two previews on the fork step (D7). The point of them is that the
// difference between the routes is VISIBLE before you read either card: one
// answer is a line through the day, the other is the places themselves.
// Both are decoration and carry aria-hidden on their wrapper.

/** A day as Carta draws it: a walking line that calls at four stops. */
function RoutePreview() {
  return (
    <svg viewBox="0 0 200 64" preserveAspectRatio="none" role="presentation">
      <path
        d="M14 46 C 44 46, 44 18, 74 18 S 118 46, 140 34 S 176 16, 190 20"
        fill="none" stroke="var(--accent)" strokeWidth="2.4"
        strokeLinecap="round" strokeDasharray="1 6"
      />
      {[[14, 46], [74, 18], [140, 34], [190, 20]].map(([cx, cy], i) => (
        <circle
          key={i} cx={cx} cy={cy} r={i === 0 ? 5 : 3.6}
          fill={i === 0 ? 'var(--accent)' : 'var(--paper)'}
          stroke="var(--accent)" strokeWidth="2"
        />
      ))}
    </svg>
  );
}

/** Three real places near the stay. Real photos, because the claim the card
 *  makes is "these are the places you would be browsing". With fewer than
 *  three photos in hand the empty cells stay as plain paper rather than
 *  showing a stretched duplicate. */
function ThumbsPreview({ photos = [] }) {
  return (
    <span className="day-flow-card-thumbs">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="day-flow-card-thumb"
          style={photos[i] ? { backgroundImage: `url(${photos[i]})` } : undefined}
        />
      ))}
    </span>
  );
}

// The landing questions that share the one form canvas. 'chat' and 'manual'
// are not questions, they are where the flow hands over, so they render on
// their own and are deliberately absent here.
const FORM_STEPS = new Set(['stay', 'when', 'ideas', 'how']);

export const DayPlannerTab = React.memo(function DayPlannerTab({
  data, user, authConfigured, openPlanId, onOpenPlanConsumed, favorites = null,
  onRequestAuth, onPlanTrip, onOpenDest, onOpenFeature,
  // A hand-off in from a destination or feature page (App.openDayForDest /
  // openDayForFeature, or a ?tab=day&dest= / &feat= link):
  //   { destId } | { feature: { kind, cc, id, name?, lat?, lon? } }
  // Consumed once and reported back through onDaySeedConsumed.
  daySeed = null, onDaySeedConsumed = null,
  // "Back to trip" on a plan that came out of a saved trip: App reopens
  // that trip in the planner. Null id means the unsaved draft.
  onOpenTrip = null,
}) {
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
  // What this traveller's pass allows, and the one door that asks for one.
  // A hint for the UI only: the Edge Functions enforce the AI quotas and
  // PaywallProvider owns the modal, the reason codes and how often it opens.
  const paywall = usePaywall();
  const entitlement = paywall.entitlement;

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
  // Live, so a tab left open overnight does not keep offering yesterday as
  // "today" (useToday re-checks at midnight and when the tab is shown again).
  const today = useToday();
  const [newStartDate, setNewStartDate] = useState(() => todayISO());
  // When the stay came from a saved trip, the calendar belongs to that trip:
  // planning a day in Seville for a week you are in Porto is not a date the
  // traveller means. { from, to } in ISO, or null for a free-form start.
  const [newStayWindow, setNewStayWindow] = useState(null);
  const [stayQuery, setStayQuery] = useState('');
  const [stayResults, setStayResults] = useState(null); // null = not searched
  const [staySearching, setStaySearching] = useState(false);
  const [newStayPoint, setNewStayPoint] = useState(null);
  // The landing is a guided flow, one decision per screen, so nothing is on
  // show before it is needed: stay -> when -> how, then either the manual
  // explore map or the Carta chat planner.
  const [landingStep, setLandingStep] = useState('stay');
  // Step 3's answer: places the traveller already knows they want. Both
  // planning modes read it, so it lives here rather than inside the step.
  // Each is { key, name, lat, lon, destId?, poiIdx?, kind, cat, timeOfDay }.
  const [ideas, setIdeas] = useState([]);
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

  // A seed lands the flow on the When question with the stay answered: the
  // destination's city, or for a trail / beach / lake / mountain the nearest
  // catalogue town (the feature itself when no town is within reach), with
  // the feature already down as the day's first idea. Any open plan gives
  // way: the traveller has just asked for a new day somewhere else.
  useEffect(() => {
    if (!daySeed) return undefined;
    let live = true;
    (async () => {
      let stay = null;
      let ideaList = [];
      if (daySeed.destId) {
        const d = destinations[daySeed.destId];
        const c = d ? cityCoords(d) : null;
        if (c && c.lat != null) {
          const name = cityLabel(d.city);
          stay = { lat: c.lat, lon: c.lon, label: d.country ? `${name}, ${d.country}` : name, shortLabel: name };
        }
      } else if (daySeed.feature) {
        let f = daySeed.feature;
        if (!Number.isFinite(f.lat) || !Number.isFinite(f.lon) || !f.name) {
          const row = await resolveFeatureRow(f.kind, f.cc, f.id);
          if (row && !row.missing) f = { ...f, name: row.name || f.name, lat: row.lat, lon: row.lon };
        }
        if (Number.isFinite(f.lat) && Number.isFinite(f.lon)) {
          const town = resolveNearestTown(f.lat, f.lon);
          if (town && town.km <= 60) {
            const c = cityCoords(town.dest);
            const name = cityLabel(town.dest.city);
            stay = { lat: c.lat, lon: c.lon, label: town.label, shortLabel: name };
          } else {
            stay = { lat: f.lat, lon: f.lon, label: f.name, shortLabel: f.name };
          }
          ideaList = [{
            key: `f:${f.kind}:${f.id}`, name: f.name, lat: f.lat, lon: f.lon,
            destId: null, poiIdx: null, kind: f.kind, cat: f.kind, img: null, timeOfDay: 'any',
          }];
        }
      }
      if (!live) return;
      if (stay) {
        setPlan(null);
        setEditingPlanId(null);
        setStayQuery('');
        setStayResults(null);
        setNewStayWindow(null);
        setNewStayPoint(stay);
        setIdeas(ideaList);
        setLandingStep('when');
      }
      onDaySeedConsumed && onDaySeedConsumed();
    })();
    return () => { live = false; };
  }, [daySeed]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * The chat's opening answers, read off the trip wizard's draft: a couple
   * who told the wizard "Hotels & comfort" should not have to tell the day
   * planner again that they are two, start late, walk little and sit down
   * for lunch. Only a draft that has actually been started counts (a chosen
   * country or stops); the store's own defaults say nothing about anybody.
   * Read at the moment the chat opens, so an edited draft is seen.
   */
  const chatPresets = useMemo(() => {
    if (landingStep !== 'chat') return null;
    const st = plannerStore.getState() || {};
    const started = (st.wizard?.countries || []).length > 0 || (st.stops || []).length > 0;
    if (!started) return null;
    const tr = st.travelers || {};
    const quiz = st.wizard?.quiz || {};
    const out = {};
    const adults = Number(tr.adults) || 0;
    const kids = Number(tr.children) || 0;
    if (kids > 0) out.companions = 'family';
    else if (adults === 1) out.companions = 'solo';
    else if (adults === 2) out.companions = 'partner';
    else if (adults > 2) out.companions = 'group';
    if (tr.lifestyle === 'luxury') { out.start = 'late'; out.steps = 5000; out.food = 'sit'; }
    else if (tr.lifestyle === 'budget') { out.food = 'quick'; out.diet = ['cheap']; }
    const types = quiz.types || [];
    const moods = [];
    if (types.some((k) => /hiking|trailrun|cycling|ski|water/.test(k))) moods.push('active');
    if (types.some((k) => /beach|islands|lakes/.test(k))) moods.push('beach');
    if (moods.length) out.moods = moods;
    if (quiz.pace === 'moving') out.steps = 20000;
    return Object.keys(out).length ? out : null;
  }, [landingStep]);

  const addLandingCity = (id) => {
    if (!id || newStops.some((s) => s.destinationId === id)) return;
    setNewStops((prev) => [...prev, { destinationId: id, days: 1 }]);
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

  // Full POI lists (with coordinates, for map pins) live in per-destination
  // shards so the boot-time dataset stays small. This map fills in as towns
  // are needed rather than all at once: mounting the tab used to download all
  // 33 MB of them, a 4-8 second main-thread freeze on a phone, whether or not
  // a plan was even open.
  const [actFull, setActFull] = useState(null); // { destId: items_full } | null
  // Ids already requested, so a re-render never re-asks for the same town.
  // A ref, not state: it must be up to date within the same turn that a
  // loader starts, and it is never rendered.
  const poiAskedRef = useRef(new Set());
  // The latest map, readable synchronously from ensurePois without making it
  // depend on (and be recreated by) every actFull change.
  const actFullRef = useRef(null);

  /**
   * Make sure `ids` are in `actFull`, and hand back a map that contains them.
   *
   * Returns the merged map rather than relying on the state update, because
   * every caller reads the POIs in the same turn it asks for them (the
   * drafters below are `async` and use the return value directly).
   */
  const ensurePois = React.useCallback(async (ids) => {
    const want = [...new Set((ids || []).filter(Boolean))];
    const missing = want.filter((id) => !poiAskedRef.current.has(id));
    if (!missing.length) return actFullRef.current || {};
    missing.forEach((id) => poiAskedRef.current.add(id));
    const fetched = await fetchDestPoiMap(missing);
    const merged = { ...(actFullRef.current || {}), ...fetched };
    actFullRef.current = merged;
    setActFull(merged);
    return merged;
  }, []);

  // The town being planned, loaded as soon as it is known.
  useEffect(() => {
    if (stop?.destination_id) ensurePois([stop.destination_id]);
  }, [stop?.destination_id, ensurePois]);

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

  /**
   * The shortlist, as things you can put into today.
   *
   * What the shortlist holds is PLACES - a beach, a lake, a mountain, a walk -
   * each with its own coordinates, and what a day is built out of is this
   * city's harvested POI list, addressed by array index. So the two are
   * joined by COORDINATE, not by name: a shortlisted beach matches the POI
   * within `SHORTLIST_SNAP_KM` of it, which is the same beach under whatever
   * name the POI harvest happened to use. Name matching would miss every
   * place whose two sources disagree about spelling, which is most of them.
   *
   * Destinations are not offered: a shortlisted city is somewhere you go, not
   * something you add to a day in a different city. Trips are not either.
   *
   * Only what is actually in reach is shown. A shortlisted lake 300 km away
   * is a real wish and a useless suggestion for today, so it is left out
   * rather than listed with an apologetic distance.
   */
  // The shortlist's map points (resolved from the published layer files).
  const shortlistPoints = useShortlistPoints(favorites);

  const shortlistDeck = useMemo(() => {
    if (!favorites || !favorites.size || !stop?.dest || !shortlistPoints.length) return [];
    const out = [];
    const taken = new Set();
    for (const pt of shortlistPoints) {
      let best = null;
      activities.items.forEach((item, idx) => {
        if (taken.has(idx) || activities.suppressed.has(idx)) return;
        if (item.lat == null || item.lon == null) return;
        const km = haversineKm(pt.lat, pt.lon, item.lat, item.lon);
        if (km == null || km > SHORTLIST_SNAP_KM) return;
        if (!best || km < best.km) best = { item, idx, km };
      });
      if (!best) continue;
      taken.add(best.idx);
      // The note says what the traveller starred, which is the point: the POI
      // harvest often knows this place under a different name, and without
      // this the row looks like an ordinary suggestion that wandered in.
      // Never repeat the heading above it, which already says "Your shortlist".
      out.push({
        item: best.item,
        idx: best.idx,
        note: pt.name && pt.name !== best.item.name ? t('fav.snapped', { name: pt.name }) : null,
      });
    }
    return out.slice(0, 6);
  }, [favorites, shortlistPoints, activities, stop, t]);

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
    const fullMap = await ensurePois([stop?.destination_id]);
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
    const fullMap = await ensurePois([stop?.destination_id]);
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
    const fullMap = await ensurePois([stop?.destination_id]);
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
              {w && (
                <small>
                  {frac < 1
                    ? t('day.walkStepsOf', {
                      n: formatSteps(kmToSteps(walkKmFor(w, name)), lang),
                      total: formatSteps(kmToSteps(w.km), lang),
                    })
                    : t('day.walkSteps', { n: formatSteps(kmToSteps(walkKmFor(w, name)), lang) })}
                  {' '}
                  {w.note}
                </small>
              )}
              {w && (
                <span className="day-walk-len" role="group" aria-label="How long should this walk be?">
                  {WALK_LENGTHS.map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      className={`day-walk-len-btn ${frac === o.key ? 'on' : ''}`}
                      onClick={() => setWalkLen(name, o.key)}
                      aria-pressed={frac === o.key}
                      title={t('day.walkLenTitle', {
                        n: formatSteps(kmToSteps(Math.max(0.3, Math.round(w.km * o.key * 10) / 10)), lang),
                      })}
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
  // A tapped pin brings today's plan back to the front if another tab was
  // open, then scrolls to and flashes its row; the tiny delay lets the panel
  // mount first.
  const onMapStopClick = (i) => {
    const p = mapPins[i - stayPinOffset];
    if (!p) return;
    setWsTab('plan');
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

  /* ---- The day workspace: map on top, three tabs under it ---- */
  // What is being answered right now: what am I doing today ('plan'), what
  // else could I do ('add'), where is the paperwork ('files'). The map above
  // stays the same map throughout, so switching tabs never loses the route.
  const [wsTab, setWsTab] = useState('plan');
  // A browsed place the map should glide to, so "how far is that from today's
  // walk?" is answered by looking rather than guessing. `k` makes a repeat tap
  // on the same card move the map again.
  const [flyPoi, setFlyPoi] = useState(null); // { idx, lat, lon, k }
  useEffect(() => { setFlyPoi(null); }, [stopIdx, dayIdx, plan?.id]);
  // A predefined ask handed to the Carta bot, so a one-tap question does not
  // land the traveller in a blank questionnaire.
  const [botPreset, setBotPreset] = useState(null);
  // Turning a one-city day plan into a multi-city one, from the day bar where
  // the cities already live.
  const [cityAddOpen, setCityAddOpen] = useState(false);
  // Where the Add more tab was left: which half (ready-made or custom) and
  // which pick. Held here, not inside the panel, so a trip to Today's plan and
  // back does not throw away a filtered browse.
  const [addMode, setAddMode] = useState('ready');
  const [addPick, setAddPick] = useState('all');
  useEffect(() => { setAddMode('ready'); setAddPick('all'); }, [stopIdx, plan?.id]);

  // Trip extras hold the one thing in the Files tab that SHOULD follow the
  // traveller between devices: the notes everyone on the trip needs. The
  // documents themselves stay on the device (see dayFileStore.js).
  const [extras, setExtras] = useState(() => loadTripExtras(plan?.id));
  useEffect(() => { setExtras(loadTripExtras(plan?.id)); }, [plan?.id]);
  const setNotes = (text) => {
    const next = { ...extras, notes: text };
    setExtras(next);
    persistTripExtras(plan?.id, next);
  };

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
      // A traveller who said "late start" gets a day that starts late: the
      // chat's answer follows the plan onto the timeline rather than being
      // spent once on the prompt and then forgotten.
      startMin: Number.isFinite(prefs?.dayStartMin) ? prefs.dayStartMin : DAY_START_MIN,
    })
    : null;

  // Open-time ideas: the strongest unpicked walkable places whose visit still
  // fits in the leftover. One tap adds them; in auto mode the walking order
  // re-optimizes like any other add.
  const gapIdeas = (schedule && schedule.freeMin >= GAP_SUGGEST_MIN)
    ? mapDeck
      .filter(({ item }) => dwellMinutes(poiKind(item), visitFactor) + 15 <= schedule.freeMin)
      .slice(0, 3)
    : [];

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

  /* ---- Tab 2: what else could go in today ---- */

  // The browsable catalogue: a deep deck (not the 48 the map paints) so the
  // picks can be filtered hard and still have something to show. Places
  // already laid into any day of this city drop out, exactly as their map pins
  // do: this tab answers "what else could I add", and a wall of cards already
  // reading "Added" is the answer to a different question. Removing a stop is
  // Today's plan's job, and search still surfaces a planned place so it can be
  // found and taken out from here too.
  const browseDeck = useMemo(
    () => (stop?.dest
      ? pickerDeck(activities.items, [], 120, activities.walkable)
        .filter(({ idx }) => !assignedAnyDay.has(idx))
      : []),
    [activities, stop, assignedAnyDay],
  );

  // Ready-made days: one route per lens (icons, culture, outdoors, flavour),
  // built from the same rating signal the pins use and bounded by the
  // traveller's own answers about how long a day is and how far they walk.
  // Places already laid into the city's other days are excluded, so picking a
  // ready-made day never books the same church twice in one stay.
  const readyRoutes = useMemo(() => {
    if (!stop?.dest || !activities.items.length) return [];
    const eligible = new Set([...activities.walkable].filter((i) => !usedOtherDays.has(i)));
    return routeCandidates({
      items: activities.items,
      numDays: 1,
      eligibleIdx: eligible,
      limits: feasibilityLimits(prefs || {}),
      dwellFactor: visitFactor,
      styleKey: prefs?.vibe || 'mix',
    });
  }, [activities, stop, usedOtherDays, prefs, visitFactor]);

  // Lay a ready-made route into today. It arrives route-optimized, so the
  // order is Carta's from the first render and the map draws it immediately.
  const useReadyRoute = (route) => {
    const idxs = route?.lists?.[0] || [];
    if (!idxs.length) return;
    commitDay(idxs);
    setRoute('auto');
    setWsTab('plan');
  };

  // Open-time ideas and near-zero scenic detours, in one list: both answer
  // "what else fits", and a traveller does not care which engine found it.
  const addSuggestions = useMemo(() => [
    ...gapIdeas.map(({ item, idx }) => ({
      item,
      idx,
      note: t('day.gapFits', { dur: fmtDur(dwellMinutes(poiKind(item), visitFactor)) }),
    })),
    ...scenic.map((s) => ({
      item: s.item,
      idx: s.idx,
      note: t('dayws.suggDetour', { min: s.extraMin }),
    })),
  ], [gapIdeas, scenic, visitFactor, t]);

  // Move the map onto a browsed place without reframing the route.
  const focusPlace = (item, idx) => {
    if (item?.lat == null || item?.lon == null) return;
    setFlyPoi({ idx, lat: item.lat, lon: item.lon, k: Date.now() });
  };

  /* ---- The Carta bot's predefined asks ---- */
  // One of them is not a question at all (reordering is arithmetic Carta can
  // do on the spot), so it runs here instead of spending a plan allowance.
  const runBotPrompt = (key) => {
    const p = BOT_PROMPTS.find((x) => x.key === key);
    if (!p) return;
    if (p.action === 'optimize') {
      optimizeNow();
      setWsTab('plan');
      return;
    }
    setBotPreset(p.refineKey ? { freeText: t(p.refineKey), autoRun: true } : null);
    setAiOpen(true);
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
  const downloadPdf = () => {
    if (!paywall.require('export')) return;
    openDayPlanPdf({
      stop, stops, assignments, plan, days, visitFactor,
      itemsForStop, estimateWalkMinutes, fmtDur,
    });
  };

  // The same walk as the PDF, but as a KML download: every planned day a
  // My Maps folder of pins in walking order. The toast repeats the import
  // steps because mymaps.google.com is not a path most travellers know.
  const downloadKmlFile = () => {
    if (!paywall.require('export')) return;
    const ok = openDayPlanKml({ stop, stops, assignments, plan, visitFactor, itemsForStop });
    if (ok) {
      setSaveToast(t('export.myMapsHint'));
      window.setTimeout(() => setSaveToast(''), 9000);
    }
  };

  // Every planned day as timed calendar blocks, spoken in the same clock the
  // timeline shows, so the plan lands in Google/Apple/Outlook calendars.
  const downloadIcsFile = () => {
    if (!paywall.require('export')) return;
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

  /* ---- Quick starts: the three ways a day already has a starting point ----
   * A day planned on holiday starts at the hotel; a day planned at home
   * starts at the front door; a day planned again starts where the last one
   * did. None of those are a search, so none of them should have to be typed.
   * They sit under the box as chips, and every one of them answers step 1 in
   * a single tap. */

  // The device's own position. Kept as a coordinate first and a name second:
  // the plan only ever measures from the coordinate, so a reverse lookup that
  // fails still leaves a perfectly good starting point.
  const canLocate = typeof navigator !== 'undefined' && 'geolocation' in navigator;
  const [locBusy, setLocBusy] = useState(false);
  const [locErr, setLocErr] = useState('');

  const useMyLocation = () => {
    if (!canLocate || locBusy) return;
    setLocErr('');
    setLocBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos?.coords?.latitude;
        const lon = pos?.coords?.longitude;
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          setLocBusy(false);
          setLocErr(t('places.locateFailed'));
          return;
        }
        const hit = await reverseGeocode(lat, lon);
        const lines = hit ? geoLines(hit) : null;
        setLocBusy(false);
        setStayQuery('');
        setStayResults(null);
        setNewStayWindow(null);
        setNewStayPoint({
          lat,
          lon,
          label: hit?.label || t('day.currentLocation'),
          shortLabel: lines?.title || t('day.currentLocation'),
        });
      },
      (err) => {
        setLocBusy(false);
        // Code 1 is a refusal, which is a setting to change rather than a
        // failure to retry; everything else is "it did not come through".
        setLocErr(err?.code === 1 ? t('places.locateDenied') : t('places.locateFailed'));
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 5 * 60 * 1000 },
    );
  };

  // Where a signed-in traveller is actually sleeping in the fortnight ahead:
  // every stop of every saved trip whose window covers today or one of the
  // next 14 days. Somebody opening the day planner mid-trip is overwhelmingly
  // planning a day IN that trip, so the stop they are in is the first answer
  // offered, and picking it presets the date too (step 2 opens answered).
  const UPCOMING_STAY_DAYS = 14;
  const upcomingStays = useMemo(() => {
    if (!user || !authConfigured) return [];
    const today = todayISO();
    const horizon = addDays(today, UPCOMING_STAY_DAYS);
    const out = [];
    const seen = new Set();
    for (const p of savedPlans) {
      for (const st of (p.stops || [])) {
        const from = st.arrive_date;
        const to = st.depart_date || st.arrive_date;
        // Overlap, not containment: a stop that started last week and runs
        // through next Tuesday is exactly the one being planned right now.
        if (!from || from > horizon || to < today) continue;
        const dest = destinations[st.destination_id];
        const c = dest ? cityCoords(dest) : { lat: null, lon: null };
        if (c.lat == null) continue;
        const name = cityLabel(dest.city);
        const key = `${cityKeyName(dest.city)}|${dest.country}|${from}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          key,
          name,
          country: dest.country || st.country || '',
          lat: c.lat,
          lon: c.lon,
          // The day the stop begins, which is also the date step 2 opens on.
          // Already inside the stop? Today is the day being planned.
          from,
          to,
          date: from <= today ? today : from,
        });
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
  }, [user, authConfigured, savedPlans, destinations]);

  const pickUpcomingStay = (row) => {
    setStayQuery('');
    setStayResults(null);
    setNewStayPoint({
      lat: row.lat,
      lon: row.lon,
      label: row.country ? `${row.name}, ${row.country}` : row.name,
      shortLabel: row.name,
    });
    // The trip already says which day this is, so step 2 opens answered
    // rather than asking a question its own answer is sitting next to. It
    // also says which days are POSSIBLE: the calendar narrows to the stop's
    // own window, and the chips become its days.
    setNewStayWindow({ from: row.from, to: row.to });
    setNewStartDate(row.date);
  };

  // Where the last few standalone plans started. Dedupe by label: planning
  // three days from the same hotel is the normal case, and three identical
  // chips would say nothing the first one did not.
  const recentStays = useMemo(() => {
    const out = [];
    const seen = new Set();
    for (const sp of standalonePlans) {
      const pt = sp.stayPoint;
      if (!pt || pt.lat == null || pt.lon == null) continue;
      const label = pt.shortLabel || pt.label || '';
      const key = label.toLowerCase().trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ key, label, point: pt });
      if (out.length === 3) break;
    }
    return out;
  }, [standalonePlans]);

  const pickRecentStay = (row) => {
    setStayQuery('');
    setStayResults(null);
    setNewStayPoint(row.point);
    // A repeat of a free-form start, not a trip stop: back to a free calendar.
    setNewStayWindow(null);
  };

  // Keyboard navigation over the results list: the arrow keys move a
  // highlight, Enter takes it. Without it the only way past the geocoder is a
  // mouse, which for a step every single day plan has to pass through is the
  // difference between the planner being usable from the keyboard and not.
  const [stayCursor, setStayCursor] = useState(-1);
  const stayResultRefs = useRef([]);
  useEffect(() => { setStayCursor(-1); }, [stayResults]);

  const onStayKeyDown = (e) => {
    const n = stayResults?.length || 0;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!n) return;
      e.preventDefault();
      const next = e.key === 'ArrowDown'
        ? (stayCursor + 1) % n
        : (stayCursor <= 0 ? n - 1 : stayCursor - 1);
      setStayCursor(next);
      stayResultRefs.current[next]?.focus();
      return;
    }
    if (e.key === 'Enter') {
      // Enter inside the box searches; Enter on a highlighted row takes it.
      if (stayCursor >= 0 && stayResults?.[stayCursor]) {
        e.preventDefault();
        setNewStayWindow(null);
        setNewStayPoint(stayResults[stayCursor]);
        return;
      }
      searchStay();
      return;
    }
    if (e.key === 'Escape' && stayResults) {
      setStayCursor(-1);
      e.currentTarget.closest('.day-flow-step')?.querySelector('.day-stay-input')?.focus();
    }
  };

  /* ---- The date step's bounds ---- */

  // A day plan is a plan for a day you have not had yet. Nothing behind today
  // is choosable, and a year ahead is as far as the catalogue's opening hours,
  // weather and fares mean anything, so the calendar stops there too.
  const DATE_HORIZON_DAYS = 365;
  const dayDateMin = useMemo(
    () => (newStayWindow?.from ? laterISO(newStayWindow.from, today) : today),
    [newStayWindow, today],
  );
  const dayDateMax = useMemo(() => {
    const horizon = addDays(today, DATE_HORIZON_DAYS);
    // The trip's own end, unless the trip runs past the horizon.
    if (newStayWindow?.to) return newStayWindow.to < horizon ? newStayWindow.to : horizon;
    return horizon;
  }, [newStayWindow, today]);
  // A trip whose whole window is already behind us leaves min above max; the
  // date step then has nothing to offer, and clamping into an empty range
  // would put the calendar on a day the trip does not contain. Treat it as a
  // free-form date instead of an impossible one.
  const dayWindowUsable = dayDateMin <= dayDateMax;

  // Restored plans and tabs left open across midnight both arrive holding a
  // date that has since fallen out of bounds. Pull it back into range rather
  // than let the next step run on a day the traveller can no longer have.
  useEffect(() => {
    if (!newStartDate || !dayWindowUsable) return;
    if (newStartDate < dayDateMin) setNewStartDate(dayDateMin);
    else if (newStartDate > dayDateMax) setNewStartDate(dayDateMax);
  }, [newStartDate, dayDateMin, dayDateMax, dayWindowUsable]);

  // The three dates almost every day trip actually falls on, so the date step
  // is one tap rather than a calendar hunt. "This weekend" is the coming
  // Saturday, which on a Saturday AND on a Sunday means today: a weekend chip
  // that resolves to the Saturday just gone is a past date, and offering to
  // plan yesterday is the bug this guards.
  //
  // With a stay taken from a saved trip the generic three are replaced by the
  // trip's own days: inside a week in Porto, "today / tomorrow / this weekend"
  // are either wrong or a roundabout way of saying "day 3".
  const quickDates = useMemo(() => {
    if (newStayWindow && dayWindowUsable) {
      const out = [];
      // Numbered from the stop's FIRST night, not from the first selectable
      // day: mid-trip, "day 1" would otherwise mean today, and the traveller
      // counts their days from when they arrived. The walk starts at
      // dayDateMin, so find its day number once and count up from there.
      let n = 1;
      for (let iso = newStayWindow.from; iso && iso < dayDateMin && n < 400; iso = addDays(iso, 1)) n += 1;
      for (let iso = dayDateMin; iso <= dayDateMax && out.length < 6; iso = addDays(iso, 1), n += 1) {
        out.push({
          key: `trip-${iso}`,
          iso,
          label: iso === today ? t('day.quickToday') : t('day.quickTripDay', { n }),
        });
      }
      return out;
    }
    const [y, m, d] = today.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    // Sunday (0) is already the weekend, so its offset is 0, not the six days
    // it would take to reach next Saturday.
    const toSaturday = dow === 0 ? 0 : (6 - dow);
    const all = [
      { key: 'today', labelKey: 'day.quickToday', iso: today },
      { key: 'tomorrow', labelKey: 'day.quickTomorrow', iso: addDays(today, 1) },
      { key: 'weekend', labelKey: 'day.quickWeekend', iso: addDays(today, toSaturday) },
    ];
    // On a Friday "tomorrow" IS the weekend, and on a Saturday so is "today":
    // two chips carrying the same date read as a bug, so the earlier, more
    // specific wording wins and the duplicate drops.
    const seen = new Set();
    return all
      .filter((q) => q.iso >= today && q.iso <= dayDateMax)
      .filter((q) => !seen.has(q.iso) && seen.add(q.iso));
  }, [today, newStayWindow, dayWindowUsable, dayDateMin, dayDateMax, t]);

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
      const key = `${cityKeyName(t.dest.city)}|${t.dest.country}`;
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

  // What the fork step's second card is offering, named and pictured (D7).
  // The town is the one the stay sits in when there is one, otherwise the
  // nearest in reach; the photos are the three strongest places around it.
  const howTownName = useMemo(() => {
    const stayTown = stayTownId ? destinations[stayTownId] : null;
    if (stayTown?.city) return cityLabel(stayTown.city);
    if (exploreTowns[0]?.dest?.city) return cityLabel(exploreTowns[0].dest.city);
    return newStayPoint?.shortLabel || '';
  }, [stayTownId, destinations, exploreTowns, newStayPoint]);

  // The explore map draws POIs for every town in day-trip reach of the stay,
  // so those shards have to be in hand before the memo below can place a pin.
  // Up to 34 requests of ~8.6 KB, which HTTP/2 multiplexes; the memo re-runs
  // when they land because `actFull` is one of its dependencies.
  useEffect(() => {
    if (!exploreTowns.length) return;
    ensurePois(exploreTowns.map((t) => t.id));
  }, [exploreTowns, ensurePois]);

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

  const howPreviewPhotos = useMemo(() => {
    const out = [];
    for (const p of explorePois) {
      if (p.item?.img && !out.includes(p.item.img)) out.push(p.item.img);
      if (out.length === 3) return out;
    }
    for (const tn of exploreTowns) {
      const url = tn.dest?.image?.url;
      if (url && !out.includes(url)) out.push(url);
      if (out.length === 3) break;
    }
    return out;
  }, [explorePois, exploreTowns]);

  const togglePoiPick = (p) => {
    setSelPois((prev) => (prev.some((x) => x.key === p.key)
      ? prev.filter((x) => x.key !== p.key)
      : [...prev, { key: p.key, destId: p.destId, idx: p.idx }]));
  };

  /** Reorder the tray by hand. The order matters because it is the order the
   *  day is built in, and the traveller's own sense of what comes first beats
   *  a nearest-neighbour walk often enough to be worth two arrows. */
  const movePick = (key, dir) => {
    setSelPois((prev) => {
      const i = prev.findIndex((x) => x.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  /**
   * "Let Carta plan the rest": hand the builder's tray to the chat planner.
   *
   * Everything picked so far becomes a must-include, so the generated day
   * keeps every one of them rather than proposing its own shortlist over the
   * top. The questions the tray already answers are skipped: the town is the
   * one the picks are in, so asking "which town" after somebody has chosen
   * four places in it is asking them to repeat themselves.
   *
   * With an empty tray this is simply the bot with no preset, which is why
   * the button is offered at zero picks too.
   */
  const letCartaFinish = (rows = []) => {
    const fromTray = rows
      .filter((r) => r.add && r.add.destId != null)
      .map((r) => ({
        key: r.key,
        destId: r.add.destId,
        poiIdx: r.add.idx,
        name: r.name,
        label: r.name,
        lat: r.lat,
        lon: r.lon,
        // The bot pre-ticks its mood questions off `cat`/`kind`, so a tray of
        // four beaches has to arrive saying "beach". Without these the handoff
        // would carry the places over and lose the taste behind them.
        cat: r.kind,
        kind: r.sub || r.kind,
      }));
    if (fromTray.length) {
      // Merge rather than replace: an idea given in step 3 that was never
      // added to the tray is still something the traveller asked for.
      setIdeas((prev) => {
        const have = new Set(prev.map((i) => i.key).filter(Boolean));
        const add = fromTray.filter((i) => !have.has(i.key));
        return add.length ? [...prev, ...add] : prev;
      });
    }
    setLandingStep('chat');
  };

  // Search across EVERYTHING on the explore map at once, towns, sights,
  // beaches & nature and activities, regardless of which filter chips are on,
  // so a place is findable by name even when its category is hidden. Strongest
  // Reopen an existing plan on the builder to change its towns and picks. Its
  // stay and towns are pre-loaded so the screen opens on the same place;
  // hitting the button again updates that plan in place (see below).

  // Every landing step after the first is built around the chosen stay: the
  // date question names it, the explore map is centred on it, the chat plans
  // from it. Starting a plan (or cancelling an edit) clears that answer while
  // the plan itself is on screen, so coming back to the landing used to land
  // on a step whose subject no longer existed: no map, no picks, nothing but
  // a dead "Start planning" button. Losing the stay sends the flow back to
  // the question that asks for one, which is also the only step that lists
  // the day plans already saved.
  useEffect(() => {
    if (!newStayPoint && landingStep !== 'stay') setLandingStep('stay');
  }, [newStayPoint, landingStep]);

  const cancelEditOnMap = () => {
    const id = editingPlanId;
    setEditingPlanId(null);
    setNewStops([]);
    setNewCountry('');
    setStayQuery('');
    setStayResults(null);
    setNewStayPoint(null);
    setNewStayWindow(null);
    setSelPois([]);
    const sp = standalonePlans.find((p) => p.id === id);
    if (sp) openStandalone(sp);
  };

  // Start planning from the explore picks. Towns each get their days; picked
  // beaches/sights/activities land pre-assigned on day 1 of their town (they
  // are already specific, so no wizard for them). Towns picked without
  // specific places open with the shape-your-day question exactly as before.
  /**
   * "Build it myself" (D6), carrying step 3's answer into the map.
   *
   * An idea that resolved to a catalogue row already speaks the tray's
   * language: selPois entries are { key, destId, idx } and the explore key
   * format is `p:<destId>:<idx>`, which is exactly what the ideas step
   * minted. Those go straight in, and their towns are added as stops so the
   * places have somewhere to belong.
   *
   * A geocoded idea has no catalogue row to add, so it cannot be a tray pick.
   * Its nearest town joins the stops instead: the traveller lands on a map
   * centred on somewhere their idea actually is, which is the most the manual
   * mode can honour without inventing a POI record for it.
   */
  const goManualWithIdeas = () => {
    const poiIdeas = ideas.filter((i) => i.destId && i.poiIdx != null);
    if (poiIdeas.length) {
      setSelPois((prev) => {
        const have = new Set(prev.map((x) => x.key));
        const add = poiIdeas
          .filter((i) => !have.has(i.key))
          .map((i) => ({ key: i.key, destId: i.destId, idx: i.poiIdx }));
        return add.length ? [...prev, ...add] : prev;
      });
    }
    // Every town an idea implies: the town ideas themselves, the towns the
    // picked POIs were harvested into, and the nearest town to anything that
    // came off the geocoder.
    const townIds = new Set();
    for (const i of ideas) {
      if (i.destId) { townIds.add(i.destId); continue; }
      const near = resolveNearestTown(i.lat, i.lon);
      if (near) townIds.add(near.id);
    }
    if (townIds.size) {
      setNewStops((prev) => {
        const have = new Set(prev.map((s) => s.destinationId));
        const add = [...townIds].filter((id) => !have.has(id)).map((id) => ({ destinationId: id, days: 1 }));
        return add.length ? [...prev, ...add] : prev;
      });
    }
    setLandingStep('manual');
  };

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
      setNewStayWindow(null);
      setSelPois([]);
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
    setNewStayWindow(null);
    setSelPois([]);
    openStandalone(sp);
  };

  /* ---- Carta chat planner (landing): answers -> AI day -> new plan ---- */

  // The chat's chosen town, resolved to its destination record and full POI
  // list. Everything the chat does hangs off this one lookup.
  const chatDest = async (destId) => {
    const dest = destinations[destId];
    if (!dest) return null;
    const fullMap = await ensurePois([destId]);
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
  // the prompt speak interests and pace. Translate once, here. The chat now
  // asks one "mood" question where it used to ask focus and interests, so
  // this is the single map from what was tapped to what the deck ranks by.
  const chatInterests = (a) => {
    const map = {
      sights: ['culture', 'architecture', 'photo'],
      museums: ['museums', 'culture'],
      nature: ['outdoors'],
      beach: ['beaches', 'outdoors'],
      active: ['sports', 'outdoors'],
      food: ['food'],
      local: ['food', 'cafes', 'shopping'],
      views: ['photo'],
      shopping: ['shopping'],
      nightlife: ['nightlife', 'food'],
    };
    const out = new Set();
    (a.moods || []).forEach((k) => (map[k] || []).forEach((v) => out.add(v)));
    return [...out];
  };

  // The prompt's coarse "vibe" is derived from the moods rather than asked
  // for: the traveller already said what they are in the mood for, and a
  // second, vaguer version of the same question would earn nothing.
  const chatVibe = (a) => {
    const m = a.moods || [];
    if (m.includes('active') || m.includes('nature') || m.includes('beach')) return 'active';
    if (m.includes('museums')) return 'culture';
    if (m.includes('food')) return 'foodie';
    if (m.includes('sights')) return 'classic';
    return 'mix';
  };

  // Who is coming, as a party size the prompt can reason about. These are
  // defaults the traveller never has to confirm, not counts we claim to know:
  // a group is planned as five because five is where a day stops behaving
  // like a small party's day.
  const GROUP_SIZE_BY_COMPANIONS = {
    solo: 1, partner: 2, friends: 3, family: 4, group: 5,
  };
  const groupSizeFor = (companions) => GROUP_SIZE_BY_COMPANIONS[companions] || null;

  // The town-suggestion function speaks the retired focus/interest words.
  // These two translate the mood answers into its vocabulary; anything the
  // older whitelist does not know is simply dropped by it.
  const MOOD_TO_INTEREST = {
    sights: 'landmarks', museums: 'museums', nature: 'nature', beach: 'beach',
    active: 'active', food: 'food', local: 'local', views: 'photo',
  };
  const moodInterests = (moods) => (moods || []).map((m) => MOOD_TO_INTEREST[m]).filter(Boolean);
  const moodFocus = (moods) => {
    const m = moods || [];
    const outdoors = m.filter((k) => ['nature', 'beach', 'active'].includes(k)).length;
    const indoors = m.filter((k) => ['sights', 'museums', 'shopping', 'nightlife'].includes(k)).length;
    if (outdoors && !indoors) return 'nature';
    if (indoors && !outdoors) return 'city';
    return m.length ? 'mix' : null;
  };

  // `onStage` reports the real milestones of a build to the chat's route
  // animation, so the wait shows the work rather than three dots: how many
  // places were read, how many survived the traveller's answers, and when the
  // sequencing call actually went out.
  /**
   * The one town every idea points at, or null when they disagree.
   *
   * When a traveller has named two sights and both are in Granada, asking
   * "which town shall we plan?" is asking a question whose answer is already
   * on screen. Each idea resolves through its own destination id when it has
   * one, and through the nearest town when it came off the geocoder; if the
   * set collapses to a single id, that is the day's town.
   */
  const ideasTownId = useMemo(() => {
    if (!ideas.length) return null;
    const ids = new Set();
    for (const i of ideas) {
      const id = i.destId || resolveNearestTown(i.lat, i.lon)?.id || null;
      // One idea we cannot place is enough to make the question worth asking.
      if (!id) return null;
      ids.add(id);
    }
    return ids.size === 1 ? [...ids][0] : null;
  }, [ideas, resolveNearestTown]);

  /**
   * The town the day lands in if nothing else is said: the one the ideas
   * settled on, or failing that the nearest town to the stay. Both the town
   * question and "been here before" are gated on what that town actually
   * holds, so the gates have to know it in BOTH cases, not only when the
   * ideas step happened to fix it.
   */
  const chatDefaultTownId = ideasTownId || exploreTowns[0]?.id || null;

  /**
   * The forecast for the day being planned, at the stay.
   *
   * This is a question the app can answer by reading, so it is never asked.
   * The chat's last screen reports what it found ("rain likely, indoor
   * options added") and sets the flag itself, which is what a guide who had
   * checked the sky would do. A failed or missing fetch simply means the
   * screen says nothing: no forecast is not the same as good weather.
   */
  const [chatWeather, setChatWeather] = useState(null);
  useEffect(() => {
    const lat = newStayPoint?.lat;
    const lon = newStayPoint?.lon;
    const date = newStartDate;
    if (lat == null || lon == null || !date) { setChatWeather(null); return undefined; }
    let live = true;
    fetchForecast(lat, lon).then((rows) => {
      if (!live) return;
      const row = (rows || []).find((r) => r.date === date);
      if (!row) { setChatWeather(null); return; }
      const kind = row.kind || weatherKind(row.code ?? 3);
      setChatWeather({
        rain: ['rain', 'drizzle', 'storm'].includes(kind) || (row.rainPct ?? 0) >= 60,
        hot: (row.hi ?? 0) > 30,
        hi: row.hi ?? null,
      });
    });
    return () => { live = false; };
  }, [newStayPoint?.lat, newStayPoint?.lon, newStartDate]);

  // The one line the chat shows instead of asking about the weather.
  const chatWeatherNote = useMemo(() => {
    if (!chatWeather) return null;
    if (chatWeather.rain) return t('chat.weatherRain');
    if (chatWeather.hot) return t('chat.weatherHot', { hi: Math.round(chatWeather.hi) });
    return null;
  }, [chatWeather, t]);

  /**
   * How much there is to do in the town the ideas already settled on, which
   * decides whether the town question is worth a tap at all. Counting the
   * walkable deck (and its must-see share) is the same measure the candidate
   * builder uses, so the question is gated on what the day would really have
   * to work with, not on a proxy.
   */
  const [chatTownCounts, setChatTownCounts] = useState({ id: null, total: null, mustSee: null });
  useEffect(() => {
    if (!chatDefaultTownId) { setChatTownCounts({ id: null, total: null, mustSee: null }); return undefined; }
    let live = true;
    chatDest(chatDefaultTownId).then((info) => {
      if (!live) return;
      if (!info) { setChatTownCounts({ id: chatDefaultTownId, total: null, mustSee: null }); return; }
      const walkable = [...(info.walkable || [])];
      setChatTownCounts({
        id: chatDefaultTownId,
        total: walkable.length,
        mustSee: walkable.filter((i) => isMustSee(info.items[i])).length,
      });
    });
    return () => { live = false; };
    // chatDest is rebuilt every render and reads a cache, so depending on it
    // would refetch the town on every keystroke elsewhere in the planner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatDefaultTownId]);

  /**
   * Does anything actually happen in this town on this date? The dossier
   * records festivals by MONTH, not by day, which is the honest resolution
   * for an annual event whose exact dates move: a month match is enough to
   * default the events toggle on and let the model check, and not enough to
   * claim anything about a specific Tuesday.
   */
  const [chatHasEvents, setChatHasEvents] = useState(false);
  useEffect(() => {
    const destId = ideasTownId || exploreTowns[0]?.id;
    if (!destId || !newStartDate) { setChatHasEvents(false); return undefined; }
    const month = Number(newStartDate.slice(5, 7));
    let live = true;
    loadDossier(destId).then((d) => {
      if (!live) return;
      setChatHasEvents((d?.festivals || []).some((f) => (f.months || []).includes(month)));
    }).catch(() => { if (live) setChatHasEvents(false); });
    return () => { live = false; };
  }, [ideasTownId, exploreTowns, newStartDate]);

  /**
   * Fold the ideas into the free-text wish the prompt already treats as a
   * hard requirement. The Edge Function caps this field at 280 characters
   * and knows how to add a place that is not on the candidate deck, so this
   * is the must-include channel that exists rather than one invented for it.
   *
   * The traveller's OWN words come first and are never truncated away: the
   * wishes fill whatever room is left, and any that do not fit are dropped
   * whole rather than cut mid-name into a place that does not exist.
   */
  const withIdeaWishes = (own, a = {}) => {
    const CAP = 280;
    const head = own ? `${own.trim()} ` : '';
    // The answers the deployed function does not yet have a field for, said
    // in plain words. This is deliberate redundancy: the profile carries them
    // properly, and this line means a function that has not been redeployed
    // still honours them rather than silently ignoring the day's shape.
    const notes = [];
    if (a.companions === 'family') notes.push('travelling with children, keep it kid friendly');
    if (a.companions === 'solo') notes.push('travelling alone');
    if (a.startMin != null && a.startMin !== DAY_START_MIN) {
      notes.push(`start the day at ${fmtClockLoose(a.startMin)}`);
    }
    if (a.transitOk) notes.push('a bus or tram for the longer hops is fine');
    if ((a.diet || []).length) notes.push(`food must suit: ${a.diet.join(', ')}`);
    if (a.avoidCrowds) notes.push('avoid the most crowded places and hours');
    if (chatWeather?.rain) notes.push('rain likely, favour indoor stops');
    else if (chatWeather?.hot) notes.push('very hot, favour shade and indoor stops midday');
    const tail = notes.length ? `${notes.join('; ')}.` : '';

    let line = '';
    for (const i of ideas) {
      const when = i.timeOfDay && i.timeOfDay !== 'any' ? ` (${i.timeOfDay})` : '';
      const piece = `${line ? ', ' : ''}${i.name}${when}`;
      if (head.length + tail.length + 'Must include: '.length + line.length + piece.length + 2 > CAP) break;
      line += piece;
    }
    const wishes = line ? `Must include: ${line}.` : '';
    return [head.trim(), wishes, tail].filter(Boolean).join(' ').slice(0, CAP);
  };

  const runChatAi = async (a, onStage = () => {}) => {
    // The ideas step may already have decided the town: when every idea sits
    // in one place, that is where the day is, and the chat never asked.
    const destId = a.town || ideasTownId || exploreTowns[0]?.id;
    const info = await chatDest(destId);
    if (!info) return { ok: false, code: 'too_few' };
    onStage({ key: 'read', vars: { n: info.items.length, city: info.dest.city } });
    // Ideas that are catalogue rows OF THIS TOWN can be pinned onto the deck
    // by index. One from a neighbouring town cannot (the indices belong to a
    // different items array), so it travels as a named wish instead.
    const forceIdx = new Set(
      ideas.filter((i) => i.destId === destId && i.poiIdx != null).map((i) => i.poiIdx),
    );
    const candidates = buildAiCandidates({
      items: info.items,
      walkable: info.walkable,
      excludeIdx: null,
      interests: chatInterests(a),
      limit: 24,
      forceIdx,
    });
    if (candidates.length < 3) return { ok: false, code: 'too_few' };
    onStage({ key: 'shortlist', vars: { n: candidates.length } });
    onStage({ key: 'route', vars: { steps: formatSteps(a.steps || kmToSteps(5), lang) } });
    const centre = cityCoords(info.dest);
    const maxWalkKm = a.maxWalkKm || (a.steps ? stepsToKm(a.steps) : null);
    // Places the traveller named by hand are the one part of the answer the
    // model may not drop. They travel as their own field, with the candidate
    // id attached wherever the idea resolved to a catalogue row of THIS town,
    // so the prompt can pin them without inventing anything.
    const mustInclude = ideas.slice(0, 8).map((i) => ({
      name: i.name,
      lat: Number.isFinite(i.lat) ? i.lat : null,
      lon: Number.isFinite(i.lon) ? i.lon : null,
      id: i.destId === destId && i.poiIdx != null ? String(i.poiIdx) : null,
      timeOfDay: i.timeOfDay && i.timeOfDay !== 'any' ? i.timeOfDay : null,
    })).filter((i) => i.name);
    const res = await requestAiDayPlan({
      dest: {
        id: destId, city: info.dest.city, country: info.dest.country,
        lat: centre.lat, lon: centre.lon,
      },
      date: newStartDate || todayISO(),
      groupSize: groupSizeFor(a.companions) || prefs?.aiGroupSize || 2,
      // A morning or an afternoon is a short day, and a day that runs into
      // the evening is a long one; the rest is an ordinary balanced day.
      pace: a.window === 'morning' || a.window === 'afternoon' ? 'relaxed'
        : a.window === 'evening' ? 'packed' : 'balanced',
      vibe: chatVibe(a),
      avoidHills: !!a.avoidHills,
      freeText: withIdeaWishes(a.freeText || '', a),
      wantEvents: !!a.events,
      mustInclude,
      // The full answer profile rides along so the prompt can honour the
      // things no single existing field captures (walking budget, who is
      // coming, when the day starts, first visit or not, what they eat).
      profile: {
        companions: a.companions || null,
        startTime: fmtClockLoose(a.startMin ?? DAY_START_MIN),
        steps: Number(a.steps) || null,
        maxWalkKm,
        avoidHills: !!a.avoidHills,
        transitOk: !!a.transitOk,
        moods: a.moods || [],
        window: a.window || null,
        known: a.known || null,
        food: a.food || null,
        diet: a.diet || [],
        avoidCrowds: !!a.avoidCrowds,
        weather: chatWeather,
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
      // suggest-city has its own, older vocabulary (focus + interests) and is
      // a separately deployed function, so the chat's moods are translated
      // into it here rather than changing a second contract. Without this the
      // town suggestion silently lost everything the traveller had said.
      focus: moodFocus(a?.moods),
      interests: moodInterests(a?.moods),
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
      dayStartMin: Number.isFinite(a.startMin) ? a.startMin : DAY_START_MIN,
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
    setNewStayWindow(null);
    setSelPois([]);
    setLandingStep('stay');
    openStandalone(sp);
  };

  // Landing screen: a guided flow (stay -> when -> ideas -> how), then either
  // the manual explore map or the chat planner. Saved plans stay reachable
  // from the first step.
  if (!plan) {
    const FLOW = [
      { key: 'stay', labelKey: 'day.stepStay' },
      { key: 'when', labelKey: 'day.stepWhen' },
      { key: 'ideas', labelKey: 'day.stepIdeas' },
      { key: 'how', labelKey: 'day.stepHow' },
    ];
    const activeIdx = FLOW.findIndex((s) => s.key === landingStep);
    const flowIdx = activeIdx >= 0 ? activeIdx : FLOW.length - 1;

    // Picking a day off a trip card answers the stay question and the date
    // question in one tap, so the flow does not walk back through two steps it
    // already has the answers to: the plan opens on that stop and that day.
    const openDayFromTrip = async (planId, stopIndex, dayIndex) => {
      try {
        await openPlan(planId);
        setStopIdx(Math.max(0, stopIndex || 0));
        setDayIdx(Math.max(0, dayIndex || 0));
      } catch { /* the trip was deleted on another device */ }
    };

    // A trip you are on, or one that starts this week, leads: it goes above
    // the search rather than under it.
    const tripsLeadFirst = Boolean(user) && authConfigured && hasImminentTrip(savedPlans);
    const continueTrips = (
      <ContinueTripCards
        plans={savedPlans}
        destinations={destinations}
        loading={plansLoading}
        signedIn={Boolean(user)}
        authConfigured={authConfigured}
        onOpenDay={openDayFromTrip}
        onRequestAuth={onRequestAuth}
        onPlanTrip={onPlanTrip}
      />
    );
    return (
      <div className="trip-planner-screen day-flow-screen">
        {/* The fork step is the one question that is a comparison, so its
            canvas is wider than the 880px the single-answer questions use:
            two cards at ~440px each, rather than two tiles at ~279px. */}
        <div className={`day-flow${landingStep === 'manual' ? ' day-flow-manual' : ''}${
          FORM_STEPS.has(landingStep) ? ' day-flow-split-host' : ''
        }${landingStep === 'how' ? ' day-flow-wide' : ''}`}>
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
          {/* The same rail the trip planner wears, down to the class names:
              the step you are on named in full above it, "step x of n" beside
              that, and one segment per step underlined in the accent. Two
              planners that ask the same kind of question should not answer in
              two different visual languages, and the pills this replaced said
              nothing about what was still coming. */}
          <div className="day-flow-top">
            <div className="shape-head-title">
              {t(FLOW[flowIdx].labelKey)}
              <span className="shape-head-step">
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
            <ol className="wiz-steps" aria-label={t('day.progressAria')}>
              {FLOW.map((s, i) => {
                const state = i < flowIdx ? 'done' : i === flowIdx ? 'now' : 'todo';
                return (
                  <li key={s.key} className={`wiz-step ${state}`}>
                    <button
                      type="button"
                      className="wiz-step-btn"
                      onClick={() => { if (state === 'done') setLandingStep(s.key); }}
                      disabled={state !== 'done'}
                      aria-current={state === 'now' ? 'step' : undefined}
                    >
                      <span className="wiz-step-mark">
                        {state === 'done' ? <CheckIcon size={10} /> : i + 1}
                      </span>
                      <span className="wiz-step-name">{t(s.labelKey)}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
          {howToOpen && (
            <div className="day-flow-help-card">
              <b>{t('day.howItWorks')}</b>
              <p>{editingPlanId ? t('day.editLead') : t('day.landingLead')}</p>
              <button className="day-flow-help-close" onClick={() => setHowToOpen(false)}>{t('common.gotIt')}</button>
            </div>
          )}

          {/* The three landing questions share one canvas, one question to a
              card, so the flow reads as a single surface being filled in
              rather than three pages that happen to follow one another. */}
          {FORM_STEPS.has(landingStep) && (
          <div className={`day-flow-split${landingStep === 'how' ? ' day-flow-split-wide' : ''}`}>
          <div className="day-flow-forms">

          {/* Past step 1, the chosen destination rides above the question:
              the locator map used to be what kept saying "Salzburg" while a
              date was picked; now a compact banner does, wearing the city's
              catalogue photo, and it is the way back to change the answer. */}
          {landingStep !== 'stay' && FORM_STEPS.has(landingStep) && newStayPoint && (() => {
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
                {/* When a trip is running or starts this week, it leads the
                    step: the likely answer sits above the question rather
                    than under it. */}
                {tripsLeadFirst && <div className="day-flow-lead">{continueTrips}</div>}
                <h2 className="day-flow-q">{t('day.whereStaying')}</h2>
                {/* The question is short enough to be ambiguous on its own:
                    "where does your day start" could mean the town. The
                    sub-line says it means the door you walk out of, which is
                    also what makes the planner work at home and not only on
                    holiday. */}
                {!newStayPoint && <p className="day-flow-qsub">{t('day.staySub')}</p>}
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
                      onClick={() => { setNewStayPoint(null); setNewStayWindow(null); setStayResults(null); setStayQuery(''); }}
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
                    onKeyDown={onStayKeyDown}
                    placeholder={t('day.stayPlaceholder')}
                    aria-label={t('day.stayAria')}
                    role="combobox"
                    aria-expanded={Boolean(stayResults?.length)}
                    aria-controls="day-stay-results"
                    aria-autocomplete="list"
                    autoFocus
                  />
                  <button className="trip-add-btn" onClick={searchStay} disabled={staySearching || stayQuery.trim().length < 3}>
                    {staySearching ? '…' : t('day.find')}
                  </button>
                </div>
                )}
                {newStayPoint ? null : stayResults ? (
                  stayResults.length ? (
                    /* Each hit says what KIND of thing it is before it says
                       where: three near-identical address lines are told
                       apart by the icon and the town beneath them, not by
                       reading four commas deep into the same string. */
                    <div className="day-stay-results day-flow-results" id="day-stay-results" role="listbox">
                      {stayResults.map((r, i) => {
                        const lines = geoLines(r);
                        const KindIcon = r.kind === 'hotel' ? BedIcon : r.kind === 'town' ? TownIcon : HomeIcon;
                        return (
                          <button
                            key={i}
                            ref={(el) => { stayResultRefs.current[i] = el; }}
                            className={`day-stay-result day-stay-hit${stayCursor === i ? ' on' : ''}`}
                            role="option"
                            aria-selected={stayCursor === i}
                            onFocus={() => setStayCursor(i)}
                            onKeyDown={onStayKeyDown}
                            onClick={() => { setNewStayWindow(null); setNewStayPoint(r); }}
                          >
                            <span className="day-stay-hit-ico" aria-hidden="true"><KindIcon size={15} /></span>
                            <span className="day-stay-hit-text">
                              <b>{lines.title || r.shortLabel || r.label}</b>
                              {lines.rest && <small>{lines.rest}</small>}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="trip-note">{t('day.noAddressMatchTown')}</p>
                  )
                ) : (
                  /* Nothing typed yet. Rather than an example of what an
                     answer looks like, these ARE the answer for most days:
                     the phone knows where you are standing, the saved trip
                     knows where you are sleeping, and the last plan knows
                     where you started yesterday. */
                  <div className="day-flow-quick">
                    {canLocate && (
                      <div className="day-flow-quickgroup">
                        <button className="day-flow-chip day-flow-quickchip" onClick={useMyLocation} disabled={locBusy}>
                          <CrosshairIcon size={14} />
                          <span>{locBusy ? t('day.locating') : t('day.useMyLocation')}</span>
                        </button>
                        {locErr && <p className="trip-note day-flow-quickerr">{locErr}</p>}
                      </div>
                    )}
                    {upcomingStays.length > 0 && (
                      <div className="day-flow-quickgroup">
                        <span className="day-flow-suggest-label">{t('day.fromYourTrip')}</span>
                        <div className="day-flow-chips">
                          {upcomingStays.map((r) => (
                            <button key={r.key} className="day-flow-chip day-flow-quickchip" onClick={() => pickUpcomingStay(r)}>
                              <RouteIcon size={14} />
                              <span>{r.name}</span>
                              <small>{t('day.tripFrom', { date: fmtDate(r.from) })}</small>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {recentStays.length > 0 && (
                      <div className="day-flow-quickgroup">
                        <span className="day-flow-suggest-label">{t('day.recentStarts')}</span>
                        <div className="day-flow-chips">
                          {recentStays.map((r) => (
                            <button key={r.key} className="day-flow-chip day-flow-quickchip" onClick={() => pickRecentStay(r)}>
                              <ClockIcon size={14} />
                              <span>{r.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
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
                      <span>{q.labelKey ? t(q.labelKey) : q.label}</span>
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
                    min={dayWindowUsable ? dayDateMin : today}
                    max={dayWindowUsable ? dayDateMax : addDays(today, DATE_HORIZON_DAYS)}
                    onChange={setNewStartDate}
                    placeholder={t('day.startDate')}
                  />
                </div>
                <button className="day-flow-next" onClick={() => setLandingStep('ideas')} disabled={!newStartDate}>
                  {t('day.next')}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3, anything already in mind. Answering "no" is a complete
              answer and goes straight on, so the step costs one tap for the
              many days that have no fixed point in them. */}
          {landingStep === 'ideas' && (
            <DayIdeasStep
              stayPoint={newStayPoint}
              explorePois={explorePois}
              exploreTowns={exploreTowns}
              shortlistPoints={shortlistPoints}
              destinations={destinations}
              ideas={ideas}
              onChange={setIdeas}
              onSkip={() => { setIdeas([]); setLandingStep('how'); }}
              onContinue={() => setLandingStep('how')}
            />
          )}

          {/* STEP 4, how do you want to plan it */}
          {landingStep === 'how' && (
            <div className="day-flow-step">
              <div className="day-flow-panel day-flow-panel-wide">
                <h2 className="day-flow-q">{t('day.howToPlan')}</h2>
                {/* Both cards end in the action they perform, and both open
                    with a picture of the shape of that answer: a route line
                    for the bot, the places themselves for the builder. */}
                <div className="day-flow-cards">
                  <button className="day-flow-card primary" onClick={() => setLandingStep('chat')}>
                    {/* A route is a line that visits places; that is the whole
                        difference between this card and the other one, so each
                        one draws its own answer above the words for it. */}
                    <span className="day-flow-card-prev" aria-hidden="true"><RoutePreview /></span>
                    <span className="day-flow-card-top">
                      <span className="day-flow-card-ico"><SparkIcon size={26} /></span>
                      <span className="day-flow-card-tag">{t('day.recommendedTag')}</span>
                    </span>
                    <b>{t('day.useChatbot')}</b>
                    <small>{t('day.useChatbotSub')}</small>
                    <ul className="day-flow-card-points">
                      <li><CheckIcon size={12} /> {t('day.chatPoint1')}</li>
                      <li><CheckIcon size={12} /> {t('day.chatPoint2')}</li>
                      <li><CheckIcon size={12} /> {t('day.chatPoint3')}</li>
                      {/* The ideas step is upstream of this one, so the
                          recommended card can promise what it will keep. */}
                      {ideas.length > 0 && (
                        <li className="day-flow-card-ideas">
                          <CheckIcon size={12} />{' '}
                          {t(ideas.length === 1 ? 'day.cardIncludesIdeas' : 'day.cardIncludesIdeasPl', { n: ideas.length })}
                        </li>
                      )}
                    </ul>
                    <span className="day-flow-card-go">
                      {t('day.cardGoBot')}<ChevronRightIcon size={14} />
                    </span>
                  </button>
                  <button className="day-flow-card" onClick={goManualWithIdeas}>
                    <span className="day-flow-card-prev" aria-hidden="true">
                      <ThumbsPreview photos={howPreviewPhotos} />
                    </span>
                    <span className="day-flow-card-top">
                      <span className="day-flow-card-ico"><MapPinIcon size={26} /></span>
                    </span>
                    <b>{t('day.planManually')}</b>
                    <small>
                      {howTownName
                        ? t('day.planManuallySub', { town: howTownName })
                        : t('day.planManuallySubHere')}
                    </small>
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
              column half empty and pushed saved plans off the fold.

              Unless a trip is running or about to: then continuing it IS the
              likely answer, and it goes ABOVE the search (rendered there, in
              the step panel). Offering a search box first to somebody who
              is in Bruges on day two of a saved trip asks them to type what
              the app already knows. */}
          {landingStep === 'stay' && (
            <div className="day-flow-saved">
              {!tripsLeadFirst && continueTrips}
              <DayPlanCards
                plans={standalonePlans}
                destinations={destinations}
                onOpen={openStandalone}
                onDelete={deleteStandalone}
              />
              {!authConfigured && <p className="trip-note">{t('day.noAuthNote')}</p>}
            </div>
          )}

          </div>
          </div>
          )}

          {/* The chat planner: questions, a proposed route, then import. */}
          {landingStep === 'chat' && (
            <CartaChatPlanner
              initialAnswers={chatPresets}
              onSignIn={onRequestAuth}
              towns={exploreTowns}
              dateISO={newStartDate}
              groupSize={prefs?.aiGroupSize || 2}
              signedIn={!!user && authConfigured}
              onRun={runChatAi}
              presetTownId={ideasTownId}
              ideas={ideas}
              defaultTownId={chatDefaultTownId}
              townCandidateCount={chatTownCounts.id === chatDefaultTownId ? chatTownCounts.total : null}
              townMustSeeCount={chatTownCounts.id === chatDefaultTownId ? chatTownCounts.mustSee : null}
              weatherNote={chatWeatherNote}
              hasEvents={chatHasEvents}
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

          {/* "Build it myself" (D6): the guided builder. What stood here was
              map-first, a search box and four chips over a 68vh map, which
              made the traveller name what they wanted before the screen would
              show them anything. The builder leads with the places instead:
              rails of real cards around the stay, a tray that keeps count, and
              Carta one button away at any point, including from an empty tray. */}
          {landingStep === 'manual' && newStayPoint && (
            <DayExploreBuilder
              stay={newStayPoint}
              dateISO={newStartDate}
              explorePois={explorePois}
              exploreTowns={exploreTowns}
              destinations={destinations}
              stayTownId={stayTownId}
              ideas={ideas}
              shortlistPoints={shortlistPoints}
              picks={selPois}
              townPicks={newStops}
              onTogglePick={togglePoiPick}
              onMovePick={movePick}
              onToggleTown={(id) => (newStops.some((s) => s.destinationId === id)
                ? removeLandingCity(id) : addLandingCity(id))}
              onStartPlanning={startExplorePlanning}
              onLetCartaPlan={letCartaFinish}
              onChangeStay={() => setLandingStep('stay')}
              onOpenDest={onOpenDest}
              onOpenFeature={onOpenFeature}
              editing={!!editingPlanId}
            />
          )}

        </div>
      </div>
    );
  }

  // Where the traveller sleeps tonight, as the map bar says it.
  const stayLabel = plan.stayPoint?.shortLabel || plan.stayPoint?.label || '';
  const walksHere = scenicWalksFor(stop?.dest?.city || '');
  const dayNumber = dayOffset + dayIdx + 1;

  return (
    <div className="trip-planner-screen day-ws">
      {saveToast && <div className="trip-save-toast" role="status">{saveToast}</div>}
      {savedInfo && (
        <div className="day-saved-overlay" role="dialog" aria-modal="true" onClick={() => setSavedInfo(false)}>
          <div className="day-saved-card" onClick={(e) => e.stopPropagation()}>
            <button
              className="day-saved-close"
              onClick={() => { setSavedInfo(false); setPlan(null); }}
              aria-label={t('dayws.backToPlans')}
              title={t('dayws.backToPlans')}
            >×</button>
            <div className="day-saved-badge"><BookmarkIcon size={20} /></div>
            <h3>{t('dayws.savedTitle')}</h3>
            <p>{t('dayws.savedBody')}</p>
            <button className="day-saved-done" onClick={() => setSavedInfo(false)}>{t('dayws.savedKeep')}</button>
          </div>
        </div>
      )}
      {aiOpen && stop && (
        <AiDayPlanModal
          city={stop.dest?.city || ''}
          dayNumber={dayNumber}
          dateISO={days[dayIdx] || prefs?.aiDate || ''}
          groupSize={prefs?.aiGroupSize || aiGroupSize()}
          signedIn={!!user && authConfigured}
          preset={botPreset}
          onRun={runAi}
          onApply={applyAiResult}
          onFallback={fallbackAi}
          onClose={() => { setAiOpen(false); setBotPreset(null); }}
          entitlement={entitlement}
          onOpenPass={(reason) => paywall.require(reason || 'browse')}
        />
      )}
      <TripMap
        stops={routePins}
        padBottom={isNarrow ? Math.min(sheetPx, 420) : 420}
        routeGeometry={routeOk ? route.geometry : null}
        routeSegments={routeOk ? route.segments : null}
        focus={stop?.dest?.lat != null ? { ...cityCoords(stop.dest), zoom: 12.2 } : null}
        flyTo={flyPoi}
        pois={aiDiscoveryPins.length ? [...mapPois, ...aiDiscoveryPins] : mapPois}
        onPoiClick={(id) => toggleActivity(Number(id))}
        onSelectStop={onMapStopClick}
        selectedIndex={selectedMarkerIdx}
        easeToSelected={false}
        onViewChange={setMapView}
        fitMaxZoom={13}
      />

      {/* The map's own furniture, in one column so nothing can overlap.
          Row one is the two facts a traveller wants without scrolling: where
          they are sleeping, and what a local would tell them. The pin filters
          below it appear only while they are actually browsing places, since
          on the other two tabs there is nothing for them to filter. */}
      <div className="dayws-overlay">
        <div className="dayws-top">
          <DayStayBar
            stayLabel={stayLabel}
            editable={!!plan.standalone}
            query={stayQuery}
            onQuery={setStayQuery}
            onSearch={searchStay}
            searching={staySearching}
            results={stayResults}
            onPick={(r) => {
              patchStandalone((sp) => { sp.stayPoint = r; return sp; });
              setStayQuery('');
              setStayResults(null);
            }}
            onClear={() => {
              setStayQuery('');
              setStayResults(null);
              patchStandalone((sp) => { sp.stayPoint = null; return sp; });
            }}
            transportBlock={plan.standalone && stop && dayTripView ? (
              <DayTripTransport
                fromDest={dayTripFrom}
                toDest={dayTripView.toDest}
                opts={dayTripView}
                mode={tripMode}
                onPickMode={setTripMode}
              />
            ) : null}
          />
          <DayTipsPanel
            city={stop?.dest?.city || ''}
            country={stop?.dest?.country || ''}
            countryRec={stop?.dest?.country ? countryInsights?.[stop.dest.country] : null}
            intel={intel}
            walks={walksHere}
            dayWalks={dayWalks}
            assignedIdx={dayAssignedIdx}
            onToggleIntel={toggleActivity}
            onToggleWalk={toggleWalk}
          />
        </div>

        {wsTab === 'add' && stop && mapDeck.length > 0 && (
          <div className="day-map-tools day-map-tools-inline" onClick={(e) => e.stopPropagation()}>
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
                  ? t('day.mapHintPicked', { city: stop?.dest?.city || t('day.thisCity'), n: dayNumber })
                  : t('day.mapHintTap', { n: dayNumber })}
              </span>
            </p>
          </div>
        )}
      </div>

      <CartaBotFab
        dayNumber={dayNumber}
        hasPlan={assignedItems.length > 0}
        onPick={runBotPrompt}
      />

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
          aria-label={t('dayws.gripAria')}
          title={t('dayws.gripTitle')}
        >
          <div className="trip-sheet-grip" />
        </div>

        {/* Plan header. On phones the whole card doubles as a drag handle, so
            the sheet can be pushed down to give the map the whole screen and
            pulled back up again; controls inside it opt out of the drag. */}
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
              <div className="trip-topcard-name">{plan.label || t('dayws.untitled')}</div>
              <div className="trip-topcard-sub">
                {stop?.dest?.city || t('dayws.noStops')}
                {days[dayIdx] ? `, ${fmtDate(days[dayIdx])}` : ''}
              </div>
              {/* A day cut out of a trip keeps its way back to that trip: the
                  cities and nights it was cut from live in the Trip tab, and
                  the traveller who arrived from "Plan your days" is one tap
                  from where they were. Standalone plans have no trip. */}
              {!plan.standalone && (onOpenTrip || onPlanTrip) && (
                <button
                  type="button"
                  className="day-topcard-trip"
                  onClick={() => (plan.tripDraft || !onOpenTrip ? onPlanTrip?.() : onOpenTrip(plan.id))}
                >
                  <ArrowLeftIcon size={12} />
                  <span>{t('dayws.backToTrip')}</span>
                </button>
              )}
            </div>
            {/* Always-visible save state: standalone plans (and their picks)
                persist on this device automatically; trip-based plans get an
                explicit one-tap save into Saved trips. */}
            {plan.standalone ? (
              <span className="day-save-btn saved" title={t('dayws.autoSavedTitle')}>
                ✓ {t('dayws.saved')}
              </span>
            ) : (
              <button
                className={`day-save-btn ${daySaveState === 'saved' ? 'saved' : ''}`}
                onClick={saveToSavedTrips}
                disabled={daySaveState === 'saved'}
                title={t('dayws.saveTitle')}
              >
                <BookmarkIcon size={12} /> {daySaveState === 'saved' ? `${t('dayws.saved')} ✓` : t('dayws.saveDay')}
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
                  <span>{t('day.statSteps', { n: formatSteps(kmToSteps(route.km), lang) })}</span>
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

        {/* Which city, which day. Above the tabs because it scopes all three
            of them: the plan, what you could add, and the paperwork. */}
        {stop && (
          <div className="dayws-daybar">
            {stops.length > 1 && (
              <div className="day-chip-row day-strip-cities">
                {stops.map((s, i) => (
                  <span key={i} className={`day-chip day-city-chip ${i === stopIdx ? 'active' : ''}`}>
                    <button
                      className="day-city-chip-main"
                      onClick={() => { setStopIdx(i); setDayIdx(0); }}
                    >
                      {s.dest?.city || t('day.unknown')}
                    </button>
                    {plan.standalone && stops.length > 1 && (
                      <button
                        className="day-city-chip-del"
                        onClick={() => removeStandaloneCity(i)}
                        aria-label={t('day.removeX', { name: s.dest?.city || 'city' })}
                        title={t('day.remove')}
                      >×</button>
                    )}
                  </span>
                ))}
                {plan.standalone && (
                  <button
                    className={`day-chip day-chip-add${cityAddOpen ? ' active' : ''}`}
                    onClick={() => setCityAddOpen((v) => !v)}
                    aria-expanded={cityAddOpen}
                  >+ {t('dayws.addCity')}</button>
                )}
              </div>
            )}
            {plan.standalone && stops.length === 1 && (
              <div className="day-chip-row day-strip-cities">
                <span className="day-chip day-city-chip active">
                  <span className="day-city-chip-main">{stop.dest?.city || t('day.unknown')}</span>
                </span>
                <button
                  className={`day-chip day-chip-add${cityAddOpen ? ' active' : ''}`}
                  onClick={() => setCityAddOpen((v) => !v)}
                  aria-expanded={cityAddOpen}
                >+ {t('dayws.addCity')}</button>
              </div>
            )}
            {cityAddOpen && plan.standalone && (
              <div className="dayws-city-add">
                <Dropdown
                  value={addCityId}
                  onChange={setAddCityId}
                  options={allCityOptions}
                  placeholder={t('dayws.cityPickPlaceholder')}
                  searchPlaceholder={t('dayws.cityPickSearch')}
                />
                <button
                  className="trip-add-btn"
                  onClick={() => { addStandaloneCity(); setCityAddOpen(false); }}
                  disabled={!addCityId}
                >{t('dayws.cityAdd')}</button>
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
                  {t('itin.dayN', { n: dayOffset + i + 1 })}
                </button>
              ))}
              {plan.standalone && (
                <button className="day-chip day-chip-add" onClick={addStandaloneDay} title={t('dayws.addDayTitle')}>
                  + {t('dayws.addDay')}
                </button>
              )}
            </div>
          </div>
        )}

        <DayTabsRail
          tab={wsTab}
          onTab={setWsTab}
          counts={{ plan: assignedItems.length }}
        />

        <div className="trip-sheet-scroll">
          {wsTab === 'plan' && (
            <DayPlanPanel
              items={assignedItems}
              dayNumber={dayNumber}
              city={stop?.dest?.city || ''}
              onMoveUp={(i) => moveAssigned(i, -1)}
              onMoveDown={(i) => moveAssigned(i, 1)}
              onRemove={(i) => toggleActivity(dayAssignedIdx[i])}
              rowRefs={rowRefs}
              flashIdx={flashRow?.idx ?? null}
              onHoverRow={setHoverRow}
              onAddMore={() => setWsTab('add')}
              onOptimize={optimizeNow}
              onAskCarta={() => { setBotPreset(null); setAiOpen(true); }}
              canOptimize={routeMode === 'manual'}
              gmapsUrl={gmapsUrl}
              onShare={shareDay}
              shareState={shareState}
              onPdf={downloadPdf}
              onKml={downloadKmlFile}
              onIcs={downloadIcsFile}
              citytrip={citytrip}
              onUseCitytrip={applyCitytrip}
              walksBlock={pinnedWalksBlock}
              discoveries={aiDiscoveries}
              aiSummary={aiPlan?.summary || ''}
            />
          )}

          {wsTab === 'add' && stop && (
            <DayAddPanel
              city={stop.dest?.city || ''}
              deck={browseDeck}
              farDeck={farSights}
              assignedIdx={dayAssignedIdx}
              onToggle={toggleActivity}
              onFocus={focusPlace}
              focusedIdx={flyPoi?.idx ?? null}
              query={poiQuery}
              onQuery={setPoiQuery}
              searchResults={poiSearch}
              onAddCustom={(q) => addCustomPlace(q)}
              customBusy={customBusy}
              routes={readyRoutes}
              citytrip={citytrip}
              onUseCitytrip={applyCitytrip}
              onUseRoute={useReadyRoute}
              onAskCarta={() => { setBotPreset(null); setAiOpen(true); }}
              suggestions={addSuggestions}
              limited={activities.limited}
              mode={addMode}
              onMode={setAddMode}
              pick={addPick}
              onPick={setAddPick}
              shortlist={shortlistDeck}
            />
          )}

          {wsTab === 'files' && (
            <DayFilesPanel
              planId={plan.id}
              notes={extras.notes || ''}
              onNotes={setNotes}
              importBlock={stop && dayImportContext ? (
                <>
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
                        title={t('day.importAddTitle', { n: dayNumber })}
                      >
                        + {t('day.importAddHere', { n: dayNumber })}
                      </button>
                      <button className="trip-stop-remove" onClick={() => discardIdea(idea)} aria-label={t('extras.removeTitle')} title={t('extras.removeTitle')}>×</button>
                    </div>
                  ))}
                </>
              ) : null}
            />
          )}

          <div className="trip-block dayws-back">
            <button className="trip-newtrip-btn" onClick={() => setPlan(null)}>← {t('dayws.backToPlans')}</button>
          </div>
        </div>
      </div>
    </div>
  );
});
