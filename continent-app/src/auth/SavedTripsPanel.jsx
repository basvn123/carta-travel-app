import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { fetchSavedTrips, deleteTrip } from './tripStorage.js';
import { fetchTripPlans, deleteTripPlan } from './tripPlanStorage.js';
import {
  loadStandalonePlans, deleteStandalonePlan, loadAssignments, subscribeDayPlanStore,
  loadTripExtras, persistTripExtras, hasTripExtras,
} from '../planner/dayPlanStore.js';
import { tripsStore } from '../planner/tripsStore.js';
import { CalendarIcon, RouteIcon, LinkIcon, PencilIcon } from '../components/Icons.jsx';
import { Button, Chip } from '../components/ui/index.js';
import { loadDeviceTrip, clearDeviceTrip } from '../planner/deviceTripStore.js';
import { PastTripForm } from './PastTripForm.jsx';
import { TripMemoryView } from './TripMemoryView.jsx';
import {
  savePastTripToAccount, savePastTripOnDevice, pastTripAsPlanRow, defaultPastLabel,
  updatePastTripInAccount, updatePastTripOnDevice,
} from './pastTrip.js';
import {
  loadMemory, saveMemory, clearMemory, coverPhoto, memoryPoints, spendSummary, SPEND_CATS,
} from './pastTripMemory.js';
import { COUNTRY_ISO2 } from '../components/CountryFlag.jsx';
import { crewLabel, crewInitials, namedCrew, readCrew, writeCrew, MAX_CREW } from './tripCrew.js';
import { TripSharePanel } from './TripSharePanel.jsx';
import { ModerationNotice } from './ModerationNotice.jsx';
import { fetchMyStatements, contestStatement, latestByPlan } from './moderation.js';
import { fetchFriendLinks, listFriendTrips } from './friends.js';
import { ownersOf } from './useFriendTrips.js';
import { formatMoney } from '../lib/money.js';
import { countryName } from '../lib/countryName.js';
import { useI18n } from '../i18n/index.jsx';
import { activeLocale } from '../lib/localeState.js';
import { useFavoriteItems } from '../hooks/useFavoriteItems.js';
import { parseFavKey } from '../lib/favorites.js';
import { E2E_SEAMS } from '../lib/e2eSeams.js';
import { DayPrice } from '../browse/ExploreCards.jsx';
import '../styles/70-mytrips.css';
import { InstallHint } from './InstallHint.jsx';
import { KeptTrips } from './mytrips/KeptTrips.jsx';
import { SavedJourneys } from './mytrips/SavedJourneys.jsx';
import { useSavedJourneys } from '../lib/journeySaves.js';
import { holdPlan, useKept } from '../lib/recommend/keptStore.js';
import {
  localToday, addDaysIso, classifyTrips, whenParts, dayPlanEndDate, orderedUnique, daysUntil,
  nightsBetween, tripFigure, visitedRecord, yearOf, deviceTripAsPlan, readinessSteps, tripStops,
  isHappening, tripToday,
} from '../lib/myTrips.js';
import { useVisitedCountries, toggleVisitedCountry } from '../lib/visitedCountries.js';
import { UNDO_MS, UndoToast, CrewBar, TripPrice, whenText } from './mytrips/parts.jsx';
import { SiteFooter } from '../components/SiteFooter.jsx';
import { MyTripsHead, TripsTab, VisitedCountriesSheet, MT_TABS } from './mytrips/MyTripsTabs.jsx';
import { YearFilter, VisitedTab } from './mytrips/LegacyTabs.jsx';
import { SavedTab } from './mytrips/SavedTab.jsx';
import { useSavedLists, loadSavedLists, noteSaved, createList, setNote } from '../lib/savedLists.js';
import { TodayCard } from './mytrips/TodayCard.jsx';

/**
 * My trips (T434, rebuilt as Concept A by T923 to T927). One header with
 * three underline tabs:
 *   Trips        the next trip as the focal card with how ready it is, Today
 *                while a trip runs, Coming up and Being planned.
 *   Saved        everything saved, in the traveller's own lists.
 *   Your Europe  the record: the countries, the money, the past trips.
 *
 * This file keeps the state, the data and the undo; the tabs and cards are
 * drawn in ./mytrips/. Dates decide what is upcoming and what is past
 * (lib/myTrips.js); nobody files anything.
 */

// ?savedmock verify seam: fixture rows stand in for the Supabase tables so
// the account-only shapes render in headless checks. Never on in production.
const SAVED_MOCK = E2E_SEAMS && typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).has('savedmock');
const MOCK_FAVS = [
  { id: 'mf1', destination_id: 'LIS', city: 'Lisbon', country: 'Portugal', depart_date: addDaysIso(34), return_date: addDaysIso(38), created_at: addDaysIso(-12) },
  { id: 'mf2', destination_id: 'OPO', city: 'Porto', country: 'Portugal', depart_date: addDaysIso(62), return_date: addDaysIso(65), created_at: addDaysIso(-30) },
  { id: 'mf3', destination_id: 'gem:bruges', city: 'Bruges', country: 'Belgium', created_at: addDaysIso(-45) },
];
// T925: saved places the seam adds to this browser's own shortlist, with the
// price each was saved at a little off today's so the moves render.
const MOCK_FAV_KEYS = ['dest:BCN', 'dest:SPU', 'dest:LJU', 'dest:NAP'];
const MOCK_SAVED_AT = { 'dest:BCN': 6, 'dest:SPU': -3, 'dest:LIS': 11 };
const MOCK_FRIEND_TRIPS = [
  { ownerId: 'u-sofie', ownerHandle: 'sofie_v', ownerName: 'Sofie Vermeulen', tripPlanId: 'ft1', label: 'Two weeks in Portugal', startDate: addDaysIso(-90), endDate: addDaysIso(-80), cities: ['Lisbon', 'Porto'], countries: ['Portugal'], destinationIds: ['LIS', 'OPO'] },
  { ownerId: 'u-sofie', ownerHandle: 'sofie_v', ownerName: 'Sofie Vermeulen', tripPlanId: 'ft2', label: 'Alpine summer', startDate: addDaysIso(-200), endDate: addDaysIso(-193), cities: ['Innsbruck'], countries: ['Austria'], destinationIds: ['INN'] },
  { ownerId: 'u-jonas', ownerHandle: 'jonas', ownerName: 'Jonas Peeters', tripPlanId: 'ft3', label: 'A week in Rome', startDate: addDaysIso(-150), endDate: addDaysIso(-143), cities: ['Rome'], countries: ['Italy'], destinationIds: ['FCO'] },
];
const MOCK_STATEMENTS = [
  { id: 1, plan_id: 'mp1', plan_label: 'Lisbon and Porto', source: 'notice', notice_count: 2, facts: 'The guide copies a chapter of a published travel book word for word.', automated: false, created_at: addDaysIso(-3), contest_until: addDaysIso(180), complaint_status: 'none', complaint_note: null, reinstated: false, ground: 'terms', ground_ref: 'c6' },
];
// Stops carry their own windows so the seam can price the trips the way a
// real account's rows are priced (choices on the first stop, T434).
const mockStops = (list) => list.map(([id, a, b]) => ({ destination_id: id, city: '', country: '', arrive_date: addDaysIso(a), depart_date: addDaysIso(b) }));
const MOCK_PLANS = [
  { id: 'mp1', label: null, cities: ['Lisbon', 'Porto'], countries: ['Portugal'], start_date: addDaysIso(21), end_date: addDaysIso(27), destination_ids: ['LIS', 'OPO'], stops: mockStops([['LIS', 21, 24], ['OPO', 24, 27]]), choices: { groupSize: 2 } },
  { id: 'mp2', label: 'Autumn in Flanders', cities: ['Bruges'], countries: ['Belgium'], start_date: addDaysIso(-40), end_date: addDaysIso(-35), destination_ids: ['gem:bruges'] },
  { id: 'mp3', label: null, cities: ['Salzburg'], countries: ['Austria'], start_date: addDaysIso(-380), end_date: addDaysIso(-377), destination_ids: ['SZG'] },
  { id: 'mp4', label: null, cities: ['Munich'], countries: ['Germany'], start_date: addDaysIso(-9), end_date: addDaysIso(-7), destination_ids: ['MUC'] },
  { id: 'mp5', label: null, cities: ['Ljubljana'], countries: ['Slovenia'], start_date: addDaysIso(75), end_date: addDaysIso(79), destination_ids: [] },
  // T923: two drafts, no dates yet, for Being planned.
  { id: 'mp7', label: 'Alps hut tour', cities: ['Innsbruck'], countries: ['Austria'], start_date: null, end_date: null, destination_ids: ['INN'], stops: [{ destination_id: 'INN', nights: 6 }] },
  { id: 'mp8', label: 'Lake weekend', cities: ['Ljubljana'], countries: ['Slovenia'], start_date: null, end_date: null, destination_ids: ['LJU'] },
  // T924: a trip happening today, on its third day.
  { id: 'mp6', label: 'Rome and Naples', cities: ['Rome', 'Naples'], countries: ['Italy'], start_date: addDaysIso(-2), end_date: addDaysIso(3), destination_ids: ['FCO', 'NAP'], stops: mockStops([['FCO', -2, 2], ['NAP', 2, 3]]), choices: { groupSize: 2 } },
];

/** The seam's own trip state, written once into this browser so the cards
 *  read it through the same stores a real trip uses (dev only). */
function seedMock() {
  if (!SAVED_MOCK) return;
  if (!hasTripExtras('mp6')) {
    const at = (h) => { const d = new Date(); d.setHours(h, 0, 0, 0); return `${d.getTime()}`; };
    persistTripExtras('mp6', {
      ...loadTripExtras('mp6'),
      people: [{ id: 'p0', name: 'Sam', userId: null }],
      bookings: { 'flight-out': { ref: 'AZ611', price: '264' }, 'stay-0': { ref: 'RM2231', price: '420' }, 'stay-1': { ref: 'NP0912', price: '96' } },
      dayNotes: { 3: 'Trastevere and the river' },
      ideas: [{ id: 'i1', text: 'Breakfast at the market in Campo de Fiori', day: 3 }, { id: 'i2', text: 'Walk up the Gianicolo for the view', day: 3 }],
      dayExtras: { 3: [{ id: 'b1', name: 'Villa Farnesina', eur: 24, day: 3 }], 4: [{ id: 'b2', name: 'Train to Naples', eur: 39, day: 4 }] },
      expenses: [
        { id: at(9), desc: 'Coffee and cornetti', amount: 9.6, currency: 'EUR', paidBy: 0, sharers: null, date: addDaysIso(0), cat: 'food' },
        { id: at(11), desc: 'Bus passes', amount: 14, currency: 'EUR', paidBy: 0, sharers: null, date: addDaysIso(0), cat: 'transport' },
        { id: at(13), desc: 'Lunch', amount: 31.5, currency: 'EUR', paidBy: 0, sharers: null, date: addDaysIso(0), cat: 'food' },
        { id: at(12), desc: 'Dinner', amount: 58, currency: 'EUR', paidBy: 0, sharers: null, date: addDaysIso(-1), cat: 'food' },
      ],
    });
    try { localStorage.setItem('carta.mytrips.done.v1', JSON.stringify({ mp6: { 3: ['i:i1'] } })); } catch { /* private mode */ }
  }
  if (hasTripExtras('mp1')) return;
  persistTripExtras('mp1', {
    ...loadTripExtras('mp1'),
    people: [{ id: 'p0', name: 'Sam', userId: null }],
    bookings: { 'flight-out': { ref: 'TP1342', price: '312' }, 'stay-0': { ref: 'BK7781', price: '318' } },
  });
  try {
    localStorage.setItem(BED_BASE_KEY, JSON.stringify({ mp1: { beds: null, at: addDaysIso(-12), mockLower: 42 } }));
  } catch { /* private mode */ }
}

// How many euros the beds of a trip must have fallen, for the whole party,
// before the card says so: a price model that moved by small change is not
// news (T923 price nudge).
const NUDGE_MIN_EUR = 5;
const NUDGE_MIN_SHARE = 0.03;
// The beds' price for the whole party the first time My trips priced a
// trip, by plan id: { beds, at }. The nudge compares today's price for the
// same dates against it and names the day it was first priced.
const BED_BASE_KEY = 'carta.mytrips.bedBase.v1';
const readBedBase = () => { try { return JSON.parse(localStorage.getItem(BED_BASE_KEY) || '{}') || {}; } catch { return {}; } };
const writeBedBase = (v) => { try { localStorage.setItem(BED_BASE_KEY, JSON.stringify(v)); } catch { /* private mode */ } };

const TAB_KEY = 'carta.savedTripsTab';
// T923: the tabs were renamed; a stored choice of the old names still lands.
const OLD_TABS = { planned: 'trips', favorites: 'saved', visited: 'europe' };
const readTab = () => {
  try {
    const v = localStorage.getItem(TAB_KEY);
    return MT_TABS.includes(v) ? v : (OLD_TABS[v] || 'trips');
  } catch { return 'trips'; }
};
const writeStored = (key, v) => { try { localStorage.setItem(key, v); } catch { /* private mode */ } };

export function SavedTripsPanel({
  data, onLoadTripPlan, onOpenAuth, onOpenDayPlan, onGoToTab,
  favorites = null, onToggleFav = null, onOpenFeature = null, onOpenDest = null,
  // The day-cost map Explore prints from, and the Lifestyle the trip planner
  // prices with, so every figure here is the figure there.
  costs = null, stayTier = 'home', lifestyle = null,
  onOpenFriends = null, onOpenDeviceTrip = null, onPlanStops = null,
  // T659: Plan's "Add a past trip" opens My trips on the past-trip form.
  startWithPast = false, onPastStarted = null,
}) {
  const { user, configured } = useAuth();
  const { t, lang } = useI18n();
  const destinations = useMemo(() => data?.destinations || {}, [data]);
  const todayIso = localToday();
  useState(seedMock);

  const keptCount = useKept().length;
  // T831: Carta's own trips saved from their page count as something kept.
  const savedWeeks = useSavedJourneys().length;
  const [tab, setTab] = useState(readTab);
  const pickedRef = useRef(false);
  const pickTab = (v) => { pickedRef.current = true; setTab(v); writeStored(TAB_KEY, v); };

  const authed = !!user || SAVED_MOCK;
  const [trips, setTrips] = useState(SAVED_MOCK ? MOCK_FAVS : []);
  const [loading, setLoading] = useState(!!user && !SAVED_MOCK);
  const [tripPlans, setTripPlans] = useState(SAVED_MOCK ? MOCK_PLANS : []);
  const [tripPlansLoading, setTripPlansLoading] = useState(!!user && !SAVED_MOCK);
  // A list that cannot be read is not a traveller with no trips (020 lesson).
  const [tripPlansError, setTripPlansError] = useState('');
  const [statements, setStatements] = useState(SAVED_MOCK ? MOCK_STATEMENTS : []);
  const [dayPlans, setDayPlans] = useState(() => loadStandalonePlans());
  // The one trip kept on this device without an account (T500, carta.
  // deviceTrip.v1), read once per opening of My trips (T503, owner T500-a).
  const [deviceStored, setDeviceStored] = useState(() => (SAVED_MOCK ? null : loadDeviceTrip()));
  const devicePlan = useMemo(() => deviceTripAsPlan(deviceStored, destinations), [deviceStored, destinations]);
  // T923: the trips the Plan home lists on this device; the undated ones are
  // drafts, listed under Being planned with a link back to Plan.
  const [deviceDrafts, setDeviceDrafts] = useState(() => (SAVED_MOCK ? [] : safeList()));
  useEffect(() => tripsStore.subscribe(() => setDeviceDrafts(safeList())), []);
  // Any write to a trip's extras or day plans (the planner, the sync, the
  // booking sheet) re-reads what the cards show.
  const [storeTick, setStoreTick] = useState(0);
  useEffect(() => subscribeDayPlanStore(({ remote }) => {
    if (remote) setDayPlans(loadStandalonePlans());
    setStoreTick((n) => n + 1);
  }), []);

  const loadTrips = () => {
    setLoading(true);
    fetchSavedTrips(user.id).then(setTrips).catch(() => {}).finally(() => setLoading(false));
  };
  const loadTripPlans = () => {
    setTripPlansLoading(true);
    setTripPlansError('');
    fetchTripPlans(user.id)
      .then((rows) => { setTripPlans(rows); setTripPlansError(''); })
      .catch((e) => {
        console.error('trip plans failed to load', e);
        setTripPlans([]);
        setTripPlansError(t('saved.errLoad'));
      })
      .finally(() => setTripPlansLoading(false));
  };
  const loadStatements = () => {
    fetchMyStatements().then(setStatements).catch((e) => console.error('statements of reasons failed to load', e));
  };
  useEffect(() => {
    if (!user || SAVED_MOCK) { setLoading(false); setTripPlansLoading(false); return; }
    loadTrips();
    loadTripPlans();
    loadStatements();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed on the account id; the loaders are rebuilt each render

  const handleDelete = async (id) => {
    setTrips((prev) => prev.filter((x) => x.id !== id));
    if (SAVED_MOCK) return;
    try { await deleteTrip(id); } catch { loadTrips(); }
  };

  // ── A trip that already happened, told by hand. ──
  const [pastOpen, setPastOpen] = useState(false);
  const [pastEdit, setPastEdit] = useState(null);
  const [pastBusy, setPastBusy] = useState(false);
  const [pastError, setPastError] = useState('');
  const [memTick, setMemTick] = useState(0);
  const [openMemory, setOpenMemory] = useState('');
  const [openShare, setOpenShare] = useState('');
  const [friends, setFriends] = useState([]);
  const [friendTrips, setFriendTrips] = useState(SAVED_MOCK ? MOCK_FRIEND_TRIPS : []);
  const [visById, setVisById] = useState({});
  const [mapFull, setMapFull] = useState(false);
  const [year, setYear] = useState('all');
  const [countriesOpen, setCountriesOpen] = useState(false);
  const countriesRef = useRef(null);
  const manualCountries = useVisitedCountries();

  // ── Undo, not confirm: a removal hides the thing at once and is held for six
  // seconds behind one toast; only then does `commit` run. ──
  const [undo, setUndo] = useState(null);
  const undoRef = useRef(null);
  const flushUndo = useCallback(() => {
    const u = undoRef.current;
    if (!u) return;
    undoRef.current = null;
    window.clearTimeout(u.timer);
    setUndo(null);
    u.commit?.();
  }, []);
  const removeWithUndo = useCallback(({ key, label, commit, restore }) => {
    flushUndo();
    const timer = window.setTimeout(flushUndo, UNDO_MS);
    undoRef.current = { key, commit, restore, timer };
    setUndo({ key, label });
  }, [flushUndo]);
  const undoRemoval = () => {
    const u = undoRef.current;
    if (!u) return;
    undoRef.current = null;
    window.clearTimeout(u.timer);
    setUndo(null);
    u.restore?.();
  };
  useEffect(() => {
    window.addEventListener('pagehide', flushUndo);
    return () => { window.removeEventListener('pagehide', flushUndo); flushUndo(); };
  }, [flushUndo]);
  const heldKey = undo?.key || '';

  useEffect(() => {
    if (SAVED_MOCK) return undefined;
    if (!user) { setFriends([]); setFriendTrips([]); return undefined; }
    let live = true;
    fetchFriendLinks(user.id).then((rows) => { if (live) setFriends(rows.filter((r) => r.kind === 'friend')); }).catch(() => {});
    listFriendTrips().then((rows) => { if (live) setFriendTrips(rows); }).catch(() => {});
    return () => { live = false; };
  }, [user]);

  // Escape leaves the full-screen map first, in the capture phase, so one
  // press does not also close the page behind it.
  useEffect(() => {
    if (!mapFull) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setMapFull(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [mapFull]);

  const spendLabels = useMemo(
    () => Object.fromEntries(SPEND_CATS.map((c) => [c, t(`saved.pastSpend_${c}`)])),
    [t],
  );
  const openPastForm = (initial) => { setPastError(''); setPastEdit(initial || null); setPastOpen(true); };
  useEffect(() => {
    if (!startWithPast) return;
    // The form lives on Your Europe.
    pickTab('europe');
    openPastForm(null);
    onPastStarted && onPastStarted();
  }, [startWithPast]); // eslint-disable-line react-hooks/exhaustive-deps -- a one-shot hand-off from Plan

  const handleSavePastTrip = async (form) => {
    const payload = { ...form, label: form.label || defaultPastLabel(form.places) };
    const editId = pastEdit?.id || null;
    setPastBusy(true);
    setPastError('');
    try {
      let planId = editId;
      if (SAVED_MOCK) {
        planId = editId || `mock:${Date.now()}`;
        setTripPlans((prev) => [pastTripAsPlanRow(planId, payload), ...prev.filter((p) => p.id !== planId)]);
      } else if (pastEdit?.local) {
        updatePastTripOnDevice(editId, payload);
        setDayPlans(loadStandalonePlans());
      } else if (editId && user) {
        await updatePastTripInAccount(user.id, editId, payload);
        setTripPlans((prev) => prev.map((p) => (p.id === editId ? pastTripAsPlanRow(editId, payload) : p)));
      } else if (user) {
        planId = await savePastTripToAccount(user.id, payload);
        setTripPlans((prev) => [pastTripAsPlanRow(planId, payload), ...prev]);
      } else {
        const saved = savePastTripOnDevice(payload);
        planId = saved.id;
        setDayPlans(saved.plans);
      }
      if (payload.memory) saveMemory(planId, { ...payload.memory, places: payload.memory.places }, spendLabels);
      setMemTick((n) => n + 1);
      setPastOpen(false);
      setPastEdit(null);
    } catch {
      setPastError(t('saved.pastSaveFailed'));
    } finally {
      setPastBusy(false);
    }
  };

  const handleDeleteTripPlan = async (id) => {
    setTripPlans((prev) => prev.filter((p) => p.id !== id));
    clearMemory(id);
    setMemTick((n) => n + 1);
    if (SAVED_MOCK) return;
    try { await deleteTripPlan(id); } catch { loadTripPlans(); }
  };

  const fmtDay = (s) => (s ? new Date(`${s}T00:00:00Z`).toLocaleDateString(activeLocale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');
  const fmtDate = (s) => (s ? new Date(`${s}T00:00:00Z`).toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');
  const fmtRange = (a, b) => {
    if (!a) return '';
    if (!b || a === b) return fmtDay(a);
    return t('saved.dateRange', { from: fmtDay(a), to: fmtDay(b) });
  };

  // ── What is on show: the lists without the one removal Undo holds. ──
  const shownPlans = useMemo(
    () => (devicePlan ? [...tripPlans, devicePlan] : tripPlans).filter((p) => `plan:${p.id}` !== heldKey),
    [tripPlans, devicePlan, heldKey],
  );
  const shownDayPlans = useMemo(() => dayPlans.filter((sp) => `day:${sp.id}` !== heldKey), [dayPlans, heldKey]);
  const shownTrips = useMemo(() => trips.filter((x) => `fav:${x.id}` !== heldKey), [trips, heldKey]);
  const { upcomingPlans, pastPlans, upcomingDayPlans, pastDayPlans } = useMemo(
    () => classifyTrips({ plans: shownPlans, dayPlans: shownDayPlans, todayIso }),
    [shownPlans, shownDayPlans, todayIso],
  );
  // Dated trips ahead, and the drafts (no dates yet) apart from them.
  const datedPlans = useMemo(() => upcomingPlans.filter((p) => p.start_date), [upcomingPlans]);
  const draftPlans = useMemo(() => upcomingPlans.filter((p) => !p.start_date), [upcomingPlans]);

  const memories = useMemo(() => {
    const out = {};
    [...pastPlans.map((p) => p.id), ...pastDayPlans.map((sp) => sp.id)].forEach((id) => {
      const m = loadMemory(id);
      if (m) out[id] = m;
    });
    return out;
  }, [pastPlans, pastDayPlans, memTick]); // eslint-disable-line react-hooks/exhaustive-deps -- memTick re-reads localStorage

  const destCoords = useCallback((id) => {
    const d = destinations[id];
    if (!d) return null;
    const lat = d.city_lat != null ? d.city_lat : d.lat;
    const lon = d.city_lon != null ? d.city_lon : d.lon;
    return lat != null && lon != null ? { lat, lon } : null;
  }, [destinations]);

  // Images: a stop's own photo, then any catalogue entry in the same city,
  // then the best-rated photo of the same country.
  const imageLookup = useMemo(() => {
    const byCity = new Map();
    const byCountry = new Map();
    for (const d of Object.values(destinations)) {
      const url = d.image?.url;
      if (!url) continue;
      const score = d.rating?.score ?? d.beauty?.score ?? 0;
      const cityKey = (d.city || '').toLowerCase();
      const curCity = cityKey && byCity.get(cityKey);
      if (cityKey && (!curCity || score > curCity.score)) byCity.set(cityKey, { url, score });
      const curCountry = d.country && byCountry.get(d.country);
      if (d.country && (!curCountry || score > curCountry.score)) byCountry.set(d.country, { url, score });
    }
    return { byCity, byCountry };
  }, [destinations]);
  const resolveImage = useCallback(({ ids = [], cities = [], countries = [] }) => {
    for (const id of ids) { const u = destinations[id]?.image?.url; if (u) return u; }
    for (const c of cities) { const hit = imageLookup.byCity.get((c || '').toLowerCase()); if (hit) return hit.url; }
    for (const c of countries) { const hit = imageLookup.byCountry.get(c); if (hit) return hit.url; }
    return null;
  }, [destinations, imageLookup]);

  const planCountries = useCallback((p) => orderedUnique([
    ...(p.countries || []), ...(p.destination_ids || []).map((id) => destinations[id]?.country),
  ]), [destinations]);
  const planCities = useCallback((p) => orderedUnique([
    ...(p.cities || []), ...(p.destination_ids || []).map((id) => destinations[id]?.city),
  ]), [destinations]);
  const dayPlanCountries = useCallback((sp) => orderedUnique((sp.stops || []).map((s) => destinations[s.destinationId]?.country)), [destinations]);
  const dayPlanCities = useCallback((sp) => orderedUnique((sp.stops || []).map((s) => destinations[s.destinationId]?.city)), [destinations]);

  const cityCoordIndex = useMemo(() => {
    const m = new Map();
    for (const d of Object.values(destinations)) {
      const key = (d.city || '').toLowerCase();
      const lat = d.city_lat != null ? d.city_lat : d.lat;
      const lon = d.city_lon != null ? d.city_lon : d.lon;
      if (!key || lat == null || lon == null) continue;
      const score = d.rating?.score ?? d.beauty?.score ?? 0;
      const cur = m.get(key);
      if (!cur || score > cur.score) m.set(key, { lat, lon, score });
    }
    return m;
  }, [destinations]);
  const cityCoords = useCallback((city) => cityCoordIndex.get((city || '').toLowerCase()) || null, [cityCoordIndex]);

  // The trip's headline: the country when it stays in one, else its label or route.
  const journeyParts = useCallback((p) => {
    const countries = planCountries(p);
    const cities = planCities(p);
    if (p.label) return { title: p.label, sub: cities.join(', '), countries };
    if (countries.length === 1) return { title: countryName(COUNTRY_ISO2[countries[0]], countries[0]), sub: cities.join(', '), countries };
    const cs = p.cities || [];
    const title = cs.length > 1 ? t('saved.routeTitle', { from: cs[0], to: cs[cs.length - 1] }) : (cs[0] || t('saved.untitledTrip'));
    return { title, sub: countries.map((c) => countryName(COUNTRY_ISO2[c], c)).join(', '), countries };
  }, [planCountries, planCities, t]);
  const dayJourneyParts = useCallback((sp) => {
    const countries = dayPlanCountries(sp);
    const cities = dayPlanCities(sp);
    if (sp.label && countries.length !== 1) return { title: sp.label, sub: cities.join(', '), countries };
    if (countries.length === 1) return { title: countryName(COUNTRY_ISO2[countries[0]], countries[0]), sub: cities.join(', ') || sp.label, countries };
    return { title: sp.label || t('saved.dayPlanFallbackTitle'), sub: cities.join(', '), countries };
  }, [dayPlanCountries, dayPlanCities, t]);

  const memoryLine = (m) => {
    const spend = spendSummary(m);
    return [
      crewLabel(m.crew, lang),
      m.rating != null ? t('saved.pastRatedN', { n: m.rating }) : '',
      spend.any ? formatMoney(spend.total) : '',
      m.photos?.length ? t(m.photos.length === 1 ? 'saved.pastPhotos1' : 'saved.pastPhotosN', { n: m.photos.length }) : '',
    ].filter(Boolean).join(', ');
  };

  // ── Who came, editable from the record (the same list the ledger splits by). ──
  const crewFor = (planId) => { const extras = loadTripExtras(planId); return readCrew(extras, { memory: extras.memory }); };
  const writeCrewFor = (planId, next) => { persistTripExtras(planId, writeCrew(loadTripExtras(planId), next)); setMemTick((n) => n + 1); };
  const crewBarFor = (planId) => (
    <CrewBar
      crew={crewFor(planId)}
      friends={friends}
      onAdd={(member) => {
        const cur = crewFor(planId);
        if (namedCrew(cur).length >= MAX_CREW) return;
        writeCrewFor(planId, [...cur, member]);
      }}
      onRemove={(i) => {
        const before = crewFor(planId);
        const name = before[i]?.name?.trim() || '';
        writeCrewFor(planId, before.filter((_, j) => j !== i));
        removeWithUndo({ key: `crew:${planId}:${before[i]?.id}`, label: name, restore: () => writeCrewFor(planId, before) });
      }}
    />
  );

  const statementByPlan = useMemo(() => latestByPlan(statements), [statements]);
  const statementFor = (planId) => (statementByPlan[planId] ? (
    <ModerationNotice
      statement={statementByPlan[planId]}
      contest={SAVED_MOCK ? async () => ({ ok: true, status: 'open' }) : contestStatement}
      onContested={SAVED_MOCK ? undefined : loadStatements}
    />
  ) : null);
  const sharePanelFor = (planId, title) => (openShare === planId && user ? (
    <TripSharePanel
      userId={user.id}
      tripPlanId={planId}
      title={title}
      visibility={visById[planId] || tripPlans.find((tp) => tp.id === planId)?.visibility || 'private'}
      onVisibility={(id, v) => setVisById((cur) => ({ ...cur, [id]: v }))}
      canInvite={!tripPlans.find((tp) => tp.id === planId)?.coplan}
    />
  ) : null);
  const toggleShare = (planId) => {
    if (!user && !SAVED_MOCK) { onOpenAuth?.(); return; }
    const opening = openShare !== planId;
    setOpenShare(opening ? planId : '');
    // The panel opens under the card: bring it into view and give it focus,
    // so a phone user is not left looking at a button that did nothing.
    if (opening) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const el = document.getElementById(`tshare-${planId}`);
        el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        el?.focus({ preventScroll: true });
      }));
    }
  };

  // ── Trips: view models for the focal card and the rows. ──
  const priceFor = useCallback((p) => tripFigure(p, { data, stayTier, lifestyle }), [data, stayTier, lifestyle]);
  const isoFor = (countries) => COUNTRY_ISO2[countries?.[0]] || '';

  // Browser storage is read once per plan list and per store change, never
  // per render (T434 audit, P1-2): who is coming and how ready each trip is.
  const planLocal = useMemo(() => {
    const out = {};
    datedPlans.forEach((p) => {
      const extras = loadTripExtras(p.id);
      const crew = readCrew(extras, { memory: extras.memory });
      out[p.id] = {
        crew: crewInitials(crew, MAX_CREW).map((c) => ({ id: c.id, name: c.name, initials: c.initials })),
        crewLine: crewLabel(crew, lang, 3),
        readiness: readinessSteps(p, { assignments: loadAssignments(p.id), extras }),
      };
    });
    return out;
  }, [datedPlans, memTick, storeTick, lang]); // eslint-disable-line react-hooks/exhaustive-deps -- the ticks re-read storage after an edit
  const figures = useMemo(() => {
    const out = {};
    datedPlans.forEach((p) => { out[p.id] = priceFor(p); });
    return out;
  }, [datedPlans, priceFor]);

  // The price nudge (T923): the beds for the trip's own dates, priced by
  // Carta's model today, against the same beds the first time My trips
  // priced the trip. Only a fall is news, and only before the beds are booked.
  const [bedBase, setBedBase] = useState(readBedBase);
  useEffect(() => {
    const base = readBedBase();
    let changed = false;
    Object.entries(figures).forEach(([id, f]) => {
      if (!f || !Number.isFinite(f.beds) || f.beds <= 0) return;
      const cur = base[id];
      if (cur && Number.isFinite(cur.beds)) return;
      // The seam marks its trip's first price a little higher, so the nudge renders.
      base[id] = { beds: cur?.mockLower ? f.beds + cur.mockLower : f.beds, at: cur?.at || todayIso };
      changed = true;
    });
    if (changed) { writeBedBase(base); setBedBase(base); }
  }, [figures, todayIso]);
  const nudgeFor = (p, figure, readiness) => {
    const base = bedBase[p.id];
    if (!figure || !base || !Number.isFinite(base.beds) || !Number.isFinite(figure.beds)) return null;
    if (readiness?.steps?.find((s) => s.key === 'beds')?.done) return null;
    const fall = base.beds - figure.beds;
    if (fall < NUDGE_MIN_EUR || fall < base.beds * NUDGE_MIN_SHARE) return null;
    return { eur: fall, since: fmtDate(base.at) };
  };

  // The trip's first town, where the countdown counts to.
  const firstTown = (p) => {
    const id = tripStops(p)[0]?.id || (p.destination_ids || [])[0];
    return destinations[id]?.city || (p.cities || [])[0] || '';
  };

  // The next missing step as the card's secondary: dates open the trip, a
  // booking opens the trip page where Ready to book lists where to book.
  const nextStepFor = (p, readiness) => {
    const step = readiness?.next;
    if (!step || step === 'days' || p.device) return null;
    const open = () => onLoadTripPlan?.(p.id);
    if (step === 'dates') return { label: t('mt.nextDates'), onClick: () => onLoadTripPlan?.({ id: p.id, edit: true }) };
    if (step === 'travel') return { label: t('mt.nextTravel'), onClick: open };
    const stops = tripStops(p);
    const extras = loadTripExtras(p.id);
    const i = stops.findIndex((s, k) => !(extras.bookings?.[`stay-${k}`]?.ref || extras.bookings?.[`stay-${k}`]?.price));
    const city = destinations[stops[Math.max(0, i)]?.id]?.city || '';
    return { label: city ? t('mt.nextBedIn', { city }) : t('mt.nextBed'), onClick: open };
  };

  const planMenu = (p, parts, device) => (device ? [] : [
    { key: 'edit', label: t('mt.editTrip'), icon: <PencilIcon size={16} />, onClick: () => onLoadTripPlan?.({ id: p.id, edit: true }) },
    { key: 'days', label: t('saved.planDays'), icon: <CalendarIcon size={16} />, onClick: () => onOpenDayPlan?.({ planId: p.id, stopIndex: 0, dayIndex: 0 }) },
    ...(p.coplan ? [] : [{ key: 'share', label: t('saved.shareInvite'), icon: <LinkIcon size={16} />, onClick: () => toggleShare(p.id) }]),
  ]);

  const planModel = (p, focal) => {
    const parts = journeyParts(p);
    const nights = nightsBetween(p.start_date, p.end_date);
    const local = planLocal[p.id] || { crew: [], crewLine: '', readiness: null };
    const when = whenParts(p.start_date, p.end_date, todayIso);
    const figure = figures[p.id] || null;
    const removeLabel = t('saved.removeItem', { name: parts.title });
    // The trip on this device says where it is kept; signing in is offered
    // only as the way to have it on a second device (T503, owner T500-a).
    const device = !!p.device;
    const onRemove = p.coplan ? null : device
      ? () => removeWithUndo({ key: `plan:${p.id}`, label: parts.title, commit: () => { clearDeviceTrip(); setDeviceStored(null); } })
      : () => removeWithUndo({ key: `plan:${p.id}`, label: parts.title, commit: () => handleDeleteTripPlan(p.id) });
    const below = device ? (
      <p className="mt-device-line">
        <span>{t(!user && configured ? 'saved.deviceLine' : 'saved.deviceLineShort')}</span>
        {!user && configured && (
          <Button variant="quiet" size="sm" onClick={onOpenAuth}>{t('saved.signIn')}</Button>
        )}
      </p>
    ) : <>{statementFor(p.id)}{sharePanelFor(p.id, parts.title)}</>;
    const common = {
      id: p.id,
      title: parts.title,
      img: resolveImage({ ids: p.destination_ids || [], cities: planCities(p), countries: parts.countries }),
      iso2: isoFor(parts.countries),
      onOpen: device ? () => onOpenDeviceTrip?.() : () => onLoadTripPlan?.(p.id),
      onRemove,
      removeLabel,
      below,
    };
    if (focal) {
      const n = p.start_date ? daysUntil(p.start_date, todayIso) : null;
      return {
        ...common,
        countries: parts.countries,
        countdown: n != null && n > 0 ? { n, place: firstTown(p) } : null,
        when,
        dates: fmtRange(p.start_date, p.end_date),
        nights,
        figure,
        people: local.crew,
        crewLine: local.crewLine,
        party: figure?.party || null,
        readiness: local.readiness,
        nudge: nudgeFor(p, figure, local.readiness),
        nextStep: nextStepFor(p, local.readiness),
        coplanBy: p.coplan ? (p.ownerName || '') : '',
        // A day plan and a share link belong to a trip in an account; the
        // device trip opens in Plan, where its days begin.
        onPlanDays: device ? null : () => onOpenDayPlan?.({ planId: p.id, stopIndex: 0, dayIndex: 0 }),
        menuActions: planMenu(p, parts, device),
      };
    }
    return {
      ...common,
      meta: [whenText(t, when), fmtRange(p.start_date, p.end_date)].filter(Boolean).join(', '),
      figure: figure ? <TripPrice figure={figure} /> : <span className="mt-muted">{t('saved.factNoPrice')}</span>,
      menuActions: planMenu(p, parts, device),
    };
  };

  // A draft: no dates yet. It lives in Plan; My trips lists it and opens it there.
  const draftModel = (p) => {
    const parts = journeyParts(p);
    const nights = tripStops(p).reduce((n, s) => n + s.nights, 0);
    return {
      id: `draft-${p.id}`,
      title: parts.title,
      img: resolveImage({ ids: p.destination_ids || [], cities: planCities(p), countries: parts.countries }),
      iso2: isoFor(parts.countries),
      meta: [t('saved.noDatesYet'), nights > 0 ? t(nights === 1 ? 'saved.nights1' : 'saved.nightsN', { n: nights }) : ''].filter(Boolean).join(', '),
      chip: <Chip kind="status" tone="neutral">{t('mt.draft')}</Chip>,
      onOpen: p.device ? () => onOpenDeviceTrip?.() : () => onLoadTripPlan?.(p.id),
    };
  };
  const deviceDraftModel = (x) => {
    const ids = x.meta.stops || [];
    const towns = orderedUnique(ids.map((id) => destinations[id]?.city)).slice(0, 2).join(', ');
    const nights = Number(x.meta.nights) || 0;
    return {
      id: `dev-${x.id}`,
      title: x.meta.name || towns || t('pf.home.newTripName'),
      img: x.meta.cover || resolveImage({ ids }),
      iso2: destinations[ids[0]]?.iso2 || '',
      meta: [t('saved.noDatesYet'), nights > 0 ? t(nights === 1 ? 'saved.nights1' : 'saved.nightsN', { n: nights }) : ''].filter(Boolean).join(', '),
      chip: <Chip kind="status" tone="neutral">{t('mt.draft')}</Chip>,
      onOpen: () => { tripsStore.open(x.id); onGoToTab?.('trip'); },
    };
  };

  const dayPlanMeta = (sp) => {
    const total = sp.stops?.reduce((n, s) => n + (s.days || 1), 0) || 1;
    return [
      sp.startDate ? fmtDay(sp.startDate) : t('saved.noDatesYet'),
      t(total === 1 ? 'saved.days1' : 'saved.daysN', { n: total }),
    ].join(', ');
  };
  const dayPlanModel = (sp) => {
    const parts = dayJourneyParts(sp);
    const first = (sp.stops || [])[0]?.destinationId;
    const cost = first ? costs?.get?.(first) : null;
    const label = sp.label || t('saved.fallbackDayPlan');
    return {
      id: sp.id,
      title: sp.label || parts.title,
      img: resolveImage({ ids: (sp.stops || []).map((s) => s.destinationId), cities: dayPlanCities(sp), countries: parts.countries }),
      iso2: isoFor(parts.countries),
      meta: dayPlanMeta(sp),
      figure: cost ? <DayPrice cost={cost} t={t} /> : null,
      onOpen: () => onOpenDayPlan?.(sp.id),
      onRemove: () => removeWithUndo({ key: `day:${sp.id}`, label, commit: () => setDayPlans(deleteStandalonePlan(sp.id)) }),
      removeLabel: t('saved.removeItem', { name: label }),
    };
  };

  // T924: a trip happening today opens the tab on Today; every other trip
  // ahead is then a row under Coming up.
  const happening = datedPlans.find((p) => !p.device && isHappening(p, todayIso)) || null;
  const todayAt = happening ? tripToday(happening, todayIso) : null;
  const ahead = happening ? datedPlans.filter((p) => p !== happening) : datedPlans;
  const nextModel = !todayAt && ahead.length ? planModel(ahead[0], true) : null;
  const comingModels = (todayAt ? ahead : ahead.slice(1)).map((p) => planModel(p, false));
  const todayNode = todayAt ? (
    <div className="mt-next">
      <TodayCard
        key={happening.id}
        plan={happening}
        today={todayAt}
        destinations={destinations}
        figure={figures[happening.id] || null}
        todayIso={todayIso}
        crewNames={planLocal[happening.id]?.crewLine || ''}
        spendLabels={spendLabels}
        onPlanDay={(stopIndex, dayIndex) => onOpenDayPlan?.({ planId: happening.id, stopIndex, dayIndex })}
        onOpenTrip={() => onLoadTripPlan?.(happening.id)}
        onCrew={() => toggleShare(happening.id)}
        onPhotoAdded={() => setMemTick((n) => n + 1)}
      />
      {statementFor(happening.id)}
      {sharePanelFor(happening.id, journeyParts(happening).title)}
    </div>
  ) : null;
  // Drafts the device's Plan home lists that no account plan or the device
  // trip already carries.
  const carried = useMemo(() => new Set(tripPlans.map((p) => p.id)), [tripPlans]);
  const planningModels = [
    ...draftPlans.map(draftModel),
    ...deviceDrafts
      .filter((x) => !x.meta.start && (x.meta.stops?.length || x.meta.name)
        && !(x.meta.planId && carried.has(x.meta.planId))
        && !(devicePlan && x.meta.deviceKey && x.meta.deviceKey === devicePlan.deviceKey))
      .map(deviceDraftModel),
  ];
  const dayModels = upcomingDayPlans.map(dayPlanModel);

  // ── Saved (T925): the starred things and the account's saved places, one list. ──
  const shownFavs = useMemo(
    () => (SAVED_MOCK ? new Set([...MOCK_FAV_KEYS, ...(favorites || [])]) : favorites),
    [favorites],
  );
  const shortlist = useFavoriteItems(shownFavs, destinations);
  const savedLists = useSavedLists();
  const favOrder = useMemo(() => {
    const m = new Map();
    [...(shownFavs || [])].forEach((k, i) => m.set(k, i));
    return m;
  }, [shownFavs]);
  const shortRows = useMemo(() => {
    const rows = shortlist.sections.flatMap((s) => s.rows)
      .filter((r) => `star:${r.key}` !== heldKey)
      .map((r) => ({ ...r, order: favOrder.get(r.key) ?? -1 }));
    const destIds = new Set(rows.filter((r) => r.kind === 'dest').map((r) => r.id));
    if (authed) {
      shownTrips.filter((x) => !destIds.has(x.destination_id)).forEach((x) => {
        rows.push({
          key: `acct:${x.id}`, account: x, kind: 'dest', id: x.destination_id,
          cc: COUNTRY_ISO2[x.country] || destinations[x.destination_id]?.iso2 || '',
          name: x.city, sub: x.country,
          img: resolveImage({ ids: [x.destination_id], cities: [x.city], countries: [x.country] }),
          order: -1 - new Date(x.created_at || 0).getTime() / 1e13,
        });
      });
    }
    // Newest save first.
    return rows.sort((a, b) => b.order - a.order);
  }, [shortlist.sections, favOrder, heldKey, authed, shownTrips, destinations, resolveImage]);

  // The seam's saves get a price at save time and two lists, once (dev only).
  useEffect(() => {
    if (!SAVED_MOCK || !costs) return;
    const cur = loadSavedLists();
    Object.entries(MOCK_SAVED_AT).forEach(([k, off]) => {
      const now = costs.get?.(k.slice(5))?.dayEur;
      if (Number.isFinite(now) && !Number.isFinite(cur.meta[k]?.eur)) noteSaved(k, now + off, Date.now() - 27 * 864e5);
    });
    if (!cur.lists.length) {
      createList('Summer 2027', ['dest:BCN', 'dest:SPU', 'dest:LIS']);
      createList('City weekends', ['dest:LIS', 'dest:OPO', 'dest:LJU']);
      setNote('dest:LIS', 'For the birthday weekend');
    }
  }, [costs]);

  const openShortlisted = (row) => {
    if (row.kind === 'dest') { onOpenDest?.(row.id); return; }
    onOpenFeature?.(row.kind, { id: row.id, cc: row.cc });
  };
  const dropShortlisted = (row) => {
    if (row.account) {
      removeWithUndo({ key: `fav:${row.account.id}`, label: row.name, commit: () => handleDelete(row.account.id) });
      return;
    }
    const parsed = parseFavKey(row.key);
    if (!parsed) return;
    onToggleFav?.(parsed.id, parsed.kind, parsed.cc);
    removeWithUndo({ key: `star:${row.key}`, label: row.name || row.id, restore: () => onToggleFav?.(parsed.id, parsed.kind, parsed.cc) });
  };

  // ── Visited: years, the record and the map, filtered by the chosen year. ──
  const pastYear = (p) => yearOf(p.end_date || p.start_date);
  const dayYear = (sp) => yearOf(dayPlanEndDate(sp));
  const years = useMemo(() => {
    const ys = new Set([...pastPlans.map(pastYear), ...pastDayPlans.map(dayYear)].filter(Boolean));
    return [...ys].sort((a, b) => b - a);
  }, [pastPlans, pastDayPlans]);
  const yearNow = years.includes(year) ? year : 'all';
  const inYear = (y) => yearNow === 'all' || y === yearNow;
  const yPlans = useMemo(() => pastPlans.filter((p) => inYear(pastYear(p))), [pastPlans, yearNow]); // eslint-disable-line react-hooks/exhaustive-deps
  const yDays = useMemo(() => pastDayPlans.filter((sp) => inYear(dayYear(sp))), [pastDayPlans, yearNow]); // eslint-disable-line react-hooks/exhaustive-deps

  // Only the chosen year's memories count towards the chosen year.
  const yMemories = useMemo(() => {
    const ids = new Set([...yPlans.map((p) => p.id), ...yDays.map((sp) => sp.id)]);
    return Object.fromEntries(Object.entries(memories).filter(([id]) => ids.has(id)));
  }, [memories, yPlans, yDays]);
  const record = useMemo(() => visitedRecord({
    pastPlans: yPlans, pastDayPlans: yDays, memories: yMemories, destinations,
    manualCountries: yearNow === 'all' ? manualCountries : [],
  }), [yPlans, yDays, yMemories, destinations, manualCountries, yearNow]);
  const allRecord = useMemo(() => visitedRecord({ pastPlans, pastDayPlans, memories, destinations }), [pastPlans, pastDayPlans, memories, destinations]);

  const visitedItems = useMemo(() => {
    const out = [];
    const seen = new Set();
    const add = (city, at, open, id) => {
      if (!at) return;
      const key = (city || '').toLowerCase() || `${at.lat},${at.lon}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ lat: at.lat, lon: at.lon, city: city || '', plain: true, img: resolveImage({ ids: id ? [id] : [], cities: [city] }), open });
    };
    yPlans.forEach((p) => {
      const open = () => setOpenMemory((cur) => (cur === p.id ? '' : p.id));
      (p.destination_ids || []).forEach((id) => add(destinations[id]?.city, destCoords(id), open, id));
      (p.cities || []).forEach((c) => add(c, cityCoords(c), open));
      memoryPoints(memories[p.id]).forEach((pt) => add(pt.city, pt, open, pt.id));
    });
    yDays.forEach((sp) => {
      const open = () => setOpenMemory((cur) => (cur === sp.id ? '' : sp.id));
      (sp.stops || []).forEach((s) => add(destinations[s.destinationId]?.city, destCoords(s.destinationId), open, s.destinationId));
      memoryPoints(memories[sp.id]).forEach((pt) => add(pt.city, pt, open, pt.id));
    });
    return out;
  }, [yPlans, yDays, destinations, memories, resolveImage, destCoords, cityCoords]);

  const mapLocale = useMemo(() => ({
    'CooperativeGesturesHandler.WindowsHelpText': t('map.ctrlZoom'),
    'CooperativeGesturesHandler.MacHelpText': t('map.cmdZoom'),
    'CooperativeGesturesHandler.MobileHelpText': t('map.twoFingers'),
  }), [t]);
  const visitedIso = useMemo(() => record.countries.map((c) => COUNTRY_ISO2[c]).filter(Boolean), [record]);
  // One object per change of the record, never per render: TripMap re-frames
  // and re-pins whenever its props change identity (T434 audit, P1-1).
  const mapProps = useMemo(() => ({
    stops: visitedItems,
    countryFills: visitedIso,
    basemap: 'record',
    showRoute: false,
    scrollZoom: true,
    zoomControls: true,
    mapLocale,
    photoZoom: 6,
    easeToSelected: false,
    padBottom: 0,
    fitMaxZoom: 7,
    fitPadding: { top: 24, left: 24, right: 24, bottom: 24 },
    onSelectStop: (i) => { setMapFull(false); visitedItems[i]?.open(); },
  }), [visitedItems, visitedIso, mapLocale]);

  const placesFromPlan = (p) => (p.cities || []).map((city, i) => ({
    id: (p.destination_ids || [])[i] || null, city,
    country: destinations[(p.destination_ids || [])[i]]?.country || '', lat: null, lon: null, nights: null,
  }));
  const editableFromPlan = (p, mem) => ({
    id: p.id, label: p.label || '', startDate: p.start_date, endDate: p.end_date,
    places: mem?.places?.length ? mem.places : placesFromPlan(p), memory: mem,
  });
  const editableFromDayPlan = (sp, mem) => ({
    id: sp.id, local: true, label: sp.label || '', startDate: sp.startDate, endDate: dayPlanEndDate(sp),
    places: mem?.places?.length ? mem.places : (sp.stops || []).map((s) => ({
      id: destinations[s.destinationId] ? s.destinationId : null,
      city: destinations[s.destinationId]?.city || s.city || '',
      country: destinations[s.destinationId]?.country || s.country || '',
      lat: s.lat ?? null, lon: s.lon ?? null, nights: null,
    })),
    memory: mem,
  });

  const recordGroups = useMemo(() => {
    const rows = [
      ...yPlans.map((p) => ({ kind: 'plan', when: p.end_date, item: p })),
      ...yDays.map((sp) => ({ kind: 'day', when: dayPlanEndDate(sp), item: sp })),
    ].sort((a, b) => (a.when < b.when ? 1 : -1));
    const groups = [];
    rows.forEach((r) => {
      const y = yearOf(r.when);
      let g = groups.find((x) => x.year === y);
      if (!g) { g = { year: y, items: [] }; groups.push(g); }
      g.items.push(r);
    });
    return groups;
  }, [yPlans, yDays]);

  const recordRow = (row) => {
    if (row.kind === 'plan') {
      const p = row.item;
      const parts = journeyParts(p);
      const mem = memories[p.id];
      const showing = openMemory === p.id;
      const line = mem ? memoryLine(mem) : '';
      return {
        id: `p${p.id}`,
        title: parts.title,
        img: coverPhoto(mem) || resolveImage({ ids: p.destination_ids || [], cities: planCities(p), countries: parts.countries }),
        iso2: isoFor(parts.countries),
        meta: [parts.sub, fmtRange(p.start_date, p.end_date), line].filter(Boolean).join(', '),
        onOpen: mem ? () => setOpenMemory(showing ? '' : p.id) : () => onLoadTripPlan?.(p.id),
        menuActions: [
          { key: 'edit', label: t('saved.openTripPlanner'), icon: <RouteIcon size={16} />, onClick: () => onLoadTripPlan?.({ id: p.id, edit: true }) },
          ...(user || SAVED_MOCK ? [{ key: 'share', label: t('saved.shareTrip'), icon: <LinkIcon size={16} />, onClick: () => toggleShare(p.id) }] : []),
        ],
        onRemove: () => removeWithUndo({ key: `plan:${p.id}`, label: parts.title, commit: () => handleDeleteTripPlan(p.id) }),
        removeLabel: t('saved.removeItem', { name: parts.title }),
        below: (
          <>
            {showing && mem && <TripMemoryView memory={mem} onEdit={() => openPastForm(editableFromPlan(p, mem))} />}
            {showing && crewBarFor(p.id)}
            {statementFor(p.id)}
            {sharePanelFor(p.id, parts.title)}
          </>
        ),
      };
    }
    const sp = row.item;
    const parts = dayJourneyParts(sp);
    const mem = memories[sp.id];
    const showing = openMemory === sp.id;
    const line = mem ? memoryLine(mem) : '';
    return {
      id: `d${sp.id}`,
      title: parts.title,
      img: coverPhoto(mem) || resolveImage({ ids: (sp.stops || []).map((s) => s.destinationId), cities: dayPlanCities(sp), countries: parts.countries }),
      iso2: isoFor(parts.countries),
      meta: [parts.sub, fmtRange(sp.startDate, dayPlanEndDate(sp)), line].filter(Boolean).join(', '),
      onOpen: mem ? () => setOpenMemory(showing ? '' : sp.id) : () => onOpenDayPlan?.(sp.id),
      onRemove: () => removeWithUndo({
        key: `day:${sp.id}`,
        label: parts.title,
        commit: () => { clearMemory(sp.id); setMemTick((n) => n + 1); setDayPlans(deleteStandalonePlan(sp.id)); },
      }),
      removeLabel: t('saved.removeItem', { name: parts.title }),
      below: showing && mem ? (
        <>
          <TripMemoryView memory={mem} onEdit={() => openPastForm(editableFromDayPlan(sp, mem))} />
          {crewBarFor(sp.id)}
        </>
      ) : null,
    };
  };
  const groups = recordGroups.map((g) => ({ year: g.year, rows: g.items.map(recordRow) }));

  const tripsCount = datedPlans.length + upcomingDayPlans.length;

  // Land on Trips once a trip ahead is known, unless a tab was picked this visit.
  useEffect(() => {
    if (!pickedRef.current && tripsCount > 0 && tab !== 'trips') setTab('trips');
  }, [tripsCount]); // eslint-disable-line react-hooks/exhaustive-deps -- runs when the plans arrive

  const pastForm = pastOpen ? (
    <PastTripForm
      friends={friends}
      key={pastEdit?.id || 'new'}
      destinations={destinations}
      todayIso={todayIso}
      busy={pastBusy}
      error={pastError}
      initial={pastEdit}
      onCancel={() => { setPastOpen(false); setPastEdit(null); }}
      onSave={handleSavePastTrip}
    />
  ) : null;

  return (
    <div className="saved-shell mytrips">
      <div className="panel open account-panel saved-trips-panel">
        <header className="panel-header saved-panel-header mt-header">
          <MyTripsHead
            tab={tab}
            onTab={pickTab}
            counts={{
              trips: tripsCount,
              saved: shortRows.length + savedWeeks + keptCount,
              europe: allRecord.countries.length + manualCountries.filter((c) => !allRecord.fromTrips.has(c)).length,
            }}
            onNewTrip={() => onGoToTab?.('planstart')}
          />
        </header>

        <InstallHint hasSavedTrip={trips.length > 0 || tripPlans.length > 0 || dayPlans.length > 0 || !!devicePlan} />

        <div className={`mt-panel is-${tab}`} id="mytrips-panel" role="tabpanel" aria-labelledby="mytrips-panel-title">
          {/* The section's name as the page's h2, for the heading outline; the
              tab above already shows it. */}
          <h2 className="sr-only" id="mytrips-panel-title">{t(tab === 'trips' ? 'mt.tabTrips' : tab === 'saved' ? 'mt.tabSaved' : 'mt.tabEurope')}</h2>
          {tab === 'trips' && (
            <TripsTab
              authed={authed}
              configured={configured}
              loading={tripPlansLoading}
              error={tripPlansError}
              onRetry={loadTripPlans}
              today={todayNode}
              next={nextModel}
              coming={comingModels}
              planning={planningModels}
              dayPlans={dayModels}
              friendsShared={friendTrips.length}
              friendFaces={ownersOf(friendTrips)}
              onOpenFriends={onOpenFriends}
              onPlanTrip={() => onGoToTab?.('planstart')}
              onAllInPlan={() => onGoToTab?.('planstart')}
              onSignIn={onOpenAuth}
              signInLine={!devicePlan}
            />
          )}
          {tab === 'saved' && (
            <SavedTab
              rows={shortRows}
              saved={savedLists}
              costs={costs}
              destinations={destinations}
              loading={shortlist.loading || (authed && loading)}
              onOpen={openShortlisted}
              onRemove={dropShortlisted}
              onPlan={(ids) => onPlanStops?.(ids.map((dest) => ({ dest, nights: 2 })))}
              onBrowse={() => onGoToTab?.('places')}
              onUndo={removeWithUndo}
              mapLocale={mapLocale}
              top={(
                <>
                  {/* Kept trips from the trip finder (T806): planning one hands
                      its plan to the Plan tab, which opens the planner on it. */}
                  <KeptTrips onPlan={(r) => { holdPlan(r.plan); onGoToTab?.('trip'); }} />
                  {onOpenFeature && <SavedJourneys onOpen={(id) => onOpenFeature('journey', { id })} />}
                </>
              )}
            />
          )}
          {tab === 'europe' && years.length > 1 && (
            <div className="mt-refine"><YearFilter years={years} year={yearNow} onYear={setYear} compact /></div>
          )}
          {tab === 'europe' && (
            <VisitedTab
              record={record}
              mapProps={mapProps}
              hasMap={visitedItems.length > 0 || visitedIso.length > 0}
              mapFull={mapFull}
              onMapFull={setMapFull}
              groups={groups}
              pastForm={pastForm}
              onAddPast={() => openPastForm(null)}
              error={tripPlansError}
              onEditCountries={() => setCountriesOpen(true)}
              countriesRef={countriesRef}
            />
          )}
        </div>

        {countriesOpen && (
          <VisitedCountriesSheet
            fromTrips={allRecord.fromTrips}
            manual={manualCountries}
            onToggle={(c) => toggleVisitedCountry(c)}
            onClose={() => { setCountriesOpen(false); countriesRef.current?.focus(); }}
          />
        )}
        {undo && <UndoToast key={undo.key} label={undo.label} onUndo={undoRemoval} onClose={flushUndo} />}
        <SiteFooter />
      </div>
    </div>
  );
}

/** The Plan home's trips on this device, never throwing (private mode). */
function safeList() {
  try { return tripsStore.list(); } catch { return []; }
}
