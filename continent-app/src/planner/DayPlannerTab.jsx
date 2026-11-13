import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// The rules only this route renders load with its chunk (T474, CSS per route;
// scripts/css-routes.mjs).
import '../styles/planners.css';
import { TripMap } from '../map/TripMap.jsx';
import { DayExploreMap } from '../map/DayExploreMap.jsx';
import { Button, IconButton } from '../components/ui/index.js';
import { gatewayCity, isGateway } from '../lib/rating.js';
import { ScoreChip, HiddenGemTag } from '../components/RatingBadge.jsx';
import { tripDaysBetween, haversineKm, cityCoords } from '../lib/runtime_pricing.js';
import { priceDay, atDates } from '../lib/price/index.js';
import { cityLabel } from '../lib/placeName.js';
import { fetchDestPoiMap } from '../lib/appData.js';
import { fetchTripPlans, fetchTripPlanWithStops } from '../auth/tripPlanStorage.js';
import {
  fetchDrivingRoute, googleMapsDirUrl, googleMapsDirParts, GMAPS_STOPS_PHONE, GMAPS_STOPS_DESKTOP,
} from '../lib/routing.js';
import { routeDay, routeSegments, isWalkable } from '../lib/dayRoute.js';
import { useI18n } from '../i18n/index.jsx';
import { geocodeAddress, reverseGeocode, geoLines } from '../lib/geocode.js';
import { scenicWalksFor } from '../lib/scenicWalks.js';
import { useCountryInsights } from '../hooks/useCountryInsights.js';
import { addDays, todayISO, useToday, fmtDate as fmtDateFull } from '../lib/dates.js';
import { draftDays, optimizeOrder, pickerDeck, walkableIdxSet, feasibilityLimits, isMustSee, dwellMinutes, scenicSuggestions, poiKind, canonicalPoiIndices, DAY_STYLES } from './dayDraft.js';
import { DayBotChat } from './days/DayBotChat.jsx';
import { AutoPlanBar } from './days/AutoPlanBar.jsx';
import { TripDaysOverview } from './days/TripDaysOverview.jsx';
import { usePaywall } from '../hooks/usePaywall.jsx';
import { AI_PLAN_MOCK, buildAiCandidates, requestAiDayPlan, decorateAiStops } from './aiDayPlan.js';
import { estimateWalkMinutes, fmtDur } from './dayFormat.js';
import {
  buildDaySchedule, fmtClockLoose, GAP_SUGGEST_MIN, DAY_START_MIN,
  rowBands, moveStopInDay, canMoveStop, insertStopInBand, optimizeWithinBands, prunePins,
} from './daySchedule.js';
import { loadDayDetail, saveDayDetail } from './dayDetail.js';
import { ticketOf, dayTicketTotals } from '../lib/dayTickets.js';
import { DayCostBar, DayStrip, DayReceiptSheet } from './DayCost.jsx';
import { MapDrawer } from '../components/MapDrawer.jsx';
import { PageBar } from '../browse/PageBar.jsx';
import { DayCrumbs } from './days/DayCrumbs.jsx';
import { quoteTrip } from '../lib/tripTotal.js';
import { draftQuoteState } from '../lib/price/draftState.js';
import { useLiveFlights } from '../lib/flights/useLiveFlights.js';
import { plannerStateFromPlan } from '../lib/myTrips.js';
import { fetchForecast } from '../lib/weather.js';
import { loadDossier } from '../lib/dossier.js';
import { resolveFeatureRow } from '../hooks/useFavoriteItems.js';
import { PoiThumb } from './DayActivityRows.jsx';
import { SettledLine, useUndo, UndoToast } from './DayPlanPanel.jsx';
import { DayAddPanel } from './DayAddPanel.jsx';
import { DayFilesPanel } from './DayFilesPanel.jsx';
import { DayTipsBody, tipsCount } from './DayWorkspaceChrome.jsx';
import { KIT_ICONS } from './DayOverview.jsx';
import { decodeDayShare } from '../lib/shareLink.js';
import {
  loadStandalonePlans, persistStandalonePlans, deleteStandalonePlan,
  loadAssignments, persistAssignments, loadPrefs, persistPrefs,
  loadTripExtras, persistTripExtras,
  subscribeDayPlanStore, TRIP_DRAFT_PLAN_ID,
} from './dayPlanStore.js';
import { loadTripDraft } from './tripDraftStore.js';
import { plannerStore } from './plannerStore.js';
import { aroundOf, fromDraft, dayAiPreset, dayPrefs, flightRanking } from './flow/tripSettings.js';

const OPEN_DAY_KEY = 'carta.dayOpen.v1'; // T507: the day open when the page was left
import {
  loadDiscovered, saveDiscovered, removeDiscovered, subscribeDiscovered, isStale,
} from './discoveredStore.js';
import { researchCity } from '../lib/cityResearch.js';
import { SparkIcon, InfoIcon, ShareIcon, DownloadIcon, CoffeeIcon, FilterIcon, ChevronDownIcon, UploadIcon, CloseIcon, ListDayIcon } from '../components/Icons.jsx';
import { MagicImportZone } from './MagicImportZone.jsx';
import { NO_PINS, buildStandalonePlan, mockTripPlans } from './days/dayPlannerData.js';
import { useDayChatAi } from './days/useDayChatAi.js';
import { useDayStartData } from './days/useDayStartData.js';
import { useDayExports } from './days/useDayExports.js';
import { useDayTrip } from './days/useDayTrip.js';
import { useDayMapDecks } from './days/useDayMapDecks.js';
import { useDayAiApply } from './days/useDayAiApply.js';
import { useDayEdits } from './days/useDayEdits.jsx';
import { useDayBuilder } from './days/useDayBuilder.js';
import { SAVED_MOCK } from './days/dayPlannerData.js';
import { DayPlannerStart } from './days/DayPlannerStart.jsx';
import { DayBody } from './days/DayBody.jsx';

// How the explore search & "Let Carta guide you" name each pin category.
// i18n keys, resolved with t() at render time.
const EXPLORE_CAT_KEY = { town: 'day.catTown', beach: 'day.catBeach', sight: 'day.catSight', active: 'day.catActive' };


// The one empty day, shared, so a day with nothing assigned does not hand the
// scenic and suggestion memos a new array on every render (T192).
const NO_ASSIGNED = Object.freeze([]);








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
  // T895: the Plan overview, the breadcrumb's first step.
  onPlanHome = null,
  // T433: Explore's cost map (App computes it once) for the day's one
  // per-person figure, and the Lifestyle panel that moves it.
  costs = null, onOpenLifestyle = null,
  // T666: the app's one price request (lib/price/); a stop's day is priced
  // at the stop's own dates with it.
  priceRequest = null,
  // T501: what the trip around a day costs (quoteTrip at the traveller's
  // Lifestyle and stay tier) and the party a standalone day is priced for.
  stayTier = 'home', lifestyle = null, groupSize = 1,
  // A day plan someone shared as a link (#day=, read by App once).
  sharedDayRaw = null, onSharedDayConsumed = null,
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
  // A failed fetch of the saved trips is a failure, not "you have no trips":
  // the Continue-a-trip block says so and offers a retry (T193, T189-b).
  const [plansError, setPlansError] = useState(false);
  const [plansTry, setPlansTry] = useState(0);
  const [plan, setPlan] = useState(null); // { id, label, stops: [...] }
  const [stopIdx, setStopIdx] = useState(0);
  const [dayIdx, setDayIdx] = useState(0);
  const [assignments, setAssignments] = useState({}); // { [stopIdx]: { [dayIdx]: [activityIdx,...] } }
  // Carta-plan answers (null until asked) + whether the inline plan panel
  // (the "Shape day N" questions in the rail) is open.
  const [prefs, setPrefs] = useState(null);
  // The AI day-planner dialog (plan-day Edge Function). Applied AI schedules
  // live in prefs.aiPlans keyed "stopIdx:dayIdx", so they survive reloads and
  // ride the same per-plan cloud sync as every other answer.
  const [aiOpen, setAiOpen] = useState(false);
  // T823: "Let Carta plan them" plans the whole trip: { phase: init | run |
  // done | stopped | fail, list: [[stop, day]], i, planned, code, preset }.
  const [autoQueue, setAutoQueue] = useState(null);
  const autoBusy = useRef(false);
  // T672: the trip's days overview instead of one day.
  const [overview, setOverview] = useState(false);
  // Carta keeps the walking order optimal on every add ('auto'); manual
  // reordering switches to 'manual' until "Best route" is tapped again.
  const [routeMode, setRouteMode] = useState('auto');
  const [shareState, setShareState] = useState('idle'); // idle | copied

  // T433: the planned day is a page on a phone (the trip planner's pattern),
  // so the draggable bottom sheet that used to hold it is gone.
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = (e) => setIsNarrow(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // T501 (roadmap 1.3d): from 1024 px the day is a column beside the map with
  // the cost bar at its foot; below it the map fills the screen and the day
  // lies over it in the shared map drawer (T500's MapDrawer).
  const [isDesk, setIsDesk] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = (e) => setIsDesk(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const [drawer, setDrawer] = useState('half');
  // How much structure the traveller wants on a day (owner T492-c), kept
  // per traveller on this device.
  const [detail, setDetailState] = useState(loadDayDetail);
  const setDetail = (lv) => { setDetailState(lv); saveDayDetail(lv); };
  // The places to add, open with a part of the day chosen ('morning',
  // 'afternoon', 'evening') or the day's end ('end'); null shows the day.
  const [adding, setAdding] = useState(null);
  const [receiptOpen, setReceiptOpen] = useState(false);


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
  // Live, so a tab left open overnight does not keep offering yesterday as
  // "today" (useToday re-checks at midnight and when the tab is shown again).
  const today = useToday();
  const [newStartDate, setNewStartDate] = useState(() => todayISO());
  // How many days the new plan covers (T433): a stop of a trip with three
  // nights in Lisbon is planned as three days, cut by neighbourhood.
  const [newDayCount, setNewDayCount] = useState(1);
  // Which way the last move through the questions went, so the next screen
  // enters from that side (the trip wizard's motion).
  const [flowDir, setFlowDir] = useState('fwd');
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
  // "Add another city" picker inside an open standalone plan.
  const [addCityId, setAddCityId] = useState('');
  // Free-text sight search across the city's FULL catalogue, including
  // big-name places beyond walking range (Mont-Saint-Michel from Saint-Malo).
  const [poiQuery, setPoiQuery] = useState('');
  // "Save this day trip to Saved trips" feedback for trip-based plans.
  const [daySaveState, setDaySaveState] = useState('idle');
  const [saveToast, setSaveToast] = useState('');
  // Undo instead of confirm (rule N6, T409): a stop or a plan goes at once and
  // comes back with one tap for six seconds.
  const { pending: undoPending, offer: offerUndo, undo: doUndo } = useUndo();
  const [hiddenPlanIds, setHiddenPlanIds] = useState(() => new Set());
  // Landing explore map: which pin categories are shown (towns by default so
  // the map never opens overloaded), which pin is briefed in the side panel,
  // and which sights/beaches are picked alongside the towns in `newStops`.
  const [selPois, setSelPois] = useState([]); // [{ key, destId, idx }]
  const searchStay = async () => {
    if (staySearching || stayQuery.trim().length < 3) return;
    setStaySearching(true);
    const results = await geocodeAddress(stayQuery);
    setStayResults(results);
    setStaySearching(false);
  };

  // Keyed on the account id, not the user object: a refreshed session hands
  // over a new object for the same person, which must not refetch the plans.
  const userId = user?.id || null;
  useEffect(() => {
    if (SAVED_MOCK) { setSavedPlans(mockTripPlans()); return; }
    if (!userId) { setSavedPlans([]); return; }
    setPlansLoading(true);
    setPlansError(false);
    // A rejected fetch (offline, or a session whose token no longer verifies)
    // must not escape as an unhandled rejection. Standalone day plans carry
    // on working from this device; the trip block says the load failed.
    fetchTripPlans(userId)
      .then(setSavedPlans)
      .catch(() => { setSavedPlans([]); setPlansError(true); })
      .finally(() => setPlansLoading(false));
  }, [userId, plansTry]);

  // Shared open-plan bootstrap: restore assignments + shape-your-day answers,
  // and lead with the wizard when nothing is planned yet.
  const bootPlan = (planId) => {
    // Opening a plan finishes with the landing's answers: coming back to the
    // landing starts a NEW day, not the last one's start point (T433).
    setNewStayPoint(null);
    setNewStayWindow(null);
    setNewDayCount(1);
    setStopIdx(0);
    setDayIdx(0);
    setDaySaveState('idle');
    setAdding(null);
    setReceiptOpen(false);
    setDrawer('half');
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

  // A shared day opens as a plan of the recipient's own (T433). Only towns
  // the catalogue knows are kept, a date already behind us moves to today,
  // and every walk is routed again here: nothing but ids came in the link.
  useEffect(() => {
    if (!sharedDayRaw) return undefined;
    let live = true;
    decodeDayShare(sharedDayRaw).then((d) => {
      if (!live) return;
      onSharedDayConsumed?.();
      if (!d) return;
      const keep = d.stops.map((st, i) => ({ st, i })).filter(({ st }) => destinations[st.destinationId]);
      if (!keep.length) return;
      const assign = {};
      keep.forEach(({ i }, k) => { if (d.assign[i]) assign[k] = d.assign[i]; });
      const today = todayISO();
      const sp = {
        id: `local:${Date.now()}`,
        label: d.label || keep.map(({ st }) => cityLabel(destinations[st.destinationId]?.city || '')).join(' + '),
        startDate: d.startDate && d.startDate >= today ? d.startDate : today,
        stayPoint: d.stay,
        stops: keep.map(({ st }) => ({ destinationId: st.destinationId, days: st.days })),
      };
      persistAssignments(sp.id, assign);
      const next = [sp, ...loadStandalonePlans()];
      setStandalonePlans(next);
      persistStandalonePlans(next);
      openStandalone(sp);
      setSaveToast(t('dayws.sharedOpened'));
      window.setTimeout(() => setSaveToast(''), 3500);
    });
    return () => { live = false; };
  }, [sharedDayRaw]); // eslint-disable-line react-hooks/exhaustive-deps -- one-shot hand-off, consumed on read

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
    setPlan({ id: TRIP_DRAFT_PLAN_ID, label: draft.planLabel || t('ready.yourTrip'), tripDraft: true, stops });
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
        const { planId: targetPlanId, stopIndex, dayIndex, overview: wantOverview, autoFill, bot: wantBot } = openPlanId;
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
          // A day opened from its trip skips Start and Days (city, date and
          // bed come from the trip) and, when nothing is on it yet, starts at
          // What: the places to add (T501, roadmap 1.3d state 5).
          const a = loadAssignments(targetPlanId || TRIP_DRAFT_PLAN_ID);
          const onDay = a?.[Math.max(0, stopIndex || 0)]?.[Math.max(0, dayIndex || 0)] || [];
          // T672: "Plan your days" opens the trip's days overview first.
          setOverview(Boolean(wantOverview));
          // T674: the trip's day rhythm (trip settings) under the day's own
          // prefs: what was set on a day stays; what was never set follows
          // the rhythm. The detail level is the device's, set when answered.
          const tripSettings = fromDraft(plannerStore.getState());
          const rhythm = dayPrefs(tripSettings);
          const planKey = targetPlanId || TRIP_DRAFT_PLAN_ID;
          const stored = loadPrefs(planKey) || {};
          const merged = { ...stored };
          for (const k of ['dayStartMin', 'pace', 'stepFree', 'groupSize']) {
            if (merged[k] == null && rhythm[k] != null) merged[k] = rhythm[k];
          }
          setPrefs(merged);
          persistPrefs(planKey, merged);
          if (rhythm.detail) setDetailState(rhythm.detail);
          // "Let Carta plan the days": the first day opens with Carta at work.
          // T823 (owner 2026-10-29): Carta plans every day, one by one; the
          // queue below walks the trip's days. A guest sees the bot's form,
          // which says it needs an account.
          if (autoFill && ((user && authConfigured) || AI_PLAN_MOCK != null)) {
            setAutoQueue({ phase: 'init', planKey, preset: dayAiPreset(tripSettings), list: [], i: 0, planned: 0, code: '' });
          } else if (autoFill) {
            setBotPreset({ ...dayAiPreset(tripSettings), autoRun: true });
            setAiOpen(true);
          }
          // T896: Plan with the Carta bot opens the first day with the bot.
          if (wantBot) { setBotPreset({ ...dayAiPreset(tripSettings), autoRun: false }); setAiOpen(true); }
          // An empty day opens on its places, unless Carta is about to fill it.
          setAdding(onDay.length || wantOverview || autoFill || wantBot ? null : 'end');
          setDrawer('half');
        }
      } else {
        const sp = standalonePlans.find((x) => x.id === openPlanId);
        if (sp) openStandalone(sp);
        else { try { await openPlan(openPlanId); } catch { /* not found */ } }
      }
      onOpenPlanConsumed && onOpenPlanConsumed();
    })();
  }, [openPlanId]); // eslint-disable-line react-hooks/exhaustive-deps -- one-shot hand-off: the open helpers are rebuilt every render, and re-running while the async open is in flight would open the plan twice

  // T507 (T502-c): a reload on ?tab=plan&mode=day opens the day the traveller
  // was on (plan, stop, day) instead of starting a new one. Only the three
  // pointers are kept here; the plan itself and its picks already live in the
  // plan stores. A hand-off in (open id, seed, shared day) wins over it.
  const openDayRef = useRef({ restored: false });
  useEffect(() => {
    if (!openDayRef.current.restored) return;
    try {
      if (plan?.id) window.localStorage.setItem(OPEN_DAY_KEY, JSON.stringify({ id: plan.id, stopIdx, dayIdx }));
      else window.localStorage.removeItem(OPEN_DAY_KEY);
    } catch { /* storage off: the day just does not come back */ }
  }, [plan?.id, stopIdx, dayIdx]); // eslint-disable-line react-hooks/exhaustive-deps -- pointers only
  useEffect(() => {
    let rec = null;
    try { rec = JSON.parse(window.localStorage.getItem(OPEN_DAY_KEY) || 'null'); } catch { rec = null; }
    if (!rec?.id || openPlanId || daySeed || sharedDayRaw) { openDayRef.current.restored = true; return undefined; }
    let live = true;
    (async () => {
      let opened = false;
      try {
        if (rec.id === TRIP_DRAFT_PLAN_ID) {
          const draft = loadTripDraft();
          if (draft) { openTripDraft(draft); opened = true; }
        } else {
          const sp = standalonePlans.find((x) => x.id === rec.id);
          if (sp) { openStandalone(sp); opened = true; } else { await openPlan(rec.id); opened = true; }
        }
      } catch { /* the plan is gone: Start shows */ }
      if (opened && live) {
        setStopIdx(Math.max(0, Number(rec.stopIdx) || 0));
        setDayIdx(Math.max(0, Number(rec.dayIdx) || 0));
      }
      openDayRef.current.restored = true;
      if (!opened) { try { window.localStorage.removeItem(OPEN_DAY_KEY); } catch { /* ignore */ } }
    })();
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, at mount

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
        const d = destinations[gatewayCity(daySeed.destId, destinations)];
        const c = d ? cityCoords(d) : null;
        if (c && c.lat != null) {
          const name = cityLabel(d.city);
          stay = { lat: c.lat, lon: c.lon, label: d.country ? `${name}, ${d.country}` : name, shortLabel: name, locality: name };
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
            stay = { lat: c.lat, lon: c.lon, label: town.label, shortLabel: name, locality: name };
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
        setStayQuery('');
        setStayResults(null);
        setNewStayWindow(null);
        setNewStayPoint(stay);
        setIdeas(ideaList);
        // T929: "Plan a day together" names the day; the window clamps it.
        if (daySeed.date) setNewStartDate(daySeed.date);
        setLandingStep('when');
      }
      onDaySeedConsumed && onDaySeedConsumed();
    })();
    return () => { live = false; };
  }, [daySeed]); // eslint-disable-line react-hooks/exhaustive-deps -- one-shot seed: resolveNearestTown is declared further down (listing it here is a TDZ crash) and the seed is consumed once

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
    const started = (st.wizard?.countries || []).length > 0 || (st.stops || []).length > 0
      || Boolean(st.settings?.trip?.created);
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
    // T658: the day rhythm asked after the trip was planned wins over the
    // guesses above: the traveller said it in so many words.
    const tripSet = fromDraft(st);
    const rhythm = tripSet.rhythm;
    const start = { early: 'early', onthego: 'normal', slow: 'late' }[rhythm.mornings];
    if (start) out.start = start;
    const steps = rhythm.steps || { walk: 15000, transit: 10000, taxi: 5000, car: 5000 }[aroundOf(tripSet)];
    if (steps) out.steps = steps;
    const food = { street: 'quick', local: 'sit', fine: 'sit', cook: 'picnic' }[rhythm.food];
    if (food) out.food = food;
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
    const unhide = () => setHiddenPlanIds((s) => { const n = new Set(s); n.delete(id); return n; });
    setHiddenPlanIds((s) => new Set(s).add(id));
    // The plan only disappears from the list now; the real delete (its picks,
    // its files) runs when the six seconds are up, so Undo loses nothing.
    offerUndo(t('dayws.planDeleted'), unhide, () => { setStandalonePlans(deleteStandalonePlan(id)); unhide(); });
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
    // Jump to the fresh day, so the traveller lands on that day's (empty) plan.
    setDayIdx(days.length);
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
  // T666 (F2): what a day at a stop costs one person, at the stop's own
  // dates (arrival to departure, exact) and the traveller's other choices,
  // through the engine; without dates or a request, the app's map row.
  const stopCost = useCallback((s) => {
    if (!s) return null;
    if (!priceRequest || !s.dest || !s.arrive_date || !s.depart_date) return costs?.get(s.destination_id) || null;
    return priceDay(s.dest, atDates(priceRequest, s.arrive_date, s.depart_date), destinations);
  }, [priceRequest, costs, destinations]);
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
  // T828: a town whose shard is already on its way is waited for, not
  // answered with what is here. The day planner asks for the town as soon as
  // it opens; Carta's first day asked again a moment later and got the short
  // placeholder list (8 places, no candidates), so a day right after a
  // reload said "too few places" in a town of 52.
  const poiPendingRef = useRef(new Map());
  const ensurePois = React.useCallback(async (ids) => {
    const want = [...new Set((ids || []).filter(Boolean))];
    const pending = want.map((id) => poiPendingRef.current.get(id)).filter(Boolean);
    const missing = want.filter((id) => !poiAskedRef.current.has(id));
    if (!missing.length) {
      if (pending.length) await Promise.all(pending);
      return actFullRef.current || {};
    }
    missing.forEach((id) => poiAskedRef.current.add(id));
    const job = fetchDestPoiMap(missing).then((fetched) => {
      // A town that came back empty (a failed fetch resolves to []) is not
      // remembered as asked, so the next call can try its shard again.
      missing.forEach((id) => { if (!fetched[id]?.length) poiAskedRef.current.delete(id); });
      const merged = { ...(actFullRef.current || {}), ...fetched };
      actFullRef.current = merged;
      setActFull(merged);
      return merged;
    }).finally(() => { missing.forEach((id) => poiPendingRef.current.delete(id)); });
    missing.forEach((id) => poiPendingRef.current.set(id, job));
    await Promise.all([job, ...pending]);
    return actFullRef.current || {};
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
  const customPois = prefs?.customPois;
  const customPoisFor = useCallback((destId) => (customPois?.[destId] || [])
    .map((c) => ({ ...c, custom: true })), [customPois]);

  const itemsForStop = useCallback((s, fullMap = actFull) => {
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
  }, [actFull, customPoisFor]);

  const activities = useMemo(() => itemsForStop(stop), [stop, itemsForStop]);

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
  }, [assignments, stops, itemsForStop, plan?.id]);

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
  // Where the map is looking right now ({ zoom, bounds }), fed back by
  // TripMap so zooming in can reveal more of the catalogue.
  const [mapView, setMapView] = useState(null);
  useEffect(() => {
    setMapCat('all'); setMapRating('all'); setShowSel(false);
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

  const { mapPois, farSights, shortlistPoints, shortlistDeck, poiSearch } = useDayMapDecks({
    activities, assignedAnyDay, assignments, dayIdx, favorites, mapCat, mapDeck, mapRating,
    mapView, poiQuery, showSel, stop, stopIdx, t,
  });

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
      refineToken: answers.refineToken || null,
      lang,
      stay: stayAnchor ? { lat: stayAnchor.lat, lon: stayAnchor.lon } : null,
      candidates,
      // T674: a trip's day carries the trip's rhythm as the profile.
      ...(plan && !plan.standalone ? { profile: dayAiPreset(fromDraft(plannerStore.getState())).profile } : {}),
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

  const { applyAiResult, fallbackAi } = useDayAiApply({
    activities, aiGroupSize, aiKey, applyDraft, assignments, autoBusy, autoQueue, dayIdx, days,
    entitlement, plan, prefs, runAi, setAiOpen, setAssignments, setAutoQueue, setDayIdx,
    setOverview, setPrefs, setRouteMode, setStopIdx, stop, stopIdx, stops,
  });


  const dayAssignedIdx = assignments[stopIdx]?.[dayIdx] || NO_ASSIGNED;
  const assignedItems = dayAssignedIdx.map((i) => activities.items[i]).filter(Boolean);
  const shownAssignedIdx = dayAssignedIdx.filter((i) => activities.items[i]);

  const { intel, stayAnchor, dayTripFrom, rideMinutes, dayTripView } = useDayTrip({ activities, countryInsights, data, destinations, plan, stop });

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

  const {
    dayWalks, toggleWalk, pinnedWalksBlock, visitFactor, commitDay, customBusy, addCustomPlace,
    ideaList, stageIdeas, discardIdea, dayImportContext,
  } = useDayEdits({
    activities, assignments, customPoisFor, dayIdx, lang, plan, prefs, setAssignments,
    setPoiQuery, setPrefs, stop, stopIdx, t,
  });

  // The parts of the day the stops are pinned to (T501): { [itemIdx]: band },
  // per day, kept in the plan's answers so they sync with everything else.
  const dayPinsKey = `${stopIdx}:${dayIdx}`;
  const dayPins = prefs?.bandPins?.[dayPinsKey] || NO_PINS;
  // One write for the day's order, its pins and (when given) the route mode,
  // so two answers written in one tap can never overwrite each other.
  const commitDayPlan = (order, pins, patch = null) => {
    commitDay(order);
    const nextPins = prunePins(pins, order);
    const samePins = JSON.stringify(nextPins) === JSON.stringify(prunePins(dayPins, order));
    if (samePins && !patch) return;
    const saved = {
      ...(prefs || {}),
      ...(patch || {}),
      bandPins: { ...(prefs?.bandPins || {}), [dayPinsKey]: nextPins },
    };
    if (patch?.routeMode) setRouteMode(patch.routeMode);
    setPrefs(saved);
    persistPrefs(plan?.id, saved);
  };

  // Adding a stop never reorders the day behind the traveller's back (owner
  // T492-e): it goes to the end of the part of the day it was added from
  // (the "Add" on that part), or to the end of the day. "Best route" is the
  // one way Carta reorders, and it asks first. Removing drops it in place.
  const toggleActivity = (itemIdx) => {
    const current = assignments[stopIdx]?.[dayIdx] || [];
    if (current.includes(itemIdx)) {
      commitDayPlan(current.filter((i) => i !== itemIdx), dayPins);
    } else {
      const band = adding && adding !== 'end' ? adding : null;
      const r = insertStopInBand({ order: current, pins: dayPins, id: itemIdx, band, bands: dayBands });
      commitDayPlan(r.order, r.pins);
    }
  };

  // Remove a stop and offer the way back (rule N6). Undo puts the whole day's
  // list back as it was, in its order.
  const removeStopWithUndo = (pos) => {
    const planId = plan?.id;
    const s = stopIdx;
    const d = dayIdx;
    const before = assignments[s]?.[d] || [];
    const name = assignedItems[pos]?.name || '';
    toggleActivity(dayAssignedIdx[pos]);
    offerUndo(t('dayws.stopRemoved', { name }), () => {
      setAssignments((cur) => {
        const next = { ...cur, [s]: { ...(cur[s] || {}), [d]: before } };
        persistAssignments(planId, next);
        return next;
      });
    });
  };

  // The parts of the day a hypothetical order would put the stops in, for a
  // tap move: the real legs belong to the current order, so a reordered day
  // is timed with straight-line walks (a quarter hour when a place has no
  // coordinates). The day itself is then timed on its routed legs.
  const bandsForOrder = (order, pins) => {
    const items = order.map((i) => activities.items[i]);
    const leg = (a, b) => {
      const km = a && b && Number.isFinite(a.lat) && Number.isFinite(b.lat)
        ? haversineKm(a.lat, a.lon, b.lat, b.lon) : null;
      return km == null ? null : estimateWalkMinutes(km * 1.3);
    };
    return rowBands(buildDaySchedule({
      items,
      legMin: (i) => leg(items[i], items[i + 1]),
      dwellMin: (it) => dwellMinutes(poiKind(it), visitFactor),
      stayLegMin: stayLeg?.min || 0,
      startMin: Number.isFinite(prefs?.dayStartMin) ? prefs.dayStartMin : DAY_START_MIN,
      pinOf: (_, k) => pins[order[k]] || null,
    }));
  };

  // A tap move (no drag): inside a part it swaps with the neighbour, at the
  // edge of a part it crosses into the next. A deliberate order switches the
  // route to manual so Carta stops offering to rearrange it unasked.
  const moveAssigned = (pos, dir) => {
    const current = assignments[stopIdx]?.[dayIdx] || [];
    const r = moveStopInDay({ order: current, pins: dayPins, i: pos, dir, bandsFor: bandsForOrder });
    if (!r) return;
    commitDayPlan(r.order, r.pins, routeMode !== 'manual' ? { routeMode: 'manual' } : null);
  };
  const canMoveRow = (i, dir) => canMoveStop(dayBands, i, dir);

  // "Best route" (owner T492-e): asked first in the day panel, then each part
  // of the day keeps its stops and only the order inside a part improves.
  const optimizeNow = () => {
    const anchorOf = (lastIdx) => {
      if (lastIdx == null) return stayAnchor;
      const it = activities.items[lastIdx];
      return it && Number.isFinite(it.lat) ? { lat: it.lat, lon: it.lon } : stayAnchor;
    };
    const order = optimizeWithinBands({
      order: dayAssignedIdx,
      bands: dayBands,
      optimize: (ids, anchor) => optimizeOrder(ids, activities.items, anchor),
      anchorOf,
    });
    commitDayPlan(order, dayPins, { routeMode: 'auto' });
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
  }, [stayRideKey]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed by the rounded coordinates: assignedItems is rebuilt every render and listing it would refetch the ride each time

  // The map always shows the stay pin; the WALKING route only starts there
  // when the door-to-first-sight leg is actually a walk.
  const routePins = stayAnchor
    ? [{
        lat: stayAnchor.lat, lon: stayAnchor.lon, city: t('day.yourStay'), stay: true,
        name: stayAnchor.label || stayAnchor.shortLabel || '',
      }, ...mapPins]
    : mapPins;
  const walkPins = stayAnchor && !stayLegRide ? routePins : mapPins;

  // T433: every walk on the day routed on real footpaths and judged before
  // it is drawn (lib/dayRoute.js). A leg OSRM could not walk, or walks far
  // round a river, is shown as the ride it is, never as a walk; a leg not yet
  // checked (still loading, or offline) says it is an estimate.
  // T851 (owner D3): a day may have its own pace, set on the trip page's
  // Days tab (prefs.dayPace, keyed stop-day); else the trip's.
  const dayPace = prefs?.dayPace?.[`${stopIdx}-${dayIdx}`] || prefs?.pace || 'balanced';
  const dayStepFree = !!prefs?.stepFree;
  const dayGroup = prefs?.groupSize || aiGroupSize();
  const startsAtStart = Boolean(stayAnchor) && !stayLegRide;
  const routeKey = [
    ...(startsAtStart ? [`${stayAnchor.lat.toFixed(5)},${stayAnchor.lon.toFixed(5)}`] : []),
    ...mapPins.map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`),
    dayPace, dayStepFree ? 'sf' : '', dayGroup,
  ].join(';');
  const [dayRoute, setDayRoute] = useState(null); // { key, pending?, ...routeDay() }
  useEffect(() => {
    if (mapPins.length + (startsAtStart ? 1 : 0) < 2) { setDayRoute(null); return undefined; }
    let alive = true;
    setDayRoute((cur) => (cur && cur.key === routeKey && !cur.pending ? cur : { key: routeKey, pending: true }));
    routeDay(mapPins, {
      start: stayAnchor, startsAtStart, pace: dayPace, stepFree: dayStepFree, groupSize: dayGroup,
    }).then((r) => { if (alive) setDayRoute({ key: routeKey, ...r }); });
    return () => { alive = false; };
  }, [routeKey]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed by the rounded coordinates and the answers that change a verdict
  const routeOk = Boolean(dayRoute && dayRoute.key === routeKey && !dayRoute.pending);
  const routeChecked = routeOk && dayRoute.checked;
  const allPlaced = assignedItems.every((it) => it.lat != null && it.lon != null);
  const routeLead = routeOk ? (dayRoute.lead || 0) : 0;

  // A ride's minutes where no footpath serves: the straight line, street-
  // corrected, at a city bus's door-to-door pace plus a wait. An estimate,
  // and the row says so.
  const rideMin = (km) => Math.max(10, Math.round(((km || 1) * 1.4 / 20) * 60) + 8);

  const judged = (l) => (isWalkable(l.status)
    ? { ...l, checked: true }
    : { ...l, mode: 'transit', min: rideMin(l.straightKm) });

  const walkLeg = (i) => {
    const it = assignedItems[i];
    const next = assignedItems[i + 1];
    if (!next) return null;
    if (routeChecked && allPlaced) {
      const l = dayRoute.legs[i + routeLead];
      if (l) return judged(l);
    }
    if (it.lat != null && it.lon != null && next.lat != null && next.lon != null) {
      const km = haversineKm(it.lat, it.lon, next.lat, next.lon) * 1.25;
      return { status: 'ok', km, min: estimateWalkMinutes(km), checked: false };
    }
    return null;
  };

  // Door to first sight: a ride in the chosen mode beyond walking range,
  // otherwise the first routed leg.
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
        status: 'far',
        mode: mode === 'car' ? 'car' : 'transit',
        km: roadKm,
        min: rideMinutes(mode, roadKm, drivingMin),
        dirUrl: googleMapsDirUrl(
          [{ lat: stayAnchor.lat, lon: stayAnchor.lon }, { lat: first.lat, lon: first.lon }],
          mode === 'car' ? 'driving' : 'transit',
        ),
      };
    }
    if (routeChecked && routeLead && dayRoute.legs[0]) return judged(dayRoute.legs[0]);
    const first = assignedItems[0];
    if (first.lat == null || first.lon == null) return null;
    const km = haversineKm(stayAnchor.lat, stayAnchor.lon, first.lat, first.lon) * 1.25;
    return km == null ? null : { status: 'ok', km, min: estimateWalkMinutes(km), checked: false };
  })();

  const flaggedLegs = routeChecked
    ? dayRoute.legs.filter((l) => !isWalkable(l.status)).length
      + (dayRoute.offPath || []).filter((m) => m != null).length
    : 0;
  const routeState = !assignedItems.length ? null
    : dayRoute?.pending || (!routeOk && mapPins.length > 1) ? 'checking'
      : routeOk && !dayRoute.checked ? 'offline'
        : flaggedLegs ? 'flagged' : 'checked';
  const offPath = routeChecked && allPlaced ? dayRoute.offPath : [];
  const walkKmDay = routeChecked
    ? dayRoute.walkKm
    : Math.round(assignedItems.reduce((s, _, i) => s + (walkLeg(i)?.km || 0), stayLeg && !stayLeg.ride ? (stayLeg.km || 0) : 0) * 10) / 10;

  // T487: a phone's browser opens Google Maps with 3 stops a link, so on a
  // phone (narrow or touch) the day comes in parts; nothing is dropped.
  const gmapsPhone = isNarrow || (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches);
  const gmapsParts = googleMapsDirParts(walkPins, 'walking', gmapsPhone ? GMAPS_STOPS_PHONE : GMAPS_STOPS_DESKTOP);
  // A shared day is opened on someone's phone: phone-sized parts.
  const gmapsShareParts = googleMapsDirParts(walkPins, 'walking', GMAPS_STOPS_PHONE);

  // The map's inputs, held still between renders. TripMap reframes when its
  // stops, segments or padding change by identity, and a reframe reports the
  // new view back (onViewChange), so fresh arrays on every render were a
  // render loop once the day tab stopped passing pickable pins (T433).
  const pinsKey = routePins.map((p) => `${p.lat},${p.lon},${p.no ?? ''},${p.stay ? 1 : 0}`).join(';');
  const mapStopsAll = useMemo(() => routePins, [pinsKey]); // eslint-disable-line react-hooks/exhaustive-deps -- value key
  const routeSegs = useMemo(() => (routeChecked ? routeSegments(dayRoute) : null), [routeChecked, dayRoute]);
  const deskFitPadding = useMemo(() => ({ top: 60, left: 60, right: 60, bottom: 60 }), []);

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
    // T501: on a phone the drawer opens to half with the row in view.
    setAdding(null);
    if (!isDesk && drawer === 'strip') setDrawer('half');
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
  // Which pick the Add places list was left on, kept across tab switches.
  const [addPick, setAddPick] = useState('all');
  useEffect(() => { setAddPick('all'); }, [stopIdx, plan?.id]);

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
      // A stop added to a part of the day waits for that part (T501).
      pinOf: (_, k) => dayPins[shownAssignedIdx[k]] || null,
    })
    : null;
  // The part of the day each stop starts in, aligned to the stops.
  const dayBands = schedule ? rowBands(schedule) : NO_ASSIGNED;

  // The trip around a day (T501, owner T492-f): what the whole trip costs,
  // from the one pricing function the trip planner and My trips read, so the
  // day's cost bar can put the trip first. Null for a day on its own.
  // T827 (row T826-a): the draft prices the way the trip planner prices it,
  // its own stay and eating habits, the flight ranking and the flights picked
  // in Getting there, then the live answers, so the days screen and the
  // trip page say one figure.
  const flightRank = useMemo(() => flightRanking(fromDraft(plannerStore.getState())).sort, []);
  const tripState = useMemo(() => {
    if (!plan || plan.standalone || !data?.destinations) return null;
    if (plan.tripDraft) {
      const d = loadTripDraft();
      return d?.stops?.length ? draftQuoteState(d, { stayTier, appLifestyle: lifestyle, flightRank }) : null;
    }
    return plannerStateFromPlan(plan, { stayTier, lifestyle });
  }, [plan, data, stayTier, lifestyle, flightRank]);
  const tripBase = useMemo(() => {
    try { return tripState ? quoteTrip(tripState, { data }) : null; } catch { return null; }
  }, [tripState, data]);
  const tripLive = useLiveFlights(tripBase?.cartaFlight?.queries);
  const tripPriced = useMemo(() => {
    if (!tripBase || !tripLive?.size) return tripBase;
    try {
      const merged = new Map([...tripLive, ...(tripState.liveFlights || [])]);
      return quoteTrip({ ...tripState, liveFlights: merged }, { data });
    } catch { return tripBase; }
  }, [tripBase, tripLive, tripState, data]);

  // Open-time ideas: the strongest unpicked walkable places whose visit still
  // fits in the leftover. One tap adds them; in auto mode the walking order
  // re-optimizes like any other add.
  // The schedule itself is rebuilt each render (it is cheap), so this keys on
  // the one number it reads from it, the free minutes.
  const freeMin = schedule ? schedule.freeMin : 0;
  const gapIdeas = useMemo(() => (freeMin >= GAP_SUGGEST_MIN
    ? mapDeck
      .filter(({ item }) => dwellMinutes(poiKind(item), visitFactor) + 15 <= freeMin)
      .slice(0, 3)
    : []), [freeMin, mapDeck, visitFactor]);

  // Photogenic near-zero detours along today's walk (viewpoints, bridges,
  // squares...), the walk itself should be beautiful, not just short.
  const scenic = useMemo(
    () => (routeMode === 'auto' ? scenicSuggestions(dayAssignedIdx, activities.items) : []),
    [dayAssignedIdx, activities, routeMode],
  );
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


  const { saveToSavedTrips, downloadPdf, downloadKmlFile, downloadIcsFile, shareDayLink, shareDay } = useDayExports({
    aiGroupSize, assignedItems, assignments, costs, daySaveState, gmapsShareParts, isNarrow,
    itemsForStop, lang, paywall, plan, prefs, setDaySaveState, setSaveToast, setShareState,
    setStandalonePlans, stop, stopCost, stops, t, visitFactor,
  });


  // Every destination in one searchable list (the whole of Europe, big cities
  // and small gems alike), used by the landing multi-city picker and the
  // in-plan "add another city" picker.
  const allCityOptions = useMemo(() => Object.entries(destinations)
    .filter(([, d]) => !isGateway(d))
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
      if (isGateway(d)) continue;
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

  const {
    upcomingStays, pickUpcomingStay, recentStays, pickRecentStay, stayCursor, setStayCursor,
    stayResultRefs, onStayFocus, onStayBlur, onStayKeyDown, DATE_HORIZON_DAYS, dayDateMin,
    dayDateMax, dayWindowUsable, quickDates, exploreTowns, stayTownId, startName, homeTownId,
    explorePois, togglePoiPick, movePick, letCartaFinish, goManualWithIdeas,
  } = useDayStartData({
    actFull, authConfigured, destinations, ensurePois, ideas, landingStep, newStartDate,
    newStayPoint, newStayWindow, resolveNearestTown, savedPlans, searchStay, setIdeas,
    setLandingStep, setNewDayCount, setNewStartDate, setNewStayPoint, setNewStayWindow,
    setNewStops, setSelPois, setStayQuery, setStayResults, standalonePlans, stayResults, t,
    today, user,
  });

  // A catalogue row of a town, from the boot data or the shard in hand.
  const itemOf = (destId, idx) => {
    const d = destinations[destId];
    const items = (d?.activities?.items_full?.length ? d.activities.items_full : actFull?.[destId]) || [];
    return items[idx] || null;
  };

  const {
    builderPreview, openBuiltPlan, startExplorePlanning, chatDest, chatInterests, chatVibe,
    groupSizeFor, moodInterests,
  } = useDayBuilder({
    actFull, destinations, ensurePois, homeTownId, itemOf, itemsForStop, newDayCount,
    newStartDate, newStayPoint, newStops, openStandalone, selPois, setIdeas, setLandingStep,
    setNewStops, setSelPois, setStandalonePlans, setStayQuery, setStayResults, standalonePlans,
    t,
  });
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
  const chatDefaultTownId = ideasTownId || homeTownId || null;

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
      setChatWeather({
        rain: ['rain', 'drizzle', 'storm'].includes(row.kind) || (row.rainMm ?? 0) >= 1,
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
  }, [chatDefaultTownId]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed on the town: chatDest is rebuilt every render, and a failed shard would refetch in a loop through actFull

  /**
   * Does anything actually happen in this town on this date? The dossier
   * records festivals by MONTH, not by day, which is the honest resolution
   * for an annual event whose exact dates move: a month match is enough to
   * default the events toggle on and let the model check, and not enough to
   * claim anything about a specific Tuesday.
   */
  const [chatHasEvents, setChatHasEvents] = useState(false);
  useEffect(() => {
    const destId = ideasTownId || homeTownId;
    if (!destId || !newStartDate) { setChatHasEvents(false); return undefined; }
    const month = Number(newStartDate.slice(5, 7));
    let live = true;
    loadDossier(destId).then((d) => {
      if (!live) return;
      setChatHasEvents((d?.festivals || []).some((f) => (f.months || []).includes(month)));
    }).catch(() => { if (live) setChatHasEvents(false); });
    return () => { live = false; };
  }, [ideasTownId, homeTownId, newStartDate]);

  const { runChatAi, suggestCityAi, importChatPlan } = useDayChatAi({
    chatDest, chatInterests, chatVibe, chatWeather, destinations, groupSizeFor, homeTownId,
    ideas, ideasTownId, lang, moodFocus, moodInterests, newDayCount, newStartDate, newStayPoint,
    openBuiltPlan, prefs,
  });

  // Landing (T433): the trip planner's own wizard frame, five steps. Start,
  // Days, Ideas and How are questions; the fifth is where the flow hands
  // over, to Carta's questions or to the places to pick from. Back is in the
  // footer on every step, the done steps are tappable on the rail, and the
  // day plans already on this device sit under the first question.
  if (!plan) {
    return <DayPlannerStart
      DATE_HORIZON_DAYS={DATE_HORIZON_DAYS} addLandingCity={addLandingCity}
      allCityOptions={allCityOptions} authConfigured={authConfigured}
      builderPreview={builderPreview} canLocate={canLocate}
      chatDefaultTownId={chatDefaultTownId} chatHasEvents={chatHasEvents}
      chatPresets={chatPresets} chatTownCounts={chatTownCounts}
      chatWeatherNote={chatWeatherNote} costs={costs} dayDateMax={dayDateMax}
      dayDateMin={dayDateMin} dayWindowUsable={dayWindowUsable}
      deleteStandalone={deleteStandalone} destinations={destinations} doUndo={doUndo}
      explorePois={explorePois} exploreTowns={exploreTowns} flowDir={flowDir}
      goManualWithIdeas={goManualWithIdeas} hiddenPlanIds={hiddenPlanIds}
      homeTownId={homeTownId} ideas={ideas} ideasTownId={ideasTownId}
      importChatPlan={importChatPlan} landingStep={landingStep} letCartaFinish={letCartaFinish}
      locBusy={locBusy} locErr={locErr} movePick={movePick} newDayCount={newDayCount}
      newStartDate={newStartDate} newStayPoint={newStayPoint} newStayWindow={newStayWindow}
      newStops={newStops} onOpenDest={onOpenDest} onOpenFeature={onOpenFeature}
      onPlanTrip={onPlanTrip} onRequestAuth={onRequestAuth} onStayBlur={onStayBlur}
      onStayFocus={onStayFocus} onStayKeyDown={onStayKeyDown} openPlan={openPlan}
      openStandalone={openStandalone} pickRecentStay={pickRecentStay}
      pickUpcomingStay={pickUpcomingStay} plansError={plansError} plansLoading={plansLoading}
      prefs={prefs} quickDates={quickDates} recentStays={recentStays}
      removeLandingCity={removeLandingCity} researchTown={researchTown}
      resolveNearestTown={resolveNearestTown} runChatAi={runChatAi} savedPlans={savedPlans}
      searchStay={searchStay} selPois={selPois} setDayIdx={setDayIdx} setFlowDir={setFlowDir}
      setIdeas={setIdeas} setLandingStep={setLandingStep} setNewDayCount={setNewDayCount}
      setNewStartDate={setNewStartDate} setNewStayPoint={setNewStayPoint}
      setNewStayWindow={setNewStayWindow} setNewStops={setNewStops} setPlansTry={setPlansTry}
      setSelPois={setSelPois} setStayCursor={setStayCursor} setStayQuery={setStayQuery}
      setStayResults={setStayResults} setStopIdx={setStopIdx} shortlistPoints={shortlistPoints}
      standalonePlans={standalonePlans} startExplorePlanning={startExplorePlanning}
      startName={startName} stayCursor={stayCursor} stayQuery={stayQuery}
      stayResultRefs={stayResultRefs} stayResults={stayResults} staySearching={staySearching}
      stayTownId={stayTownId} suggestCityAi={suggestCityAi} t={t} today={today}
      togglePoiPick={togglePoiPick} undoPending={undoPending} upcomingStays={upcomingStays}
      useMyLocation={useMyLocation} user={user}
    />;
  }

  // ---- The trip's days overview (T672) -------------------------------------
  const overviewOn = overview && plan && !plan.standalone && stops.length > 0;
  const applyOverviewChange = ({ assignments: nextA, prefs: nextP }) => {
    if (nextP && nextP !== prefs) { setPrefs(nextP); persistPrefs(plan?.id, nextP); }
    if (nextA && nextA !== assignments) { setAssignments(nextA); persistAssignments(plan?.id, nextA); }
  };

  // ---- The planned day (T433) ---------------------------------------------
  // The trip planner's planned-trip pattern: on a phone a page (the day's
  // card first, a small map card that opens the full map, the timeline, the
  // kit, the exports); on a wider screen the same column beside a full map.
  const stayLabel = plan.stayPoint?.shortLabel || plan.stayPoint?.label || '';
  const walksHere = scenicWalksFor(stop?.dest?.city || '');
  const dayNumber = dayOffset + dayIdx + 1;
  const planDays = stops.flatMap((s, si) => Array.from({ length: s.nights }, (_, di) => ({ si, di })));
  const goToPlanDay = (k) => {
    const d = planDays[k];
    if (!d) return;
    setStopIdx(d.si);
    setDayIdx(d.di);
  };
  const dayMoreItems = plan.standalone && stop ? [
    { key: 'day', label: t('dayws.addDayMenu'), onSelect: addStandaloneDay },
    { key: 'city', label: t('dayws.addCityMenu'), onSelect: () => setCityAddOpen(true) },
    ...(stops.length > 1 ? [{
      key: 'drop',
      label: t('day.removeX', { name: cityLabel(stop.dest?.city || t('day.unknown')) }),
      onSelect: () => removeStandaloneCity(stopIdx),
    }] : []),
  ] : [];

  // What a day here costs one person at the traveller's Lifestyle: the
  // engine's figure for the town at this stop's dates (T666; PRODUCT.md: a
  // day plan carries one per-person figure).
  const costRow = stop ? stopCost(stop) : null;
  // T501: plus the tickets whose price is known, a person (owner T492-d);
  // the party is the trip's inside a trip, else the traveller's own.
  const dayTickets = dayTicketTotals(assignedItems);
  const tripParty = tripPriced?.party
    ? Math.max(1, (tripPriced.party.adults || 0) + (tripPriced.party.children || 0) + (tripPriced.party.babies || 0))
    : null;
  const dayCost = costRow && costRow.dayEur != null
    ? {
      eur: Math.round((costRow.dayEur + dayTickets.perPerson) * 100) / 100,
      est: costRow.stayLevel !== 'city' || costRow.foodLevel !== 'city',
      stayEur: costRow.stayEur,
      foodEur: costRow.foodEur,
      row: costRow,
      tickets: dayTickets,
      party: tripParty || prefs?.aiGroupSize || groupSize || 1,
    }
    : null;
  const dayTicketRows = assignedItems.map(ticketOf);
  const dayCity = cityLabel(stop?.dest?.city || '') || t('day.thisCity');
  const dayMonth = days[dayIdx] ? Number(days[dayIdx].slice(5, 7)) : null;
  const dayTitle = t('dayws.stripTitle', { city: dayCity, n: dayNumber });
  const daySpan = schedule && assignedItems.length
    ? t('dayws.timeSpan', { from: fmtClockLoose(Number.isFinite(prefs?.dayStartMin) ? prefs.dayStartMin : DAY_START_MIN), to: fmtClockLoose(schedule.endMin) })
    : '';
  const daySub = assignedItems.length
    ? t('dayws.stripSub', {
      stops: t(assignedItems.length === 1 ? 'day.statStop' : 'day.statStops', { n: assignedItems.length }),
      span: daySpan,
    })
    : t('dayws.dayEmptyShort');
  const tripName = !plan.standalone ? (plan.label || t('ready.yourTrip')) : '';
  const backToTrip = !plan.standalone && (onOpenTrip || onPlanTrip)
    ? () => (plan.tripDraft || !onOpenTrip ? onPlanTrip?.() : onOpenTrip(plan.id))
    : null;

  const dwellOf = (it) => dwellMinutes(poiKind(it), visitFactor);
  const startInfo = stayAnchor
    ? { label: stayLabel, lat: stayAnchor.lat, lon: stayAnchor.lon }
    : null;

  const tipsN = tipsCount({ intel, walks: walksHere, countryRec: stop?.dest?.country ? countryInsights?.[stop.dest.country] : null });
  const kitTools = [
    tipsN > 0 && {
      key: 'tips',
      Icon: KIT_ICONS.tips,
      title: t('dayws.kitTips'),
      state: tipsN === 1 ? t('dayws.kitTips1') : t('dayws.kitTipsN', { n: tipsN }),
      body: (
        <div className="dayws-tips-body">
          <DayTipsBody
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
      ),
    },
    {
      key: 'notes',
      Icon: KIT_ICONS.notes,
      title: t('dayws.kitNotes'),
      state: (extras.notes || '').trim() ? t('plan.toolWritten') : t('plan.toolEmpty'),
      body: <DayFilesPanel planId={plan.id} notes={extras.notes || ''} onNotes={setNotes} importBlock={null} />,
    },
    stop && dayImportContext && {
      key: 'ideas',
      Icon: KIT_ICONS.ideas,
      title: t('dayws.kitImport'),
      state: ideaList.length ? t('dayws.kitIdeasN', { n: ideaList.length }) : t('dayws.kitImportSub'),
      body: (
        <div className="dayk-import">
          <MagicImportZone onResult={stageIdeas} importContext={dayImportContext} leadKey="day.importLead" />
          {ideaList.map((idea) => (
            <div className="day-idea-row" key={idea.id}>
              <span className="day-idea-text">
                <b>{idea.name}</b>
                {idea.note && <small>{idea.note}</small>}
              </span>
              <Button size="sm" disabled={customBusy} onClick={() => addCustomPlace(idea.name, { note: idea.note || '', dropIdeaId: idea.id })}>
                {t('day.importAddHere', { n: dayNumber })}
              </Button>
              <IconButton label={t('extras.removeTitle')} onClick={() => discardIdea(idea)}><CloseIcon size={16} /></IconButton>
            </div>
          ))}
        </div>
      ),
    },
  ];

  const mapFocus = stop?.dest?.lat != null ? { ...cityCoords(stop.dest), zoom: 13 } : null;
  const mapNode = (opts = {}) => (
    <TripMap
      stops={mapStopsAll}
      padBottom={opts.padBottom ?? 40}
      fitPadding={opts.fitPadding || null}
      routeGeometry={null}
      routeSegments={routeSegs}
      focus={mapFocus}
      flyTo={flyPoi}
      pois={adding ? mapPois : null}
      onPoiClick={(id) => toggleActivity(Number(id))}
      onSelectStop={onMapStopClick}
      selectedIndex={selectedMarkerIdx}
      easeToSelected={false}
      onViewChange={setMapView}
      fitMaxZoom={15}
      zoomControls
      cooperativeGestures={false}
      revealRoute
    />
  );

  // T899: the Carta bot, a chat beside the day (DayBotChat), in place of
  // the AiDayPlanModal form.
  const botOn = aiOpen && Boolean(stop);
  const botChat = botOn ? (
    <DayBotChat
      key={`${stopIdx}-${dayIdx}`}
      city={cityLabel(stop.dest?.city || '')}
      dayNumber={dayNumber}
      dateLabel={days[dayIdx] ? fmtDateFull(days[dayIdx], true) : ''}
      dateISO={days[dayIdx] || prefs?.aiDate || ''}
      stopsCount={assignedItems.length}
      groupSize={prefs?.aiGroupSize || aiGroupSize()}
      signedIn={!!user && authConfigured}
      onSignIn={onRequestAuth}
      preset={botPreset}
      onRun={runAi}
      onApply={(r) => applyAiResult(r, { keepOpen: isDesk })}
      onFallback={fallbackAi}
      onClose={() => { setAiOpen(false); setBotPreset(null); }}
      entitlement={entitlement}
      onOpenPass={(reason) => paywall.require(reason || 'browse')}
      docked={isDesk}
    />
  ) : null;

  const receiptId = 'day-receipt';
  const openReceipt = () => setReceiptOpen(true);
  const ADD_TITLE_KEYS = { morning: 'dayws.addTitleMorning', afternoon: 'dayws.addTitleAfternoon', evening: 'dayws.addTitleEvening' };
  const openAdd = (band) => {
    setAdding(band || 'end');
    // Half: the places in the drawer, the map above showing them.
    if (!isDesk && drawer === 'strip') setDrawer('half');
  };

  // The one page bar (carta-design "Navigation", PageBar, T474): inside a
  // trip it names the trip it returns to (T501, roadmap 1.3d state 5).
  // T895: inside a trip the bar is the breadcrumb (Plan, the trip, the
  // day) with the previous and next day.
  const pageBar = tripName && onPlanHome ? (
    <DayCrumbs
      tripName={tripName}
      onPlan={onPlanHome}
      onTrip={backToTrip || (() => setOverview(true))}
      dayLabel={overviewOn ? t('days.allDays') : t('dayws.crumbDay', { n: dayNumber })}
      onPrev={!overviewOn && dayNumber > 1 ? () => goToPlanDay(dayNumber - 2) : null}
      onNext={!overviewOn && dayNumber < planDays.length ? () => goToPlanDay(dayNumber) : null}
      onShare={shareDayLink}
      copied={shareState === 'linked'}
    />
  ) : (
    <PageBar
      t={t}
      className="dayws-pagebar"
      backLabel={tripName ? t('dayws.backToTripNamed', { name: tripName }) : t('dayws.backToPlans')}
      onBack={tripName ? (backToTrip || (() => setPlan(null))) : () => setPlan(null)}
      name={dayTitle}
      onShare={shareDayLink}
      shareLabel={t('dayws.shareLink')}
      copied={shareState === 'linked'}
      copiedLabel={t('dayws.linkCopied')}
    />
  );

  // The places to add, in the day's own column (desktop) or the drawer
  // (phone), with the map showing them: "Add" on a part of the day chose
  // where they go (T501). The day is one tap back.
  const addBody = stop ? (
    <section className="dayws-add" aria-labelledby="dayws-add-h">
      <div className="dayws-add-head">
        <h2 className="dayws-add-h" id="dayws-add-h">
          {ADD_TITLE_KEYS[adding] ? t(ADD_TITLE_KEYS[adding]) : t('dayws.addTitleDay', { n: dayNumber })}
        </h2>
        <Button variant="secondary" size="sm" className="dayws-add-done" onClick={() => setAdding(null)}>
          {t('dayws.addDone')}
        </Button>
      </div>
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
        suggestions={addSuggestions}
        limited={activities.limited}
        pick={addPick}
        onPick={setAddPick}
        shortlist={shortlistDeck}
      />
    </section>
  ) : null;

  const scheduleShown = schedule ? { ...schedule, startMin: Number.isFinite(prefs?.dayStartMin) ? prefs.dayStartMin : DAY_START_MIN } : null;

  const overviewBody = overviewOn ? (
    <TripDaysOverview
      tripName={plan.label || ''}
      stops={stops}
      planDays={planDays}
      assignments={assignments}
      prefs={prefs}
      itemsForStop={itemsForStop}
      ensurePois={ensurePois}
      destinations={data?.destinations || {}}
      tripPriced={tripPriced}
      onChange={applyOverviewChange}
      onOpenDay={(k) => { goToPlanDay(k); setOverview(false); setAdding(null); }}
      // T897: fill one empty day with the bot, or every empty day in turn.
      onFillDay={(k) => {
        goToPlanDay(k); setOverview(false); setAdding(null);
        setBotPreset({ ...dayAiPreset(fromDraft(plannerStore.getState())), autoRun: true }); setAiOpen(true);
      }}
      onFillEmpty={() => {
        setOverview(false);
        const tripSettings = fromDraft(plannerStore.getState());
        if ((user && authConfigured) || AI_PLAN_MOCK != null) {
          setAutoQueue({ phase: 'init', planKey: plan?.id || TRIP_DRAFT_PLAN_ID, preset: dayAiPreset(tripSettings), list: [], i: 0, planned: 0, code: '' });
        } else {
          setBotPreset({ ...dayAiPreset(tripSettings), autoRun: true }); setAiOpen(true);
        }
      }}
    />
  ) : null;

  // The day itself: the same column on a desktop and in the drawer on a
  // phone. The day's figure is not in here: it is fixed in the cost bar (a
  // desktop) or the drawer's strip (a phone), always in sight.
  const dayBody = (
    <DayBody
      addBody={addBody} addCityId={addCityId} addStandaloneCity={addStandaloneCity}
      adding={adding} aiPlan={aiPlan} allCityOptions={allCityOptions}
      assignedItems={assignedItems} assignments={assignments} canMoveRow={canMoveRow}
      cityAddOpen={cityAddOpen} data={data} dayBands={dayBands} dayCost={dayCost}
      dayIdx={dayIdx} dayMonth={dayMonth} dayMoreItems={dayMoreItems} dayNumber={dayNumber}
      daySaveState={daySaveState} dayStepFree={dayStepFree} dayTicketRows={dayTicketRows}
      dayTickets={dayTickets} dayTitle={dayTitle} dayTripFrom={dayTripFrom}
      dayTripView={dayTripView} days={days} detail={detail} downloadIcsFile={downloadIcsFile}
      downloadKmlFile={downloadKmlFile} downloadPdf={downloadPdf} dwellOf={dwellOf}
      flaggedLegs={flaggedLegs} flashRow={flashRow} focusRow={focusRow} gmapsParts={gmapsParts}
      goToPlanDay={goToPlanDay} isNarrow={isNarrow} kitTools={kitTools}
      moveAssigned={moveAssigned} offPath={offPath} openAdd={openAdd} optimizeNow={optimizeNow}
      patchStandalone={patchStandalone} pinnedWalksBlock={pinnedWalksBlock} plan={plan}
      planDays={planDays} removeStopWithUndo={removeStopWithUndo} routeState={routeState}
      rowRefs={rowRefs} saveToSavedTrips={saveToSavedTrips} scheduleShown={scheduleShown}
      searchStay={searchStay} setAddCityId={setAddCityId} setAiOpen={setAiOpen}
      setBotPreset={setBotPreset} setCityAddOpen={setCityAddOpen} setDayIdx={setDayIdx}
      setDetail={setDetail} setHoverRow={setHoverRow} setOverview={setOverview}
      setStayQuery={setStayQuery} setStayResults={setStayResults} setStopIdx={setStopIdx}
      setTripMode={setTripMode} shareDay={shareDay} shareDayLink={shareDayLink}
      shareState={shareState} startInfo={startInfo} stayLabel={stayLabel} stayLeg={stayLeg}
      stayQuery={stayQuery} stayResults={stayResults} staySearching={staySearching} stop={stop}
      stopIdx={stopIdx} stops={stops} t={t} tripMode={tripMode} walkKmDay={walkKmDay}
      walkLeg={walkLeg}
    />
  );

  return (
    <div className={`trip-planner-screen day-ws ${isDesk ? 'is-desk' : 'is-drawer'}${isNarrow ? ' is-page' : ''}${botOn && isDesk ? ' has-bot' : ''}`}>
      {saveToast && <div className="trip-save-toast" role="status">{saveToast}</div>}
      <UndoToast pending={undoPending} onUndo={doUndo} />
      {autoQueue && autoQueue.phase !== 'init' && (
        <AutoPlanBar
          queue={autoQueue}
          city={stop?.dest?.city || ''}
          onStop={() => setAutoQueue((q) => (q ? { ...q, phase: 'stopped' } : q))}
          onResume={() => setAutoQueue((q) => (q ? { ...q, phase: 'run', code: '' } : q))}
          onPass={() => paywall.require('plans')}
          onClose={() => setAutoQueue(null)}
        />
      )}
      {receiptOpen && (
        <DayReceiptSheet
          id={receiptId}
          dayCost={dayCost}
          city={dayCity}
          dayNumber={dayNumber}
          dateLabel={days[dayIdx] ? fmtDateFull(days[dayIdx], true) : ''}
          trip={tripPriced ? { priced: tripPriced } : null}
          tripName={tripName}
          onBackToTrip={backToTrip}
          onLifestyle={onOpenLifestyle}
          onClose={() => setReceiptOpen(false)}
        />
      )}

      {isDesk ? (
        <>
          <div className="dayws-panel">
            {pageBar}
            <div className="dayws-scroll">{overviewBody || dayBody}</div>
            <DayCostBar
              dayCost={dayCost}
              dayNumber={dayNumber}
              trip={tripPriced ? { priced: tripPriced } : null}
              onOpen={openReceipt}
              onOpenTrip={backToTrip}
              receiptId={receiptId}
              open={receiptOpen}
            />
          </div>
          <div className="dayws-map">
            {mapNode({ fitPadding: deskFitPadding })}
          </div>
          {botOn && botChat}
        </>
      ) : (
        <>
          {pageBar}
          <div className="dayws-stage">
            <div className="dayws-map is-under">
              {mapNode({ padBottom: drawer === 'strip' ? 96 : Math.round((typeof window !== 'undefined' ? window.innerHeight : 700) * 0.45) })}
            </div>
            <MapDrawer
              className="dayws-drawer"
              state={drawer}
              onStateChange={setDrawer}
              ariaLabel={dayTitle}
              labels={{ strip: t('drawer.dayStrip'), half: t('drawer.dayHalf'), full: t('drawer.dayFull') }}
              strip={<DayStrip title={dayTitle} sub={daySub} dayCost={dayCost} onOpen={openReceipt} dayNumber={dayNumber} />}
            >
              <div className="dayws-drawer-body">{overviewBody || dayBody}</div>
            </MapDrawer>
          </div>
          {botOn && botChat}
        </>
      )}
    </div>
  );
});

